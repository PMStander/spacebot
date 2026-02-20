//! Canvas tools for building and managing agent dashboard panels.

use crate::api::ApiEvent;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tokio::sync::broadcast;

// ---------------------------------------------------------------------------
// CanvasSetTool
// ---------------------------------------------------------------------------

/// Tool for creating or updating a canvas panel.
#[derive(Debug, Clone)]
pub struct CanvasSetTool {
    pool: SqlitePool,
    agent_id: String,
    api_event_tx: broadcast::Sender<ApiEvent>,
}

impl CanvasSetTool {
    pub fn new(
        pool: SqlitePool,
        agent_id: String,
        api_event_tx: broadcast::Sender<ApiEvent>,
    ) -> Self {
        Self {
            pool,
            agent_id,
            api_event_tx,
        }
    }
}

#[derive(Debug, thiserror::Error)]
#[error("Canvas set failed: {0}")]
pub struct CanvasSetError(String);

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CanvasSetArgs {
    /// A stable identifier for the panel (e.g., "pipeline", "contacts", "todo").
    /// Using the same name replaces the panel content.
    pub name: String,
    /// Display title shown above the panel.
    pub title: String,
    /// Self-contained HTML string. Can include inline CSS and JavaScript.
    /// Will render in a sandboxed iframe.
    pub html: String,
    /// Optional layout metadata as JSON. Supports "span" (1-3 for grid columns)
    /// and "height" (pixel height, default 400).
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct CanvasSetOutput {
    pub panel_id: String,
    pub created: bool,
}

impl Tool for CanvasSetTool {
    const NAME: &'static str = "canvas_set";

    type Error = CanvasSetError;
    type Args = CanvasSetArgs;
    type Output = CanvasSetOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: Self::NAME.to_string(),
            description: crate::prompts::text::get("tools/canvas_set").to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Stable identifier for the panel (e.g., 'pipeline', 'contacts', 'todo'). Same name = replace content."
                    },
                    "title": {
                        "type": "string",
                        "description": "Display title shown above the panel."
                    },
                    "html": {
                        "type": "string",
                        "description": "Self-contained HTML with inline CSS/JS. Renders in a sandboxed iframe. Use dark theme (dark backgrounds, light text)."
                    },
                    "metadata": {
                        "type": "object",
                        "description": "Optional layout hints: {\"span\": 1|2|3, \"height\": 400}",
                        "properties": {
                            "span": {
                                "type": "integer",
                                "description": "Grid column span (1-3). Default 1."
                            },
                            "height": {
                                "type": "integer",
                                "description": "Panel height in pixels. Default 400."
                            }
                        }
                    }
                },
                "required": ["name", "title", "html"]
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let metadata_json = args
            .metadata
            .as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_default());

        // Check if panel already exists
        let existing: Option<(String,)> =
            sqlx::query_as("SELECT id FROM canvas_panels WHERE name = ?")
                .bind(&args.name)
                .fetch_optional(&self.pool)
                .await
                .map_err(|e| CanvasSetError(format!("DB query failed: {e}")))?;

        let (panel_id, created) = if let Some((id,)) = existing {
            // Update existing panel
            sqlx::query(
                "UPDATE canvas_panels SET title = ?, content = ?, metadata = ?, \
                 updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
            )
            .bind(&args.title)
            .bind(&args.html)
            .bind(&metadata_json)
            .bind(&id)
            .execute(&self.pool)
            .await
            .map_err(|e| CanvasSetError(format!("DB update failed: {e}")))?;

            (id, false)
        } else {
            // Create new panel
            let id = uuid::Uuid::new_v4().to_string();
            let next_position: (i64,) =
                sqlx::query_as("SELECT COALESCE(MAX(position), -1) + 1 FROM canvas_panels")
                    .fetch_one(&self.pool)
                    .await
                    .map_err(|e| CanvasSetError(format!("DB query failed: {e}")))?;

            sqlx::query(
                "INSERT INTO canvas_panels (id, name, title, content, position, metadata) \
                 VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(&id)
            .bind(&args.name)
            .bind(&args.title)
            .bind(&args.html)
            .bind(next_position.0)
            .bind(&metadata_json)
            .execute(&self.pool)
            .await
            .map_err(|e| CanvasSetError(format!("DB insert failed: {e}")))?;

            (id, true)
        };

        // Notify SSE subscribers
        let _ = self.api_event_tx.send(ApiEvent::CanvasUpdated {
            agent_id: self.agent_id.clone(),
            panel_name: args.name,
        });

        Ok(CanvasSetOutput { panel_id, created })
    }
}

// ---------------------------------------------------------------------------
// CanvasRemoveTool
// ---------------------------------------------------------------------------

/// Tool for removing a canvas panel.
#[derive(Debug, Clone)]
pub struct CanvasRemoveTool {
    pool: SqlitePool,
    agent_id: String,
    api_event_tx: broadcast::Sender<ApiEvent>,
}

impl CanvasRemoveTool {
    pub fn new(
        pool: SqlitePool,
        agent_id: String,
        api_event_tx: broadcast::Sender<ApiEvent>,
    ) -> Self {
        Self {
            pool,
            agent_id,
            api_event_tx,
        }
    }
}

#[derive(Debug, thiserror::Error)]
#[error("Canvas remove failed: {0}")]
pub struct CanvasRemoveError(String);

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CanvasRemoveArgs {
    /// The name of the panel to remove.
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct CanvasRemoveOutput {
    pub removed: bool,
}

impl Tool for CanvasRemoveTool {
    const NAME: &'static str = "canvas_remove";

    type Error = CanvasRemoveError;
    type Args = CanvasRemoveArgs;
    type Output = CanvasRemoveOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: Self::NAME.to_string(),
            description: crate::prompts::text::get("tools/canvas_remove").to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "The name of the panel to remove."
                    }
                },
                "required": ["name"]
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let result = sqlx::query("DELETE FROM canvas_panels WHERE name = ?")
            .bind(&args.name)
            .execute(&self.pool)
            .await
            .map_err(|e| CanvasRemoveError(format!("DB delete failed: {e}")))?;

        let removed = result.rows_affected() > 0;

        if removed {
            let _ = self.api_event_tx.send(ApiEvent::CanvasRemoved {
                agent_id: self.agent_id.clone(),
                panel_name: args.name,
            });
        }

        Ok(CanvasRemoveOutput { removed })
    }
}

// ---------------------------------------------------------------------------
// CanvasListTool
// ---------------------------------------------------------------------------

/// Tool for listing canvas panels.
#[derive(Debug, Clone)]
pub struct CanvasListTool {
    pool: SqlitePool,
}

impl CanvasListTool {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[derive(Debug, thiserror::Error)]
#[error("Canvas list failed: {0}")]
pub struct CanvasListError(String);

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CanvasListArgs {}

#[derive(Debug, Serialize)]
pub struct CanvasListOutput {
    pub panels: Vec<CanvasPanelSummary>,
}

#[derive(Debug, Serialize)]
pub struct CanvasPanelSummary {
    pub name: String,
    pub title: String,
    pub position: i64,
    pub updated_at: String,
}

impl Tool for CanvasListTool {
    const NAME: &'static str = "canvas_list";

    type Error = CanvasListError;
    type Args = CanvasListArgs;
    type Output = CanvasListOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: Self::NAME.to_string(),
            description: crate::prompts::text::get("tools/canvas_list").to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {}
            }),
        }
    }

    async fn call(&self, _args: Self::Args) -> Result<Self::Output, Self::Error> {
        let rows: Vec<(String, String, i64, String)> = sqlx::query_as(
            "SELECT name, title, position, updated_at FROM canvas_panels ORDER BY position ASC, created_at ASC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| CanvasListError(format!("DB query failed: {e}")))?;

        let panels = rows
            .into_iter()
            .map(|(name, title, position, updated_at)| CanvasPanelSummary {
                name,
                title,
                position,
                updated_at,
            })
            .collect();

        Ok(CanvasListOutput { panels })
    }
}
