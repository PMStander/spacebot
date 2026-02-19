use super::state::ApiState;

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Deserialize)]
pub(super) struct WorkerRunsQuery {
    agent_id: String,
    #[serde(default = "default_worker_runs_limit")]
    limit: i64,
    #[serde(default)]
    offset: i64,
    #[serde(default)]
    status: Option<String>,
}

fn default_worker_runs_limit() -> i64 {
    50
}

#[derive(Serialize)]
pub(super) struct WorkerRunInfo {
    id: String,
    channel_id: Option<String>,
    task: String,
    result: Option<String>,
    status: String,
    started_at: String,
    completed_at: Option<String>,
}

#[derive(Serialize)]
pub(super) struct WorkerRunsResponse {
    runs: Vec<WorkerRunInfo>,
    total: i64,
}

pub(super) async fn list_worker_runs(
    State(state): State<Arc<ApiState>>,
    Query(query): Query<WorkerRunsQuery>,
) -> Result<Json<WorkerRunsResponse>, StatusCode> {
    let pools = state.agent_pools.load();
    let pool = pools.get(&query.agent_id).ok_or(StatusCode::NOT_FOUND)?;

    let status_filter = query.status.as_deref().unwrap_or("");
    let has_status_filter = !status_filter.is_empty();

    let total: i64 = if has_status_filter {
        sqlx::query_scalar("SELECT COUNT(*) FROM worker_runs WHERE status = ?")
            .bind(status_filter)
            .fetch_one(pool)
            .await
            .unwrap_or(0)
    } else {
        sqlx::query_scalar("SELECT COUNT(*) FROM worker_runs")
            .fetch_one(pool)
            .await
            .unwrap_or(0)
    };

    let rows = if has_status_filter {
        sqlx::query_as::<_, (String, Option<String>, String, Option<String>, String, String, Option<String>)>(
            "SELECT id, channel_id, task, result, status, started_at, completed_at \
             FROM worker_runs WHERE status = ?1 ORDER BY started_at DESC LIMIT ?2 OFFSET ?3",
        )
        .bind(status_filter)
        .bind(query.limit)
        .bind(query.offset)
        .fetch_all(pool)
        .await
        .unwrap_or_default()
    } else {
        sqlx::query_as::<_, (String, Option<String>, String, Option<String>, String, String, Option<String>)>(
            "SELECT id, channel_id, task, result, status, started_at, completed_at \
             FROM worker_runs ORDER BY started_at DESC LIMIT ?1 OFFSET ?2",
        )
        .bind(query.limit)
        .bind(query.offset)
        .fetch_all(pool)
        .await
        .unwrap_or_default()
    };

    let runs = rows
        .into_iter()
        .map(
            |(id, channel_id, task, result, status, started_at, completed_at)| WorkerRunInfo {
                id,
                channel_id,
                task,
                result,
                status,
                started_at,
                completed_at,
            },
        )
        .collect();

    Ok(Json(WorkerRunsResponse { runs, total }))
}
