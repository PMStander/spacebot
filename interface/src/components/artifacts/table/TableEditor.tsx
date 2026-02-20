import { useMemo, useState, useCallback } from "react";

interface TableColumn {
	key: string;
	label: string;
	type?: "text" | "number" | "boolean";
	sortable?: boolean;
}

interface TableData {
	columns: TableColumn[];
	rows: Record<string, unknown>[];
}

export function TableEditor({
	content,
	onSaveContent,
	status,
}: {
	content: string;
	onSaveContent: (updated: string, debounce: boolean) => void;
	status: "streaming" | "idle";
}) {
	const [sortKey, setSortKey] = useState<string | null>(null);
	const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
	const [filters, setFilters] = useState<Record<string, string>>({});
	const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);

	const parsed = useMemo<TableData | null>(() => {
		try {
			return JSON.parse(content);
		} catch {
			return null;
		}
	}, [content]);

	const handleSort = useCallback((key: string) => {
		setSortKey((prev) => {
			if (prev === key) {
				setSortDir((d) => (d === "asc" ? "desc" : "asc"));
				return key;
			}
			setSortDir("asc");
			return key;
		});
	}, []);

	const handleFilter = useCallback((key: string, value: string) => {
		setFilters((prev) => ({ ...prev, [key]: value }));
	}, []);

	const handleCellEdit = useCallback(
		(rowIdx: number, colKey: string, value: string) => {
			if (!parsed || status === "streaming") return;
			const updated = structuredClone(parsed);
			const col = updated.columns.find((c) => c.key === colKey);
			if (col?.type === "number") {
				updated.rows[rowIdx][colKey] = Number(value) || 0;
			} else if (col?.type === "boolean") {
				updated.rows[rowIdx][colKey] = value === "true";
			} else {
				updated.rows[rowIdx][colKey] = value;
			}
			onSaveContent(JSON.stringify(updated, null, 2), true);
			setEditingCell(null);
		},
		[parsed, onSaveContent, status],
	);

	if (!parsed) {
		if (status === "streaming") {
			return (
				<div className="flex h-64 items-center justify-center text-ink-faint text-sm">
					Generating table...
				</div>
			);
		}
		return (
			<div className="flex h-64 items-center justify-center text-red-400 text-sm">
				Invalid table data
			</div>
		);
	}

	const { columns, rows } = parsed;

	// Filter rows
	let filteredRows = rows.map((row, i) => ({ ...row, _origIdx: i }) as Record<string, unknown> & { _origIdx: number });
	for (const [key, filter] of Object.entries(filters)) {
		if (!filter) continue;
		const lf = filter.toLowerCase();
		filteredRows = filteredRows.filter((row) =>
			String(row[key] ?? "").toLowerCase().includes(lf),
		);
	}

	// Sort rows
	if (sortKey) {
		const col = columns.find((c) => c.key === sortKey);
		filteredRows.sort((a, b) => {
			const av = a[sortKey];
			const bv = b[sortKey];
			let cmp = 0;
			if (col?.type === "number") {
				cmp = (Number(av) || 0) - (Number(bv) || 0);
			} else {
				cmp = String(av ?? "").localeCompare(String(bv ?? ""));
			}
			return sortDir === "asc" ? cmp : -cmp;
		});
	}

	return (
		<div className="overflow-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b border-app-line">
						{columns.map((col) => (
							<th key={col.key} className="px-3 py-2 text-left">
								<div className="space-y-1">
									<button
										type="button"
										className={`text-xs font-medium uppercase tracking-wide ${
											col.sortable !== false
												? "cursor-pointer hover:text-accent"
												: ""
										} ${sortKey === col.key ? "text-accent" : "text-ink-dull"}`}
										onClick={() =>
											col.sortable !== false && handleSort(col.key)
										}
									>
										{col.label}
										{sortKey === col.key && (
											<span className="ml-1">
												{sortDir === "asc" ? "\u2191" : "\u2193"}
											</span>
										)}
									</button>
									{col.sortable !== false && (
										<input
											type="text"
											placeholder="Filter..."
											value={filters[col.key] ?? ""}
											onChange={(e) => handleFilter(col.key, e.target.value)}
											className="block w-full rounded border border-app-line bg-transparent px-1.5 py-0.5 text-[11px] text-ink placeholder:text-ink-faint"
										/>
									)}
								</div>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{filteredRows.map((row, ri) => (
						<tr
							key={ri}
							className={`border-b border-app-line/50 ${
								ri % 2 === 0 ? "bg-app-box/30" : ""
							} hover:bg-app-line/30`}
						>
							{columns.map((col) => {
								const origIdx = row._origIdx as number;
								const isEditing =
									editingCell?.row === origIdx &&
									editingCell?.col === col.key;
								const value = row[col.key];

								if (isEditing) {
									return (
										<td key={col.key} className="px-3 py-1.5">
											<input
												type={col.type === "number" ? "number" : "text"}
												defaultValue={String(value ?? "")}
												autoFocus
												onBlur={(e) =>
													handleCellEdit(origIdx, col.key, e.target.value)
												}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														handleCellEdit(
															origIdx,
															col.key,
															(e.target as HTMLInputElement).value,
														);
													}
													if (e.key === "Escape") setEditingCell(null);
												}}
												className="w-full rounded border border-accent bg-transparent px-1.5 py-0.5 text-sm text-ink outline-none"
											/>
										</td>
									);
								}

								return (
									<td
										key={col.key}
										className="px-3 py-1.5 text-ink cursor-pointer"
										onDoubleClick={() => {
											if (status !== "streaming") {
												setEditingCell({ row: origIdx, col: col.key });
											}
										}}
									>
										{col.type === "boolean" ? (
											<span
												className={`inline-block h-2 w-2 rounded-full ${
													value ? "bg-green-500" : "bg-red-500"
												}`}
											/>
										) : (
											String(value ?? "")
										)}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
			{filteredRows.length === 0 && (
				<div className="py-8 text-center text-ink-faint text-sm">
					No matching rows
				</div>
			)}
		</div>
	);
}
