import { useMemo, useEffect, useRef } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import forceAtlas2 from "graphology-layout-forceatlas2";

interface GraphNode {
	id: string;
	label: string;
	color?: string;
	size?: number;
}

interface GraphEdge {
	source: string;
	target: string;
	label?: string;
}

interface GraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

export function GraphRenderer({
	content,
	status,
}: {
	content: string;
	status: "streaming" | "idle";
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const sigmaRef = useRef<Sigma | null>(null);

	const parsed = useMemo<GraphData | null>(() => {
		try {
			return JSON.parse(content);
		} catch {
			return null;
		}
	}, [content]);

	useEffect(() => {
		if (!parsed || !containerRef.current || status === "streaming") return;

		// Clean up previous instance
		if (sigmaRef.current) {
			sigmaRef.current.kill();
			sigmaRef.current = null;
		}

		const graph = new Graph();

		// Add nodes with random initial positions
		for (const node of parsed.nodes) {
			graph.addNode(node.id, {
				label: node.label,
				color: node.color ?? "#8884d8",
				size: node.size ?? 8,
				x: Math.random() * 100,
				y: Math.random() * 100,
			});
		}

		// Add edges
		for (const edge of parsed.edges) {
			if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
				try {
					graph.addEdge(edge.source, edge.target, {
						label: edge.label,
						color: "#555",
						size: 1,
					});
				} catch {
					// Skip duplicate edges
				}
			}
		}

		// Apply force-directed layout
		forceAtlas2.assign(graph, {
			iterations: 100,
			settings: {
				gravity: 1,
				scalingRatio: 2,
				barnesHutOptimize: true,
			},
		});

		// Create Sigma instance
		const sigma = new Sigma(graph, containerRef.current, {
			renderLabels: true,
			renderEdgeLabels: true,
			labelColor: { color: "#e0e0e0" },
			labelSize: 12,
			edgeLabelSize: 10,
			defaultEdgeType: "arrow",
			defaultNodeColor: "#8884d8",
			defaultEdgeColor: "#555",
		});

		sigmaRef.current = sigma;

		return () => {
			sigma.kill();
			sigmaRef.current = null;
		};
	}, [parsed, status]);

	if (!parsed) {
		if (status === "streaming") {
			return (
				<div className="flex h-64 items-center justify-center text-ink-faint text-sm">
					Generating graph...
				</div>
			);
		}
		return (
			<div className="flex h-64 items-center justify-center text-red-400 text-sm">
				Invalid graph data
			</div>
		);
	}

	if (status === "streaming") {
		return (
			<div className="flex h-64 items-center justify-center text-ink-faint text-sm">
				Generating graph...
			</div>
		);
	}

	return (
		<div className="relative">
			<div
				ref={containerRef}
				className="w-full rounded-lg bg-app-darkBox/30"
				style={{ height: 400 }}
			/>
			<div className="absolute bottom-2 right-2 text-[10px] text-ink-faint bg-app-darkBox/80 rounded px-2 py-1">
				{parsed.nodes.length} nodes, {parsed.edges.length} edges
			</div>
		</div>
	);
}
