//! Document indexing pipeline: crawl, extract, embed, and store.

use crate::memory::EmbeddingModel;
use crate::vector::config::VectorConfig;
use crate::vector::crawler::WorkspaceCrawler;
use crate::vector::extractor::TextExtractor;
use crate::vector::table::{DocumentTable, StoreBatchItem};
use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;

use sha2::{Digest, Sha256};

/// Statistics from an indexing run.
#[derive(Debug, Clone)]
pub struct IndexStats {
    pub indexed: usize,
    pub skipped: usize,
    pub failed: usize,
    pub total_discovered: usize,
    pub chunks_created: usize,
}

/// Indexes workspace documents into the vector store.
pub struct DocumentIndexer {
    table: DocumentTable,
    embedding_model: Arc<EmbeddingModel>,
    config: VectorConfig,
}

impl DocumentIndexer {
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

    /// Compute a stable base ID for a document path (without chunk suffix).
    fn base_id(path: &Path) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        path.to_string_lossy().hash(&mut hasher);
        format!("doc_{:016x}", hasher.finish())
    }

    /// Compute a content hash for change detection.
    fn content_hash(content: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Index all documents in a workspace directory.
    ///
    /// Uses content hashing to skip unchanged documents and chunks documents
    /// that exceed the configured chunk size.
    pub async fn index_workspace(&self, workspace_root: &Path) -> crate::error::Result<IndexStats> {
        let crawler = WorkspaceCrawler::new(workspace_root.to_path_buf());
        let documents = crawler.discover_documents();

        let total_discovered = documents.len();

        // Fetch existing content hashes for change detection
        let existing_hashes = self.table.fetch_content_hashes().await.unwrap_or_default();

        // Track which base IDs are still present for stale removal
        let mut active_base_ids: HashSet<String> = HashSet::new();

        let mut indexed = 0;
        let mut skipped = 0;
        let mut failed = 0;
        let mut chunks_created = 0;

        // Process documents in batches for efficient embedding
        let batch_size = self.config.batch_size;
        let mut batch_texts: Vec<String> = Vec::with_capacity(batch_size);
        let mut batch_meta: Vec<ChunkMeta> = Vec::with_capacity(batch_size);

        for doc in &documents {
            let base_id = Self::base_id(&doc.path);
            active_base_ids.insert(base_id.clone());

            let hash = Self::content_hash(&doc.content);

            // Check if any chunk of this document already has the same hash
            let chunk0_id = format!("{}_c0", base_id);
            if let Some(stored_hash) = existing_hashes.get(&chunk0_id) {
                if *stored_hash == hash {
                    skipped += 1;
                    continue;
                }
            }

            // Generate chunks
            let chunks = TextExtractor::prepare_chunks(
                doc,
                self.config.max_chunk_chars,
                self.config.chunk_overlap_chars,
            );

            // Remove old chunks for this document before re-indexing
            if let Err(e) = self.table.delete_by_prefix(&format!("{}_c", base_id)).await {
                tracing::warn!(
                    base_id,
                    error = %e,
                    "failed to remove old chunks"
                );
            }

            for chunk in &chunks {
                let chunk_id = format!("{}_c{}", base_id, chunk.chunk_index);
                batch_texts.push(chunk.text.clone());
                batch_meta.push(ChunkMeta {
                    chunk_id,
                    content: chunk.text.clone(),
                    doc_type: doc.doc_type.as_str().to_string(),
                    path: doc.path.to_string_lossy().to_string(),
                    title: if chunk.total_chunks > 1 {
                        format!("{} [chunk {}/{}]", doc.title, chunk.chunk_index + 1, chunk.total_chunks)
                    } else {
                        doc.title.clone()
                    },
                    content_hash: hash.clone(),
                });
            }

            chunks_created += chunks.len();

            // Flush batch if full
            if batch_texts.len() >= batch_size {
                match self.flush_batch(&mut batch_texts, &mut batch_meta).await {
                    Ok(count) => indexed += count,
                    Err(e) => {
                        tracing::warn!(error = %e, "batch embedding failed");
                        failed += batch_meta.len();
                        batch_texts.clear();
                        batch_meta.clear();
                    }
                }
            }
        }

        // Flush remaining
        if !batch_texts.is_empty() {
            match self.flush_batch(&mut batch_texts, &mut batch_meta).await {
                Ok(count) => indexed += count,
                Err(e) => {
                    tracing::warn!(error = %e, "final batch embedding failed");
                    failed += batch_meta.len();
                }
            }
        }

        // Remove stale documents (ones that no longer exist on disk)
        let removed_stale = self.remove_stale_documents(&active_base_ids).await?;

        tracing::info!(
            indexed,
            skipped,
            failed,
            chunks_created,
            total_discovered,
            removed_stale,
            "workspace indexing complete"
        );

        Ok(IndexStats {
            indexed,
            skipped,
            failed,
            total_discovered,
            chunks_created,
        })
    }

    /// Embed and store a batch of chunks in a single LanceDB append.
    async fn flush_batch(
        &self,
        texts: &mut Vec<String>,
        metas: &mut Vec<ChunkMeta>,
    ) -> crate::error::Result<usize> {
        let embeddings = self.embedding_model.embed_batch(texts.clone()).await?;

        let items: Vec<StoreBatchItem> = metas
            .iter()
            .zip(embeddings.iter())
            .map(|(meta, embedding)| StoreBatchItem {
                id: meta.chunk_id.clone(),
                content: meta.content.clone(),
                doc_type: meta.doc_type.clone(),
                path: meta.path.clone(),
                title: meta.title.clone(),
                content_hash: meta.content_hash.clone(),
                embedding: embedding.clone(),
            })
            .collect();

        let count = items.len();
        self.table.store_batch(&items).await?;

        texts.clear();
        metas.clear();
        Ok(count)
    }

    /// Remove documents from the index that no longer exist in the workspace.
    async fn remove_stale_documents(
        &self,
        active_base_ids: &HashSet<String>,
    ) -> crate::error::Result<usize> {
        let existing_ids = self.table.list_ids().await?;

        // Collect all stale chunk IDs in one pass
        let stale_ids: Vec<String> = existing_ids
            .into_iter()
            .filter(|id| {
                id.rsplit_once("_c")
                    .map(|(base, _)| !active_base_ids.contains(base))
                    .unwrap_or(false)
            })
            .collect();

        if stale_ids.is_empty() {
            return Ok(0);
        }

        let count = stale_ids.len();

        // Build a single OR predicate for all stale IDs
        let quoted_ids = stale_ids
            .iter()
            .map(|id| format!("'{}'", id.replace('\'', "''")))
            .collect::<Vec<_>>()
            .join(", ");
        let predicate = format!("id IN ({quoted_ids})");

        self.table.delete_raw(&predicate).await?;

        Ok(count)
    }
}

/// Metadata for a chunk waiting to be embedded and stored.
struct ChunkMeta {
    chunk_id: String,
    content: String,
    doc_type: String,
    path: String,
    title: String,
    content_hash: String,
}
