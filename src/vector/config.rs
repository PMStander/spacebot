//! Configuration for the vector indexing and search system.

/// Configuration for document vector indexing and search.
#[derive(Debug, Clone)]
pub struct VectorConfig {
    /// Number of documents to embed per batch.
    pub batch_size: usize,
    /// Default maximum search results.
    pub max_results: usize,
    /// Default minimum similarity threshold.
    pub similarity_threshold: f32,
    /// Weight for semantic (vector) score vs keyword score in hybrid search.
    /// 0.0 = pure keyword, 1.0 = pure semantic.
    pub semantic_weight: f32,
    /// Maximum characters per chunk for embedding.
    pub max_chunk_chars: usize,
    /// Overlap characters between consecutive chunks for context continuity.
    pub chunk_overlap_chars: usize,
}

impl Default for VectorConfig {
    fn default() -> Self {
        Self {
            batch_size: 8,
            max_results: 10,
            similarity_threshold: 0.5,
            semantic_weight: 0.7,
            max_chunk_chars: 1500,
            chunk_overlap_chars: 200,
        }
    }
}
