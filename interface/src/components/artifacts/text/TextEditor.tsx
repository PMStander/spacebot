import { exampleSetup } from "prosemirror-example-setup";
import { textblockTypeInputRule, inputRules } from "prosemirror-inputrules";
import { defaultMarkdownSerializer } from "prosemirror-markdown";
import { DOMParser, Schema, type Node } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { EditorState, type Transaction } from "prosemirror-state";
import { DecorationSet, EditorView } from "prosemirror-view";
import { memo, useEffect, useRef } from "react";

import {
	type Suggestion,
	suggestionsPlugin,
	suggestionsPluginKey,
	projectWithPositions,
	createDecorations,
} from "./suggestions";

// --- Schema ---

const documentSchema = new Schema({
  nodes: addListNodes(basicSchema.spec.nodes, "paragraph block*", "block"),
  marks: basicSchema.spec.marks,
});

function headingRule(level: number) {
  return textblockTypeInputRule(
    new RegExp(`^(#{1,${level}})\\s$`),
    documentSchema.nodes.heading,
    () => ({ level }),
  );
}

// --- Document helpers ---

function buildDocumentFromContent(content: string): Node {
  const parser = DOMParser.fromSchema(documentSchema);
  const tempContainer = document.createElement("div");
  // Convert markdown-style content to simple HTML paragraphs
  tempContainer.innerHTML = content
    .split("\n")
    .map((line) => {
      if (!line.trim()) return "<p><br></p>";
      // Headings
      const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        return `<h${level}>${headingMatch[2]}</h${level}>`;
      }
      return `<p>${line}</p>`;
    })
    .join("");
  return parser.parse(tempContainer);
}

function buildContentFromDocument(doc: Node): string {
  return defaultMarkdownSerializer.serialize(doc);
}

function replaceEditorContent(view: EditorView, content: string): void {
  const newDocument = buildDocumentFromContent(content);
  const transaction = view.state.tr.replaceWith(
    0,
    view.state.doc.content.size,
    newDocument.content,
  );
  transaction.setMeta("no-save", true);
  view.dispatch(transaction);
}

// --- Transaction handler ---

function handleTransaction({
  transaction,
  editorRef,
  onSaveContent,
}: {
  transaction: Transaction;
  editorRef: React.MutableRefObject<EditorView | null>;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
}) {
  if (!editorRef.current) return;

  const newState = editorRef.current.state.apply(transaction);
  editorRef.current.updateState(newState);

  if (transaction.docChanged && !transaction.getMeta("no-save")) {
    const updatedContent = buildContentFromDocument(newState.doc);
    if (transaction.getMeta("no-debounce")) {
      onSaveContent(updatedContent, false);
    } else {
      onSaveContent(updatedContent, true);
    }
  }
}

// --- Editor component ---

type EditorProps = {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  status: "streaming" | "idle";
  isCurrentVersion: boolean;
  suggestions: Suggestion[];
};

function PureEditor({ content, onSaveContent, status, suggestions }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (containerRef.current && !editorRef.current) {
      const state = EditorState.create({
        doc: buildDocumentFromContent(content),
        plugins: [
          ...exampleSetup({ schema: documentSchema, menuBar: false }),
          inputRules({
            rules: [
              headingRule(1),
              headingRule(2),
              headingRule(3),
              headingRule(4),
              headingRule(5),
              headingRule(6),
            ],
          }),
          suggestionsPlugin,
        ],
      });

      editorRef.current = new EditorView(containerRef.current, { state });
    }

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
    // Only run on initial mount per content identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setProps({
        dispatchTransaction: (transaction) => {
          handleTransaction({ transaction, editorRef, onSaveContent });
        },
      });
    }
  }, [onSaveContent]);

  useEffect(() => {
    if (editorRef.current && content) {
      const currentContent = buildContentFromDocument(
        editorRef.current.state.doc,
      );

      if (status === "streaming") {
        replaceEditorContent(editorRef.current, content);
        return;
      }

      if (currentContent !== content) {
        replaceEditorContent(editorRef.current, content);
      }
    }
  }, [content, status]);

  // Project suggestions onto the current document and apply as decorations.
  // Re-runs whenever suggestions or document content changes.
  useEffect(() => {
    if (!editorRef.current) return;
    const view = editorRef.current;

    let decorations: DecorationSet;
    if (suggestions.length === 0) {
      decorations = DecorationSet.empty;
    } else {
      const projected = projectWithPositions(view.state.doc, suggestions);
      decorations = createDecorations(projected, view);
    }

    const tr = view.state.tr;
    tr.setMeta(suggestionsPluginKey, { decorations });
    view.dispatch(tr);
  }, [suggestions, content]);

  return (
    <div className="prose dark:prose-invert relative" ref={containerRef} />
  );
}

function areEqual(prevProps: EditorProps, nextProps: EditorProps) {
  return (
    prevProps.suggestions === nextProps.suggestions &&
    prevProps.isCurrentVersion === nextProps.isCurrentVersion &&
    !(prevProps.status === "streaming" && nextProps.status === "streaming") &&
    prevProps.content === nextProps.content &&
    prevProps.onSaveContent === nextProps.onSaveContent
  );
}

export const TextEditor = memo(PureEditor, areEqual);
