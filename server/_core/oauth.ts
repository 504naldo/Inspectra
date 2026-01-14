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

      // Check if user is active
      const user = await db.getUserByOpenId(userInfo.openId);
      if (user && user.isActive === 0) {
        // User exists but is not active - show pending approval message
        res.status(403).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Account Pending Approval</title>
              <style>
                body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
                .message { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 400px; text-align: center; }
                h1 { color: #333; margin-top: 0; }
                p { color: #666; line-height: 1.6; }
              </style>
            </head>
            <body>
              <div class="message">
                <h1>Account Pending Approval</h1>
                <p>Your account has been created but is awaiting admin approval. Please contact your administrator to activate your account.</p>
                <p><strong>Email:</strong> ${user.email || 'Not provided'}</p>
              </div>
            </body>
          </html>
        `);
        return;
      }

      // If target route is "/", redirect to role-based dashboard instead
      if (targetRoute === '/') {
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
