//! Document types and metadata for universal workspace indexing.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Classification of workspace documents.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DocType {
    /// SKILL.md files — agent capabilities.
    Skill,
    /// Plans, implementation guides, and summaries.
    Plan,
    /// README files and general documentation.
    Docs,
    /// IDENTITY.md files — agent identity definitions.
    Identity,
    /// SOUL.md files — agent personality/soul definitions.
    Soul,
    /// Configuration files (TOML, etc.).
    Config,
    /// Any other markdown or text document.
    Other,
}

impl DocType {
    /// String representation used in LanceDB metadata.
    pub fn as_str(&self) -> &'static str {
        match self {
            DocType::Skill => "skill",
            DocType::Plan => "plan",
            DocType::Docs => "docs",
            DocType::Identity => "identity",
            DocType::Soul => "soul",
            DocType::Config => "config",
            DocType::Other => "other",
        }
    }

    /// Parse from string.
    pub fn from_str(s: &str) -> Self {
        match s {
            "skill" => DocType::Skill,
            "plan" => DocType::Plan,
            "docs" => DocType::Docs,
            "identity" => DocType::Identity,
            "soul" => DocType::Soul,
            "config" => DocType::Config,
            _ => DocType::Other,
        }
    }
}

impl std::fmt::Display for DocType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// A workspace document discovered by the crawler.
#[derive(Debug, Clone)]
pub struct Document {
    /// Stable identifier derived from file path.
    pub id: String,
    /// Document classification.
    pub doc_type: DocType,
    /// Absolute path to the file.
    pub path: PathBuf,
    /// Title extracted from the first heading.
    pub title: String,
    /// Full text content of the document.
    pub content: String,
    /// Additional metadata.
    pub metadata: DocMetadata,
}

/// Metadata associated with a document.
#[derive(Debug, Clone, Default)]
pub struct DocMetadata {
    /// Agent name if the document belongs to a specific agent.
    pub agent: Option<String>,
    /// Skill name if this is a SKILL.md.
    pub skill_name: Option<String>,
    /// Tags extracted from frontmatter or inferred.
    pub tags: Vec<String>,
    /// File size in bytes.
    pub size_bytes: u64,
}

/// A search result from the document search engine.
#[derive(Debug, Clone)]
pub struct SearchResult {
    /// Document ID.
    pub id: String,
    /// Document title.
    pub title: String,
    /// Document type.
    pub doc_type: DocType,
    /// File path.
    pub path: String,
    /// Combined relevance score (0.0–1.0).
    pub score: f32,
    /// Vector similarity component.
    pub semantic_score: f32,
    /// Keyword match component.
    pub keyword_score: f32,
    /// Highlighted content snippet.
    pub highlight: String,
}

/// Filters applied to document search.
#[derive(Debug, Clone, Default)]
pub struct SearchFilters {
    /// Restrict results to specific document types.
    pub doc_types: Vec<DocType>,
    /// Minimum similarity threshold (0.0–1.0).
    pub threshold: Option<f32>,
}
