//! Shared state for the HTTP API.

use std::time::Instant;

/// State shared across all API handlers.
pub struct ApiState {
    pub started_at: Instant,
}

impl ApiState {
    pub fn new() -> Self {
        Self {
            started_at: Instant::now(),
        }
    }
}
