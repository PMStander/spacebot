//! Text extraction, chunking, and preparation for embedding.

use crate::vector::models::{DocType, Document};

/// A chunk of text extracted from a document for embedding.
#[derive(Debug, Clone)]
pub struct TextChunk {
    /// The text content to embed.
    pub text: String,
    /// Zero-based index of this chunk within the document.
    pub chunk_index: usize,
    /// Total number of chunks the document was split into.
    pub total_chunks: usize,
}

/// Prepares document text for embedding generation.
pub struct TextExtractor;

impl TextExtractor {
    /// Combine document title and content, clean whitespace, and truncate for embedding.
    ///
    /// Kept for backward compatibility (search highlighting, single-chunk contexts).
    pub fn prepare_for_embedding(doc: &Document, max_chars: usize) -> String {
        let mut text = format!("{}\n\n{}", doc.title, doc.content);

        // Collapse runs of 3+ newlines down to 2
        while text.contains("\n\n\n") {
            text = text.replace("\n\n\n", "\n\n");
        }

        // Truncate at word boundary (snap to char boundary first)
        if text.len() > max_chars {
            let mut end = max_chars;
            while end > 0 && !text.is_char_boundary(end) {
                end -= 1;
            }
            let truncated = &text[..end];
            if let Some(last_space) = truncated.rfind(char::is_whitespace) {
                text = truncated[..last_space].to_string();
            } else {
                text = truncated.to_string();
            }
        }

        text
    }

    /// Split a document into chunks suitable for embedding.
    ///
    /// For markdown files, splits on `## ` headings, then on paragraph boundaries
    /// if sections are still too large. For code/other files, splits on blank-line
    /// boundaries. Each chunk is prefixed with the document title for context.
    pub fn prepare_chunks(
        doc: &Document,
        max_chunk_chars: usize,
        overlap_chars: usize,
    ) -> Vec<TextChunk> {
        let is_markdown = matches!(doc.doc_type, DocType::Docs | DocType::Skill | DocType::Plan | DocType::Identity | DocType::Soul | DocType::Other)
            && doc.path.extension().and_then(|e| e.to_str()) == Some("md");

        let mut cleaned = doc.content.clone();
        while cleaned.contains("\n\n\n") {
            cleaned = cleaned.replace("\n\n\n", "\n\n");
        }

        let raw_sections = if is_markdown {
            split_markdown_sections(&cleaned)
        } else {
            split_code_sections(&cleaned, max_chunk_chars)
        };

        // Further split sections that exceed max_chunk_chars
        let mut sections = Vec::new();
        for section in raw_sections {
            if section.len() <= max_chunk_chars {
                sections.push(section);
            } else {
                sections.extend(split_at_paragraphs(&section, max_chunk_chars));
            }
        }

        // Merge very small sections with the next one
        let mut merged = Vec::new();
        let mut buffer = String::new();
        for section in sections {
            if buffer.is_empty() {
                buffer = section;
            } else if buffer.len() + section.len() + 2 <= max_chunk_chars {
                buffer.push_str("\n\n");
                buffer.push_str(&section);
            } else {
                merged.push(std::mem::take(&mut buffer));
                buffer = section;
            }
        }
        if !buffer.is_empty() {
            merged.push(buffer);
        }

        if merged.is_empty() {
            // Document is empty or very short — create a single chunk
            let text = format!("{}\n\n{}", doc.title, cleaned);
            return vec![TextChunk {
                text,
                chunk_index: 0,
                total_chunks: 1,
            }];
        }

        let total_chunks = merged.len();
        let mut chunks = Vec::with_capacity(total_chunks);

        for (i, section) in merged.iter().enumerate() {
            let mut text = format!("{}\n\n", doc.title);

            // Add overlap from previous chunk for continuity
            if i > 0 && overlap_chars > 0 {
                let prev = &merged[i - 1];
                let mut overlap_start = prev.len().saturating_sub(overlap_chars);
                // Snap forward to a valid char boundary
                while overlap_start < prev.len() && !prev.is_char_boundary(overlap_start) {
                    overlap_start += 1;
                }
                // Find a clean word boundary
                let overlap_start = prev[overlap_start..]
                    .find(char::is_whitespace)
                    .map(|pos| {
                        let mut p = overlap_start + pos + 1;
                        while p < prev.len() && !prev.is_char_boundary(p) {
                            p += 1;
                        }
                        p
                    })
                    .unwrap_or(overlap_start);
                if overlap_start < prev.len() {
                    text.push_str("...");
                    text.push_str(&prev[overlap_start..]);
                    text.push_str("\n\n");
                }
            }

            text.push_str(section);
            chunks.push(TextChunk {
                text,
                chunk_index: i,
                total_chunks,
            });
        }

        chunks
    }
}

/// Split markdown content on `## ` heading boundaries.
fn split_markdown_sections(content: &str) -> Vec<String> {
    let mut sections = Vec::new();
    let mut current = String::new();

    for line in content.lines() {
        if line.starts_with("## ") && !current.trim().is_empty() {
            sections.push(current.trim().to_string());
            current = String::new();
        }
        current.push_str(line);
        current.push('\n');
    }

    if !current.trim().is_empty() {
        sections.push(current.trim().to_string());
    }

    sections
}

/// Split code content on blank-line boundaries, grouping lines into chunks.
fn split_code_sections(content: &str, max_chars: usize) -> Vec<String> {
    let mut sections = Vec::new();
    let mut current = String::new();

    for line in content.lines() {
        if line.trim().is_empty() && !current.trim().is_empty() && current.len() >= max_chars / 2 {
            sections.push(current.trim().to_string());
            current = String::new();
        }
        current.push_str(line);
        current.push('\n');
    }

    if !current.trim().is_empty() {
        sections.push(current.trim().to_string());
    }

    sections
}

/// Split text at paragraph boundaries (`\n\n`) to fit within max_chars.
fn split_at_paragraphs(text: &str, max_chars: usize) -> Vec<String> {
    let paragraphs: Vec<&str> = text.split("\n\n").collect();
    let mut sections = Vec::new();
    let mut current = String::new();

    for para in paragraphs {
        if current.is_empty() {
            current = para.to_string();
        } else if current.len() + para.len() + 2 <= max_chars {
            current.push_str("\n\n");
            current.push_str(para);
        } else {
            sections.push(std::mem::take(&mut current));
            current = para.to_string();
        }
    }

    if !current.is_empty() {
        // If still too large, do a hard split at word boundary
        if current.len() > max_chars {
            let mut remaining = current.as_str();
            while remaining.len() > max_chars {
                // Snap to a valid char boundary
                let mut end = max_chars;
                while end > 0 && !remaining.is_char_boundary(end) {
                    end -= 1;
                }
                let split_at = remaining[..end]
                    .rfind(char::is_whitespace)
                    .unwrap_or(end);
                sections.push(remaining[..split_at].to_string());
                remaining = remaining[split_at..].trim_start();
            }
            if !remaining.is_empty() {
                sections.push(remaining.to_string());
            }
        } else {
            sections.push(current);
        }
    }

    sections
}
