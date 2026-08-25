pluginManagement {
    // React Native ships its own settings plugin from node_modules. pnpm links
    // it into the app's node_modules, so this relative path resolves.
    includeBuild("../node_modules/@react-native/gradle-plugin")

    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    id("com.facebook.react.settings")
}

extensions.configure<com.facebook.react.ReactSettingsExtension> {
    autolinkLibrariesFromCommand()
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven { url = uri("../node_modules/react-native/android") }
    }
}

rootProject.name = "MobileAutomation"

include(":app")

// The Kotlin automation modules under /android are a separate Gradle build in
// Phase 1 (they are linted and unit-tested on their own). They are wired into
// this app when the Turbo Module bridge is built in Phase 3.
