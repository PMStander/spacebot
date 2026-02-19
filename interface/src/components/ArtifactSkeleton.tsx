export function ArtifactSkeleton() {
	return (
		<div className="flex h-full flex-col gap-3 p-4">
			{[...Array(5)].map((_, i) => (
				<div key={i} className="h-4 animate-pulse rounded bg-app-line/40" style={{ width: `${60 + (i % 3) * 15}%` }} />
			))}
		</div>
	);
}
