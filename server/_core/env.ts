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

  // ── Customer Records (legacy SMB share — superseded by Google Drive) ────────
  customerShareRoot:     process.env.CUSTOMER_SHARE_ROOT ?? "",
  customerShareUsername: process.env.CUSTOMER_SHARE_USERNAME ?? "",
  customerSharePassword: process.env.CUSTOMER_SHARE_PASSWORD ?? "",
  customerShareDomain:   process.env.CUSTOMER_SHARE_DOMAIN ?? "",

  // ── Customer Records — Google Drive ────────────────────────────────────────
  // GOOGLE_DRIVE_CUSTOMER_ROOT_ID: Drive folder ID that is the root for all
  //   customer records.  All searches and browsing are scoped to this folder.
  //   Required to enable the Customer Records feature.
  //
  // GOOGLE_DRIVE_SHARED_DRIVE_ID: Set this if the root folder lives inside a
  //   Shared Drive (a.k.a. Team Drive).  Leave empty for My Drive.
  //
  // GOOGLE_DRIVE_USE_SHARED_DRIVE: Set to "true" when using a Shared Drive.
  //   Adds the required supportsAllDrives / includeItemsFromAllDrives params.
  googleDriveCustomerRootId:  process.env.GOOGLE_DRIVE_CUSTOMER_ROOT_ID ?? "",
  googleDriveSharedDriveId:   process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID ?? "",
  googleDriveUseSharedDrive:  process.env.GOOGLE_DRIVE_USE_SHARED_DRIVE === "true",

  // Firebase Cloud Messaging (push notifications)
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? "",
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "",
};
