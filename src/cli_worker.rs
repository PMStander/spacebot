//! CLI worker backend for spawning external CLI coding agents.
//!
//! Supports any CLI tool that accepts a task via stdin/argument and produces
//! output on stdout (Factory Droid, Claude Code CLI, etc.). Unlike OpenCode
//! workers (persistent HTTP servers), CLI workers are one-shot subprocesses
//! per task.

pub mod types;
pub mod worker;

pub use types::{CliBackendConfig, CliWorkersConfig};
pub use worker::{CliWorker, CliWorkerResult};
