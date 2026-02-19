import { createElement } from "react";
import { toast } from "sonner";
import { Artifact, type ArtifactContentProps } from "@/components/create-artifact";
import {
  Clock01Icon,
  UndoIcon,
  RedoIcon,
  Copy01Icon,
  PencilEdit01Icon,
  Message01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DocumentSkeleton } from "./DocumentSkeleton";
import { DiffView } from "./DiffView";
import { TextEditor } from "./TextEditor";

type TextMetadata = {
  suggestions: any[];
};

function TextContent(props: ArtifactContentProps<TextMetadata>) {
  if (props.isLoading) {
    return createElement(DocumentSkeleton);
  }

  if (props.mode === "diff") {
    const oldContent = props.getVersionContentById(props.currentVersionIndex - 1);
    const newContent = props.getVersionContentById(props.currentVersionIndex);
    return createElement(DiffView, { oldContent, newContent });
  }

  return createElement("div", { className: "flex flex-row px-4 py-8 md:p-20" },
    createElement(TextEditor, {
      content: props.content,
      isCurrentVersion: props.isCurrentVersion,
      onSaveContent: props.onSaveContent,
      status: props.status,
    }),
  );
}

export const textArtifact = new Artifact<"text", TextMetadata>({
  kind: "text",
  description: "Useful for text content, like drafting essays and emails.",
  initialize: ({ setMetadata }) => {
    setMetadata({ suggestions: [] });
  },
  onStreamPart: ({ streamPart, setArtifact }) => {
    if (streamPart.type === "artifact_delta") {
      setArtifact((draft) => ({
        ...draft,
        content: draft.content + streamPart.data,
        isVisible:
          draft.status === "streaming" &&
          draft.content.length > 400 &&
          draft.content.length < 450
            ? true
            : draft.isVisible,
        status: "streaming",
      }));
    }
  },
  content: TextContent,
  actions: [
    {
      icon: createElement(HugeiconsIcon, { icon: Clock01Icon, size: 18 }),
      description: "View changes",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("toggle");
      },
      isDisabled: ({ currentVersionIndex }) => currentVersionIndex === 0,
    },
    {
      icon: createElement(HugeiconsIcon, { icon: UndoIcon, size: 18 }),
      description: "View previous version",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("prev");
      },
      isDisabled: ({ currentVersionIndex }) => currentVersionIndex === 0,
    },
    {
      icon: createElement(HugeiconsIcon, { icon: RedoIcon, size: 18 }),
      description: "View next version",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("next");
      },
      isDisabled: ({ isCurrentVersion }) => isCurrentVersion,
    },
    {
      icon: createElement(HugeiconsIcon, { icon: Copy01Icon, size: 18 }),
      description: "Copy to clipboard",
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success("Copied to clipboard!");
      },
    },
  ],
  toolbar: [
    {
      icon: createElement(HugeiconsIcon, { icon: PencilEdit01Icon }),
      description: "Add final polish",
      onClick: ({ sendMessage }) => {
        sendMessage(
          "Please add final polish and check for grammar, add section titles for better structure, and ensure everything reads smoothly.",
        );
      },
    },
    {
      icon: createElement(HugeiconsIcon, { icon: Message01Icon }),
      description: "Request suggestions",
      onClick: ({ sendMessage }) => {
        sendMessage(
          "Please add suggestions you have that could improve the writing.",
        );
      },
    },
  ],
});
