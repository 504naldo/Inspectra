import { Check, X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type InspectionResult = "pass" | "fail" | "na" | "not_tested";

interface CheckToggleProps {
  value: InspectionResult;
  onChange: (value: InspectionResult) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

const CYCLE: InspectionResult[] = ["not_tested", "pass", "fail", "na"];

export function CheckToggle({ value, onChange, disabled, size = "md" }: CheckToggleProps) {
  const next = () => {
    if (disabled) return;
    const idx = CYCLE.indexOf(value);
    onChange(CYCLE[(idx + 1) % CYCLE.length]);
  };

  const sizeClass = size === "sm" ? "h-7 w-7 text-xs" : "h-8 w-8 text-sm";

  if (value === "pass") {
    return (
      <button
        onClick={next}
        disabled={disabled}
        className={cn(
          "rounded flex items-center justify-center font-bold transition-colors",
          "bg-green-500 text-white hover:bg-green-600",
          sizeClass,
          disabled && "opacity-50 cursor-not-allowed"
        )}
        title="PASS — click to change"
      >
        <Check className="h-4 w-4" />
      </button>
    );
  }

  if (value === "fail") {
    return (
      <button
        onClick={next}
        disabled={disabled}
        className={cn(
          "rounded flex items-center justify-center font-bold transition-colors",
          "bg-red-500 text-white hover:bg-red-600",
          sizeClass,
          disabled && "opacity-50 cursor-not-allowed"
        )}
        title="FAIL — click to change"
      >
        <X className="h-4 w-4" />
      </button>
    );
  }

  if (value === "na") {
    return (
      <button
        onClick={next}
        disabled={disabled}
        className={cn(
          "rounded flex items-center justify-center font-bold transition-colors",
          "bg-gray-400 text-white hover:bg-gray-500",
          sizeClass,
          disabled && "opacity-50 cursor-not-allowed"
        )}
        title="N/A — click to change"
      >
        <Minus className="h-4 w-4" />
      </button>
    );
  }

  // not_tested
  return (
    <button
      onClick={next}
      disabled={disabled}
      className={cn(
        "rounded flex items-center justify-center font-bold transition-colors",
        "border-2 border-dashed border-gray-300 text-gray-300 hover:border-gray-400 hover:text-gray-400",
        sizeClass,
        disabled && "opacity-50 cursor-not-allowed"
      )}
      title="Not tested — click to mark PASS"
    >
      <span className="text-[10px]">—</span>
    </button>
  );
}
