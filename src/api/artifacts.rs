use super::state::ApiState;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

// ---------------------------------------------------------------------------
// Query / request / response types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(super) struct ArtifactsQuery {
    agent_id: String,
    #[serde(default)]
    channel_id: Option<String>,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default = "default_limit")]
    limit: i64,
    #[serde(default)]
    offset: i64,
}

fn default_limit() -> i64 {
    50
}

#[derive(Deserialize)]
pub(super) struct ArtifactIdQuery {
    agent_id: String,
}

#[derive(Deserialize)]
pub(super) struct CreateArtifactRequest {
    agent_id: String,
    #[serde(default)]
    channel_id: Option<String>,
    /// If omitted the kind is inferred from `content` via `detect_artifact_kind`.
    #[serde(default)]
    kind: Option<String>,
    title: String,
    content: String,
    #[serde(default)]
    metadata: Option<serde_json::Value>,
}

#[derive(Deserialize)]
pub(super) struct UpdateArtifactRequest {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    metadata: Option<serde_json::Value>,
    #[serde(default)]
    title: Option<String>,
}

#[derive(Serialize, Clone)]
pub(super) struct ArtifactInfo {
    id: String,
    channel_id: Option<String>,
    kind: String,
    title: String,
    content: String,
    metadata: Option<serde_json::Value>,
    version: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize)]
pub(super) struct ArtifactsResponse {
    artifacts: Vec<ArtifactInfo>,
    total: i64,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /agents/artifacts?agent_id=&channel_id=&kind=&limit=&offset=
pub(super) async fn list_artifacts(
    State(state): State<Arc<ApiState>>,
    Query(query): Query<ArtifactsQuery>,
) -> Result<Json<ArtifactsResponse>, StatusCode> {
    let pools = state.agent_pools.load();
    let pool = pools.get(&query.agent_id).ok_or(StatusCode::NOT_FOUND)?;

    // Build dynamic WHERE clauses
    let mut conditions: Vec<String> = Vec::new();
    if query.channel_id.is_some() {
        conditions.push("channel_id = ?".to_string());
    }
    if query.kind.is_some() {
        conditions.push("kind = ?".to_string());
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let count_sql = format!("SELECT COUNT(*) FROM artifacts {where_clause}");
    let select_sql = format!(
        "SELECT id, channel_id, kind, title, content, metadata, version, created_at, updated_at \
         FROM artifacts {where_clause} ORDER BY created_at DESC LIMIT ? OFFSET ?"
    );

    // Bind parameters dynamically
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    let mut select_query = sqlx::query_as::<_, (
        String,
        Option<String>,
        String,
        String,
        String,
        Option<String>,
        i64,
        String,
        String,
    )>(&select_sql);

    if let Some(ref channel_id) = query.channel_id {
        count_query = count_query.bind(channel_id);
        select_query = select_query.bind(channel_id);
    }
    if let Some(ref kind) = query.kind {
        count_query = count_query.bind(kind);
        select_query = select_query.bind(kind);
    }

    select_query = select_query.bind(query.limit).bind(query.offset);

    let total = count_query.fetch_one(pool).await.unwrap_or(0);

    let rows = select_query.fetch_all(pool).await.unwrap_or_default();

    let artifacts = rows
        .into_iter()
        .map(
            |(id, channel_id, kind, title, content, metadata, version, created_at, updated_at)| {
                ArtifactInfo {
                    id,
                    channel_id,
                    kind,
                    title,
                    content,
                    metadata: metadata.and_then(|m| serde_json::from_str(&m).ok()),
                    version,
                    created_at,
                    updated_at,
                }
            },
        )
        .collect();

    Ok(Json(ArtifactsResponse { artifacts, total }))
}

/// GET /agents/artifacts/:id?agent_id=
pub(super) async fn get_artifact(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Query(query): Query<ArtifactIdQuery>,
) -> Result<Json<ArtifactInfo>, StatusCode> {
    let pools = state.agent_pools.load();
    let pool = pools.get(&query.agent_id).ok_or(StatusCode::NOT_FOUND)?;

    let row = sqlx::query_as::<_, (
        String,
        Option<String>,
        String,
        String,
        String,
        Option<String>,
        i64,
        String,
        String,
    )>(
        "SELECT id, channel_id, kind, title, content, metadata, version, created_at, updated_at \
         FROM artifacts WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let (id, channel_id, kind, title, content, metadata, version, created_at, updated_at) = row;

    Ok(Json(ArtifactInfo {
        id,
        channel_id,
        kind,
        title,
        content,
        metadata: metadata.and_then(|m| serde_json::from_str(&m).ok()),
        version,
        created_at,
        updated_at,
    }))
}

/// POST /agents/artifacts
pub(super) async fn create_artifact(
    State(state): State<Arc<ApiState>>,
    Json(body): Json<CreateArtifactRequest>,
) -> Result<(StatusCode, Json<ArtifactInfo>), StatusCode> {
    let pools = state.agent_pools.load();
    let pool = pools.get(&body.agent_id).ok_or(StatusCode::NOT_FOUND)?;

    let kind = body
        .kind
        .as_deref()
        .or_else(|| detect_artifact_kind(&body.content))
        .unwrap_or("text")
        .to_string();

    let id = uuid::Uuid::new_v4().to_string();
    let metadata_json = body.metadata.as_ref().map(|m| m.to_string());
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    sqlx::query(
        "INSERT INTO artifacts (id, channel_id, kind, title, content, metadata, version, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
    )
    .bind(&id)
    .bind(&body.channel_id)
    .bind(&kind)
    .bind(&body.title)
    .bind(&body.content)
    .bind(&metadata_json)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((
        StatusCode::CREATED,
        Json(ArtifactInfo {
            id,
            channel_id: body.channel_id,
            kind,
            title: body.title,
            content: body.content,
            metadata: body.metadata,
            version: 1,
            created_at: now.clone(),
            updated_at: now,
        }),
    ))
}

/// PUT /agents/artifacts/:id?agent_id=
pub(super) async fn update_artifact(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Query(query): Query<ArtifactIdQuery>,
    Json(body): Json<UpdateArtifactRequest>,
) -> Result<Json<ArtifactInfo>, StatusCode> {
    let pools = state.agent_pools.load();
    let pool = pools.get(&query.agent_id).ok_or(StatusCode::NOT_FOUND)?;

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let metadata_json = body.metadata.as_ref().map(|m| m.to_string());

    // All three fields are optional; COALESCE preserves the existing value when NULL is passed.
    sqlx::query(
        "UPDATE artifacts \
         SET content = COALESCE(?, content), \
             metadata = COALESCE(?, metadata), \
             title = COALESCE(?, title), \
             version = version + 1, \
             updated_at = ? \
         WHERE id = ?",
    )
    .bind(&body.content)
    .bind(&metadata_json)
    .bind(&body.title)
    .bind(&now)
    .bind(&id)
    .execute(pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Fetch the updated row to return
    get_artifact(State(state), Path(id), Query(query)).await
}

/// DELETE /agents/artifacts/:id?agent_id=
pub(super) async fn delete_artifact(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Query(query): Query<ArtifactIdQuery>,
) -> Result<StatusCode, StatusCode> {
    let pools = state.agent_pools.load();
    let pool = pools.get(&query.agent_id).ok_or(StatusCode::NOT_FOUND)?;

    let result = sqlx::query("DELETE FROM artifacts WHERE id = ?")
        .bind(&id)
        .execute(pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Auto-detection helper
// ---------------------------------------------------------------------------

/// Heuristic to detect the artifact kind from content.
pub fn detect_artifact_kind(content: &str) -> Option<&'static str> {
    let trimmed = content.trim();

    // Code: starts with a fenced code block with a language tag
    if trimmed.starts_with("```") {
        let after_backticks = &trimmed[3..];
        if let Some(first_char) = after_backticks.chars().next() {
            if first_char.is_alphanumeric() {
                return Some("code");
            }
        }
    }

    // Image: base64 data URI
    if trimmed.starts_with("data:image/") {
        return Some("image");
    }

    // Sheet: multiple lines with commas (CSV-like)
    let lines: Vec<&str> = trimmed.lines().collect();
    if lines.len() >= 2 && lines.iter().all(|l| l.contains(',')) {
        return Some("sheet");
    }

    // Text: long prose (more than 100 characters)
    if trimmed.len() > 100 {
        return Some("text");
    }

    None
}
