use super::state::ApiState;

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

// ---------------------------------------------------------------------------
// Query / response types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(super) struct CanvasQuery {
    agent_id: String,
}

#[derive(Serialize, Clone)]
pub(super) struct CanvasPanelInfo {
    id: String,
    name: String,
    title: String,
    content: String,
    position: i64,
    metadata: Option<serde_json::Value>,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize)]
pub(super) struct CanvasPanelsResponse {
    panels: Vec<CanvasPanelInfo>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

pub(super) async fn list_canvas_panels(
    State(state): State<Arc<ApiState>>,
    Query(query): Query<CanvasQuery>,
) -> Result<Json<CanvasPanelsResponse>, StatusCode> {
    let pools = state.agent_pools.load();
    let pool = pools
        .get(&query.agent_id)
        .ok_or(StatusCode::NOT_FOUND)?;

    let rows: Vec<(String, String, String, String, i64, Option<String>, String, String)> =
        sqlx::query_as(
            "SELECT id, name, title, content, position, metadata, created_at, updated_at \
             FROM canvas_panels ORDER BY position ASC, created_at ASC",
        )
        .fetch_all(pool)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "failed to list canvas panels");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let panels = rows
        .into_iter()
        .map(
            |(id, name, title, content, position, metadata, created_at, updated_at)| {
                CanvasPanelInfo {
                    id,
                    name,
                    title,
                    content,
                    position,
                    metadata: metadata.and_then(|m| serde_json::from_str(&m).ok()),
                    created_at,
                    updated_at,
                }
            },
        )
        .collect();

    Ok(Json(CanvasPanelsResponse { panels }))
}
