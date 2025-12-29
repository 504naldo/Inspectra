import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Decode state parameter to get the intended post-login route
      let targetRoute = '/admin'; // default fallback
      try {
        const decodedState = Buffer.from(state, 'base64').toString('utf-8');
        // Validate to prevent open redirects: must be same-origin path starting with "/"
        if (decodedState && decodedState.startsWith('/') && !decodedState.startsWith('//')) {
          targetRoute = decodedState;
        }
      } catch (error) {
        console.warn('[OAuth] Failed to decode state, using default route:', error);
      }

      // If target route is "/", redirect to role-based dashboard instead
      if (targetRoute === '/') {
        const user = await db.getUserByOpenId(userInfo.openId);
        if (user?.role === 'customer') {
          targetRoute = '/customer';
        } else if (user?.role === 'technician') {
          targetRoute = '/tech';
        } else {
          targetRoute = '/admin';
        }
      }

      res.redirect(302, targetRoute);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
