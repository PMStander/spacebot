import { useRef, useState, type ChangeEvent } from "react";
import { api } from "@/api/client";
import { Button } from "@/ui";
import type { BookPanel, GenerationMode, ScenePlan, SceneReference } from "./types";

interface SceneInspectorProps {
	selectedPanel: BookPanel | null;
	mode?: GenerationMode;
	isCurrentVersion: boolean;
	agentId?: string;
	canRerender: boolean;
	onUpdateScene: (patch: Partial<ScenePlan>) => void;
	onClearScene: () => void;
	onToggleApproved: () => void;
	onRerenderPanel: () => void;
}

export function SceneInspector({
	selectedPanel,
	mode,
	isCurrentVersion,
	agentId,
	canRerender,
	onUpdateScene,
	onClearScene,
	onToggleApproved,
	onRerenderPanel,
}: SceneInspectorProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [isDragOver, setIsDragOver] = useState(false);

	if (!selectedPanel) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
				<p className="text-tiny text-ink-faint">
					Select a panel to edit its scene plan and references.
				</p>
			</div>
		);
	}

	const scene: ScenePlan = selectedPanel.scene ?? {};
	const references = scene.references ?? [];

	const updateReferences = (next: SceneReference[]) =>
		onUpdateScene({ references: next.length > 0 ? next : undefined });

	const uploadFilesAsReferences = async (files: File[]) => {
		if (files.length === 0) return;
		if (!agentId) {
			setUploadError("Agent id is not available for uploads.");
			return;
		}

		setUploadError(null);
		setIsUploading(true);
		try {
			const response = await api.cortexChatUpload(agentId, files);
			const uploadedReferences: SceneReference[] = response.attachments.map((attachment) => ({
				kind: "image",
				path: attachment.path,
				note: attachment.filename,
			}));
			updateReferences([...references, ...uploadedReferences]);
		} catch (error) {
			setUploadError(error instanceof Error ? error.message : "Upload failed");
		} finally {
			setIsUploading(false);
			setIsDragOver(false);
		}
	};

	const handleFileInput = async (event: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? []);
		event.target.value = "";
		await uploadFilesAsReferences(files);
	};

	return (
		<div className="flex h-full flex-col gap-3 overflow-auto p-3">
			<div className="flex items-center justify-between gap-2">
				<div className="text-tiny font-medium uppercase tracking-wider text-ink-faint">
					Scene • Panel {selectedPanel.index + 1}
				</div>
				<div className="flex items-center gap-1">
					<Button
						size="sm"
						variant="ghost"
						className={`h-6 px-2 text-tiny ${
							scene.approved
								? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
								: ""
						}`}
						disabled={!isCurrentVersion}
						onClick={onToggleApproved}
					>
						{scene.approved ? "Approved" : "Approve"}
					</Button>
						<Button
							size="sm"
							variant="ghost"
							className="h-6 px-2 text-tiny"
							disabled={!isCurrentVersion || !canRerender}
							onClick={onRerenderPanel}
						>
							Re-render
					</Button>
				</div>
			</div>
			{mode && (
				<p className="text-tiny text-ink-faint">
					Mode: <span className="text-ink">{mode}</span>
				</p>
			)}

			<div className="flex flex-col gap-1.5">
				<label className="text-tiny text-ink-faint">Goal</label>
				<input
					type="text"
					className="rounded border border-app-line/50 bg-app-darkBox px-2 py-1 text-sm text-ink focus:border-accent/50 focus:outline-none"
					value={scene.goal ?? ""}
					onChange={(event) => onUpdateScene({ goal: event.target.value || undefined })}
					placeholder="What must this panel accomplish?"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label className="text-tiny text-ink-faint">Beat</label>
				<input
					type="text"
					className="rounded border border-app-line/50 bg-app-darkBox px-2 py-1 text-sm text-ink focus:border-accent/50 focus:outline-none"
					value={scene.beat ?? ""}
					onChange={(event) => onUpdateScene({ beat: event.target.value || undefined })}
					placeholder="Emotional beat or action."
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label className="text-tiny text-ink-faint">Camera</label>
				<input
					type="text"
					className="rounded border border-app-line/50 bg-app-darkBox px-2 py-1 text-sm text-ink focus:border-accent/50 focus:outline-none"
					value={scene.camera ?? ""}
					onChange={(event) => onUpdateScene({ camera: event.target.value || undefined })}
					placeholder="Wide, close-up, over-shoulder..."
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label className="text-tiny text-ink-faint">Notes</label>
				<textarea
					rows={3}
					className="resize-none rounded border border-app-line/50 bg-app-darkBox p-2 text-sm text-ink focus:border-accent/50 focus:outline-none"
					value={scene.notes ?? ""}
					onChange={(event) => onUpdateScene({ notes: event.target.value || undefined })}
					placeholder="Lighting, mood, composition constraints..."
				/>
			</div>

			<div className="border-t border-app-line/30" />

			<div className="flex items-center justify-between">
				<label className="text-tiny text-ink-faint">References</label>
				<div className="flex items-center gap-1">
					<Button
						size="sm"
						variant="ghost"
						className="h-6 px-2 text-tiny"
						onClick={() =>
							updateReferences([
								...references,
								{ kind: "image", path: "", note: "" },
							])
						}
					>
						Add ref
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="h-6 px-2 text-tiny"
						disabled={!isCurrentVersion || isUploading}
						onClick={() => fileInputRef.current?.click()}
					>
						Upload
					</Button>
				</div>
			</div>
			<input
				ref={fileInputRef}
				type="file"
				multiple
				accept="image/png,image/jpeg,image/webp,image/gif"
				className="hidden"
				onChange={(event) => {
					void handleFileInput(event);
				}}
			/>
			<div
				className={`rounded border border-dashed px-2 py-1.5 text-tiny transition-colors ${
					isDragOver
						? "border-accent/60 bg-accent/10 text-accent"
						: "border-app-line/50 text-ink-faint"
				}`}
				onDragOver={(event) => {
					event.preventDefault();
					event.stopPropagation();
					if (!isCurrentVersion || isUploading) return;
					setIsDragOver(true);
				}}
				onDragLeave={(event) => {
					event.preventDefault();
					event.stopPropagation();
					setIsDragOver(false);
				}}
				onDrop={(event) => {
					event.preventDefault();
					event.stopPropagation();
					if (!isCurrentVersion || isUploading) return;
					const files = Array.from(event.dataTransfer.files ?? []);
					void uploadFilesAsReferences(files);
				}}
			>
				{isUploading
					? "Uploading reference images..."
					: "Drag image files here to append references"}
			</div>
			{uploadError && <p className="text-tiny text-red-400">{uploadError}</p>}

			{references.length === 0 ? (
				<p className="text-tiny text-ink-faint/70">
					Add image/style/character refs the agent should follow.
				</p>
			) : (
				<div className="flex flex-col gap-2">
					{references.map((reference, index) => (
						<div
							key={`${reference.kind}-${index}`}
							className="rounded border border-app-line/30 bg-app-darkBox/50 p-2"
						>
							<div className="mb-1 flex items-center gap-2">
								<select
									className="rounded border border-app-line/50 bg-app-darkBox px-2 py-1 text-tiny text-ink focus:border-accent/50 focus:outline-none"
									value={reference.kind}
									onChange={(event) => {
										const next = [...references];
										next[index] = {
											...reference,
											kind: event.target.value as SceneReference["kind"],
										};
										updateReferences(next);
									}}
								>
									<option value="image">image</option>
									<option value="style">style</option>
									<option value="character">character</option>
								</select>
								<Button
									size="sm"
									variant="ghost"
									className="h-6 px-2 text-tiny text-red-400 hover:bg-red-500/10"
									onClick={() => {
										const next = references.filter((_, i) => i !== index);
										updateReferences(next);
									}}
								>
									Remove
								</Button>
							</div>
							{reference.kind === "image" && reference.path && (
								<div className="mb-1 overflow-hidden rounded border border-app-line/30">
									<img
										src={
											reference.path.startsWith("http://") || reference.path.startsWith("https://") || reference.path.startsWith("data:")
												? reference.path
												: `/api/local-file?path=${encodeURIComponent(reference.path)}`
										}
										alt={reference.note || "Reference"}
										className="h-20 w-full object-cover"
										onError={(e) => {
											(e.target as HTMLImageElement).style.display = "none";
										}}
									/>
								</div>
							)}
							<input
								type="text"
								className="mb-1 w-full rounded border border-app-line/50 bg-app-darkBox px-2 py-1 text-sm text-ink focus:border-accent/50 focus:outline-none"
								value={reference.path}
								onChange={(event) => {
									const next = [...references];
									next[index] = { ...reference, path: event.target.value };
									updateReferences(next);
								}}
								placeholder="/path/to/reference.png"
							/>
							<input
								type="text"
								className="w-full rounded border border-app-line/50 bg-app-darkBox px-2 py-1 text-sm text-ink focus:border-accent/50 focus:outline-none"
								value={reference.note ?? ""}
								onChange={(event) => {
									const next = [...references];
									next[index] = {
										...reference,
										note: event.target.value || undefined,
									};
									updateReferences(next);
								}}
								placeholder="Optional note"
							/>
						</div>
					))}
				</div>
			)}

			<div className="mt-auto pt-2">
				<Button
					variant="ghost"
					size="sm"
					className="w-full text-red-400 hover:bg-red-500/10 hover:text-red-300"
					onClick={onClearScene}
				>
					Clear scene plan
				</Button>
			</div>
		</div>
	);
}
