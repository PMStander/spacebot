import { useMemo } from "react";
import {
	BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
	CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface ChartData {
	type: "bar" | "line" | "area" | "pie";
	title?: string;
	xKey: string;
	series: { dataKey: string; name: string; color: string }[];
	data: Record<string, unknown>[];
}

const FALLBACK_COLORS = [
	"#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#0088fe",
	"#00c49f", "#ffbb28", "#ff8042", "#a4de6c", "#d0ed57",
];

export function ChartRenderer({
	content,
	status,
}: { content: string; status: "streaming" | "idle" }) {
	const parsed = useMemo<ChartData | null>(() => {
		try {
			return JSON.parse(content);
		} catch {
			return null;
		}
	}, [content]);

	if (!parsed) {
		if (status === "streaming") {
			return (
				<div className="flex h-64 items-center justify-center text-ink-faint text-sm">
					Generating chart data...
				</div>
			);
		}
		return (
			<div className="flex h-64 items-center justify-center text-red-400 text-sm">
				Invalid chart data
			</div>
		);
	}

	const { type, title, xKey, series, data } = parsed;

	const chartContent = (() => {
		switch (type) {
			case "pie":
				return (
					<PieChart>
						<Pie
							data={data}
							dataKey={series[0]?.dataKey ?? "value"}
							nameKey={xKey}
							cx="50%"
							cy="50%"
							outerRadius={120}
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
					label={((props: any) =>
								`${props.name}: ${(props.percent * 100).toFixed(0)}%`
							) as any}
						>
							{data.map((_, i) => (
								<Cell
									key={`cell-${i}`}
									fill={series[0]?.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
								/>
							))}
						</Pie>
						<Tooltip />
						<Legend />
					</PieChart>
				);
			case "line":
				return (
					<LineChart data={data}>
						<CartesianGrid strokeDasharray="3 3" stroke="#333" />
						<XAxis dataKey={xKey} stroke="#888" fontSize={12} />
						<YAxis stroke="#888" fontSize={12} />
						<Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333" }} />
						<Legend />
						{series.map((s, i) => (
							<Line
								key={s.dataKey}
								type="monotone"
								dataKey={s.dataKey}
								name={s.name}
								stroke={s.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
								strokeWidth={2}
								dot={{ r: 3 }}
							/>
						))}
					</LineChart>
				);
			case "area":
				return (
					<AreaChart data={data}>
						<CartesianGrid strokeDasharray="3 3" stroke="#333" />
						<XAxis dataKey={xKey} stroke="#888" fontSize={12} />
						<YAxis stroke="#888" fontSize={12} />
						<Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333" }} />
						<Legend />
						{series.map((s, i) => (
							<Area
								key={s.dataKey}
								type="monotone"
								dataKey={s.dataKey}
								name={s.name}
								stroke={s.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
								fill={s.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
								fillOpacity={0.3}
							/>
						))}
					</AreaChart>
				);
			default: // bar
				return (
					<BarChart data={data}>
						<CartesianGrid strokeDasharray="3 3" stroke="#333" />
						<XAxis dataKey={xKey} stroke="#888" fontSize={12} />
						<YAxis stroke="#888" fontSize={12} />
						<Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333" }} />
						<Legend />
						{series.map((s, i) => (
							<Bar
								key={s.dataKey}
								dataKey={s.dataKey}
								name={s.name}
								fill={s.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
								radius={[4, 4, 0, 0]}
							/>
						))}
					</BarChart>
				);
		}
	})();

	return (
		<div className="p-4">
			{title && (
				<h3 className="mb-4 text-center text-sm font-medium text-ink">
					{title}
				</h3>
			)}
			<ResponsiveContainer width="100%" height={350}>
				{chartContent}
			</ResponsiveContainer>
		</div>
	);
}
