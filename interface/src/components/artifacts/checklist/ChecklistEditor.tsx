import { useMemo, useCallback } from "react";

interface ChecklistItem {
	id: string;
	text: string;
	done: boolean;
	priority?: "high" | "medium" | "low";
}

interface ChecklistGroup {
	name: string;
	items: ChecklistItem[];
}

interface ChecklistData {
	title?: string;
	groups: ChecklistGroup[];
}

const PRIORITY_COLORS: Record<string, string> = {
	high: "bg-red-500",
	medium: "bg-yellow-500",
	low: "bg-green-500",
};

export function ChecklistEditor({
	content,
	onSaveContent,
	status,
}: {
	content: string;
	onSaveContent: (updated: string, debounce: boolean) => void;
	status: "streaming" | "idle";
}) {
	const parsed = useMemo<ChecklistData | null>(() => {
		try {
			return JSON.parse(content);
		} catch {
			return null;
		}
	}, [content]);

	const toggleItem = useCallback(
		(groupIdx: number, itemIdx: number) => {
			if (!parsed || status === "streaming") return;
			const updated = structuredClone(parsed);
			updated.groups[groupIdx].items[itemIdx].done =
				!updated.groups[groupIdx].items[itemIdx].done;
			onSaveContent(JSON.stringify(updated, null, 2), true);
		},
		[parsed, onSaveContent, status],
	);

	if (!parsed) {
		if (status === "streaming") {
			return (
				<div className="flex h-64 items-center justify-center text-ink-faint text-sm">
					Generating checklist...
				</div>
			);
		}
		return (
			<div className="flex h-64 items-center justify-center text-red-400 text-sm">
				Invalid checklist data
			</div>
		);
	}

	return (
		<div className="p-4 space-y-4">
			{parsed.title && (
				<h3 className="text-sm font-medium text-ink">{parsed.title}</h3>
			)}
			{parsed.groups.map((group, gi) => {
				const doneCount = group.items.filter((i) => i.done).length;
				const total = group.items.length;
				const pct = total > 0 ? (doneCount / total) * 100 : 0;

				return (
					<div key={gi} className="space-y-2">
						<div className="flex items-center gap-2">
							<span className="text-xs font-medium text-ink-dull uppercase tracking-wide">
								{group.name}
							</span>
							<span className="text-[10px] text-ink-faint">
								{doneCount}/{total}
							</span>
						</div>
						<div className="h-1 rounded-full bg-app-line overflow-hidden">
							<div
								className="h-full rounded-full bg-accent transition-all duration-300"
								style={{ width: `${pct}%` }}
							/>
						</div>
						<div className="space-y-1">
							{group.items.map((item, ii) => (
								<label
									key={item.id}
									className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-app-line/30 cursor-pointer group"
								>
									<input
										type="checkbox"
										checked={item.done}
										onChange={() => toggleItem(gi, ii)}
										disabled={status === "streaming"}
										className="h-4 w-4 rounded border-app-line accent-accent"
									/>
									{item.priority && (
										<span
											className={`h-2 w-2 rounded-full ${PRIORITY_COLORS[item.priority] ?? ""}`}
											title={item.priority}
										/>
									)}
									<span
										className={`text-sm flex-1 ${
											item.done
												? "line-through text-ink-faint"
												: "text-ink"
										}`}
									>
										{item.text}
									</span>
								</label>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}
