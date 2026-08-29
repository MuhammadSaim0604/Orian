plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.facebook.react")
}

/**
 * Release signing.
 *
 * CI signs the release APK with a keystore supplied through secrets. When those
 * secrets are absent (for example on a fork), the release build falls back to
 * the debug key so the build still verifies - it is simply not distributable.
 */
val releaseStoreFile: String? = System.getenv("ANDROID_KEYSTORE_PATH")
val releaseStorePassword: String? = System.getenv("ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias: String? = System.getenv("ANDROID_KEY_ALIAS")
val releaseKeyPassword: String? = System.getenv("ANDROID_KEY_PASSWORD")
val hasReleaseSigning = !releaseStoreFile.isNullOrBlank() && file(releaseStoreFile).exists()

android {
    namespace = "com.mobileautomation"
    compileSdk = rootProject.extra["compileSdkVersion"] as Int
    buildToolsVersion = rootProject.extra["buildToolsVersion"] as String
    ndkVersion = rootProject.extra["ndkVersion"] as String

    defaultConfig {
        applicationId = "com.mobileautomation"
        minSdk = rootProject.extra["minSdkVersion"] as Int
        targetSdk = rootProject.extra["targetSdkVersion"] as Int
        versionCode = 1
        versionName = "0.1.0"
    }

    signingConfigs {
        // AGP provides a "debug" config backed by the auto-generated debug
        // keystore, so no keystore is committed to the repository.
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseStoreFile!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = false
        }
        getByName("release") {
            signingConfig =
                if (hasReleaseSigning) {
                    signingConfigs.getByName("release")
                } else {
                    signingConfigs.getByName("debug")
                }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources.excludes.add("META-INF/**")
    }
}

react {
    root = file("../..")
    reactNativeDir = file("../../node_modules/react-native")
    codegenDir = file("../../node_modules/@react-native/codegen")
    cliFile = file("../../node_modules/react-native/cli.js")
    autolinkLibrariesWithApp()
}

dependencies {
    implementation("com.facebook.react:react-android")
    implementation("com.facebook.react:hermes-android")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")

    // Phase 3: the Kotlin automation layer. `:bridge` exposes `:automation`
    // transitively via `api`, which in turn exposes the five capability modules,
    // so this single line brings in the whole native runtime.
    implementation(project(":bridge"))

    // Phase 6: Room-backed workflow persistence (ADR 0005).
    implementation(project(":storage"))

    // Phase 8: the Configure-with-AI floating window. Declared explicitly because
    // `:overlays` is deliberately not part of `:automation`'s `api` surface - the
    // automation runtime does not draw windows, and coupling them would make every
    // consumer of the runtime depend on the overlay layer.
    implementation(project(":overlays"))

    // Step 2: the voice-interaction services that put the app in Android's digital
    // assistant picker. Declared here rather than through `:automation` because it
    // contributes only a manifest and three services - nothing in the runtime calls
    // into it, and the runtime should not depend on a declaration-only module.
    implementation(project(":assistant"))

    testImplementation("junit:junit:4.13.2")
}
