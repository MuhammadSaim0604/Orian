package com.mobileautomation.bridge

/**
 * A minimal JSON object reader.
 *
 * Deliberately hand-rolled and deliberately limited: it reads a flat-ish object
 * into typed accessors, which is all the bridge's argument shapes need. `org.json`
 * returns default values under Android JVM unit tests, so using it would leave the
 * conversion layer untestable off-device, and pulling in kotlinx-serialization for
 * one wire format would be disproportionate.
 *
 * Supports objects, nested objects, string/number/boolean values, arrays of
 * numbers, and string maps. Anything else is reported as absent rather than
 * guessed at.
 */
object JsonReader {
    /** Typed access to one JSON object's fields. */
    class Fields internal constructor(
        private val values: Map<String, Any?>,
    ) {
        val keys: Set<String> get() = values.keys

        fun has(name: String): Boolean = values.containsKey(name)

        /** A string field, or null when absent, null, or blank. */
        fun string(name: String): String? = (values[name] as? String)?.takeIf { it.isNotBlank() }

        fun int(name: String): Int? =
            when (val value = values[name]) {
                is Int -> value
                is Long -> value.toInt()
                is Double -> value.toInt()
                is String -> value.toIntOrNull()
                else -> null
            }

        fun long(name: String): Long? =
            when (val value = values[name]) {
                is Long -> value
                is Int -> value.toLong()
                is Double -> value.toLong()
                is String -> value.toLongOrNull()
                else -> null
            }

        fun double(name: String): Double? =
            when (val value = values[name]) {
                is Double -> value
                is Int -> value.toDouble()
                is Long -> value.toDouble()
                is String -> value.toDoubleOrNull()
                else -> null
            }

        fun boolean(name: String): Boolean? =
            when (val value = values[name]) {
                is Boolean -> value
                is String -> value.toBooleanStrictOrNull()
                else -> null
            }

        @Suppress("UNCHECKED_CAST")
        fun nested(name: String): Fields? = (values[name] as? Map<String, Any?>)?.let { Fields(it) }

        fun intArray(name: String): List<Int>? =
            (values[name] as? List<*>)?.mapNotNull { element ->
                when (element) {
                    is Int -> element
                    is Long -> element.toInt()
                    is Double -> element.toInt()
                    is String -> element.toIntOrNull()
                    else -> null
                }
            }

        @Suppress("UNCHECKED_CAST")
        fun stringMap(name: String): Map<String, String>? =
            (values[name] as? Map<String, Any?>)
                ?.mapNotNull { (key, value) -> (value as? String)?.let { key to it } }
                ?.toMap()
    }

    /** Reads a JSON object, or null when the text is not one. */
    fun readObject(json: String): Fields? {
        val parser = Parser(json)
        parser.skipWhitespace()
        val value = parser.readValue() ?: return null

        @Suppress("UNCHECKED_CAST")
        return (value as? Map<String, Any?>)?.let { Fields(it) }
    }

    private class Parser(
        private val source: String,
    ) {
        private var index = 0

        fun skipWhitespace() {
            while (index < source.length && source[index].isWhitespace()) index++
        }

        /** Reads any JSON value, or null when the text is malformed. */
        fun readValue(): Any? {
            skipWhitespace()
            if (index >= source.length) return null

            return when (source[index]) {
                '{' -> readObject()
                '[' -> readArray()
                '"' -> readString()
                't', 'f' -> readBoolean()
                'n' -> readNull()
                else -> readNumber()
            }
        }

        private fun readObject(): Map<String, Any?>? {
            if (!consume('{')) return null
            val result = LinkedHashMap<String, Any?>()

            skipWhitespace()
            if (consume('}')) return result

            while (true) {
                skipWhitespace()
                val key = readString() ?: return null
                skipWhitespace()
                if (!consume(':')) return null
                val value = readValue()
                result[key] = value

                skipWhitespace()
                when {
                    consume(',') -> continue
                    consume('}') -> return result
                    else -> return null
                }
            }
        }

        private fun readArray(): List<Any?>? {
            if (!consume('[')) return null
            val result = ArrayList<Any?>()

            skipWhitespace()
            if (consume(']')) return result

            while (true) {
                result.add(readValue())

                skipWhitespace()
                when {
                    consume(',') -> continue
                    consume(']') -> return result
                    else -> return null
                }
            }
        }

        private fun readString(): String? {
            if (!consume('"')) return null
            val builder = StringBuilder()

            while (index < source.length) {
                when (val char = source[index++]) {
                    '"' -> return builder.toString()
                    '\\' -> {
                        if (index >= source.length) return null
                        when (val escape = source[index++]) {
                            '"' -> builder.append('"')
                            '\\' -> builder.append('\\')
                            '/' -> builder.append('/')
                            'n' -> builder.append('\n')
                            'r' -> builder.append('\r')
                            't' -> builder.append('\t')
                            'b' -> builder.append('\b')
                            'f' -> builder.append('\u000C')
                            'u' -> {
                                if (index + 4 > source.length) return null
                                val hex = source.substring(index, index + 4)
                                val code = hex.toIntOrNull(16) ?: return null
                                builder.append(code.toChar())
                                index += 4
                            }
                            else -> builder.append(escape)
                        }
                    }
                    else -> builder.append(char)
                }
            }

            // Unterminated string.
            return null
        }

        private fun readBoolean(): Boolean? =
            when {
                source.startsWith("true", index) -> {
                    index += 4
                    true
                }
                source.startsWith("false", index) -> {
                    index += 5
                    false
                }
                else -> null
            }

        private fun readNull(): Any? {
            if (source.startsWith("null", index)) index += 4
            return null
        }

        private fun readNumber(): Any? {
            val start = index
            if (index < source.length && (source[index] == '-' || source[index] == '+')) index++

            var isDecimal = false
            while (index < source.length) {
                val char = source[index]
                when {
                    char.isDigit() -> index++
                    char == '.' || char == 'e' || char == 'E' -> {
                        isDecimal = true
                        index++
                    }
                    char == '-' || char == '+' -> index++
                    else -> break
                }
            }

            if (start == index) return null
            val text = source.substring(start, index)

            // Integers stay integers: turning them into doubles would make a
            // coordinate read back as 421.0 and print that way in logs.
            return if (isDecimal) text.toDoubleOrNull() else text.toLongOrNull() ?: text.toDoubleOrNull()
        }

        private fun consume(expected: Char): Boolean {
            skipWhitespace()
            if (index < source.length && source[index] == expected) {
                index++
                return true
            }
            return false
        }
    }
}
