# ADR 0005 - SQLite/Room for local persistence

**Status:** Accepted

## Context

Workflows, execution traces, agent sessions, and settings must persist on-device. Traces include screenshots, which are large binaries. Workflows run on-device, so there is no server-side store in v1.

## Decision

Use **SQLite (via Room on the Kotlin side)** as the local database.

- Structured records (workflows, traces, sessions, settings) go in SQLite.
- **Large binaries (screenshots) are written to the filesystem** with only references stored in the database.
- **AI provider credentials never go in SQLite.** They go in Android secure storage (Keystore-backed), are never logged, and are never included in prompts.

## Consequences

- **Positive:** reliable, queryable, zero-infrastructure local storage; Room gives compile-time-checked queries and migrations.
- **Positive:** keeping screenshots out of the DB keeps it small and fast.
- **Negative:** two storage locations to keep consistent (DB rows plus files); orphaned files need cleanup.
- **Rule that follows:** secrets are radioactive - secure storage only, never logged, never echoed.
