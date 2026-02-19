import { Artifact } from "@/components/create-artifact";
import { SpreadsheetEditor } from "./SpreadsheetEditor";
import { parse, unparse } from "papaparse";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Copy01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	SparklesIcon,
	ChartLineData01Icon,
} from "@hugeicons/core-free-icons";
import { createElement } from "react";

type Metadata = any;

export const sheetArtifact = new Artifact<"sheet", Metadata>({
	kind: "sheet",
	description: "Useful for working with spreadsheets and tabular data.",
	initialize: () => {},
	onStreamPart: ({ setArtifact, streamPart }) => {
		if (streamPart.type === "artifact_delta") {
			setArtifact((draftArtifact) => ({
				...draftArtifact,
				content: streamPart.data as string,
				isVisible: true,
				status: "streaming",
			}));
		}
	},
	content: ({ content, currentVersionIndex, onSaveContent, status }) =>
		createElement(SpreadsheetEditor, {
			content,
			currentVersionIndex,
			isCurrentVersion: true,
			saveContent: onSaveContent,
			status,
		}),
	actions: [
		{
			icon: createElement(HugeiconsIcon, {
				icon: ArrowLeft01Icon,
				size: 18,
			}),
			description: "View Previous version",
			onClick: ({ handleVersionChange }) => {
				handleVersionChange("prev");
			},
			isDisabled: ({ currentVersionIndex }) => currentVersionIndex === 0,
		},
		{
			icon: createElement(HugeiconsIcon, {
				icon: ArrowRight01Icon,
				size: 18,
			}),
			description: "View Next version",
			onClick: ({ handleVersionChange }) => {
				handleVersionChange("next");
			},
			isDisabled: ({ isCurrentVersion }) => isCurrentVersion,
		},
		{
			icon: createElement(HugeiconsIcon, { icon: Copy01Icon, size: 18 }),
			description: "Copy as CSV",
			onClick: ({ content }) => {
				const parsed = parse<string[]>(content, { skipEmptyLines: true });
				const nonEmptyRows = parsed.data.filter((row) =>
					row.some((cell) => cell.trim() !== ""),
				);
				const cleanedCsv = unparse(nonEmptyRows);
				navigator.clipboard.writeText(cleanedCsv);
				toast.success("Copied CSV to clipboard!");
			},
		},
	],
	toolbar: [
		{
			description: "Format and clean data",
			icon: createElement(HugeiconsIcon, { icon: SparklesIcon, size: 18 }),
			onClick: ({ sendMessage }) => {
				sendMessage("Can you please format and clean the data?");
			},
		},
		{
			description: "Analyze and visualize data",
			icon: createElement(HugeiconsIcon, {
				icon: ChartLineData01Icon,
				size: 18,
			}),
			onClick: ({ sendMessage }) => {
				sendMessage(
					"Can you please analyze and visualize the data by creating a chart?",
				);
			},
		},
	],
});
