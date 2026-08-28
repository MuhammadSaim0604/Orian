# Consumer ProGuard rules for the storage module.
#
# Room generates implementations by name at build time; R8 must not rename the
# generated `_Impl` classes or the database fails to open in a release build - a
# failure that appears only in the shrunk APK, never in debug.
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep @androidx.room.Entity class *
-dontwarn androidx.room.paging.**
