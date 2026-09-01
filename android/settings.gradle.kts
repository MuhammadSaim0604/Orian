pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "mobile-automation-native"

// One Gradle module per responsibility (see architecture/Monorepo_Structure.md).
include(":accessibility")
include(":automation")
include(":gestures")
include(":screen")
include(":overlays")
include(":tools")

// Phase 3: JSON conversion between the runtime's Kotlin types and the RN bridge.
// Kept separate from :automation so the runtime stays free of wire-format concerns
// and the conversion layer can be unit-tested on its own.
include(":bridge")

// Phase 6: Room-backed persistence for workflows (ADR 0005). Separate from :bridge
// because storage is not an automation concern, and keeping it apart means the
// automation modules do not pull in Room's annotation processor.
include(":storage")

// Step 2: the voice-interaction services that make the app eligible for the
// assistant role. Its own module because it is a declaration-only capability -
// Android builds the assistant picker from installed voice-interaction services,
// so without these the app can never be chosen no matter how it asks.
include(":assistant")

// Step 5: on-device text recognition, the second rung of the perception chain
// (ADR 0013, ADR 0017). Depends on :screen for the bitmap and deliberately not on
// :accessibility - OCR is an independent way of seeing, and coupling the two would
// make the fallback circular: the screens that need OCR are exactly the ones whose
// accessibility tree is empty.
include(":ocr")
