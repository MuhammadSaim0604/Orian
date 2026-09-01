plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.mobileautomation.automation"
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
    // `api` rather than `implementation`: the automation runtime's public surface
    // exposes types from these modules (UiTree, Selector, Screenshot, Contact,
    // OcrResult), so consumers - the Phase 3 bridge - need them on their compile
    // classpath.
    api(project(":accessibility"))
    api(project(":gestures"))
    api(project(":screen"))
    api(project(":tools"))

    // Step 5: the second rung of the perception chain (ADR 0013). `api` because
    // runOcr returns OcrResult and the bridge has to serialize it.
    api(project(":ocr"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.kotlinx.coroutines.test)

    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.core.ktx)
    androidTestImplementation(libs.androidx.espresso.core)
}
