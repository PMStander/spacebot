import { Artifact } from "@/components/create-artifact";
import { TableEditor } from "./TableEditor";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Copy01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	SparklesIcon,
	Add01Icon,
} from "@hugeicons/core-free-icons";
import { createElement } from "react";

type TableMetadata = Record<string, never>;

export const tableArtifact = new Artifact<"table", TableMetadata>({
	kind: "table",
	description: "Useful for structured data tables with sorting, filtering, and inline editing.",
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
	content: ({ content, onSaveContent, status }) =>
		createElement(TableEditor, { content, onSaveContent, status }),
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
			description: "Copy as CSV",
			onClick: ({ content }) => {
				try {
					const parsed = JSON.parse(content);
					const headers = parsed.columns.map((c: { label: string }) => c.label).join(",");
					const rows = parsed.rows.map((row: Record<string, unknown>) =>
						parsed.columns.map((c: { key: string }) => String(row[c.key] ?? "")).join(","),
					);
					navigator.clipboard.writeText([headers, ...rows].join("\n"));
					toast.success("Table copied as CSV!");
				} catch {
					navigator.clipboard.writeText(content);
					toast.success("Table JSON copied!");
				}
			},
		},
	],
	toolbar: [
		{
			description: "Add row",
			icon: createElement(HugeiconsIcon, { icon: Add01Icon, size: 18 }),
			onClick: ({ sendMessage }) => {
				sendMessage("Add a new row to this table with relevant data.");
			},
		},
		{
			description: "Analyze data",
			icon: createElement(HugeiconsIcon, { icon: SparklesIcon, size: 18 }),
			onClick: ({ sendMessage }) => {
				sendMessage("Analyze the patterns in this table data and provide insights.");
			},
		},
	],
});
