//! Serves local image files from disk via the `/api/local-file` endpoint.
//!
//! Security model:
//!   1. Path must be absolute.
//!   2. Path must canonicalise to a location under the user's home directory.
//!   3. File extension must be in the image allowlist.
//!
//! This endpoint exists because the Spacebot AI skills (e.g. comic-generator)
//! write generated images to disk. The frontend needs to display them without
//! embedding large base64 blobs in the artifact content JSON.

use axum::extract::Query;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize)]
pub(super) struct LocalFileQuery {
	path: String,
}

const ALLOWED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp"];

/// GET /api/local-file?path=/absolute/path/to/image.png
pub(super) async fn serve_local_file(Query(query): Query<LocalFileQuery>) -> Response {
	let requested = Path::new(&query.path);

	// 1. Must be absolute
	if !requested.is_absolute() {
		return (StatusCode::BAD_REQUEST, "Path must be absolute").into_response();
	}

	// 2. Extension must be in image allowlist (check before canonicalise to
	//    give a clear error even for non-existent files)
	let ext = requested
		.extension()
		.and_then(|e| e.to_str())
		.map(|s| s.to_lowercase());
	let ext_str = ext.as_deref().unwrap_or("");
	if !ALLOWED_EXTENSIONS.contains(&ext_str) {
		return (StatusCode::FORBIDDEN, "File type not permitted").into_response();
	}

	// 3. Canonicalise (resolves symlinks, validates existence)
	let canonical = match requested.canonicalize() {
		Ok(c) => c,
		Err(_) => return (StatusCode::NOT_FOUND, "File not found").into_response(),
	};

	// 4. Must be under the user's home directory
	let home = match dirs::home_dir() {
		Some(h) => h,
		None => {
			return (
				StatusCode::INTERNAL_SERVER_ERROR,
				"Cannot determine home directory",
			)
				.into_response()
		}
	};
	if !canonical.starts_with(&home) {
		return (StatusCode::FORBIDDEN, "Path outside permitted directory").into_response();
	}

	// 5. Read and serve
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
					(header::CACHE_CONTROL, "public, max-age=3600"),
				],
				bytes,
			)
				.into_response()
		}
		Err(_) => (StatusCode::NOT_FOUND, "File not found").into_response(),
	}
}
