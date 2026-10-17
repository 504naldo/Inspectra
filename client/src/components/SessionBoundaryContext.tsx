import { createContext } from "react";

/** Only the active account subtree may publish a session transition. */
export type SessionBoundaryActions = {
  refresh: () => Promise<void>;
  /** Clear the outer session synchronously; false means this subtree retired. */
  signedOut: () => boolean;
};

export const SessionBoundaryContext = createContext<SessionBoundaryActions | null>(null);
