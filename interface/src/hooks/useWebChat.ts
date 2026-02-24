import { useCallback, useEffect, useRef } from "react";
import { api, type WebChatAttachmentRef } from "@/api/client";
import { useWebChatStore } from "./useWebChatStore";

export interface ToolActivity {
	tool: string;
	status: "running" | "done";
}

export interface WebChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
}

export function getPortalChatSessionId(agentId: string) {
	return `portal:chat:${agentId}`;
}

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

export function useWebChat(agentId: string) {
	const { getChat, initChat, updateChat, clearChat: storeClearChat } = useWebChatStore();
	const defaultSessionId = getPortalChatSessionId(agentId);
	
	useEffect(() => {
		initChat(agentId, defaultSessionId);
	}, [agentId, defaultSessionId, initChat]);

	const chatState = getChat(agentId, defaultSessionId);
	const { sessionId, messages, isStreaming, error, toolActivity, streamingText, hasFetched } = chatState;

	const streamingTextRef = useRef(streamingText);
	useEffect(() => {
		streamingTextRef.current = streamingText;
	}, [streamingText]);

	useEffect(() => {
		let cancelled = false;
		if (hasFetched) return;
		(async () => {
			try {
				// Log the fetch attempt
				console.log("Fetching history for", agentId, sessionId);
				const response = await api.webChatHistory(agentId, sessionId);
				if (!response.ok || cancelled) return;
				const history: { id: string; role: string; content: string }[] = await response.json();
				if (cancelled) return;
				// Log the result
				console.log("Got history", history);
				updateChat(agentId, () => ({
					messages: history.map((m) => ({
						id: m.id,
						role: m.role as "user" | "assistant",
						content: m.content || "[attachment]",
					})),
					hasFetched: true,
				}));
			} catch (err) {
				console.error("Failed to fetch history:", err);
				updateChat(agentId, () => ({ hasFetched: true }));
			}
		})();
		return () => { cancelled = true; };
	}, [agentId, sessionId, hasFetched, updateChat]);

	const sendMessage = useCallback(async (text: string, attachments: WebChatAttachmentRef[ ] = []) => {
		if (isStreaming) return;
		if (!text.trim() && attachments.length === 0) return;

		updateChat(agentId, () => ({ error: null, isStreaming: true, toolActivity: [], streamingText: "" }));
		streamingTextRef.current = "";

		const contentParts: string[] = [];
		if (text.trim()) {
			contentParts.push(text.trim());
		}
		if (attachments.length > 0) {
			const labels = attachments.map((attachment) => attachment.filename).join(", ");
			contentParts.push(`[attachments: ${labels}]`);
		}

		const userMessage: WebChatMessage = {
			id: `user-${Date.now()}`,
			role: "user",
			content: contentParts.join("\n"),
		};
		updateChat(agentId, (state) => ({ messages: [...state.messages, userMessage] }));

		const assistantId = `assistant-${Date.now()}`;

		try {
			const response = await api.webChatSend(agentId, sessionId, text, undefined, attachments);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			await consumeSSE(response, (eventType, data) => {
				if (eventType === "tool_started") {
					try {
						const parsed = JSON.parse(data);
						updateChat(agentId, (state) => ({
							toolActivity: [
								...state.toolActivity,
							 { tool: parsed.ToolStarted?.tool_name ?? "tool", status: "running" },
							]
						}));
					} catch { /* ignore */ }
				} else if (eventType === "tool_completed") {
					try {
						const parsed = JSON.parse(data);
						const toolName = parsed.ToolCompleted?.tool_name ?? "tool";
						updateChat(agentId, (state) => ({
							toolActivity: state.toolActivity.map((t) =>
								t.tool === toolName && t.status === "running"
									? { ...t, status: "done" }
									: t
							)
						}));
					} catch { /* ignore */ }
				} else if (eventType === "text") {
					try {
						const parsed = JSON.parse(data);
						const content = parsed.Text ?? "";
						updateChat(agentId, (state) => {
							const existing = state.messages.find((m) => m.id === assistantId);
							if (existing) {
								return { messages: state.messages.map((m) => m.id === assistantId ? { ...m, content } : m) };
							}
							return { messages: [...state.messages, { id: assistantId, role: "assistant", content }] };
						});
					} catch { /* ignore */ }
				} else if (eventType === "stream_chunk") {
					try {
						const parsed = JSON.parse(data);
						const chunk = parsed.StreamChunk ?? "";
						streamingTextRef.current += chunk;
						const accumulated = streamingTextRef.current;
						updateChat(agentId, (state) => {
							const existing = state.messages.find((m) => m.id === assistantId);
							if (existing) {
								return { messages: state.messages.map((m) => m.id === assistantId ? { ...m, content: accumulated } : m), streamingText: accumulated };
							}
							return { messages: [...state.messages, { id: assistantId, role: "assistant", content: accumulated }], streamingText: accumulated };
						});
					} catch { /* ignore */ }
				}
			});
		} catch (error) {
			updateChat(agentId, () => ({ error: error instanceof Error ? error.message : "Request failed" }));
		} finally {
			updateChat(agentId, () => ({ isStreaming: false, toolActivity: [] }));
		}
	}, [agentId, sessionId, isStreaming, updateChat]);

	const clearChat = useCallback(() => {
		const newSessionId = `portal:chat:${agentId}:${Date.now()}`;
		storeClearChat(agentId, newSessionId);
	}, [agentId, storeClearChat]);

	return { messages, sessionId, isStreaming, error, toolActivity, sendMessage, clearChat };
}
