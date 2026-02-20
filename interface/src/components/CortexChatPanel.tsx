import { useEffect, useRef, useState } from "react";
import {
	useCortexChat,
	type ToolActivity,
	type ArtifactPayload,
	type ArtifactRef,
	type WorkerInfo,
} from "@/hooks/useCortexChat";
import { api } from "@/api/client";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/ui";
import { PlusSignIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

interface CortexChatPanelProps {
	agentId: string;
	channelId?: string;
	onClose?: () => void;
	onArtifactReceived?: (artifact: ArtifactPayload) => void;
}

function WorkerCard({ worker }: { worker: WorkerInfo }) {
	return (
		<div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
			{worker.status === "running" ? (
				<span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
			) : (
				<span className="h-2 w-2 rounded-full bg-green-400" />
			)}
			<div className="min-w-0 flex-1">
				<span className="text-tiny font-medium text-amber-400">
					{worker.status === "running" ? "Worker running" : "Worker done"}
				</span>
				<p className="truncate text-tiny text-ink-faint">{worker.task}</p>
			</div>
		</div>
	);
}

function ArtifactCard({
	artifactRef,
	agentId,
	onOpen,
}: {
	artifactRef: ArtifactRef;
	agentId: string;
	onOpen: (art: ArtifactPayload) => void;
}) {
	const [loading, setLoading] = useState(false);

	const handleClick = async () => {
		setLoading(true);
		try {
			const info = await api.getArtifact(agentId, artifactRef.id);
			onOpen({ id: info.id, kind: info.kind, title: info.title, content: info.content });
		} catch {
			// ignore
		} finally {
			setLoading(false);
		}
	};

	const kindLabel: Record<string, string> = {
		book: "Book",
		code: "Code",
		text: "Document",
		image: "Image",
		sheet: "Spreadsheet",
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={loading}
			className="group flex w-full items-center gap-2 rounded-md border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-left transition-colors hover:bg-violet-500/10 disabled:opacity-60"
		>
			<div className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium text-ink">{artifactRef.title}</span>
				<span className="text-tiny text-ink-faint">
					{kindLabel[artifactRef.kind] ?? artifactRef.kind} · click to open
				</span>
			</div>
			{loading ? (
				<span className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border border-violet-400 border-t-transparent" />
			) : (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					className="h-3.5 w-3.5 flex-shrink-0 text-violet-400/60 transition-colors group-hover:text-violet-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={2}
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
					/>
				</svg>
			)}
		</button>
	);
}

function ToolActivityIndicator({ activity }: { activity: ToolActivity[] }) {
	if (activity.length === 0) return null;

	return (
		<div className="flex flex-col gap-1 px-3 py-2">
			{activity.map((tool, index) => (
				<div
					key={`${tool.tool}-${index}`}
					className="flex items-center gap-2 rounded bg-app-darkBox/40 px-2 py-1"
				>
					{tool.status === "running" ? (
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
					) : (
						<span className="h-1.5 w-1.5 rounded-full bg-green-400" />
					)}
					<span className="font-mono text-tiny text-ink-faint">{tool.tool}</span>
					{tool.status === "done" && tool.result_preview && (
						<span className="min-w-0 flex-1 truncate text-tiny text-ink-faint/60">
							{tool.result_preview.slice(0, 80)}
						</span>
					)}
				</div>
			))}
		</div>
	);
}

export function CortexChatPanel({ agentId, channelId, onClose, onArtifactReceived }: CortexChatPanelProps) {
	const { messages, isStreaming, error, toolActivity, activeWorkers, artifactRefs, sendMessage, spawnWorker, newThread } =
		useCortexChat(agentId, channelId, onArtifactReceived);
	const [input, setInput] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Auto-scroll on new messages or tool activity
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages.length, isStreaming, toolActivity.length, activeWorkers.length]);

	// Focus input on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		const trimmed = input.trim();
		if (!trimmed) return;

		// /clear or /new — reset to a fresh thread
		if (trimmed === "/clear" || trimmed === "/new") {
			setInput("");
			newThread();
			return;
		}

		// /worker <task> — spawn a background worker without blocking the chat
		if (trimmed.startsWith("/worker ")) {
			const task = trimmed.slice("/worker ".length).trim();
			if (task) {
				setInput("");
				spawnWorker(task);
			}
			return;
		}

		if (isStreaming) return;
		setInput("");
		sendMessage(trimmed);
	};

	return (
		<div className="flex h-full w-full flex-col bg-app-darkBox/30">
			{/* Header */}
			<div className="flex h-12 items-center justify-between border-b border-app-line/50 px-4">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium text-ink">Cortex</span>
					{channelId && (
						<span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-tiny text-violet-400">
							{channelId.length > 24 ? `${channelId.slice(0, 24)}...` : channelId}
						</span>
					)}
				</div>
				<div className="flex items-center gap-1">
					<Button
						onClick={newThread}
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						title="New chat"
					>
						<HugeiconsIcon icon={PlusSignIcon} className="h-3.5 w-3.5" />
					</Button>
					{onClose && (
						<Button
							onClick={onClose}
							variant="ghost"
							size="icon"
							className="h-7 w-7"
							title="Close"
						>
							<HugeiconsIcon icon={Cancel01Icon} className="h-3.5 w-3.5" />
						</Button>
					)}
				</div>
			</div>

			{/* Messages */}
			<div className="flex-1 overflow-y-auto">
				<div className="flex flex-col gap-3 p-4">
					{messages.length === 0 && !isStreaming && activeWorkers.length === 0 && (
						<p className="py-8 text-center text-sm text-ink-faint">
							Ask the cortex anything · use <span className="font-mono">/worker</span> to spawn background workers
						</p>
					)}
					{messages.map((message) => {
						// Worker result injections are shown as a special card, not a plain user bubble
						if (
							message.role === "user" &&
							message.content.startsWith("[Worker Result:")
						) {
							const firstLine = message.content.split("\n")[0] ?? "";
							const taskMatch = firstLine.match(/^\[Worker Result: (.+)\]$/);
							const task = taskMatch ? taskMatch[1] : "Worker";
							const result = message.content.slice(firstLine.length).trim();
							return (
								<div
									key={message.id}
									className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2"
								>
									<span className="text-tiny font-medium text-amber-400">
										Worker completed: {task}
									</span>
									<p className="mt-0.5 line-clamp-3 text-tiny text-ink-faint">
										{result}
									</p>
								</div>
							);
						}

						return (
							<div
								key={message.id}
								className={`rounded-md px-3 py-2 ${
									message.role === "user"
										? "ml-8 bg-accent/10"
										: "mr-2 bg-app-darkBox/50"
								}`}
							>
								<span
									className={`text-tiny font-medium ${
										message.role === "user" ? "text-accent-faint" : "text-violet-400"
									}`}
								>
									{message.role === "user" ? "you" : "cortex"}
								</span>
								<div className="mt-0.5 text-sm text-ink-dull">
									{message.role === "assistant" ? (
										<Markdown>{message.content}</Markdown>
									) : (
										<p>{message.content}</p>
									)}
								</div>
							</div>
						);
					})}
					{artifactRefs.length > 0 && onArtifactReceived && (
						<div className="flex flex-col gap-1.5 pt-1">
							{artifactRefs.map((ref) => (
								<ArtifactCard
									key={ref.id}
									artifactRef={ref}
									agentId={agentId}
									onOpen={onArtifactReceived}
								/>
							))}
						</div>
					)}
					{activeWorkers.length > 0 && (
						<div className="flex flex-col gap-1.5">
							{activeWorkers.map((worker) => (
								<WorkerCard key={worker.id} worker={worker} />
							))}
						</div>
					)}
					{isStreaming && (
						<div className="mr-2 rounded-md bg-app-darkBox/50 px-3 py-2">
							<span className="text-tiny font-medium text-violet-400">cortex</span>
							<ToolActivityIndicator activity={toolActivity} />
							{toolActivity.length === 0 && (
								<div className="mt-1 flex items-center gap-1">
									<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
									<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400 [animation-delay:0.2s]" />
									<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400 [animation-delay:0.4s]" />
									<span className="ml-1 text-tiny text-ink-faint">thinking...</span>
								</div>
							)}
						</div>
					)}
					{error && (
						<div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
							{error}
						</div>
					)}
					<div ref={messagesEndRef} />
				</div>
			</div>

			{/* Input */}
			<form onSubmit={handleSubmit} className="border-t border-app-line/50 p-3">
				<div className="flex gap-2">
					<input
						ref={inputRef}
						type="text"
						value={input}
						onChange={(event) => setInput(event.target.value)}
						placeholder={isStreaming ? "Waiting for response..." : "Message the cortex… or /worker <task>"}
						className="flex-1 rounded-md border border-app-line bg-app-darkBox px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-violet-500/50 focus:outline-none focus:ring-0"
					/>
					<Button
					type="submit"
					disabled={(isStreaming && !input.trim().startsWith("/worker ")) || !input.trim()}
					size="sm"
					className="bg-violet-500/20 text-violet-400 hover:bg-violet-500/30"
				>
					Send
				</Button>
				</div>
			</form>
		</div>
	);
}
