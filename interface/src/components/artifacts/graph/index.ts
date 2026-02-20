import { Artifact } from "@/components/create-artifact";
import { GraphRenderer } from "./GraphRenderer";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowLeft01Icon,
	ArrowRight01Icon,
	Add01Icon,
	SparklesIcon,
} from "@hugeicons/core-free-icons";
import { createElement } from "react";

type GraphMetadata = Record<string, never>;

export const graphArtifact = new Artifact<"graph", GraphMetadata>({
	kind: "graph",
	description: "Useful for network graphs showing relationships between nodes.",
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
		createElement(GraphRenderer, { content, status }),
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
	],
	toolbar: [
		{
			description: "Add nodes",
			icon: createElement(HugeiconsIcon, { icon: Add01Icon, size: 18 }),
			onClick: ({ sendMessage }) => {
				sendMessage("Add more nodes and connections to this graph.");
			},
		},
		{
			description: "Analyze graph",
			icon: createElement(HugeiconsIcon, { icon: SparklesIcon, size: 18 }),
			onClick: ({ sendMessage }) => {
				sendMessage("Analyze the structure and relationships in this graph.");
			},
		},
	],
});
