package com.mobileautomation.tools.android

import android.content.Context
import android.provider.ContactsContract
import android.util.Log
import com.mobileautomation.tools.ContactsReader
import com.mobileautomation.tools.PermissionGate
import com.mobileautomation.tools.SensitiveCapability
import com.mobileautomation.tools.model.Contact

/**
 * Reads contacts through `ContactsContract`.
 *
 * Guarded by the permission gate on every call rather than once at construction:
 * the user can revoke contacts access at any time, and a stale check would turn
 * into a `SecurityException` in the middle of a workflow.
 *
 * Queries project only the columns needed and are always bounded, because address
 * books can be very large and this data is highly sensitive.
 */
class AndroidContactsReader(
    private val context: Context,
    private val permissionGate: PermissionGate,
) : ContactsReader {
    override fun getContacts(limit: Int): List<Contact> = query(selectionQuery = null, limit = limit)

    override fun findContacts(
        query: String,
        limit: Int,
    ): List<Contact> {
        val needle = query.trim()
        if (needle.isEmpty()) return emptyList()
        return query(selectionQuery = needle, limit = limit)
    }

    private fun query(
        selectionQuery: String?,
        limit: Int,
    ): List<Contact> {
        require(limit > 0) { "limit must be positive, was $limit" }
        permissionGate.requireGranted(SensitiveCapability.CONTACTS)

        val projection =
            arrayOf(
                ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY,
                ContactsContract.CommonDataKinds.Phone.NUMBER,
            )

        val selection =
            selectionQuery?.let { "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY} LIKE ?" }
        val selectionArgs = selectionQuery?.let { arrayOf("%$it%") }

        // Grouped by contact id: one contact has a row per phone number, and the
        // caller wants one entry with several numbers.
        val byContact = LinkedHashMap<String, Contact>()

        return runCatching {
            context.contentResolver
                .query(
                    ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                    projection,
                    selection,
                    selectionArgs,
                    "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY} ASC",
                )?.use { cursor ->
                    val idColumn = cursor.getColumnIndexOrThrow(projection[0])
                    val nameColumn = cursor.getColumnIndexOrThrow(projection[1])
                    val numberColumn = cursor.getColumnIndexOrThrow(projection[2])

                    while (cursor.moveToNext() && byContact.size <= limit) {
                        val id = cursor.getString(idColumn) ?: continue
                        val name = cursor.getString(nameColumn) ?: continue
                        val number = cursor.getString(numberColumn)

                        val existing = byContact[id]
                        byContact[id] =
                            if (existing == null) {
                                Contact(id, name, listOfNotNull(number))
                            } else {
                                existing.copy(
                                    phoneNumbers =
                                        (existing.phoneNumbers + listOfNotNull(number)).distinct(),
                                )
                            }
                    }
                }

            byContact.values.take(limit)
        }.getOrElse { error ->
            Log.e(TAG, "Contacts query failed", error)
            emptyList()
        }
    }

    private companion object {
        const val TAG = "AndroidContactsReader"
    }
}
