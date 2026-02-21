import { useState } from "react";
import type { ArtifactInfo } from "@/api/client";
import { panelImageUrl } from "@/components/artifacts/book/utils";

interface ArtifactLibraryCardProps {
	artifact: ArtifactInfo;
	onClick: () => void;
}

const kindBadgeClass: Record<string, string> = {
	book: "bg-violet-500/15 text-violet-300",
	code: "bg-emerald-500/15 text-emerald-300",
	image: "bg-blue-500/15 text-blue-300",
	text: "bg-amber-500/15 text-amber-300",
};

function badgeClass(kind: string): string {
	return kindBadgeClass[kind] ?? "bg-app-line/30 text-ink-dull";
}

function relativeTime(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function BookPreview({ artifact }: { artifact: ArtifactInfo }) {
	const [imgError, setImgError] = useState(false);

	try {
		const doc = JSON.parse(artifact.content) as {
			outputDir?: string;
			pages?: Array<{
				number: number;
				panels: Array<{ index: number; image: string }>;
			}>;
		};

		const firstPanel = doc.pages?.[0]?.panels?.[0];
		const outputDir = doc.outputDir;

		if (firstPanel && outputDir && !imgError) {
			const url = panelImageUrl(
				outputDir,
				doc.pages![0].number,
				firstPanel.image,
				firstPanel.index,
			);
			return (
				<img
					src={url}
					alt="Book thumbnail"
					className="absolute inset-0 h-full w-full object-cover"
					onError={() => setImgError(true)}
				/>
			);
		}

		const pageCount = doc.pages?.length ?? 0;
		return (
			<span className="text-sm text-ink-faint">
				{pageCount} {pageCount === 1 ? "page" : "pages"}
			</span>
		);
	} catch {
		return <span className="text-sm text-ink-faint">book</span>;
	}
}

function CodePreview({ content }: { content: string }) {
	const lines = content.split("\n").slice(0, 3).join("\n");
	return (
		<pre className="text-tiny text-ink-faint bg-app-darkBox p-2 overflow-hidden h-full w-full text-left">
			{lines}
		</pre>
	);
}

function TextPreview({ content }: { content: string }) {
	return (
		<p className="text-tiny text-ink-faint p-2 overflow-hidden h-full w-full text-left">
			{content.slice(0, 100)}
		</p>
	);
}

function Preview({ artifact }: { artifact: ArtifactInfo }) {
	switch (artifact.kind) {
		case "book":
			return <BookPreview artifact={artifact} />;
		case "code":
			return <CodePreview content={artifact.content} />;
		case "text":
		case "html":
			return <TextPreview content={artifact.content} />;
		default:
			return <span className="text-sm text-ink-faint">{artifact.kind}</span>;
	}
}

export function ArtifactLibraryCard({
	artifact,
	onClick,
}: ArtifactLibraryCardProps) {
	return (
		<div
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") onClick();
			}}
			className="rounded-xl border border-app-line/50 bg-app-darkBox overflow-hidden cursor-pointer hover:border-app-line transition-all group"
		>
			<div className="relative h-32 flex items-center justify-center overflow-hidden">
				<Preview artifact={artifact} />
			</div>

			<div className="px-3 py-2">
				<p className="text-sm font-medium text-ink line-clamp-1">
					{artifact.title}
				</p>
				<div className="flex items-center gap-1.5 mt-1">
					<span
						className={`rounded-full px-1.5 py-0.5 text-tiny ${badgeClass(artifact.kind)}`}
					>
						{artifact.kind}
					</span>
					<span className="text-tiny text-ink-faint">
						{relativeTime(artifact.updated_at)}
					</span>
					{artifact.version > 1 && (
						<span className="text-tiny text-ink-faint">
							v{artifact.version}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

export function ArtifactLibraryRow({
	artifact,
	onClick,
}: ArtifactLibraryCardProps) {
	return (
		<div
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") onClick();
			}}
			className="flex items-center gap-3 px-3 py-2 rounded-lg border border-app-line/50 bg-app-darkBox cursor-pointer hover:border-app-line transition-all"
		>
			<span
				className={`rounded-full px-1.5 py-0.5 text-tiny shrink-0 ${badgeClass(artifact.kind)}`}
			>
				{artifact.kind}
			</span>
			<span className="text-sm font-medium text-ink truncate flex-1 min-w-0">
				{artifact.title}
			</span>
			{artifact.channel_id && (
				<span className="text-tiny text-ink-faint truncate max-w-[8rem] shrink-0">
					{artifact.channel_id}
				</span>
			)}
			<span className="text-tiny text-ink-faint shrink-0">
				{relativeTime(artifact.updated_at)}
			</span>
			{artifact.version > 1 && (
				<span className="text-tiny text-ink-faint shrink-0">
					v{artifact.version}
				</span>
			)}
		</div>
	);
}
