import { useMemo, useState, useCallback } from "react";

interface FormField {
	id: string;
	type: "text" | "textarea" | "select" | "checkbox" | "number" | "date";
	label: string;
	placeholder?: string;
	options?: string[];
	required?: boolean;
	value?: unknown;
}

interface FormData {
	title?: string;
	fields: FormField[];
	values: Record<string, unknown>;
}

export function FormRenderer({
	content,
	onSaveContent,
	sendMessage,
	status,
}: {
	content: string;
	onSaveContent: (updated: string, debounce: boolean) => void;
	sendMessage?: (text: string) => void;
	status: "streaming" | "idle";
}) {
	const parsed = useMemo<FormData | null>(() => {
		try {
			return JSON.parse(content);
		} catch {
			return null;
		}
	}, [content]);

	const [values, setValues] = useState<Record<string, unknown>>(() => {
		try {
			const p = JSON.parse(content);
			return p.values ?? {};
		} catch {
			return {};
		}
	});

	const [errors, setErrors] = useState<Record<string, string>>({});

	const handleChange = useCallback((fieldId: string, value: unknown) => {
		setValues((prev) => ({ ...prev, [fieldId]: value }));
		setErrors((prev) => {
			const next = { ...prev };
			delete next[fieldId];
			return next;
		});
	}, []);

	const handleSubmit = useCallback(() => {
		if (!parsed) return;

		// Validate required fields
		const newErrors: Record<string, string> = {};
		for (const field of parsed.fields) {
			if (field.required) {
				const val = values[field.id];
				if (val === undefined || val === null || val === "") {
					newErrors[field.id] = "Required";
				}
			}
		}

		if (Object.keys(newErrors).length > 0) {
			setErrors(newErrors);
			return;
		}

		// Save values to content
		const updated = { ...parsed, values };
		onSaveContent(JSON.stringify(updated, null, 2), false);

		// Send to cortex chat
		if (sendMessage) {
			sendMessage(`Form submitted with values: ${JSON.stringify(values, null, 2)}`);
		}
	}, [parsed, values, onSaveContent, sendMessage]);

	if (!parsed) {
		if (status === "streaming") {
			return (
				<div className="flex h-64 items-center justify-center text-ink-faint text-sm">
					Generating form...
				</div>
			);
		}
		return (
			<div className="flex h-64 items-center justify-center text-red-400 text-sm">
				Invalid form data
			</div>
		);
	}

	return (
		<div className="p-4 space-y-4 max-w-xl">
			{parsed.title && (
				<h3 className="text-sm font-medium text-ink">{parsed.title}</h3>
			)}
			{parsed.fields.map((field) => (
				<div key={field.id} className="space-y-1">
					<label
						htmlFor={`form-${field.id}`}
						className="block text-xs font-medium text-ink-dull"
					>
						{field.label}
						{field.required && <span className="text-red-400 ml-0.5">*</span>}
					</label>
					{renderField(field, values[field.id], (val) => handleChange(field.id, val), status === "streaming")}
					{errors[field.id] && (
						<p className="text-[11px] text-red-400">{errors[field.id]}</p>
					)}
				</div>
			))}
			<button
				type="button"
				onClick={handleSubmit}
				disabled={status === "streaming"}
				className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
			>
				Submit
			</button>
		</div>
	);
}

function renderField(
	field: FormField,
	value: unknown,
	onChange: (val: unknown) => void,
	disabled: boolean,
) {
	const inputClass =
		"w-full rounded border border-app-line bg-transparent px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none disabled:opacity-50";

	switch (field.type) {
		case "textarea":
			return (
				<textarea
					id={`form-${field.id}`}
					value={String(value ?? "")}
					placeholder={field.placeholder}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					rows={3}
					className={inputClass}
				/>
			);
		case "select":
			return (
				<select
					id={`form-${field.id}`}
					value={String(value ?? "")}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					className={inputClass}
				>
					<option value="">Select...</option>
					{field.options?.map((opt) => (
						<option key={opt} value={opt}>
							{opt}
						</option>
					))}
				</select>
			);
		case "checkbox":
			return (
				<div className="flex items-center gap-2">
					<input
						id={`form-${field.id}`}
						type="checkbox"
						checked={Boolean(value)}
						onChange={(e) => onChange(e.target.checked)}
						disabled={disabled}
						className="h-4 w-4 rounded border-app-line accent-accent"
					/>
				</div>
			);
		case "number":
			return (
				<input
					id={`form-${field.id}`}
					type="number"
					value={value !== undefined && value !== null ? String(value) : ""}
					placeholder={field.placeholder}
					onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
					disabled={disabled}
					className={inputClass}
				/>
			);
		case "date":
			return (
				<input
					id={`form-${field.id}`}
					type="date"
					value={String(value ?? "")}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					className={inputClass}
				/>
			);
		default: // text
			return (
				<input
					id={`form-${field.id}`}
					type="text"
					value={String(value ?? "")}
					placeholder={field.placeholder}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					className={inputClass}
				/>
			);
	}
}
