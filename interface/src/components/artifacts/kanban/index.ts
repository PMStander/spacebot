import { Artifact } from "@/components/create-artifact";
import { KanbanBoard } from "./KanbanBoard";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowLeft01Icon,
	ArrowRight01Icon,
	Add01Icon,
	SparklesIcon,
} from "@hugeicons/core-free-icons";
import { createElement } from "react";

type KanbanMetadata = Record<string, never>;

export const kanbanArtifact = new Artifact<"kanban", KanbanMetadata>({
	kind: "kanban",
	description: "Useful for task boards with draggable cards organized in columns.",
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
		createElement(KanbanBoard, { content, onSaveContent, status }),
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
			description: "Add task card",
			icon: createElement(HugeiconsIcon, { icon: Add01Icon, size: 18 }),
			onClick: ({ sendMessage }) => {
				sendMessage("Add a new task card to the board.");
			},
		},
		{
			description: "Add column",
			icon: createElement(HugeiconsIcon, { icon: SparklesIcon, size: 18 }),
			onClick: ({ sendMessage }) => {
				sendMessage("Add a new column to the kanban board.");
			},
		},
	],
});
