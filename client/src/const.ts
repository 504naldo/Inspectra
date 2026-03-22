export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate Google OAuth login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = (returnTo?: string) => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  // The redirect URI is always the OAuth callback endpoint
  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  // Encode the intended post-login route in the state parameter
  // If returnTo is provided, use it; otherwise use empty string to let OAuth callback
  // determine the redirect based on the user's actual role
  const targetRoute = returnTo || '';
  const state = btoa(targetRoute);

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');

  return url.toString();
};
