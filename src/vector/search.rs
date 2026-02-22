//! High-level hybrid search API combining vector similarity and keyword matching.

use crate::error::Result;
use crate::memory::EmbeddingModel;
use crate::vector::config::VectorConfig;
use crate::vector::models::{DocType, SearchFilters, SearchResult};
use crate::vector::table::DocumentTable;
use std::collections::HashMap;
use std::sync::Arc;

/// High-level document search combining semantic and keyword scoring.
#[derive(Clone)]
pub struct DocumentSearch {
    table: DocumentTable,
    embedding_model: Arc<EmbeddingModel>,
    config: VectorConfig,
}

impl DocumentSearch {
    pub fn new(
        table: DocumentTable,
        embedding_model: Arc<EmbeddingModel>,
        config: VectorConfig,
    ) -> Self {
        Self {
            table,
            embedding_model,
            config,
        }
    }

    /// Hybrid search combining vector similarity with keyword matching.
    ///
    /// 1. Generates a query embedding and retrieves vector search candidates.
    /// 2. Optionally filters by document type.
    /// 3. Scores each candidate with a weighted combination of semantic and keyword scores.
    /// 4. Applies a similarity threshold and returns the top results.
    pub async fn search(
        &self,
        query: &str,
        filters: &SearchFilters,
        limit: usize,
    ) -> Result<Vec<SearchResult>> {
        let trimmed_query = query.trim();
        if trimmed_query.is_empty() {
            return Ok(Vec::new());
        }

        let limit = limit.max(1);
        let candidate_limit = limit.saturating_mul(4).max(20);

        // 1. Gather semantic candidates.
        let embedding = self.embedding_model.embed_one(trimmed_query).await?;
        let vector_candidates = self
            .table
            .vector_search(&embedding, candidate_limit)
            .await?;

        // 2. Gather lexical candidates from FTS. If FTS fails, degrade gracefully.
        let text_candidates = match self.table.text_search(trimmed_query, candidate_limit).await {
            Ok(candidates) => candidates,
            Err(error) => {
                tracing::warn!(%error, "vector text search failed, continuing with semantic-only results");
                Vec::new()
            }
        };

        // 3. Build a candidate map keyed by ID from both result sets.
        let mut documents_by_id: HashMap<String, (String, String, String, String)> = HashMap::new();
        let mut semantic_scores_by_id: HashMap<String, f32> = HashMap::new();

        for (id, content, doc_type, path, title, distance) in vector_candidates {
            documents_by_id
                .entry(id.clone())
                .or_insert((content, doc_type, path, title));
            let semantic_score = (1.0 - distance).clamp(0.0, 1.0);
            semantic_scores_by_id
                .entry(id)
                .and_modify(|existing| {
                    if semantic_score > *existing {
                        *existing = semantic_score;
                    }
                })
                .or_insert(semantic_score);
        }

        let mut text_ranks = HashMap::new();
        for (index, (id, _raw_score)) in text_candidates.iter().enumerate() {
            text_ranks.entry(id.clone()).or_insert(index + 1);
        }

        // Pull metadata/content for lexical-only hits not present in vector candidates.
        let missing_ids: Vec<String> = text_ranks
            .keys()
            .filter(|id| !documents_by_id.contains_key(*id))
            .cloned()
            .collect();
        if !missing_ids.is_empty() {
            let missing_documents = self.table.fetch_documents_by_ids(&missing_ids).await?;
            for (id, content, doc_type, path, title) in missing_documents {
                documents_by_id
                    .entry(id)
                    .or_insert((content, doc_type, path, title));
            }
        }

        // Precompute query words for lightweight title matching.
        let query_words: Vec<String> = trimmed_query
            .split_whitespace()
            .map(|word| word.to_lowercase())
            .collect();

        let semantic_weight = self.config.semantic_weight.clamp(0.0, 1.0);
        let threshold = filters
            .threshold
            .unwrap_or(self.config.similarity_threshold)
            .clamp(0.0, 1.0);

        // 4. Score each candidate from the union of vector + text hits.
        let mut scored: Vec<SearchResult> = Vec::new();
        for (id, (content, doc_type, path, title)) in documents_by_id {
            let parsed_doc_type = DocType::from_str(&doc_type);
            if !filters.doc_types.is_empty() && !filters.doc_types.contains(&parsed_doc_type) {
                continue;
            }

            let semantic_score = semantic_scores_by_id.get(&id).copied().unwrap_or(0.0);
            let text_rank_score = text_ranks
                .get(&id)
                .map(|rank| rank_to_score(*rank, candidate_limit))
                .unwrap_or(0.0);
            let title_keyword_score = title_keyword_score(&title, &query_words);
            let keyword_score = if text_ranks.contains_key(&id) {
                0.8 * text_rank_score + 0.2 * title_keyword_score
            } else {
                title_keyword_score
            };

            let combined =
                semantic_weight * semantic_score + (1.0 - semantic_weight) * keyword_score;
            if combined < threshold {
                continue;
            }

            scored.push(SearchResult {
                id,
                title,
                doc_type: parsed_doc_type,
                path,
                score: combined,
                semantic_score,
                keyword_score,
                highlight: build_highlight(&content),
            });
        }

        // 5. Sort by combined score descending.
        scored.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // 6. Truncate to requested limit.
        scored.truncate(limit);

        Ok(scored)
    }
}

fn rank_to_score(rank: usize, total: usize) -> f32 {
    if total == 0 {
        return 0.0;
    }
    let normalized = 1.0 - ((rank.saturating_sub(1)) as f32 / total as f32);
    normalized.clamp(0.0, 1.0)
}

fn title_keyword_score(title: &str, query_words: &[String]) -> f32 {
    if query_words.is_empty() {
        return 0.0;
    }

    let title_lower = title.to_lowercase();
    let matched = query_words
        .iter()
        .filter(|word| title_lower.contains(word.as_str()))
        .count();
    matched as f32 / query_words.len() as f32
}

fn build_highlight(content: &str) -> String {
    if content.len() <= 200 {
        return content.to_string();
    }

    let mut end = 200;
    while !content.is_char_boundary(end) && end < content.len() {
        end += 1;
    }
    format!("{}...", &content[..end])
}
