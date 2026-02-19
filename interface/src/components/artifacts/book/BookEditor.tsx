import { useMemo, useCallback } from "react";
import type { ArtifactContentProps } from "@/components/create-artifact";
import { normalizeFromComicJson, serializeToComicJson } from "./types";
import type { BookDocument, BookMetadata } from "./types";
import { PageGrid } from "./PageGrid";
import { PageEditor } from "./PageEditor";

export function BookEditor({
	content,
	status,
	metadata,
	setMetadata,
	onSaveContent,
	isCurrentVersion,
}: ArtifactContentProps<BookMetadata>) {
	const doc: BookDocument | null = useMemo(() => {
		if (!content) return null;
		try {
			return normalizeFromComicJson(JSON.parse(content));
		} catch {
			return null;
		}
	}, [content]);

	const saveDoc = useCallback(
		(updated: BookDocument) => {
			onSaveContent(serializeToComicJson(updated), false);
		},
		[onSaveContent],
	);

	if (status === "streaming" || !doc) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="flex flex-col items-center gap-3 text-center">
					{status === "streaming" ? (
						<>
							<div className="h-5 w-5 animate-spin rounded-full border-2 border-app-line border-t-accent" />
							<p className="text-sm text-ink-faint">Generating book…</p>
						</>
					) : (
						<p className="text-sm text-ink-faint">No content yet.</p>
					)}
				</div>
			</div>
		);
	}

	if (metadata.view === "grid") {
		return (
			<PageGrid
				doc={doc}
				metadata={metadata}
				setMetadata={setMetadata}
				onSaveDoc={saveDoc}
				isCurrentVersion={isCurrentVersion}
			/>
		);
	}

	return (
		<PageEditor
			doc={doc}
			metadata={metadata}
			setMetadata={setMetadata}
			onSaveDoc={saveDoc}
			isCurrentVersion={isCurrentVersion}
		/>
	);
}
