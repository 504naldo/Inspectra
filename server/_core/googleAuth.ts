import { ENV } from "./env";
import * as db from "../db";

/**
 * Get a valid Google access token for a user, refreshing if expired.
 * Returns null if the user has no stored tokens (they need to re-login).
 */
export async function getValidGoogleToken(userId: number): Promise<string | null> {
  const user = await db.getUserById(userId);
  if (!user) return null;

  // Check if we have tokens at all
  if (!user.googleAccessToken) return null;

  // Check if token is still valid (with 5 min buffer)
  if (user.googleTokenExpiry) {
    const bufferMs = 5 * 60 * 1000;
    if (new Date(user.googleTokenExpiry).getTime() - bufferMs > Date.now()) {
      return user.googleAccessToken;
    }
  }

  // Need to refresh
  if (!user.googleRefreshToken) return null;

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: ENV.googleClientId,
        client_secret: ENV.googleClientSecret,
        refresh_token: user.googleRefreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error("[GoogleAuth] Token refresh failed:", response.status, errorBody);
      return null;
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
      token_type: string;
    };

    // Save refreshed token
    const newExpiry = new Date(Date.now() + data.expires_in * 1000);
    await db.updateUser(user.id, {
      googleAccessToken: data.access_token,
      googleTokenExpiry: newExpiry,
    });

    return data.access_token;
  } catch (error) {
    console.error("[GoogleAuth] Token refresh error:", error);
    return null;
  }
}
