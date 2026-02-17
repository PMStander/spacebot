//! Spawn worker tool for creating new workers.

use crate::agent::channel::{ChannelState, spawn_worker_from_state, spawn_opencode_worker_from_state, spawn_cli_worker_from_state};
use crate::WorkerId;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Tool for spawning workers.
#[derive(Debug, Clone)]
pub struct SpawnWorkerTool {
    state: ChannelState,
}

impl SpawnWorkerTool {
    /// Create a new spawn worker tool with access to channel state.
    pub fn new(state: ChannelState) -> Self {
        Self { state }
    }
}

/// Error type for spawn worker tool.
#[derive(Debug, thiserror::Error)]
#[error("Worker spawn failed: {0}")]
pub struct SpawnWorkerError(String);

/// Arguments for spawn worker tool.
#[derive(Debug, Deserialize, JsonSchema)]
pub struct SpawnWorkerArgs {
    /// The task description for the worker.
    pub task: String,
    /// Whether this is an interactive worker (accepts follow-up messages).
    #[serde(default)]
    pub interactive: bool,
    /// Optional skill name to load into the worker's context. The worker will
    /// receive the full skill instructions in its system prompt.
    #[serde(default)]
    pub skill: Option<String>,
    /// Worker type: "builtin" (default) runs a Rig agent loop with shell/file/exec
    /// tools. "opencode" spawns an OpenCode subprocess with full coding agent
    /// capabilities. "cli" spawns an external CLI tool (Factory Droid, Claude Code,
    /// etc.) as a subprocess.
    #[serde(default)]
    pub worker_type: Option<String>,
    /// Working directory for the worker. Required for "opencode" and "cli" workers.
    /// The agent will operate in this directory.
    #[serde(default)]
    pub directory: Option<String>,
    /// CLI backend name (e.g., "droid", "claude"). Required when worker_type is "cli".
    #[serde(default)]
    pub backend: Option<String>,
}

/// Output from spawn worker tool.
#[derive(Debug, Serialize)]
pub struct SpawnWorkerOutput {
    /// The ID of the spawned worker.
    pub worker_id: WorkerId,
    /// Whether the worker was spawned successfully.
    pub spawned: bool,
    /// Whether this is an interactive worker.
    pub interactive: bool,
    /// Status message.
    pub message: String,
}

impl Tool for SpawnWorkerTool {
    const NAME: &'static str = "spawn_worker";

    type Error = SpawnWorkerError;
    type Args = SpawnWorkerArgs;
    type Output = SpawnWorkerOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        let rc = &self.state.deps.runtime_config;
        let browser_enabled = rc.browser_config.load().enabled;
        let web_search_enabled = rc.brave_search_key.load().is_some();
        let opencode_enabled = rc.opencode.load().enabled;
        let cli_workers_config = rc.cli_workers.load();
        let cli_enabled = cli_workers_config.enabled && !cli_workers_config.backends.is_empty();

        let mut tools_list = vec!["shell", "file", "exec"];
        if browser_enabled {
            tools_list.push("browser");
        }
        if web_search_enabled {
            tools_list.push("web_search");
        }

        let opencode_note = if opencode_enabled {
            " Set worker_type to \"opencode\" with a directory path for complex coding tasks — this spawns a full OpenCode coding agent with codebase exploration, context management, and its own tool suite."
        } else {
            ""
        };

        let cli_note = if cli_enabled {
            let backend_list: Vec<String> = cli_workers_config.backends.iter()
                .map(|(name, config)| {
                    if config.description.is_empty() {
                        name.clone()
                    } else {
                        format!("{name} ({desc})", desc = config.description)
                    }
                })
                .collect();
            format!(
                " Set worker_type to \"cli\" with a backend name and directory for external CLI agents. Available backends: {}.",
                backend_list.join(", ")
            )
        } else {
            String::new()
        };

        let base_description = crate::prompts::text::get("tools/spawn_worker");
        let description = base_description
            .replace("{tools}", &tools_list.join(", "))
            .replace("{opencode_note}", opencode_note)
            + &cli_note;

        let mut properties = serde_json::json!({
            "task": {
                "type": "string",
                "description": "Clear, specific description of what the worker should do. Include all context needed since the worker can't see your conversation."
            },
            "interactive": {
                "type": "boolean",
                "default": false,
                "description": "If true, the worker stays alive and accepts follow-up messages via route_to_worker. If false (default), the worker runs once and returns."
            },
            "skill": {
                "type": "string",
                "description": "Name of a skill to load into the worker. The worker receives the full skill instructions in its system prompt. Only use skill names from <available_skills>."
            }
        });

        if opencode_enabled || cli_enabled {
            let mut worker_type_enum = vec!["builtin"];
            let mut worker_type_desc = String::from("\"builtin\" (default) runs a Rig agent loop.");
            if opencode_enabled {
                worker_type_enum.push("opencode");
                worker_type_desc.push_str(" \"opencode\" spawns a full OpenCode coding agent.");
            }
            if cli_enabled {
                worker_type_enum.push("cli");
                worker_type_desc.push_str(" \"cli\" spawns an external CLI agent (requires backend name).");
            }
            properties.as_object_mut().unwrap().insert(
                "worker_type".to_string(),
                serde_json::json!({
                    "type": "string",
                    "enum": worker_type_enum,
                    "default": "builtin",
                    "description": worker_type_desc,
                }),
            );
            properties.as_object_mut().unwrap().insert(
                "directory".to_string(),
                serde_json::json!({
                    "type": "string",
                    "description": "Working directory for the worker. Required when worker_type is \"opencode\" or \"cli\"."
                }),
            );
        }
        if cli_enabled {
            let backend_names: Vec<&str> = cli_workers_config.backends.keys().map(|s| s.as_str()).collect();
            properties.as_object_mut().unwrap().insert(
                "backend".to_string(),
                serde_json::json!({
                    "type": "string",
                    "enum": backend_names,
                    "description": "CLI backend to use. Required when worker_type is \"cli\"."
                }),
            );
        }

        ToolDefinition {
            name: Self::NAME.to_string(),
            description,
            parameters: serde_json::json!({
                "type": "object",
                "properties": properties,
                "required": ["task"]
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let worker_type = args.worker_type.as_deref().unwrap_or("builtin");

        let worker_id = match worker_type {
            "opencode" => {
                let directory = args.directory.as_deref()
                    .ok_or_else(|| SpawnWorkerError("directory is required for opencode workers".into()))?;

                spawn_opencode_worker_from_state(
                    &self.state,
                    &args.task,
                    directory,
                    args.interactive,
                )
                .await
                .map_err(|e| SpawnWorkerError(format!("{e}")))?
            }
            "cli" => {
                let backend = args.backend.as_deref()
                    .ok_or_else(|| SpawnWorkerError("backend is required for cli workers".into()))?;
                let directory = args.directory.as_deref()
                    .ok_or_else(|| SpawnWorkerError("directory is required for cli workers".into()))?;

                spawn_cli_worker_from_state(
                    &self.state,
                    &args.task,
                    directory,
                    backend,
                    args.interactive,
                )
                .await
                .map_err(|e| SpawnWorkerError(format!("{e}")))?
            }
            _ => {
                spawn_worker_from_state(
                    &self.state,
                    &args.task,
                    args.interactive,
                    args.skill.as_deref(),
                )
                .await
                .map_err(|e| SpawnWorkerError(format!("{e}")))?
            }
        };

        let worker_type_label = match worker_type {
            "opencode" => "OpenCode",
            "cli" => args.backend.as_deref().unwrap_or("CLI"),
            _ => "builtin",
        };
        let message = if args.interactive {
            format!(
                "Interactive {worker_type_label} worker {worker_id} spawned for: {}. Route follow-ups with route_to_worker.",
                args.task
            )
        } else {
            format!(
                "{worker_type_label} worker {worker_id} spawned for: {}. It will report back when done.",
                args.task
            )
        };

        Ok(SpawnWorkerOutput {
            worker_id,
            spawned: true,
            interactive: args.interactive,
            message,
        })
    }
}
