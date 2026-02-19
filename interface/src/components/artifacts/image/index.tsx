import { Artifact } from "@/components/create-artifact";
import { ImageViewer } from "./ImageViewer";
import { Copy01Icon, UndoIcon, RedoIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

export const imageArtifact = new Artifact({
	kind: "image",
	description: "Useful for displaying generated images.",
	onStreamPart: ({ streamPart, setArtifact }) => {
		if (streamPart.type === "artifact_delta") {
			setArtifact((draft) =>
				draft
					? {
							...draft,
							content: streamPart.data,
							isVisible: true,
							status: "streaming",
						}
					: draft,
			);
		}
	},
	content: ImageViewer,
	actions: [
		{
			icon: <HugeiconsIcon icon={UndoIcon} size={18} />,
			description: "View previous version",
			onClick: ({ handleVersionChange }) => {
				handleVersionChange("prev");
			},
			isDisabled: ({ currentVersionIndex }) => currentVersionIndex === 0,
		},
		{
			icon: <HugeiconsIcon icon={RedoIcon} size={18} />,
			description: "View next version",
			onClick: ({ handleVersionChange }) => {
				handleVersionChange("next");
			},
			isDisabled: ({ isCurrentVersion }) => isCurrentVersion,
		},
		{
			icon: <HugeiconsIcon icon={Copy01Icon} size={18} />,
			description: "Copy image to clipboard",
			onClick: async ({ content }) => {
				const src = content.startsWith("data:")
					? content
					: `data:image/png;base64,${content}`;
				const img = new Image();
				img.src = src;

				img.onload = () => {
					const canvas = document.createElement("canvas");
					canvas.width = img.width;
					canvas.height = img.height;
					const ctx = canvas.getContext("2d");
					ctx?.drawImage(img, 0, 0);
					canvas.toBlob((blob) => {
						if (blob) {
							navigator.clipboard.write([
								new ClipboardItem({ "image/png": blob }),
							]);
						}
					}, "image/png");
				};

				toast.success("Copied image to clipboard!");
			},
		},
	],
	toolbar: [],
});
