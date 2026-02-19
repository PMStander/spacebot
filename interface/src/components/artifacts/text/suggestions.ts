import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

import { SuggestionCard } from "./SuggestionCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Suggestion {
	id: string;
	originalText: string;
	suggestedText: string;
	description: string;
}

export interface UISuggestion extends Suggestion {
	selectionStart: number;
	selectionEnd: number;
}

// ---------------------------------------------------------------------------
// ProseMirror plugin
// ---------------------------------------------------------------------------

interface SuggestionsPluginState {
	decorations: DecorationSet;
}

export const suggestionsPluginKey = new PluginKey<SuggestionsPluginState>("suggestions");

export const suggestionsPlugin = new Plugin<SuggestionsPluginState>({
	key: suggestionsPluginKey,
	state: {
		init(): SuggestionsPluginState {
			return { decorations: DecorationSet.empty };
		},
		apply(tr, state): SuggestionsPluginState {
			const meta = tr.getMeta(suggestionsPluginKey) as SuggestionsPluginState | undefined;
			if (meta) return meta;
			return { decorations: state.decorations.map(tr.mapping, tr.doc) };
		},
	},
	props: {
		decorations(state) {
			return this.getState(state)?.decorations ?? DecorationSet.empty;
		},
	},
});

// ---------------------------------------------------------------------------
// Position projection — find each suggestion's originalText in the doc
// ---------------------------------------------------------------------------

function findPositionsInDoc(
	doc: Node,
	searchText: string,
): { start: number; end: number } | null {
	if (!searchText) return null;
	let result: { start: number; end: number } | null = null;

	doc.nodesBetween(0, doc.content.size, (node, pos) => {
		if (result) return false;
		if (node.isText && node.text) {
			const index = node.text.indexOf(searchText);
			if (index !== -1) {
				result = {
					start: pos + index,
					end: pos + index + searchText.length,
				};
				return false;
			}
		}
		return true;
	});

	return result;
}

export function projectWithPositions(
	doc: Node,
	suggestions: Suggestion[],
): UISuggestion[] {
	return suggestions
		.map((suggestion) => {
			const positions = findPositionsInDoc(doc, suggestion.originalText);
			if (!positions) return null;
			return {
				...suggestion,
				selectionStart: positions.start,
				selectionEnd: positions.end,
			};
		})
		.filter((s): s is UISuggestion => s !== null);
}

// ---------------------------------------------------------------------------
// Widget factory — creates a DOM element with a mounted React root
// ---------------------------------------------------------------------------

function createSuggestionWidget(
	suggestion: UISuggestion,
	view: EditorView,
): HTMLElement {
	const dom = document.createElement("span");
	const root = createRoot(dom);

	// Prevent the widget click from blurring the editor
	dom.addEventListener("mousedown", (event) => {
		event.preventDefault();
		view.dom.blur();
	});

	const onApply = () => {
		const { state, dispatch } = view;

		const tr = state.tr;

		// Replace text
		tr.replaceWith(
			suggestion.selectionStart,
			suggestion.selectionEnd,
			state.schema.text(suggestion.suggestedText),
		);
		tr.setMeta("no-debounce", true);

		// Remove decoration in the same atomic transaction
		const pluginState = suggestionsPluginKey.getState(state);
		if (pluginState) {
			const newDecorations = DecorationSet.create(
				state.doc,
				pluginState.decorations
					.find()
					.filter((d) => d.spec.suggestionId !== suggestion.id),
			);
			tr.setMeta(suggestionsPluginKey, { decorations: newDecorations });
		}

		dispatch(tr);
	};

	root.render(createElement(SuggestionCard, { suggestion, onApply }));

	// Store cleanup so ProseMirror can unmount the React root when the
	// decoration is removed.
	(dom as HTMLElement & { _unmount?: () => void })._unmount = () =>
		setTimeout(() => root.unmount(), 0);

	return dom;
}

// ---------------------------------------------------------------------------
// Decoration creation — inline highlight + widget per suggestion
// ---------------------------------------------------------------------------

export function createDecorations(
	suggestions: UISuggestion[],
	view: EditorView,
): DecorationSet {
	const decorations: Decoration[] = [];

	for (const suggestion of suggestions) {
		decorations.push(
			Decoration.inline(
				suggestion.selectionStart,
				suggestion.selectionEnd,
				{ class: "bg-blue-500/20 hover:bg-blue-500/30 dark:bg-blue-500/30 dark:hover:bg-blue-500/40 rounded-sm cursor-default" },
				{ suggestionId: suggestion.id },
			),
		);
		decorations.push(
			Decoration.widget(
				suggestion.selectionStart,
				(currentView) => createSuggestionWidget(suggestion, currentView),
				{
					key: `widget-${suggestion.id}`,
					suggestionId: suggestion.id,
					destroy: (node: globalThis.Node) => {
						(node as HTMLElement & { _unmount?: () => void })._unmount?.();
					},
				},
			),
		);
	}

	return DecorationSet.create(view.state.doc, decorations);
}
