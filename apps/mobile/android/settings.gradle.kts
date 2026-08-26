pluginManagement {
    // React Native ships its Gradle plugin as source inside node_modules. It is
    // included twice on purpose, mirroring the RN 0.76 template:
    //   - here, so the `com.facebook.react.settings` plugin below resolves;
    //   - again at the bottom of this file, so the root buildscript's
    //     versionless `com.facebook.react:react-native-gradle-plugin` classpath
    //     coordinate is substituted by the included build.
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

rootProject.name = "MobileAutomation"

include(":app")

// Substitutes the versionless react-native-gradle-plugin classpath dependency
// declared in build.gradle.kts. Without this the root buildscript fails with
// "Could not find com.facebook.react:react-native-gradle-plugin:".
includeBuild("../node_modules/@react-native/gradle-plugin")

// The Kotlin automation modules under /android are a separate Gradle build in
// Phase 1 (they are linted and unit-tested on their own). They are wired into
// this app when the Turbo Module bridge is built in Phase 3.
