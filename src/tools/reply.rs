//! Reply tool for sending messages to users (channel only).

use crate::conversation::ConversationLogger;
use crate::tools::SkipFlag;
use crate::{AgentId, ChannelId, OutboundResponse};
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use tokio::sync::{broadcast, mpsc};

/// Tool for replying to users.
///
/// Holds a sender channel rather than a specific InboundMessage. The channel
/// process creates a response sender per conversation turn and the tool routes
/// replies through it. This is compatible with Rig's ToolServer which registers
/// tools once and shares them across calls.
#[derive(Debug, Clone)]
pub struct ReplyTool {
    response_tx: mpsc::Sender<OutboundResponse>,
    conversation_id: String,
    conversation_logger: ConversationLogger,
    channel_id: ChannelId,
    skip_flag: SkipFlag,
    sqlite_pool: sqlx::SqlitePool,
    api_event_tx: Option<broadcast::Sender<crate::api::ApiEvent>>,
    agent_id: AgentId,
}

impl ReplyTool {
    /// Create a new reply tool bound to a conversation's response channel.
    pub fn new(
        response_tx: mpsc::Sender<OutboundResponse>,
        conversation_id: impl Into<String>,
        conversation_logger: ConversationLogger,
        channel_id: ChannelId,
        skip_flag: SkipFlag,
        sqlite_pool: sqlx::SqlitePool,
        api_event_tx: Option<broadcast::Sender<crate::api::ApiEvent>>,
        agent_id: AgentId,
    ) -> Self {
        Self {
            response_tx,
            conversation_id: conversation_id.into(),
            conversation_logger,
            channel_id,
            skip_flag,
            sqlite_pool,
            api_event_tx,
            agent_id,
        }
    }
}

/// Error type for reply tool.
#[derive(Debug, thiserror::Error)]
#[error("Reply failed: {0}")]
pub struct ReplyError(String);

/// Arguments for reply tool.
#[derive(Debug, Deserialize, JsonSchema)]
pub struct ReplyArgs {
    /// The message content to send to the user.
    pub content: String,
    /// Optional: create a new thread with this name and reply inside it.
    /// When set, a public thread is created in the current channel and the
    /// reply is posted there. Thread names are capped at 100 characters.
    #[serde(default)]
    pub thread_name: Option<String>,
    /// Optional: formatted cards (e.g. Discord embeds) to attach to the message.
    /// Great for structured reports, summaries, or visually distinct content.
    #[serde(default)]
    pub cards: Option<Vec<crate::Card>>,
    /// Optional: interactive elements (e.g. buttons, select menus) to attach.
    /// Button clicks will be sent back to you as an inbound InteractionEvent
    /// with the corresponding custom_id.
    #[serde(default)]
    pub interactive_elements: Option<Vec<crate::InteractiveElements>>,
    /// Optional: a poll to attach to the message.
    #[serde(default)]
    pub poll: Option<crate::Poll>,
}

/// Output from reply tool.
#[derive(Debug, Serialize)]
pub struct ReplyOutput {
    pub success: bool,
    pub conversation_id: String,
    pub content: String,
}

/// Convert @username mentions to platform-specific syntax using conversation metadata.
///
/// Scans recent conversation history to build a name→ID mapping, then replaces
/// @DisplayName with the platform's mention format (<@ID> for Discord/Slack,
/// @username for Telegram).
async fn convert_mentions(
    content: &str,
    channel_id: &ChannelId,
    conversation_logger: &ConversationLogger,
    source: &str,
) -> String {
    // Load recent conversation to extract user mappings
    let messages = match conversation_logger.load_recent(channel_id, 50).await {
        Ok(msgs) => msgs,
        Err(e) => {
            tracing::warn!(error = %e, "failed to load conversation for mention conversion");
            return content.to_string();
        }
    };

    // Build display_name → user_id mapping from metadata
    let mut name_to_id: HashMap<String, String> = HashMap::new();
    for msg in messages {
        if let (Some(name), Some(id), Some(meta_str)) =
            (&msg.sender_name, &msg.sender_id, &msg.metadata)
        {
            // Parse metadata JSON to get clean display name (without mention syntax)
            if let Ok(meta) = serde_json::from_str::<HashMap<String, serde_json::Value>>(meta_str) {
                if let Some(display_name) = meta.get("sender_display_name").and_then(|v| v.as_str())
                {
                    // For Slack (from PR #43), sender_display_name includes mention: "Name (<@ID>)"
                    // Extract just the name part
                    let clean_name = display_name.split(" (<@").next().unwrap_or(display_name);
                    name_to_id.insert(clean_name.to_string(), id.clone());
                }
            }
            // Fallback: use sender_name from DB directly
            name_to_id.insert(name.clone(), id.clone());
        }
    }

    if name_to_id.is_empty() {
        return content.to_string();
    }

    // Convert @Name patterns to platform-specific mentions
    let mut result = content.to_string();

    // Sort by name length (longest first) to avoid partial replacements
    // e.g., "Alice Smith" before "Alice"
    let mut names: Vec<_> = name_to_id.keys().cloned().collect();
    names.sort_by(|a, b| b.len().cmp(&a.len()));

    for name in names {
        if let Some(user_id) = name_to_id.get(&name) {
            let mention_pattern = format!("@{}", name);
            let replacement = match source {
                "discord" | "slack" => format!("<@{}>", user_id),
                "telegram" => format!("@{}", name), // Telegram uses @username (already correct)
                _ => mention_pattern.clone(),       // Unknown platform, leave as-is
            };

            // Only replace if not already in correct format
            // Avoid double-converting "<@123>" patterns
            if !result.contains(&format!("<@{}>", user_id)) {
                result = result.replace(&mention_pattern, &replacement);
            }
        }
    }

    result
}

#[derive(Debug, Clone)]
struct ParsedArtifact {
    id: String,
    kind: String,
    title: String,
    content: String,
}

/// Parse `<artifact kind="..." title="...">...</artifact>` blocks from text.
fn parse_artifact_tags(text: &str) -> Vec<ParsedArtifact> {
    let mut results = Vec::new();
    let mut pos = 0;

    while let Some(rel_start) = text[pos..].find("<artifact") {
        let start = pos + rel_start;

        let Some(rel_tag_end) = text[start..].find('>') else {
            break;
        };
        let tag_end = start + rel_tag_end + 1;
        let tag = &text[start..tag_end];

        let kind = extract_attr(tag, "kind").unwrap_or_else(|| "text".to_string());
        let title = extract_attr(tag, "title").unwrap_or_else(|| "Document".to_string());
        let id = extract_attr(tag, "id").unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        let Some(rel_close) = text[tag_end..].find("</artifact>") else {
            break;
        };
        let content_end = tag_end + rel_close;
        let content = text[tag_end..content_end].trim().to_string();

        results.push(ParsedArtifact {
            id,
            kind,
            title,
            content,
        });
        pos = content_end + "</artifact>".len();
    }

    results
}

/// Remove all `<artifact>...</artifact>` blocks and return remaining text.
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

async fn persist_channel_artifact(
    sqlite_pool: &sqlx::SqlitePool,
    channel_id: &ChannelId,
    artifact: &ParsedArtifact,
) -> std::result::Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO artifacts (id, channel_id, kind, title, content, metadata, version, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) \
         ON CONFLICT(id) DO UPDATE SET \
            kind = excluded.kind, \
            title = excluded.title, \
            content = excluded.content, \
            metadata = excluded.metadata, \
            version = artifacts.version + 1, \
            updated_at = CURRENT_TIMESTAMP",
    )
    .bind(&artifact.id)
    .bind(channel_id.as_ref())
    .bind(&artifact.kind)
    .bind(&artifact.title)
    .bind(&artifact.content)
    .bind(Option::<String>::None)
    .execute(sqlite_pool)
    .await?;

    Ok(())
}

fn emit_artifact_created_event(
    api_event_tx: &Option<broadcast::Sender<crate::api::ApiEvent>>,
    agent_id: &AgentId,
    channel_id: &ChannelId,
    artifact: &ParsedArtifact,
) {
    let Some(api_event_tx) = api_event_tx else {
        return;
    };

    let _ = api_event_tx.send(crate::api::ApiEvent::ArtifactCreated {
        agent_id: agent_id.to_string(),
        channel_id: channel_id.to_string(),
        artifact_id: artifact.id.clone(),
        kind: artifact.kind.clone(),
        title: artifact.title.clone(),
    });
}

impl Tool for ReplyTool {
    const NAME: &'static str = "reply";

    type Error = ReplyError;
    type Args = ReplyArgs;
    type Output = ReplyOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        let parameters = serde_json::json!({
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The content to send to the user. Can be markdown formatted."
                },
                "thread_name": {
                    "type": "string",
                    "description": "If provided, creates a new public thread with this name and posts the reply inside it. Max 100 characters."
                },
                "cards": {
                    "type": "array",
                    "description": "Optional: formatted cards (e.g. Discord embeds) to attach. Great for structured reports, summaries, or visually distinct content. Max 10 cards.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": { "type": "string" },
                            "description": { "type": "string" },
                            "color": { "type": "integer", "description": "Decimal color code" },
                            "url": { "type": "string" },
                            "fields": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": { "type": "string" },
                                        "value": { "type": "string" },
                                        "inline": { "type": "boolean" }
                                    },
                                    "required": ["name", "value"]
                                }
                            },
                            "footer": { "type": "string" }
                        }
                    }
                },
                "interactive_elements": {
                    "type": "array",
                    "description": "Optional: interactive components to attach. Button clicks will be sent back to you as an inbound InteractionEvent with the corresponding custom_id. Max 5 elements (rows).",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": { "type": "string", "enum": ["buttons", "select"] },
                            "buttons": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "label": { "type": "string" },
                                        "custom_id": { "type": "string", "description": "ID sent back to you when clicked" },
                                        "style": { "type": "string", "enum": ["primary", "secondary", "success", "danger", "link"] },
                                        "url": { "type": "string", "description": "Required if style is link" }
                                    },
                                    "required": ["label", "style"]
                                }
                            },
                            "select": {
                                "type": "object",
                                "properties": {
                                    "custom_id": { "type": "string" },
                                    "options": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "label": { "type": "string" },
                                                "value": { "type": "string" },
                                                "description": { "type": "string" },
                                                "emoji": { "type": "string" }
                                            },
                                            "required": ["label", "value"]
                                        }
                                    },
                                    "placeholder": { "type": "string" }
                                },
                                "required": ["custom_id", "options"]
                            }
                        }
                    }
                },
                "poll": {
                    "type": "object",
                    "description": "Optional: a poll to attach to the message.",
                    "properties": {
                        "question": { "type": "string" },
                        "answers": {
                            "type": "array",
                            "items": { "type": "string" }
                        },
                        "allow_multiselect": { "type": "boolean" },
                        "duration_hours": { "type": "integer", "description": "Defaults to 24 if omitted" }
                    },
                    "required": ["question", "answers"]
                }
            },
            "required": ["content"]
        });

        ToolDefinition {
            name: Self::NAME.to_string(),
            description: crate::prompts::text::get("tools/reply").to_string(),
            parameters,
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let ReplyArgs {
            content,
            thread_name,
            cards,
            interactive_elements,
            poll,
        } = args;

        tracing::info!(
            conversation_id = %self.conversation_id,
            content_len = content.len(),
            thread_name = thread_name.as_deref(),
            "reply tool called"
        );

        let artifacts = parse_artifact_tags(&content);
        if !artifacts.is_empty() {
            for artifact in &artifacts {
                if let Err(error) =
                    persist_channel_artifact(&self.sqlite_pool, &self.channel_id, artifact).await
                {
                    tracing::warn!(
                        %error,
                        channel_id = %self.channel_id,
                        artifact_id = %artifact.id,
                        "failed to persist artifact from reply tool",
                    );
                } else {
                    emit_artifact_created_event(
                        &self.api_event_tx,
                        &self.agent_id,
                        &self.channel_id,
                        artifact,
                    );
                }
            }
        }

        // Extract source from conversation_id (format: "platform:id")
        let source = self.conversation_id.split(':').next().unwrap_or("unknown");

        let stripped_content = strip_artifact_tags(&content);

        // Auto-convert @mentions to platform-specific syntax
        let mut converted_content = convert_mentions(
            &stripped_content,
            &self.channel_id,
            &self.conversation_logger,
            source,
        )
        .await;

        let has_rich_payload = cards.is_some() || interactive_elements.is_some() || poll.is_some();
        if converted_content.trim().is_empty() && !artifacts.is_empty() {
            converted_content = if artifacts.len() == 1 {
                format!("Artifact ready: {}", artifacts[0].title)
            } else {
                format!("{} artifacts ready.", artifacts.len())
            };
        }

        if !converted_content.trim().is_empty() {
            self.conversation_logger
                .log_bot_message(&self.channel_id, &converted_content);
        }

        let should_send_response =
            thread_name.is_some() || has_rich_payload || !converted_content.trim().is_empty();
        if should_send_response {
            let response = if let Some(ref name) = thread_name {
                // Cap thread names at 100 characters (Discord limit)
                let thread_name = if name.len() > 100 {
                    name[..name.floor_char_boundary(100)].to_string()
                } else {
                    name.clone()
                };
                OutboundResponse::ThreadReply {
                    thread_name,
                    text: converted_content.clone(),
                }
            } else if has_rich_payload {
                OutboundResponse::RichMessage {
                    text: converted_content.clone(),
                    blocks: vec![], // No block generation for now; Slack adapters will fall back to text
                    cards: cards.unwrap_or_default(),
                    interactive_elements: interactive_elements.unwrap_or_default(),
                    poll,
                }
            } else {
                OutboundResponse::Text(converted_content.clone())
            };

            self.response_tx
                .send(response)
                .await
                .map_err(|e| ReplyError(format!("failed to send reply: {e}")))?;
        }

        /*
         * Mark the turn as handled so handle_agent_result skips the fallback send.
         * This includes artifact-only replies where no text response is needed.
         */
        self.skip_flag.store(true, Ordering::Relaxed);

        tracing::debug!(conversation_id = %self.conversation_id, "reply sent to outbound channel");

        Ok(ReplyOutput {
            success: true,
            conversation_id: self.conversation_id.clone(),
            content: converted_content,
        })
    }
}
