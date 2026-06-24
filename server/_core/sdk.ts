import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { parseCookies } from "./cookies";
import { ENV } from "./env";

// ============================================================================
// Types
// ============================================================================

/** Returned by exchangeCodeForToken */
export type TokenResponse = {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn?: number;
};

/** Returned by getUserInfo — matches the shape the rest of the app expects */
export type UserInfoResponse = {
  openId: string;       // Google's `sub` claim
  name: string;
  email: string | null;
  emailVerified: boolean; // Google's `email_verified` claim — false if absent
  loginMethod: string;  // Always "google" after migration
  platform: string;     // Same as loginMethod
};

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
  sessionVersion: number;
};

// ============================================================================
// Utility
// ============================================================================

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

// ============================================================================
// Google OAuth helpers
// ============================================================================

/**
 * Exchange the authorization code from Google's OAuth redirect for tokens.
 *
 * The `state` parameter is the base64-encoded return route (same as before).
 * Google's token endpoint doesn't need it, but we accept it to keep the
 * call-site in oauth.ts unchanged.
 */
async function googleExchangeCode(code: string): Promise<TokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      redirect_uri: `${ENV.appUrl}/api/oauth/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Google token exchange failed (${response.status}): ${errorBody}`
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    id_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };

  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Fetch user profile from Google using the access token.
 * Returns the same shape the rest of the app expects.
 */
async function googleGetUserInfo(accessToken: string): Promise<UserInfoResponse> {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Google userinfo request failed (${response.status}): ${errorBody}`
    );
  }

  const data = (await response.json()) as {
    sub: string;       // Unique Google user ID
    name?: string;
    email?: string;
    email_verified?: boolean;
    picture?: string;
  };

  return {
    openId: data.sub,                          // Maps to users.openId
    name: data.name || "",
    email: data.email || null,
    emailVerified: data.email_verified === true,
    loginMethod: "google",
    platform: "google",
  };
}

// ============================================================================
// SDKServer — same public interface as the Manus version
// ============================================================================

class SDKServer {
  // ── OAuth methods ──

  /**
   * Exchange OAuth authorization code for tokens.
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(
    code: string,
    _state: string // kept for call-site compatibility; not needed by Google
  ): Promise<TokenResponse> {
    return googleExchangeCode(code);
  }

  /**
   * Get user information using access token.
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken: string): Promise<UserInfoResponse> {
    return googleGetUserInfo(accessToken);
  }

  // ── Session management (unchanged — fully self-contained) ──

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    if (!secret) {
      throw new Error("JWT_SECRET is not configured");
    }
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token (JWT) for a user's openId.
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId, { name: "..." });
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string; sessionVersion?: number } = {}
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        appId: ENV.appId || "inspectra",
        name: options.name || "",
        sessionVersion: options.sessionVersion ?? 1,
      },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
      sv: payload.sessionVersion,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string; sessionVersion: number } | null> {
    if (!cookieValue) {
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name, sv } = payload as Record<string, unknown>;

      if (
        !isNonEmptyString(openId) ||
        !isNonEmptyString(name)
      ) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }

      return {
        openId,
        appId: isNonEmptyString(appId) ? appId : "inspectra",
        name,
        // sv absent means a pre-versioning token (treat as 0; will fail the DB check below)
        sessionVersion: typeof sv === "number" ? sv : 0,
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  /**
   * Authenticate an incoming Express request via session cookie.
   * Returns the full User record from the database.
   *
   * This method is fully self-contained (JWT verification + DB lookup).
   * It does NOT call any external OAuth provider.
   */
  async authenticateRequest(req: Request): Promise<User> {
    const cookies = parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const sessionUserId = session.openId;
    const signedInAt = new Date();
    let user = await db.getUserByOpenId(sessionUserId);

    // If user not in DB, they need to go through the OAuth login flow.
    // (Previously this would call Manus to sync — now we just reject.)
    if (!user) {
      throw ForbiddenError("User not found — please log in again");
    }

    // Block deactivated accounts on every API request, not just the OAuth redirect.
    if (user.isActive === 0) {
      throw ForbiddenError("Account is inactive. Contact your administrator.");
    }

    // Reject sessions whose version no longer matches — this fires when an admin
    // deactivates a user, or when the user explicitly logs out.
    // Cast: sessionVersion is not declared in the Drizzle schema until migration 0044
    // runs; once deployed it returns from the DB at runtime even without a schema entry.
    const dbSessionVersion: number = (user as any).sessionVersion ?? 1;
    if (session.sessionVersion !== dbSessionVersion) {
      throw ForbiddenError("Session has been revoked — please log in again.");
    }

    // Update last sign-in timestamp
    await db.upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt,
    });

    return user;
  }
}

export const sdk = new SDKServer();