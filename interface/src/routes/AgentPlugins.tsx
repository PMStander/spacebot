import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api, type PluginInfo } from "@/api/client";
import { Badge } from "@/ui";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faPuzzlePiece, faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";

function PluginCard({ plugin, agentId }: { plugin: PluginInfo; agentId: string }) {
	return (
		<div className="flex flex-col rounded-lg border border-app-line bg-app-box p-4 transition-colors hover:border-app-line-hover">
			<div className="flex items-start justify-between gap-3">
				<div className="flex-1">
					<div className="flex items-center gap-2">
						<FontAwesomeIcon icon={faPuzzlePiece} className="text-xs text-accent" />
						<h3 className="font-plex text-sm font-medium text-ink">
							{plugin.name}
						</h3>
						<Badge variant={plugin.source === "instance" ? "accent" : "green"} size="sm">
							{plugin.source}
						</Badge>
						<span className="text-xs text-ink-faint">v{plugin.version}</span>
					</div>
					<p className="mt-2 text-xs text-ink-faint">
						{plugin.description || "No description provided"}
					</p>
				</div>
				{plugin.has_ui && (
					<Link
						to={"/agents/$agentId/plugins/$pluginName" as string}
						params={{ agentId, pluginName: plugin.name } as Record<string, string>}
						className="flex items-center gap-1.5 rounded-md border border-app-line px-3 py-1.5 text-xs text-ink-dull transition-colors hover:border-accent hover:text-accent"
					>
						<FontAwesomeIcon icon={faExternalLinkAlt} className="text-[10px]" />
						Open
					</Link>
				)}
			</div>
			<div className="mt-3 flex items-center gap-3 text-xs text-ink-dull">
				{plugin.has_ui && <span>UI</span>}
				{plugin.has_api && <span>API</span>}
				{plugin.tool_count > 0 && <span>{plugin.tool_count} tools</span>}
			</div>
			<p className="mt-2 font-mono text-xs text-ink-dull/60">
				{plugin.base_dir}
			</p>
		</div>
	);
}

interface AgentPluginsProps {
	agentId: string;
}

export function AgentPlugins({ agentId }: AgentPluginsProps) {
	const { data, isLoading } = useQuery({
		queryKey: ["plugins", agentId],
		queryFn: () => api.listPlugins(agentId),
		refetchInterval: 10_000,
	});

	const plugins = data?.plugins ?? [];

	return (
		<div className="flex h-full flex-col">
			<div className="border-b border-app-line px-6 py-3">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-medium text-ink-dull">
						Installed Plugins
					</h2>
					<span className="text-xs text-ink-faint">
						{plugins.length} plugins
					</span>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto">
				<div className="p-6">
					{isLoading && (
						<div className="rounded-lg border border-app-line bg-app-box p-8 text-center">
							<FontAwesomeIcon
								icon={faSpinner}
								className="animate-spin text-ink-faint"
							/>
							<p className="mt-2 text-sm text-ink-faint">
								Loading plugins...
							</p>
						</div>
					)}

					{!isLoading && plugins.length === 0 && (
						<div className="rounded-lg border border-app-line bg-app-box p-8 text-center">
							<FontAwesomeIcon icon={faPuzzlePiece} className="text-2xl text-ink-faint" />
							<p className="mt-3 text-sm text-ink-faint">
								No plugins installed yet
							</p>
							<p className="mt-1 text-xs text-ink-dull">
								Add plugins to ~/.spacebot/plugins/ or your agent's workspace/plugins/ directory
							</p>
						</div>
					)}

					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{plugins.map((plugin) => (
							<PluginCard
								key={plugin.name}
								plugin={plugin}
								agentId={agentId}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
