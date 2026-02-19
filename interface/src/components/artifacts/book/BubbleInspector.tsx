import { Button } from "@/ui";
import { BOOK_TYPE_DEFAULTS, BUBBLE_TYPE_LABELS, SAFE_FONT_LIST } from "./constants";
import type { Bubble, BookType, BubbleType } from "./types";

interface BubbleInspectorProps {
	selectedBubble: Bubble | null;
	bookType: BookType;
	onUpdate: (patch: Partial<Bubble>) => void;
	onDelete: () => void;
}

export function BubbleInspector({
	selectedBubble,
	bookType,
	onUpdate,
	onDelete,
}: BubbleInspectorProps) {
	if (!selectedBubble) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
				<p className="text-tiny text-ink-faint">
					Click on the panel to add a bubble, or select an existing one to edit it.
				</p>
			</div>
		);
	}

	const { style, type } = selectedBubble;
	const allowed = BOOK_TYPE_DEFAULTS[bookType].allowedBubbleTypes;

	const updateStyle = (patch: Partial<typeof style>) =>
		onUpdate({ style: { ...style, ...patch } });

	return (
		<div className="flex h-full flex-col gap-3 overflow-auto p-3">
			<div className="text-tiny font-medium uppercase tracking-wider text-ink-faint">
				Bubble
			</div>

			{/* Type selector */}
			<div className="flex flex-col gap-1.5">
				<label className="text-tiny text-ink-faint">Type</label>
				<div className="flex flex-wrap gap-1">
					{allowed.map((t: BubbleType) => (
						<button
							type="button"
							key={t}
							onClick={() => onUpdate({ type: t })}
							className={`rounded px-2 py-0.5 text-tiny transition-colors ${
								type === t
									? "bg-accent/20 text-accent"
									: "bg-app-line/30 text-ink-dull hover:bg-app-line/60 hover:text-ink"
							}`}
						>
							{BUBBLE_TYPE_LABELS[t]}
						</button>
					))}
				</div>
			</div>

			{/* Text content */}
			<div className="flex flex-col gap-1.5">
				<label className="text-tiny text-ink-faint">Text</label>
				<textarea
					className="rounded border border-app-line/50 bg-app-darkBox p-2 text-sm text-ink focus:border-accent/50 focus:outline-none resize-none"
					rows={3}
					value={selectedBubble.text}
					onChange={(e) => onUpdate({ text: e.target.value })}
					placeholder="Bubble text…"
				/>
			</div>

			{/* Character */}
			<div className="flex flex-col gap-1.5">
				<label className="text-tiny text-ink-faint">Character (optional)</label>
				<input
					type="text"
					className="rounded border border-app-line/50 bg-app-darkBox px-2 py-1 text-sm text-ink focus:border-accent/50 focus:outline-none"
					value={selectedBubble.character}
					onChange={(e) => onUpdate({ character: e.target.value })}
					placeholder="Hero, Villain…"
				/>
			</div>

			{/* Divider */}
			<div className="border-t border-app-line/30" />

			{/* Font family */}
			<div className="flex flex-col gap-1.5">
				<label className="text-tiny text-ink-faint">Font</label>
				<select
					className="rounded border border-app-line/50 bg-app-darkBox px-2 py-1 text-sm text-ink focus:border-accent/50 focus:outline-none"
					value={style.fontFamily}
					onChange={(e) => updateStyle({ fontFamily: e.target.value })}
				>
					{SAFE_FONT_LIST.map((f) => (
						<option key={f} value={f} style={{ fontFamily: f }}>
							{f}
						</option>
					))}
				</select>
			</div>

			{/* Font size */}
			<div className="flex flex-col gap-1.5">
				<label className="text-tiny text-ink-faint">
					Size <span className="text-ink-dull">{style.fontSize}pt</span>
				</label>
				<input
					type="range"
					min={8}
					max={36}
					step={1}
					value={style.fontSize}
					onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
					className="w-full accent-accent"
				/>
			</div>

			{/* Divider */}
			<div className="border-t border-app-line/30" />

			{/* Colors */}
			{[
				{ label: "Text color", key: "textColor" as const },
				{ label: "Background", key: "bgColor" as const },
				{ label: "Border color", key: "borderColor" as const },
			].map(({ label, key }) => (
				<div key={key} className="flex items-center justify-between">
					<label className="text-tiny text-ink-faint">{label}</label>
					<div className="flex items-center gap-1.5">
						<span className="text-tiny text-ink-dull">{style[key]}</span>
						<input
							type="color"
							value={style[key]}
							onChange={(e) => updateStyle({ [key]: e.target.value })}
							className="h-6 w-8 cursor-pointer rounded border border-app-line/30 bg-transparent p-0"
						/>
					</div>
				</div>
			))}

			{/* Border width */}
			<div className="flex flex-col gap-1.5">
				<label className="text-tiny text-ink-faint">
					Border <span className="text-ink-dull">{style.borderWidth}px</span>
				</label>
				<input
					type="range"
					min={0}
					max={6}
					step={0.5}
					value={style.borderWidth}
					onChange={(e) => updateStyle({ borderWidth: Number(e.target.value) })}
					className="w-full accent-accent"
				/>
			</div>

			{/* Tail direction — only for speech/thought */}
			{(type === "speech" || type === "thought") && (
				<div className="flex flex-col gap-1.5">
					<label className="text-tiny text-ink-faint">Tail direction</label>
					<div className="grid grid-cols-2 gap-1">
						{(
							[
								"top-left",
								"top-right",
								"bottom-left",
								"bottom-right",
							] as const
						).map((dir) => (
							<button
								type="button"
								key={dir}
								onClick={() => updateStyle({ tailDirection: dir })}
								className={`rounded px-2 py-0.5 text-tiny transition-colors ${
									style.tailDirection === dir
										? "bg-accent/20 text-accent"
										: "bg-app-line/30 text-ink-dull hover:bg-app-line/60"
								}`}
							>
								{dir.replace("-", " ")}
							</button>
						))}
					</div>
				</div>
			)}

			{/* Spacer + delete */}
			<div className="mt-auto pt-2">
				<Button
					variant="ghost"
					size="sm"
					className="w-full text-red-400 hover:bg-red-500/10 hover:text-red-300"
					onClick={onDelete}
				>
					Delete bubble
				</Button>
			</div>
		</div>
	);
}
