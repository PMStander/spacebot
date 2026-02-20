use super::state::ApiState;

use crate::conversation::channels::ChannelStore;
use crate::conversation::history::ProcessRunLogger;

use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

const RESERVED_INTERNAL_CHANNEL_PREFIX: &str = "internal:cortex-workers-";

#[derive(Deserialize)]
pub(super) struct RenameChannelRequest {
    agent_id: String,
    channel_id: String,
    display_name: String,
}

#[derive(Deserialize)]
pub(super) struct DeleteChannelQuery {
    agent_id: String,
    channel_id: String,
}

#[derive(Deserialize)]
pub(super) struct CreateChannelRequest {
    agent_id: String,
    display_name: Option<String>,
}

#[derive(Serialize)]
pub(super) struct CreateChannelResponseBody {
    id: String,
    platform: String,
    display_name: Option<String>,
    agent_id: String,
}

#[derive(Serialize)]
pub(super) struct ChannelResponse {
    agent_id: String,
    id: String,
    platform: String,
    display_name: Option<String>,
    is_active: bool,
    last_activity_at: String,
    created_at: String,
}

#[derive(Serialize)]
pub(super) struct ChannelsResponse {
    channels: Vec<ChannelResponse>,
}

#[derive(Serialize)]
pub(super) struct MessagesResponse {
    items: Vec<crate::conversation::history::TimelineItem>,
    has_more: bool,
}

#[derive(Deserialize)]
pub(super) struct MessagesQuery {
    channel_id: String,
    #[serde(default = "default_message_limit")]
    limit: i64,
    before: Option<String>,
}

fn default_message_limit() -> i64 {
    20
}

#[derive(Deserialize)]
pub(super) struct CancelProcessRequest {
    channel_id: String,
    process_type: String,
    process_id: String,
}

#[derive(Serialize)]
pub(super) struct CancelProcessResponse {
    success: bool,
    message: String,
}

/// List active channels across all agents.
pub(super) async fn list_channels(State(state): State<Arc<ApiState>>) -> Json<ChannelsResponse> {
    let pools = state.agent_pools.load();
    let mut all_channels = Vec::new();

    for (agent_id, pool) in pools.iter() {
        let store = ChannelStore::new(pool.clone());
        match store.list_active().await {
            Ok(channels) => {
                for channel in channels {
                    if channel.id.starts_with(RESERVED_INTERNAL_CHANNEL_PREFIX) {
                        continue;
                    }
                    all_channels.push(ChannelResponse {
                        agent_id: agent_id.clone(),
                        id: channel.id,
                        platform: channel.platform,
                        display_name: channel.display_name,
                        is_active: channel.is_active,
                        last_activity_at: channel.last_activity_at.to_rfc3339(),
                        created_at: channel.created_at.to_rfc3339(),
                    });
                }
            }
            Err(error) => {
                tracing::warn!(%error, agent_id, "failed to list channels");
            }
        }
    }

    Json(ChannelsResponse {
        channels: all_channels,
    })
}

/// Get the unified timeline for a channel: messages, branch runs, and worker runs
/// interleaved chronologically.
pub(super) async fn channel_messages(
    State(state): State<Arc<ApiState>>,
    Query(query): Query<MessagesQuery>,
) -> Json<MessagesResponse> {
    let pools = state.agent_pools.load();
    let limit = query.limit.min(100);
    let fetch_limit = limit + 1;

    for (_agent_id, pool) in pools.iter() {
        let logger = ProcessRunLogger::new(pool.clone());
        match logger
            .load_channel_timeline(&query.channel_id, fetch_limit, query.before.as_deref())
            .await
        {
            Ok(items) if !items.is_empty() => {
                let has_more = items.len() as i64 > limit;
                let items = if has_more {
                    items[items.len() - limit as usize..].to_vec()
                } else {
                    items
                };
                return Json(MessagesResponse { items, has_more });
            }
            Ok(_) => continue,
            Err(error) => {
                tracing::warn!(%error, channel_id = %query.channel_id, "failed to load timeline");
                continue;
            }
        }
    }

    Json(MessagesResponse {
        items: vec![],
        has_more: false,
    })
}

/// Get live status (active workers, branches, completed items) for all channels.
pub(super) async fn channel_status(
    State(state): State<Arc<ApiState>>,
) -> Json<HashMap<String, serde_json::Value>> {
    let snapshot: Vec<_> = {
        let blocks = state.channel_status_blocks.read().await;
        blocks.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
    };

    let mut result = HashMap::new();
    for (channel_id, status_block) in snapshot {
        let block = status_block.read().await;
        if let Ok(value) = serde_json::to_value(&*block) {
            result.insert(channel_id, value);
        }
    }

    Json(result)
}

/// Create a new internal chat channel for an agent.
pub(super) async fn create_internal_channel(
    State(state): State<Arc<ApiState>>,
    Json(request): Json<CreateChannelRequest>,
) -> Result<Json<CreateChannelResponseBody>, StatusCode> {
    let pools = state.agent_pools.load();
    let pool: sqlx::SqlitePool = pools
        .get(&request.agent_id)
        .ok_or(StatusCode::NOT_FOUND)?
        .clone();

    let channel_id = format!("internal:{}", uuid::Uuid::new_v4());
    let display_name = request
        .display_name
        .or_else(|| Some("New Chat".to_string()));

    sqlx::query(
        "INSERT INTO channels (id, platform, display_name, platform_meta, last_activity_at) \
         VALUES (?, 'internal', ?, NULL, CURRENT_TIMESTAMP)",
    )
    .bind(&channel_id)
    .bind(&display_name)
    .execute(&pool)
    .await
    .map_err(|error| {
        tracing::warn!(%error, "failed to create internal channel");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(CreateChannelResponseBody {
        id: channel_id,
        platform: "internal".to_string(),
        display_name,
        agent_id: request.agent_id,
    }))
}

/// Rename an internal channel.
pub(super) async fn rename_channel(
    State(state): State<Arc<ApiState>>,
    Json(request): Json<RenameChannelRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if request
        .channel_id
        .starts_with(RESERVED_INTERNAL_CHANNEL_PREFIX)
    {
        return Err(StatusCode::FORBIDDEN);
    }

    let pools = state.agent_pools.load();
    let pool = pools
        .get(&request.agent_id)
        .ok_or(StatusCode::NOT_FOUND)?
        .clone();

    let rows_affected = sqlx::query(
        "UPDATE channels SET display_name = ? WHERE id = ? AND platform = 'internal'",
    )
    .bind(&request.display_name)
    .bind(&request.channel_id)
    .execute(&pool)
    .await
    .map_err(|error| {
        tracing::warn!(%error, channel_id = %request.channel_id, "failed to rename channel");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .rows_affected();

    if rows_affected == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Delete an internal channel and all its messages.
/// Agent memories derived from the channel are preserved.
pub(super) async fn delete_channel(
    State(state): State<Arc<ApiState>>,
    Query(query): Query<DeleteChannelQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if query
        .channel_id
        .starts_with(RESERVED_INTERNAL_CHANNEL_PREFIX)
    {
        return Err(StatusCode::FORBIDDEN);
    }

    let pools = state.agent_pools.load();
    let pool = pools
        .get(&query.agent_id)
        .ok_or(StatusCode::NOT_FOUND)?
        .clone();

    // Verify it exists and is internal before deleting
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM channels WHERE id = ? AND platform = 'internal')",
    )
    .bind(&query.channel_id)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if !exists {
        return Err(StatusCode::NOT_FOUND);
    }

    // Delete all channel-scoped data; memories are agent-scoped and preserved
    sqlx::query("DELETE FROM conversation_messages WHERE channel_id = ?")
        .bind(&query.channel_id)
        .execute(&pool)
        .await
        .ok();
    sqlx::query("DELETE FROM branch_runs WHERE channel_id = ?")
        .bind(&query.channel_id)
        .execute(&pool)
        .await
        .ok();
    sqlx::query("DELETE FROM worker_runs WHERE channel_id = ?")
        .bind(&query.channel_id)
        .execute(&pool)
        .await
        .ok();
    sqlx::query("DELETE FROM artifacts WHERE channel_id = ?")
        .bind(&query.channel_id)
        .execute(&pool)
        .await
        .ok();
    sqlx::query("DELETE FROM channels WHERE id = ?")
        .bind(&query.channel_id)
        .execute(&pool)
        .await
        .map_err(|error| {
            tracing::warn!(%error, channel_id = %query.channel_id, "failed to delete channel");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Cancel a running worker or branch via the API.
pub(super) async fn cancel_process(
    State(state): State<Arc<ApiState>>,
    Json(request): Json<CancelProcessRequest>,
) -> Result<Json<CancelProcessResponse>, StatusCode> {
    let states = state.channel_states.read().await;
    let channel_state = states
        .get(&request.channel_id)
        .ok_or(StatusCode::NOT_FOUND)?;

    match request.process_type.as_str() {
        "worker" => {
            let worker_id: crate::WorkerId = request
                .process_id
                .parse()
                .map_err(|_| StatusCode::BAD_REQUEST)?;
            channel_state
                .cancel_worker(worker_id)
                .await
                .map_err(|_| StatusCode::NOT_FOUND)?;
            Ok(Json(CancelProcessResponse {
                success: true,
                message: format!("Worker {} cancelled", request.process_id),
            }))
        }
        "branch" => {
            let branch_id: crate::BranchId = request
                .process_id
                .parse()
                .map_err(|_| StatusCode::BAD_REQUEST)?;
            channel_state
                .cancel_branch(branch_id)
                .await
                .map_err(|_| StatusCode::NOT_FOUND)?;
            Ok(Json(CancelProcessResponse {
                success: true,
                message: format!("Branch {} cancelled", request.process_id),
            }))
        }
        _ => Err(StatusCode::BAD_REQUEST),
    }
}
