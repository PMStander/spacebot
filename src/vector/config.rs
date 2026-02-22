//! Configuration for the vector indexing and search system.

/// Configuration for document vector indexing and search.
#[derive(Debug, Clone)]
pub struct VectorConfig {
    /// Embedding dimension (must match the embedding model).
    pub embedding_dim: i32,
    /// Number of documents to embed per batch.
    pub batch_size: usize,
    /// Default maximum search results.
    pub max_results: usize,
    /// Default minimum similarity threshold.
    pub similarity_threshold: f32,
    /// Weight for semantic (vector) score vs keyword score in hybrid search.
    /// 0.0 = pure keyword, 1.0 = pure semantic.
    pub semantic_weight: f32,
    /// Maximum characters of document content to embed.
    pub max_embed_chars: usize,
}

impl Default for VectorConfig {
    fn default() -> Self {
        Self {
            embedding_dim: 384,
            batch_size: 32,
            max_results: 10,
            similarity_threshold: 0.5,
            semantic_weight: 0.7,
            max_embed_chars: 2000,
        }
    }
}
