import { OAUTH_STATE_COOKIE_NAME, OAUTH_STATE_MAX_AGE_SECONDS } from "@shared/const";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Sets a short-lived nonce cookie this browser will send back on the OAuth
// callback. The server checks it against the nonce embedded in `state` to
// reject forged callback URLs (login CSRF) — a request crafted by an
// attacker won't have the victim's matching cookie.
function setOAuthStateCookie(nonce: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${OAUTH_STATE_COOKIE_NAME}=${nonce}; Path=/; Max-Age=${OAUTH_STATE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

// Generate Google OAuth login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = (returnTo?: string) => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  // The redirect URI is always the OAuth callback endpoint
  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  // Encode the intended post-login route in the state parameter
  // If returnTo is provided, use it; otherwise use empty string to let OAuth callback
  // determine the redirect based on the user's actual role
  const targetRoute = returnTo || '';
  const nonce = crypto.randomUUID().replace(/-/g, '');
  setOAuthStateCookie(nonce);
  const state = btoa(JSON.stringify({ route: targetRoute, nonce }));

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');

  return url.toString();
};

// Public marketing site (separate repo: 504naldo/inspectra-website). Optional link
// shown on the app entry screen. Configurable; defaults to the production site.
export const INSPECTRA_WEBSITE_URL =
  import.meta.env.VITE_INSPECTRA_WEBSITE_URL || "https://inspectrafire.ca";
