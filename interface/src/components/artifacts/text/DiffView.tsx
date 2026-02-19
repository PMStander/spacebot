import { diffLines } from "diff";

type DiffViewProps = {
  oldContent: string;
  newContent: string;
};

export function DiffView({ oldContent, newContent }: DiffViewProps) {
  const changes = diffLines(oldContent, newContent);

  return (
    <div className="prose dark:prose-invert p-6 font-mono text-sm">
      {changes.map((part, i) => {
        const className = part.added
          ? "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300"
          : part.removed
            ? "bg-red-100 text-red-600 line-through dark:bg-red-500/20 dark:text-red-300"
            : "";

        return (
          <pre key={i} className={`m-0 whitespace-pre-wrap ${className}`}>
            {part.value}
          </pre>
        );
      })}
    </div>
  );
}
