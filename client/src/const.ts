export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = (returnTo?: string) => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  
  // The redirect URI is always the OAuth callback endpoint
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  
  // Encode the intended post-login route in the state parameter
  // If returnTo is provided, use it; otherwise use empty string to let OAuth callback
  // determine the redirect based on the user's actual role
  const targetRoute = returnTo || '';
  const state = btoa(targetRoute);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
