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
 *
 * Version 3 adds chat sessions, their messages, and the provider registry (Step 4). The provider table
 * holds base URL, label and model list only: the key stays in the Keystore under an alias derived from
 * the provider id, so this file can be backed up or inspected without exposing a credential.
 */
@Database(
    entities = [
        WorkflowEntity::class,
        TraceEntity::class,
        ChatSessionEntity::class,
        ChatMessageEntity::class,
        ProviderEntity::class,
    ],
    version = 3,
    exportSchema = false,
)
abstract class AutomationDatabase : RoomDatabase() {
    abstract fun workflows(): WorkflowDao

    abstract fun traces(): TraceDao

    abstract fun chatSessions(): ChatSessionDao

    abstract fun providers(): ProviderDao

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
                ).addMigrations(MIGRATION_1_2, MIGRATION_2_3)
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

        /**
         * Adds chat sessions, messages, and the provider registry (Step 4).
         *
         * Hand-written, like MIGRATION_1_2, because someone upgrading has workflows and recorded runs
         * they expect to still be there.
         *
         * Two details the Room schema validator will reject if they drift, and which are easy to get
         * subtly wrong by hand:
         *
         * - **The index names must match what Room generates**, `index_<table>_<col>_<col>`, or the
         *   post-migration validation fails with a schema mismatch on the next open.
         * - **`NOT NULL` and the foreign key clause must match the entity exactly**, including
         *   `ON DELETE CASCADE` and `DEFERRABLE INITIALLY DEFERRED`, which Room always emits.
         */
        private val MIGRATION_2_3 =
            object : Migration(2, 3) {
                override fun migrate(connection: SupportSQLiteDatabase) {
                    connection.execSQL(
                        """
                        CREATE TABLE IF NOT EXISTS `chat_sessions` (
                            `id` TEXT NOT NULL,
                            `mode` TEXT NOT NULL,
                            `title` TEXT NOT NULL,
                            `created_at` INTEGER NOT NULL,
                            `updated_at` INTEGER NOT NULL,
                            PRIMARY KEY(`id`)
                        )
                        """.trimIndent(),
                    )
                    connection.execSQL(
                        "CREATE INDEX IF NOT EXISTS `index_chat_sessions_mode_updated_at` " +
                            "ON `chat_sessions` (`mode`, `updated_at`)",
                    )

                    connection.execSQL(
                        """
                        CREATE TABLE IF NOT EXISTS `chat_messages` (
                            `id` TEXT NOT NULL,
                            `session_id` TEXT NOT NULL,
                            `role` TEXT NOT NULL,
                            `text` TEXT NOT NULL,
                            `detail` TEXT,
                            `run_id` TEXT,
                            `created_at` INTEGER NOT NULL,
                            PRIMARY KEY(`id`),
                            FOREIGN KEY(`session_id`) REFERENCES `chat_sessions`(`id`)
                                ON UPDATE NO ACTION ON DELETE CASCADE
                        )
                        """.trimIndent(),
                    )
                    connection.execSQL(
                        "CREATE INDEX IF NOT EXISTS `index_chat_messages_session_id_created_at` " +
                            "ON `chat_messages` (`session_id`, `created_at`)",
                    )

                    connection.execSQL(
                        """
                        CREATE TABLE IF NOT EXISTS `ai_providers` (
                            `id` TEXT NOT NULL,
                            `label` TEXT NOT NULL,
                            `base_url` TEXT NOT NULL,
                            `model` TEXT,
                            `models` TEXT,
                            `models_fetched_at` INTEGER,
                            `is_active` INTEGER NOT NULL,
                            `created_at` INTEGER NOT NULL,
                            PRIMARY KEY(`id`)
                        )
                        """.trimIndent(),
                    )
                }
            }
    }
}
