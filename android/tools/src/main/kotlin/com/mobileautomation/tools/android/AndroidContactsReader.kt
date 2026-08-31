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

    /**
     * Whether [query] is being used to search for a number rather than a name.
     *
     * Digits, spaces and the punctuation phone numbers are written with. "Robert" is a name; "+44 7700"
     * is not, and matching it against `DISPLAY_NAME` would return nothing.
     */
    private fun looksLikeNumber(query: String): Boolean =
        query.any { it.isDigit() } && query.all { it.isDigit() || it in NUMBER_PUNCTUATION }

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
            selectionQuery?.let {
                // Name **or** number. The tool is documented as searching either, and the schema lets the
                // model pass a number - but the query only ever matched DISPLAY_NAME, so a lookup by
                // number returned nothing and read as "that contact does not exist".
                //
                // NORMALIZED_NUMBER is matched as well as NUMBER because the stored form carries the
                // user's own formatting - "(555) 010-1234" never contains the digits "5550101234".
                "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY} LIKE ? OR " +
                    "${ContactsContract.CommonDataKinds.Phone.NUMBER} LIKE ? OR " +
                    "${ContactsContract.CommonDataKinds.Phone.NORMALIZED_NUMBER} LIKE ?"
            }

        val selectionArgs =
            selectionQuery?.let {
                val digits = it.filter(Char::isDigit)

                // A number search matches on digits only, so the user's punctuation does not have to be
                // reproduced exactly. A name search passes the query through for the number columns too,
                // which costs nothing and catches a contact saved with its number as its name.
                val numberNeedle = if (looksLikeNumber(it) && digits.isNotEmpty()) digits else it

                arrayOf("%$it%", "%$numberNeedle%", "%$numberNeedle%")
            }

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

        /** Characters people write phone numbers with, none of which appear in the stored digits. */
        val NUMBER_PUNCTUATION = setOf('+', '-', ' ', '(', ')', '.')
    }
}
