# ML Kit's text recogniser is reached reflectively through its own initialisation provider, so
# its model classes must survive shrinking. Without this the release APK builds and then fails at
# the first OCR call - a failure that only appears in a release build, which is the worst place
# for it to appear.
-keep class com.google.mlkit.vision.text.** { *; }
-keep class com.google.mlkit.vision.common.** { *; }
