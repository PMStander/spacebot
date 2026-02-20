import { useMemo, useCallback, useState, type DragEvent } from "react";

interface KanbanCard {
	id: string;
	title: string;
	description?: string;
	color?: string;
}

interface KanbanColumn {
	id: string;
	title: string;
	cards: KanbanCard[];
}

interface KanbanData {
	columns: KanbanColumn[];
}

export function KanbanBoard({
	content,
	onSaveContent,
	status,
}: {
	content: string;
	onSaveContent: (updated: string, debounce: boolean) => void;
	status: "streaming" | "idle";
}) {
	const [dragOverCol, setDragOverCol] = useState<string | null>(null);

	const parsed = useMemo<KanbanData | null>(() => {
		try {
			return JSON.parse(content);
		} catch {
			return null;
		}
	}, [content]);

	const handleDragStart = useCallback(
		(e: DragEvent, cardId: string, sourceColId: string) => {
			e.dataTransfer.setData("cardId", cardId);
			e.dataTransfer.setData("sourceColId", sourceColId);
			e.dataTransfer.effectAllowed = "move";
		},
		[],
	);

	const handleDragOver = useCallback(
		(e: DragEvent, colId: string) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			setDragOverCol(colId);
		},
		[],
	);

	const handleDragLeave = useCallback(() => {
		setDragOverCol(null);
	}, []);

	const handleDrop = useCallback(
		(e: DragEvent, targetColId: string) => {
			e.preventDefault();
			setDragOverCol(null);

			if (!parsed || status === "streaming") return;

			const cardId = e.dataTransfer.getData("cardId");
			const sourceColId = e.dataTransfer.getData("sourceColId");

			if (sourceColId === targetColId) return;

			const updated = structuredClone(parsed);
			const sourceCol = updated.columns.find((c) => c.id === sourceColId);
			const targetCol = updated.columns.find((c) => c.id === targetColId);

			if (!sourceCol || !targetCol) return;

			const cardIdx = sourceCol.cards.findIndex((c) => c.id === cardId);
			if (cardIdx === -1) return;

			const [card] = sourceCol.cards.splice(cardIdx, 1);
			targetCol.cards.push(card);

			onSaveContent(JSON.stringify(updated, null, 2), false);
		},
		[parsed, onSaveContent, status],
	);

	if (!parsed) {
		if (status === "streaming") {
			return (
				<div className="flex h-64 items-center justify-center text-ink-faint text-sm">
					Generating board...
				</div>
			);
		}
		return (
			<div className="flex h-64 items-center justify-center text-red-400 text-sm">
				Invalid kanban data
			</div>
		);
	}

	return (
		<div className="flex gap-3 overflow-x-auto p-4" style={{ minHeight: 300 }}>
			{parsed.columns.map((col) => (
				<div
					key={col.id}
					className={`flex w-64 min-w-[16rem] flex-shrink-0 flex-col rounded-lg border ${
						dragOverCol === col.id
							? "border-accent bg-accent/5"
							: "border-app-line bg-app-darkBox/30"
					}`}
					onDragOver={(e) => handleDragOver(e, col.id)}
					onDragLeave={handleDragLeave}
					onDrop={(e) => handleDrop(e, col.id)}
				>
					<div className="flex items-center justify-between px-3 py-2 border-b border-app-line/50">
						<span className="text-xs font-medium text-ink-dull uppercase tracking-wide">
							{col.title}
						</span>
						<span className="text-[10px] text-ink-faint rounded-full bg-app-line/50 px-1.5 py-0.5">
							{col.cards.length}
						</span>
					</div>
					<div className="flex-1 space-y-2 p-2 min-h-[4rem]">
						{col.cards.map((card) => (
							<div
								key={card.id}
								draggable={status !== "streaming"}
								onDragStart={(e) => handleDragStart(e, card.id, col.id)}
								className="rounded-md border border-app-line bg-app-box p-2.5 cursor-grab active:cursor-grabbing hover:border-ink-faint/30 transition-colors"
								style={{
									borderLeftWidth: card.color ? 3 : undefined,
									borderLeftColor: card.color ?? undefined,
								}}
							>
								<p className="text-sm font-medium text-ink">
									{card.title}
								</p>
								{card.description && (
									<p className="mt-1 text-xs text-ink-faint line-clamp-2">
										{card.description}
									</p>
								)}
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
