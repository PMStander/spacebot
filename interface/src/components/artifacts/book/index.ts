import { createElement } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	LayoutGridIcon,
	ViewIcon,
	UndoIcon,
	RedoIcon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	SparklesIcon,
	AddCircleIcon,
	Move01Icon,
} from "@hugeicons/core-free-icons";
import { Artifact } from "@/components/create-artifact";
import { BookEditor } from "./BookEditor";
import { DEFAULT_BOOK_METADATA, normalizeFromComicJson } from "./types";
import type { BookMetadata } from "./types";

export const bookArtifact = new Artifact<"book", BookMetadata>({
	kind: "book",
	description:
		"Illustrated book creator for comics, children's books, and graphic novels. Supports speech bubble editing, page management, and publishing export.",

	initialize: ({ setMetadata }) => {
		setMetadata(DEFAULT_BOOK_METADATA);
	},

	// The LLM emits the entire comic.json in one ArtifactDelta — replace, not accumulate
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

	content: BookEditor,

	actions: [
		// View: grid
		{
			icon: createElement(HugeiconsIcon, { icon: LayoutGridIcon, size: 18 }),
			description: "Page grid overview",
			onClick: ({ setMetadata }) =>
				setMetadata((m: BookMetadata) => ({ ...m, view: "grid" })),
			isDisabled: ({ metadata }: { metadata: BookMetadata }) =>
				metadata.view === "grid",
		},
		// View: page editor
		{
			icon: createElement(HugeiconsIcon, { icon: ViewIcon, size: 18 }),
			description: "Page editor",
			onClick: ({ setMetadata }) =>
				setMetadata((m: BookMetadata) => ({ ...m, view: "page" })),
			isDisabled: ({ metadata }: { metadata: BookMetadata }) =>
				metadata.view === "page",
		},
		// Undo (prev version)
		{
			icon: createElement(HugeiconsIcon, { icon: UndoIcon, size: 18 }),
			description: "Undo",
			onClick: ({ handleVersionChange }) => handleVersionChange("prev"),
			isDisabled: ({ currentVersionIndex }) => currentVersionIndex === 0,
		},
		// Redo (next version)
		{
			icon: createElement(HugeiconsIcon, { icon: RedoIcon, size: 18 }),
			description: "Redo",
			onClick: ({ handleVersionChange }) => handleVersionChange("next"),
			isDisabled: ({ isCurrentVersion }) => isCurrentVersion,
		},
		// Prev page
		{
			icon: createElement(HugeiconsIcon, { icon: ArrowLeft01Icon, size: 18 }),
			description: "Previous page",
			onClick: ({ setMetadata }) => {
				setMetadata((m: BookMetadata) => ({
					...m,
					view: "page",
					selectedPageIndex: Math.max(0, m.selectedPageIndex - 1),
					selectedBubbleId: null,
				}));
			},
			isDisabled: ({ metadata }: { metadata: BookMetadata }) =>
				metadata.selectedPageIndex === 0,
		},
		// Next page
		{
			icon: createElement(HugeiconsIcon, { icon: ArrowRight01Icon, size: 18 }),
			description: "Next page",
			onClick: ({ setMetadata, content }) => {
				try {
					const doc = normalizeFromComicJson(JSON.parse(content));
					setMetadata((m: BookMetadata) => ({
						...m,
						view: "page",
						selectedPageIndex: Math.min(doc.pages.length - 1, m.selectedPageIndex + 1),
						selectedBubbleId: null,
					}));
				} catch {
					// ignore parse errors during streaming
				}
			},
			isDisabled: ({ metadata, content }: { metadata: BookMetadata; content: string }) => {
				try {
					const doc = normalizeFromComicJson(JSON.parse(content));
					return metadata.selectedPageIndex >= doc.pages.length - 1;
				} catch {
					return true;
				}
			},
		},
	],

	toolbar: [
		{
			icon: createElement(HugeiconsIcon, { icon: SparklesIcon, size: 16 }),
			description: "Regenerate current page with AI",
			onClick: ({ sendMessage }) => {
				sendMessage(
					"Please regenerate the current page with improved artwork and composition.",
				);
			},
		},
		{
			icon: createElement(HugeiconsIcon, { icon: AddCircleIcon, size: 16 }),
			description: "Add more pages",
			onClick: ({ sendMessage }) => {
				sendMessage("Please add 2 more pages to continue the story.");
			},
		},
		{
			icon: createElement(HugeiconsIcon, { icon: Move01Icon, size: 16 }),
			description: "Change art style",
			onClick: ({ sendMessage }) => {
				sendMessage(
					"Please suggest a different art style for this book and regenerate the pages.",
				);
			},
		},
	],
});
