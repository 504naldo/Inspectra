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
  s3Bucket: process.env.S3_BUCKET ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  notificationEmail: process.env.NOTIFICATION_EMAIL ?? "",
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",

  // ── Customer Records shared drive ──────────────────────────────────────────
  // Set CUSTOMER_SHARE_ROOT to the local path where the network share is mounted.
  // On Windows on-premises: \\SERVER\CustomerRecords
  // On Linux/Railway: /mnt/customer-records  (mount the CIFS share first)
  // Leave empty to disable the Customer Records feature gracefully.
  customerShareRoot:     process.env.CUSTOMER_SHARE_ROOT ?? "",
  customerShareUsername: process.env.CUSTOMER_SHARE_USERNAME ?? "",
  customerSharePassword: process.env.CUSTOMER_SHARE_PASSWORD ?? "",
  customerShareDomain:   process.env.CUSTOMER_SHARE_DOMAIN ?? "",
};
