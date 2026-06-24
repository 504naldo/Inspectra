export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// CSRF protection for the Google OAuth login flow: getLoginUrl() sets this
// cookie with a random nonce before redirecting to Google, and the callback
// verifies it matches the nonce embedded in the returned `state` param.
export const OAUTH_STATE_COOKIE_NAME = "oauth_state_nonce";
export const OAUTH_STATE_MAX_AGE_SECONDS = 600; // 10 minutes — enough to complete Google's consent screen
