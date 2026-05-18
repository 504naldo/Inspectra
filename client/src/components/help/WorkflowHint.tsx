import { Info } from "lucide-react";

interface WorkflowHintProps {
  hint: string;
  className?: string;
}

export function WorkflowHint({ hint, className }: WorkflowHintProps) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-3 py-2.5 text-sm text-blue-800 dark:text-blue-300 ${className ?? ""}`}
    >
      <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
      <span className="leading-snug">{hint}</span>
    </div>
  );
}
