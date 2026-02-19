import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Message01Icon } from "@hugeicons/core-free-icons";
import type { UISuggestion } from "./suggestions";

interface SuggestionCardProps {
	suggestion: UISuggestion;
	onApply: () => void;
}

export function SuggestionCard({ suggestion, onApply }: SuggestionCardProps) {
	const [isExpanded, setIsExpanded] = useState(false);

	return (
		<AnimatePresence>
			{isExpanded ? (
				<motion.div
					key={suggestion.id}
					initial={{ opacity: 0, y: -10 }}
					animate={{ opacity: 1, y: -20 }}
					exit={{ opacity: 0, y: -10 }}
					transition={{ type: "spring", stiffness: 500, damping: 30 }}
					className="absolute -right-12 z-50 flex w-56 flex-col gap-3 rounded-2xl border border-app-line bg-app-dark p-3 font-sans text-sm shadow-xl md:-right-16"
				>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<div className="size-4 rounded-full bg-ink-faint/25" />
							<span className="font-medium text-ink">Assistant</span>
						</div>
						<button
							type="button"
							className="cursor-pointer text-ink-faint/50 hover:text-ink-faint"
							onClick={() => setIsExpanded(false)}
						>
							<HugeiconsIcon icon={Cancel01Icon} className="size-3" />
						</button>
					</div>

					<p className="text-ink-dull leading-relaxed">{suggestion.description}</p>

					<button
						type="button"
						onClick={onApply}
						className="w-fit rounded-full border border-app-line px-3 py-1.5 text-xs text-ink hover:bg-app-line/50 transition-colors"
					>
						Apply
					</button>
				</motion.div>
			) : (
				<motion.button
					type="button"
					className="absolute -right-8 cursor-pointer p-1 text-ink-faint/60 hover:text-ink-faint"
					onClick={() => setIsExpanded(true)}
					whileHover={{ scale: 1.1 }}
				>
					<HugeiconsIcon icon={Message01Icon} className="size-3.5" />
				</motion.button>
			)}
		</AnimatePresence>
	);
}
