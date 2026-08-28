buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.7.3")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21")
        // KSP, for Room's code generation in the :storage module. Declared here rather
        // than in the module because a Gradle plugin used by an included project must be
        // on the root buildscript classpath.
        classpath("com.google.devtools.ksp:com.google.devtools.ksp.gradle.plugin:2.0.21-1.0.28")
        // Versionless on purpose: substituted by the `includeBuild` of
        // node_modules/@react-native/gradle-plugin in settings.gradle.kts.
        classpath("com.facebook.react:react-native-gradle-plugin")
    }
}

// Values consumed by the React Native Gradle plugin and the app module.
allprojects {
    repositories {
        google()
        mavenCentral()
    }

    extra["buildToolsVersion"] = "35.0.0"
    extra["minSdkVersion"] = 26
    extra["compileSdkVersion"] = 35
    extra["targetSdkVersion"] = 35
    extra["ndkVersion"] = "27.1.12297006"
    extra["kotlinVersion"] = "2.0.21"
}

apply(plugin = "com.facebook.react.rootproject")
