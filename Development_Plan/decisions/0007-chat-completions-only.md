# ADR 0007 - OpenAI-compatible Chat Completions only (v1)

**Status:** Accepted

## Context

The AI agent and the Configure-with-AI overlay both need a model provider. Providers differ widely in protocol (Chat Completions, Responses API, Anthropic Messages, Gemini, local runtimes). Supporting all of them in v1 would spread effort thin before the automation core is proven.

## Decision

Support **OpenAI-compatible Chat Completions only** in v1. The client is configurable by base URL, model name, and API key, so any compatible provider or local gateway works without code changes.

## Consequences

- **Positive:** one protocol to implement and test; a large ecosystem of compatible providers and local servers already speaks it.
- **Positive:** prompts stay provider-agnostic, which keeps `prompt-engine` simple.
- **Negative:** providers that are not Chat Completions-compatible require an adapter, deferred beyond v1.
- **Rule that follows:** provider keys go in Android secure storage and are never logged or placed in prompts.
