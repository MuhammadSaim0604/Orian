# ADR 0009 - Robust selectors over raw coordinates

**Status:** Accepted

## Context

Coordinate-based automation is brittle: it breaks on a different screen size, a different density, a scrolled list, a theme change, or an app update. Storing `{ "action": "click", "x": 421, "y": 832 }` is not a durable automation.

## Decision

Every recorded target stores a **rich element description with a fallback chain**, and the runtime resolves it by priority:

1. `resourceId`
2. accessibility semantics
3. `text` / `contentDescription`
4. structural UI selector
5. relative position
6. coordinates
7. screenshot / vision fallback

Recorded steps also capture the screen `package` and `activity`, plus the full element info (className, bounds) so a selector can be re-derived later. The resolver reports which strategy matched, which aids debugging and trace quality.

## Consequences

- **Positive:** replay survives layout, density, and minor UI changes - the difference between a demo and a product.
- **Positive:** the recorder captures enough context for workflow generation to produce durable nodes.
- **Negative:** more data captured per step and a more complex resolver to implement and test.
- **Rule that follows:** coordinates are a last resort, never the primary target.
