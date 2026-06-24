import { COOKIE_NAME, OAUTH_STATE_COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions, parseCookies } from "./cookies";
import { sdk, type UserInfoResponse } from "./sdk";
import { ENV } from "./env";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

type DecodedOAuthState = { route: string; nonce: string };

/** The `state` param is base64(JSON({ route, nonce })) — see client/src/const.ts's getLoginUrl. */
export function decodeOAuthState(state: string): DecodedOAuthState | null {
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
    if (typeof parsed?.route === "string" && typeof parsed?.nonce === "string") {
      return { route: parsed.route, nonce: parsed.nonce };
    }
    return null;
  } catch {
    return null;
  }
}

/** Prevents open redirects: only same-origin paths starting with a single "/" are honored. */
export function isSafeReturnRoute(route: string): boolean {
  return Boolean(route) && route.startsWith("/") && !route.startsWith("//");
}

/**
 * CSRF guard for the OAuth login flow: the nonce embedded in `state` must match
 * the cookie getLoginUrl() set in this same browser before redirecting to Google.
 * A forged callback URL (login CSRF) won't carry the victim's matching cookie.
 */
export function isOAuthNonceValid(cookieNonce: string | undefined, stateNonce: string | undefined): boolean {
  return Boolean(cookieNonce) && Boolean(stateNonce) && cookieNonce === stateNonce;
}

/** Google's `email_verified` must be true whenever an email is present before it's trusted for role/identity. */
export function hasUnverifiedEmail(userInfo: Pick<UserInfoResponse, "email" | "emailVerified">): boolean {
  return Boolean(userInfo.email) && userInfo.emailVerified !== true;
}

function renderLoginErrorPage(title: string, message: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
          .message { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 500px; }
          h1 { color: #e53e3e; margin-top: 0; }
          p { color: #666; line-height: 1.6; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; margin-top: 1rem; }
          .button:hover { background: #2563eb; }
        </style>
      </head>
      <body>
        <div class="message">
          <h1>${title}</h1>
          <p>${message}</p>
          <a href="/" class="button">Return to Home & Try Again</a>
        </div>
      </body>
    </html>
  `;
}

/** Determine role and activation status from email using environment config */
function resolveRoleFromEmail(email: string): { role: 'admin' | 'office' | 'technician' | 'customer'; isActive: number } {
  const normalized = email.toLowerCase();

  // Check admin list from ADMIN_EMAILS env var
  if (ENV.adminEmails.includes(normalized)) {
    return { role: 'admin', isActive: 1 };
  }

  // Check company domain from COMPANY_DOMAIN env var
  if (ENV.companyDomain && normalized.endsWith(`@${ENV.companyDomain}`)) {
    return { role: 'technician', isActive: 1 };
  }

  // External user — inactive by default, pending admin approval
  return { role: 'technician', isActive: 0 };
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    if (!ENV.isProduction) {
      console.log('[OAuth] Callback received');
      console.log('[OAuth] Full URL:', req.originalUrl);
    }
    
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state") || "";

    if (!ENV.isProduction) {
      console.log('[OAuth] Extracted code:', code ? 'present' : 'missing');
      console.log('[OAuth] Extracted state:', state ? 'present' : 'empty');
    }

    if (!code) {
      console.error('[OAuth] Missing required code parameter');
      
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
                <strong>Technical details:</strong> OAuth callback received without required code parameter.
              </div>
            </div>
          </body>
        </html>
      `);
      return;
    }

    // CSRF guard: validate the state nonce against this browser's cookie before
    // doing anything stateful (network calls, DB writes, session creation).
    const decodedState = decodeOAuthState(state);
    const stateCookieNonce = parseCookies(req.headers.cookie).get(OAUTH_STATE_COOKIE_NAME);
    if (!decodedState || !isOAuthNonceValid(stateCookieNonce, decodedState.nonce)) {
      console.error("[OAuth] State/nonce validation failed — possible CSRF attempt or expired login session");
      res.status(400).send(renderLoginErrorPage(
        "Login Failed",
        "Your sign-in session could not be verified. This can happen if the link is old or was opened in a different browser. Please return home and try signing in again."
      ));
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE_NAME, { path: "/" });

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      if (hasUnverifiedEmail(userInfo)) {
        console.error("[OAuth] Rejected login with unverified email:", userInfo.email);
        res.status(403).send(renderLoginErrorPage(
          "Email Not Verified",
          "Your Google account's email address is not verified. Please verify your email with Google, then try signing in again."
        ));
        return;
      }

      // Determine company assignment
      const allCompanies = await db.getAllCompanies();
      let companyId: number | undefined;
      
      if (allCompanies.length === 1) {
        companyId = allCompanies[0].id;
      } else if (allCompanies.length > 1) {
        // Multiple companies — match by email domain if company has emailDomain set
        const email = userInfo.email?.toLowerCase() || '';
        const emailDomain = email.split('@')[1];
        if (emailDomain) {
          const matched = allCompanies.find(c => c.emailDomain?.toLowerCase() === emailDomain);
          companyId = matched?.id ?? allCompanies[0].id;
        } else {
          companyId = allCompanies[0].id;
        }
      }

      // Determine role and activation from env-driven config
      const email = userInfo.email?.toLowerCase() || '';
      const { role, isActive } = resolveRoleFromEmail(email);

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

      // Save Google tokens for Workspace integrations (Gmail, Calendar, Drive)
      if (tokenResponse.accessToken) {
        const tokenExpiry = tokenResponse.expiresIn
          ? new Date(Date.now() + tokenResponse.expiresIn * 1000)
          : null;
        await db.updateUserByOpenId(userInfo.openId, {
          googleAccessToken: tokenResponse.accessToken,
          googleRefreshToken: tokenResponse.refreshToken || undefined,
          googleTokenExpiry: tokenExpiry,
        });
      }

      if (!ENV.isProduction) {
        console.log('[OAuth] User upserted:', { email: userInfo.email, role, companyId, isActive });
      }

      // Fetch user after upsert to get the current sessionVersion for JWT embedding.
      const user = await db.getUserByOpenId(userInfo.openId);

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
        sessionVersion: (user as any)?.sessionVersion ?? 1,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
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

      // Resolve the intended post-login route from the already-validated state
      let targetRoute = isSafeReturnRoute(decodedState.route) ? decodedState.route : '';

      // Customer portal not active — block any /customer/* routes from state param
      if (targetRoute.startsWith('/customer')) {
        targetRoute = '/forbidden';
      }

      // If target route is empty or "/", redirect to role-based dashboard
      if (!targetRoute || targetRoute === '/') {
        if (user?.role === 'customer') {
          targetRoute = '/forbidden'; // customer portal not active
        } else if (user?.role === 'technician') {
          targetRoute = '/tech/jobs';
        } else if (user?.role === 'office') {
          targetRoute = '/admin';
        } else {
          targetRoute = '/admin'; // admin role or fallback
        }
      }

      if (!ENV.isProduction) {
        console.log('[OAuth] Final redirect to:', targetRoute, { email: userInfo.email, role: user?.role });
      }
      res.redirect(302, targetRoute);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[OAuth] Callback failed:", message);
      // Surface enough detail to diagnose (not secret values) without leaking credentials
      const hint = message.includes("redirect_uri")
        ? "redirect_uri_mismatch — ensure APP_URL env var matches your deployment URL and the callback is registered in Google Cloud Console"
        : message.includes("client_id") || message.includes("client_secret")
        ? "invalid_client — check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars"
        : message.includes("invalid_grant") || message.includes("code")
        ? "invalid_grant — the authorization code was already used or expired"
        : message;
      res.status(500).json({ error: "OAuth callback failed", hint });
    }
  });
}