package com.mobileautomation.accessibility.serialization

/**
 * A minimal JSON writer.
 *
 * Hand-rolled on purpose. `org.json` is stubbed out in Android JVM unit tests
 * (it returns default values), and pulling in a full serialization library for
 * one output format would be disproportionate. Keeping it here means the UI
 * tree serializer is fully covered by plain JUnit tests.
 */
internal class JsonBuilder {
    private val out = StringBuilder()

    fun beginObject(): JsonBuilder {
        out.append('{')
        return this
    }

    fun endObject(): JsonBuilder {
        trimTrailingComma()
        out.append('}')
        return this
    }

    fun beginArray(): JsonBuilder {
        out.append('[')
        return this
    }

    fun endArray(): JsonBuilder {
        trimTrailingComma()
        out.append(']')
        return this
    }

    fun name(name: String): JsonBuilder {
        out.append(quote(name)).append(':')
        return this
    }

    fun value(value: String?): JsonBuilder {
        out.append(if (value == null) NULL else quote(value))
        separate()
        return this
    }

    fun value(value: Int): JsonBuilder {
        out.append(value)
        separate()
        return this
    }

    fun value(value: Long): JsonBuilder {
        out.append(value)
        separate()
        return this
    }

    fun value(value: Boolean): JsonBuilder {
        out.append(if (value) "true" else "false")
        separate()
        return this
    }

    /** Marks the end of a nested object or array so a comma is emitted. */
    fun endValue(): JsonBuilder {
        separate()
        return this
    }

    fun build(): String = out.toString()

    private fun separate() {
        out.append(',')
    }

    private fun trimTrailingComma() {
        if (out.isNotEmpty() && out.last() == ',') {
            out.setLength(out.length - 1)
        }
    }

    private companion object {
        const val NULL = "null"

        fun quote(value: String): String {
            val escaped = StringBuilder(value.length + 2)
            escaped.append('"')
            for (char in value) {
                when (char) {
                    '"' -> escaped.append("\\\"")
                    '\\' -> escaped.append("\\\\")
                    '\n' -> escaped.append("\\n")
                    '\r' -> escaped.append("\\r")
                    '\t' -> escaped.append("\\t")
                    '\b' -> escaped.append("\\b")
                    '\u000C' -> escaped.append("\\f")
                    else ->
                        if (char < ' ') {
                            escaped.append("\\u").append("%04x".format(char.code))
                        } else {
                            escaped.append(char)
                        }
                }
            }
            escaped.append('"')
            return escaped.toString()
        }
    }
}
