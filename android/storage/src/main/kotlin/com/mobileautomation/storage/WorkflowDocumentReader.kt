package com.mobileautomation.storage

/**
 * Reading enough of a workflow document to fill the queryable columns.
 *
 * Hand-rolled rather than using `org.json`, which is stubbed in JVM unit tests and returns
 * defaults instead of failing - the same reason `android/bridge` hand-rolls its JSON. That
 * makes this class testable off-device, which matters because a parser that silently returns
 * zero for `nodeCount` would show every saved workflow as empty.
 *
 * Deliberately shallow: it reads three fields and does not attempt to understand the
 * document. Validation is TypeScript's job, and duplicating it here would create a second
 * definition of what a valid workflow is.
 */
object WorkflowDocumentReader {
    /** The `metadata.name`, or a fallback so a list row is never blank. */
    fun readName(document: String): String = readStringField(document, "name") ?: "Untitled workflow"

    fun readDescription(document: String): String? = readStringField(document, "description")

    /**
     * Counts entries in the `nodes` array.
     *
     * Counts top-level `"id"` keys inside the array's bracket span rather than parsing, which
     * is enough for a list badge and cannot be thrown off by a node config containing the word
     * "nodes".
     */
    fun readNodeCount(document: String): Int {
        val arrayStart = findArrayStart(document, "nodes") ?: return 0

        var depth = 0
        var inString = false
        var escaped = false
        var count = 0
        var index = arrayStart

        while (index < document.length) {
            val char = document[index]

            if (escaped) {
                escaped = false
                index++
                continue
            }

            when {
                char == '\\' -> escaped = true
                char == '"' && !inString -> inString = true
                char == '"' && inString -> inString = false
                inString -> Unit
                char == '[' || char == '{' -> {
                    depth++
                    // An object opening at depth 2 is one element of the nodes array.
                    if (char == '{' && depth == 2) count++
                }
                char == ']' || char == '}' -> {
                    depth--
                    if (depth == 0) return count
                }
            }

            index++
        }

        return count
    }

    /** The first `"key": "value"` at any depth. Adequate because both keys are unique here. */
    private fun readStringField(
        document: String,
        key: String,
    ): String? {
        val marker = "\"$key\""
        val keyIndex = document.indexOf(marker)
        if (keyIndex == -1) return null

        var index = keyIndex + marker.length

        while (index < document.length && document[index] != ':') index++
        index++

        while (index < document.length && document[index].isWhitespace()) index++

        if (index >= document.length || document[index] != '"') return null
        index++

        val builder = StringBuilder()

        while (index < document.length) {
            val char = document[index]

            if (char == '\\' && index + 1 < document.length) {
                // Unescaped so a name containing a quote round-trips rather than truncating.
                builder.append(unescape(document[index + 1]))
                index += 2
                continue
            }

            if (char == '"') return builder.toString()

            builder.append(char)
            index++
        }

        return null
    }

    private fun unescape(char: Char): Char =
        when (char) {
            'n' -> '\n'
            't' -> '\t'
            'r' -> '\r'
            else -> char
        }

    private fun findArrayStart(
        document: String,
        key: String,
    ): Int? {
        val marker = "\"$key\""
        val keyIndex = document.indexOf(marker)
        if (keyIndex == -1) return null

        var index = keyIndex + marker.length

        while (index < document.length && document[index] != '[') {
            // Not an array: the key was something else with the same name.
            if (document[index] == '{' || document[index] == ',') return null
            index++
        }

        return if (index < document.length) index else null
    }
}
