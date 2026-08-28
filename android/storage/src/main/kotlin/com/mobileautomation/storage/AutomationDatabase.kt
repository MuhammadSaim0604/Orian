package com.mobileautomation.storage

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * The local database (ADR 0005).
 *
 * Structured records live here; screenshots are written to the filesystem with only their
 * paths stored, which keeps the database small enough to stay fast. AI provider credentials
 * are **never** here - they belong in the Keystore.
 */
@Database(
    entities = [WorkflowEntity::class, TraceEntity::class],
    version = 2,
    exportSchema = false,
)
abstract class AutomationDatabase : RoomDatabase() {
    abstract fun workflows(): WorkflowDao

    abstract fun traces(): TraceDao

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
                ).addMigrations(MIGRATION_1_2)
                // No destructive fallback. Losing a user's saved workflows on a schema change
                // is not an acceptable upgrade path, so every version must ship a real
                // migration and a missing one should fail loudly in development.
                .build()

        /**
         * Adds the traces table.
         *
         * Written by hand rather than falling back to a destructive migration, because someone
         * upgrading has workflows they built and expect to still be there.
         */
        private val MIGRATION_1_2 =
            object : Migration(1, 2) {
                override fun migrate(connection: SupportSQLiteDatabase) {
                    connection.execSQL(
                        """
                        CREATE TABLE IF NOT EXISTS `traces` (
                            `id` TEXT NOT NULL,
                            `run_id` TEXT NOT NULL,
                            `goal` TEXT NOT NULL,
                            `outcome` TEXT NOT NULL,
                            `step_count` INTEGER NOT NULL,
                            `document` TEXT NOT NULL,
                            `screenshot_dir` TEXT,
                            `recorded_at` INTEGER NOT NULL,
                            PRIMARY KEY(`id`)
                        )
                        """.trimIndent(),
                    )
                    // Indexed because the list screen orders by it, and a full scan on every
                    // open would get slower with every run the user records.
                    connection.execSQL(
                        "CREATE INDEX IF NOT EXISTS `index_traces_recorded_at` ON `traces` (`recorded_at`)",
                    )
                }
            }
    }
}
