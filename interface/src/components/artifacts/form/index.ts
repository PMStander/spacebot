import { Artifact } from "@/components/create-artifact";
import { FormRenderer } from "./FormRenderer";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Copy01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	RefreshIcon,
} from "@hugeicons/core-free-icons";
import { createElement } from "react";

type FormMetadata = Record<string, never>;

export const formArtifact = new Artifact<"form", FormMetadata>({
	kind: "form",
	description: "Useful for dynamic forms that collect structured input from the user.",
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
	content: ({ content, onSaveContent, sendMessage, status }) =>
		createElement(FormRenderer, { content, onSaveContent, sendMessage, status }),
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
			description: "Copy values as JSON",
			onClick: ({ content }) => {
				try {
					const parsed = JSON.parse(content);
					navigator.clipboard.writeText(JSON.stringify(parsed.values ?? {}, null, 2));
					toast.success("Form values copied!");
				} catch {
					navigator.clipboard.writeText(content);
					toast.success("Form JSON copied!");
				}
			},
		},
	],
	toolbar: [
		{
			description: "Reset form",
			icon: createElement(HugeiconsIcon, { icon: RefreshIcon, size: 18 }),
			onClick: ({ sendMessage }) => {
				sendMessage("Reset the form values to their defaults.");
			},
		},
	],
});
