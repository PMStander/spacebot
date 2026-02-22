//! OpenCode worker integration.
//!
//! OpenCode workers are full coding agents that run as subprocesses
//! with their own codebase exploration, context management, and tool suite.

pub mod server;
pub mod types;
pub mod worker;

pub use server::OpenCodeServerPool;
pub use types::{OpenCodePermissions, QuestionInfo};
pub use worker::OpenCodeWorker;

pub use crate::config::OpenCodeConfig;
