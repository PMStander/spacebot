import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/ui/utils";
import { Loader } from "@/ui/Loader";
import { Cancel01Icon, ComputerTerminal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/ui/Button";

export type ConsoleOutputContent = {
  type: "text" | "image";
  value: string;
};

export type ConsoleOutput = {
  id: string;
  status: "in_progress" | "loading_packages" | "completed" | "failed";
  contents: ConsoleOutputContent[];
};

type ConsoleProps = {
  consoleOutputs: ConsoleOutput[];
  setConsoleOutputs: Dispatch<SetStateAction<ConsoleOutput[]>>;
};

export function Console({ consoleOutputs, setConsoleOutputs }: ConsoleProps) {
  const [height, setHeight] = useState<number>(300);
  const [isResizing, setIsResizing] = useState(false);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  const minHeight = 100;
  const maxHeight = 800;

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        const newHeight = window.innerHeight - e.clientY;
        if (newHeight >= minHeight && newHeight <= maxHeight) {
          setHeight(newHeight);
        }
      }
    },
    [isResizing],
  );

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return consoleOutputs.length > 0 ? (
    <>
      <div
        aria-label="Resize console"
        aria-orientation="horizontal"
        aria-valuemax={maxHeight}
        aria-valuemin={minHeight}
        aria-valuenow={height}
        className="fixed z-50 h-2 w-full cursor-ns-resize"
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            setHeight((prev) => Math.min(prev + 10, maxHeight));
          } else if (e.key === "ArrowDown") {
            setHeight((prev) => Math.max(prev - 10, minHeight));
          }
        }}
        onMouseDown={startResizing}
        role="slider"
        style={{ bottom: height - 4 }}
        tabIndex={0}
      />

      <div
        className={cn(
          "fixed bottom-0 z-40 flex w-full flex-col overflow-x-hidden overflow-y-scroll border-t border-app-line bg-app-darkBox",
          isResizing && "select-none",
        )}
        style={{ height }}
      >
        <div className="sticky top-0 z-50 flex h-fit w-full flex-row items-center justify-between border-b border-app-line bg-app-box px-2 py-1">
          <div className="flex flex-row items-center gap-3 pl-2 text-sm text-ink">
            <div className="text-ink-dull">
              <HugeiconsIcon icon={ComputerTerminal01Icon} size={16} />
            </div>
            <div>Console</div>
          </div>
          <Button
            className="size-fit p-1"
            onClick={() => setConsoleOutputs([])}
            size="icon"
            variant="ghost"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} />
          </Button>
        </div>

        <div>
          {consoleOutputs.map((consoleOutput, index) => (
            <div
              className="flex flex-row border-b border-app-line bg-app-darkBox px-4 py-2 font-mono text-sm"
              key={consoleOutput.id}
            >
              <div
                className={cn(
                  "w-12 shrink-0",
                  ["in_progress", "loading_packages"].includes(consoleOutput.status) && "text-ink-dull",
                  consoleOutput.status === "completed" && "text-emerald-500",
                  consoleOutput.status === "failed" && "text-red-400",
                )}
              >
                [{index + 1}]
              </div>
              {["in_progress", "loading_packages"].includes(
                consoleOutput.status,
              ) ? (
                <div className="flex flex-row gap-2">
                  <div className="mt-0.5 mb-auto size-fit self-center">
                    <Loader size="sm" />
                  </div>
                  <div className="text-ink-dull">
                    {consoleOutput.status === "in_progress"
                      ? "Initializing..."
                      : consoleOutput.status === "loading_packages"
                        ? consoleOutput.contents.map((content) =>
                            content.type === "text" ? content.value : null,
                          )
                        : null}
                  </div>
                </div>
              ) : (
                <div className="flex w-full flex-col gap-2 overflow-x-scroll text-ink">
                  {consoleOutput.contents.map((content, contentIndex) =>
                    content.type === "image" ? (
                      <picture key={`${consoleOutput.id}-${contentIndex}`}>
                        <img
                          alt="output"
                          className="w-full max-w-md rounded-md"
                          src={content.value}
                        />
                      </picture>
                    ) : (
                      <div
                        className="w-full whitespace-pre-line break-words"
                        key={`${consoleOutput.id}-${contentIndex}`}
                      >
                        {content.value}
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={consoleEndRef} />
        </div>
      </div>
    </>
  ) : null;
}
