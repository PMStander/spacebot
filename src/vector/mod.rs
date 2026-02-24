//! Universal document indexing and semantic search.
//!
//! Indexes workspace documents (skills, plans, docs, identity files) into a
//! LanceDB vector store for semantic retrieval. Built on the same `fastembed`
//! and `lancedb` infrastructure as the memory system.

pub mod config;
pub mod crawler;
pub mod extractor;
pub mod indexer;
pub mod models;
pub mod search;
pub mod table;

use crate::memory::EmbeddingModel;
use std::path::Path;
use std::sync::Arc;

pub use config::VectorConfig;
pub use crawler::WorkspaceCrawler;
pub use indexer::{DocumentIndexer, IndexStats};
pub use models::{DocMetadata, DocType, Document, SearchFilters, SearchResult};
pub use search::DocumentSearch;
pub use table::DocumentTable;

/// Initialize document search for a workspace by creating table/indexes and
/// running an initial full index pass.
pub async fn initialize_document_search(
    connection: &lancedb::Connection,
    embedding_model: Arc<EmbeddingModel>,
    workspace_root: &Path,
    config: VectorConfig,
) -> crate::error::Result<(Arc<DocumentSearch>, IndexStats)> {
    let table = DocumentTable::open_or_create(connection).await?;
    table.create_indexes().await?;

    let indexer = DocumentIndexer::new(table.clone(), embedding_model.clone(), config.clone());
    let stats = indexer.index_workspace(workspace_root).await?;

    // Compact files and prune old versions to prevent unbounded growth.
    // Each delete + append during indexing creates a new lance version;
    // without this, version count grows on every restart.
    table.optimize().await?;

    let search = Arc::new(DocumentSearch::new(table, embedding_model, config));
    Ok((search, stats))
}
