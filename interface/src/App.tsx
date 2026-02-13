import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { fetchStatus } from "./api/client";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: 1,
			refetchOnWindowFocus: true,
		},
	},
});

function StatusDisplay() {
	const { data, isLoading, error } = useQuery({
		queryKey: ["status"],
		queryFn: fetchStatus,
		refetchInterval: 5000,
	});

	if (isLoading) {
		return (
			<div className="flex items-center gap-2 text-ink-dull">
				<div className="h-2 w-2 animate-pulse rounded-full bg-accent" />
				Connecting...
			</div>
		);
	}

	if (error) {
		return (
			<div className="text-red-400">
				Failed to connect to daemon: {error.message}
			</div>
		);
	}

	if (!data) return null;

	const hours = Math.floor(data.uptime_seconds / 3600);
	const minutes = Math.floor((data.uptime_seconds % 3600) / 60);
	const seconds = data.uptime_seconds % 60;

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<div className="h-2 w-2 rounded-full bg-green-500" />
				<span className="text-ink font-medium">Daemon Running</span>
			</div>
			<div className="grid grid-cols-2 gap-4">
				<div className="rounded-lg border border-app-line bg-app-box p-4">
					<div className="text-tiny uppercase tracking-wider text-ink-faint">PID</div>
					<div className="mt-1 font-plex text-lg text-ink">{data.pid}</div>
				</div>
				<div className="rounded-lg border border-app-line bg-app-box p-4">
					<div className="text-tiny uppercase tracking-wider text-ink-faint">Uptime</div>
					<div className="mt-1 font-plex text-lg text-ink">
						{hours}h {minutes}m {seconds}s
					</div>
				</div>
			</div>
		</div>
	);
}

export function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<div className="flex min-h-screen items-center justify-center bg-app p-8">
				<div className="w-full max-w-md space-y-6">
					<div>
						<h1 className="font-plex text-2xl font-semibold text-ink">Spacebot</h1>
						<p className="text-sm text-ink-dull">Control Interface</p>
					</div>
					<div className="rounded-xl border border-app-line bg-app-darkBox p-6">
						<StatusDisplay />
					</div>
				</div>
			</div>
		</QueryClientProvider>
	);
}
