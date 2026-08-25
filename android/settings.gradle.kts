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
