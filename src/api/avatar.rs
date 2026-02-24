//! Avatar serving and upload for agents.
//!
//! GET  /api/agents/avatar?agent_id=<id>
//!   - Returns the uploaded avatar image if avatar_path is set, otherwise 404.
//!
//! POST /api/agents/avatar?agent_id=<id>   (multipart/form-data, field "avatar")
//!   - Accepts an image upload, writes it to <data_dir>/avatar.<ext>, and
//!     stores the absolute path in agent_profile.avatar_path.
//!   - Returns { "success": true }.

use super::state::ApiState;

use axum::Json;
use axum::extract::{Query, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use std::path::Path;
use std::sync::Arc;

#[derive(Deserialize)]
pub(super) struct AvatarQuery {
    agent_id: String,
}

const ALLOWED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp"];

/// GET /api/agents/avatar?agent_id=<id>
///
/// Serves the agent's uploaded avatar image. Returns 404 if no avatar_path is
/// stored in the profile yet (frontend falls back to the gradient SVG).
pub(super) async fn get_avatar(
    State(state): State<Arc<ApiState>>,
    Query(query): Query<AvatarQuery>,
) -> Response {
    let pools = state.agent_pools.load();
    let Some(pool) = pools.get(&query.agent_id).cloned() else {
        return (StatusCode::NOT_FOUND, "agent not found").into_response();
    };

    let avatar_path: Option<String> = sqlx::query_scalar(
        "SELECT avatar_path FROM agent_profile WHERE agent_id = ?",
    )
    .bind(&query.agent_id)
    .fetch_optional(&pool)
    .await
    .ok()
    .flatten()
    .flatten();

    let path_str = if let Some(path) = avatar_path {
        path
    } else {
        // Fallback: Check for manual placement in <instance_dir>/agents/<agent_id>/data/avatar.{ext}
        // or <instance_dir>/agents/<agent_id>/workspace/avatar.{ext}
        let instance_dir = (**state.instance_dir.load()).clone();
        let agent_dir = instance_dir.join("agents").join(&query.agent_id);
        let data_dir = agent_dir.join("data");
        let workspace_dir = agent_dir.join("workspace");

        let mut found_path = None;
        for dir in &[data_dir, workspace_dir] {
            for ext in ALLOWED_EXTENSIONS {
                let p = dir.join(format!("avatar.{}", ext));
                if p.exists() {
                    found_path = Some(p.to_string_lossy().to_string());
                    break;
                }
            }
            if found_path.is_some() { break; }
        }

        match found_path {
            Some(p) => p,
            None => return (StatusCode::NOT_FOUND, "no avatar set").into_response(),
        }
    };

    let path = Path::new(&path_str);

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase());
    let ext_str = ext.as_deref().unwrap_or("");
    if !ALLOWED_EXTENSIONS.contains(&ext_str) {
        return (StatusCode::FORBIDDEN, "file type not permitted").into_response();
    }

    // Canonicalise to prevent path traversal.
    let canonical = match path.canonicalize() {
        Ok(c) => c,
        Err(_) => return (StatusCode::NOT_FOUND, "avatar file not found").into_response(),
    };

    // Security: must live under <instance_dir>/agents/.
    let instance_dir = (**state.instance_dir.load()).clone();
    let agents_dir = instance_dir.join("agents");
    if !canonical.starts_with(&agents_dir) {
        return (StatusCode::FORBIDDEN, "path outside permitted directory").into_response();
    }

    match tokio::fs::read(&canonical).await {
        Ok(bytes) => {
            let mime = match ext_str {
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "gif" => "image/gif",
                "webp" => "image/webp",
                _ => "application/octet-stream",
            };
            (
                StatusCode::OK,
                [
                    (header::CONTENT_TYPE, mime),
                    // Short cache; frontend uses ?t=<timestamp> to bust after upload.
                    (header::CACHE_CONTROL, "public, max-age=60"),
                ],
                bytes,
            )
                .into_response()
        }
        Err(_) => (StatusCode::NOT_FOUND, "avatar file not found").into_response(),
    }
}

/// POST /api/agents/avatar?agent_id=<id>   (multipart/form-data, field "avatar")
///
/// Accepts a single image file, writes it to <data_dir>/avatar.<ext>, and
/// updates the avatar_path column in agent_profile. Re-uploading overwrites
/// the previous file (fixed filename). Returns { "success": true }.
pub(super) async fn upload_avatar(
    State(state): State<Arc<ApiState>>,
    Query(query): Query<AvatarQuery>,
    mut multipart: axum::extract::Multipart,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let pools = state.agent_pools.load();
    let pool = pools
        .get(&query.agent_id)
        .cloned()
        .ok_or(StatusCode::NOT_FOUND)?;

    // data_dir convention: <instance_dir>/agents/<agent_id>/data
    let instance_dir = (**state.instance_dir.load()).clone();
    let data_dir = instance_dir
        .join("agents")
        .join(&query.agent_id)
        .join("data");

    tokio::fs::create_dir_all(&data_dir)
        .await
        .map_err(|error| {
            tracing::warn!(%error, "failed to ensure avatar data_dir");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let mut file_bytes: Option<(Vec<u8>, String)> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let field_name = field.name().unwrap_or("").to_string();
        // Accept any field if we have none yet, prefer "avatar".
        if field_name != "avatar" && file_bytes.is_some() {
            continue;
        }

        let original_name = field.file_name().unwrap_or("avatar.png").to_string();
        let ext = Path::new(&original_name)
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_else(|| "png".to_string());

        if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
            return Ok(Json(serde_json::json!({
                "success": false,
                "message": format!("file type not permitted: {}", ext)
            })));
        }

        let data = field.bytes().await.map_err(|error| {
            tracing::warn!(%error, "failed to read avatar upload bytes");
            StatusCode::BAD_REQUEST
        })?;

        if !data.is_empty() {
            file_bytes = Some((data.to_vec(), ext));
        }
    }

    let (bytes, ext) = file_bytes.ok_or_else(|| {
        tracing::warn!("avatar upload received no file data");
        StatusCode::BAD_REQUEST
    })?;

    // Fixed filename: re-uploading overwrites the previous avatar.
    let avatar_path = data_dir.join(format!("avatar.{}", ext));

    tokio::fs::write(&avatar_path, &bytes)
        .await
        .map_err(|error| {
            tracing::warn!(%error, path = %avatar_path.display(), "failed to write avatar file");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let avatar_path_str = avatar_path.to_string_lossy().to_string();

    sqlx::query(
        "INSERT INTO agent_profile \
             (agent_id, avatar_path, generated_at, updated_at) \
         VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) \
         ON CONFLICT(agent_id) DO UPDATE SET \
             avatar_path = excluded.avatar_path, \
             updated_at  = CURRENT_TIMESTAMP",
    )
    .bind(&query.agent_id)
    .bind(&avatar_path_str)
    .execute(&pool)
    .await
    .map_err(|error| {
        tracing::warn!(
            %error,
            agent_id = %query.agent_id,
            "failed to update avatar_path in agent_profile"
        );
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    tracing::info!(
        agent_id = %query.agent_id,
        path = %avatar_path_str,
        bytes = bytes.len(),
        "avatar uploaded"
    );

    Ok(Json(serde_json::json!({ "success": true })))
}
