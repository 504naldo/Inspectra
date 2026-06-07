import { importPKCS8, SignJWT } from "jose";
import { ENV } from "./_core/env";
import * as db from "./db";

// Cache the access token to avoid a round-trip on every send
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getFcmAccessToken(): Promise<string | null> {
  if (!ENV.firebaseServiceAccountJson) return null;
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.value;
  }

  let sa: any;
  try {
    sa = JSON.parse(ENV.firebaseServiceAccountJson);
  } catch {
    console.error("[push] Invalid FIREBASE_SERVICE_ACCOUNT_JSON");
    return null;
  }

  const privateKey = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    console.error("[push] Failed to get FCM access token:", await res.text());
    return null;
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.value;
}

export async function sendPushToUser(
  userId: number,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (!ENV.firebaseProjectId || !ENV.firebaseServiceAccountJson) return;

  const user = await db.getUserById(userId);
  if (!user || !(user as any).pushToken) return;

  const token = await getFcmAccessToken();
  if (!token) return;

  const message: any = {
    message: {
      token: (user as any).pushToken,
      notification: { title, body },
      ...(data ? { data } : {}),
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } },
    },
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${ENV.firebaseProjectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    // Token expired or unregistered — clear it
    if (res.status === 404 || res.status === 400) {
      await db.updateUser(userId, { pushToken: null, pushPlatform: null } as any);
    }
    console.error(`[push] FCM send failed for user ${userId}:`, err);
  }
}
