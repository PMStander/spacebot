//! Embedding generation via fastembed.

use crate::error::{LlmError, Result};
use std::path::Path;
use std::sync::Arc;

/// Embedding model wrapper with thread-safe sharing.
///
/// fastembed's TextEmbedding is not Send, so we hold it behind an Arc and
/// use spawn_blocking to call into it from async contexts.
pub struct EmbeddingModel {
    model: Arc<fastembed::TextEmbedding>,
}

impl EmbeddingModel {
    /// Create a new embedding model, storing downloaded model files in `cache_dir`.
    ///
    /// Limits ONNX intra-op threads to avoid excessive memory usage on
    /// machines with many cores.
    pub fn new(cache_dir: &Path) -> Result<Self> {
        // Limit ONNX Runtime threads to prevent memory pressure.
        // fastembed defaults to available_parallelism() which can be 10+
        // cores on modern Macs, causing large thread-pool allocations.
        if std::env::var("OMP_NUM_THREADS").is_err() {
            // SAFETY: Called once during single-threaded init before any ONNX
            // threads are spawned.
            unsafe { std::env::set_var("OMP_NUM_THREADS", "2") };
        }

        let options = fastembed::InitOptions::default()
            .with_cache_dir(cache_dir.to_path_buf())
            .with_show_download_progress(true);

        let model = fastembed::TextEmbedding::try_new(options)
            .map_err(|e| LlmError::EmbeddingFailed(e.to_string()))?;

        Ok(Self {
            model: Arc::new(model),
        })
    }

    /// Generate embeddings for multiple texts (blocking).
    pub fn embed(&self, texts: Vec<String>) -> Result<Vec<Vec<f32>>> {
        self.model
            .embed(texts, None)
            .map_err(|e| LlmError::EmbeddingFailed(e.to_string()).into())
    }

    /// Generate embedding for a single text (blocking).
    pub fn embed_one_blocking(&self, text: &str) -> Result<Vec<f32>> {
        let embeddings = self.embed(vec![text.to_string()])?;
        Ok(embeddings.into_iter().next().unwrap_or_default())
    }

    /// Generate embeddings for multiple texts (async, spawns blocking task).
    pub async fn embed_batch(self: &Arc<Self>, texts: Vec<String>) -> Result<Vec<Vec<f32>>> {
        let model = self.model.clone();
        tokio::task::spawn_blocking(move || {
            model.embed(texts, None).map_err(|e| {
                crate::Error::from(crate::error::LlmError::EmbeddingFailed(e.to_string()))
            })
        })
        .await
        .map_err(|e| crate::Error::Other(anyhow::anyhow!("embedding task failed: {}", e)))?
    }

    /// Generate embedding for a single text (async, spawns blocking task).
    pub async fn embed_one(self: &Arc<Self>, text: &str) -> Result<Vec<f32>> {
        let text = text.to_string();
        let model = self.model.clone();
        let result = tokio::task::spawn_blocking(move || {
            model.embed(vec![text], None).map_err(|e| {
                crate::Error::from(crate::error::LlmError::EmbeddingFailed(e.to_string()))
            })
        })
        .await
        .map_err(|e| crate::Error::Other(anyhow::anyhow!("embedding task failed: {}", e)))??;

        Ok(result.into_iter().next().unwrap_or_default())
    }
}

/// Async function to embed text using a shared model.
pub async fn embed_text(model: &Arc<EmbeddingModel>, text: &str) -> Result<Vec<f32>> {
    model.embed_one(text).await
}
