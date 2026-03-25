import { Calendar, Hash } from "lucide-react";

interface InspectionHeaderProps {
  jobNumber: string;
  siteName: string;
  scheduledDate?: string | Date | null;
  inspectionDate?: string | Date | null;
}

export function InspectionHeader({ jobNumber, siteName, scheduledDate, inspectionDate }: InspectionHeaderProps) {
  const date = inspectionDate || scheduledDate;
  const formattedDate = date
    ? new Date(date).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border rounded-lg text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Hash className="h-3.5 w-3.5" />
        <span className="font-mono font-medium text-foreground">{jobNumber}</span>
        <span className="text-muted-foreground/60">·</span>
        <span className="truncate max-w-[160px] sm:max-w-none">{siteName}</span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground flex-shrink-0">
        <Calendar className="h-3.5 w-3.5" />
        <span>{formattedDate}</span>
      </div>
    </div>
  );
}
