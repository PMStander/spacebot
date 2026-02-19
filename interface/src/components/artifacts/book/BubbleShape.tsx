import { useRef, useState, useCallback } from "react";
import { useBubbleDrag } from "./hooks/useBubbleDrag";
import type { Bubble } from "./types";

interface BubbleShapeProps {
	bubble: Bubble;
	isSelected: boolean;
	isCurrentVersion: boolean;
	/** Pixel width of the rendered panel container — used to scale font size */
	containerWidth: number;
	onSelect: () => void;
	onUpdate: (patch: Partial<Bubble>) => void;
}

// Scale CSS font-size (pt) into SVG viewBox units.
// SVG viewBox is 0-100, so 1 viewBox unit ≈ containerWidth/100 px.
// font pt → viewBox: fontSize_pt / (containerWidth / 100)
function scaleFontSize(fontSizePt: number, containerWidth: number): number {
	if (containerWidth <= 0) return 1.5;
	return (fontSizePt / containerWidth) * 100;
}

// Build the SVG path for a speech bubble tail.
// The tail extends from the bottom edge of the bounding box.
function speechTailPath(
	px: number,
	py: number,
	pw: number,
	ph: number,
	direction: Bubble["style"]["tailDirection"],
): string {
	const isLeft = direction.includes("left");
	const isTop = direction.includes("top");

	// Anchor on the ellipse edge
	const anchorX = isLeft ? px + pw * 0.25 : px + pw * 0.75;
	const anchorY = isTop ? py + ph * 0.15 : py + ph * 0.85;

	// Tip of the tail
	const tipX = isLeft ? px + pw * 0.05 : px + pw * 0.95;
	const tipY = isTop ? py - ph * 0.4 : py + ph * 1.4;

	// Width of the tail base
	const baseOffset = pw * 0.08;

	const baseLeft = anchorX - baseOffset;
	const baseRight = anchorX + baseOffset;

	return `M ${baseLeft},${anchorY} L ${tipX},${tipY} L ${baseRight},${anchorY} Z`;
}

// Build a spiky polygon for shout bubbles.
function spikyPolygonPoints(cx: number, cy: number, rx: number, ry: number): string {
	const spikes = 16;
	const pts: string[] = [];
	for (let i = 0; i < spikes * 2; i++) {
		const angle = (i * Math.PI) / spikes - Math.PI / 2;
		const r = i % 2 === 0 ? 1.0 : 0.65;
		pts.push(`${cx + rx * r * Math.cos(angle)},${cy + ry * r * Math.sin(angle)}`);
	}
	return pts.join(" ");
}

export function BubbleShape({
	bubble,
	isSelected,
	isCurrentVersion,
	containerWidth,
	onSelect,
	onUpdate,
}: BubbleShapeProps) {
	const { position: pos, size, style, type } = bubble;
	const [editingText, setEditingText] = useState(false);
	const textRef = useRef<HTMLDivElement>(null);

	// Drag to move
	const { onPointerDown: onMoveDown } = useBubbleDrag({
		onDrag: useCallback(
			(dx: number, dy: number) =>
				onUpdate({
					position: {
						x: Math.max(0, Math.min(100 - size.width, pos.x + dx)),
						y: Math.max(0, Math.min(100 - size.height, pos.y + dy)),
					},
				}),
			[onUpdate, pos, size],
		),
	});

	// Drag SE handle to resize
	const { onPointerDown: onResizeDown } = useBubbleDrag({
		onDrag: useCallback(
			(dx: number, dy: number) =>
				onUpdate({
					size: {
						width: Math.max(8, size.width + dx),
						height: Math.max(6, size.height + dy),
					},
				}),
			[onUpdate, size],
		),
	});

	const strokeW = Math.max(0.2, style.borderWidth * 0.08);
	const rx = style.borderRadius * 0.08;
	const shapeProps = {
		stroke: style.borderColor,
		strokeWidth: strokeW,
		fill: style.bgColor,
	};

	const cx = pos.x + size.width / 2;
	const cy = pos.y + size.height / 2;

	const renderShape = () => {
		switch (type) {
			case "speech":
				return (
					<>
						<ellipse
							cx={cx}
							cy={cy}
							rx={size.width / 2}
							ry={size.height / 2}
							{...shapeProps}
						/>
						<path d={speechTailPath(pos.x, pos.y, size.width, size.height, style.tailDirection)} {...shapeProps} />
					</>
				);

			case "thought":
				return (
					<>
						<ellipse cx={cx} cy={cy} rx={size.width / 2} ry={size.height / 2} {...shapeProps} />
						{/* Chain of diminishing circles as the thought tail */}
						{[
							{ scale: 1.0, offset: 1.6 },
							{ scale: 0.65, offset: 2.6 },
							{ scale: 0.4, offset: 3.4 },
						].map(({ scale, offset }, i) => {
							const isLeft = style.tailDirection.includes("left");
							const isTop = style.tailDirection.includes("top");
							const circX = isLeft ? pos.x + size.width * 0.2 - i * 2.5 : pos.x + size.width * 0.8 + i * 2.5;
							const circY = isTop ? pos.y - offset : pos.y + size.height + offset;
							return (
								<circle
									key={i}
									cx={circX}
									cy={circY}
									r={1.5 * scale}
									{...shapeProps}
								/>
							);
						})}
					</>
				);

			case "narration":
				return (
					<rect
						x={pos.x}
						y={pos.y}
						width={size.width}
						height={size.height}
						rx={rx}
						ry={rx}
						{...shapeProps}
					/>
				);

			case "shout":
				return (
					<polygon
						points={spikyPolygonPoints(cx, cy, size.width / 2, size.height / 2)}
						{...shapeProps}
					/>
				);

			default:
				return null;
		}
	};

	const pad = style.padding * 0.08;
	const fontSizeSvg = scaleFontSize(style.fontSize, containerWidth);

	return (
		<g
			data-bubble={bubble.id}
			style={{ cursor: isCurrentVersion ? "move" : "default" }}
			onPointerDown={(e) => {
				e.stopPropagation();
				onSelect();
				if (isCurrentVersion && !editingText) {
					onMoveDown(e);
				}
			}}
		>
			{renderShape()}

			{/* Text via foreignObject — double-click to edit inline */}
			<foreignObject
				x={pos.x + pad}
				y={pos.y + pad}
				width={Math.max(0, size.width - pad * 2)}
				height={Math.max(0, size.height - pad * 2)}
				style={{ overflow: "visible" }}
			>
				{/* biome-ignore lint/a11y/useValidAriaRole: foreignObject content */}
				<div
					// eslint-disable-next-line @typescript-eslint/ban-ts-comment
					// @ts-ignore — xmlns required inside SVG foreignObject
					xmlns="http://www.w3.org/1999/xhtml"
					ref={textRef}
					contentEditable={isCurrentVersion && editingText}
					suppressContentEditableWarning
					onDoubleClick={(e) => {
						e.stopPropagation();
						if (isCurrentVersion) {
							setEditingText(true);
							setTimeout(() => textRef.current?.focus(), 0);
						}
					}}
					onBlur={(e) => {
						setEditingText(false);
						const newText = e.currentTarget.textContent ?? "";
						if (newText !== bubble.text) {
							onUpdate({ text: newText });
						}
					}}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							setEditingText(false);
							if (textRef.current) textRef.current.textContent = bubble.text;
							textRef.current?.blur();
						}
						e.stopPropagation();
					}}
					style={{
						fontSize: `${fontSizeSvg}px`,
						fontFamily: style.fontFamily,
						color: style.textColor,
						width: "100%",
						height: "100%",
						overflow: "hidden",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						textAlign: "center",
						wordBreak: "break-word",
						pointerEvents: isCurrentVersion ? "auto" : "none",
						outline: "none",
						cursor: editingText ? "text" : "move",
						userSelect: editingText ? "text" : "none",
						lineHeight: "1.2",
					}}
				>
					{bubble.text || (isCurrentVersion ? "Double-click to edit" : "")}
				</div>
			</foreignObject>

			{/* Selection handles */}
			{isSelected && isCurrentVersion && (
				<>
					{/* Dashed selection rect */}
					<rect
						x={pos.x - 0.5}
						y={pos.y - 0.5}
						width={size.width + 1}
						height={size.height + 1}
						fill="none"
						stroke="#4299e1"
						strokeWidth={0.4}
						strokeDasharray="2 1.5"
						pointerEvents="none"
					/>
					{/* NW corner (visual only) */}
					<circle
						cx={pos.x}
						cy={pos.y}
						r={1.2}
						fill="white"
						stroke="#4299e1"
						strokeWidth={0.3}
						pointerEvents="none"
					/>
					{/* NE corner (visual only) */}
					<circle
						cx={pos.x + size.width}
						cy={pos.y}
						r={1.2}
						fill="white"
						stroke="#4299e1"
						strokeWidth={0.3}
						pointerEvents="none"
					/>
					{/* SW corner (visual only) */}
					<circle
						cx={pos.x}
						cy={pos.y + size.height}
						r={1.2}
						fill="white"
						stroke="#4299e1"
						strokeWidth={0.3}
						pointerEvents="none"
					/>
					{/* SE resize handle */}
					<circle
						cx={pos.x + size.width}
						cy={pos.y + size.height}
						r={1.5}
						fill="white"
						stroke="#4299e1"
						strokeWidth={0.3}
						style={{ cursor: "se-resize" }}
						onPointerDown={(e) => {
							e.stopPropagation();
							onResizeDown(e);
						}}
					/>
				</>
			)}
		</g>
	);
}
