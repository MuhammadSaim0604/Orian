# ADR 0010 - APKs are built only in CI, never locally

**Status:** Accepted

## Context

Local Android builds on the development machine are slow, environment-dependent, and produce artifacts that differ from what ships. The project owner has also mandated that no APK is ever built on this machine.

## Decision

**All APK builds and all test runs that require the Android toolchain happen in GitHub Actions.** Never run `gradlew assemble*`, `react-native run-android`, or local emulator builds on the development machine.

CI must build and test both the **debug** and **release** APKs, and upload them as artifacts. After every meaningful chunk of work: commit, push, then verify the run with the `gh` CLI (`gh run list`, `gh run watch`, `gh run view --log-failed`) and fix failures before moving on.

## Consequences

- **Positive:** one reproducible build environment; the artifact that is tested is the artifact that ships.
- **Positive:** CI is the single source of truth for build health.
- **Negative:** the feedback loop for native changes is slower, so Kotlin logic must be covered by JUnit unit tests that do not need a device, with instrumentation tests reserved for device-dependent behaviour.
- **Rule that follows:** device-level verification claims can only be made from CI output or from the owner's own device - never from this machine.
