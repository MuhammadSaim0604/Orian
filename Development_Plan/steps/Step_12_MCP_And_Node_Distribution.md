# Step 12 — MCP Server & Clients, Node Distribution

**Milestone:** M10 — Platform. **Closes:** B5. **Depends on:** Step 5 (so OCR is exposed too).

## Goal

Two directions of the same boundary. **Expose** our device tools over MCP so an external agent can drive the phone, and **consume** external MCP servers so their tools appear in Agent Mode. Then finish npm distribution for the node packages.

## What is wrong today

`packages/mcp-server` is a scaffold. And the plan only ever described one direction — exposing our tools. **B5** is the gap: the user wants to connect external MCP servers and use their tools inside Agent Mode, which is a client, not a server.

Node distribution is close but unfinished: the packages are shaped for publishing and `AUTHORING.md` documents third-party authoring, but nothing has been published and third-party discovery has never been tested against a real package.

## The server

```
External AI → MCP → Agent Tool Gateway → Android Tool Runtime → Device
```

Everything to the right of MCP exists. The tool list must be **generated from `allToolDefinitions()`**, never restated — a hand-maintained list drifts and an external agent ends up calling a tool that does not exist.

**Security is the substance of this step, not a footnote.** This is full device control over a socket.

- **Authentication is mandatory.** No anonymous mode, not even in development.
- **Localhost only by default.** Binding to a network interface takes an explicit user action with an unambiguous warning.
- **Every call validated** through `validateToolCall` before it reaches the device. External input is the case that most needs it.
- **Destructive tools gated.** Every definition carries `impact`; a `write` tool from an external caller needs either a per-session grant or a standing user opt-in.
- **Audit log**, without secrets, so the user can see what an external agent did.

## The client

- Add, edit, and remove MCP server connections in Agent Mode.
- Discover their tools and show them in the tools page alongside built-ins, clearly marked as external.
- Merge them into the agent's advertised tool set, subject to the same per-tool toggle.
- Handle an unreachable server without breaking a run — its tools disappear rather than failing mid-call.

## Node distribution

- Publish `node-sdk`, `workflow-schema`, `core-nodes`, `android-nodes`, `tool-sdk`.
- Version and changelog policy.
- Third-party discovery tested against a real mock package: install, manifest read, schema validation, registration, and the node appearing in the palette.
- `AUTHORING.md` verified by following it to build a node from scratch.

## Tasks

1. Server: transport, session handling, and a tool list generated from `allToolDefinitions()`.
2. Authentication: token generation, storage in the Keystore, and a way for the user to see and revoke it.
3. Bind to localhost. Make the network path a deliberate, warned choice.
4. Route every call through `validateToolCall` and then `invokeTool`. **No second dispatch path to the device.**
5. Impact gating for `write` tools from external callers.
6. Audit log with a viewer in root settings.
7. Client: connection config, tool discovery, and a merged tool list.
8. Show external tools in the tools page, marked, with the same toggles.
9. Make an unreachable server degrade gracefully.
10. npm publishing: versions, changelogs, and a dry run.
11. Build a mock third-party node package and test discovery end to end.
12. Follow `AUTHORING.md` literally and fix what it omits.

## Definition of done

- An external MCP client can list tools and drive the device, authenticated.
- An unauthenticated request is refused.
- The server binds to localhost unless the user explicitly changes it, having been warned.
- The tool list is generated, and a tool added to `tool-sdk` appears over MCP with no MCP change.
- Every call is validated before reaching the device.
- Destructive tools require a grant.
- An external MCP server can be connected and its tools used in Agent Mode.
- An unreachable external server does not break a run.
- The node packages publish; a mock third-party package installs, registers, and appears in the palette.
- `AUTHORING.md` is accurate enough to follow without prior knowledge.

## Notes for the implementer

- **Generate the tool list.** This is the whole reason `tool-sdk` exists as a separate package.
- **One dispatch path.** MCP is the fourth consumer of `invokeTool` after the agent, the engine, and the overlay. A second path to the device is a second place that can behave differently.
- The provider key must never be reachable over MCP, directly or through a tool that echoes settings.
- External tools need to be visibly external in the tools page. A user should never be unsure whether a tool runs on their phone or someone else's server.
- Publishing is not just `npm publish`. The `react-native` entrypoint field on the publishable packages exists so Metro reads source while Node reads `dist` — verify a published tarball still works in both.

## Skills to load

- `mcp-server`
- `monorepo-master`
- `node-sdk-author`
- `testing-quality`
