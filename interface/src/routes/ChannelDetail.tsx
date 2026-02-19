import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { api, type ChannelInfo, type TimelineItem, type TimelineBranchRun, type TimelineWorkerRun } from "@/api/client";
import type { ChannelLiveState, ActiveWorker, ActiveBranch } from "@/hooks/useChannelLiveState";
import { CortexChatPanel } from "@/components/CortexChatPanel";
import { ArtifactPanel } from "@/components/ArtifactPanel";
import { ArtifactSkeleton } from "@/components/ArtifactSkeleton";
import { useArtifactStore } from "@/hooks/useArtifactStore";
import { artifactRegistry } from "@/components/artifacts/index";
import { useCortexChat, type ArtifactPayload } from "@/hooks/useCortexChat";
import type { UIArtifact, ArtifactKind } from "@/components/create-artifact";
import { LiveDuration } from "@/components/LiveDuration";
import { Markdown } from "@/components/Markdown";
import { formatTimestamp, platformIcon, platformColor } from "@/lib/format";
import { Button } from "@/ui";
import { Cancel01Icon, IdeaIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

interface ChannelDetailProps {
	agentId: string;
	channelId: string;
	channel: ChannelInfo | undefined;
	liveState: ChannelLiveState | undefined;
	onLoadMore: () => void;
}

function CancelButton({ onClick }: { onClick: () => void }) {
	const [cancelling, setCancelling] = useState(false);
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			disabled={cancelling}
			onClick={(e) => {
				e.stopPropagation();
				setCancelling(true);
				onClick();
			}}
			className="ml-auto h-7 w-7 flex-shrink-0 text-ink-faint/50 hover:bg-red-500/15 hover:text-red-400"
			title="Cancel"
		>
			<HugeiconsIcon icon={Cancel01Icon} className="h-3.5 w-3.5" />
		</Button>
	);
}

function LiveBranchRunItem({ item, live, channelId }: { item: TimelineBranchRun; live: ActiveBranch; channelId: string }) {
	const displayTool = live.currentTool ?? live.lastTool;
	return (
		<div className="flex gap-3 px-3 py-2">
			<span className="flex-shrink-0 pt-0.5 text-tiny text-ink-faint">
				{formatTimestamp(new Date(item.started_at).getTime())}
			</span>
			<div className="min-w-0 flex-1">
				<div className="rounded-md bg-violet-500/10 px-3 py-2">
					<div className="flex items-center gap-2">
						<div className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
						<span className="text-sm font-medium text-violet-300">Branch</span>
						<span className="truncate text-sm text-ink-dull">{item.description}</span>
						<CancelButton onClick={() => { api.cancelProcess(channelId, "branch", item.id).catch(console.warn); }} />
					</div>
					<div className="mt-1 flex items-center gap-3 pl-4 text-tiny text-ink-faint">
						<LiveDuration startMs={live.startedAt} />
						{displayTool && (
							<span className={live.currentTool ? "text-violet-400/70" : "text-violet-400/40"}>{displayTool}</span>
						)}
						{live.toolCalls > 0 && (
							<span>{live.toolCalls} tool calls</span>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function LiveWorkerRunItem({ item, live, channelId }: { item: TimelineWorkerRun; live: ActiveWorker; channelId: string }) {
	return (
		<div className="flex gap-3 px-3 py-2">
			<span className="flex-shrink-0 pt-0.5 text-tiny text-ink-faint">
				{formatTimestamp(new Date(item.started_at).getTime())}
			</span>
			<div className="min-w-0 flex-1">
				<div className="rounded-md bg-amber-500/10 px-3 py-2">
					<div className="flex items-center gap-2">
						<div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
						<span className="text-sm font-medium text-amber-300">Worker</span>
						<span className="truncate text-sm text-ink-dull">{item.task}</span>
						<CancelButton onClick={() => { api.cancelProcess(channelId, "worker", item.id).catch(console.warn); }} />
					</div>
					<div className="mt-1 flex items-center gap-3 pl-4 text-tiny text-ink-faint">
						<span>{live.status}</span>
						{live.currentTool && (
							<span className="text-amber-400/70">{live.currentTool}</span>
						)}
						{live.toolCalls > 0 && (
							<span>{live.toolCalls} tool calls</span>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function BranchRunItem({ item }: { item: TimelineBranchRun }) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div className="flex gap-3 px-3 py-2">
			<span className="flex-shrink-0 pt-0.5 text-tiny text-ink-faint">
				{formatTimestamp(new Date(item.started_at).getTime())}
			</span>
			<div className="min-w-0 flex-1">
				<Button
					type="button"
					onClick={() => setExpanded(!expanded)}
					variant="ghost"
					className="h-auto w-full justify-start rounded-md bg-violet-500/10 px-3 py-2 text-left hover:bg-violet-500/15"
				>
					<div className="flex items-center gap-2">
						<div className="h-2 w-2 rounded-full bg-violet-400/50" />
						<span className="text-sm font-medium text-violet-300">Branch</span>
						<span className="truncate text-sm text-ink-dull">{item.description}</span>
						{item.conclusion && (
							<span className="ml-auto text-tiny text-ink-faint">
								{expanded ? "▾" : "▸"}
							</span>
						)}
					</div>
				</Button>
				{expanded && item.conclusion && (
					<div className="mt-1 rounded-md border border-violet-500/10 bg-violet-500/5 px-3 py-2">
						<div className="text-sm text-ink-dull">
							<Markdown>{item.conclusion}</Markdown>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function WorkerRunItem({ item }: { item: TimelineWorkerRun }) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div className="flex gap-3 px-3 py-2">
			<span className="flex-shrink-0 pt-0.5 text-tiny text-ink-faint">
				{formatTimestamp(new Date(item.started_at).getTime())}
			</span>
			<div className="min-w-0 flex-1">
				<Button
					type="button"
					onClick={() => setExpanded(!expanded)}
					variant="ghost"
					className="h-auto w-full justify-start rounded-md bg-amber-500/10 px-3 py-2 text-left hover:bg-amber-500/15"
				>
					<div className="flex items-center gap-2">
						<div className="h-2 w-2 rounded-full bg-amber-400/50" />
						<span className="text-sm font-medium text-amber-300">Worker</span>
						<span className="truncate text-sm text-ink-dull">{item.task}</span>
						{item.result && (
							<span className="ml-auto text-tiny text-ink-faint">
								{expanded ? "▾" : "▸"}
							</span>
						)}
					</div>
				</Button>
				{expanded && item.result && (
					<div className="mt-1 rounded-md border border-amber-500/10 bg-amber-500/5 px-3 py-2">
						<div className="text-sm text-ink-dull">
							<Markdown>{item.result}</Markdown>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function TimelineEntry({ item, liveWorkers, liveBranches, channelId }: {
	item: TimelineItem;
	liveWorkers: Record<string, ActiveWorker>;
	liveBranches: Record<string, ActiveBranch>;
	channelId: string;
}) {
	switch (item.type) {
		case "message":
			return (
				<div
					className={`flex gap-3 rounded-md px-3 py-2 ${
						item.role === "user" ? "bg-app-darkBox/30" : ""
					}`}
				>
					<span className="flex-shrink-0 pt-0.5 text-tiny text-ink-faint">
						{formatTimestamp(new Date(item.created_at).getTime())}
					</span>
					<div className="min-w-0 flex-1">
						<span className={`text-sm font-medium ${
							item.role === "user" ? "text-accent-faint" : "text-green-400"
						}`}>
							{item.role === "user" ? (item.sender_name ?? "user") : "bot"}
						</span>
						<div className="mt-0.5 text-sm text-ink-dull">
							<Markdown>{item.content}</Markdown>
						</div>
					</div>
				</div>
			);
		case "branch_run": {
			const live = liveBranches[item.id];
			if (live) return <LiveBranchRunItem item={item} live={live} channelId={channelId} />;
			return <BranchRunItem item={item} />;
		}
		case "worker_run": {
			const live = liveWorkers[item.id];
			if (live) return <LiveWorkerRunItem item={item} live={live} channelId={channelId} />;
			return <WorkerRunItem item={item} />;
		}
	}
}

function ArtifactPanelRenderer({ artifact, agentId, channelId, onClose }: {
	artifact: UIArtifact;
	agentId: string;
	channelId: string;
	onClose: () => void;
}) {
	const { metadata, setMetadata, versions, pushVersion } = useArtifactStore();
	const { sendMessage } = useCortexChat(agentId, channelId);
	const [versionIndex, setVersionIndex] = useState(versions.length > 0 ? versions.length - 1 : 0);
	const [mode, setMode] = useState<"view" | "diff">("view");

	const artifactDef = artifactRegistry.get(artifact.kind);

	// Seed the version history with the current artifact content on open
	useEffect(() => {
		if (versions.length === 0) {
			pushVersion(artifact.content);
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [artifact.id]);

	// Run artifact-type initialization (sets up initial metadata)
	useEffect(() => {
		if (artifactDef) {
			artifactDef.initialize({ artifactId: artifact.id, setMetadata });
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [artifact.id, artifactDef]);

	const handleVersionChange = useCallback((type: "next" | "prev" | "toggle" | "latest") => {
		if (type === "prev") setVersionIndex((i) => Math.max(0, i - 1));
		else if (type === "next") setVersionIndex((i) => Math.min(versions.length - 1, i + 1));
		else if (type === "toggle") setMode((m) => (m === "diff" ? "view" : "diff"));
		else if (type === "latest") setVersionIndex(versions.length - 1);
	}, [versions.length]);

	const handleSaveContent = useCallback((updated: string, _debounce: boolean) => {
		pushVersion(updated);
	}, [pushVersion]);

	const getVersionContentById = useCallback((index: number): string => {
		return versions[index] ?? artifact.content;
	}, [versions, artifact.content]);

	const actionContext = {
		content: artifact.content,
		handleVersionChange,
		currentVersionIndex: versionIndex,
		isCurrentVersion: versionIndex === versions.length - 1 || versions.length === 0,
		mode,
		metadata: metadata ?? {},
		setMetadata,
	};

	const toolbarContext = { sendMessage };

	const actions = artifactDef?.actions.map((action, i) => (
		<button
			key={i}
			title={action.description}
			disabled={action.isDisabled?.(actionContext) ?? false}
			onClick={() => action.onClick(actionContext)}
			className="flex h-7 w-7 items-center justify-center rounded text-ink-faint hover:bg-app-line/50 hover:text-ink disabled:opacity-40"
		>
			{action.icon}
		</button>
	));

	const toolbar = artifactDef?.toolbar.map((item, i) => (
		<button
			key={i}
			title={item.description}
			onClick={() => item.onClick(toolbarContext)}
			className="flex h-7 items-center gap-1.5 rounded px-2 text-tiny text-ink-faint hover:bg-app-line/50 hover:text-ink"
		>
			{item.icon}
			<span>{item.description}</span>
		</button>
	));

	if (!artifactDef) {
		return (
			<ArtifactPanel title={artifact.title} onClose={onClose} agentId={agentId}>
				<ArtifactSkeleton />
			</ArtifactPanel>
		);
	}

	const ContentComponent = artifactDef.content;

	return (
		<ArtifactPanel title={artifact.title} onClose={onClose} agentId={agentId} actions={<>{actions}</>} toolbar={toolbar && <>{toolbar}</>}>
			<ContentComponent
				title={artifact.title}
				content={artifact.content}
				mode={mode}
				isCurrentVersion={versionIndex === versions.length - 1 || versions.length === 0}
				currentVersionIndex={versionIndex}
				status={artifact.status}
				onSaveContent={handleSaveContent}
				isLoading={false}
				metadata={metadata ?? {}}
				setMetadata={setMetadata}
				getVersionContentById={getVersionContentById}
			/>
		</ArtifactPanel>
	);
}

export function ChannelDetail({ agentId, channelId, channel, liveState, onLoadMore }: ChannelDetailProps) {
	const timeline = liveState?.timeline ?? [];
	const hasMore = liveState?.hasMore ?? false;
	const loadingMore = liveState?.loadingMore ?? false;
	const isTyping = liveState?.isTyping ?? false;
	const workers = liveState?.workers ?? {};
	const branches = liveState?.branches ?? {};
	const activeWorkerCount = Object.keys(workers).length;
	const activeBranchCount = Object.keys(branches).length;
	const hasActivity = activeWorkerCount > 0 || activeBranchCount > 0;
	type PanelKind = "closed" | "cortex" | "artifact";
	const [panelKind, setPanelKind] = useState<PanelKind>("cortex");
	const { artifact, clearArtifact } = useArtifactStore();

	// Open an artifact in the split-screen panel (from timeline clicks or cortex chat)
	const openArtifact = useCallback((art: UIArtifact) => {
		useArtifactStore.getState().clearArtifact();
		useArtifactStore.getState().setArtifact(art);
		setPanelKind("artifact");
	}, []);

	// Called when cortex chat emits an artifact_done event
	const handleArtifactFromCortex = useCallback((payload: ArtifactPayload) => {
		openArtifact({
			id: payload.id,
			channelId,
			kind: payload.kind as ArtifactKind,
			title: payload.title,
			content: payload.content,
			metadata: null,
			version: 1,
			status: "idle",
			isVisible: true,
		});
	}, [channelId, openArtifact]);

	const scrollRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);

	// Trigger load when the sentinel at the top of the timeline becomes visible
	const handleIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
		if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
			onLoadMore();
		}
	}, [hasMore, loadingMore, onLoadMore]);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) return;
		const observer = new IntersectionObserver(handleIntersection, {
			root: scrollRef.current,
			rootMargin: "200px",
		});
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [handleIntersection]);

	// Full split-screen when artifact is open: cortex (400px left) + artifact (flex-1 right)
	if (panelKind === "artifact" && artifact) {
		return (
			<div className="flex h-full">
				<motion.div
					initial={{ width: 0, opacity: 0 }}
					animate={{ width: 400, opacity: 1 }}
					transition={{ type: "spring", stiffness: 400, damping: 30 }}
					className="flex-shrink-0 overflow-hidden border-r border-app-line/50"
				>
					<div className="h-full w-[400px]">
						<CortexChatPanel
							agentId={agentId}
							channelId={channelId}
							onClose={() => { clearArtifact(); setPanelKind("closed"); }}
							onArtifactReceived={handleArtifactFromCortex}
						/>
					</div>
				</motion.div>
				<motion.div
					initial={{ opacity: 0, x: 20 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.05 }}
					className="min-w-0 flex-1 overflow-hidden border-l border-app-line/50"
				>
					<ArtifactPanelRenderer
						artifact={artifact}
						agentId={agentId}
						channelId={channelId}
						onClose={() => { clearArtifact(); setPanelKind("cortex"); }}
					/>
				</motion.div>
			</div>
		);
	}

	return (
		<div className="flex h-full">
			{/* Main channel content */}
			<div className="flex flex-1 flex-col overflow-hidden">
				{/* Channel sub-header */}
				<div className="flex h-12 items-center gap-3 border-b border-app-line/50 bg-app-darkBox/20 px-6">
					<Link
						to="/agents/$agentId/channels"
						params={{ agentId }}
						className="text-tiny text-ink-faint hover:text-ink-dull"
					>
						Channels
					</Link>
					<span className="text-ink-faint/50">/</span>
					<span className="text-sm font-medium text-ink">
						{channel?.display_name ?? channelId}
					</span>
					{channel && (
						<span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-tiny font-medium ${platformColor(channel.platform)}`}>
							{platformIcon(channel.platform)}
						</span>
					)}

					{/* Right side: activity indicators + typing + cortex toggle */}
					<div className="ml-auto flex items-center gap-3">
						{hasActivity && (
							<div className="flex items-center gap-2">
								{activeWorkerCount > 0 && (
									<div className="flex items-center gap-1.5">
										<div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
										<span className="text-tiny text-amber-300">
											{activeWorkerCount} worker{activeWorkerCount !== 1 ? "s" : ""}
										</span>
									</div>
								)}
								{activeBranchCount > 0 && (
									<div className="flex items-center gap-1.5">
										<div className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
										<span className="text-tiny text-violet-300">
											{activeBranchCount} branch{activeBranchCount !== 1 ? "es" : ""}
										</span>
									</div>
								)}
							</div>
						)}
						{isTyping && (
							<div className="flex items-center gap-1">
								<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
								<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:0.2s]" />
								<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:0.4s]" />
								<span className="ml-1 text-tiny text-ink-faint">typing</span>
							</div>
						)}
					<Button
						onClick={() => setPanelKind(panelKind === "cortex" ? "closed" : "cortex")}
						variant={panelKind === "cortex" ? "secondary" : "ghost"}
						size="icon"
						className={`h-8 w-8 ${panelKind === "cortex" ? "bg-violet-500/20 text-violet-400" : ""}`}
						title="Toggle cortex chat"
					>
						<HugeiconsIcon icon={IdeaIcon} className="h-4 w-4" />
					</Button>
					</div>
				</div>

				{/* Timeline — flex-col-reverse keeps scroll pinned to bottom */}
				<div ref={scrollRef} className="flex flex-1 flex-col-reverse overflow-y-auto">
					<div className="flex flex-col gap-1 p-6">
						{/* Sentinel for infinite scroll — sits above the oldest item */}
						<div ref={sentinelRef} className="h-px" />
						{loadingMore && (
							<div className="flex justify-center py-3">
								<span className="text-tiny text-ink-faint">Loading older messages...</span>
							</div>
						)}
						{!hasMore && timeline.length > 0 && (
							<div className="flex justify-center py-3">
								<span className="text-tiny text-ink-faint/50">Beginning of conversation</span>
							</div>
						)}
						{timeline.length === 0 ? (
							<p className="text-sm text-ink-faint">No messages yet</p>
						) : (
							timeline.map((item) => (
								<TimelineEntry
									key={item.id}
									item={item}
									liveWorkers={workers}
									liveBranches={branches}
									channelId={channelId}
								/>
							))
						)}
						{isTyping && (
							<div className="flex gap-3 px-3 py-2">
								<span className="flex-shrink-0 pt-0.5 text-tiny text-ink-faint">
									{formatTimestamp(Date.now())}
								</span>
								<div className="flex items-center gap-1.5">
									<span className="text-sm font-medium text-green-400">bot</span>
									<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink-faint" />
									<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink-faint [animation-delay:0.2s]" />
									<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink-faint [animation-delay:0.4s]" />
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Cortex panel (artifact split-screen is rendered separately above) */}
			<AnimatePresence>
				{panelKind === "cortex" && (
					<motion.div
						initial={{ width: 0, opacity: 0 }}
						animate={{ width: 400, opacity: 1 }}
						exit={{ width: 0, opacity: 0 }}
						transition={{ type: "spring", stiffness: 400, damping: 30 }}
						className="flex-shrink-0 overflow-hidden border-l border-app-line/50"
					>
						<div className="h-full w-[400px]">
							<CortexChatPanel
								agentId={agentId}
								channelId={channelId}
								onClose={() => setPanelKind("closed")}
								onArtifactReceived={handleArtifactFromCortex}
							/>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
