//! Workspace document crawler for discovering and classifying files.

use crate::vector::models::{DocMetadata, DocType, Document};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

/// Recursively discovers and classifies workspace documents.
pub struct WorkspaceCrawler {
    workspace_root: PathBuf,
}

impl WorkspaceCrawler {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }

    /// Discover all indexable documents in the workspace.
    pub fn discover_documents(&self) -> Vec<Document> {
        let mut documents = Vec::new();
        self.walk_directory(&self.workspace_root, &mut documents);
        tracing::info!(count = documents.len(), "discovered workspace documents");
        documents
    }

    fn walk_directory(&self, dir: &Path, documents: &mut Vec<Document>) {
        let entries = match std::fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(e) => {
                tracing::warn!(path = %dir.display(), error = %e, "failed to read directory");
                return;
            }
        };

        for entry in entries.flatten() {
            let path = entry.path();

            if path.is_dir() {
                // Skip hidden directories and common non-content dirs
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with('.') || name == "node_modules" || name == "target" {
                        continue;
                    }
                }
                self.walk_directory(&path, documents);
            } else if Self::is_indexable(&path) {
                if let Some(doc) = self.process_file(&path) {
                    documents.push(doc);
                }
            }
        }
    }

    fn is_indexable(path: &Path) -> bool {
        matches!(
            path.extension().and_then(|e| e.to_str()),
            Some("md" | "toml")
        )
    }

    fn process_file(&self, path: &Path) -> Option<Document> {
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(path = %path.display(), error = %e, "failed to read file");
                return None;
            }
        };

        let file_name = path.file_name()?.to_str()?;
        let doc_type = Self::classify(file_name);
        let title = Self::extract_title(&content).unwrap_or_else(|| file_name.to_string());
        let id = Self::stable_id(path);
        let size_bytes = content.len() as u64;

        let rel_path = path.strip_prefix(&self.workspace_root).ok();
        let agent = rel_path.and_then(|p| Self::extract_agent_name(p));
        let skill_name = if doc_type == DocType::Skill {
            path.parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .map(|s| s.to_string())
        } else {
            None
        };

        Some(Document {
            id,
            doc_type,
            path: path.to_path_buf(),
            title,
            content,
            metadata: DocMetadata {
                agent,
                skill_name,
                tags: Vec::new(),
                size_bytes,
            },
        })
    }

    fn classify(file_name: &str) -> DocType {
        if file_name == "SKILL.md" {
            return DocType::Skill;
        }
        if file_name == "IDENTITY.md" {
            return DocType::Identity;
        }
        if file_name == "SOUL.md" {
            return DocType::Soul;
        }
        if file_name == "README.md" {
            return DocType::Docs;
        }
        if file_name.contains("_PLAN")
            || file_name.contains("_IMPLEMENTATION_")
            || file_name.contains("_GUIDE")
        {
            return DocType::Plan;
        }
        if file_name.ends_with(".toml") {
            return DocType::Config;
        }
        DocType::Other
    }

    fn extract_title(content: &str) -> Option<String> {
        for line in content.lines() {
            let trimmed = line.trim();
            if let Some(heading) = trimmed.strip_prefix('#') {
                let title = heading.trim_start_matches('#').trim();
                if !title.is_empty() {
                    return Some(title.to_string());
                }
            }
        }
        None
    }

    fn stable_id(path: &Path) -> String {
        let mut hasher = DefaultHasher::new();
        path.to_string_lossy().hash(&mut hasher);
        format!("doc_{:016x}", hasher.finish())
    }

    fn extract_agent_name(rel_path: &Path) -> Option<String> {
        let components: Vec<_> = rel_path.components().collect();
        for (i, component) in components.iter().enumerate() {
            if let std::path::Component::Normal(name) = component {
                if name.to_str() == Some("agents") {
                    if let Some(std::path::Component::Normal(agent_name)) = components.get(i + 1) {
                        return agent_name.to_str().map(|s| s.to_string());
                    }
                }
            }
        }
        None
    }
}
