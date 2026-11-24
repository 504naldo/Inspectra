# Sealed quote and separate review draft candidate

This is source for review and synthetic test fixtures only. The ordinary
application router, routes/navigation and schema migration journal do not import
or activate this code. The SQL files in this directory are isolated reference
DDL, not migration steps for a live database.

The prospective customer portal presents the exact issuer-sealed PDF to an
authorized named account. Its short-lived receipt token is for the same quote,
account session and PDF digest; it does not prove the reader understood the PDF.
Acceptance neither modifies the legacy quote nor creates an ordinary invoice.

An independently authorized office reviewer may create a nonpayable review draft
by whole accepted quote or one accepted stable line. The same key prevents
overlapping whole/line draft claims. The header, claims, line totals and evidence
are persisted atomically in separate review tables, with exact CAD subtotal, GST
and PST. Review PDF reads recheck sealed and persisted evidence. The resulting
opaque key is not an ordinary invoice ID. No issue, conversion, pay, send or
export action is part of this candidate.

This does not fence legacy invoice writers. Before any activation, review issuer,
customer and reviewer grant lifecycles; stable line identity and legacy writer
coordination; approved database permissions, migrations, retention and recovery;
and browser UX. Do not apply this reference SQL to a production database or enable
fixture flags on an application deployment.
