# 0017 — On-device OCR, bundled rather than downloaded

**Status:** accepted. **Refines:** [0013](0013-perception-fallback-chain.md).

## Context

ADR 0013 established the perception chain — accessibility tree, then OCR, then vision — and said OCR must be on-device. It did not say which engine, or how the model reaches the phone. Both turn out to matter.

Some apps expose almost nothing through the accessibility tree: games, canvas-rendered interfaces, WebViews that never set semantics, apps that draw their own controls. On those screens the agent is blind and no workflow can be built. That is issue **F1**, and it is the gap OCR exists to close.

Three decisions sit inside "on-device OCR": whether the recognition runs locally at all, which engine does it, and whether the model ships in the APK or is fetched on first use.

## Decision

**On-device text recognition via ML Kit, with the model bundled in the APK.**

Three separate choices, each with a reason:

### Recognition runs on the phone

A cloud OCR service would be smaller, more accurate, and would break the product's central privacy promise: **screen content leaves the phone only for the provider the user configured, and only for a call they triggered.**

OCR is not a call the user triggers. It happens inside the perception chain, potentially on every step of a run, over whatever is on screen at the time — their messages, their bank balance, their photos. Sending that to a third party the user never chose is not a tradeoff to weigh; it is a different product from the one described in the permission rationale. So it is off the table regardless of accuracy.

This also keeps the promise auditable. "OCR never touches the network" is a claim a reader can verify by looking at the module's dependencies. "OCR uses a service that only retains data for 24 hours" is not.

### ML Kit rather than Tesseract or a hand-rolled model

ML Kit's text recognition is the standard answer on Android and it is the right one here for practical reasons rather than ideological ones: it is maintained by the platform vendor, it handles rotation and multi-line blocks, and it returns **bounding boxes with the text** — which is the whole requirement. Recognised text without coordinates is useless to us, since the point is to tap it.

Tesseract via NDK would work and would avoid a Google dependency, but it needs its own build, its own trained data, and gives noticeably worse results on phone screenshots without tuning. The cost is real and the benefit is philosophical.

### The model is bundled, not downloaded on demand

ML Kit offers both: `text-recognition` bundles the model into the APK, `text-recognition-*-play-services` fetches it through Google Play services on first use.

Bundling costs a few megabytes of APK size. Downloading costs **correctness of the failure mode**, which is the deciding factor:

- A downloaded model is not there the first time it is needed. The first OCR call on a fresh install fails, or blocks on a network fetch — and the moment OCR is first needed is precisely a moment when the agent is already struggling with a screen it cannot read. Turning "the tree was empty" into "the tree was empty and the fallback is still downloading" makes a bad situation opaque.
- It requires Play services. Devices without them — de-Googled ROMs, some regional variants — would silently lose the second rung of the perception chain, and the app would report it as an OCR failure rather than as an absent capability.
- It needs the network, which contradicts the reason we chose on-device recognition. An OCR path that requires connectivity to *initialise* is only privacy-preserving, not offline-capable, and users will reasonably assume both.

A capability that exists on some installs and not others is worse than one that costs megabytes. Bundling means **OCR either works on this device or the device cannot run the app at all** — no third state.

## Consequences

- **APK grows.** Acceptable, and the alternative was a fallback that is missing exactly when it is needed.
- **`android/ocr` depends on `screen`, for the bitmap, and must not depend on `accessibility`.** OCR is an independent way of seeing; making it depend on the tree would make the fallback chain circular and would mean an app with no accessibility output could not be OCR'd, which is the only case that matters.
- **Coordinate space is now a correctness concern.** A screenshot may be scaled relative to the accessibility tree's coordinates, so every recognised box has to be transformed before it can be tapped. Get this wrong and every OCR tap lands slightly off — and it fails *silently*, reporting success. The transform lives in one place for that reason.
- **Fuzzy matching is mandatory, not a nicety.** OCR reads `l` as `1` and `O` as `0`, so an exact match fails on text a human reads without noticing. Any matcher that only compares strings exactly will appear to work in tests and fail on real screens.
- **OCR must not become the default path.** It is slower than a tree read and its matches are less durable, so the prompt states the chain in order with its costs. A model told only that OCR exists will reach for it first, because it is the most powerful-sounding thing mentioned.
- **No network permission is added for OCR.** If a future change needs one, that is the signal this decision has been reversed by accident.
