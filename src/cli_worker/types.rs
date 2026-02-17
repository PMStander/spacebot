//! Types for CLI worker configuration and results.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Configuration for all CLI worker backends.
#[derive(Debug, Clone, Default)]
pub struct CliWorkersConfig {
    /// Whether CLI workers are available.
    pub enabled: bool,
    /// Named CLI backends (e.g., "droid", "claude").
    pub backends: HashMap<String, CliBackendConfig>,
}

/// Configuration for a single CLI backend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliBackendConfig {
    /// Command to execute (binary name or path). Supports "env:VAR_NAME" references.
    pub command: String,
    /// Additional arguments passed before the task.
    #[serde(default)]
    pub args: Vec<String>,
    /// Human-readable description shown to the channel LLM.
    #[serde(default)]
    pub description: String,
    /// Optional environment variables to set for the subprocess.
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Timeout in seconds for the subprocess (0 = no timeout). Defaults to 600.
    #[serde(default = "default_timeout_secs")]
    pub timeout_secs: u64,
}

fn default_timeout_secs() -> u64 {
    600
}

impl Default for CliBackendConfig {
    fn default() -> Self {
        Self {
            command: String::new(),
            args: Vec::new(),
            description: String::new(),
            env: HashMap::new(),
            timeout_secs: 600,
        }
    }
}
