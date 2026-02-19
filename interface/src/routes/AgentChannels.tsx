import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { ChannelCard } from "@/components/ChannelCard";
import { Button, SearchInput } from "@/ui";
import type { ChannelLiveState } from "@/hooks/useChannelLiveState";
import { Add01Icon, Settings02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";

interface AgentChannelsProps {
	agentId: string;
	liveStates: Record<string, ChannelLiveState>;
}

export function AgentChannels({ agentId, liveStates }: AgentChannelsProps) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [searchQuery, setSearchQuery] = useState("");
	const [creating, setCreating] = useState(false);

	const { data: channelsData, isLoading } = useQuery({
		queryKey: ["channels"],
		queryFn: api.channels,
		refetchInterval: 10_000,
	});

	const allAgentChannels = useMemo(() => {
		return (channelsData?.channels ?? []).filter((c) => c.agent_id === agentId);
	}, [channelsData, agentId]);

	const { internalChannels, externalChannels } = useMemo(() => {
		const filtered = searchQuery
			? allAgentChannels.filter((c) => {
				const q = searchQuery.toLowerCase();
				return (
					c.id.toLowerCase().includes(q) ||
					(c.display_name && c.display_name.toLowerCase().includes(q)) ||
					(c.platform && c.platform.toLowerCase().includes(q))
				);
			})
			: allAgentChannels;

		return {
			internalChannels: filtered.filter((c) => c.platform === "internal"),
			externalChannels: filtered.filter((c) => c.platform !== "internal"),
		};
	}, [allAgentChannels, searchQuery]);

	const handleNewChat = async () => {
		setCreating(true);
		try {
			const channel = await api.createChannel(agentId);
			await queryClient.invalidateQueries({ queryKey: ["channels"] });
			navigate({
				to: "/agents/$agentId/channels/$channelId",
				params: { agentId, channelId: channel.id },
			});
		} catch (error) {
			console.warn("Failed to create channel:", error);
		} finally {
			setCreating(false);
		}
	};

	const hasAny = allAgentChannels.length > 0;

	return (
		<div className="flex h-full flex-col">
			{hasAny && (
				<div className="flex items-center gap-3 border-b border-app-line/50 bg-app-darkBox/20 px-6 py-3">
					<SearchInput
						placeholder="Search channels..."
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
						className="flex-1"
					/>
					<Button onClick={handleNewChat} disabled={creating} size="sm" variant="secondary" className="gap-1.5">
						<HugeiconsIcon icon={Add01Icon} className="h-3.5 w-3.5" />
						New Chat
					</Button>
				</div>
			)}
			<div className="flex-1 overflow-y-auto p-6">
				{isLoading ? (
					<div className="flex items-center gap-2 text-ink-dull">
						<div className="h-2 w-2 animate-pulse rounded-full bg-accent" />
						Loading channels...
					</div>
				) : !hasAny ? (
					<div className="flex h-full items-start justify-center pt-[15vh]">
						<div className="flex max-w-sm flex-col items-center rounded-xl border border-dashed border-app-line/50 bg-app-darkBox/20 p-8 text-center">
							<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-app-line bg-app-darkBox">
								<HugeiconsIcon icon={Settings02Icon} className="h-6 w-6 text-ink-faint" />
							</div>
							<h3 className="mb-1 font-plex text-sm font-medium text-ink">No channels yet</h3>
							<p className="mb-5 max-w-md text-sm text-ink-faint">
								Start a new internal chat, or connect a messaging platform in Settings.
							</p>
							<div className="flex gap-2">
								<Button onClick={handleNewChat} disabled={creating} size="sm">
									<HugeiconsIcon icon={Add01Icon} className="mr-1.5 h-3.5 w-3.5" />
									New Chat
								</Button>
								<Button
									onClick={() => navigate({ to: "/settings", search: { tab: "channels" } })}
									variant="secondary"
									size="sm"
								>
									Go to Settings
								</Button>
							</div>
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-8">
						{/* Internal chats section */}
						<div>
							<div className="mb-3 flex items-center justify-between">
								<h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
									Chats
								</h2>
								<Button onClick={handleNewChat} disabled={creating} size="sm" variant="ghost" className="h-7 gap-1 text-xs text-ink-faint">
									<HugeiconsIcon icon={Add01Icon} className="h-3 w-3" />
									New
								</Button>
							</div>
							{internalChannels.length > 0 ? (
								<div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
									{internalChannels.map((channel) => (
										<ChannelCard
											key={channel.id}
											channel={channel}
											liveState={liveStates[channel.id]}
										/>
									))}
								</div>
							) : (
								<p className="text-sm text-ink-faint">
									No internal chats yet.{" "}
									<button
										onClick={handleNewChat}
										disabled={creating}
										className="text-accent underline decoration-accent/30 hover:decoration-accent/60 disabled:opacity-50"
									>
										Start one
									</button>
									.
								</p>
							)}
						</div>

						{/* External channels section */}
						{externalChannels.length > 0 && (
							<div>
								<h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
									Channels
								</h2>
								<div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
									{externalChannels.map((channel) => (
										<ChannelCard
											key={channel.id}
											channel={channel}
											liveState={liveStates[channel.id]}
										/>
									))}
								</div>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
