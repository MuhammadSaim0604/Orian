package com.mobileautomation.storage

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * The local database (ADR 0005).
 *
 * Structured records live here; screenshots are written to the filesystem with only their
 * paths stored, which keeps the database small enough to stay fast. AI provider credentials
 * are **never** here - they belong in the Keystore.
 */
@Database(
    entities = [WorkflowEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class AutomationDatabase : RoomDatabase() {
    abstract fun workflows(): WorkflowDao

    companion object {
        private const val DATABASE_NAME = "mobile_automation.db"

        @Volatile
        private var instance: AutomationDatabase? = null

        /**
         * The single database instance.
         *
         * Room tolerates multiple instances but they do not share an in-memory cache, so two
         * would produce stale reads after a write. Double-checked locking rather than `lazy`
         * because the context is only available at call time.
         */
        fun get(context: Context): AutomationDatabase =
            instance ?: synchronized(this) {
                instance ?: build(context).also { instance = it }
            }

        private fun build(context: Context): AutomationDatabase =
            Room
                .databaseBuilder(
                    context.applicationContext,
                    AutomationDatabase::class.java,
                    DATABASE_NAME,
                )
                // No destructive fallback. Losing a user's saved workflows on a schema change
                // is not an acceptable upgrade path, so every future version must ship a real
                // migration and a missing one should fail loudly in development.
                .build()
    }
}
