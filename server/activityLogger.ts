import { getDb } from "./db.js";
import { activityEvents } from "../drizzle/schema.js";

export type ActivityCtx = {
  user: {
    id: number;
    name?: string | null;
    role: string;
    companyId?: number | null;
  };
};

export type LogActivityInput = {
  ctx: ActivityCtx;
  entityType: string;
  entityId: number;
  eventType: string;
  title: string;
  description?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: number | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Fire-and-forget activity logger.
 * Never throws — errors are printed as warnings so they never break callers.
 * companyId and actor info always come from ctx.user; never trust client input.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  const companyId = input.ctx.user.companyId;
  if (!companyId) return;
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(activityEvents).values({
      companyId,
      actorUserId: input.ctx.user.id,
      actorName: input.ctx.user.name ?? null,
      actorRole: input.ctx.user.role,
      entityType: input.entityType,
      entityId: input.entityId,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      eventType: input.eventType,
      title: input.title,
      description: input.description ?? null,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    console.warn("[ActivityLogger] Failed to log activity:", err);
  }
}
