import { Artifact } from "@/components/create-artifact";
import { MermaidRenderer } from "./MermaidRenderer";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Copy01Icon,
	Download01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	SparklesIcon,
	Add01Icon,
} from "@hugeicons/core-free-icons";
import { createElement } from "react";

type DiagramMetadata = Record<string, never>;

export const diagramArtifact = new Artifact<"diagram", DiagramMetadata>({
	kind: "diagram",
	description: "Useful for flowcharts, sequence diagrams, class diagrams, and other Mermaid diagrams.",
	initialize: () => {},
	onStreamPart: ({ setArtifact, streamPart }) => {
		if (streamPart.type === "artifact_delta") {
			setArtifact((draft) => ({
				...draft,
				content: draft.content + (streamPart.data as string),
				isVisible:
					draft.content.length > 80 && draft.content.length < 130
						? true
						: draft.isVisible,
				status: "streaming",
			}));
		}
	},
	content: ({ content, onSaveContent, status }) =>
		createElement(MermaidRenderer, { content, onSaveContent, status }),
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
			description: "Copy diagram source",
			onClick: ({ content }) => {
				navigator.clipboard.writeText(content);
				toast.success("Diagram source copied!");
			},
		},
		{
			icon: createElement(HugeiconsIcon, { icon: Download01Icon, size: 18 }),
			description: "Export as SVG",
			onClick: ({ content }) => {
				// Find the rendered SVG in the DOM
				const svgEl = document.querySelector("[data-mermaid-svg]") as SVGElement | null;
				const svgString = svgEl?.outerHTML ?? `<!-- No rendered SVG found -->\n${content}`;
				const blob = new Blob([svgString], { type: "image/svg+xml" });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = "diagram.svg";
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
				toast.success("SVG downloaded!");
			},
		},
	],
	toolbar: [
		{
			description: "Simplify diagram",
			icon: createElement(HugeiconsIcon, { icon: SparklesIcon, size: 18 }),
			onClick: ({ sendMessage }) => {
				sendMessage("Simplify this diagram by reducing complexity.");
			},
		},
		{
			description: "Add more detail",
			icon: createElement(HugeiconsIcon, { icon: Add01Icon, size: 18 }),
			onClick: ({ sendMessage }) => {
				sendMessage("Add more detail and nodes to this diagram.");
			},
		},
	],
});
