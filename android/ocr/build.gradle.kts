plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.mobileautomation.ocr"
    compileSdk = 35

    defaultConfig {
        minSdk = 26
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    // The bitmap comes from a captured screenshot, so this module reads what :screen wrote.
    // Deliberately NOT :accessibility - OCR is an independent way of seeing, and depending on
    // the tree would make the perception chain circular (ADR 0017).
    implementation(project(":screen"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.kotlinx.coroutines.android)

    // Bundled, not the play-services variant (ADR 0017). A downloaded model is absent exactly
    // when it is first needed - the moment the accessibility tree came back empty - and needs
    // Play services and a network, which contradicts the reason on-device recognition was
    // chosen. Costs APK size; buys a capability with no third state between working and absent.
    implementation(libs.mlkit.text.recognition)

    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.kotlinx.coroutines.test)

    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.core.ktx)
    androidTestImplementation(libs.androidx.espresso.core)
}
