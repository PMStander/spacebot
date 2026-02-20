import { useEffect, useRef, useState } from "react";
import { useWebChat, type ToolActivity } from "@/hooks/useWebChat";
import { api, type WebChatAttachmentRef } from "@/api/client";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/ui";
import { Add01Icon, Cancel01Icon, PlusSignIcon, FloppyDiskIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";

interface WebChatPanelProps {
	agentId: string;
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
				</div>
			))}
		</div>
	);
}

export function WebChatPanel({ agentId }: WebChatPanelProps) {
	const { messages, isStreaming, error, toolActivity, sendMessage, clearChat } = useWebChat(agentId);
	const navigate = useNavigate();
	const [input, setInput] = useState("");
	const [pendingAttachments, setPendingAttachments] = useState<WebChatAttachmentRef[]>([]);
	const [isUploading, setIsUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages.length, isStreaming, toolActivity.length]);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const handleSaveToChats = async () => {
		if (messages.length === 0 || isSaving) return;
		setIsSaving(true);
		try {
			const firstUserMsg = messages.find((m) => m.role === "user");
			const title = firstUserMsg
				? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? "..." : "")
				: "Saved Chat";
			const channel = await api.createChannel(agentId, title);
			navigate({
				to: "/agents/$agentId/chats/$channelId",
				params: { agentId, channelId: channel.id },
			});
		} catch (err) {
			console.warn("Failed to save chat:", err);
		} finally {
			setIsSaving(false);
		}
	};

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		const trimmed = input.trim();
		if ((!trimmed && pendingAttachments.length === 0) || isStreaming || isUploading) return;

		if (trimmed === "/clear" || trimmed === "/new") {
			setInput("");
			clearChat();
			return;
		}

		setInput("");
		setUploadError(null);
		sendMessage(trimmed, pendingAttachments);
		setPendingAttachments([]);
	};

	const handlePickFiles = () => {
		if (isUploading || isStreaming) return;
		fileInputRef.current?.click();
	};

	const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? []);
		event.target.value = "";
		if (files.length === 0) return;

		setUploadError(null);
		setIsUploading(true);
		try {
			const response = await api.webChatUpload(agentId, files);
			setPendingAttachments((previous) => [...previous, ...response.attachments]);
		} catch (uploadError) {
			const message = uploadError instanceof Error ? uploadError.message : "Upload failed";
			setUploadError(message);
		} finally {
			setIsUploading(false);
		}
	};

	const removeAttachment = (indexToRemove: number) => {
		setPendingAttachments((previous) =>
			previous.filter((_, index) => index !== indexToRemove),
		);
	};

	return (
		<div className="flex h-full w-full flex-col">
			{/* Header */}
			<div className="flex h-12 items-center justify-between border-b border-app-line/50 px-4">
				<span className="text-sm font-medium text-ink">Chat</span>
				<div className="flex items-center gap-1">
					{messages.length > 0 && (
						<Button
							onClick={handleSaveToChats}
							disabled={isSaving}
							variant="ghost"
							size="icon"
							className="h-7 w-7"
							title="Save to Chats"
						>
							<HugeiconsIcon icon={FloppyDiskIcon} className="h-3.5 w-3.5" />
						</Button>
					)}
					<Button
						onClick={clearChat}
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						title="New chat (/clear)"
					>
						<HugeiconsIcon icon={PlusSignIcon} className="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>

			{/* Messages */}
			<div className="flex-1 overflow-y-auto">
				<div className="flex flex-col gap-3 p-4">
					{messages.length === 0 && !isStreaming && (
						<p className="py-8 text-center text-sm text-ink-faint">
							Chat with {agentId}
						</p>
					)}
					{messages.map((message) => (
						<div
							key={message.id}
							className={`rounded-md px-3 py-2 ${
								message.role === "user"
									? "ml-8 bg-accent/10"
									: "mr-2 bg-app-darkBox/50"
							}`}
						>
							<span className={`text-tiny font-medium ${
								message.role === "user" ? "text-accent-faint" : "text-emerald-400"
							}`}>
								{message.role === "user" ? "you" : agentId}
							</span>
							<div className="mt-0.5 text-sm text-ink-dull">
								{message.role === "assistant" ? (
									<Markdown>{message.content}</Markdown>
								) : (
									<p>{message.content}</p>
								)}
							</div>
						</div>
					))}
					{isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
						<div className="mr-2 rounded-md bg-app-darkBox/50 px-3 py-2">
							<span className="text-tiny font-medium text-emerald-400">{agentId}</span>
							<ToolActivityIndicator activity={toolActivity} />
							{toolActivity.length === 0 && (
								<div className="mt-1 flex items-center gap-1">
									<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
									<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 [animation-delay:0.2s]" />
									<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 [animation-delay:0.4s]" />
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
				<input
					ref={fileInputRef}
					type="file"
					multiple
					accept="image/png,image/jpeg,image/gif,image/webp,text/*,application/json,application/xml,application/javascript,application/typescript,application/toml,application/yaml,application/pdf,audio/mpeg,audio/wav,audio/ogg,audio/webm"
					className="hidden"
					onChange={handleFileChange}
				/>
				{pendingAttachments.length > 0 && (
					<div className="mb-2 flex flex-wrap gap-1.5">
						{pendingAttachments.map((attachment, index) => (
							<div
								key={`${attachment.path}-${index}`}
								className="flex items-center gap-1 rounded border border-app-line bg-app-darkBox px-2 py-1 text-tiny text-ink-faint"
							>
								<span className="max-w-56 truncate">{attachment.filename}</span>
								<button
									type="button"
									onClick={() => removeAttachment(index)}
									className="text-ink-faint transition-colors hover:text-ink"
									aria-label={`Remove ${attachment.filename}`}
								>
									<HugeiconsIcon icon={Cancel01Icon} className="h-3 w-3" />
								</button>
							</div>
						))}
					</div>
				)}
				<div className="flex gap-2">
					<Button
						type="button"
						onClick={handlePickFiles}
						disabled={isStreaming || isUploading}
						size="sm"
						variant="ghost"
						className="px-2"
						title="Upload files"
					>
						<HugeiconsIcon icon={Add01Icon} className="h-3.5 w-3.5" />
					</Button>
					<input
						ref={inputRef}
						type="text"
						value={input}
						onChange={(event) => setInput(event.target.value)}
						placeholder={
							isStreaming
								? "Waiting for response..."
								: isUploading
									? "Uploading files..."
									: `Message ${agentId}... · /clear to reset`
						}
						disabled={isStreaming || isUploading}
						className="flex-1 rounded-md border border-app-line bg-app-darkBox px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-emerald-500/50 focus:outline-none disabled:opacity-50"
					/>
					<Button
						type="submit"
						disabled={
							isStreaming
								|| isUploading
								|| (!input.trim() && pendingAttachments.length === 0)
						}
						size="sm"
						className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
					>
						Send
					</Button>
				</div>
				{uploadError && (
					<p className="mt-2 text-tiny text-red-400">{uploadError}</p>
				)}
			</form>
		</div>
	);
}
