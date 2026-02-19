import { useRef } from "react";
import { BubbleShape } from "./BubbleShape";
import { BOOK_TYPE_DEFAULTS } from "./constants";
import type { Bubble, BookType } from "./types";

interface BubbleLayerProps {
	bubbles: Bubble[];
	selectedBubbleId: string | null;
	bookType: BookType;
	isCurrentVersion: boolean;
	onSelectBubble: (id: string | null) => void;
	onUpdateBubble: (bubbleId: string, patch: Partial<Bubble>) => void;
	onAddBubble: (bubble: Bubble) => void;
}

export function BubbleLayer({
	bubbles,
	selectedBubbleId,
	bookType,
	isCurrentVersion,
	onSelectBubble,
	onUpdateBubble,
	onAddBubble,
}: BubbleLayerProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const defaults = BOOK_TYPE_DEFAULTS[bookType];

	const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
		if (!isCurrentVersion) return;
		// If the click landed on a bubble element, don't add a new one
		if ((e.target as SVGElement).closest("[data-bubble]")) {
			return;
		}

		const svg = svgRef.current;
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		const x = ((e.clientX - rect.left) / rect.width) * 100;
		const y = ((e.clientY - rect.top) / rect.height) * 100;

		const bubble: Bubble = {
			id: crypto.randomUUID(),
			type: defaults.defaultBubbleType,
			text: "",
			character: "",
			position: {
				x: Math.min(Math.max(0, x - 12.5), 75),
				y: Math.min(Math.max(0, y - 7.5), 80),
			},
			size: { width: 25, height: 15 },
			style: {
				tailDirection: "bottom-left",
				fontSize: 14,
				fontFamily: defaults.defaultFont,
				textColor: "#000000",
				bgColor: "#FFFFFF",
				borderColor: "#000000",
				borderWidth: 2,
				padding: 12,
				borderRadius: defaults.defaultBorderRadius,
			},
		};
		onAddBubble(bubble);
		onSelectBubble(bubble.id);
	};

	// Measure the rendered container width for font scaling
	const containerWidth = svgRef.current?.getBoundingClientRect().width ?? 300;

	return (
		<svg
			ref={svgRef}
			viewBox="0 0 100 100"
			preserveAspectRatio="none"
			className="absolute inset-0 h-full w-full"
			style={{ pointerEvents: isCurrentVersion ? "all" : "none" }}
			onClick={handleSvgClick}
		>
			{bubbles.map((bubble) => (
				<BubbleShape
					key={bubble.id}
					bubble={bubble}
					isSelected={bubble.id === selectedBubbleId}
					isCurrentVersion={isCurrentVersion}
					containerWidth={containerWidth}
					onSelect={() => onSelectBubble(bubble.id)}
					onUpdate={(patch) => onUpdateBubble(bubble.id, patch)}
				/>
			))}
		</svg>
	);
}
