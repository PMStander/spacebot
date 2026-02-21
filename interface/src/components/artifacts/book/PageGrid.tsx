import { useRef, useState } from "react";
import { panelImageUrl } from "./utils";
import type { BookDocument, BookMetadata, BookPage } from "./types";

interface PageGridProps {
	doc: BookDocument;
	metadata: BookMetadata;
	setMetadata: (updater: (m: BookMetadata) => BookMetadata) => void;
	onSaveDoc: (doc: BookDocument) => void;
	isCurrentVersion: boolean;
}

export function PageGrid({
	doc,
	metadata,
	setMetadata,
	onSaveDoc,
	isCurrentVersion,
}: PageGridProps) {
	const dragFromIndex = useRef<number | null>(null);
	const [dragOver, setDragOver] = useState<number | null>(null);

	const openPage = (index: number) => {
		setMetadata((m) => ({
			...m,
			view: "page",
			selectedPageIndex: index,
			selectedBubbleId: null,
			selectedPanelIndex: null,
		}));
	};

	const handleDragStart = (index: number) => {
		dragFromIndex.current = index;
	};

	const handleDragOver = (e: React.DragEvent, index: number) => {
		e.preventDefault();
		setDragOver(index);
	};

	const handleDrop = (targetIndex: number) => {
		const from = dragFromIndex.current;
		setDragOver(null);
		dragFromIndex.current = null;

		if (from === null || from === targetIndex) return;

		// Reorder pages array; preserve page.number (matches on-disk dirs)
		const pages = [...doc.pages];
		const [moved] = pages.splice(from, 1);
		pages.splice(targetIndex, 0, moved);
		onSaveDoc({ ...doc, pages });

		// Keep selection pointing at the moved page in its new position
		if (metadata.selectedPageIndex === from) {
			setMetadata((m) => ({ ...m, selectedPageIndex: targetIndex }));
		}
	};

	const handleDragEnd = () => {
		setDragOver(null);
		dragFromIndex.current = null;
	};

	const pagePreview = (page: BookPage): string => {
		if (page.text?.trim()) return page.text.trim();
		if (page.readAloud?.trim()) return page.readAloud.trim();
		if (page.activity?.trim()) return page.activity.trim();
		if (page.puzzle?.instructions?.trim()) return page.puzzle.instructions.trim();
		if (page.drawing?.prompt?.trim()) return page.drawing.prompt.trim();
		if (page.illustrationPrompt?.trim()) return page.illustrationPrompt.trim();
		return "No preview text";
	};

	return (
		<div className="grid grid-cols-3 gap-3 overflow-auto p-4 xl:grid-cols-4">
			{doc.pages.map((page: BookPage, i: number) => {
				const firstPanel = page.panels[0];
				const thumbSrc =
					firstPanel
						? panelImageUrl(doc.outputDir, page.number, firstPanel.image, firstPanel.index)
						: null;

				const isSelected = i === metadata.selectedPageIndex && metadata.view === "page";
				const isDragTarget = dragOver === i;

				return (
					<div
						key={page.number}
						draggable={isCurrentVersion}
						onDragStart={() => handleDragStart(i)}
						onDragOver={(e) => handleDragOver(e, i)}
						onDrop={() => handleDrop(i)}
						onDragEnd={handleDragEnd}
						onClick={() => openPage(i)}
						className={`group cursor-pointer overflow-hidden rounded-md border transition-all ${
							isSelected
								? "border-accent/60 ring-1 ring-accent/30"
								: isDragTarget
									? "border-accent/40 bg-accent/5"
									: "border-app-line/50 hover:border-app-line"
						} bg-app-darkBox`}
					>
						{/* Thumbnail image */}
						<div className="relative w-full" style={{ paddingBottom: "133%" }}>
							<div className="absolute inset-0">
								{thumbSrc ? (
									<img
										src={thumbSrc}
										alt={`Page ${page.number}`}
										className="h-full w-full object-cover"
										loading="lazy"
										draggable={false}
										onError={(e) => {
											(e.target as HTMLImageElement).style.display = "none";
										}}
									/>
								) : (
									<div className="flex h-full w-full items-center justify-center p-2 text-center text-tiny text-ink-faint">
										<span className="line-clamp-5">{pagePreview(page)}</span>
									</div>
								)}
							</div>
						</div>

						{/* Page label */}
						<div className="flex items-center justify-between px-2 py-1">
							<span className="text-tiny text-ink-faint">Page {page.number}</span>
							{page.panels.length > 1 && (
								<span className="text-tiny text-ink-faint/60">
									{page.panels.length} panels
								</span>
							)}
							{page.panels.length <= 1 && page.puzzle?.type && (
								<span className="text-tiny text-ink-faint/60">
									{page.puzzle.type}
								</span>
							)}
						</div>
					</div>
				);
			})}

			{/* Empty state */}
			{doc.pages.length === 0 && (
				<div className="col-span-full flex flex-col items-center justify-center gap-2 py-16 text-ink-faint">
					<p className="text-sm">No pages yet.</p>
					<p className="text-tiny">Ask the AI to generate pages for your book.</p>
				</div>
			)}
		</div>
	);
}
