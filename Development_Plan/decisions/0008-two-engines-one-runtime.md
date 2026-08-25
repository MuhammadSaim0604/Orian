# ADR 0008 - Two engines, one shared Android Tool Runtime

**Status:** Accepted

## Context

The product has two automation layers: an autonomous **AI Agent** (goal, plan, observe, act, replan) and a **Workflow Engine** (n8n-style node DAG). A tempting simplification is to implement the agent as a workflow that builds itself, or to make workflow nodes agent steps.

## Decision

Keep the two engines **completely separate**, and have both call the **identical Android Tool Runtime**.

```
AI Agent Engine        Workflow Engine
       \                    /
        Android Tool Runtime
                 |
              Kotlin
```

The agent calls `click()`, `swipe()`, `findElement()`, `getUiTree()`, `takeScreenshot()`, `typeText()`, `openApp()`, `getContacts()`, `createAlarm()`, and so on. Workflow nodes call the exact same functions.

## Consequences

- **Positive:** each engine stays comprehensible; the agent's non-determinism never leaks into deterministic workflow execution.
- **Positive:** one tool surface to implement, test, secure, and expose over MCP.
- **Positive:** an execution trace from the agent can be compiled into a workflow precisely because both speak the same tool vocabulary.
- **Negative:** some duplicated orchestration logic (retries, error handling) in both engines.
- **Rule that follows:** the two engines must never merge, and neither may bypass the shared runtime.
