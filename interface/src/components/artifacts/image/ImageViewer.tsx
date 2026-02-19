import type { ArtifactContentProps } from "@/components/create-artifact";

export function ImageViewer({ content, title, status }: ArtifactContentProps) {
	const src = content.startsWith("data:")
		? content
		: `data:image/png;base64,${content}`;

	if (status === "streaming") {
		return (
			<div className="flex h-full items-center justify-center p-4">
				<div>Generating image...</div>
			</div>
		);
	}

	return (
		<div className="flex h-full items-center justify-center p-4">
			<img
				src={src}
				alt={title ?? "Generated image"}
				className="max-h-full max-w-full rounded-lg object-contain"
			/>
		</div>
	);
}
