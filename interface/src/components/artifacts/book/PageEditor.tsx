import { useCallback, useEffect } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { BubbleInspector } from "./BubbleInspector";
import { PanelCanvas } from "./PanelCanvas";
import { SceneInspector } from "./SceneInspector";
import type {
	Bubble,
	BookDocument,
	BookMetadata,
	BookPanel,
	BookPage,
	ScenePlan,
} from "./types";

interface PageEditorProps {
	doc: BookDocument;
	metadata: BookMetadata;
	setMetadata: (updater: (m: BookMetadata) => BookMetadata) => void;
	onSaveDoc: (doc: BookDocument) => void;
	isCurrentVersion: boolean;
	sendMessage?: (text: string) => void;
	agentId?: string;
}

export function PageEditor({
	doc,
	metadata,
	setMetadata,
	onSaveDoc,
	isCurrentVersion,
	sendMessage,
	agentId,
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

	const selectedPanel: BookPanel | null =
		metadata.selectedPanelIndex === null
			? null
			: page.panels.find((panel) => panel.index === metadata.selectedPanelIndex) ?? null;

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

	const bringBubbleToFront = useCallback(
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
												bubbles: [
													...pan.bubbles.filter((b) => b.id !== bubbleId),
													...pan.bubbles.filter((b) => b.id === bubbleId),
												],
											},
								),
							},
				),
			);
		},
		[updateDoc, metadata.selectedPageIndex],
	);

	const sendBubbleToBack = useCallback(
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
												bubbles: [
													...pan.bubbles.filter((b) => b.id === bubbleId),
													...pan.bubbles.filter((b) => b.id !== bubbleId),
												],
											},
								),
							},
				),
			);
		},
		[updateDoc, metadata.selectedPageIndex],
	);

	const updateScene = useCallback(
		(panelIndex: number, patch: Partial<ScenePlan>) => {
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
												scene: {
													...(pan.scene ?? {}),
													...patch,
												},
											},
								),
							},
				),
			);
		},
		[metadata.selectedPageIndex, updateDoc],
	);

	const clearScene = useCallback(
		(panelIndex: number) => {
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
												scene: undefined,
											},
								),
							},
				),
			);
		},
		[metadata.selectedPageIndex, updateDoc],
	);

	useEffect(() => {
		if (!isCurrentVersion) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable
			) {
				return;
			}

			const bubbleId = metadata.selectedBubbleId;
			const panelIdx = metadata.selectedPanelIndex;
			if (!bubbleId || panelIdx === null) return;

			const selectedBubbleObj = page?.panels
				.find((p) => p.index === panelIdx)
				?.bubbles.find((b) => b.id === bubbleId);
			if (!selectedBubbleObj) return;

			const step = e.shiftKey ? 5 : 1;

			switch (e.key) {
				case "Delete":
				case "Backspace":
					e.preventDefault();
					deleteBubble(panelIdx, bubbleId);
					break;
				case "ArrowUp":
					e.preventDefault();
					updateBubble(panelIdx, bubbleId, {
						position: {
							...selectedBubbleObj.position,
							y: Math.max(0, selectedBubbleObj.position.y - step),
						},
					});
					break;
				case "ArrowDown":
					e.preventDefault();
					updateBubble(panelIdx, bubbleId, {
						position: {
							...selectedBubbleObj.position,
							y: Math.min(100 - selectedBubbleObj.size.height, selectedBubbleObj.position.y + step),
						},
					});
					break;
				case "ArrowLeft":
					e.preventDefault();
					updateBubble(panelIdx, bubbleId, {
						position: {
							...selectedBubbleObj.position,
							x: Math.max(0, selectedBubbleObj.position.x - step),
						},
					});
					break;
				case "ArrowRight":
					e.preventDefault();
					updateBubble(panelIdx, bubbleId, {
						position: {
							...selectedBubbleObj.position,
							x: Math.min(100 - selectedBubbleObj.size.width, selectedBubbleObj.position.x + step),
						},
					});
					break;
				case "Escape":
					e.preventDefault();
					setMetadata((m) => ({ ...m, selectedBubbleId: null }));
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		isCurrentVersion,
		metadata.selectedBubbleId,
		metadata.selectedPanelIndex,
		page,
		updateBubble,
		deleteBubble,
		setMetadata,
	]);

	const buildPanelRerenderPrompt = useCallback((panel: BookPanel) => {
		const scene = panel.scene ?? {};
		const references = (scene.references ?? [])
			.map((reference) => `- [${reference.kind}] ${reference.path}${reference.note ? ` (${reference.note})` : ""}`)
			.join("\n");

		return [
			`Guided panel rerender request for "${doc.title}".`,
			`Rerender only page ${page.number}, panel ${panel.index + 1}.`,
			"Keep all other pages and panels unchanged.",
			"",
			"Scene plan:",
			`- goal: ${scene.goal ?? "(not set)"}`,
			`- beat: ${scene.beat ?? "(not set)"}`,
			`- camera: ${scene.camera ?? "(not set)"}`,
			`- notes: ${scene.notes ?? "(not set)"}`,
			references.length > 0 ? "References:\n" + references : "References: (none)",
			"",
			"Return an updated <artifact kind=\"book\"> with this panel updated.",
		].join("\n");
	}, [doc.title, page.number]);

	const buildDialogueRewritePrompt = useCallback((panel: BookPanel) => {
		const currentDialogue = panel.bubbles
			.map((b) => `${b.character ? b.character + ": " : ""}${b.text}`)
			.join("\n");
		return [
			`Rewrite the dialogue for "${doc.title}", page ${page.number}, panel ${panel.index + 1}.`,
			"Keep the panel artwork unchanged. Only update the bubble text content.",
			"",
			"Current dialogue:",
			currentDialogue || "(no dialogue yet)",
			"",
			"Return an updated <artifact kind=\"book\"> with improved dialogue for this panel only.",
		].join("\n");
	}, [doc.title, page.number]);

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
								<div key={panel.index} className="relative">
									<PanelCanvas
										panel={panel}
										page={page}
										doc={doc}
										metadata={metadata}
										isCurrentVersion={isCurrentVersion}
										isSelectedPanel={metadata.selectedPanelIndex === panel.index}
										onSelectPanel={() =>
											setMetadata((m) => ({
												...m,
												selectedPanelIndex: panel.index,
											}))
										}
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
									<div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5">
										{doc.mode === "guided" && panel.scene?.approved && (
											<span className="rounded border border-emerald-400/30 bg-emerald-500/15 px-1.5 py-0.5 text-tiny text-emerald-300">
												Approved
											</span>
										)}
										{doc.mode === "guided" && (
											<button
												type="button"
												className="pointer-events-auto rounded border border-app-line/60 bg-app-darkBox/85 px-1.5 py-0.5 text-tiny text-ink-faint transition-colors hover:text-ink disabled:opacity-50"
												disabled={!isCurrentVersion}
												onClick={(event) => {
													event.stopPropagation();
													setMetadata((m) => ({ ...m, selectedPanelIndex: panel.index }));
													updateScene(panel.index, {
														approved: !(panel.scene?.approved ?? false),
													});
												}}
											>
												{panel.scene?.approved ? "Unapprove" : "Approve"}
											</button>
										)}
										<button
											type="button"
											className="pointer-events-auto rounded border border-violet-400/30 bg-violet-500/15 px-1.5 py-0.5 text-tiny text-violet-200 transition-colors hover:bg-violet-500/25 disabled:opacity-50"
											disabled={!isCurrentVersion || !sendMessage}
											onClick={(event) => {
												event.stopPropagation();
												setMetadata((m) => ({ ...m, selectedPanelIndex: panel.index }));
												if (sendMessage) {
													sendMessage(buildPanelRerenderPrompt(panel));
												}
											}}
										>
											Re-render
										</button>
										<button
											type="button"
											className="pointer-events-auto rounded border border-amber-400/30 bg-amber-500/15 px-1.5 py-0.5 text-tiny text-amber-200 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
											disabled={!isCurrentVersion || !sendMessage}
											onClick={(event) => {
												event.stopPropagation();
												setMetadata((m) => ({ ...m, selectedPanelIndex: panel.index }));
												if (sendMessage) {
													sendMessage(buildDialogueRewritePrompt(panel));
												}
											}}
										>
											Rewrite dialogue
										</button>
									</div>
								</div>
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
					<div className="flex h-full flex-col">
						<div className="min-h-0 flex-1 border-b border-app-line/30">
							<SceneInspector
								selectedPanel={selectedPanel}
								mode={doc.mode}
								isCurrentVersion={isCurrentVersion}
								agentId={agentId}
								canRerender={Boolean(sendMessage)}
								onUpdateScene={(patch) => {
									if (metadata.selectedPanelIndex !== null) {
										updateScene(metadata.selectedPanelIndex, patch);
									}
								}}
								onClearScene={() => {
									if (metadata.selectedPanelIndex !== null) {
										clearScene(metadata.selectedPanelIndex);
									}
								}}
								onToggleApproved={() => {
									if (metadata.selectedPanelIndex !== null && selectedPanel) {
										updateScene(metadata.selectedPanelIndex, {
											approved: !(selectedPanel.scene?.approved ?? false),
										});
									}
								}}
								onRerenderPanel={() => {
									if (selectedPanel && sendMessage) {
										sendMessage(buildPanelRerenderPrompt(selectedPanel));
									}
								}}
							/>
						</div>
						<div className="min-h-0 flex-1">
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
								onBringToFront={() => {
									if (selectedBubble && metadata.selectedPanelIndex !== null) {
										bringBubbleToFront(metadata.selectedPanelIndex, selectedBubble.id);
									}
								}}
								onSendToBack={() => {
									if (selectedBubble && metadata.selectedPanelIndex !== null) {
										sendBubbleToBack(metadata.selectedPanelIndex, selectedBubble.id);
									}
								}}
							/>
						</div>
					</div>
				</Panel>
			</Group>
		</div>
	);
}
