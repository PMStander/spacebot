import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { api, type ArtifactInfo } from "@/api/client";
import type { ArtifactKind } from "@/components/create-artifact";
import { useArtifactStore } from "@/hooks/useArtifactStore";
import {
	ArtifactLibraryCard,
	ArtifactLibraryRow,
} from "@/components/ArtifactLibraryCard";
import {
	SearchInput,
	FilterButton,
	ToggleGroup,
} from "@/ui";
import {
	GridViewIcon,
	LeftToRightListBulletIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type ViewMode = "grid" | "list";

const KIND_COLORS: Partial<Record<ArtifactKind, string>> = {
	code: "bg-blue-500/15 text-blue-400",
	text: "bg-emerald-500/15 text-emerald-400",
	image: "bg-pink-500/15 text-pink-400",
	sheet: "bg-amber-500/15 text-amber-400",
	book: "bg-purple-500/15 text-purple-400",
	html: "bg-orange-500/15 text-orange-400",
	chart: "bg-cyan-500/15 text-cyan-400",
	diagram: "bg-teal-500/15 text-teal-400",
	checklist: "bg-green-500/15 text-green-400",
	form: "bg-indigo-500/15 text-indigo-400",
	kanban: "bg-yellow-500/15 text-yellow-400",
	table: "bg-slate-500/15 text-slate-400",
	graph: "bg-red-500/15 text-red-400",
};

function toUIArtifact(a: ArtifactInfo) {
	return {
		id: a.id,
		channelId: a.channel_id,
		kind: a.kind as ArtifactKind,
		title: a.title,
		content: a.content,
		metadata: a.metadata,
		version: a.version,
		status: "idle" as const,
		isVisible: true,
	};
}

interface AgentArtifactsProps {
	agentId: string;
}

export function AgentArtifacts({ agentId }: AgentArtifactsProps) {
	const navigate = useNavigate();
	const [artifacts, setArtifacts] = useState<ArtifactInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [search, setSearch] = useState("");
	const [kindFilter, setKindFilter] = useState<ArtifactKind | null>(null);
	const [viewMode, setViewMode] = useState<ViewMode>(() => {
		return (localStorage.getItem("artifact-library-view") as ViewMode) || "grid";
	});

	useEffect(() => {
		localStorage.setItem("artifact-library-view", viewMode);
	}, [viewMode]);

	useEffect(() => {
		setLoading(true);
		setError(false);
		api.artifacts(agentId)
			.then((res) => {
				setArtifacts(res.artifacts);
			})
			.catch(() => {
				setError(true);
			})
			.finally(() => {
				setLoading(false);
			});
	}, [agentId]);

	const availableKinds = useMemo(() => {
		const kinds = new Set<ArtifactKind>();
		for (const a of artifacts) {
			kinds.add(a.kind as ArtifactKind);
		}
		return Array.from(kinds).sort();
	}, [artifacts]);

	const filtered = useMemo(() => {
		let list = artifacts;
		if (kindFilter) {
			list = list.filter((a) => a.kind === kindFilter);
		}
		if (search.trim()) {
			const q = search.trim().toLowerCase();
			list = list.filter((a) => a.title.toLowerCase().includes(q));
		}
		return list;
	}, [artifacts, kindFilter, search]);

	function handleClick(artifact: ArtifactInfo) {
		if (!artifact.channel_id) {
			return;
		}
		const store = useArtifactStore.getState();
		store.clearArtifact();
		store.setArtifact(toUIArtifact(artifact));
		navigate({
			to: "/agents/$agentId/chats/$channelId",
			params: { agentId, channelId: artifact.channel_id },
		});
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{/* Toolbar */}
			<div className="flex items-center gap-3 border-b border-app-line/50 bg-app-darkBox/20 px-6 py-3">
				<h2 className="text-sm font-medium text-ink">Artifacts</h2>
				<div className="flex-1" />
				<SearchInput
					placeholder="Search artifacts..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="w-64"
				/>
				<ToggleGroup
					value={viewMode}
					onChange={setViewMode}
					options={[
						{
							value: "grid",
							label: (
								<HugeiconsIcon
									icon={GridViewIcon}
									className="h-3.5 w-3.5"
								/>
							),
							title: "Grid view",
						},
						{
							value: "list",
							label: (
								<HugeiconsIcon
									icon={LeftToRightListBulletIcon}
									className="h-3.5 w-3.5"
								/>
							),
							title: "List view",
						},
					]}
				/>
			</div>

			{/* Kind filter pills */}
			{availableKinds.length > 0 && (
				<div className="flex items-center gap-1.5 border-b border-app-line/50 px-6 py-2">
					<FilterButton
						onClick={() => setKindFilter(null)}
						active={kindFilter === null}
					>
						All
					</FilterButton>
					{availableKinds.map((kind) => (
						<FilterButton
							key={kind}
							onClick={() =>
								setKindFilter(kindFilter === kind ? null : kind)
							}
							active={kindFilter === kind}
							colorClass={KIND_COLORS[kind]}
						>
							{kind}
						</FilterButton>
					))}
					{filtered.length > 0 && (
						<span className="ml-auto text-tiny text-ink-faint">
							{filtered.length} artifact{filtered.length !== 1 ? "s" : ""}
						</span>
					)}
				</div>
			)}

			{/* Content */}
			{loading ? (
				<div className="flex flex-1 items-center justify-center">
					<div className="flex items-center gap-2 text-ink-dull">
						<div className="h-2 w-2 animate-pulse rounded-full bg-accent" />
						Loading artifacts...
					</div>
				</div>
			) : error ? (
				<div className="flex flex-1 items-center justify-center">
					<p className="text-sm text-red-400">Failed to load artifacts</p>
				</div>
			) : filtered.length === 0 ? (
				<div className="flex flex-1 items-center justify-center">
					<p className="text-sm text-ink-faint">
						{artifacts.length === 0
							? "No artifacts yet"
							: "No artifacts match your filters"}
					</p>
				</div>
			) : viewMode === "grid" ? (
				<div className="flex-1 overflow-y-auto p-6">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{filtered.map((artifact) => (
							<ArtifactLibraryCard
								key={artifact.id}
								artifact={artifact}
								onClick={() => handleClick(artifact)}
							/>
						))}
					</div>
				</div>
			) : (
				<div className="flex-1 overflow-y-auto">
					{filtered.map((artifact) => (
						<ArtifactLibraryRow
							key={artifact.id}
							artifact={artifact}
							onClick={() => handleClick(artifact)}
						/>
					))}
				</div>
			)}
		</div>
	);
}
