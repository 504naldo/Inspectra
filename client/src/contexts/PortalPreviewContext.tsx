import { createContext, useContext, useState } from "react";

interface PreviewOrg { id: number; name: string }

interface PortalPreviewCtx {
  previewOrg: PreviewOrg | null;
  setPreviewOrg: (org: PreviewOrg | null) => void;
}

const PortalPreviewContext = createContext<PortalPreviewCtx>({
  previewOrg: null,
  setPreviewOrg: () => {},
});

export function PortalPreviewProvider({ children }: { children: React.ReactNode }) {
  const [previewOrg, setPreviewOrg] = useState<PreviewOrg | null>(null);
  return (
    <PortalPreviewContext.Provider value={{ previewOrg, setPreviewOrg }}>
      {children}
    </PortalPreviewContext.Provider>
  );
}

export function usePortalPreview() {
  return useContext(PortalPreviewContext);
}
