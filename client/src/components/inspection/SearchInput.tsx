import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = "Search…", className }: SearchInputProps) {
  return (
    <div className={cn("relative flex items-center", className)}>
      <Search className="absolute left-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 w-44 rounded border bg-background pl-7 pr-6 text-xs outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-1.5 text-muted-foreground/60 hover:text-muted-foreground"
          type="button"
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
