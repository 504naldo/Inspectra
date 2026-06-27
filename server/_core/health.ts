/**
 * Health-check payload builder.
 *
 * Kept as a pure function (separate from the Express wiring in index.ts) so it
 * can be unit-tested without standing up the server — mirroring how cors.test.ts
 * tests the origin logic rather than the live app.
 *
 * This is a *liveness* probe: it answers 200 as long as the Node process is up
 * and serving requests. It deliberately does NOT touch the database — a DB blip
 * shouldn't make Railway kill an otherwise-healthy instance and trigger a
 * restart loop. A separate readiness/DB check can be added later if needed.
 */
export interface HealthPayload {
  status: "ok";
  uptime: number; // process uptime in seconds
  timestamp: string; // ISO 8601
}

export function buildHealthPayload(now: Date = new Date()): HealthPayload {
  return {
    status: "ok",
    uptime: process.uptime(),
    timestamp: now.toISOString(),
  };
}
