//! Text extraction and preparation for embedding.

use crate::vector::models::Document;

/// Prepares document text for embedding generation.
pub struct TextExtractor;

impl TextExtractor {
    /// Combine document title and content, clean whitespace, and truncate for embedding.
    pub fn prepare_for_embedding(doc: &Document, max_chars: usize) -> String {
        let mut text = format!("{}\n\n{}", doc.title, doc.content);

        // Collapse runs of 3+ newlines down to 2
        while text.contains("\n\n\n") {
            text = text.replace("\n\n\n", "\n\n");
        }

        // Truncate at word boundary
        if text.len() > max_chars {
            let truncated = &text[..max_chars];
            if let Some(last_space) = truncated.rfind(char::is_whitespace) {
                text = truncated[..last_space].to_string();
            } else {
                text = truncated.to_string();
            }
        }

        text
    }
}
