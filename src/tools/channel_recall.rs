//! Cross-channel transcript recall tool for branches.

use crate::conversation::channels::ChannelStore;
use crate::conversation::history::ConversationLogger;

use rig::completion::ToolDefinition;
use rig::tool::Tool;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Maximum messages to return in a single recall.
const MAX_TRANSCRIPT_MESSAGES: i64 = 100;

/// Separator used in transcript pagination cursors.
const CURSOR_SEPARATOR: char = ':';

/// Tool for recalling conversation transcript from other channels.
#[derive(Debug, Clone)]
pub struct ChannelRecallTool {
    conversation_logger: ConversationLogger,
    channel_store: ChannelStore,
}

impl ChannelRecallTool {
    pub fn new(conversation_logger: ConversationLogger, channel_store: ChannelStore) -> Self {
        Self {
            conversation_logger,
            channel_store,
        }
    }
}

/// Error type for channel recall tool.
#[derive(Debug, thiserror::Error)]
#[error("Channel recall failed: {0}")]
pub struct ChannelRecallError(String);

/// Arguments for channel recall tool.
#[derive(Debug, Deserialize, JsonSchema)]
pub struct ChannelRecallArgs {
    /// The channel to recall from. Can be a channel name (e.g. "general"),
    /// a partial name, or a full channel ID (e.g. "discord:123:456").
    /// If omitted, lists all available channels instead.
    #[serde(default)]
    pub channel: Option<String>,
    /// Maximum number of messages to return (default 50, max 100).
    #[serde(default = "default_message_limit")]
    pub limit: i64,
    /// Opaque cursor returned by a previous call to paginate older messages.
    /// Format: `<unix_seconds>:<message_id>`.
    #[serde(default)]
    pub before: Option<String>,
}

fn default_message_limit() -> i64 {
    50
}

/// A single message in the transcript output.
#[derive(Debug, Serialize)]
pub struct TranscriptMessage {
    pub role: String,
    pub sender: Option<String>,
    pub content: String,
    pub timestamp: String,
}

/// Output from channel recall tool.
#[derive(Debug, Serialize)]
pub struct ChannelRecallOutput {
    /// What action was performed.
    pub action: String,
    /// The channel that was queried, if any.
    pub channel_id: Option<String>,
    /// The resolved channel name, if known.
    pub channel_name: Option<String>,
    /// The transcript messages, if a channel was queried.
    pub messages: Vec<TranscriptMessage>,
    /// Available channels, if listing mode.
    pub available_channels: Vec<ChannelListEntry>,
    /// Cursor for fetching the next (older) transcript page.
    pub next_cursor: Option<String>,
    /// Formatted summary for the agent.
    pub summary: String,
}

#[derive(Debug, Clone)]
struct TranscriptCursor {
    before_unix_seconds: i64,
    before_message_id: String,
}

/// An entry in the channel list.
#[derive(Debug, Serialize)]
pub struct ChannelListEntry {
    pub channel_id: String,
    pub channel_name: Option<String>,
    pub last_activity: String,
}

impl Tool for ChannelRecallTool {
    const NAME: &'static str = "channel_recall";

    type Error = ChannelRecallError;
    type Args = ChannelRecallArgs;
    type Output = ChannelRecallOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: Self::NAME.to_string(),
            description: crate::prompts::text::get("tools/channel_recall").to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "channel": {
                        "type": "string",
                        "description": "Channel name (e.g. \"general\", \"dev\") or full channel ID. Omit to list all available channels."
                    },
                    "limit": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 100,
                        "default": 50,
                        "description": "Maximum number of messages to retrieve (1-100)"
                    },
                    "before": {
                        "type": "string",
                        "description": "Optional cursor from a previous channel_recall call to fetch older messages"
                    }
                }
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> std::result::Result<Self::Output, Self::Error> {
        let Some(channel_query) = args.channel else {
            return self.list_channels().await;
        };

        let limit = args.limit.clamp(1, MAX_TRANSCRIPT_MESSAGES);
        let cursor = args
            .before
            .as_deref()
            .map(parse_transcript_cursor)
            .transpose()?;

        // Resolve channel name to ID
        let found = self
            .channel_store
            .find_by_name(&channel_query)
            .await
            .map_err(|e| ChannelRecallError(format!("Failed to search channels: {e}")))?;

        let Some(channel) = found else {
            let mut output = self.list_channels().await?;
            output.summary = format!(
                "No channel matching \"{}\" was found. Here are the available channels:\n\n{}",
                channel_query, output.summary
            );
            return Ok(output);
        };

        // Load transcript
        let messages = self
            .conversation_logger
            .load_channel_transcript(
                &channel.id,
                limit,
                cursor.as_ref().map(|cursor| {
                    (
                        cursor.before_unix_seconds,
                        cursor.before_message_id.as_str(),
                    )
                }),
            )
            .await
            .map_err(|e| ChannelRecallError(format!("Failed to load transcript: {e}")))?;

        let next_cursor = if messages.len() as i64 == limit {
            messages.first().map(build_transcript_cursor)
        } else {
            None
        };

        let transcript: Vec<TranscriptMessage> = messages
            .iter()
            .map(|message| TranscriptMessage {
                role: message.role.clone(),
                sender: message.sender_name.clone(),
                content: message.content.clone(),
                timestamp: message.created_at.to_rfc3339(),
            })
            .collect();

        let summary = format_transcript(
            &channel.display_name,
            &channel.id,
            &transcript,
            &next_cursor,
        );

        Ok(ChannelRecallOutput {
            action: "transcript".to_string(),
            channel_id: Some(channel.id),
            channel_name: channel.display_name,
            messages: transcript,
            available_channels: vec![],
            next_cursor,
            summary,
        })
    }
}

impl ChannelRecallTool {
    async fn list_channels(&self) -> std::result::Result<ChannelRecallOutput, ChannelRecallError> {
        let channels = self
            .channel_store
            .list_active()
            .await
            .map_err(|e| ChannelRecallError(format!("Failed to list channels: {e}")))?;

        let entries: Vec<ChannelListEntry> = channels
            .iter()
            .map(|channel| ChannelListEntry {
                channel_id: channel.id.clone(),
                channel_name: channel.display_name.clone(),
                last_activity: channel.last_activity_at.to_rfc3339(),
            })
            .collect();

        let summary = format_channel_list(&entries);

        Ok(ChannelRecallOutput {
            action: "list".to_string(),
            channel_id: None,
            channel_name: None,
            messages: vec![],
            available_channels: entries,
            next_cursor: None,
            summary,
        })
    }
}

fn parse_transcript_cursor(
    cursor: &str,
) -> std::result::Result<TranscriptCursor, ChannelRecallError> {
    let Some((unix_seconds, message_id)) = cursor.split_once(CURSOR_SEPARATOR) else {
        return Err(ChannelRecallError(format!(
            "Invalid `before` cursor format. Expected `<unix_seconds>{CURSOR_SEPARATOR}<message_id>`."
        )));
    };

    let before_unix_seconds = unix_seconds.parse::<i64>().map_err(|_| {
        ChannelRecallError(
            "Invalid `before` cursor format. Unix timestamp must be an integer.".to_string(),
        )
    })?;

    if message_id.is_empty() {
        return Err(ChannelRecallError(
            "Invalid `before` cursor format. Missing message ID.".to_string(),
        ));
    }

    Ok(TranscriptCursor {
        before_unix_seconds,
        before_message_id: message_id.to_string(),
    })
}

fn build_transcript_cursor(message: &crate::conversation::history::ConversationMessage) -> String {
    format!(
        "{}{CURSOR_SEPARATOR}{}",
        message.created_at.timestamp(),
        message.id
    )
}

fn format_transcript(
    channel_name: &Option<String>,
    channel_id: &str,
    messages: &[TranscriptMessage],
    next_cursor: &Option<String>,
) -> String {
    if messages.is_empty() {
        return format!(
            "No messages found in channel {}.",
            channel_name.as_deref().unwrap_or(channel_id)
        );
    }

    let label = channel_name.as_deref().unwrap_or(channel_id);
    let mut output = format!(
        "## Transcript from #{label} ({} messages)\n\n",
        messages.len()
    );

    for message in messages {
        let sender = match &message.sender {
            Some(name) => name.as_str(),
            None => "assistant",
        };
        output.push_str(&format!(
            "**{}** ({}): {}\n\n",
            sender, message.role, message.content
        ));
    }

    if let Some(cursor) = next_cursor {
        output.push_str(&format!(
            "Use `before: \"{}\"` on your next `channel_recall` call to fetch older messages.\n",
            cursor
        ));
    }

    output
}

fn format_channel_list(channels: &[ChannelListEntry]) -> String {
    if channels.is_empty() {
        return "No channels found.".to_string();
    }

    let mut output = String::from("## Available Channels\n\n");

    for (i, channel) in channels.iter().enumerate() {
        let name = channel.channel_name.as_deref().unwrap_or("unnamed");
        output.push_str(&format!(
            "{}. **#{}** — last active: {}\n   ID: `{}`\n\n",
            i + 1,
            name,
            channel.last_activity,
            channel.channel_id,
        ));
    }

    output
}
