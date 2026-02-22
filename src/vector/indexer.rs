//! Document indexing pipeline: crawl, extract, embed, and store.

use crate::memory::EmbeddingModel;
use crate::vector::config::VectorConfig;
use crate::vector::crawler::WorkspaceCrawler;
use crate::vector::extractor::TextExtractor;
use crate::vector::models::Document;
use crate::vector::table::DocumentTable;
use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;

/// Statistics from an indexing run.
#[derive(Debug, Clone)]
pub struct IndexStats {
    pub indexed: usize,
    pub failed: usize,
    pub total_discovered: usize,
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

    /// Index all documents in a workspace directory.
    pub async fn index_workspace(&self, workspace_root: &Path) -> crate::error::Result<IndexStats> {
        let crawler = WorkspaceCrawler::new(workspace_root.to_path_buf());
        let documents = crawler.discover_documents();
        let discovered_ids: HashSet<String> = documents.iter().map(|doc| doc.id.clone()).collect();

        let total_discovered = documents.len();
        let mut indexed = 0;
        let mut failed = 0;

        for doc in &documents {
            match self.index_document(doc).await {
                Ok(()) => indexed += 1,
                Err(e) => {
                    tracing::warn!(
                        path = %doc.path.display(),
                        error = %e,
                        "failed to index document"
                    );
                    failed += 1;
                }
            }
        }

        let removed_stale = self.remove_stale_documents(&discovered_ids).await?;

        tracing::info!(
            indexed,
            failed,
            total_discovered,
            removed_stale,
            "workspace indexing complete"
        );

        Ok(IndexStats {
            indexed,
            failed,
            total_discovered,
        })
    }

    /// Index a single document.
    pub async fn index_document(&self, doc: &Document) -> crate::error::Result<()> {
        let text = TextExtractor::prepare_for_embedding(doc, self.config.max_embed_chars);
        let embedding = self.embedding_model.embed_one(&text).await?;

        self.table
            .store(
                &doc.id,
                &text,
                doc.doc_type.as_str(),
                &doc.path.to_string_lossy(),
                &doc.title,
                &embedding,
            )
            .await?;

        Ok(())
    }

    /// Remove documents from the index that no longer exist in the workspace.
    async fn remove_stale_documents(
        &self,
        discovered_ids: &HashSet<String>,
    ) -> crate::error::Result<usize> {
        let existing_ids = self.table.list_ids().await?;
        let stale_ids: Vec<String> = existing_ids
            .into_iter()
            .filter(|id| !discovered_ids.contains(id))
            .collect();

        let mut removed = 0;
        for stale_id in stale_ids {
            self.table.delete(&stale_id).await?;
            removed += 1;
        }

        Ok(removed)
    }
}
