import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";
import {
  buildSchemaContract,
  checkSchemaContract,
} from "../server/schemaContract";

/** No ambient DATABASE_URL fallback, dotenv loading, migrations, or startup imports. */
export async function runSchemaContractCli(args: string[]): Promise<number> {
  if (
    args.length !== 2 ||
    !["--database-url", "--database-url-env"].includes(args[0])
  ) {
    console.error(
      "Usage: tsx scripts/checkSchemaContract.ts --database-url-env <explicit variable name> (preferred), or --database-url <explicit MySQL URL>"
    );
    return 2;
  }
  try {
    // Explicitly naming an environment variable avoids putting credentials in argv.
    // Never fall back to DATABASE_URL or load a local dotenv file implicitly.
    const connectionUrl =
      args[0] === "--database-url-env"
        ? /^[A-Za-z_][A-Za-z0-9_]*$/.test(args[1])
          ? process.env[args[1]]
          : undefined
        : args[1];
    if (!connectionUrl) throw new Error("Missing explicit connection URL");
    const url = new URL(connectionUrl);
    if (
      url.protocol !== "mysql:" ||
      !url.hostname ||
      url.pathname.length <= 1 ||
      url.search ||
      url.hash ||
      connectionUrl.includes("?") ||
      connectionUrl.includes("#")
    )
      throw new Error("Invalid URL");
    const database = decodeURIComponent(url.pathname.slice(1));
    const contract = buildSchemaContract();
    // Never pass URL query options to mysql2: they can override the validated
    // destination, enable debug logging, or select a local socket.
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const loopback = ["localhost", "127.0.0.1", "::1"].includes(
      host.toLowerCase()
    );
    // Remote metadata connections always verify TLS. Install the server CA using
    // normal trusted-CA operator setup; never disable verification or downgrade.
    const connection = await mysql.createConnection({
      host,
      ...(!loopback ? { ssl: { rejectUnauthorized: true } } : {}),
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database,
      connectTimeout: 10_000,
      multipleStatements: false,
      debug: false,
    });
    const report = await checkSchemaContract(
      {
        async query(sql, parameters) {
          const [rows] = await connection.query(
            { sql, timeout: 15_000 },
            parameters
          );
          return rows;
        },
        async end() {
          // Metadata-only session: close the socket immediately, even on timeout.
          connection.destroy();
        },
      },
      database,
      contract
    );
    console.log(JSON.stringify(report, null, 2));
    return report.status === "compatible"
      ? 0
      : report.status === "unknown"
        ? 2
        : 1;
  } catch {
    console.error(
      JSON.stringify({
        status: "unknown",
        findings: [{ severity: "unknown", code: "schema_contract_unverified" }],
      })
    );
    return 2;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await runSchemaContractCli(process.argv.slice(2));
}
