import { createElement, useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { Artifact, type ArtifactContentProps } from "@/components/create-artifact";
import {
  Copy01Icon,
  Download01Icon,
  Globe02Icon,
  CodeIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type HTMLMetadata = {
  height?: number;
};

const BRIDGE_SCRIPT = `<script>(function(){window.spacebot={save:function(d){parent.postMessage({type:"spacebot:save",content:typeof d==="string"?d:JSON.stringify(d)},"*")},sendMessage:function(t){parent.postMessage({type:"spacebot:action",payload:t},"*")}}})()</script>`;

function HTMLContent(props: ArtifactContentProps<HTMLMetadata>) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [props.content]);

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  // PostMessage bridge: listen for messages from the sandboxed iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const { type, content, payload } = event.data ?? {};
      if (type === "spacebot:save" && typeof content === "string") {
        props.onSaveContent(content, false);
      }
      if (type === "spacebot:action" && typeof payload === "string" && props.sendMessage) {
        props.sendMessage(payload);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [props.onSaveContent, props.sendMessage]);

  if (props.isLoading) {
    return createElement(
      "div",
      { 
        className: "flex items-center justify-center h-96 bg-gray-50 dark:bg-gray-900 rounded-lg",
      },
      createElement(
        "div",
        { className: "text-center" },
        createElement(
          "div",
          { 
            className: "animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100 mx-auto mb-4"
          }
        ),
        createElement(
          "p",
          { className: "text-sm text-gray-600 dark:text-gray-400" },
          "Loading HTML preview..."
        )
      )
    );
  }

  return createElement(
    "div",
    { className: "relative w-full" },
    createElement("iframe", {
      ref: iframeRef,
      srcDoc: BRIDGE_SCRIPT + props.content,
      className: "w-full border-0 rounded-lg bg-white dark:bg-gray-950",
      style: {
        height: props.metadata?.height || 600,
        minHeight: 400,
      },
      sandbox: "allow-scripts allow-forms",
      onLoad: handleIframeLoad,
      onError: handleIframeError,
      title: "HTML Preview",
    }),
    isLoading && createElement(
      "div",
      {
        className: "absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-950/80 rounded-lg",
      },
      createElement(
        "div",
        { 
          className: "animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"
        }
      )
    ),
    hasError && createElement(
      "div",
      {
        className: "absolute inset-0 flex items-center justify-center bg-red-50 dark:bg-red-900/20 rounded-lg",
      },
      createElement(
        "p",
        { className: "text-red-600 dark:text-red-400 text-sm" },
        "Failed to load HTML content"
      )
    )
  );
}

export const htmlArtifact = new Artifact<"html", HTMLMetadata>({
  kind: "html",
  description: "Useful for self-contained HTML pages with CSS and JavaScript.",
  initialize: ({ setMetadata }) => {
    setMetadata({ height: 600 });
  },
  onStreamPart: ({ streamPart, setArtifact }) => {
    if (streamPart.type === "artifact_delta") {
      setArtifact((draft) => ({
        ...draft,
        content: draft.content + streamPart.data,
        isVisible:
          draft.status === "streaming" &&
          draft.content.length > 300 &&
          draft.content.length < 350
            ? true
            : draft.isVisible,
        status: "streaming",
      }));
    }
  },
  content: HTMLContent,
  actions: [
    {
      icon: createElement(HugeiconsIcon, { icon: Copy01Icon, size: 18 }),
      description: "Copy HTML to clipboard",
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success("HTML copied to clipboard!");
      },
    },
    {
      icon: createElement(HugeiconsIcon, { icon: Download01Icon, size: 18 }),
      description: "Download as .html file",
      onClick: ({ content }) => {
        const blob = new Blob([content], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "artifact.html";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Downloaded as HTML file!");
      },
    },
    {
      icon: createElement(HugeiconsIcon, { icon: RefreshIcon, size: 18 }),
      description: "Refresh preview",
      onClick: () => {
        window.location.reload();
      },
    },
  ],
  toolbar: [
    {
      icon: createElement(HugeiconsIcon, { icon: Globe02Icon }),
      description: "Add responsive design",
      onClick: ({ sendMessage }) => {
        sendMessage(
          "Please make this HTML page more responsive by adding viewport meta tag and media queries for mobile devices.",
        );
      },
    },
    {
      icon: createElement(HugeiconsIcon, { icon: CodeIcon }),
      description: "Add interactive elements",
      onClick: ({ sendMessage }) => {
        sendMessage(
          "Please add interactive elements to this HTML page using JavaScript, such as animations, hover effects, or user interactions.",
        );
      },
    },
  ],
});
