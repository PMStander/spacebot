import type { BookType, BubbleType } from "./types";

// ---------------------------------------------------------------------------
// Font list — commercially safe for book publishing
// System fonts that are available on macOS/Windows/Linux
// ---------------------------------------------------------------------------

export const SAFE_FONT_LIST = [
	"Comic Sans MS",
	"Arial",
	"Georgia",
	"Courier New",
	"Impact",
	"Verdana",
	"Trebuchet MS",
	"Palatino Linotype",
] as const;

export type SafeFont = (typeof SAFE_FONT_LIST)[number];

// ---------------------------------------------------------------------------
// Book-type driven UI defaults
// ---------------------------------------------------------------------------

export const BOOK_TYPE_DEFAULTS: Record<
	BookType,
	{
		defaultBubbleType: BubbleType;
		defaultFont: SafeFont;
		allowedBubbleTypes: BubbleType[];
		panelLabel: string;
		defaultBorderRadius: number;
	}
> = {
	comic: {
		defaultBubbleType: "speech",
		defaultFont: "Comic Sans MS",
		allowedBubbleTypes: ["speech", "thought", "narration", "shout"],
		panelLabel: "Panel",
		defaultBorderRadius: 20,
	},
	children: {
		defaultBubbleType: "narration",
		defaultFont: "Comic Sans MS",
		allowedBubbleTypes: ["speech", "narration"],
		panelLabel: "Page",
		defaultBorderRadius: 8,
	},
	kids: {
		defaultBubbleType: "narration",
		defaultFont: "Comic Sans MS",
		allowedBubbleTypes: ["speech", "narration"],
		panelLabel: "Page",
		defaultBorderRadius: 8,
	},
	novel: {
		defaultBubbleType: "narration",
		defaultFont: "Georgia",
		allowedBubbleTypes: ["narration"],
		panelLabel: "Chapter page",
		defaultBorderRadius: 4,
	},
	"illustrated-novel": {
		defaultBubbleType: "narration",
		defaultFont: "Georgia",
		allowedBubbleTypes: ["narration"],
		panelLabel: "Illustration",
		defaultBorderRadius: 4,
	},
	puzzle: {
		defaultBubbleType: "narration",
		defaultFont: "Verdana",
		allowedBubbleTypes: ["narration"],
		panelLabel: "Puzzle page",
		defaultBorderRadius: 6,
	},
	drawing: {
		defaultBubbleType: "narration",
		defaultFont: "Arial",
		allowedBubbleTypes: ["narration"],
		panelLabel: "Lesson page",
		defaultBorderRadius: 8,
	},
};

// ---------------------------------------------------------------------------
// Bubble type labels
// ---------------------------------------------------------------------------

export const BUBBLE_TYPE_LABELS: Record<BubbleType, string> = {
	speech: "Speech",
	thought: "Thought",
	narration: "Caption",
	shout: "Shout",
};
