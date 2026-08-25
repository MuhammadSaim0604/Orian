---
name: mcp-server
description: Expose the Android device tool set over the Model Context Protocol so external AI agents can drive the phone. Use when building or securing the MCP server and its tool gateway.
---

# Skill: MCP Server (Exposing Device Tools)

## When to use

You are exposing the Android tool set over the Model Context Protocol so external AI systems can drive the phone. Used in Phase 10.

## Principles

- **Clean boundary.** `External AI → MCP → Agent Tool Gateway → Android Tool Runtime → Device`. External agents use the phone without knowing the internal workflow engine.
- **Reuse tool definitions.** MCP tools map directly to the `tool-sdk` definitions the internal agent uses — one source of truth.
- **Secure by default (sensitive).** MCP exposes full device control. Require authentication, bind to localhost by default, and make any network exposure an explicit, warned user action. Never ship it open.

## Structure

```
packages/mcp-server/
├── server.ts          # MCP protocol server
├── gateway.ts         # Agent Tool Gateway → Android Tool Runtime
├── auth.ts            # token/auth enforcement
└── tools.ts           # map tool-sdk defs → MCP tool registrations
```

## Procedure

1. **Implement the MCP server** using the standard MCP SDK; register tools from `tool-sdk` (name, description, args schema, returns).
2. **Agent Tool Gateway**: a single chokepoint that both the internal agent and MCP route through to reach the Android Tool Runtime. Centralizes validation, logging, and authorization.
3. **Authentication**: require an auth token for every session/tool call; reject unauthenticated clients.
4. **Binding**: default to localhost only. Exposing to the network requires an explicit user action with a clear warning about the risk of full device control.
5. **Validation**: validate tool args (Zod, from `tool-sdk`) before dispatching to the device.
6. **Observability**: log tool invocations (without secrets) for auditing.

## Security notes (sensitive)

- This grants a remote client the ability to click, type, read the screen, read contacts, etc. Treat it as a high-risk surface.
- Authentication is mandatory; there is no anonymous mode.
- Do not enable network exposure silently — always gate behind explicit, informed user consent.

## Checklist

- [ ] MCP tools generated from `tool-sdk` definitions.
- [ ] All calls route through the Agent Tool Gateway.
- [ ] Authentication enforced on every call; no anonymous access.
- [ ] Localhost-only by default; network exposure requires explicit consent + warning.
- [ ] Tool args validated before dispatch.
- [ ] Invocations logged without leaking secrets.
- [ ] An external MCP client can authenticate and call `getUiTree`/`click` on a device.
