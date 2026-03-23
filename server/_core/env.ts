export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  appUrl: (process.env.APP_URL ?? "").replace(/\/$/, ""),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  // Comma-separated list of emails that get auto-assigned admin role on login
  // e.g. "ranaldo@ewandf.ca,admin2@ewandf.ca"
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  // Email domain for auto-activating company employees (e.g. "ewandf.ca")
  // Users with this domain get auto-activated as technicians on first login
  companyDomain: (process.env.COMPANY_DOMAIN ?? "").trim().toLowerCase(),
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
};
