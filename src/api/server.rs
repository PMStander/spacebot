//! HTTP server setup: router, static file serving, and API routes.

use axum::extract::State;
use axum::http::{header, StatusCode, Uri};
use axum::response::{Html, IntoResponse, Json, Response};
use axum::routing::get;
use axum::Router;
use rust_embed::Embed;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

use super::state::ApiState;

/// Embedded frontend assets from the Vite build output.
/// When `interface/dist/` doesn't exist at compile time, this is empty
/// and the server operates in API-only mode.
#[derive(Embed)]
#[folder = "interface/dist/"]
#[allow(unused)]
struct InterfaceAssets;

/// Start the HTTP server on the given address.
///
/// Returns a handle that resolves when the server shuts down. The caller
/// passes a `tokio::sync::watch::Receiver<bool>` for graceful shutdown.
pub async fn start_http_server(
    bind: SocketAddr,
    shutdown_rx: tokio::sync::watch::Receiver<bool>,
) -> anyhow::Result<tokio::task::JoinHandle<()>> {
    let state = Arc::new(ApiState::new());

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api_routes = Router::new()
        .route("/health", get(health))
        .route("/status", get(status));

    let app = Router::new()
        .nest("/api", api_routes)
        .fallback(static_handler)
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(bind).await?;
    tracing::info!(%bind, "HTTP server listening");

    let handle = tokio::spawn(async move {
        let mut shutdown = shutdown_rx;
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown.wait_for(|v| *v).await;
            })
            .await
            .ok();
    });

    Ok(handle)
}

// -- API handlers --

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

async fn status(State(state): State<Arc<ApiState>>) -> Json<serde_json::Value> {
    let uptime = state.started_at.elapsed();
    Json(serde_json::json!({
        "status": "running",
        "pid": std::process::id(),
        "uptime_seconds": uptime.as_secs(),
    }))
}

// -- Static file serving --

async fn static_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');

    // Try the exact path first
    if let Some(content) = InterfaceAssets::get(path) {
        let mime = mime_guess::from_path(path).first_or_octet_stream();
        return (
            StatusCode::OK,
            [(header::CONTENT_TYPE, mime.as_ref())],
            content.data,
        )
            .into_response();
    }

    // SPA fallback: serve index.html for non-API, non-asset routes
    if let Some(content) = InterfaceAssets::get("index.html") {
        return Html(
            std::str::from_utf8(&content.data)
                .unwrap_or("")
                .to_string(),
        )
        .into_response();
    }

    // No frontend assets embedded — API-only mode
    (StatusCode::NOT_FOUND, "not found").into_response()
}
