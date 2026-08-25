buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.7.3")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21")
        classpath("com.facebook.react:react-native-gradle-plugin")
    }
}

// Values consumed by the React Native Gradle plugin and the app module.
allprojects {
    extra["buildToolsVersion"] = "35.0.0"
    extra["minSdkVersion"] = 26
    extra["compileSdkVersion"] = 35
    extra["targetSdkVersion"] = 35
    extra["ndkVersion"] = "27.1.12297006"
    extra["kotlinVersion"] = "2.0.21"
}
