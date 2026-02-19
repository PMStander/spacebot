//! Plugin loading and management.
//!
//! Plugins are directories containing a `PLUGIN.toml` manifest file that
//! declares UI assets, API subprocess commands, and tool definitions.
//!
//! Plugins are loaded from two sources (later wins on name conflicts):
//! 1. Instance-level: `{instance_dir}/plugins/`
//! 2. Agent workspace: `{workspace}/plugins/`

pub mod process;

use anyhow::Context as _;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Parsed `PLUGIN.toml` manifest.
#[derive(Debug, Clone, Deserialize)]
pub struct PluginManifest {
    pub plugin: PluginMeta,
    #[serde(default)]
    pub ui: Option<UiConfig>,
    #[serde(default)]
    pub api: Option<ApiConfig>,
    #[serde(default)]
    pub tools: Vec<ToolDef>,
}

/// The `[plugin]` section of the manifest.
#[derive(Debug, Clone, Deserialize)]
pub struct PluginMeta {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_version")]
    pub version: String,
}

fn default_version() -> String {
    "0.1.0".to_string()
}

/// The `[ui]` section — optional static assets or dev-server proxy.
#[derive(Debug, Clone, Deserialize)]
pub struct UiConfig {
    /// Relative path to built SPA dist directory.
    #[serde(default)]
    pub dist: Option<String>,
    /// Dev-mode proxy URL (e.g. `http://localhost:5174`).
    #[serde(default)]
    pub dev_server: Option<String>,
}

/// The `[api]` section — optional subprocess API server.
#[derive(Debug, Clone, Deserialize)]
pub struct ApiConfig {
    /// Command to run (e.g. `python3 api/server.py`).
    pub command: String,
    /// Port to bind. 0 = auto-assign.
    #[serde(default)]
    pub port: u16,
}

/// A `[[tools]]` entry — an LLM-facing tool backed by a handler script.
#[derive(Debug, Clone, Deserialize)]
pub struct ToolDef {
    pub name: String,
    #[serde(default)]
    pub description: String,
    /// Relative path to handler script (executed via subprocess).
    pub handler: String,
    /// JSON Schema for tool arguments, as a JSON string.
    #[serde(default = "default_schema")]
    pub schema: String,
}

fn default_schema() -> String {
    r#"{"type":"object","properties":{}}"#.to_string()
}

/// Where a plugin was loaded from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum PluginSource {
    /// Instance-level `{instance_dir}/plugins/`.
    Instance,
    /// Agent workspace `{workspace}/plugins/`.
    Workspace,
}

/// A loaded plugin.
#[derive(Debug, Clone)]
pub struct Plugin {
    pub name: String,
    pub description: String,
    pub version: String,
    pub manifest: PluginManifest,
    /// Absolute path to the plugin directory.
    pub base_dir: PathBuf,
    pub source: PluginSource,
}

/// All plugins loaded for an agent.
#[derive(Debug, Clone, Default)]
pub struct PluginSet {
    plugins: HashMap<String, Plugin>,
}

impl PluginSet {
    /// Load plugins from instance and workspace directories.
    ///
    /// Workspace plugins override instance plugins with the same name.
    pub async fn load(instance_plugins_dir: &Path, workspace_plugins_dir: &Path) -> Self {
        let mut set = Self::default();

        // Instance plugins (lowest precedence)
        if instance_plugins_dir.is_dir() {
            if let Ok(plugins) =
                load_plugins_from_dir(instance_plugins_dir, PluginSource::Instance).await
            {
                for plugin in plugins {
                    set.plugins.insert(plugin.name.to_lowercase(), plugin);
                }
            }
        }

        // Workspace plugins (highest precedence, overrides instance)
        if workspace_plugins_dir.is_dir() {
            if let Ok(plugins) =
                load_plugins_from_dir(workspace_plugins_dir, PluginSource::Workspace).await
            {
                for plugin in plugins {
                    set.plugins.insert(plugin.name.to_lowercase(), plugin);
                }
            }
        }

        if !set.plugins.is_empty() {
            tracing::info!(
                count = set.plugins.len(),
                names = %set.plugins.keys().cloned().collect::<Vec<_>>().join(", "),
                "plugins loaded"
            );
        }

        set
    }

    /// Get a plugin by name (case-insensitive).
    pub fn get(&self, name: &str) -> Option<&Plugin> {
        self.plugins.get(&name.to_lowercase())
    }

    /// Iterate over all loaded plugins.
    pub fn iter(&self) -> impl Iterator<Item = &Plugin> {
        self.plugins.values()
    }

    /// Number of loaded plugins.
    pub fn len(&self) -> usize {
        self.plugins.len()
    }

    /// Whether any plugins are loaded.
    pub fn is_empty(&self) -> bool {
        self.plugins.is_empty()
    }

    /// Filter plugins to only those in the allowlist (case-insensitive).
    pub fn filter_allowed(&mut self, allowed: &[String]) {
        let allowed_lower: Vec<String> = allowed.iter().map(|s| s.to_lowercase()).collect();
        self.plugins.retain(|name, _| allowed_lower.contains(name));
    }

    /// List all loaded plugins with their metadata.
    pub fn list(&self) -> Vec<PluginInfo> {
        let mut plugins: Vec<_> = self.plugins.values().collect();
        plugins.sort_by(|a, b| a.name.cmp(&b.name));

        plugins
            .into_iter()
            .map(|p| PluginInfo {
                name: p.name.clone(),
                description: p.description.clone(),
                version: p.version.clone(),
                base_dir: p.base_dir.clone(),
                source: p.source.clone(),
                has_ui: p.manifest.ui.is_some(),
                has_api: p.manifest.api.is_some(),
                tool_count: p.manifest.tools.len(),
            })
            .collect()
    }
}

/// Public plugin information for API responses.
#[derive(Debug, Clone, Serialize)]
pub struct PluginInfo {
    pub name: String,
    pub description: String,
    pub version: String,
    pub base_dir: PathBuf,
    pub source: PluginSource,
    pub has_ui: bool,
    pub has_api: bool,
    pub tool_count: usize,
}

/// Load all plugins from a directory.
///
/// Each subdirectory containing a `PLUGIN.toml` file is treated as a plugin.
async fn load_plugins_from_dir(dir: &Path, source: PluginSource) -> anyhow::Result<Vec<Plugin>> {
    let mut plugins = Vec::new();

    let mut entries = tokio::fs::read_dir(dir)
        .await
        .with_context(|| format!("failed to read plugins directory: {}", dir.display()))?;

    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let manifest_file = path.join("PLUGIN.toml");
        if !manifest_file.exists() {
            continue;
        }

        match load_plugin(&manifest_file, &path, source.clone()).await {
            Ok(plugin) => {
                tracing::debug!(
                    name = %plugin.name,
                    path = %manifest_file.display(),
                    "loaded plugin"
                );
                plugins.push(plugin);
            }
            Err(error) => {
                tracing::warn!(
                    path = %manifest_file.display(),
                    %error,
                    "failed to load plugin, skipping"
                );
            }
        }
    }

    Ok(plugins)
}

/// Load a single plugin from its PLUGIN.toml file.
async fn load_plugin(
    manifest_file: &Path,
    base_dir: &Path,
    source: PluginSource,
) -> anyhow::Result<Plugin> {
    let raw = tokio::fs::read_to_string(manifest_file)
        .await
        .with_context(|| format!("failed to read {}", manifest_file.display()))?;

    let manifest: PluginManifest =
        toml::from_str(&raw).with_context(|| format!("failed to parse {}", manifest_file.display()))?;

    Ok(Plugin {
        name: manifest.plugin.name.clone(),
        description: manifest.plugin.description.clone(),
        version: manifest.plugin.version.clone(),
        manifest,
        base_dir: base_dir.to_path_buf(),
        source,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_manifest() {
        let toml_str = r#"
[plugin]
name = "comic-book"
description = "View and edit comic book pages"
version = "0.1.0"

[ui]
dist = "ui/dist"
dev_server = "http://localhost:5174"

[api]
command = "python3 api/server.py"
port = 0

[[tools]]
name = "comic_list_books"
description = "List all available comic books"
handler = "bin/list_books.py"
schema = '{"type":"object","properties":{}}'

[[tools]]
name = "comic_get_page"
description = "Get page data"
handler = "bin/get_page.py"
schema = '{"type":"object","properties":{"comic_id":{"type":"string"},"page":{"type":"integer"}},"required":["comic_id","page"]}'
"#;

        let manifest: PluginManifest = toml::from_str(toml_str).unwrap();
        assert_eq!(manifest.plugin.name, "comic-book");
        assert_eq!(manifest.plugin.description, "View and edit comic book pages");
        assert_eq!(manifest.plugin.version, "0.1.0");
        assert!(manifest.ui.is_some());
        let ui = manifest.ui.unwrap();
        assert_eq!(ui.dist.unwrap(), "ui/dist");
        assert_eq!(ui.dev_server.unwrap(), "http://localhost:5174");
        assert!(manifest.api.is_some());
        let api = manifest.api.unwrap();
        assert_eq!(api.command, "python3 api/server.py");
        assert_eq!(api.port, 0);
        assert_eq!(manifest.tools.len(), 2);
        assert_eq!(manifest.tools[0].name, "comic_list_books");
        assert_eq!(manifest.tools[1].name, "comic_get_page");
    }

    #[test]
    fn test_parse_minimal_manifest() {
        let toml_str = r#"
[plugin]
name = "simple"
"#;

        let manifest: PluginManifest = toml::from_str(toml_str).unwrap();
        assert_eq!(manifest.plugin.name, "simple");
        assert_eq!(manifest.plugin.version, "0.1.0");
        assert!(manifest.ui.is_none());
        assert!(manifest.api.is_none());
        assert!(manifest.tools.is_empty());
    }

    #[test]
    fn test_plugin_set_list() {
        let mut set = PluginSet::default();
        set.plugins.insert(
            "test".into(),
            Plugin {
                name: "test".into(),
                description: "A test plugin".into(),
                version: "0.1.0".into(),
                manifest: toml::from_str(
                    r#"[plugin]
name = "test"
description = "A test plugin"
"#,
                )
                .unwrap(),
                base_dir: PathBuf::from("/plugins/test"),
                source: PluginSource::Instance,
            },
        );

        let list = set.list();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "test");
        assert_eq!(list[0].has_ui, false);
        assert_eq!(list[0].has_api, false);
        assert_eq!(list[0].tool_count, 0);
    }
}
