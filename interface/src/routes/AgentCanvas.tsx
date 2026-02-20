import { useEffect, useState, useCallback, createElement } from "react";
import { api, BASE_PATH } from "@/api/client";
import type { CanvasPanel } from "@/api/client";

interface AgentCanvasProps {
	agentId: string;
}

export function AgentCanvas({ agentId }: AgentCanvasProps) {
	const [panels, setPanels] = useState<CanvasPanel[]>([]);
	const [loading, setLoading] = useState(true);

	const fetchPanels = useCallback(() => {
		api.canvasPanels(agentId)
			.then((data) => {
				setPanels(data.panels);
			})
			.catch(() => {
				// Table may not exist yet — treat as empty
			})
			.finally(() => {
				setLoading(false);
			});
	}, [agentId]);

	// Initial load
	useEffect(() => {
		fetchPanels();
	}, [fetchPanels]);

	// Subscribe to SSE for real-time updates
	useEffect(() => {
		const es = new EventSource(`${BASE_PATH}/api/events`);

		const handleUpdate = (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data);
				if (data.agent_id === agentId) {
					fetchPanels();
				}
			} catch {
				// ignore parse errors
			}
		};

		const handleRemove = (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data);
				if (data.agent_id === agentId) {
					setPanels((prev) =>
						prev.filter((p) => p.name !== data.panel_name),
					);
				}
			} catch {
				// ignore parse errors
			}
		};

		es.addEventListener("canvas_updated", handleUpdate);
		es.addEventListener("canvas_removed", handleRemove);

		return () => {
			es.removeEventListener("canvas_updated", handleUpdate);
			es.removeEventListener("canvas_removed", handleRemove);
			es.close();
		};
	}, [agentId, fetchPanels]);

	if (loading) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-ink-faint border-t-accent" />
			</div>
		);
	}

	if (panels.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 text-ink-faint">
				<p className="text-sm">No canvas panels yet.</p>
				<p className="text-xs">
					Ask the agent in Cortex chat to build its canvas.
				</p>
			</div>
		);
	}

	return (
		<div className="h-full overflow-auto p-4">
			<div className="grid grid-cols-3 gap-4 auto-rows-min">
				{panels.map((panel) => (
					<CanvasPanelCard key={panel.id} panel={panel} />
				))}
			</div>
		</div>
	);
}

function CanvasPanelCard({ panel }: { panel: CanvasPanel }) {
	const span = Math.min(panel.metadata?.span ?? 1, 3);
	const height = panel.metadata?.height ?? 400;

	return (
		<div
			className="rounded-lg border border-app-line bg-app-box overflow-hidden"
			style={{ gridColumn: `span ${span}` }}
		>
			<div className="flex items-center px-3 py-2 border-b border-app-line bg-app-darkBox/50">
				<h3 className="text-xs font-medium text-ink truncate">
					{panel.title}
				</h3>
				<span className="ml-auto text-[10px] text-ink-faint">
					{panel.name}
				</span>
			</div>
			{createElement("iframe", {
				srcDoc: panel.content,
				className: "w-full border-0",
				style: { height },
				sandbox: "allow-scripts",
				title: panel.title,
			})}
		</div>
	);
}
