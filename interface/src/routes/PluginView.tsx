import { api } from "@/api/client";

interface PluginViewProps {
	agentId: string;
	pluginName: string;
}

export function PluginView({ agentId, pluginName }: PluginViewProps) {
	const src = api.pluginUiUrl(agentId, pluginName);

	return (
		<div className="flex h-full flex-col">
			<header className="flex h-10 items-center justify-between border-b border-app-line bg-app-darkBox/30 px-4">
				<span className="text-xs font-medium text-ink-dull">
					{pluginName}
				</span>
			</header>
			<iframe
				src={src}
				className="flex-1 border-0"
				title={`Plugin: ${pluginName}`}
				sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
			/>
		</div>
	);
}
