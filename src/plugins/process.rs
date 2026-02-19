//! Plugin subprocess lifecycle management.
//!
//! Each plugin with an `[api]` section gets a managed subprocess that serves
//! its API. The `PluginProcessManager` handles starting, health-checking,
//! and gracefully stopping these subprocesses.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::{Child, Command};

/// Manages a single plugin API subprocess.
#[derive(Debug)]
pub struct PluginProcess {
    /// The running child process.
    child: Child,
    /// The port the subprocess is listening on.
    pub port: u16,
    /// Plugin name for logging.
    pub plugin_name: String,
    /// Base directory of the plugin.
    pub base_dir: PathBuf,
}

impl PluginProcess {
    /// Start a plugin API subprocess.
    ///
    /// The command is split on whitespace and executed from the plugin's base
    /// directory. The assigned port is passed via the `PLUGIN_PORT` environment
    /// variable.
    pub async fn start(
        plugin_name: &str,
        base_dir: &Path,
        command: &str,
        port: u16,
    ) -> anyhow::Result<Self> {
        let actual_port = if port == 0 {
            find_free_port()?
        } else {
            port
        };

        let parts: Vec<&str> = command.split_whitespace().collect();
        anyhow::ensure!(!parts.is_empty(), "empty plugin command");

        let program = parts[0];
        let args = &parts[1..];

        let child = Command::new(program)
            .args(args)
            .current_dir(base_dir)
            .env("PLUGIN_PORT", actual_port.to_string())
            .env("PLUGIN_NAME", plugin_name)
            .env("PLUGIN_DIR", base_dir.as_os_str())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| anyhow::anyhow!("failed to start plugin '{}': {}", plugin_name, e))?;

        tracing::info!(
            plugin = plugin_name,
            port = actual_port,
            command = command,
            "plugin subprocess started"
        );

        let process = Self {
            child,
            port: actual_port,
            plugin_name: plugin_name.to_string(),
            base_dir: base_dir.to_path_buf(),
        };

        // Wait for the subprocess to be ready (poll health endpoint)
        process.wait_for_ready(actual_port).await?;

        Ok(process)
    }

    /// Poll the subprocess health endpoint until it responds or timeout.
    async fn wait_for_ready(&self, port: u16) -> anyhow::Result<()> {
        let url = format!("http://127.0.0.1:{}/health", port);
        let client = reqwest::Client::new();

        for attempt in 0..30 {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

            match client.get(&url).timeout(tokio::time::Duration::from_secs(2)).send().await {
                Ok(resp) if resp.status().is_success() => {
                    tracing::info!(
                        plugin = %self.plugin_name,
                        port,
                        attempts = attempt + 1,
                        "plugin subprocess ready"
                    );
                    return Ok(());
                }
                _ => continue,
            }
        }

        tracing::warn!(
            plugin = %self.plugin_name,
            port,
            "plugin subprocess did not become ready within 15s, proceeding anyway"
        );
        Ok(())
    }

    /// Gracefully stop the subprocess.
    pub async fn stop(&mut self) -> anyhow::Result<()> {
        tracing::info!(plugin = %self.plugin_name, "stopping plugin subprocess");
        self.child.kill().await.ok();
        Ok(())
    }

    /// Check if the subprocess is still running.
    pub fn is_running(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}

impl Drop for PluginProcess {
    fn drop(&mut self) {
        // kill_on_drop is set, but log for visibility
        tracing::debug!(plugin = %self.plugin_name, "plugin process dropped");
    }
}

/// Find a free TCP port by binding to port 0.
fn find_free_port() -> anyhow::Result<u16> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    Ok(port)
}

/// Manages all plugin subprocesses for an agent.
#[derive(Debug, Default)]
pub struct PluginProcessManager {
    processes: std::collections::HashMap<String, PluginProcess>,
}

impl PluginProcessManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Start a plugin subprocess and track it.
    pub async fn start_plugin(
        &mut self,
        plugin_name: &str,
        base_dir: &Path,
        command: &str,
        port: u16,
    ) -> anyhow::Result<u16> {
        // Stop existing process if any
        if let Some(mut existing) = self.processes.remove(plugin_name) {
            existing.stop().await.ok();
        }

        let process = PluginProcess::start(plugin_name, base_dir, command, port).await?;
        let actual_port = process.port;
        self.processes.insert(plugin_name.to_string(), process);
        Ok(actual_port)
    }

    /// Get the port for a running plugin.
    pub fn get_port(&self, plugin_name: &str) -> Option<u16> {
        self.processes.get(plugin_name).map(|p| p.port)
    }

    /// Stop all plugin subprocesses.
    pub async fn stop_all(&mut self) {
        for (name, mut process) in self.processes.drain() {
            if let Err(error) = process.stop().await {
                tracing::warn!(plugin = %name, %error, "error stopping plugin");
            }
        }
    }

    /// Stop a specific plugin subprocess.
    pub async fn stop_plugin(&mut self, name: &str) {
        if let Some(mut process) = self.processes.remove(name) {
            process.stop().await.ok();
        }
    }
}
