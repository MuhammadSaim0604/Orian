// Root build file for the shared Kotlin automation modules.
//
// These modules hold the Android OS-integration layer (ADR 0001). They are
// consumed by the React Native application module in `apps/mobile/android`.
//
// Never run assemble tasks locally - APKs are built only in CI (ADR 0010).

plugins {
    id("com.android.library") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jlleitschuh.gradle.ktlint") version "12.1.2" apply false
}

subprojects {
    apply(plugin = "org.jlleitschuh.gradle.ktlint")

    configure<org.jlleitschuh.gradle.ktlint.KtlintExtension> {
        android.set(true)
        ignoreFailures.set(false)
        reporters {
            reporter(org.jlleitschuh.gradle.ktlint.reporter.ReporterType.PLAIN)
        }
        filter {
            exclude { it.file.path.contains("/build/") }
        }
    }
}
