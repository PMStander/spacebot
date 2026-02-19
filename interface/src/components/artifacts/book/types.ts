// ---------------------------------------------------------------------------
// KDP trim sizes (inches)
// ---------------------------------------------------------------------------

export const KDP_TRIM_SIZES = {
	"us-comic": { label: "US Comic", width: 6.625, height: 10.25 },
	"manga": { label: "Manga / Digest", width: 5.5, height: 8.5 },
	"graphic-novel-trade": { label: "Graphic Novel (Trade)", width: 6, height: 9 },
	"graphic-novel-large": { label: "Graphic Novel (Large)", width: 7, height: 10 },
	"children-square": { label: "Children's (Square)", width: 8.5, height: 8.5 },
	"children-portrait": { label: "Children's (Portrait)", width: 8, height: 10 },
	"art-magazine": { label: "Art / Magazine", width: 8.5, height: 11 },
} as const;

export type KdpTrimSize = keyof typeof KDP_TRIM_SIZES;

// ---------------------------------------------------------------------------
// Book types
// ---------------------------------------------------------------------------

export type BookType = "comic" | "children" | "illustrated-novel";

// ---------------------------------------------------------------------------
// Bubble types
// ---------------------------------------------------------------------------

export type BubbleType = "speech" | "thought" | "narration" | "shout";

export interface BubbleStyle {
	tailDirection: "bottom-left" | "bottom-right" | "top-left" | "top-right";
	fontSize: number;
	fontFamily: string;
	textColor: string;
	bgColor: string;
	borderColor: string;
	borderWidth: number;
	padding: number;
	borderRadius: number;
}

export interface Bubble {
	id: string;
	type: BubbleType;
	text: string;
	character: string;
	/** 0-100 percent of panel dimensions */
	position: { x: number; y: number };
	size: { width: number; height: number };
	style: BubbleStyle;
}

// ---------------------------------------------------------------------------
// Book document structure
// ---------------------------------------------------------------------------

export interface BookPanel {
	index: number;
	/** Filename only, e.g. "panel-0.png". Full path: {outputDir}/page-{number}/{image} */
	image: string;
	bubbles: Bubble[];
}

export interface BookPage {
	/** 1-indexed, must match on-disk directory name page-{number}/ */
	number: number;
	layout: string;
	panels: BookPanel[];
}

export interface BookDocument {
	id: string;
	title: string;
	style: string;
	bookType: BookType;
	/** Absolute path to the directory containing generated page subdirectories */
	outputDir: string;
	trim?: KdpTrimSize;
	pages: BookPage[];
}

// ---------------------------------------------------------------------------
// UI metadata (transient — Zustand only, not persisted to SQLite)
// ---------------------------------------------------------------------------

export interface BookMetadata {
	view: "grid" | "page";
	selectedPageIndex: number;
	selectedPanelIndex: number | null;
	selectedBubbleId: string | null;
	zoom: number;
}

export const DEFAULT_BOOK_METADATA: BookMetadata = {
	view: "grid",
	selectedPageIndex: 0,
	selectedPanelIndex: null,
	selectedBubbleId: null,
	zoom: 1.0,
};

// ---------------------------------------------------------------------------
// Coordinate normalisation helpers
// comic.json uses 0-1 floats; we store 0-100 percent internally
// ---------------------------------------------------------------------------

function normaliseBubble(raw: Record<string, unknown>): Bubble {
	const rawPos = (raw.position as Record<string, number> | undefined) ?? {};
	const rawSize = (raw.size as Record<string, number> | undefined) ?? {};
	const rawStyle = (raw.style as Record<string, unknown> | undefined) ?? {};

	return {
		id: (raw.id as string | undefined) ?? crypto.randomUUID(),
		type: (raw.type as BubbleType | undefined) ?? "speech",
		text: (raw.text as string | undefined) ?? "",
		character: (raw.character as string | undefined) ?? "",
		position: {
			x: ((rawPos.x ?? 0.1) as number) * 100,
			y: ((rawPos.y ?? 0.1) as number) * 100,
		},
		size: {
			width: ((rawSize.width ?? 0.3) as number) * 100,
			height: ((rawSize.height ?? 0.2) as number) * 100,
		},
		style: {
			tailDirection:
				(rawStyle.tail_direction as BubbleStyle["tailDirection"] | undefined) ??
				"bottom-left",
			fontSize: (rawStyle.font_size as number | undefined) ?? 14,
			fontFamily: (rawStyle.font_family as string | undefined) ?? "Comic Sans MS",
			textColor: (rawStyle.text_color as string | undefined) ?? "#000000",
			bgColor: (rawStyle.bg_color as string | undefined) ?? "#FFFFFF",
			borderColor: (rawStyle.border_color as string | undefined) ?? "#000000",
			borderWidth: (rawStyle.border_width as number | undefined) ?? 2,
			padding: (rawStyle.padding as number | undefined) ?? 12,
			borderRadius: (rawStyle.border_radius as number | undefined) ?? 20,
		},
	};
}

export function normalizeFromComicJson(raw: unknown): BookDocument {
	const r = raw as Record<string, unknown>;
	const rawPages = (r.pages as Array<Record<string, unknown>> | undefined) ?? [];

	return {
		id: (r.id as string | undefined) ?? "",
		title: (r.title as string | undefined) ?? "Untitled",
		style: (r.style as string | undefined) ?? "",
		bookType: (r.bookType as BookType | undefined) ?? "comic",
		outputDir: (r.outputDir as string | undefined) ?? "",
		trim: r.trim as KdpTrimSize | undefined,
		pages: rawPages.map((p) => {
			const rawPanels = (p.panels as Array<Record<string, unknown>> | undefined) ?? [];
			return {
				number: (p.number as number | undefined) ?? 1,
				layout: (p.layout as string | undefined) ?? "full-page",
				panels: rawPanels.map((pan) => ({
					index: (pan.index as number | undefined) ?? 0,
					image: (pan.image as string | undefined) ?? "panel-0.png",
					bubbles: (
						(pan.bubbles as Array<Record<string, unknown>> | undefined) ?? []
					).map(normaliseBubble),
				})),
			};
		}),
	};
}

export function serializeToComicJson(doc: BookDocument): string {
	const out = {
		...doc,
		pages: doc.pages.map((p) => ({
			...p,
			panels: p.panels.map((pan) => ({
				...pan,
				bubbles: pan.bubbles.map((b) => ({
					id: b.id,
					type: b.type,
					text: b.text,
					character: b.character,
					position: { x: b.position.x / 100, y: b.position.y / 100 },
					size: { width: b.size.width / 100, height: b.size.height / 100 },
					style: {
						tail_direction: b.style.tailDirection,
						font_size: b.style.fontSize,
						font_family: b.style.fontFamily,
						text_color: b.style.textColor,
						bg_color: b.style.bgColor,
						border_color: b.style.borderColor,
						border_width: b.style.borderWidth,
						padding: b.style.padding,
						border_radius: b.style.borderRadius,
					},
				})),
			})),
		})),
	};
	return JSON.stringify(out, null, 2);
}
