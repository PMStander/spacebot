import { useCallback } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { BubbleInspector } from "./BubbleInspector";
import { PanelCanvas } from "./PanelCanvas";
import type { Bubble, BookDocument, BookMetadata, BookPanel, BookPage } from "./types";

interface PageEditorProps {
	doc: BookDocument;
	metadata: BookMetadata;
	setMetadata: (updater: (m: BookMetadata) => BookMetadata) => void;
	onSaveDoc: (doc: BookDocument) => void;
	isCurrentVersion: boolean;
}

export function PageEditor({
	doc,
	metadata,
	setMetadata,
	onSaveDoc,
	isCurrentVersion,
}: PageEditorProps) {
	const page: BookPage | undefined = doc.pages[metadata.selectedPageIndex];
	if (!page) return null;

	// Find the selected bubble across all panels on this page
	const selectedBubble: Bubble | null = (() => {
		if (!metadata.selectedBubbleId) return null;
		for (const panel of page.panels) {
			const b = panel.bubbles.find((b) => b.id === metadata.selectedBubbleId);
			if (b) return b;
		}
		return null;
	})();

	const updateDoc = useCallback(
		(updater: (pages: BookDocument["pages"]) => BookDocument["pages"]) => {
			onSaveDoc({ ...doc, pages: updater(doc.pages) });
		},
		[doc, onSaveDoc],
	);

	const updateBubble = useCallback(
		(panelIndex: number, bubbleId: string, patch: Partial<Bubble>) => {
			updateDoc((pages) =>
				pages.map((p, pi) =>
					pi !== metadata.selectedPageIndex
						? p
						: {
								...p,
								panels: p.panels.map((pan) =>
									pan.index !== panelIndex
										? pan
										: {
												...pan,
												bubbles: pan.bubbles.map((b) =>
													b.id === bubbleId ? { ...b, ...patch } : b,
												),
											},
								),
							},
				),
			);
		},
		[updateDoc, metadata.selectedPageIndex],
	);

	const addBubble = useCallback(
		(panelIndex: number, bubble: Bubble) => {
			updateDoc((pages) =>
				pages.map((p, pi) =>
					pi !== metadata.selectedPageIndex
						? p
						: {
								...p,
								panels: p.panels.map((pan) =>
									pan.index !== panelIndex
										? pan
										: { ...pan, bubbles: [...pan.bubbles, bubble] },
								),
							},
				),
			);
			setMetadata((m) => ({
				...m,
				selectedBubbleId: bubble.id,
				selectedPanelIndex: panelIndex,
			}));
		},
		[updateDoc, metadata.selectedPageIndex, setMetadata],
	);

	const deleteBubble = useCallback(
		(panelIndex: number, bubbleId: string) => {
			updateDoc((pages) =>
				pages.map((p, pi) =>
					pi !== metadata.selectedPageIndex
						? p
						: {
								...p,
								panels: p.panels.map((pan) =>
									pan.index !== panelIndex
										? pan
										: {
												...pan,
												bubbles: pan.bubbles.filter((b) => b.id !== bubbleId),
											},
								),
							},
				),
			);
			setMetadata((m) => ({ ...m, selectedBubbleId: null }));
		},
		[updateDoc, metadata.selectedPageIndex, setMetadata],
	);

	// Columns for panel grid: single panel = 1 col, 2 panels = 2 cols, 3+ = 2 or 3 cols
	const gridCols =
		page.panels.length === 1
			? "grid-cols-1"
			: page.panels.length <= 2
				? "grid-cols-2"
				: page.panels.length <= 4
					? "grid-cols-2"
					: "grid-cols-3";

	return (
		<div className="flex h-full flex-col">
			{/* Page navigation strip */}
			<div className="flex items-center gap-1 overflow-x-auto border-b border-app-line/50 px-3 py-1.5">
				<span className="mr-1 flex-shrink-0 text-tiny text-ink-faint">Pages:</span>
				{doc.pages.map((p: BookPage, i: number) => (
					<button
						type="button"
						key={p.number}
						onClick={() =>
							setMetadata((m) => ({
								...m,
								selectedPageIndex: i,
								selectedBubbleId: null,
								selectedPanelIndex: null,
							}))
						}
						className={`flex-shrink-0 rounded px-2 py-0.5 text-tiny transition-colors ${
							i === metadata.selectedPageIndex
								? "bg-accent/20 text-accent"
								: "text-ink-faint hover:text-ink"
						}`}
					>
						{p.number}
					</button>
				))}
			</div>

			{/* Main split: canvas | inspector */}
			<Group orientation="horizontal" className="min-h-0 flex-1">
				{/* Canvas area */}
				<Panel defaultSize={75} minSize={50}>
					<div
						className="h-full overflow-auto p-4"
						style={{
							transform: metadata.zoom !== 1 ? `scale(${metadata.zoom})` : undefined,
							transformOrigin: "top left",
						}}
					>
						<div className={`grid gap-2 ${gridCols}`}>
							{page.panels.map((panel: BookPanel) => (
								<PanelCanvas
									key={panel.index}
									panel={panel}
									page={page}
									doc={doc}
									metadata={metadata}
									isCurrentVersion={isCurrentVersion}
									onSelectBubble={(id) =>
										setMetadata((m) => ({
											...m,
											selectedBubbleId: id,
											selectedPanelIndex: id !== null ? panel.index : m.selectedPanelIndex,
										}))
									}
									onUpdateBubble={(bubbleId, patch) =>
										updateBubble(panel.index, bubbleId, patch)
									}
									onAddBubble={(bubble) => addBubble(panel.index, bubble)}
								/>
							))}
						</div>

						{/* Help hint when no bubbles */}
						{page.panels.every((p) => p.bubbles.length === 0) && isCurrentVersion && (
							<p className="mt-3 text-center text-tiny text-ink-faint/60">
								Click on a panel to add a speech bubble
							</p>
						)}
					</div>
				</Panel>

				<Separator className="w-px cursor-col-resize bg-app-line/50 transition-colors hover:bg-accent/50" />

				{/* Inspector */}
				<Panel defaultSize={25} minSize={15} collapsible>
					<BubbleInspector
						selectedBubble={selectedBubble}
						bookType={doc.bookType}
						onUpdate={(patch) => {
							if (selectedBubble && metadata.selectedPanelIndex !== null) {
								updateBubble(metadata.selectedPanelIndex, selectedBubble.id, patch);
							}
						}}
						onDelete={() => {
							if (selectedBubble && metadata.selectedPanelIndex !== null) {
								deleteBubble(metadata.selectedPanelIndex, selectedBubble.id);
							}
						}}
					/>
				</Panel>
			</Group>
		</div>
	);
}
