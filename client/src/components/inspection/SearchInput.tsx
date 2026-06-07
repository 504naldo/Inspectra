import { Search, X, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** Show a scan button that invokes this handler (e.g. barcode/QR scan → sets the search value) */
  onScan?: () => void;
}

export function SearchInput({ value, onChange, placeholder = "Search…", className, onScan }: SearchInputProps) {
  return (
    <div className={cn("relative flex items-center", className)}>
      <Search className="absolute left-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("h-7 w-44 rounded border bg-background pl-7 text-xs outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60", onScan ? "pr-12" : "pr-6")}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className={cn("absolute text-muted-foreground/60 hover:text-muted-foreground", onScan ? "right-7" : "right-1.5")}
          type="button"
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {onScan && (
        <button
          onClick={onScan}
          className="absolute right-1.5 text-muted-foreground/60 hover:text-muted-foreground"
          type="button"
          aria-label="Scan barcode or QR code"
          title="Scan barcode or QR code"
        >
          <ScanLine className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
