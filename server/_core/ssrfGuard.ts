// SSRF guard for server-side fetches of URLs that originate from stored data
// (attachment fileUrl, company logoUrl, etc.). Several of those fields are
// accepted as free-text input from authenticated users and later fetched by
// the server (Excel import, PDF image embedding) — without this check, a
// user could point one at an internal service or the cloud metadata endpoint
// (169.254.169.254) and have the server fetch it on their behalf.
//
// This only blocks private/reserved IP ranges; it does not pin the resolved
// IP for the subsequent fetch, so a DNS-rebinding attacker (public IP at
// check time, private IP at request time) is not defended against. That's
// an accepted gap for this internal, authenticated-user threat model.

import dns from "node:dns/promises";
import net from "node:net";

function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // shared/CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("::ffff:")) return isPrivateOrReservedIp(lower.slice(7));
    return false;
  }
  return true; // not a recognizable IP — fail closed
}

/** Throws if the URL isn't http(s), or resolves to a private/internal/reserved address. */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must use http or https");
  }

  const hostname = parsed.hostname;
  if (hostname === "localhost") {
    throw new Error("URL resolves to a private or internal address");
  }
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error("URL resolves to a private or internal address");
    }
    return;
  }

  const records = await dns.lookup(hostname, { all: true });
  if (records.some((r) => isPrivateOrReservedIp(r.address))) {
    throw new Error("URL resolves to a private or internal address");
  }
}
