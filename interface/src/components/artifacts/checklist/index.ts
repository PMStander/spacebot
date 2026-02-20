import { Artifact } from "@/components/create-artifact";
import { ChecklistEditor } from "./ChecklistEditor";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowLeft01Icon,
	ArrowRight01Icon,
	Delete02Icon,
	SparklesIcon,
	SortingIcon,
} from "@hugeicons/core-free-icons";
import { createElement } from "react";

type ChecklistMetadata = Record<string, never>;

export const checklistArtifact = new Artifact<"checklist", ChecklistMetadata>({
	kind: "checklist",
	description: "Useful for interactive checklists and to-do lists with progress tracking.",
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
		createElement(ChecklistEditor, { content, onSaveContent, status }),
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
			icon: createElement(HugeiconsIcon, { icon: Delete02Icon, size: 18 }),
			description: "Clear completed items",
			onClick: ({ content, handleVersionChange }) => {
				try {
					const parsed = JSON.parse(content);
					for (const group of parsed.groups) {
						group.items = group.items.filter((i: { done: boolean }) => !i.done);
					}
					// Push updated content as new version
					handleVersionChange("latest");
					toast.success("Completed items cleared!");
				} catch {
					toast.error("Failed to clear items");
				}
			},
		},
	],
	toolbar: [
		{
			description: "Add more items",
			icon: createElement(HugeiconsIcon, { icon: SparklesIcon, size: 18 }),
			onClick: ({ sendMessage }) => {
				sendMessage("Add more relevant checklist items based on context.");
			},
		},
		{
			description: "Prioritize items",
			icon: createElement(HugeiconsIcon, { icon: SortingIcon, size: 18 }),
			onClick: ({ sendMessage }) => {
				sendMessage("Assign priorities (high, medium, low) to the uncompleted items.");
			},
		},
	],
});
