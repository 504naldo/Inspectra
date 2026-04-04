import { useRef, useState, useCallback } from "react";
import ReactSignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { RotateCcw, Check } from "lucide-react";

interface SignaturePadProps {
  onConfirm: (dataUrl: string) => void;
  onClear?: () => void;
  label?: string;
  height?: number;
}

export function SignaturePad({ onConfirm, onClear, label, height = 180 }: SignaturePadProps) {
  const canvasRef = useRef<ReactSignatureCanvas>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  const handleEnd = useCallback(() => {
    if (canvasRef.current && !canvasRef.current.isEmpty()) {
      setIsEmpty(false);
    }
  }, []);

  const handleClear = useCallback(() => {
    canvasRef.current?.clear();
    setIsEmpty(true);
    setConfirmed(null);
    onClear?.();
  }, [onClear]);

  const handleConfirm = useCallback(() => {
    if (!canvasRef.current || canvasRef.current.isEmpty()) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    setConfirmed(dataUrl);
    onConfirm(dataUrl);
  }, [onConfirm]);

  return (
    <div className="flex flex-col gap-2">
      {label && <p className="text-sm font-medium text-foreground">{label}</p>}

      {confirmed ? (
        <div className="flex flex-col gap-2">
          <div
            className="rounded-md border border-border bg-white flex items-center justify-center overflow-hidden"
            style={{ height }}
          >
            <img
              src={confirmed}
              alt="Signature"
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleClear} className="self-start">
            <RotateCcw className="h-4 w-4 mr-1" />
            Redo
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div
            className="rounded-md border border-border bg-white touch-none"
            style={{ height }}
          >
            <ReactSignatureCanvas
              ref={canvasRef}
              penColor="#1e293b"
              canvasProps={{
                className: "w-full h-full rounded-md",
                style: { width: "100%", height: "100%" },
              }}
              onEnd={handleEnd}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={isEmpty}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Clear
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={isEmpty}
            >
              <Check className="h-4 w-4 mr-1" />
              Confirm Signature
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
