//! Plugin tool for LLM tool registration.
//!
//! Each plugin tool definition in PLUGIN.toml gets registered as a PluginTool
//! that executes the handler script via subprocess, passing input as JSON on
//! stdin and reading JSON output from stdout.

use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

/// A dynamically-registered tool backed by a plugin handler script.
///
/// Tool names are prefixed: `plugin_{pluginname}_{toolname}` to avoid
/// collisions with built-in tools.
#[derive(Debug, Clone)]
pub struct PluginTool {
    /// Full tool name: `plugin_{plugin}_{tool}`.
    pub tool_name: String,
    /// Description shown to the LLM.
    pub description: String,
    /// JSON Schema for arguments.
    pub schema: Value,
    /// Absolute path to the handler script.
    pub handler_path: PathBuf,
    /// Plugin base directory (used as working dir).
    pub base_dir: PathBuf,
    /// Port of the plugin's API server (if running), passed as env var.
    pub api_port: Option<u16>,
}

#[derive(Debug, thiserror::Error)]
#[error("Plugin tool error: {message}")]
pub struct PluginToolError {
    message: String,
}

/// Dynamic JSON args — the schema is defined in PLUGIN.toml.
#[derive(Debug, Deserialize)]
pub struct PluginToolArgs {
    #[serde(flatten)]
    pub data: Value,
}

#[derive(Debug, Serialize)]
pub struct PluginToolOutput {
    pub result: Value,
}

impl PluginTool {
    /// Create a new plugin tool from a tool definition and plugin context.
    pub fn new(
        plugin_name: &str,
        tool_def: &crate::plugins::ToolDef,
        base_dir: &PathBuf,
        api_port: Option<u16>,
    ) -> Self {
        let tool_name = format!("plugin_{}_{}", plugin_name, tool_def.name);
        let schema: Value =
            serde_json::from_str(&tool_def.schema).unwrap_or_else(|_| serde_json::json!({"type": "object", "properties": {}}));
        let handler_path = base_dir.join(&tool_def.handler);

        Self {
            tool_name,
            description: tool_def.description.clone(),
            schema,
            handler_path,
            base_dir: base_dir.clone(),
            api_port,
        }
    }
}

impl Tool for PluginTool {
    const NAME: &'static str = "plugin_tool";

    type Error = PluginToolError;
    type Args = PluginToolArgs;
    type Output = PluginToolOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: self.tool_name.clone(),
            description: self.description.clone(),
            parameters: self.schema.clone(),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let input_json =
            serde_json::to_string(&args.data).map_err(|e| PluginToolError {
                message: format!("failed to serialize args: {e}"),
            })?;

        // Determine handler: if it's a .py file use python3, otherwise exec directly
        let handler_str = self.handler_path.to_string_lossy();
        let (program, script_args): (&str, Vec<&str>) = if handler_str.ends_with(".py") {
            ("python3", vec![handler_str.as_ref()])
        } else {
            (handler_str.as_ref(), vec![])
        };

        let mut cmd = Command::new(program);
        cmd.args(&script_args)
            .current_dir(&self.base_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(port) = self.api_port {
            cmd.env("PLUGIN_PORT", port.to_string());
        }

        let mut child = cmd.spawn().map_err(|e| PluginToolError {
            message: format!("failed to spawn handler: {e}"),
        })?;

        // Write input to stdin
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(input_json.as_bytes())
                .await
                .map_err(|e| PluginToolError {
                    message: format!("failed to write to handler stdin: {e}"),
                })?;
        }

        let output = tokio::time::timeout(
            tokio::time::Duration::from_secs(60),
            child.wait_with_output(),
        )
        .await
        .map_err(|_| PluginToolError {
            message: "handler timed out after 60s".to_string(),
        })?
        .map_err(|e| PluginToolError {
            message: format!("handler execution failed: {e}"),
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(PluginToolError {
                message: format!(
                    "handler exited with code {}: {}",
                    output.status.code().unwrap_or(-1),
                    crate::tools::truncate_output(&stderr, 2000),
                ),
            });
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let result: Value = serde_json::from_str(&stdout).unwrap_or_else(|_| {
            // If output isn't valid JSON, wrap it as a string
            Value::String(stdout.trim().to_string())
        });

        Ok(PluginToolOutput { result })
    }
}
