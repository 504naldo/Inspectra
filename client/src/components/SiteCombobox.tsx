import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface SiteOption {
  id: number;
  name: string;
  address?: string | null;
  city?: string | null;
  fileNumber?: string | null;
  buildingId?: string | null;
}

/**
 * Type-ahead site picker. Drop-in replacement for a plain <Select> of sites:
 * `value` is the selected site id as a string ("" = none) and `onChange` is
 * called with the same, so it slots into existing form state (e.g. newJob.siteId)
 * without other changes. Filters by name, file number, building/account ID,
 * address, and city.
 */
export function SiteCombobox({
  sites,
  value,
  onChange,
  placeholder = "Select site",
  disabled = false,
  loading = false,
}: {
  sites: SiteOption[] | undefined;
  value: string;
  onChange: (siteId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = sites?.find((s) => String(s.id) === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {loading ? "Loading sites…" : selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name, file #, building ID, address…" />
          <CommandList>
            <CommandEmpty>No site found.</CommandEmpty>
            <CommandGroup>
              {sites?.map((s) => {
                const meta = [s.fileNumber, s.buildingId, s.address, s.city].filter(Boolean).join(" · ");
                return (
                  <CommandItem
                    key={s.id}
                    // cmdk filters on this value; onSelect uses the closured id.
                    value={`${s.name} ${s.fileNumber ?? ""} ${s.buildingId ?? ""} ${s.address ?? ""} ${s.city ?? ""}`}
                    onSelect={() => {
                      onChange(String(s.id));
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", String(s.id) === value ? "opacity-100" : "opacity-0")} />
                    <div className="min-w-0">
                      <div className="truncate">{s.name}</div>
                      {meta && <div className="truncate text-xs text-muted-foreground">{meta}</div>}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
