import { useEffect, useRef, useState, useCallback } from "react";

export function MermaidRenderer({
	content,
	onSaveContent,
	status,
}: {
	content: string;
	onSaveContent: (updated: string, debounce: boolean) => void;
	status: "streaming" | "idle";
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [svgContent, setSvgContent] = useState<string>("");
	const [error, setError] = useState<string | null>(null);
	const [showSource, setShowSource] = useState(false);
	const [mermaidLoaded, setMermaidLoaded] = useState(false);
	const renderIdRef = useRef(0);

	// Lazy-load mermaid
	useEffect(() => {
		import("mermaid").then((mod) => {
			mod.default.initialize({
				startOnLoad: false,
				theme: "dark",
				themeVariables: {
					darkMode: true,
					background: "#1a1a2e",
					primaryColor: "#8884d8",
					primaryTextColor: "#e0e0e0",
					lineColor: "#555",
				},
			});
			setMermaidLoaded(true);
		});
	}, []);

	// Render mermaid when content changes
	useEffect(() => {
		if (!mermaidLoaded || !content.trim() || status === "streaming") return;

		const currentId = ++renderIdRef.current;

		import("mermaid").then(async (mod) => {
			if (currentId !== renderIdRef.current) return;
			try {
				const id = `mermaid-${currentId}-${Date.now()}`;
				const { svg } = await mod.default.render(id, content.trim());
				if (currentId === renderIdRef.current) {
					setSvgContent(svg);
					setError(null);
				}
			} catch (e) {
				if (currentId === renderIdRef.current) {
					setError(e instanceof Error ? e.message : "Failed to render diagram");
				}
			}
		});
	}, [content, mermaidLoaded, status]);

	const handleSourceChange = useCallback(
		(newSource: string) => {
			onSaveContent(newSource, true);
		},
		[onSaveContent],
	);

	if (!mermaidLoaded) {
		return (
			<div className="flex h-64 items-center justify-center text-ink-faint text-sm">
				Loading diagram renderer...
			</div>
		);
	}

	if (status === "streaming") {
		return (
			<div className="p-4">
				<pre className="rounded bg-app-darkBox/50 p-3 text-xs text-ink-faint font-mono overflow-auto whitespace-pre-wrap">
					{content}
				</pre>
				<p className="mt-2 text-center text-ink-faint text-xs">
					Generating diagram...
				</p>
			</div>
		);
	}

	return (
		<div className="p-4">
			<div className="mb-2 flex justify-end">
				<button
					type="button"
					onClick={() => setShowSource(!showSource)}
					className="rounded px-2 py-1 text-[11px] text-ink-faint hover:bg-app-line/50 hover:text-ink"
				>
					{showSource ? "Show Preview" : "Show Source"}
				</button>
			</div>

			{showSource ? (
				<textarea
					value={content}
					onChange={(e) => handleSourceChange(e.target.value)}
					className="w-full rounded border border-app-line bg-app-darkBox/50 p-3 text-xs text-ink font-mono focus:border-accent focus:outline-none"
					rows={Math.max(10, content.split("\n").length + 2)}
					spellCheck={false}
				/>
			) : (
				<>
					{error ? (
						<div className="space-y-2">
							<p className="text-sm text-red-400">
								Diagram syntax error: {error}
							</p>
							<pre className="rounded bg-app-darkBox/50 p-3 text-xs text-ink-faint font-mono overflow-auto whitespace-pre-wrap">
								{content}
							</pre>
						</div>
					) : (
						<div
							ref={containerRef}
							className="flex justify-center overflow-auto [&_svg]:max-w-full"
							// biome-ignore lint: we trust mermaid's SVG output
							dangerouslySetInnerHTML={{ __html: svgContent }}
						/>
					)}
				</>
			)}
		</div>
	);
}
