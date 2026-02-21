import type {
	BookDocument,
	BookMetadata,
	BookPage,
	DrawingSpec,
	GenerationMode,
	PuzzleSpec,
	PuzzleType,
} from "./types";

interface StructuredBookEditorProps {
	doc: BookDocument;
	metadata: BookMetadata;
	setMetadata: (updater: (m: BookMetadata) => BookMetadata) => void;
	onSaveDoc: (doc: BookDocument) => void;
	isCurrentVersion: boolean;
	sendMessage?: (text: string) => void;
}

function splitLines(value: string): string[] {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

function joinLines(lines?: string[]): string {
	return (lines ?? []).join("\n");
}

export function StructuredBookEditor({
	doc,
	metadata,
	setMetadata,
	onSaveDoc,
	isCurrentVersion,
	sendMessage,
}: StructuredBookEditorProps) {
	const page = doc.pages[metadata.selectedPageIndex];
	if (!page) return null;
	const mode: GenerationMode | undefined = doc.mode;

	const updatePage = (updater: (page: BookPage) => BookPage) => {
		onSaveDoc({
			...doc,
			pages: doc.pages.map((currentPage, index) =>
				index === metadata.selectedPageIndex ? updater(currentPage) : currentPage,
			),
		});
	};

	const updatePuzzle = (patch: Partial<PuzzleSpec>) => {
		updatePage((currentPage) => ({
			...currentPage,
			puzzle: {
				type: currentPage.puzzle?.type ?? "other",
				...(currentPage.puzzle ?? {}),
				...patch,
			},
		}));
	};

	const updateDrawing = (patch: Partial<DrawingSpec>) => {
		updatePage((currentPage) => ({
			...currentPage,
			drawing: {
				...(currentPage.drawing ?? {}),
				...patch,
			},
		}));
	};

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-1 overflow-x-auto border-b border-app-line/50 px-3 py-1.5">
				<span className="mr-1 flex-shrink-0 text-tiny text-ink-faint">Pages:</span>
				{doc.pages.map((candidate, index) => (
					<button
						key={candidate.number}
						type="button"
						onClick={() =>
							setMetadata((currentMetadata) => ({
								...currentMetadata,
								selectedPageIndex: index,
								selectedBubbleId: null,
								selectedPanelIndex: null,
							}))
						}
						className={`flex-shrink-0 rounded px-2 py-0.5 text-tiny transition-colors ${
							index === metadata.selectedPageIndex
								? "bg-accent/20 text-accent"
								: "text-ink-faint hover:text-ink"
						}`}
					>
						{candidate.number}
					</button>
				))}
				{isCurrentVersion && (
					<button
						type="button"
						onClick={() => {
							const nextNumber = doc.pages.length + 1;
							onSaveDoc({
								...doc,
								pages: [
									...doc.pages,
									{
										number: nextNumber,
										layout: "page",
										panels: [],
										text: "",
									},
								],
							});
							setMetadata((currentMetadata) => ({
								...currentMetadata,
								selectedPageIndex: doc.pages.length,
								selectedBubbleId: null,
								selectedPanelIndex: null,
							}));
						}}
						className="ml-1 rounded border border-app-line/60 px-2 py-0.5 text-tiny text-ink-faint hover:text-ink"
					>
						+ Add page
					</button>
				)}
			</div>

			<div className="flex-1 overflow-auto p-4">
				<div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
					<div className="rounded border border-app-line/40 bg-app-darkBox/40 p-3">
						<p className="text-xs uppercase tracking-wide text-ink-faint">
							{doc.bookType} editor mode
						</p>
						<p className="mt-1 text-tiny text-ink-faint">
							Page {page.number}
						</p>
						{mode && (
							<p className="mt-1 text-tiny text-ink-faint">
								Generation mode: <span className="text-ink">{mode}</span>
							</p>
						)}
						{sendMessage && (
							<div className="mt-2 flex flex-wrap gap-1.5">
								<button
									type="button"
									className="rounded border border-app-line/60 px-2 py-0.5 text-tiny text-ink-faint hover:text-ink"
									onClick={() =>
										sendMessage(
											`Run a YOLO autopilot pass for this ${doc.bookType} book. Fill missing content and polish consistency across all pages.`,
										)
									}
								>
									YOLO pass
								</button>
								<button
									type="button"
									className="rounded border border-app-line/60 px-2 py-0.5 text-tiny text-ink-faint hover:text-ink"
									onClick={() =>
										sendMessage(
											`Switch this ${doc.bookType} book to guided mode and walk page-by-page with approval before finalizing each page.`,
										)
									}
								>
									Guided pass
								</button>
							</div>
						)}
					</div>

					{(doc.bookType === "novel" || doc.bookType === "illustrated-novel") && (
						<div className="flex flex-col gap-3">
							<label className="flex flex-col gap-1">
								<span className="text-tiny text-ink-faint">Chapter title</span>
								<input
									value={page.title ?? ""}
									onChange={(event) =>
										updatePage((currentPage) => ({
											...currentPage,
											title: event.target.value || undefined,
										}))
									}
									className="rounded border border-app-line/50 bg-app-darkBox px-2 py-1 text-sm text-ink focus:border-accent/50 focus:outline-none"
									placeholder="Chapter or section title"
								/>
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-tiny text-ink-faint">Page text</span>
								<textarea
									rows={14}
									value={page.text ?? ""}
									onChange={(event) =>
										updatePage((currentPage) => ({
											...currentPage,
											text: event.target.value,
										}))
									}
									className="resize-y rounded border border-app-line/50 bg-app-darkBox p-2 text-sm text-ink focus:border-accent/50 focus:outline-none"
									placeholder="Write narrative text for this page..."
								/>
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-tiny text-ink-faint">Illustration prompt (optional)</span>
								<textarea
									rows={3}
									value={page.illustrationPrompt ?? ""}
									onChange={(event) =>
										updatePage((currentPage) => ({
											...currentPage,
											illustrationPrompt: event.target.value || undefined,
										}))
									}
									className="resize-y rounded border border-app-line/50 bg-app-darkBox p-2 text-sm text-ink focus:border-accent/50 focus:outline-none"
									placeholder="Optional art direction for this page"
								/>
							</label>
						</div>
					)}

					{(doc.bookType === "kids" || doc.bookType === "children") && (
						<div className="flex flex-col gap-3">
							<label className="flex flex-col gap-1">
								<span className="text-tiny text-ink-faint">Story text</span>
								<textarea
									rows={10}
									value={page.text ?? ""}
									onChange={(event) =>
										updatePage((currentPage) => ({
											...currentPage,
											text: event.target.value,
										}))
									}
									className="resize-y rounded border border-app-line/50 bg-app-darkBox p-2 text-sm text-ink focus:border-accent/50 focus:outline-none"
									placeholder="Simple page text for young readers..."
								/>
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-tiny text-ink-faint">Read-aloud line</span>
								<input
									value={page.readAloud ?? ""}
									onChange={(event) =>
										updatePage((currentPage) => ({
											...currentPage,
											readAloud: event.target.value || undefined,
										}))
									}
									className="rounded border border-app-line/50 bg-app-darkBox px-2 py-1 text-sm text-ink focus:border-accent/50 focus:outline-none"
									placeholder="A rhythmic or repeatable line for reading aloud"
								/>
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-tiny text-ink-faint">Activity prompt</span>
								<input
									value={page.activity ?? ""}
									onChange={(event) =>
										updatePage((currentPage) => ({
											...currentPage,
											activity: event.target.value || undefined,
										}))
									}
									className="rounded border border-app-line/50 bg-app-darkBox px-2 py-1 text-sm text-ink focus:border-accent/50 focus:outline-none"
									placeholder="Find-and-seek, counting, or discussion prompt"
								/>
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-tiny text-ink-faint">Illustration prompt</span>
								<textarea
									rows={3}
									value={page.illustrationPrompt ?? ""}
									onChange={(event) =>
										updatePage((currentPage) => ({
											...currentPage,
											illustrationPrompt: event.target.value || undefined,
										}))
									}
									className="resize-y rounded border border-app-line/50 bg-app-darkBox p-2 text-sm text-ink focus:border-accent/50 focus:outline-none"
									placeholder="Visual guidance for this page"
								/>
							</label>
						</div>
					)}

					{doc.bookType === "puzzle" && (
						<div className="flex flex-col gap-3">
							<label className="flex flex-col gap-1">
								<span className="text-tiny text-ink-faint">Puzzle type</span>
								<select
									value={page.puzzle?.type ?? "other"}
									onChange={(event) =>
										updatePuzzle({ type: event.target.value as PuzzleType })
									}
									className="rounded border border-app-line/50 bg-app-darkBox px-2 py-1 text-sm text-ink focus:border-accent/50 focus:outline-none"
								>
									<option value="word-search">word-search</option>
									<option value="crossword">crossword</option>
									<option value="maze">maze</option>
									<option value="logic">logic</option>
									<option value="sudoku">sudoku</option>
									<option value="other">other</option>
								</select>
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-tiny text-ink-faint">Instructions</span>
								<textarea
									rows={3}
									value={page.puzzle?.instructions ?? ""}
									onChange={(event) =>
										updatePuzzle({ instructions: event.target.value || undefined })
									}
									className="resize-y rounded border border-app-line/50 bg-app-darkBox p-2 text-sm text-ink focus:border-accent/50 focus:outline-none"
									placeholder="How to solve this puzzle"
								/>
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-tiny text-ink-faint">Clues (one per line)</span>
								<textarea
									rows={6}
									value={joinLines(page.puzzle?.clues)}
									onChange={(event) =>
										updatePuzzle({ clues: splitLines(event.target.value) })
									}
									className="resize-y rounded border border-app-line/50 bg-app-darkBox p-2 text-sm text-ink focus:border-accent/50 focus:outline-none"
									placeholder="Clue 1&#10;Clue 2&#10;Clue 3"
								/>
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-tiny text-ink-faint">Grid / board rows (one row per line)</span>
								<textarea
									rows={8}
									value={joinLines(page.puzzle?.grid)}
									onChange={(event) =>
										updatePuzzle({ grid: splitLines(event.target.value) })
									}
									className="resize-y rounded border border-app-line/50 bg-app-darkBox p-2 font-mono text-sm text-ink focus:border-accent/50 focus:outline-none"
									placeholder="A B C D E&#10;F G H I J"
								/>
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-tiny text-ink-faint">Answer key (optional)</span>
								<textarea
									rows={4}
									value={page.puzzle?.answerKey ?? ""}
									onChange={(event) =>
										updatePuzzle({ answerKey: event.target.value || undefined })
									}
									className="resize-y rounded border border-app-line/50 bg-app-darkBox p-2 text-sm text-ink focus:border-accent/50 focus:outline-none"
									placeholder="Store solution details here"
								/>
							</label>
						</div>
					)}

					{doc.bookType === "drawing" && (
						<div className="flex flex-col gap-3">
							<label className="flex flex-col gap-1">
								<span className="text-tiny text-ink-faint">Lesson prompt</span>
								<textarea
									rows={4}
									value={page.drawing?.prompt ?? ""}
									onChange={(event) =>
										updateDrawing({ prompt: event.target.value || undefined })
									}
									className="resize-y rounded border border-app-line/50 bg-app-darkBox p-2 text-sm text-ink focus:border-accent/50 focus:outline-none"
									placeholder="What should the learner draw on this page?"
								/>
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-tiny text-ink-faint">Step-by-step (one step per line)</span>
								<textarea
									rows={8}
									value={joinLines(page.drawing?.steps)}
									onChange={(event) =>
										updateDrawing({ steps: splitLines(event.target.value) })
									}
									className="resize-y rounded border border-app-line/50 bg-app-darkBox p-2 text-sm text-ink focus:border-accent/50 focus:outline-none"
									placeholder="Step 1...&#10;Step 2...&#10;Step 3..."
								/>
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-tiny text-ink-faint">Materials (one item per line)</span>
								<textarea
									rows={4}
									value={joinLines(page.drawing?.materials)}
									onChange={(event) =>
										updateDrawing({ materials: splitLines(event.target.value) })
									}
									className="resize-y rounded border border-app-line/50 bg-app-darkBox p-2 text-sm text-ink focus:border-accent/50 focus:outline-none"
									placeholder="Pencil&#10;Eraser&#10;Markers"
								/>
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-tiny text-ink-faint">Tips</span>
								<textarea
									rows={4}
									value={page.drawing?.tips ?? ""}
									onChange={(event) =>
										updateDrawing({ tips: event.target.value || undefined })
									}
									className="resize-y rounded border border-app-line/50 bg-app-darkBox p-2 text-sm text-ink focus:border-accent/50 focus:outline-none"
									placeholder="Coaching notes and common mistakes"
								/>
							</label>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
