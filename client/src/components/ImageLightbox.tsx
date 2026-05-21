import { X } from "lucide-react";

interface Props {
  url: string;
  onClose: () => void;
}

export function ImageLightbox({ url, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <img src={url} alt="Photo" className="max-w-full max-h-full object-contain rounded" />
      <button
        className="absolute top-4 right-4 bg-black/50 rounded-full p-2"
        onClick={onClose}
      >
        <X className="h-6 w-6 text-white" />
      </button>
    </div>
  );
}
