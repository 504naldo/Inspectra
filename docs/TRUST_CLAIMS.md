# Trust & Compliance Claims Policy

**Status:** active · **Last reviewed:** 2026-06-30

This document governs what security/compliance language Inspectra may publish. It
exists because marketing and product copy must not assert certifications or
guarantees that the repository cannot evidence.

## Rule

**Do not publish a formal certification or compliance guarantee unless documentary
evidence (an audit report, certificate, or attestation) exists inside this
repository or an authoritative linked source.** When in doubt, describe what the
software *does*, not what it *is certified* to be.

## Claims removed / not present

The full marketing site (which historically carried promotional claims) now lives
in its own repository (`504naldo/inspectra-website`) and was removed from this app
(see `refactor: separate app entry from marketing site`). A repository scan on
2026-06-30 found **no** instances of the following in shipped app/server code:

- SOC 2 / SOC 2 Type II
- ISO 27001
- PCI / PCI-DSS
- HIPAA
- "NFPA compliant" / "NFPA certified"
- "code compliant" / "certified compliance" / "guaranteed compliance" / "fully compliant"
- "production-ready 3D"
- "formally audited security", "bank-level"/"military-grade" security

(References to NFPA 25 / CAN/ULC-S536 etc. are **standard names** used to label
inspection checklists — not certification claims — and are retained.)

## Changes made in this pass

| Location | Before | After |
|---|---|---|
| `client/index.html` meta description | "Professional fire safety inspection and **compliance management system**" | "Inspection and service management for fire protection teams" |

## Reviewed and kept (acceptable)

| Location | Text | Rationale |
|---|---|---|
| `client/src/pages/Login.tsx` | "Encrypted & secure" | Accurate: traffic is TLS-encrypted and sessions use signed JWTs. Not a certification claim. |
| Inspection checklists | "CAN/ULC-S536", "NFPA 25" | Standard/document names identifying the checklist, not a claim of certification. |

## Approved wording

Use language that describes capability, not certification:

- "Designed for fire protection workflows"
- "Supports fire protection inspection and service processes"
- "Role-based access controls"
- "Security capabilities continue to evolve"
- "In development" (for features not yet complete)

## Claims requiring future verification before publishing

These must NOT be published until evidence is added to the repo:

- Any third-party security certification (SOC 2, ISO 27001, PCI, HIPAA).
- "Audited" security posture (no formal audit report is in-repo).
- Quantified availability/uptime guarantees.
- "Compliant" with a specific code/standard as a guarantee (vs. "supports
  inspections aligned to <standard>").

If such evidence is added, link it from this file and from the publishing surface.
