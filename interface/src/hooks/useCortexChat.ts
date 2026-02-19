import { useCallback, useEffect, useRef, useState } from "react";
import { api, type CortexChatMessage } from "@/api/client";

export interface ToolActivity {
	tool: string;
	status: "running" | "done";
	result_preview?: string;
}

export interface ArtifactPayload {
	id: string;
	kind: string;
	title: string;
	content: string;
}

/** Parse SSE events from a ReadableStream response body. */
async function consumeSSE(
	response: Response,
	onEvent: (eventType: string, data: string) => void,
) {
	const reader = response.body?.getReader();
	if (!reader) return;

	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";

		let currentEvent = "";
		let currentData = "";

		for (const line of lines) {
			if (line.startsWith("event: ")) {
				currentEvent = line.slice(7);
			} else if (line.startsWith("data: ")) {
				currentData = line.slice(6);
			} else if (line === "" && currentEvent) {
				onEvent(currentEvent, currentData);
				currentEvent = "";
				currentData = "";
			}
		}
	}
}

function generateThreadId(): string {
	return crypto.randomUUID();
}

export function useCortexChat(
	agentId: string,
	channelId?: string,
	onArtifactReceived?: (artifact: ArtifactPayload) => void,
) {
	const [messages, setMessages] = useState<CortexChatMessage[]>([]);
	const [threadId, setThreadId] = useState<string | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [toolActivity, setToolActivity] = useState<ToolActivity[]>([]);
	const loadedRef = useRef(false);
	// Accumulate artifact content across delta events
	const pendingArtifactRef = useRef<ArtifactPayload | null>(null);

	// Load latest thread on mount
	useEffect(() => {
		if (loadedRef.current) return;
		loadedRef.current = true;

		api.cortexChatMessages(agentId).then((data) => {
			setThreadId(data.thread_id);
			setMessages(data.messages);
		}).catch((error) => {
			console.warn("Failed to load cortex chat history:", error);
			setThreadId(generateThreadId());
		});
	}, [agentId]);

	const sendMessage = useCallback(async (text: string) => {
		if (isStreaming || !threadId) return;

		setError(null);
		setIsStreaming(true);
		setToolActivity([]);
		pendingArtifactRef.current = null;

		// Optimistically add user message
		const userMessage: CortexChatMessage = {
			id: `tmp-${Date.now()}`,
			thread_id: threadId,
			role: "user",
			content: text,
			channel_context: channelId ?? null,
			created_at: new Date().toISOString(),
		};
		setMessages((prev) => [...prev, userMessage]);

		try {
			const response = await api.cortexChatSend(agentId, threadId, text, channelId);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			await consumeSSE(response, (eventType, data) => {
				if (eventType === "tool_started") {
					try {
						const parsed = JSON.parse(data);
						setToolActivity((prev) => [
							...prev,
							{ tool: parsed.tool, status: "running" },
						]);
					} catch { /* ignore */ }
				} else if (eventType === "tool_completed") {
					try {
						const parsed = JSON.parse(data);
						setToolActivity((prev) =>
							prev.map((t) =>
								t.tool === parsed.tool && t.status === "running"
									? { ...t, status: "done", result_preview: parsed.result_preview }
									: t,
							),
						);
					} catch { /* ignore */ }
				} else if (eventType === "done") {
					try {
						const parsed = JSON.parse(data);
						const assistantMessage: CortexChatMessage = {
							id: `resp-${Date.now()}`,
							thread_id: threadId,
							role: "assistant",
							content: parsed.full_text,
							channel_context: channelId ?? null,
							created_at: new Date().toISOString(),
						};
						setMessages((prev) => [...prev, assistantMessage]);
					} catch {
						setError("Failed to parse response");
					}
				} else if (eventType === "artifact_start") {
					try {
						const parsed = JSON.parse(data);
						pendingArtifactRef.current = {
							id: parsed.artifact_id,
							kind: parsed.kind,
							title: parsed.title,
							content: "",
						};
					} catch { /* ignore */ }
				} else if (eventType === "artifact_delta") {
					try {
						const parsed = JSON.parse(data);
						const pending = pendingArtifactRef.current;
						if (pending && pending.id === parsed.artifact_id) {
							pendingArtifactRef.current = {
								...pending,
								content: pending.content + parsed.data,
							};
						}
					} catch { /* ignore */ }
				} else if (eventType === "artifact_done") {
					const artifact = pendingArtifactRef.current;
					pendingArtifactRef.current = null;
					if (artifact) {
						onArtifactReceived?.(artifact);
					}
				} else if (eventType === "error") {
					try {
						const parsed = JSON.parse(data);
						setError(parsed.message);
					} catch {
						setError("Unknown error");
					}
				}
			});
		} catch (error) {
			setError(error instanceof Error ? error.message : "Request failed");
		} finally {
			setIsStreaming(false);
			setToolActivity([]);
		}
	}, [agentId, channelId, threadId, isStreaming, onArtifactReceived]);

	const newThread = useCallback(() => {
		setThreadId(generateThreadId());
		setMessages([]);
		setError(null);
		setToolActivity([]);
	}, []);

	return { messages, threadId, isStreaming, error, toolActivity, sendMessage, newThread };
}
