use super::state::ApiState;
use crate::conversation::ConversationLogger;
use crate::messaging::webchat::WebChatEvent;
use crate::{InboundMessage, MessageContent};

use axum::Json;
use axum::extract::{Multipart, Query, State};
use axum::http::StatusCode;
use axum::response::Sse;
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::convert::Infallible;
use std::path::Path;
use std::sync::Arc;

#[derive(Deserialize)]
pub(super) struct WebChatSendRequest {
    agent_id: String,
    session_id: String,
    #[serde(default = "default_sender_name")]
    sender_name: String,
    message: String,
    #[serde(default)]
    attachments: Vec<WebChatSendAttachment>,
}

#[derive(Clone, Deserialize)]
pub(super) struct WebChatSendAttachment {
    filename: String,
    mime_type: String,
    path: String,
}

#[derive(Deserialize)]
pub(super) struct WebChatUploadQuery {
    agent_id: String,
}

#[derive(Serialize)]
pub(super) struct WebChatUploadItem {
    id: String,
    filename: String,
    mime_type: String,
    path: String,
    size_bytes: usize,
}

#[derive(Serialize)]
pub(super) struct WebChatUploadResponse {
    attachments: Vec<WebChatUploadItem>,
}

fn default_sender_name() -> String {
    "user".into()
}

const MAX_WEBCHAT_FILE_BYTES: usize = 10 * 1024 * 1024; // 10 MB
const ALLOWED_WEBCHAT_IMAGE_MIME_TYPES: &[&str] =
    &["image/png", "image/jpeg", "image/gif", "image/webp"];

pub(super) async fn webchat_send(
    State(state): State<Arc<ApiState>>,
    axum::Json(request): axum::Json<WebChatSendRequest>,
) -> Result<Sse<impl Stream<Item = Result<axum::response::sse::Event, Infallible>>>, StatusCode> {
    // ArcSwap<Option<Arc<...>>> → load guard → &Option → &Arc → clone
    let webchat = state
        .webchat_adapter
        .load()
        .as_ref()
        .as_ref()
        .cloned()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let manager = state
        .messaging_manager
        .read()
        .await
        .clone()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if request.message.trim().is_empty() && request.attachments.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let workspaces = state.agent_workspaces.load();
    let workspace = workspaces
        .get(&request.agent_id)
        .ok_or(StatusCode::NOT_FOUND)?;
    let upload_dir = workspace.join("webchat-uploads");
    let resolved_attachments =
        resolve_webchat_send_attachments(&upload_dir, request.attachments).await?;

    let content = if resolved_attachments.is_empty() {
        MessageContent::Text(request.message.clone())
    } else {
        let text = if request.message.trim().is_empty() {
            let joined_names = resolved_attachments
                .iter()
                .map(|attachment| attachment.filename.clone())
                .collect::<Vec<_>>()
                .join(", ");
            Some(format!("Uploaded attachment(s): {joined_names}"))
        } else {
            Some(request.message.clone())
        };

        MessageContent::Media {
            text,
            attachments: resolved_attachments,
        }
    };

    let conversation_id = request.session_id.clone();

    let mut event_rx = webchat.register_session(&conversation_id).await;

    let mut metadata = HashMap::new();
    metadata.insert(
        "display_name".into(),
        serde_json::Value::String(request.sender_name.clone()),
    );

    let inbound = InboundMessage {
        id: uuid::Uuid::new_v4().to_string(),
        source: "webchat".into(),
        conversation_id: conversation_id.clone(),
        sender_id: request.sender_name.clone(),
        agent_id: Some(request.agent_id.into()),
        content,
        timestamp: chrono::Utc::now(),
        metadata,
        formatted_author: Some(request.sender_name),
    };

    manager.inject_message(inbound).await.map_err(|error| {
        tracing::warn!(%error, "failed to inject webchat message");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let webchat_for_cleanup = webchat.clone();
    let cleanup_id = conversation_id.clone();

    let stream = async_stream::stream! {
        while let Some(event) = event_rx.recv().await {
            let event_name = match &event {
                WebChatEvent::Thinking => "thinking",
                WebChatEvent::Text(_) => "text",
                WebChatEvent::StreamStart => "stream_start",
                WebChatEvent::StreamChunk(_) => "stream_chunk",
                WebChatEvent::StreamEnd => "stream_end",
                WebChatEvent::ToolStarted { .. } => "tool_started",
                WebChatEvent::ToolCompleted { .. } => "tool_completed",
                WebChatEvent::StopTyping => "stop_typing",
                WebChatEvent::Done => "done",
            };

            let is_done = matches!(event, WebChatEvent::Done);

            if let Ok(json) = serde_json::to_string(&event) {
                yield Ok(axum::response::sse::Event::default()
                    .event(event_name)
                    .data(json));
            }

            if is_done {
                break;
            }
        }

        webchat_for_cleanup.unregister_session(&cleanup_id).await;
    };

    Ok(Sse::new(stream))
}

pub(super) async fn webchat_upload(
    State(state): State<Arc<ApiState>>,
    Query(query): Query<WebChatUploadQuery>,
    mut multipart: Multipart,
) -> Result<Json<WebChatUploadResponse>, StatusCode> {
    let workspaces = state.agent_workspaces.load();
    let workspace = workspaces
        .get(&query.agent_id)
        .ok_or(StatusCode::NOT_FOUND)?;
    let upload_dir = workspace.join("webchat-uploads");

    tokio::fs::create_dir_all(&upload_dir)
        .await
        .map_err(|error| {
            tracing::warn!(%error, path = %upload_dir.display(), "failed to create webchat upload directory");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let mut attachments = Vec::new();
    while let Ok(Some(field)) = multipart.next_field().await {
        let mime_type = field
            .content_type()
            .map(|value| value.to_string())
            .unwrap_or_default();

        if !is_allowed_webchat_upload_mime_type(&mime_type) {
            tracing::warn!(mime_type = %mime_type, "rejected webchat upload with disallowed MIME type");
            return Err(StatusCode::UNSUPPORTED_MEDIA_TYPE);
        }

        let original_name = field
            .file_name()
            .map(|name| name.to_string())
            .unwrap_or_else(|| "upload.bin".to_string());

        let data = field.bytes().await.map_err(|error| {
            tracing::warn!(%error, "failed to read webchat upload bytes");
            StatusCode::BAD_REQUEST
        })?;

        if data.is_empty() {
            continue;
        }

        if data.len() > MAX_WEBCHAT_FILE_BYTES {
            tracing::warn!(
                bytes = data.len(),
                "rejected webchat upload exceeding size limit"
            );
            return Err(StatusCode::PAYLOAD_TOO_LARGE);
        }

        let safe_name = Path::new(&original_name)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("upload.bin");

        let id = uuid::Uuid::new_v4().to_string();
        let stored_name = format!("{}-{}", &id[..8], safe_name);
        let target = upload_dir.join(&stored_name);

        tokio::fs::write(&target, &data).await.map_err(|error| {
            tracing::warn!(%error, path = %target.display(), "failed to write webchat upload");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        attachments.push(WebChatUploadItem {
            id,
            filename: safe_name.to_string(),
            mime_type,
            path: target.to_string_lossy().to_string(),
            size_bytes: data.len(),
        });
    }

    Ok(Json(WebChatUploadResponse { attachments }))
}

#[derive(Deserialize)]
pub(super) struct WebChatHistoryQuery {
    agent_id: String,
    session_id: String,
    #[serde(default = "default_limit")]
    limit: i64,
}

fn default_limit() -> i64 {
    100
}

#[derive(Serialize)]
pub(super) struct WebChatHistoryMessage {
    id: String,
    role: String,
    content: String,
}

pub(super) async fn webchat_history(
    State(state): State<Arc<ApiState>>,
    Query(query): Query<WebChatHistoryQuery>,
) -> Result<Json<Vec<WebChatHistoryMessage>>, StatusCode> {
    let pools = state.agent_pools.load();
    let pool = pools.get(&query.agent_id).ok_or(StatusCode::NOT_FOUND)?;
    let logger = ConversationLogger::new(pool.clone());

    let channel_id: crate::ChannelId = Arc::from(query.session_id.as_str());

    let messages = logger
        .load_recent(&channel_id, query.limit.min(200))
        .await
        .map_err(|error| {
            tracing::warn!(%error, "failed to load webchat history");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let result: Vec<WebChatHistoryMessage> = messages
        .into_iter()
        .map(|m| WebChatHistoryMessage {
            id: m.id,
            role: m.role,
            content: m.content,
        })
        .collect();

    Ok(Json(result))
}

fn is_allowed_webchat_upload_mime_type(mime_type: &str) -> bool {
    if ALLOWED_WEBCHAT_IMAGE_MIME_TYPES.contains(&mime_type) {
        return true;
    }

    if mime_type.starts_with("text/") {
        return true;
    }

    matches!(
        mime_type,
        "application/json"
            | "application/xml"
            | "application/javascript"
            | "application/typescript"
            | "application/toml"
            | "application/yaml"
            | "application/pdf"
            | "audio/mpeg"
            | "audio/wav"
            | "audio/ogg"
            | "audio/webm"
    )
}

async fn resolve_webchat_send_attachments(
    upload_dir: &Path,
    attachments: Vec<WebChatSendAttachment>,
) -> Result<Vec<crate::Attachment>, StatusCode> {
    if attachments.is_empty() {
        return Ok(Vec::new());
    }

    let canonical_upload_dir = tokio::fs::canonicalize(upload_dir)
        .await
        .map_err(|error| {
            tracing::warn!(%error, path = %upload_dir.display(), "webchat upload directory is not available");
            StatusCode::BAD_REQUEST
        })?;

    let mut resolved = Vec::with_capacity(attachments.len());
    for attachment in attachments {
        if !is_allowed_webchat_upload_mime_type(&attachment.mime_type) {
            tracing::warn!(mime_type = %attachment.mime_type, "rejected webchat send attachment with disallowed MIME type");
            return Err(StatusCode::UNSUPPORTED_MEDIA_TYPE);
        }

        let canonical_path = tokio::fs::canonicalize(&attachment.path)
            .await
            .map_err(|error| {
                tracing::warn!(%error, path = %attachment.path, "failed to canonicalize webchat attachment");
                StatusCode::BAD_REQUEST
            })?;

        if !canonical_path.starts_with(&canonical_upload_dir) {
            tracing::warn!(
                path = %canonical_path.display(),
                upload_dir = %canonical_upload_dir.display(),
                "rejected webchat attachment outside upload directory"
            );
            return Err(StatusCode::FORBIDDEN);
        }

        let metadata = tokio::fs::metadata(&canonical_path)
            .await
            .map_err(|error| {
                tracing::warn!(%error, path = %canonical_path.display(), "failed to stat webchat attachment");
                StatusCode::BAD_REQUEST
            })?;

        if !metadata.is_file() {
            tracing::warn!(path = %canonical_path.display(), "rejected webchat attachment because path is not a file");
            return Err(StatusCode::BAD_REQUEST);
        }

        if metadata.len() > MAX_WEBCHAT_FILE_BYTES as u64 {
            tracing::warn!(bytes = metadata.len(), path = %canonical_path.display(), "rejected webchat attachment exceeding size limit");
            return Err(StatusCode::PAYLOAD_TOO_LARGE);
        }

        let canonical_path_text = canonical_path.to_string_lossy().to_string();
        let filename = if attachment.filename.trim().is_empty() {
            canonical_path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("upload.bin")
                .to_string()
        } else {
            attachment.filename
        };

        resolved.push(crate::Attachment {
            filename,
            mime_type: attachment.mime_type,
            url: encode_local_attachment_url(&canonical_path_text),
            size_bytes: Some(metadata.len()),
        });
    }

    Ok(resolved)
}

fn encode_local_attachment_url(path: &str) -> String {
    use base64::Engine as _;
    let encoded_path = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(path.as_bytes());
    format!("spacebot-file://{encoded_path}")
}
