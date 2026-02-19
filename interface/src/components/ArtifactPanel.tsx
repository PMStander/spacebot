import { Button } from "@/ui";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

interface ArtifactPanelProps {
	agentId: string;
	onClose: () => void;
	children: React.ReactNode;
	title?: string;
	actions?: React.ReactNode;
	toolbar?: React.ReactNode;
}

export function ArtifactPanel({ onClose, children, title, actions, toolbar }: ArtifactPanelProps) {
	return (
		<div className="flex h-full w-full flex-col bg-app-dark">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-app-line/50 px-4 py-3">
				<span className="truncate text-sm font-medium text-ink">{title ?? "Artifact"}</span>
				<div className="flex items-center gap-2">
					{actions}
					<Button variant="ghost" size="icon" className="h-7 w-7 text-ink-faint" onClick={onClose}>
						<HugeiconsIcon icon={Cancel01Icon} className="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>
			{/* Toolbar */}
			{toolbar && (
				<div className="flex items-center gap-1 border-b border-app-line/50 px-3 py-1.5">
					{toolbar}
				</div>
			)}
			{/* Content */}
			<div className="min-h-0 flex-1 overflow-auto">
				{children}
			</div>
		</div>
	);
}
