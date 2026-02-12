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
    console.log('[OAuth] Callback received');
    console.log('[OAuth] Full URL:', req.originalUrl);
    console.log('[OAuth] Query params:', JSON.stringify(req.query));
    
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    console.log('[OAuth] Extracted code:', code ? 'present' : 'missing');
    console.log('[OAuth] Extracted state:', state ? 'present' : 'missing');

    if (!code || !state) {
      console.error('[OAuth] Missing required parameters');
      console.error('[OAuth] This usually means the OAuth callback was accessed directly');
      console.error('[OAuth] or the OAuth provider did not include the required parameters');
      
      // Return user-friendly HTML error page
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Login Error</title>
            <style>
              body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
              .message { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 500px; }
              h1 { color: #e53e3e; margin-top: 0; }
              p { color: #666; line-height: 1.6; }
              .button { display: inline-block; background: #3b82f6; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; margin-top: 1rem; }
              .button:hover { background: #2563eb; }
              .details { background: #f9f9f9; padding: 1rem; border-radius: 4px; margin-top: 1rem; font-size: 0.875rem; color: #666; }
            </style>
          </head>
          <body>
            <div class="message">
              <h1>Login Failed</h1>
              <p>The login process was interrupted. This can happen if:</p>
              <ul>
                <li>You accessed this page directly instead of clicking the login button</li>
                <li>Your browser blocked the redirect</li>
                <li>The OAuth session expired</li>
              </ul>
              <a href="/" class="button">Return to Home & Try Again</a>
              <div class="details">
                <strong>Technical details:</strong> OAuth callback received without required code and state parameters.
              </div>
            </div>
          </body>
        </html>
      `);
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      // Determine company assignment
      const allCompanies = await db.getAllCompanies();
      let companyId: number | undefined;
      
      if (allCompanies.length === 1) {
        // Single company - assign to it
        companyId = allCompanies[0].id;
      } else if (allCompanies.length > 1) {
        // Multiple companies - for now, use first company
        // TODO: Implement domain-based company matching
        companyId = allCompanies[0].id;
      }

      // Determine role and activation based on email
      const email = userInfo.email?.toLowerCase() || '';
      let role: 'admin' | 'office' | 'technician' | 'customer' = 'technician';
      let isActive = 1; // Default to active for EWF emails

      if (email === 'ranaldo@ewandf.ca') {
        role = 'admin';
        isActive = 1;
      } else if (email.endsWith('@ewandf.ca')) {
        // Other EWF emails: active technicians by default
        role = 'technician';
        isActive = 1;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
        companyId,
        role,
        isActive,
      });

      console.log('[OAuth] User upserted:', {
        email: userInfo.email,
        role,
        companyId,
        isActive,
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

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

      // Decode state parameter to get the intended post-login route
      let targetRoute = ''; // empty means use role-based redirect
      try {
        const decodedState = Buffer.from(state, 'base64').toString('utf-8');
        console.log('[OAuth] Decoded state:', decodedState);
        // Validate to prevent open redirects: must be same-origin path starting with "/"
        if (decodedState && decodedState.startsWith('/') && !decodedState.startsWith('//')) {
          targetRoute = decodedState;
        }
      } catch (error) {
        console.warn('[OAuth] Failed to decode state, using role-based redirect:', error);
      }

      console.log('[OAuth] User role:', user?.role);
      console.log('[OAuth] Target route before role check:', targetRoute);

      // If target route is empty or "/", redirect to role-based dashboard
      if (!targetRoute || targetRoute === '/') {
        if (user?.role === 'customer') {
          targetRoute = '/customer';
        } else if (user?.role === 'technician') {
          targetRoute = '/tech/jobs';
        } else if (user?.role === 'office') {
          targetRoute = '/admin';
        } else {
          targetRoute = '/admin'; // admin role or fallback
        }
        console.log('[OAuth] Role-based redirect determined:', targetRoute);
      }

      console.log('[OAuth] Final redirect to:', targetRoute, {
        email: userInfo.email,
        role: user?.role,
        companyId: user?.companyId,
        isActive: user?.isActive,
      });
      res.redirect(302, targetRoute);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
