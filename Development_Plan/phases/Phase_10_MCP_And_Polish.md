# Phase 10 — MCP Server, Node Distribution & Polish

**Milestone:** M5 — Platform. **Depends on:** Phases 2, 7. **Unblocks:** external integration & release.

## Goal

Expose the Android tool set over MCP so external agents can drive the phone, finalize third-party node distribution on npm, and harden the product for release.

## Deliverables

- `packages/mcp-server`: MCP server whose tools map to the `tool-sdk` definitions → Agent Tool Gateway → Android Tool Runtime.
- Boundary: `External AI → MCP → Gateway → Android Tool Runtime → Device`, with **authentication** and local-only default binding.
- Finalized node authoring + publishing docs; verified `npm install @your-sdk/android-nodes` / `@developer/custom-nodes` discovery flow.
- Hardening: permission UX, error recovery, foreground-service reliability, battery/performance, crash reporting.
- Release pipeline via GitHub Actions; npm package publishing for the public packages.

## Tasks

1. Implement the MCP server exposing the tool surface; require auth tokens.
2. Implement the Agent Tool Gateway that both MCP and the internal agent route through.
3. Ensure the MCP server does not bind to the network without explicit user action.
4. Finalize and document the third-party node publishing workflow.
5. Polish permission flows and error recovery across the app.
6. Set up npm publishing (public packages) and app release in CI.
7. Performance and battery pass; crash/telemetry (privacy-respecting).

## Definition of done

- An external MCP-capable client authenticates and successfully calls `click`/`getUiTree` on the device.
- Public packages publish to npm; a third-party node installs and registers in the app.
- Release build passes CI and installs on a clean device.

## Security notes (sensitive)

- MCP exposes full device control — require authentication, default to localhost, and make any network exposure an explicit, warned user action. Never ship it open by default.

## Skills to load

These skills are already installed in your AI agent. Load them before starting this phase:

- `mcp-server`
- `monorepo-master`
- `node-sdk-author`
