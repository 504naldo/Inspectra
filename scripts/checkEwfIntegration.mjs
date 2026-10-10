// Cross-repository fictional workflow. No production URL, provider or staff password is used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { SignJWT } from "jose";
const { chromium } = await import(
  process.env.EWF_PLAYWRIGHT_MODULE ||
    "/tmp/ewf-browser-tools/node_modules/playwright/index.mjs"
);
const { fixture } = await import(
  pathToFileURL(
    `${process.env.EWF_CHECKOUT || "/workspace/EWF-Sprinkler-Desk"}/tests/helpers.mjs`
  )
);
const url = new URL(process.env.DATABASE_URL || "");
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  !url.pathname.startsWith("/inspectra_")
)
  throw Error("Explicit disposable loopback database required");
url.pathname = "/";
const admin = await mysql.createConnection(url.toString()),
  database = `inspectra_ewf_browser_${process.pid}`;
await admin.query(`CREATE DATABASE \`${database}\``);
url.pathname = `/${database}`;
const db = await mysql.createConnection(url.toString());
const key = randomBytes(32).toString("hex"),
  secret = randomBytes(48).toString("hex");
const client = { id: "fictional-browser", companyId: 1, key, accounts: {} };
const ewf = await fixture({
  inspectraIntegration: { enabled: true, clients: [client] },
});
const office = ewf.app.db
  .prepare("SELECT id FROM users WHERE role='admin'")
  .get().id;
client.accounts["1"] = office;
await ewf.request(
  "/api/login",
  "POST",
  { email: "admin@ewftest.invalid", password: "EWF_Test_Restricted_2026!" },
  false
);
const fitter = (
  await ewf.request("/api/users", "POST", {
    email: "integration-fitter@fictional.invalid",
    password: "Fictional_Integration_2026!",
    display_name: "Fictional assigned fitter",
    role: "technician",
  })
).data.item;
client.accounts["2"] = fitter.id;
let server,
  browser,
  output = "";
const base = "http://localhost:4489";
async function context(openId) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await c.route("**/*", route =>
    route
      .request()
      .url()
      .startsWith(base + "/")
      ? route.continue()
      : route.abort()
  );
  const token = await new SignJWT({
    openId,
    appId: "ewf-fictional",
    name: "Fictional account",
    sv: 1,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
  await c.addCookies([
    {
      name: "app_session_id",
      value: token,
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return c;
}
try {
  await migrate(drizzle(db), { migrationsFolder: "drizzle" });
  await db.query(
    "INSERT INTO companies(id,name) VALUES(1,'Fictional integration company')"
  );
  await db.query(
    "INSERT INTO customer_orgs(id,companyId,name) VALUES(1,1,'Fictional organization')"
  );
  await db.query(
    "INSERT INTO sites(id,companyId,customerOrgId,name,address,city) VALUES(1,1,1,'Fictional Maple Property','100 Fictional Lane','Example City')"
  );
  for (const [id, role] of [
    [1, "office"],
    [2, "technician"],
    [3, "technician"],
    [4, "customer"],
  ])
    await db.query(
      "INSERT INTO users(id,openId,name,email,role,companyId,customerOrgId,isActive) VALUES(?,?,?,?,?,1,1,1)",
      [
        id,
        `ewf-fictional-${id}`,
        `Fictional ${role}`,
        `user${id}@fictional.invalid`,
        role,
      ]
    );
  await db.query(
    "INSERT INTO jobs(id,companyId,siteId,customerOrgId,jobNumber,title) VALUES(1,1,1,1,'FICTIONAL-JOB','Fictional inspection')"
  );
  await db.query(
    "INSERT INTO deficiencies(id,jobId,reportedById,title,description,systemCategory) VALUES(1,1,2,'Fictional coupling leak','Fictional source for estimating only','SPRINKLER')"
  );
  server = spawn(
    process.execPath,
    ["--import", "tsx", "server/_core/index.ts"],
    {
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "development",
        PORT: "4489",
        APP_URL: base,
        DATABASE_URL: url.toString(),
        JWT_SECRET: secret,
        VITE_APP_ID: "ewf-fictional",
        EMAIL_AUTOMATION_ENABLED: "false",
        EWF_INTEGRATION_ENABLED: "true",
        EWF_INTEGRATION_BINDINGS: JSON.stringify([
          { companyId: 1, clientId: client.id, url: ewf.base, key },
        ]),
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  server.stdout.on("data", c => (output += c));
  server.stderr.on("data", c => (output += c));
  let ready = false;
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(base + "/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(ready, "Inspectra server ready");
  browser = await chromium.launch({
    executablePath: process.env.EWF_CHROMIUM || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const officeContext = await context("ewf-fictional-1"),
    page = await officeContext.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(base + "/sprinkler-desk");
  await page.getByLabel("Inspectra property").selectOption("1");
  await page
    .getByRole("button", { name: "Fictional coupling leak", exact: true })
    .click();
  await page.getByLabel("I reviewed this property").check();
  await page
    .getByRole("button", { name: "Create or link draft quote" })
    .click();
  await page.getByText("Linked quote Q-I-").waitFor();
  await page.getByLabel("Active mapped fitter").selectOption(fitter.id);
  await page.getByRole("button", { name: "Assign estimate request" }).click();
  await page.getByRole("button", { name: "Submit saved estimate" }).waitFor();
  const techContext = await context("ewf-fictional-2"),
    tech = await techContext.newPage();
  await tech.goto(base + "/sprinkler-desk/1/1");
  await tech.getByLabel("Total labour-hours").fill("8");
  await tech
    .getByLabel("Proposed scope")
    .fill(
      "Fictional coupling repair estimate; office prepares commercial scope"
    );
  await tech
    .getByLabel("Restrictions", { exact: true })
    .fill("No shutdown authorized; approved onsite procedures required");
  await tech.getByLabel("Internal notes").fill("Private fictional fitter note");
  await tech.getByRole("button", { name: "Add part" }).click();
  await tech.getByLabel("Part 1 description").fill("Fictional coupling");
  await tech.getByLabel("Part 1 quantity").fill("2");
  await tech.getByRole("button", { name: "Save draft", exact: true }).click();
  await tech.getByRole("button", { name: "Submit saved estimate" }).waitFor();
  await tech.getByRole("button", { name: "Submit saved estimate" }).click();
  await tech.getByText("Fictional assigned fitter — submitted").waitFor();
  assert.equal(await tech.getByLabel("Proposed scope").isDisabled(), true);
  const artifacts =
    process.env.EWF_INTEGRATION_ARTIFACTS || "/tmp/inspectra-ewf-artifacts";
  await mkdir(artifacts, { recursive: true });
  await tech.screenshot({
    path: artifacts + "/fictional-fitter-submitted.png",
    fullPage: true,
  });
  await page.reload();
  await page
    .getByLabel("Office review note")
    .fill("Reviewed fictional evidence; commercial pricing remains separate");
  await page.getByLabel("I reviewed the retained estimate").check();
  await page.getByRole("button", { name: "Record office review" }).click();
  await page.getByText("Fictional assigned fitter — reviewed").waitFor();
  await page.screenshot({
    path: artifacts + "/fictional-office-review.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Inspectra estimate workspace" })
    .click();
  await page.getByText("Fictional assigned fitter — reviewed").waitFor();
  const row = ewf.app.db.prepare("SELECT * FROM fitter_estimates").get();
  assert.equal(row.estimated_hours_hundredths, 800);
  assert.equal(row.status, "reviewed");
  assert.equal(JSON.parse(row.parts_json)[0].quantity_milli, 2000);
  assert.equal(
    ewf.app.db.prepare("SELECT amount_cents FROM quotes").get().amount_cents,
    0
  );
  assert.equal(
    ewf.app.db.prepare("SELECT count(*) n FROM work_orders").get().n,
    0
  );
  const unassigned = await context("ewf-fictional-3"),
    denied = await unassigned.newPage();
  await denied.goto(base + "/sprinkler-desk/1/1");
  await denied.getByText("No active reviewed account mapping").waitFor();
  assert.equal(await denied.getByLabel("Internal notes").count(), 0);
  const customer = await context("ewf-fictional-4"),
    customerPage = await customer.newPage();
  await customerPage.goto(base + "/sprinkler-desk/1/1");
  await customerPage.waitForURL(
    url => !url.pathname.startsWith("/sprinkler-desk")
  );
  assert.equal(await customerPage.getByLabel("Internal notes").count(), 0);
  assert.ok(
    await tech.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    "Mobile viewport fits"
  );
  console.log(
    "PASS: real Inspectra → EWF workflow, 8 total hours, structured parts, immutable submit, office review, return link, account/customer isolation and mobile layout; fictional screenshots saved; no external requests/mail"
  );
} finally {
  await browser?.close();
  if (server && server.exitCode == null) {
    server.kill("SIGTERM");
    await once(server, "exit");
  }
  await ewf.close();
  await db.end();
  await admin.query(`DROP DATABASE \`${database}\``);
  await admin.end();
}
