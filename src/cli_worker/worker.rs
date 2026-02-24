//! CLI worker: drives an external CLI coding agent as a subprocess.
//!
//! Spawns a one-shot subprocess per task. Streams stdout for status updates
//! and captures the final output as the worker result. Supports interactive
//! follow-ups via stdin for long-running sessions.

use crate::cli_worker::types::CliBackendConfig;
use crate::{AgentId, ChannelId, ProcessEvent, WorkerId};

use anyhow::{Context as _, bail};
use std::path::PathBuf;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{broadcast, mpsc};
use uuid::Uuid;

/// Result of a CLI worker run.
pub struct CliWorkerResult {
    pub result_text: String,
}

/// A CLI-backed worker that drives an external coding agent subprocess.
pub struct CliWorker {
    pub id: WorkerId,
    pub channel_id: Option<ChannelId>,
    pub agent_id: AgentId,
    pub task: String,
    pub directory: PathBuf,
    pub backend: CliBackendConfig,
    pub backend_name: String,
    pub event_tx: broadcast::Sender<ProcessEvent>,
    /// Input channel for interactive follow-ups.
    pub input_rx: Option<mpsc::Receiver<String>>,
}

impl CliWorker {
    /// Create a new fire-and-forget CLI worker.
    pub fn new(
        channel_id: Option<ChannelId>,
        agent_id: AgentId,
        task: impl Into<String>,
        directory: PathBuf,
        backend_name: impl Into<String>,
        backend: CliBackendConfig,
        event_tx: broadcast::Sender<ProcessEvent>,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            channel_id,
            agent_id,
            task: task.into(),
            directory,
            backend,
            backend_name: backend_name.into(),
            event_tx,
            input_rx: None,
        }
    }

    /// Create an interactive CLI worker that accepts follow-up messages via stdin.
    pub fn new_interactive(
        channel_id: Option<ChannelId>,
        agent_id: AgentId,
        task: impl Into<String>,
        directory: PathBuf,
        backend_name: impl Into<String>,
        backend: CliBackendConfig,
        event_tx: broadcast::Sender<ProcessEvent>,
    ) -> (Self, mpsc::Sender<String>) {
        let (input_tx, input_rx) = mpsc::channel(32);
        let mut worker = Self::new(
            channel_id,
            agent_id,
            task,
            directory,
            backend_name,
            backend,
            event_tx,
        );
        worker.input_rx = Some(input_rx);
        (worker, input_tx)
    }

    /// Run the CLI worker subprocess.
    pub async fn run(mut self) -> anyhow::Result<CliWorkerResult> {
        self.send_status(&format!("starting {} CLI", self.backend_name));

        let mut command = Command::new(&self.backend.command);
        command
            .args(&self.backend.args)
            .current_dir(&self.directory)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);

        // Scrub secret environment variables from inherited environment
        for var in ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY", "XAI_API_KEY", "GITHUB_TOKEN", "SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "TWITCH_OAUTH_TOKEN"] {
            command.env_remove(var);
        }

        // Set custom environment variables (may intentionally re-add scrubbed vars)
        for (key, value) in &self.backend.env {
            command.env(key, value);
        }

        let mut child = command.spawn().with_context(|| {
            format!(
                "failed to spawn CLI backend '{}' (command: '{}')",
                self.backend_name, self.backend.command
            )
        })?;

        // Write the task to stdin
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(self.task.as_bytes())
                .await
                .context("failed to write task to CLI worker stdin")?;
            stdin
                .write_all(b"\n")
                .await
                .context("failed to write newline to CLI worker stdin")?;

            // For non-interactive workers, close stdin to signal end of input
            if self.input_rx.is_none() {
                drop(stdin);
            } else {
                // For interactive workers, keep stdin for follow-ups
                // We'll handle it in the interactive loop below
                // Put stdin back temporarily by spawning the follow-up handler
                let input_rx = self.input_rx.take();
                if let Some(mut rx) = input_rx {
                    let worker_id = self.id;
                    let agent_id = self.agent_id.clone();
                    let channel_id = self.channel_id.clone();
                    let event_tx = self.event_tx.clone();

                    tokio::spawn(async move {
                        while let Some(follow_up) = rx.recv().await {
                            let _ = event_tx.send(ProcessEvent::WorkerStatus {
                                agent_id: agent_id.clone(),
                                worker_id,
                                channel_id: channel_id.clone(),
                                status: "processing follow-up".to_string(),
                            });

                            if let Err(error) = stdin.write_all(follow_up.as_bytes()).await {
                                tracing::warn!(worker_id = %worker_id, %error, "failed to write follow-up to CLI stdin");
                                break;
                            }
                            if let Err(error) = stdin.write_all(b"\n").await {
                                tracing::warn!(worker_id = %worker_id, %error, "failed to write newline after follow-up");
                                break;
                            }
                        }
                        // Dropping stdin signals EOF to the subprocess
                    });
                }
            }
        }

        self.send_status("running");

        // Stream stdout for status updates and capture output
        let stdout = child
            .stdout
            .take()
            .context("failed to capture CLI worker stdout")?;
        let stderr = child
            .stderr
            .take()
            .context("failed to capture CLI worker stderr")?;

        let worker_id = self.id;
        let agent_id_for_stderr = self.agent_id.clone();
        let channel_id_for_stderr = self.channel_id.clone();
        let event_tx_for_stderr = self.event_tx.clone();

        // Stream stderr in a separate task for status updates
        let stderr_handle = tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            let mut last_lines = Vec::new();

            while let Ok(Some(line)) = lines.next_line().await {
                if !line.trim().is_empty() {
                    // Send stderr lines as status updates (truncated)
                    let status = if line.len() > 200 {
                        format!("{}...", &line[..200])
                    } else {
                        line.clone()
                    };
                    let _ = event_tx_for_stderr.send(ProcessEvent::WorkerStatus {
                        agent_id: agent_id_for_stderr.clone(),
                        worker_id,
                        channel_id: channel_id_for_stderr.clone(),
                        status,
                    });
                    last_lines.push(line);
                    if last_lines.len() > 50 {
                        last_lines.remove(0);
                    }
                }
            }
            last_lines
        });

        // Capture stdout
        let stdout_handle = tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            let mut output = String::new();

            while let Ok(Some(line)) = lines.next_line().await {
                if !output.is_empty() {
                    output.push('\n');
                }
                output.push_str(&line);
            }
            output
        });

        // Wait for completion with timeout
        let timeout_duration = if self.backend.timeout_secs > 0 {
            std::time::Duration::from_secs(self.backend.timeout_secs)
        } else {
            std::time::Duration::from_secs(3600) // 1 hour fallback
        };

        let exit_status = tokio::select! {
            result = child.wait() => {
                result.context("failed to wait for CLI worker process")?
            }
            _ = tokio::time::sleep(timeout_duration) => {
                child.kill().await.ok();
                bail!(
                    "CLI worker '{}' timed out after {} seconds",
                    self.backend_name,
                    self.backend.timeout_secs
                );
            }
        };

        let stdout_output = stdout_handle.await.unwrap_or_else(|_| String::new());
        let stderr_lines = stderr_handle.await.unwrap_or_default();

        if !exit_status.success() {
            let exit_code = exit_status.code().unwrap_or(-1);
            let stderr_tail = stderr_lines.join("\n");
            self.send_status("failed");

            // Include both stdout and stderr in error for context
            let error_context = if stderr_tail.is_empty() {
                stdout_output.clone()
            } else if stdout_output.is_empty() {
                stderr_tail
            } else {
                format!("stdout:\n{stdout_output}\n\nstderr:\n{stderr_tail}")
            };

            bail!(
                "CLI worker '{}' exited with code {}: {}",
                self.backend_name,
                exit_code,
                error_context
            );
        }

        self.send_status("completed");

        tracing::info!(
            worker_id = %self.id,
            backend = %self.backend_name,
            "CLI worker completed"
        );

        Ok(CliWorkerResult {
            result_text: stdout_output,
        })
    }

    /// Send a status update via the process event bus.
    fn send_status(&self, status: &str) {
        let _ = self.event_tx.send(ProcessEvent::WorkerStatus {
            agent_id: self.agent_id.clone(),
            worker_id: self.id,
            channel_id: self.channel_id.clone(),
            status: status.to_string(),
        });
    }
}
