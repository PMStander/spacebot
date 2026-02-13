const API_BASE = "/api";

export interface StatusResponse {
	status: string;
	pid: number;
	uptime_seconds: number;
}

export async function fetchStatus(): Promise<StatusResponse> {
	const response = await fetch(`${API_BASE}/status`);
	if (!response.ok) {
		throw new Error(`API error: ${response.status}`);
	}
	return response.json();
}
