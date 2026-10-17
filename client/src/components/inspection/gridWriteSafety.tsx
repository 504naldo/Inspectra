import React, { useCallback, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type SyntheticEvent } from "react";

/** Locks synchronously, before React renders disabled controls or a request yields. */
export class GridWriteBarrier {
  locked = false;

  async run(operation: () => Promise<void>): Promise<boolean> {
    if (this.locked) return false;
    this.locked = true;
    try {
      await operation();
      return true;
    } finally {
      this.locked = false;
    }
  }
}

export function useGridWriteBarrier() {
  const controller = useRef(new GridWriteBarrier()).current;
  const [isLocked, setIsLocked] = useState(false);
  const run = useCallback((operation: () => Promise<void>) => controller.run(async () => {
    setIsLocked(true);
    try { await operation(); } finally { setIsLocked(false); }
  }), [controller]);
  const isLockedNow = useCallback(() => controller.locked, [controller]);
  return { isLocked, isLockedNow, run };
}

export function GridWriteGuard({ barrier, children, className = "" }: {
  barrier: ReturnType<typeof useGridWriteBarrier>;
  children: ReactNode;
  className?: string;
}) {
  const block = (event: SyntheticEvent) => {
    if (!barrier.isLockedNow()) return;
    event.preventDefault();
    event.stopPropagation();
  };
  return <fieldset disabled={barrier.isLocked} aria-busy={barrier.isLocked}
    className={`min-w-0 border-0 p-0 m-0 ${className}`}
    onClickCapture={block} onChangeCapture={block} onInputCapture={block}
    onKeyDownCapture={block} onPointerDownCapture={block} onBlurCapture={block}>
    {children}
  </fieldset>;
}

/** Mirrors technicianUpdate: undefined is omitted; empty text becomes SQL NULL. */
export function acknowledgedDevicePatch<T extends { id: number; deviceRevision?: string }>(
  rows: T[], id: number, patch: Record<string, unknown>, revision: string, expectedRevision?: string,
): T[] {
  const defined = Object.fromEntries(Object.entries(patch)
    .filter(([key, value]) => value !== undefined && !["id", "jobId", "expectedDeviceRevision", "deviceRevision"].includes(key))
    .map(([key, value]) => [key, value === "" ? null : value]));
  return rows.map(row => row.id === id && (expectedRevision === undefined || row.deviceRevision === expectedRevision || row.deviceRevision === revision)
    ? { ...row, ...defined, deviceRevision: revision } : row);
}

export interface DeviceEditDraft { value: string; original: string; revision: string }

export class RevisionBoundDraft {
  current: DeviceEditDraft | null = null;

  begin(value: string | number | null | undefined, revision: string) {
    return this.current = { value: String(value ?? ""), original: String(value ?? ""), revision };
  }

  change(value: string, fallbackValue: string | number | null | undefined, fallbackRevision: string) {
    const original = this.current ?? this.begin(fallbackValue, fallbackRevision);
    return this.current = { ...original, value };
  }

  finish() {
    const current = this.current;
    this.current = null;
    return current;
  }
}

type Commit = (value: string, revision: string) => Promise<unknown>;
type BoundInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "onFocus" | "onBlur"> & {
  value: string | number | null | undefined;
  revision: string;
  onCommit: Commit;
};

/** A refresh cannot attach a new definition revision to text already being edited. */
export function RevisionBoundInput({ value, revision, onCommit, ...props }: BoundInputProps) {
  const [draft, setDraft] = useState<DeviceEditDraft | null>(null);
  const session = useRef(new RevisionBoundDraft()).current;
  return <input {...props} value={draft?.value ?? value ?? ""}
    onFocus={() => {
      setDraft(session.begin(value, revision));
    }}
    onChange={event => {
      setDraft(session.change(event.target.value, value, revision));
    }}
    onBlur={() => {
      const finished = session.finish();
      if (!finished || finished.value === finished.original) { setDraft(null); return; }
      void onCommit(finished.value, finished.revision).then(() => setDraft(null), () => setDraft(null));
    }} />;
}

type BoundSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "onFocus" | "onBlur"> & {
  revision: string;
  onCommit: Commit;
};
export function RevisionBoundSelect({ revision, onCommit, ...props }: BoundSelectProps) {
  const captured = useRef<string | null>(null);
  return <select {...props} onFocus={() => { captured.current = revision; }}
    onBlur={() => { captured.current = null; }}
    onChange={event => { void onCommit(event.target.value, captured.current ?? revision).catch(() => undefined); }} />;
}
