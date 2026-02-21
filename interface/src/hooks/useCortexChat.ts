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
	const [activeWorkers, setActiveWorkers] = useState<WorkerInfo[]>([]);
	const [artifactRefs, setArtifactRefs] = useState<ArtifactRef[]>([]);
	const loadedRef = useRef(false);
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
		}
	}, [threadId]);

	// Load thread on mount — scoped to channel when one is provided
	useEffect(() => {
		if (loadedRef.current) return;
		loadedRef.current = true;

		if (channelId) {
			// Each channel gets its own persistent cortex thread
			const tid = `channel:${channelId}`;
			setThreadId(tid);
			api.cortexChatMessages(agentId, tid).then((data) => {
				setMessages(data.messages);
			}).catch(() => {
				// Fresh thread — no history yet for this channel
			});
		} else {
			api.cortexChatMessages(agentId).then((data) => {
				setThreadId(data.thread_id);
				setMessages(data.messages);
			}).catch((error) => {
				console.warn("Failed to load cortex chat history:", error);
				setThreadId(generateThreadId());
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

				// Reload messages after a short delay to let the cortex synthesis save
				const tid = threadIdRef.current;
				if (tid) {
					setTimeout(() => {
						api
							.cortexChatMessages(agentId, tid)
							.then((resp) => setMessages(resp.messages))
							.catch(() => {});
					}, 500);
				}
			} catch {
				/* ignore parse errors */
			}
		});

		return () => es.close();
	}, [agentId]);

	const spawnWorker = useCallback(
		async (task: string, skill?: string) => {
			if (!threadId) return;
			try {
				const result = await api.cortexChatSpawnWorker(agentId, threadId, task, skill);
				setActiveWorkers((prev) => [
					...prev,
					{ id: result.worker_id, task: result.task, status: "running" as const },
				]);
			} catch (err) {
				console.warn("Failed to spawn cortex worker:", err);
				setError("Failed to spawn worker");
			}
		},
		[agentId, threadId],
	);

	const sendMessage = useCallback(async (text: string, attachments: CortexChatAttachmentRef[] = []) => {
		if (isStreaming || !threadId) return;
		if (!text.trim() && attachments.length === 0) return;

		setError(null);
		setIsStreaming(true);
		setToolActivity([]);
		pendingArtifactRef.current = null;

		const contentParts: string[] = [];
		if (text.trim()) {
			contentParts.push(text.trim());
		}
		if (attachments.length > 0) {
			const labels = attachments.map((attachment) => attachment.filename).join(", ");
			contentParts.push(`[attachments: ${labels}]`);
		}

		// Optimistically add user message
		const userMessage: CortexChatMessage = {
			id: `tmp-${Date.now()}`,
			thread_id: threadId,
			role: "user",
			content: contentParts.join("\n"),
			channel_context: channelId ?? null,
			created_at: new Date().toISOString(),
		};
		setMessages((prev) => [...prev, userMessage]);

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
						const ref: ArtifactRef = { id: artifact.id, kind: artifact.kind, title: artifact.title };
						setArtifactRefs((prev) => {
							const updated = prev.some((r) => r.id === ref.id) ? prev : [...prev, ref];
							localStorage.setItem(`cortex-arts-${threadId}`, JSON.stringify(updated));
							return updated;
						});
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
		setActiveWorkers([]);
		setArtifactRefs([]);
	}, []);

	return {
		messages,
		threadId,
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
