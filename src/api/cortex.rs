use super::state::ApiState;

use crate::agent::cortex::{CortexEvent, CortexLogger};
use crate::agent::cortex_chat::{
    ChatAttachment, CortexChatEvent, CortexChatMessage, CortexChatStore,
};

use axum::Json;
use axum::extract::{Multipart, Query, State};
use axum::http::StatusCode;
use axum::response::Sse;
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::path::Path;
use std::sync::Arc;

#[derive(Serialize)]
pub(super) struct CortexEventsResponse {
    events: Vec<CortexEvent>,
    total: i64,
}

#[derive(Serialize)]
pub(super) struct CortexChatMessagesResponse {
    messages: Vec<CortexChatMessage>,
    thread_id: String,
}

#[derive(Deserialize)]
pub(super) struct CortexChatMessagesQuery {
    agent_id: String,
    /// If omitted, loads the latest thread.
    thread_id: Option<String>,
    #[serde(default = "default_cortex_chat_limit")]
    limit: i64,
}

fn default_cortex_chat_limit() -> i64 {
    50
}

#[derive(Deserialize)]
pub(super) struct CortexChatSendRequest {
    agent_id: String,
    thread_id: String,
    message: String,
    channel_id: Option<String>,
    #[serde(default)]
    attachments: Vec<ChatAttachment>,
}

#[derive(Deserialize)]
pub(super) struct CortexEventsQuery {
    agent_id: String,
    #[serde(default = "default_cortex_events_limit")]
    limit: i64,
    #[serde(default)]
    offset: i64,
    #[serde(default)]
    event_type: Option<String>,
}

fn default_cortex_events_limit() -> i64 {
    50
}

/// Load persisted cortex chat history for a thread.
/// If no thread_id is provided, loads the latest thread.
/// If no threads exist, returns an empty list with a fresh thread_id.
pub(super) async fn cortex_chat_messages(
    State(state): State<Arc<ApiState>>,
    Query(query): Query<CortexChatMessagesQuery>,
) -> Result<Json<CortexChatMessagesResponse>, StatusCode> {
    let pools = state.agent_pools.load();
    let pool = pools.get(&query.agent_id).ok_or(StatusCode::NOT_FOUND)?;
    let store = CortexChatStore::new(pool.clone());

    let thread_id = if let Some(tid) = query.thread_id {
        tid
    } else {
        store
            .latest_thread_id()
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string())
    };

    let messages = store
        .load_history(&thread_id, query.limit.min(200))
        .await
        .map_err(|error| {
            tracing::warn!(%error, agent_id = %query.agent_id, "failed to load cortex chat history");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(CortexChatMessagesResponse {
        messages,
        thread_id,
    }))
}

/// Send a message to cortex chat. Returns an SSE stream with activity events.
///
/// The stream emits:
/// - `thinking` — cortex is processing
/// - `tool_started` — a tool call began
/// - `tool_completed` — a tool call finished (with result preview)
/// - `done` — full response text
/// - `error` — if something went wrong
pub(super) async fn cortex_chat_send(
    State(state): State<Arc<ApiState>>,
    axum::Json(request): axum::Json<CortexChatSendRequest>,
) -> Result<Sse<impl Stream<Item = Result<axum::response::sse::Event, Infallible>>>, StatusCode> {
    let sessions = state.cortex_chat_sessions.load();
    let session = sessions
        .get(&request.agent_id)
        .cloned()
        .ok_or(StatusCode::NOT_FOUND)?;

    let thread_id = request.thread_id;
    let message = request.message;
    let channel_id = request.channel_id;
    let workspaces = state.agent_workspaces.load();
    let workspace = workspaces
        .get(&request.agent_id)
        .ok_or(StatusCode::NOT_FOUND)?;
    let upload_dir = workspace.join("cortex-uploads");
    let attachments = validate_cortex_send_attachments(&upload_dir, request.attachments).await?;

    let channel_ref = channel_id.as_deref();
    let mut event_rx = session
        .send_message_with_events(&thread_id, &message, channel_ref, attachments)
        .await
        .map_err(|error| {
            tracing::warn!(%error, "failed to start cortex chat send");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let stream = async_stream::stream! {
        yield Ok(axum::response::sse::Event::default()
            .event("thinking")
            .data("{}"));

        while let Some(event) = event_rx.recv().await {
            let event_name = match &event {
                CortexChatEvent::Thinking => "thinking",
                CortexChatEvent::ToolStarted { .. } => "tool_started",
                CortexChatEvent::ToolCompleted { .. } => "tool_completed",
                CortexChatEvent::Done { .. } => "done",
                CortexChatEvent::Error { .. } => "error",
                CortexChatEvent::ArtifactStart { .. } => "artifact_start",
                CortexChatEvent::ArtifactDelta { .. } => "artifact_delta",
                CortexChatEvent::ArtifactDone { .. } => "artifact_done",
            };
            if let Ok(json) = serde_json::to_string(&event) {
                yield Ok(axum::response::sse::Event::default()
                    .event(event_name)
                    .data(json));
            }
        }
    };

    Ok(Sse::new(stream))
}

#[derive(Deserialize)]
pub(super) struct CortexChatSpawnWorkerRequest {
    agent_id: String,
    thread_id: String,
    task: String,
    #[serde(default)]
    skill: Option<String>,
}

#[derive(Serialize)]
pub(super) struct CortexChatSpawnWorkerResponse {
    worker_id: String,
    task: String,
}

/// Spawn a background worker from cortex chat.
///
/// Returns immediately with the worker ID. The worker runs asynchronously and,
/// when complete, will auto-inject its result into the thread and trigger a
/// cortex synthesis response.
pub(super) async fn cortex_chat_spawn_worker(
    State(state): State<Arc<ApiState>>,
    axum::Json(request): axum::Json<CortexChatSpawnWorkerRequest>,
) -> Result<Json<CortexChatSpawnWorkerResponse>, StatusCode> {
    let sessions = state.cortex_chat_sessions.load();
    let session = sessions
        .get(&request.agent_id)
        .cloned()
        .ok_or(StatusCode::NOT_FOUND)?;

    let skill = request.skill.as_deref();
    let worker_id = session
        .spawn_cortex_worker(&request.thread_id, &request.task, skill)
        .await
        .map_err(|error| {
            tracing::warn!(%error, agent_id = %request.agent_id, "failed to spawn cortex worker");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(CortexChatSpawnWorkerResponse {
        worker_id: worker_id.to_string(),
        task: request.task,
    }))
}

// --- Chat file upload ---

const MAX_FILE_BYTES: usize = 10 * 1024 * 1024; // 10 MB
const ALLOWED_IMAGE_MIME_TYPES: &[&str] = &["image/png", "image/jpeg", "image/gif", "image/webp"];

#[derive(Deserialize)]
pub(super) struct ChatUploadQuery {
    agent_id: String,
}

#[derive(Serialize)]
pub(super) struct ChatUploadItem {
    id: String,
    filename: String,
    mime_type: String,
    /// Absolute path on disk — sent back to the client for use in `send`.
    path: String,
    size_bytes: usize,
}

#[derive(Serialize)]
pub(super) struct ChatUploadResponse {
    attachments: Vec<ChatUploadItem>,
}

/// Upload image attachments for cortex chat.
///
/// Files are stored under `{workspace}/cortex-uploads/` and the response
/// includes both the absolute path (for the LLM) and a preview URL.
pub(super) async fn upload_chat_files(
    State(state): State<Arc<ApiState>>,
    Query(query): Query<ChatUploadQuery>,
    mut multipart: Multipart,
) -> Result<Json<ChatUploadResponse>, StatusCode> {
    let workspaces = state.agent_workspaces.load();
    let workspace = workspaces
        .get(&query.agent_id)
        .ok_or(StatusCode::NOT_FOUND)?;
    let upload_dir = workspace.join("cortex-uploads");

    tokio::fs::create_dir_all(&upload_dir)
        .await
        .map_err(|error| {
            tracing::warn!(%error, "failed to create cortex-uploads directory");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let mut attachments = Vec::new();

    while let Ok(Some(field)) = multipart.next_field().await {
        let content_type = field
            .content_type()
            .map(|ct| ct.to_string())
            .unwrap_or_default();

        // Validate MIME type
        if !is_allowed_cortex_image_mime_type(&content_type) {
            tracing::warn!(content_type = %content_type, "rejected upload with disallowed MIME type");
            return Err(StatusCode::UNSUPPORTED_MEDIA_TYPE);
        }

        let original_name = field
            .file_name()
            .map(|n| n.to_string())
            .unwrap_or_else(|| format!("upload.{}", mime_to_ext(&content_type)));

        let data = field.bytes().await.map_err(|error| {
            tracing::warn!(%error, "failed to read upload field bytes");
            StatusCode::BAD_REQUEST
        })?;

        if data.is_empty() {
            continue;
        }

        if data.len() > MAX_FILE_BYTES {
            tracing::warn!(bytes = data.len(), "rejected upload exceeding size limit");
            return Err(StatusCode::PAYLOAD_TOO_LARGE);
        }

        // Strip directory traversal, prefix with UUID to avoid collisions
        let safe_name = Path::new(&original_name)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("upload.bin");
        let id = uuid::Uuid::new_v4().to_string();
        let stored_name = format!("{}-{}", &id[..8], safe_name);
        let target = upload_dir.join(&stored_name);

        tokio::fs::write(&target, &data).await.map_err(|error| {
            tracing::warn!(%error, path = %target.display(), "failed to write chat upload");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        let abs_path = target.to_string_lossy().to_string();
        let size_bytes = data.len();

        tracing::info!(
            agent_id = %query.agent_id,
            filename = %safe_name,
            bytes = size_bytes,
            "cortex chat image uploaded"
        );

        attachments.push(ChatUploadItem {
            id,
            filename: safe_name.to_string(),
            mime_type: content_type,
            path: abs_path,
            size_bytes,
        });
    }

    Ok(Json(ChatUploadResponse { attachments }))
}

fn is_allowed_cortex_image_mime_type(mime_type: &str) -> bool {
    ALLOWED_IMAGE_MIME_TYPES.contains(&mime_type)
}

async fn validate_cortex_send_attachments(
    upload_dir: &Path,
    attachments: Vec<ChatAttachment>,
) -> Result<Vec<ChatAttachment>, StatusCode> {
    if attachments.is_empty() {
        return Ok(attachments);
    }

    let canonical_upload_dir = tokio::fs::canonicalize(upload_dir)
        .await
        .map_err(|error| {
            tracing::warn!(%error, path = %upload_dir.display(), "cortex upload directory is not available");
            StatusCode::BAD_REQUEST
        })?;

    let mut validated = Vec::with_capacity(attachments.len());
    for mut attachment in attachments {
        if !is_allowed_cortex_image_mime_type(&attachment.mime_type) {
            tracing::warn!(mime_type = %attachment.mime_type, "rejected send attachment with disallowed MIME type");
            return Err(StatusCode::UNSUPPORTED_MEDIA_TYPE);
        }

        let canonical_path = tokio::fs::canonicalize(&attachment.path)
            .await
            .map_err(|error| {
                tracing::warn!(%error, path = %attachment.path, "failed to canonicalize cortex attachment path");
                StatusCode::BAD_REQUEST
            })?;

        if !canonical_path.starts_with(&canonical_upload_dir) {
            tracing::warn!(
                path = %canonical_path.display(),
                upload_dir = %canonical_upload_dir.display(),
                "rejected cortex attachment outside upload directory"
            );
            return Err(StatusCode::FORBIDDEN);
        }

        let metadata = tokio::fs::metadata(&canonical_path)
            .await
            .map_err(|error| {
                tracing::warn!(%error, path = %canonical_path.display(), "failed to stat cortex attachment");
                StatusCode::BAD_REQUEST
            })?;

        if !metadata.is_file() {
            tracing::warn!(path = %canonical_path.display(), "rejected cortex attachment because path is not a file");
            return Err(StatusCode::BAD_REQUEST);
        }

        if metadata.len() > MAX_FILE_BYTES as u64 {
            tracing::warn!(bytes = metadata.len(), path = %canonical_path.display(), "rejected cortex attachment exceeding size limit");
            return Err(StatusCode::PAYLOAD_TOO_LARGE);
        }

        attachment.path = canonical_path.to_string_lossy().to_string();
        validated.push(attachment);
    }

    Ok(validated)
}

fn mime_to_ext(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "bin",
    }
}

/// List cortex events for an agent with optional type filter, newest first.
pub(super) async fn cortex_events(
    State(state): State<Arc<ApiState>>,
    Query(query): Query<CortexEventsQuery>,
) -> Result<Json<CortexEventsResponse>, StatusCode> {
    let pools = state.agent_pools.load();
    let pool = pools.get(&query.agent_id).ok_or(StatusCode::NOT_FOUND)?;
    let logger = CortexLogger::new(pool.clone());

    let limit = query.limit.min(200);
    let event_type_ref = query.event_type.as_deref();

    let events = logger
        .load_events(limit, query.offset, event_type_ref)
        .await
        .map_err(|error| {
            tracing::warn!(%error, agent_id = %query.agent_id, "failed to load cortex events");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let total = logger.count_events(event_type_ref).await.map_err(|error| {
        tracing::warn!(%error, agent_id = %query.agent_id, "failed to count cortex events");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(CortexEventsResponse { events, total }))
}
