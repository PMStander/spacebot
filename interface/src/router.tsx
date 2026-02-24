import {useMemo, useState} from "react";
import {
	createRouter,
	createRootRoute,
	createRoute,
	Outlet,
} from "@tanstack/react-router";
import {BASE_PATH} from "@/api/client";
import {ConnectionBanner} from "@/components/ConnectionBanner";
import {SetupBanner} from "@/components/SetupBanner";
import {UpdateBanner} from "@/components/UpdateBanner";
import {Sidebar} from "@/components/Sidebar";
import {Overview} from "@/routes/Overview";
import {AgentDetail} from "@/routes/AgentDetail";
import {AgentChannels} from "@/routes/AgentChannels";
import {AgentChats} from "@/routes/AgentChats";
import {AgentCortex} from "@/routes/AgentCortex";
import {ChannelDetail} from "@/routes/ChannelDetail";
import {AgentMemories} from "@/routes/AgentMemories";
import {AgentConfig} from "@/routes/AgentConfig";
import {AgentCron} from "@/routes/AgentCron";
import {AgentIngest} from "@/routes/AgentIngest";
import {AgentWorkers} from "@/routes/AgentWorkers";
import {AgentSkills} from "@/routes/AgentSkills";
import {AgentChat} from "@/routes/AgentChat";
import {AgentCanvas} from "@/routes/AgentCanvas";
import {AgentArtifacts} from "@/routes/AgentArtifacts";
import {Settings} from "@/routes/Settings";
import {useLiveContext} from "@/hooks/useLiveContext";
import {AgentTabs} from "@/components/AgentTabs";

function RootLayout() {
	const {liveStates, connectionState, hasData} = useLiveContext();
	const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

	return (
		<div className="flex h-screen bg-app">
			<Sidebar
				liveStates={liveStates}
				collapsed={sidebarCollapsed}
				onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
			/>
			<div className="flex flex-1 flex-col overflow-hidden">
				<ConnectionBanner state={connectionState} hasData={hasData} />
				<UpdateBanner />
				<SetupBanner />
				<div className="flex-1 overflow-hidden">
					<Outlet />
				</div>
			</div>
		</div>
	);
}

function AgentHeader({agentId}: {agentId: string}) {
	const {liveStates, channels} = useLiveContext();

	const activity = useMemo(() => {
		let workers = 0;
		let branches = 0;
		let typing = 0;
		for (const ch of channels) {
			if (ch.agent_id !== agentId) continue;
			const live = liveStates[ch.id];
			if (!live) continue;
			workers += Object.keys(live.workers).length;
			branches += Object.keys(live.branches).length;
			if (live.isTyping) typing++;
		}
		return {workers, branches, typing};
	}, [channels, liveStates, agentId]);

	const isActive = activity.workers > 0 || activity.branches > 0 || activity.typing > 0;

	return (
		<>
			<header className="flex h-12 items-center border-b border-app-line bg-app-darkBox/50 px-6">
				<h1 className="font-plex text-sm font-medium text-ink">{agentId}</h1>

				<div className="ml-auto flex items-center gap-3">
					{activity.workers > 0 && (
						<div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs">
							<div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
							<span className="font-medium tabular-nums text-amber-400">
								{activity.workers} worker{activity.workers !== 1 ? "s" : ""}
							</span>
						</div>
					)}
					{activity.branches > 0 && (
						<div className="flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-1 text-xs">
							<div className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
							<span className="font-medium tabular-nums text-violet-400">
								{activity.branches} branch{activity.branches !== 1 ? "es" : ""}
							</span>
						</div>
					)}
					{activity.typing > 0 && (
						<div className="flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs">
							<div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
							<span className="font-medium text-accent">typing</span>
						</div>
					)}
					<div className="flex items-center gap-1.5">
						<div
							className={`h-2 w-2 rounded-full ${
								isActive ? "animate-pulse bg-amber-400" : "bg-green-500/60"
							}`}
						/>
						<span className="text-xs text-ink-faint">
							{isActive ? "Active" : "Idle"}
						</span>
					</div>
				</div>
			</header>
			<AgentTabs agentId={agentId} />
		</>
	);
}

const rootRoute = createRootRoute({
	component: RootLayout,
});

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: function IndexPage() {
		const {liveStates, activeLinks} = useLiveContext();
		return <Overview liveStates={liveStates} activeLinks={activeLinks} />;
	},
});

const settingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings",
	validateSearch: (search: Record<string, unknown>): {tab?: string} => {
		return {
			tab: typeof search.tab === "string" ? search.tab : undefined,
		};
	},
	component: function SettingsPage() {
		return <Settings />;
	},
});

const logsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/logs",
	component: function LogsPage() {
		return (
			<div className="flex h-full flex-col">
				<header className="flex h-12 items-center border-b border-app-line bg-app-darkBox/50 px-6">
					<h1 className="font-plex text-sm font-medium text-ink">Logs</h1>
				</header>
				<div className="flex flex-1 items-center justify-center">
					<p className="text-sm text-ink-faint">Logs coming soon</p>
				</div>
			</div>
		);
	},
});

const agentRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agents/$agentId",
	component: function AgentPage() {
		const {agentId} = agentRoute.useParams();
		const {liveStates} = useLiveContext();
		return (
			<div className="flex h-full flex-col">
				<AgentHeader agentId={agentId} />
				<div className="flex-1 overflow-hidden">
					<AgentDetail agentId={agentId} liveStates={liveStates} />
				</div>
			</div>
		);
	},
});

const agentChatRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agents/$agentId/chat",
	component: function AgentChatPage() {
		const {agentId} = agentChatRoute.useParams();
		return (
			<div className="flex h-full flex-col">
				<AgentHeader agentId={agentId} />
				<div className="flex-1 overflow-hidden">
					<AgentChat agentId={agentId} />
				</div>
			</div>
		);
	},
});

const agentCanvasRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agents/$agentId/canvas",
	component: function AgentCanvasPage() {
		const {agentId} = agentCanvasRoute.useParams();
		return (
			<div className="flex h-full flex-col">
				<AgentHeader agentId={agentId} />
				<div className="flex-1 overflow-hidden">
					<AgentCanvas agentId={agentId} />
				</div>
			</div>
		);
	},
});

const agentArtifactsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agents/$agentId/artifacts",
	component: function AgentArtifactsPage() {
		const {agentId} = agentArtifactsRoute.useParams();
		return (
			<div className="flex h-full flex-col">
				<AgentHeader agentId={agentId} />
				<div className="flex-1 overflow-hidden">
					<AgentArtifacts agentId={agentId} />
				</div>
			</div>
		);
	},
});

const agentChannelsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agents/$agentId/channels",
	component: function AgentChannelsPage() {
		const {agentId} = agentChannelsRoute.useParams();
		const {liveStates} = useLiveContext();
		return (
			<div className="flex h-full flex-col">
				<AgentHeader agentId={agentId} />
				<div className="flex-1 overflow-hidden">
					<AgentChannels agentId={agentId} liveStates={liveStates} />
				</div>
			</div>
		);
	},
});

const agentChatsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agents/$agentId/chats",
	component: function AgentChatsPage() {
		const {agentId} = agentChatsRoute.useParams();
		const {liveStates} = useLiveContext();
		return (
			<div className="flex h-full flex-col">
				<AgentHeader agentId={agentId} />
				<div className="flex-1 overflow-hidden">
					<AgentChats agentId={agentId} liveStates={liveStates} />
				</div>
			</div>
		);
	},
});

const chatDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agents/$agentId/chats/$channelId",
	component: function ChatDetailPage() {
		const {agentId, channelId} = chatDetailRoute.useParams();
		const {liveStates, channels, loadOlderMessages} = useLiveContext();
		const channel = channels.find((c) => c.id === channelId);
		return (
			<div className="flex h-full flex-col">
				<AgentHeader agentId={agentId} />
				<div className="flex-1 overflow-hidden">
					<ChannelDetail
						agentId={agentId}
						channelId={channelId}
						channel={channel}
						liveState={liveStates[channelId]}
						onLoadMore={() => loadOlderMessages(channelId)}
					/>
				</div>
			</div>
		);
	},
});

const agentMemoriesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agents/$agentId/memories",
	component: function AgentMemoriesPage() {
		const {agentId} = agentMemoriesRoute.useParams();
		return (
			<div className="flex h-full flex-col">
				<AgentHeader agentId={agentId} />
				<div className="flex-1 overflow-hidden">
					<AgentMemories agentId={agentId} />
				</div>
			</div>
		);
	},
});

const agentIngestRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agents/$agentId/ingest",
	component: function AgentIngestPage() {
		const {agentId} = agentIngestRoute.useParams();
		return (
			<div className="flex h-full flex-col">
				<AgentHeader agentId={agentId} />
				<div className="flex-1 overflow-hidden">
					<AgentIngest agentId={agentId} />
				</div>
			</div>
		);
	},
});

const agentWorkersRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agents/$agentId/workers",
	component: function AgentWorkersPage() {
		const {agentId} = agentWorkersRoute.useParams();
		const {liveStates} = useLiveContext();
		return (
			<div className="flex h-full flex-col">
				<AgentHeader agentId={agentId} />
				<div className="flex-1 overflow-hidden">
					<AgentWorkers agentId={agentId} liveStates={liveStates} />
				</div>
			</div>
		);
	},
});

const agentCronRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agents/$agentId/cron",
	component: function AgentCronPage() {
		const {agentId} = agentCronRoute.useParams();
		return (
			<div className="flex h-full flex-col">
				<AgentHeader agentId={agentId} />
				<div className="flex-1 overflow-hidden">
					<AgentCron agentId={agentId} />
				</div>
			</div>
		);
	},
});

const agentConfigRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agents/$agentId/config",
	validateSearch: (search: Record<string, unknown>): {tab?: string} => {
		return {
			tab: typeof search.tab === "string" ? search.tab : undefined,
		};
	},
	component: function AgentConfigPage() {
		const {agentId} = agentConfigRoute.useParams();
		return (
			<div className="flex h-full flex-col">
				<AgentHeader agentId={agentId} />
				<div className="flex-1 overflow-hidden">
					<AgentConfig agentId={agentId} />
				</div>
			</div>
		);
	},
});

const agentCortexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agents/$agentId/cortex",
	component: function AgentCortexPage() {
		const {agentId} = agentCortexRoute.useParams();
		return (
			<div className="flex h-full flex-col">
				<AgentHeader agentId={agentId} />
				<div className="flex-1 overflow-hidden">
					<AgentCortex agentId={agentId} />
				</div>
			</div>
		);
	},
});

const agentSkillsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agents/$agentId/skills",
	component: function AgentSkillsPage() {
		const {agentId} = agentSkillsRoute.useParams();
		return (
			<div className="flex h-full flex-col">
				<AgentHeader agentId={agentId} />
				<div className="flex-1 overflow-hidden">
					<AgentSkills agentId={agentId} />
				</div>
			</div>
		);
	},
});

const channelRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agents/$agentId/channels/$channelId",
	component: function ChannelPage() {
		const {agentId, channelId} = channelRoute.useParams();
		const {liveStates, channels, loadOlderMessages} = useLiveContext();
		const channel = channels.find((c) => c.id === channelId);
		return (
			<div className="flex h-full flex-col">
				<AgentHeader agentId={agentId} />
				<div className="flex-1 overflow-hidden">
					<ChannelDetail
						agentId={agentId}
						channelId={channelId}
						channel={channel}
						liveState={liveStates[channelId]}
						onLoadMore={() => loadOlderMessages(channelId)}
					/>
				</div>
			</div>
		);
	},
});

const routeTree = rootRoute.addChildren([
	indexRoute,
	settingsRoute,
	logsRoute,
	agentRoute,
	agentChatRoute,
	agentCanvasRoute,
	agentArtifactsRoute,
	agentChannelsRoute,
	agentChatsRoute,
	chatDetailRoute,
	agentMemoriesRoute,
	agentIngestRoute,
	agentWorkersRoute,
	agentCortexRoute,
	agentSkillsRoute,
	agentCronRoute,
	agentConfigRoute,
	channelRoute,
]);

export const router = createRouter({
	routeTree,
	basepath: BASE_PATH || "/",
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
