//! Cortex chat: persistent admin conversation with the cortex.
//!
//! One session per agent. The admin talks to the cortex interactively,
//! with the full toolset (memory, shell, file, exec, browser, web search).
//! When opened on a channel page, the channel's recent history is injected
//! into the system prompt as context.

use crate::agent::channel::{ChannelState, spawn_worker_from_state};
use crate::conversation::history::ProcessRunLogger;
use crate::llm::SpacebotModel;
use crate::{AgentDeps, ProcessEvent, ProcessType, WorkerId};

use rig::agent::{AgentBuilder, HookAction, PromptHook, ToolCallHookAction};
use rig::completion::{AssistantContent, CompletionModel, CompletionResponse, Message, Prompt};
use rig::message::{ImageMediaType, MimeType, UserContent};
use rig::one_or_many::OneOrMany;
use rig::tool::server::ToolServerHandle;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tokio::sync::mpsc;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

/// A persisted cortex chat message.
#[derive(Debug, Clone, Serialize)]
pub struct CortexChatMessage {
    pub id: String,
    pub thread_id: String,
    pub role: String,
    pub content: String,
    pub channel_context: Option<String>,
    pub created_at: String,
}

/// Tracks an in-flight cortex worker so it can be auto-synthesized on completion.
struct WorkerEntry {
    thread_id: String,
    task: String,
}

/// Events emitted during a cortex chat response (sent via SSE to the client).
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CortexChatEvent {
    /// The cortex is processing (before LLM response).
    Thinking,
    /// A tool call started.
    ToolStarted { tool: String },
    /// A tool call completed.
    ToolCompleted {
        tool: String,
        result_preview: String,
    },
    /// The full response is ready (artifact markup already stripped).
    Done { full_text: String },
    /// An error occurred.
    Error { message: String },
    /// An artifact block started (kind + title).
    ArtifactStart {
        artifact_id: String,
        kind: String,
        title: String,
    },
    /// A chunk of artifact content.
    ArtifactDelta { artifact_id: String, data: String },
    /// Artifact content is complete.
    ArtifactDone { artifact_id: String },
}

/// An image attachment to inject into the LLM context before the user's text.
#[derive(Debug, Clone, Deserialize)]
pub struct ChatAttachment {
    pub filename: String,
    pub mime_type: String,
    /// Absolute path on disk — read and base64-encoded before the LLM call.
    pub path: String,
}

/// Prompt hook that forwards tool events to an mpsc channel for SSE streaming.
#[derive(Clone)]
struct CortexChatHook {
    event_tx: mpsc::Sender<CortexChatEvent>,
}

impl CortexChatHook {
    fn new(event_tx: mpsc::Sender<CortexChatEvent>) -> Self {
        Self { event_tx }
    }

    async fn send(&self, event: CortexChatEvent) {
        let _ = self.event_tx.send(event).await;
    }
}

impl<M: CompletionModel> PromptHook<M> for CortexChatHook {
    async fn on_tool_call(
        &self,
        tool_name: &str,
        _tool_call_id: Option<String>,
        _internal_call_id: &str,
        _args: &str,
    ) -> ToolCallHookAction {
        self.send(CortexChatEvent::ToolStarted {
            tool: tool_name.to_string(),
        })
        .await;
        ToolCallHookAction::Continue
    }

    async fn on_tool_result(
        &self,
        tool_name: &str,
        _tool_call_id: Option<String>,
        _internal_call_id: &str,
        _args: &str,
        result: &str,
    ) -> HookAction {
        let preview = if result.len() > 200 {
            format!("{}...", &result[..200])
        } else {
            result.to_string()
        };
        self.send(CortexChatEvent::ToolCompleted {
            tool: tool_name.to_string(),
            result_preview: preview,
        })
        .await;
        HookAction::Continue
    }

    async fn on_completion_call(&self, _prompt: &Message, _history: &[Message]) -> HookAction {
        HookAction::Continue
    }

    async fn on_completion_response(
        &self,
        _prompt: &Message,
        _response: &CompletionResponse<M::Response>,
    ) -> HookAction {
        HookAction::Continue
    }
}

/// SQLite CRUD for cortex chat messages.
#[derive(Debug, Clone)]
pub struct CortexChatStore {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct ChatMessageRow {
    id: String,
    thread_id: String,
    role: String,
    content: String,
    channel_context: Option<String>,
    created_at: chrono::NaiveDateTime,
}

impl ChatMessageRow {
    fn into_message(self) -> CortexChatMessage {
        CortexChatMessage {
            id: self.id,
            thread_id: self.thread_id,
            role: self.role,
            content: self.content,
            channel_context: self.channel_context,
            created_at: self.created_at.and_utc().to_rfc3339(),
        }
    }
}

impl CortexChatStore {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Load chat history for a thread, newest first, then reverse to chronological order.
    pub async fn load_history(
        &self,
        thread_id: &str,
        limit: i64,
    ) -> Result<Vec<CortexChatMessage>, sqlx::Error> {
        let rows: Vec<ChatMessageRow> = sqlx::query_as(
            "SELECT id, thread_id, role, content, channel_context, created_at \
             FROM cortex_chat_messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT ?",
        )
        .bind(thread_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        let mut messages: Vec<CortexChatMessage> =
            rows.into_iter().map(|row| row.into_message()).collect();
        messages.reverse();
        Ok(messages)
    }

    /// Save a message to a thread. Returns the generated ID.
    pub async fn save_message(
        &self,
        thread_id: &str,
        role: &str,
        content: &str,
        channel_context: Option<&str>,
    ) -> Result<String, sqlx::Error> {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO cortex_chat_messages (id, thread_id, role, content, channel_context) \
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(thread_id)
        .bind(role)
        .bind(content)
        .bind(channel_context)
        .execute(&self.pool)
        .await?;
        Ok(id)
    }

    /// Persist or update an artifact referenced from a cortex response.
    pub async fn save_artifact(
        &self,
        artifact_id: &str,
        channel_id: Option<&str>,
        kind: &str,
        title: &str,
        content: &str,
        metadata: Option<&serde_json::Value>,
    ) -> Result<(), sqlx::Error> {
        let metadata_json = metadata.map(|m| m.to_string());
        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

        sqlx::query(
            "INSERT INTO artifacts (id, channel_id, kind, title, content, metadata, version, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?) \
             ON CONFLICT(id) DO UPDATE SET \
                channel_id = excluded.channel_id, \
                kind = excluded.kind, \
                title = excluded.title, \
                content = excluded.content, \
                metadata = excluded.metadata, \
                version = artifacts.version + 1, \
                updated_at = excluded.updated_at",
        )
        .bind(artifact_id)
        .bind(channel_id)
        .bind(kind)
        .bind(title)
        .bind(content)
        .bind(&metadata_json)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Get the most recent thread_id, or None if no threads exist.
    pub async fn latest_thread_id(&self) -> Result<Option<String>, sqlx::Error> {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT thread_id FROM cortex_chat_messages ORDER BY created_at DESC LIMIT 1",
        )
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| r.0))
    }
}

/// The cortex chat session for a single agent.
///
/// Holds the deps, tool server, store, and a mutex to prevent concurrent sends.
pub struct CortexChatSession {
    pub deps: AgentDeps,
    pub tool_server: ToolServerHandle,
    pub store: CortexChatStore,
    /// Prevent concurrent sends — only one request at a time per agent.
    send_lock: Mutex<()>,
    /// Dedicated channel state for background workers spawned from cortex chat.
    /// None if workers are not enabled for this session.
    worker_channel_state: Option<ChannelState>,
    /// Registry of in-flight workers: worker_id → (thread_id, task).
    worker_registry: Arc<RwLock<HashMap<WorkerId, WorkerEntry>>>,
}

impl CortexChatSession {
    pub fn new(deps: AgentDeps, tool_server: ToolServerHandle, store: CortexChatStore) -> Self {
        Self {
            deps,
            tool_server,
            store,
            send_lock: Mutex::new(()),
            worker_channel_state: None,
            worker_registry: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a session with worker support enabled.
    pub fn new_with_workers(
        deps: AgentDeps,
        tool_server: ToolServerHandle,
        store: CortexChatStore,
        worker_channel_state: ChannelState,
    ) -> Self {
        Self {
            deps,
            tool_server,
            store,
            send_lock: Mutex::new(()),
            worker_channel_state: Some(worker_channel_state),
            worker_registry: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Spawn a background worker attributed to this cortex session.
    ///
    /// Returns the worker ID immediately. When the worker completes,
    /// `start_worker_watcher` will inject the result into the thread and
    /// trigger a cortex synthesis response automatically.
    pub async fn spawn_cortex_worker(
        self: &Arc<Self>,
        thread_id: &str,
        task: &str,
        skill: Option<&str>,
    ) -> anyhow::Result<WorkerId> {
        let worker_state = self
            .worker_channel_state
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("workers not enabled for this cortex session"))?;

        let suggested: Vec<&str> = skill.into_iter().collect();
        let worker_id = spawn_worker_from_state(worker_state, task, false, &suggested)
            .await
            .map_err(|e| anyhow::anyhow!("{e}"))?;

        self.worker_registry.write().await.insert(
            worker_id,
            WorkerEntry {
                thread_id: thread_id.to_string(),
                task: task.to_string(),
            },
        );

        Ok(worker_id)
    }

    /// Start the background watcher that listens for worker completions and
    /// automatically triggers cortex synthesis for each completed worker.
    ///
    /// Should be called once after the session is created. No-op if workers
    /// are not enabled (no worker_channel_state).
    pub fn start_worker_watcher(self: &Arc<Self>) {
        let Some(ref ws) = self.worker_channel_state else {
            return;
        };
        let worker_channel_id = ws.channel_id.clone();
        let session = Arc::clone(self);
        let mut event_rx = self.deps.event_tx.subscribe();

        tokio::spawn(async move {
            loop {
                match event_rx.recv().await {
                    Ok(ProcessEvent::WorkerComplete {
                        worker_id,
                        channel_id,
                        result,
                        ..
                    }) => {
                        if channel_id.as_deref() != Some(worker_channel_id.as_ref()) {
                            continue;
                        }

                        let entry = session.worker_registry.write().await.remove(&worker_id);
                        let Some(entry) = entry else { continue };

                        let synthesis_text =
                            format!("[Worker Result: {}]\n\n{}", entry.task, result);

                        // Fire-and-forget synthesis — response is saved to DB.
                        // The frontend detects completion via the global ApiEvent stream.
                        if let Err(error) = session
                            .send_message_with_events(
                                &entry.thread_id,
                                &synthesis_text,
                                None,
                                vec![],
                            )
                            .await
                        {
                            tracing::warn!(
                                %error, %worker_id,
                                "cortex auto-synthesis failed after worker completion"
                            );
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    _ => {}
                }
            }
        });
    }

    /// Send a message and stream events (tool calls, completion) back via an mpsc channel.
    ///
    /// Returns a receiver that yields `CortexChatEvent` items as the agent works.
    /// The agent runs in a spawned task so the caller can forward events to SSE
    /// without blocking.
    pub async fn send_message_with_events(
        self: &Arc<Self>,
        thread_id: &str,
        user_text: &str,
        channel_context_id: Option<&str>,
        attachments: Vec<ChatAttachment>,
    ) -> Result<mpsc::Receiver<CortexChatEvent>, anyhow::Error> {
        let _guard = self.send_lock.lock().await;

        // Save the user message
        self.store
            .save_message(thread_id, "user", user_text, channel_context_id)
            .await?;

        // Build the system prompt
        let system_prompt = self.build_system_prompt(channel_context_id).await?;

        // Load chat history and convert to Rig messages
        let chat_messages = self.store.load_history(thread_id, 100).await?;
        let mut history: Vec<rig::message::Message> = Vec::new();
        for message in &chat_messages[..chat_messages.len().saturating_sub(1)] {
            match message.role.as_str() {
                "user" => {
                    history.push(rig::message::Message::from(message.content.as_str()));
                }
                "assistant" => {
                    let content = AssistantContent::from(message.content.clone());
                    history.push(rig::message::Message::from(content));
                }
                _ => {}
            }
        }

        // Resolve model and build agent
        let routing = self.deps.runtime_config.routing.load();
        let model_name = routing.resolve(ProcessType::Cortex, None).to_string();
        let model = SpacebotModel::make(&self.deps.llm_manager, &model_name)
            .with_context(&*self.deps.agent_id, "cortex")
            .with_routing((**routing).clone());
        let prompt_engine = self.deps.runtime_config.prompts.load();
        let preamble = prompt_engine
            .inject_runtime_context(&system_prompt, &model_name)
            .expect("failed to inject runtime context into cortex chat prompt");

        let agent = AgentBuilder::new(model)
            .preamble(&preamble)
            .default_max_turns(50)
            .tool_server_handle(self.tool_server.clone())
            .build();

        let (event_tx, event_rx) = mpsc::channel(256);
        let hook = CortexChatHook::new(event_tx.clone());

        // Clone what the spawned task needs
        let user_text = user_text.to_string();
        let thread_id = thread_id.to_string();
        let channel_context_id = channel_context_id.map(|s| s.to_string());
        let store = self.store.clone();

        tokio::spawn(async move {
            let channel_ref = channel_context_id.as_deref();

            // Inject image attachments as a user message before the text prompt,
            // mirroring the channel.rs multimodal pattern.
            if !attachments.is_empty() {
                use base64::Engine as _;
                let mut image_parts: Vec<UserContent> = Vec::new();
                for att in &attachments {
                    match tokio::fs::read(&att.path).await {
                        Ok(bytes) => {
                            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                            let media_type = ImageMediaType::from_mime_type(&att.mime_type);
                            image_parts.push(UserContent::image_base64(b64, media_type, None));
                        }
                        Err(error) => {
                            tracing::warn!(%error, path = %att.path, "failed to read attachment for cortex chat");
                        }
                    }
                }
                if !image_parts.is_empty() {
                    let content = OneOrMany::many(image_parts)
                        .unwrap_or_else(|_| OneOrMany::one(UserContent::text("[attachment]")));
                    history.push(rig::message::Message::User { content });
                }
            }

            let result = agent
                .prompt(&user_text)
                .with_hook(hook)
                .with_history(&mut history)
                .await;

            match result {
                Ok(response) => {
                    // Parse any <artifact> blocks before saving/returning
                    let artifacts = parse_artifact_tags(&response);
                    let display_text = strip_artifact_tags(&response);

                    let _ = store
                        .save_message(&thread_id, "assistant", &display_text, channel_ref)
                        .await;
                    let _ = event_tx.send(CortexChatEvent::Done {
                        full_text: display_text,
                    }).await;

                    // Emit artifact events after Done so the client can open the panel
                    for (artifact_id, kind, title, content) in artifacts {
                        if let Err(error) = store
                            .save_artifact(&artifact_id, channel_ref, &kind, &title, &content, None)
                            .await
                        {
                            tracing::warn!(
                                %error,
                                artifact_id = %artifact_id,
                                "failed to persist cortex artifact"
                            );
                        }

                        let _ = event_tx.send(CortexChatEvent::ArtifactStart {
                            artifact_id: artifact_id.clone(),
                            kind: kind.clone(),
                            title: title.clone(),
                        }).await;
                        let _ = event_tx.send(CortexChatEvent::ArtifactDelta {
                            artifact_id: artifact_id.clone(),
                            data: content,
                        }).await;
                        let _ = event_tx.send(CortexChatEvent::ArtifactDone { artifact_id }).await;
                    }
                }
                Err(error) => {
                    let error_text = format!("Cortex chat error: {error}");
                    let _ = store
                        .save_message(&thread_id, "assistant", &error_text, channel_ref)
                        .await;
                    let _ = event_tx
                        .send(CortexChatEvent::Error {
                            message: error_text,
                        })
                        .await;
                }
            }
        });

        Ok(event_rx)
    }

    async fn build_system_prompt(
        &self,
        channel_context_id: Option<&str>,
    ) -> crate::error::Result<String> {
        let runtime_config = &self.deps.runtime_config;
        let prompt_engine = runtime_config.prompts.load();

        let identity_context = runtime_config.identity.load().render();
        let memory_bulletin = runtime_config.memory_bulletin.load();

        let browser_enabled = runtime_config.browser_config.load().enabled;
        let web_search_enabled = runtime_config.brave_search_key.load().is_some();
        let opencode_enabled = runtime_config.opencode.load().enabled;
        let cli_config = runtime_config.cli_workers.load();
        let cli_workers_enabled = cli_config.enabled && !cli_config.backends.is_empty();
        let cli_backends: Vec<(String, String)> = cli_config
            .backends
            .iter()
            .map(
                |(name, cfg): (&String, &crate::cli_worker::CliBackendConfig)| {
                    (name.clone(), cfg.description.clone())
                },
            )
            .collect();
        let worker_capabilities = prompt_engine
            .render_worker_capabilities(
                browser_enabled,
                web_search_enabled,
                opencode_enabled,
                cli_workers_enabled,
                &cli_backends,
            )?;

        // Load channel transcript if a channel context is active
        let channel_transcript = if let Some(channel_id) = channel_context_id {
            self.load_channel_transcript(channel_id).await
        } else {
            None
        };

        // Render skills so the cortex can execute them directly with its own tools
        let skills = runtime_config.skills.load();
        let skills_rendered = skills.render_cortex_prompt(&prompt_engine);

        let empty_to_none = |s: String| if s.is_empty() { None } else { Some(s) };

        prompt_engine.render_cortex_chat_prompt(
            empty_to_none(identity_context),
            empty_to_none(memory_bulletin.to_string()),
            channel_transcript,
            worker_capabilities,
            empty_to_none(skills_rendered),
        )
    }

    /// Load the last 50 messages from a channel as a formatted transcript.
    async fn load_channel_transcript(&self, channel_id: &str) -> Option<String> {
        let logger = ProcessRunLogger::new(self.deps.sqlite_pool.clone());

        match logger.load_channel_timeline(channel_id, 50, None).await {
            Ok(items) if !items.is_empty() => {
                let mut transcript = String::new();
                for item in &items {
                    match item {
                        crate::conversation::history::TimelineItem::Message {
                            role,
                            content,
                            sender_name,
                            ..
                        } => {
                            let name = sender_name.as_deref().unwrap_or(role);
                            transcript.push_str(&format!("**{name}**: {content}\n\n"));
                        }
                        crate::conversation::history::TimelineItem::BranchRun {
                            description,
                            conclusion,
                            ..
                        } => {
                            if let Some(conclusion) = conclusion {
                                transcript.push_str(&format!(
                                    "*[Branch: {description}]*: {conclusion}\n\n"
                                ));
                            }
                        }
                        crate::conversation::history::TimelineItem::WorkerRun {
                            task,
                            result,
                            ..
                        } => {
                            if let Some(result) = result {
                                transcript.push_str(&format!("*[Worker: {task}]*: {result}\n\n"));
                            }
                        }
                    }
                }
                Some(transcript)
            }
            Ok(_) => None,
            Err(error) => {
                tracing::warn!(%error, channel_id, "failed to load channel transcript for cortex chat");
                None
            }
        }
    }
}

// --- Artifact tag parsing ---

/// Parse `<artifact kind="..." title="...">...</artifact>` blocks from a response.
///
/// Returns a list of `(artifact_id, kind, title, content)` tuples.
fn parse_artifact_tags(text: &str) -> Vec<(String, String, String, String)> {
    let mut results = Vec::new();
    let mut pos = 0;

    while let Some(rel_start) = text[pos..].find("<artifact") {
        let start = pos + rel_start;

        // Find the end of the opening tag
        let Some(rel_tag_end) = text[start..].find('>') else {
            break;
        };
        let tag_end = start + rel_tag_end + 1;
        let tag = &text[start..tag_end];

        let kind = extract_attr(tag, "kind").unwrap_or_else(|| "text".to_string());
        let title = extract_attr(tag, "title").unwrap_or_else(|| "Document".to_string());
        let artifact_id =
            extract_attr(tag, "id").unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        // Find the closing tag
        let Some(rel_close) = text[tag_end..].find("</artifact>") else {
            break;
        };
        let content_end = tag_end + rel_close;
        let content = text[tag_end..content_end].trim().to_string();

        results.push((artifact_id, kind, title, content));
        pos = content_end + "</artifact>".len();
    }

    results
}

/// Remove all `<artifact>...</artifact>` blocks and return the remainder.
fn strip_artifact_tags(text: &str) -> String {
    let mut result = text.to_string();

    loop {
        let Some(start) = result.find("<artifact") else {
            break;
        };
        let Some(rel_close) = result[start..].find("</artifact>") else {
            break;
        };
        let end = start + rel_close + "</artifact>".len();
        result.replace_range(start..end, "");
    }

    result.trim().to_string()
}

fn extract_attr(tag: &str, attr: &str) -> Option<String> {
    let pattern = format!("{}=\"", attr);
    let start = tag.find(&pattern)? + pattern.len();
    let end = tag[start..].find('"')?;
    Some(tag[start..start + end].to_string())
}
