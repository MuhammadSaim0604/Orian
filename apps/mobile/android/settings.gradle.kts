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

// Phase 3: the Kotlin automation modules under /android become part of the app
// build so the bridge can depend on them.
//
// Included by path rather than as a composite build (`includeBuild`), because a
// composite build would need dependency substitution for every module and would
// stop `gradle :accessibility:test` working from the /android directory. They
// remain a standalone build there for lint and unit tests; this build simply
// mounts the same directories.
dependencyResolutionManagement {
    versionCatalogs {
        create("libs") {
            from(files("../../../android/gradle/libs.versions.toml"))
        }
    }
}

val nativeModules =
    listOf(
        "accessibility",
        "assistant",
        "gestures",
        "screen",
        "overlays",
        "tools",
        "automation",
        "bridge",
        "storage",
    )

for (module in nativeModules) {
    include(":$module")
    project(":$module").projectDir = file("../../../android/$module")
}
