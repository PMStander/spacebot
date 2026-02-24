//! Vector search tool for document discovery.

use crate::vector::{DocumentSearch, SearchFilters};

use rig::completion::ToolDefinition;
use rig::tool::Tool;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use std::sync::Arc;

/// Tool for searching workspace documents using semantic similarity.
#[derive(Clone)]
pub struct VectorSearchTool {
    search: Arc<DocumentSearch>,
}

impl VectorSearchTool {
    /// Create a new vector search tool.
    pub fn new(search: Arc<DocumentSearch>) -> Self {
        Self { search }
    }
}

/// Error type for vector search tool.
#[derive(Debug, thiserror::Error)]
#[error("Vector search failed: {0}")]
pub struct VectorSearchError(String);

impl From<crate::error::Error> for VectorSearchError {
    fn from(e: crate::error::Error) -> Self {
        VectorSearchError(format!("{e}"))
    }
}

/// Arguments for the vector search tool.
#[derive(Debug, Deserialize, JsonSchema)]
pub struct VectorSearchArgs {
    /// Natural language search query describing what you're looking for.
    pub query: String,
    /// Filter results to specific document types: "skill", "plan", "docs", "identity", "soul".
    #[serde(default)]
    pub doc_types: Option<Vec<String>>,
    /// Maximum number of results to return (1-20).
    #[serde(default = "default_limit")]
    pub limit: usize,
    /// Minimum relevance threshold (0.0-1.0). Results below this score are excluded.
    #[serde(default)]
    pub threshold: Option<f32>,
}

fn default_limit() -> usize {
    5
}

/// Output from the vector search tool.
#[derive(Debug, Serialize)]
pub struct VectorSearchOutput {
    /// Search results sorted by relevance.
    pub results: Vec<VectorSearchResultItem>,
    /// Total number of results found.
    pub total_found: usize,
    /// Query execution time in milliseconds.
    pub query_time_ms: u64,
    /// Formatted summary of the results.
    pub summary: String,
}

/// A single search result item.
#[derive(Debug, Serialize)]
pub struct VectorSearchResultItem {
    /// Document identifier.
    pub id: String,
    /// Document title.
    pub title: String,
    /// Document type (skill, plan, docs, etc.).
    pub doc_type: String,
    /// File path to the document.
    pub path: String,
    /// Relevance score (0.0-1.0).
    pub score: f32,
    /// Content preview.
    pub highlight: String,
}

impl Tool for VectorSearchTool {
    const NAME: &'static str = "vector_search";

    type Error = VectorSearchError;
    type Args = VectorSearchArgs;
    type Output = VectorSearchOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: Self::NAME.to_string(),
            description: "Search workspace documents (skills, plans, docs, identity files, \
                source code) using semantic similarity. Returns relevant documents ranked \
                by relevance. Use this to discover skills, find related documentation, \
                locate relevant plans and guides, or search through code files."
                .to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "required": ["query"],
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural language search query. Describe what you're looking for."
                    },
                    "doc_types": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": ["skill", "plan", "docs", "identity", "soul", "config", "code", "other"]
                        },
                        "description": "Filter results to specific document types."
                    },
                    "limit": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 20,
                        "default": 5,
                        "description": "Maximum number of results to return."
                    },
                    "threshold": {
                        "type": "number",
                        "minimum": 0.0,
                        "maximum": 1.0,
                        "description": "Minimum relevance threshold. Results below this score are excluded."
                    }
                }
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> std::result::Result<Self::Output, Self::Error> {
        let start = std::time::Instant::now();

        if args.query.trim().is_empty() {
            return Err(VectorSearchError("query must not be empty".to_string()));
        }

        let filters = SearchFilters {
            doc_types: args
                .doc_types
                .unwrap_or_default()
                .into_iter()
                .map(|s| crate::vector::DocType::from_str(&s))
                .collect(),
            threshold: args.threshold,
        };

        let limit = args.limit.min(20).max(1);

        let results = self
            .search
            .search(&args.query, &filters, limit)
            .await
            .map_err(|e| VectorSearchError(format!("Search failed: {e}")))?;

        let elapsed = start.elapsed();

        let items: Vec<VectorSearchResultItem> = results
            .iter()
            .map(|r| VectorSearchResultItem {
                id: r.id.clone(),
                title: r.title.clone(),
                doc_type: r.doc_type.to_string(),
                path: r.path.clone(),
                score: r.score,
                highlight: r.highlight.clone(),
            })
            .collect();

        let summary = format_results(&items);

        Ok(VectorSearchOutput {
            total_found: items.len(),
            results: items,
            query_time_ms: elapsed.as_millis() as u64,
            summary,
        })
    }
}

/// Format search results for display to an agent.
fn format_results(results: &[VectorSearchResultItem]) -> String {
    if results.is_empty() {
        return "No matching documents found.".to_string();
    }

    let mut output = String::from("## Document Search Results\n\n");

    for (i, result) in results.iter().enumerate() {
        output.push_str(&format!(
            "{}. **{}** [{}] (score: {:.2})\n   {}\n   Path: {}\n\n",
            i + 1,
            result.title,
            result.doc_type,
            result.score,
            result.highlight,
            result.path,
        ));
    }

    output
}
