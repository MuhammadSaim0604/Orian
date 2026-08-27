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
