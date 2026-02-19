import { parse, unparse } from "papaparse";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

interface SpreadsheetEditorProps {
	content: string;
	isCurrentVersion: boolean;
	saveContent: (csv: string, debounce: boolean) => void;
	status: "streaming" | "idle";
	currentVersionIndex?: number;
}

const MIN_ROWS = 50;
const MIN_COLS = 26;

function colLabel(index: number): string {
	return String.fromCharCode(65 + index);
}

const PureSpreadsheetEditor = ({
	content,
	saveContent,
}: SpreadsheetEditorProps) => {
	const parseData = useMemo(() => {
		if (!content) {
			return Array.from({ length: MIN_ROWS }, () =>
				new Array(MIN_COLS).fill(""),
			);
		}
		const result = parse<string[]>(content, { skipEmptyLines: true });

		const paddedData = result.data.map((row) => {
			const paddedRow = [...row];
			while (paddedRow.length < MIN_COLS) {
				paddedRow.push("");
			}
			return paddedRow;
		});

		while (paddedData.length < MIN_ROWS) {
			paddedData.push(new Array(MIN_COLS).fill(""));
		}

		return paddedData;
	}, [content]);

	const [localRows, setLocalRows] = useState(parseData);

	useEffect(() => {
		setLocalRows(parseData);
	}, [parseData]);

	const handleCellChange = useCallback(
		(rowIndex: number, colIndex: number, value: string) => {
			setLocalRows((prev) => {
				const updated = prev.map((row) => [...row]);
				updated[rowIndex][colIndex] = value;

				const csv = unparse(updated);
				saveContent(csv, true);

				return updated;
			});
		},
		[saveContent],
	);

	return (
		<div className="size-full overflow-auto">
			<table className="w-full border-collapse text-sm">
				<thead>
					<tr>
						<th className="sticky top-0 z-10 min-w-[50px] border border-zinc-200 bg-zinc-100 px-2 py-1 text-center text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400" />
						{Array.from({ length: MIN_COLS }, (_, i) => (
							<th
								key={i}
								className="sticky top-0 z-10 min-w-[120px] border border-zinc-200 bg-zinc-100 px-2 py-1 text-center text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
							>
								{colLabel(i)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{localRows.map((row, rowIndex) => (
						<tr key={rowIndex}>
							<td className="min-w-[50px] border border-zinc-200 bg-zinc-50 px-2 py-1 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500">
								{rowIndex + 1}
							</td>
							{row.map((cell, colIndex) => (
								<EditableCell
									key={`${rowIndex}-${colIndex}`}
									value={cell}
									rowIndex={rowIndex}
									colIndex={colIndex}
									onChange={handleCellChange}
								/>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};

const EditableCell = memo(
	({
		value,
		rowIndex,
		colIndex,
		onChange,
	}: {
		value: string;
		rowIndex: number;
		colIndex: number;
		onChange: (row: number, col: number, value: string) => void;
	}) => {
		const [editing, setEditing] = useState(false);
		const [localValue, setLocalValue] = useState(value);
		const inputRef = useRef<HTMLInputElement>(null);

		useEffect(() => {
			setLocalValue(value);
		}, [value]);

		useEffect(() => {
			if (editing && inputRef.current) {
				inputRef.current.focus();
			}
		}, [editing]);

		const handleBlur = useCallback(() => {
			setEditing(false);
			if (localValue !== value) {
				onChange(rowIndex, colIndex, localValue);
			}
		}, [localValue, value, onChange, rowIndex, colIndex]);

		const handleKeyDown = useCallback(
			(e: React.KeyboardEvent) => {
				if (e.key === "Enter") {
					handleBlur();
				} else if (e.key === "Escape") {
					setLocalValue(value);
					setEditing(false);
				}
			},
			[handleBlur, value],
		);

		if (editing) {
			return (
				<td className="min-w-[120px] border border-blue-400 p-0 dark:border-blue-500">
					<input
						ref={inputRef}
						type="text"
						value={localValue}
						onChange={(e) => setLocalValue(e.target.value)}
						onBlur={handleBlur}
						onKeyDown={handleKeyDown}
						className="h-full w-full bg-white px-2 py-1 text-sm outline-none dark:bg-zinc-950 dark:text-zinc-50"
					/>
				</td>
			);
		}

		return (
			<td
				className="min-w-[120px] cursor-cell border border-zinc-200 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
				onDoubleClick={() => setEditing(true)}
			>
				{value}
			</td>
		);
	},
);

EditableCell.displayName = "EditableCell";

function areEqual(
	prevProps: SpreadsheetEditorProps,
	nextProps: SpreadsheetEditorProps,
) {
	return (
		prevProps.currentVersionIndex === nextProps.currentVersionIndex &&
		prevProps.isCurrentVersion === nextProps.isCurrentVersion &&
		!(prevProps.status === "streaming" && nextProps.status === "streaming") &&
		prevProps.content === nextProps.content &&
		prevProps.saveContent === nextProps.saveContent
	);
}

export const SpreadsheetEditor = memo(PureSpreadsheetEditor, areEqual);
