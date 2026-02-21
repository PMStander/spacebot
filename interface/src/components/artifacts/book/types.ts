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

export type BookType =
	| "comic"
	| "kids"
	| "children"
	| "novel"
	| "illustrated-novel"
	| "puzzle"
	| "drawing";
export type GenerationMode = "yolo" | "guided";

export interface SceneReference {
	kind: "image" | "style" | "character";
	path: string;
	note?: string;
}

export interface ScenePlan {
	goal?: string;
	beat?: string;
	camera?: string;
	notes?: string;
	approved?: boolean;
	references?: SceneReference[];
}

export type PuzzleType =
	| "word-search"
	| "crossword"
	| "maze"
	| "logic"
	| "sudoku"
	| "other";

export interface PuzzleSpec {
	type: PuzzleType;
	instructions?: string;
	clues?: string[];
	grid?: string[];
	answerKey?: string;
}

export interface DrawingSpec {
	prompt?: string;
	steps?: string[];
	materials?: string[];
	tips?: string;
	referencePaths?: string[];
}

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
	scene?: ScenePlan;
	bubbles: Bubble[];
}

export interface BookPage {
	/** 1-indexed, must match on-disk directory name page-{number}/ */
	number: number;
	layout: string;
	panels: BookPanel[];
	title?: string;
	text?: string;
	illustrationPrompt?: string;
	notes?: string;
	readAloud?: string;
	activity?: string;
	puzzle?: PuzzleSpec;
	drawing?: DrawingSpec;
}

export interface BookDocument {
	id: string;
	title: string;
	style: string;
	bookType: BookType;
	mode?: GenerationMode;
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

function normaliseSceneReference(raw: Record<string, unknown>): SceneReference {
	const kind = raw.kind as SceneReference["kind"] | undefined;
	return {
		kind: kind ?? "image",
		path: (raw.path as string | undefined) ?? "",
		note: raw.note as string | undefined,
	};
}

function normaliseScene(raw: Record<string, unknown>): ScenePlan {
	const references = ((raw.references as Array<Record<string, unknown>> | undefined) ?? [])
		.map(normaliseSceneReference)
		.filter((reference) => reference.path.length > 0);

	return {
		goal: raw.goal as string | undefined,
		beat: raw.beat as string | undefined,
		camera: raw.camera as string | undefined,
		notes: raw.notes as string | undefined,
		approved: typeof raw.approved === "boolean" ? raw.approved : undefined,
		references: references.length > 0 ? references : undefined,
	};
}

function normalisePuzzle(raw: Record<string, unknown>): PuzzleSpec {
	const clues = ((raw.clues as string[] | undefined) ?? []).filter(Boolean);
	const grid = ((raw.grid as string[] | undefined) ?? []).filter(Boolean);
	return {
		type: (raw.type as PuzzleType | undefined) ?? "other",
		instructions: raw.instructions as string | undefined,
		clues: clues.length > 0 ? clues : undefined,
		grid: grid.length > 0 ? grid : undefined,
		answerKey: raw.answerKey as string | undefined,
	};
}

function normaliseDrawing(raw: Record<string, unknown>): DrawingSpec {
	const steps = ((raw.steps as string[] | undefined) ?? []).filter(Boolean);
	const materials = ((raw.materials as string[] | undefined) ?? []).filter(Boolean);
	const referencePaths = ((raw.referencePaths as string[] | undefined) ?? []).filter(Boolean);

	return {
		prompt: raw.prompt as string | undefined,
		steps: steps.length > 0 ? steps : undefined,
		materials: materials.length > 0 ? materials : undefined,
		tips: raw.tips as string | undefined,
		referencePaths: referencePaths.length > 0 ? referencePaths : undefined,
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
		mode: r.mode as GenerationMode | undefined,
		outputDir: (r.outputDir as string | undefined) ?? "",
		trim: r.trim as KdpTrimSize | undefined,
		pages: rawPages.map((p) => {
			const rawPanels = (p.panels as Array<Record<string, unknown>> | undefined) ?? [];
			return {
				number: (p.number as number | undefined) ?? 1,
				layout: (p.layout as string | undefined) ?? "full-page",
				title: p.title as string | undefined,
				text: p.text as string | undefined,
				illustrationPrompt: p.illustrationPrompt as string | undefined,
				notes: p.notes as string | undefined,
				readAloud: p.readAloud as string | undefined,
				activity: p.activity as string | undefined,
				puzzle: p.puzzle
					? normalisePuzzle(p.puzzle as Record<string, unknown>)
					: undefined,
				drawing: p.drawing
					? normaliseDrawing(p.drawing as Record<string, unknown>)
					: undefined,
				panels: rawPanels.map((pan) => ({
					index: (pan.index as number | undefined) ?? 0,
					image: (pan.image as string | undefined) ?? "panel-0.png",
					scene: pan.scene
						? normaliseScene(pan.scene as Record<string, unknown>)
						: undefined,
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
			puzzle: p.puzzle
				? {
						type: p.puzzle.type,
						instructions: p.puzzle.instructions,
						clues: p.puzzle.clues,
						grid: p.puzzle.grid,
						answerKey: p.puzzle.answerKey,
					}
				: undefined,
			drawing: p.drawing
				? {
						prompt: p.drawing.prompt,
						steps: p.drawing.steps,
						materials: p.drawing.materials,
						tips: p.drawing.tips,
						referencePaths: p.drawing.referencePaths,
					}
				: undefined,
			panels: p.panels.map((pan) => ({
				...pan,
				scene: pan.scene
					? {
							goal: pan.scene.goal,
							beat: pan.scene.beat,
							camera: pan.scene.camera,
							notes: pan.scene.notes,
							approved: pan.scene.approved,
							references: pan.scene.references?.map((reference) => ({
								kind: reference.kind,
								path: reference.path,
								note: reference.note,
							})),
						}
					: undefined,
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
