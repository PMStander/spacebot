import { Artifact } from "@/components/create-artifact";
import { ChartRenderer } from "./ChartRenderer";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Copy01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	ChartLineData01Icon,
	SparklesIcon,
} from "@hugeicons/core-free-icons";
import { createElement } from "react";

type ChartMetadata = Record<string, never>;

export const chartArtifact = new Artifact<"chart", ChartMetadata>({
	kind: "chart",
	description: "Useful for data visualizations like bar, line, area, and pie charts.",
	initialize: () => {},
	onStreamPart: ({ setArtifact, streamPart }) => {
		if (streamPart.type === "artifact_delta") {
			setArtifact((draft) => ({
				...draft,
				content: streamPart.data as string,
				isVisible: true,
				status: "streaming",
			}));
		}
	},
	content: ({ content, status }) =>
		createElement(ChartRenderer, { content, status }),
	actions: [
		{
			icon: createElement(HugeiconsIcon, { icon: ArrowLeft01Icon, size: 18 }),
			description: "View Previous version",
			onClick: ({ handleVersionChange }) => handleVersionChange("prev"),
			isDisabled: ({ currentVersionIndex }) => currentVersionIndex === 0,
		},
		{
			icon: createElement(HugeiconsIcon, { icon: ArrowRight01Icon, size: 18 }),
			description: "View Next version",
			onClick: ({ handleVersionChange }) => handleVersionChange("next"),
			isDisabled: ({ isCurrentVersion }) => isCurrentVersion,
		},
		{
			icon: createElement(HugeiconsIcon, { icon: Copy01Icon, size: 18 }),
			description: "Copy data as CSV",
			onClick: ({ content }) => {
				try {
					const parsed = JSON.parse(content);
					const { data, series, xKey } = parsed;
					const headers = [xKey, ...series.map((s: { name: string }) => s.name)];
					const rows = data.map((row: Record<string, unknown>) =>
						[row[xKey], ...series.map((s: { dataKey: string }) => row[s.dataKey])].join(","),
					);
					navigator.clipboard.writeText([headers.join(","), ...rows].join("\n"));
					toast.success("Chart data copied as CSV!");
				} catch {
					navigator.clipboard.writeText(content);
					toast.success("Chart JSON copied!");
				}
			},
		},
	],
	toolbar: [
		{
			description: "Change chart type",
			icon: createElement(HugeiconsIcon, { icon: ChartLineData01Icon, size: 18 }),
			onClick: ({ sendMessage }) => {
				sendMessage("Change this chart to a different type (try line, bar, area, or pie).");
			},
		},
		{
			description: "Add data series",
			icon: createElement(HugeiconsIcon, { icon: SparklesIcon, size: 18 }),
			onClick: ({ sendMessage }) => {
				sendMessage("Add another data series to this chart.");
			},
		},
	],
});
