import { useCallback, useEffect, useRef, useState } from "react";
import {
	api,
	type CortexChatAttachmentRef,
	type CortexChatMessage,
} from "@/api/client";

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

export interface ArtifactRef {
	id: string;
	kind: string;
	title: string;
}

export interface WorkerInfo {
	id: string;
	task: string;
	status: "running" | "done";
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

function generateThreadId() {
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
	const [activeWorkers, setActiveWorkers] = useState<WorkerInfo[]>([]);
	const [artifactRefs, setArtifactRefs] = useState<ArtifactRef[]>([]);
	
	// Track whether we've loaded the initial history for the current agent/channel
	const loadedRef = useRef<{ agentId?: string; channelId?: string }>({});
	
	// Accumulate artifact content across delta events
	const pendingArtifactRef = useRef<ArtifactPayload | null>(null);
	
	// Keep a stable ref to threadId so EventSource callbacks can read it without
	// causing the EventSource to be torn down and recreated on each thread change.
	const threadIdRef = useRef<string | null>(null);
	useEffect(() => {
		threadIdRef.current = threadId;
	}, [threadId]);

	// Restore artifact cards from localStorage when thread loads
	useEffect(() => {
		if (!threadId) return;
		const stored = localStorage.getItem(`cortex-arts-${threadId}`);
		if (stored) {
			try {
				setArtifactRefs(JSON.parse(stored));
			} catch {
				/* ignore */
			}
		} else {
			// Clear artifacts if we switch thread and have no history
			setArtifactRefs([]);
		}
	}, [threadId]);

	// Load thread on mount or when agentId/channelId changes
	useEffect(() => {
		// Only skip if we already loaded this specific agent and channel
		if (
			loadedRef.current.agentId === agentId && 
			loadedRef.current.channelId === channelId
		) return;
		
		loadedRef.current = { agentId, channelId };

		if (channelId) {
			// Each channel gets its own persistent cortex thread
			const tid = `channel:${channelId}`;
			setThreadId(tid);
			api.cortexChatMessages(agentId, tid).then((data) => {
				setMessages(data.messages);
			}).catch(() => {
				// Fresh thread — no history yet for this channel
				setMessages([]);
			});
		} else {
			api.cortexChatMessages(agentId).then((data) => {
				setThreadId(data.thread_id);
				setMessages(data.messages);
			}).catch((error) => {
				console.warn("Failed to load cortex chat history:", error);
				setThreadId(generateThreadId());
				setMessages([]);
			});
		}
	}, [agentId, channelId]);

	// Subscribe to the global SSE event stream to detect worker completions.
	// When a worker belonging to this agent completes, mark it done and reload
	// the cortex thread so the auto-synthesized response appears.
	useEffect(() => {
		const es = new EventSource("/api/events");

		es.addEventListener("worker_completed", (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data);
				if (data.agent_id !== agentId) return;

				setActiveWorkers((prev) =>
					prev.map((w) =>
						w.id === data.worker_id ? { ...w, status: "done" as const } : w,
					),
				);

				// Reload messages if we have a stable threadId
				if (threadIdRef.current) {
					api.cortexChatMessages(agentId, threadIdRef.current).then((history) => {
						setMessages(history.messages);
					}).catch(() => { /* ignore */ });
				}
			} catch {
				/* ignore */
			}
		});

		return () => {
			es.close();
		};
	}, [agentId]);

	const sendMessage = useCallback(
		async (text: string, attachments: CortexChatAttachmentRef[] = []) => {
			if (isStreaming || !threadId) return;
			if (!text.trim() && attachments.length === 0) return;

			setError(null);
			setIsStreaming(true);
			setToolActivity([]);
			pendingArtifactRef.current = null;

			// Optimistically add user message
			const userMessage: CortexChatMessage = {
				id: `user-${Date.now()}`,
				role: "user",
				content: text,
				attachments: attachments.length > 0 ? attachments : undefined,
			};
			setMessages((prev) => [...prev, userMessage]);

			let currentAssistantMessage = "";
			const assistantId = `assistant-${Date.now()}`;

			try {
				const response = await api.cortexChatSend(
					agentId,
					threadId,
					text,
					channelId,
					attachments,
				);
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}

				await consumeSSE(response, (eventType, data) => {
					if (eventType === "worker_started") {
						try {
							const parsed = JSON.parse(data);
							setActiveWorkers((prev) => [
								...prev,
								{
									id: parsed.worker_id,
									task: parsed.task,
									status: "running",
								},
							]);
						} catch {
							/* ignore */
						}
					} else if (eventType === "tool_started") {
						try {
							const parsed = JSON.parse(data);
							setToolActivity((prev) => [
								...prev,
								{ tool: parsed.tool_name, status: "running" },
							]);
						} catch {
							/* ignore */
						}
					} else if (eventType === "tool_completed") {
						try {
							const parsed = JSON.parse(data);
							setToolActivity((prev) =>
								prev.map((t) =>
									t.tool === parsed.tool_name && t.status === "running"
										? { ...t, status: "done", result_preview: parsed.result_preview }
										: t,
								),
							);
						} catch {
							/* ignore */
						}
					} else if (eventType === "text") {
						try {
							const content = JSON.parse(data);
							setMessages((prev) => {
								const existing = prev.find((m) => m.id === assistantId);
								if (existing) {
									return prev.map((m) =>
										m.id === assistantId ? { ...m, content } : m,
									);
								}
								return [...prev, { id: assistantId, role: "assistant", content }];
							});
						} catch {
							/* ignore */
						}
					} else if (eventType === "stream_chunk") {
						try {
							const chunk = JSON.parse(data);
							currentAssistantMessage += chunk;
							setMessages((prev) => {
								const existing = prev.find((m) => m.id === assistantId);
								if (existing) {
									return prev.map((m) =>
										m.id === assistantId
											? { ...m, content: currentAssistantMessage }
											: m,
									);
								}
								return [
									...prev,
									{
										id: assistantId,
										role: "assistant",
										content: currentAssistantMessage,
									},
								];
							});
						} catch {
							/* ignore */
						}
					} else if (eventType === "artifact_chunk") {
						try {
							const parsed = JSON.parse(data);
							if (!pendingArtifactRef.current) {
								pendingArtifactRef.current = {
									id: parsed.id,
									kind: parsed.kind,
									title: parsed.title,
									content: parsed.content || "",
								};
							} else {
								pendingArtifactRef.current.content += (parsed.content || "");
							}
						} catch {
							/* ignore */
						}
					} else if (eventType === "artifact_end") {
						try {
							const parsed = JSON.parse(data);
							const current = pendingArtifactRef.current;
							if (current && current.id === parsed.id) {
								// Keep the ref card in the chat log
								const newRef = {
									id: current.id,
									kind: current.kind,
									title: current.title,
								};
								
								setArtifactRefs((prev) => {
									const updated = [...prev, newRef];
									localStorage.setItem(`cortex-arts-${threadId}`, JSON.stringify(updated));
									return updated;
								});
								
								if (onArtifactReceived) {
									onArtifactReceived(current);
								}
								pendingArtifactRef.current = null;
							}
						} catch {
							/* ignore */
						}
					}
				});
			} catch (error) {
				setError(error instanceof Error ? error.message : "Request failed");
			} finally {
				setIsStreaming(false);
				setToolActivity([]);
			}
		},
		[agentId, threadId, channelId, isStreaming, onArtifactReceived],
	);

	const newThread = useCallback(() => {
		// Generate a new thread ID, blowing away the current view and backend link
		const newId = generateThreadId();
		setThreadId(newId);
		setMessages([]);
		setError(null);
		setToolActivity([]);
		setActiveWorkers([]);
		setArtifactRefs([]);
		localStorage.removeItem(`cortex-arts-${newId}`);
	}, []);

	// Stub for spawnWorker to match panel expectations if not fully implemented in the hook
	const spawnWorker = useCallback((task: string) => {
		console.warn("spawnWorker not implemented directly in useCortexChat");
	}, []);

	return {
		messages,
		isStreaming,
		error,
		toolActivity,
		activeWorkers,
		artifactRefs,
		sendMessage,
		spawnWorker,
		newThread,
	};
}
