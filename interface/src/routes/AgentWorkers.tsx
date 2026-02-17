import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api, type WorkerRunInfo } from "@/api/client";
import type { ChannelLiveState } from "@/hooks/useChannelLiveState";
import { formatTimeAgo } from "@/lib/format";
import { Badge, Button } from "@/ui";

interface AgentWorkersProps {
	agentId: string;
	liveStates: Record<string, ChannelLiveState>;
}

type StatusFilter = "all" | "running" | "done" | "failed";

export function AgentWorkers({ agentId, liveStates }: AgentWorkersProps) {
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const { data, isLoading } = useQuery({
		queryKey: ["worker-runs", agentId, statusFilter],
		queryFn: () => api.workerRuns(agentId, {
			limit: 50,
			status: statusFilter === "all" ? undefined : statusFilter,
		}),
		refetchInterval: 10_000,
	});

	const activeWorkers = useMemo(() => {
		const workers: Array<{ id: string; task: string; status: string; channelId: string; startedAt: number; toolCalls: number; currentTool: string | null }> = [];
		for (const [channelId, state] of Object.entries(liveStates)) {
			for (const worker of Object.values(state.workers)) {
				workers.push({ ...worker, channelId, startedAt: worker.startedAt, toolCalls: worker.toolCalls, currentTool: worker.currentTool });
			}
		}
		return workers.sort((a, b) => b.startedAt - a.startedAt);
	}, [liveStates]);

	const runs = data?.runs ?? [];
	const total = data?.total ?? 0;

	const filters: { value: StatusFilter; label: string }[] = [
		{ value: "all", label: "All" },
		{ value: "running", label: "Running" },
		{ value: "done", label: "Completed" },
		{ value: "failed", label: "Failed" },
	];

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{/* Active workers */}
			{activeWorkers.length > 0 && (
				<div className="border-b border-app-line bg-app-darkBox/30 px-6 py-4">
					<h3 className="mb-3 text-tiny font-semibold uppercase tracking-wider text-ink-dull">
						Active Workers ({activeWorkers.length})
					</h3>
					<div className="flex flex-col gap-2">
						{activeWorkers.map((worker) => (
							<ActiveWorkerCard
								key={worker.id}
								worker={worker}
								agentId={agentId}
							/>
						))}
					</div>
				</div>
			)}

			{/* Filter bar */}
			<div className="flex items-center gap-2 border-b border-app-line px-6 py-3">
				{filters.map((f) => (
					<button
						key={f.value}
						onClick={() => setStatusFilter(f.value)}
						className={`rounded-md px-3 py-1 text-sm transition-colors ${
							statusFilter === f.value
								? "bg-accent/20 text-accent"
								: "text-ink-dull hover:bg-app-hover hover:text-ink"
						}`}
					>
						{f.label}
					</button>
				))}
				<span className="ml-auto text-tiny text-ink-faint">
					{total} total
				</span>
			</div>

			{/* Worker run history */}
			<div className="flex-1 overflow-y-auto px-6 py-4">
				{isLoading ? (
					<div className="flex items-center gap-2 text-ink-dull">
						<div className="h-2 w-2 animate-pulse rounded-full bg-accent" />
						Loading worker history...
					</div>
				) : runs.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-16">
						<p className="text-sm text-ink-faint">
							{statusFilter === "all"
								? "No worker runs yet. Workers are spawned by the channel when it needs to delegate tasks."
								: `No ${statusFilter} workers found.`}
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{runs.map((run) => (
							<WorkerRunCard
								key={run.id}
								run={run}
								agentId={agentId}
								expanded={expandedId === run.id}
								onToggle={() => setExpandedId(expandedId === run.id ? null : run.id)}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function ActiveWorkerCard({ worker, agentId }: {
	worker: { id: string; task: string; status: string; channelId: string; startedAt: number; toolCalls: number; currentTool: string | null };
	agentId: string;
}) {
	const elapsed = Math.floor((Date.now() - worker.startedAt) / 1000);
	const minutes = Math.floor(elapsed / 60);
	const seconds = elapsed % 60;

	return (
		<div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
						<span className="text-sm font-medium text-ink">{worker.task}</span>
					</div>
					<div className="mt-1.5 flex items-center gap-3 text-tiny text-ink-faint">
						<span>{worker.status}</span>
						{worker.toolCalls > 0 && <span>{worker.toolCalls} tool calls</span>}
						{worker.currentTool && (
							<span className="text-amber-300">running {worker.currentTool}</span>
						)}
						<span>{minutes}m {seconds}s elapsed</span>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Link
						to="/agents/$agentId/channels/$channelId"
						params={{ agentId, channelId: worker.channelId }}
						className="text-tiny text-accent hover:underline"
					>
						channel
					</Link>
					<Button
						size="sm"
						variant="ghost"
						className="text-red-400 hover:text-red-300"
						onClick={() => {
							api.cancelProcess(worker.channelId, "worker", worker.id).catch(console.warn);
						}}
					>
						Cancel
					</Button>
				</div>
			</div>
		</div>
	);
}

function WorkerRunCard({ run, agentId, expanded, onToggle }: {
	run: WorkerRunInfo;
	agentId: string;
	expanded: boolean;
	onToggle: () => void;
}) {
	const duration = run.completed_at
		? Math.floor((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
		: null;

	const statusColor = run.status === "done"
		? "text-green-400"
		: run.status === "running"
			? "text-amber-400"
			: "text-red-400";

	const statusBadgeVariant = run.status === "done" ? "green" : run.status === "running" ? "amber" : "red";

	return (
		<div
			className="rounded-lg border border-app-line bg-app-box transition-colors hover:border-app-line/80"
		>
			<button
				onClick={onToggle}
				className="flex w-full items-start gap-3 px-4 py-3 text-left"
			>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<Badge size="sm" variant={statusBadgeVariant}>
							{run.status}
						</Badge>
						<span className="truncate text-sm text-ink">{run.task}</span>
					</div>
					<div className="mt-1 flex items-center gap-3 text-tiny text-ink-faint">
						<span>{formatTimeAgo(run.started_at)}</span>
						{duration !== null && <span>{formatDurationCompact(duration)}</span>}
						{run.channel_id && (
							<Link
								to="/agents/$agentId/channels/$channelId"
								params={{ agentId, channelId: run.channel_id }}
								className="text-accent hover:underline"
								onClick={(e) => e.stopPropagation()}
							>
								channel
							</Link>
						)}
					</div>
				</div>
				<span className={`text-tiny ${statusColor}`}>
					{expanded ? "collapse" : "expand"}
				</span>
			</button>

			{expanded && run.result && (
				<div className="border-t border-app-line px-4 py-3">
					<p className="text-tiny font-medium text-ink-dull">Result</p>
					<pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-app-darkBox/50 p-3 font-mono text-tiny text-ink">
						{run.result}
					</pre>
				</div>
			)}
		</div>
	);
}

function formatDurationCompact(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const secs = seconds % 60;
	if (minutes < 60) return `${minutes}m ${secs}s`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${minutes % 60}m`;
}
