import { useState } from "react";
import { BubbleLayer } from "./BubbleLayer";
import { panelImageUrl } from "./utils";
import type { Bubble, BookDocument, BookPage, BookPanel, BookMetadata } from "./types";

interface PanelCanvasProps {
	panel: BookPanel;
	page: BookPage;
	doc: BookDocument;
	metadata: BookMetadata;
	isCurrentVersion: boolean;
	isSelectedPanel: boolean;
	onSelectPanel: () => void;
	onSelectBubble: (id: string | null) => void;
	onUpdateBubble: (bubbleId: string, patch: Partial<Bubble>) => void;
	onAddBubble: (bubble: Bubble) => void;
}

export function PanelCanvas({
	panel,
	page,
	doc,
	metadata,
	isCurrentVersion,
	isSelectedPanel,
	onSelectPanel,
	onSelectBubble,
	onUpdateBubble,
	onAddBubble,
}: PanelCanvasProps) {
	const [imgError, setImgError] = useState(false);
	const imgSrc = panelImageUrl(doc.outputDir, page.number, panel.image, panel.index);

	return (
		<div
			className={`relative select-none overflow-hidden rounded-md border bg-app-darkBox ${
				isSelectedPanel ? "border-accent/70" : "border-app-line/30"
			}`}
			onClick={(e) => {
				onSelectPanel();
				// Clicking the panel background (not a bubble) clears selection
				if (!(e.target as Element).closest("[data-bubble]")) {
					onSelectBubble(null);
				}
			}}
		>
			{/* Panel image */}
			{!imgError && imgSrc ? (
				<img
					src={imgSrc}
					alt={`Page ${page.number} panel ${panel.index}`}
					className="block w-full"
					draggable={false}
					onError={() => setImgError(true)}
				/>
			) : (
				<div className="flex aspect-[3/4] w-full items-center justify-center text-tiny text-ink-faint">
					{imgError ? "Image not found" : "No image"}
				</div>
			)}

			{/* SVG bubble overlay */}
			{!imgError && (
				<BubbleLayer
					bubbles={panel.bubbles}
					selectedBubbleId={metadata.selectedBubbleId}
					bookType={doc.bookType}
					isCurrentVersion={isCurrentVersion}
					onSelectBubble={onSelectBubble}
					onUpdateBubble={onUpdateBubble}
					onAddBubble={onAddBubble}
				/>
			)}
		</div>
	);
}
