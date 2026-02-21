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
		"Shared book editor for comic, kids, novel, puzzle, and drawing workflows. Supports page editing, speech bubbles for comics, and YOLO/guided creation modes.",

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
			description: "YOLO autopilot",
			onClick: ({ sendMessage }) => {
				sendMessage(
					"Run a YOLO autopilot pass for this book. For comics, regenerate only unlocked panels and keep scene.approved=true panels locked. For non-comic books, fill missing page content and run a full consistency polish in one pass.",
				);
			},
		},
		{
			icon: createElement(HugeiconsIcon, { icon: ViewIcon, size: 16 }),
			description: "Guided walkthrough",
			onClick: ({ sendMessage }) => {
				sendMessage(
					"Switch this book to guided mode. Walk page-by-page with me, ask for approval before finalizing each page, and use any references I upload.",
				);
			},
		},
		{
			icon: createElement(HugeiconsIcon, { icon: AddCircleIcon, size: 16 }),
			description: "Extend page count",
			onClick: ({ sendMessage }) => {
				sendMessage("Please add 2 more pages to continue the story.");
			},
		},
		{
			icon: createElement(HugeiconsIcon, { icon: Move01Icon, size: 16 }),
			description: "Shift style/voice",
			onClick: ({ sendMessage }) => {
				sendMessage(
					"Please suggest a better style/voice direction for this book type and apply it across all pages.",
				);
			},
		},
	],
});
