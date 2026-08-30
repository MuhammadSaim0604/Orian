package com.mobileautomation.storage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The provider registry's model-list encoding.
 *
 * Unit-testable off-device because it is hand-rolled JSON rather than `org.json` — which is **stubbed**
 * in Android JVM unit tests and returns default values, so anything that must be tested here cannot use
 * it. Same reason `android/bridge` hand-rolls its JSON.
 *
 * The store itself needs an instrumented test (it needs a real database); this covers the part where a
 * mistake would silently corrupt a model name rather than fail loudly.
 */
class ProviderModelEncodingTest {
    @Test
    fun `encodes an empty list`() {
        assertEquals("[]", ProviderRegistryStore.encodeModels(emptyList()))
    }

    @Test
    fun `round trips a single model`() {
        val encoded = ProviderRegistryStore.encodeModels(listOf("gpt-4o-mini"))

        assertEquals(listOf("gpt-4o-mini"), ProviderRegistryStore.decodeModels(encoded))
    }

    @Test
    fun `round trips several models`() {
        val models = listOf("gpt-4o", "gpt-4o-mini", "o1-preview", "llama-3.1-8b-instruct")

        assertEquals(models, ProviderRegistryStore.decodeModels(ProviderRegistryStore.encodeModels(models)))
    }

    @Test
    fun `preserves order`() {
        // The order is the provider's own preference order, and a settings screen presents the first as
        // the obvious choice - so reordering would silently change what a user is nudged towards.
        val models = listOf("z-model", "a-model", "m-model")

        assertEquals(models, ProviderRegistryStore.decodeModels(ProviderRegistryStore.encodeModels(models)))
    }

    @Test
    fun `survives a model name containing a comma`() {
        // A naive split on commas would tear this into two model names that do not exist.
        val models = listOf("weird,name", "normal-name")

        assertEquals(models, ProviderRegistryStore.decodeModels(ProviderRegistryStore.encodeModels(models)))
    }

    @Test
    fun `survives a model name containing a quote`() {
        val models = listOf("has\"quote", "plain")

        assertEquals(models, ProviderRegistryStore.decodeModels(ProviderRegistryStore.encodeModels(models)))
    }

    @Test
    fun `survives a model name containing a backslash`() {
        val models = listOf("back\\slash")

        assertEquals(models, ProviderRegistryStore.decodeModels(ProviderRegistryStore.encodeModels(models)))
    }

    @Test
    fun `treats a null cache as no models`() {
        // Never discovered. Different from "discovered and empty" only in the UI's wording, but the list
        // must be empty rather than null either way.
        assertTrue(ProviderRegistryStore.decodeModels(null).isEmpty())
    }

    @Test
    fun `treats a malformed cache as no models`() {
        // A corrupt cache is not worth failing a settings screen over: the user re-runs discovery or
        // types a name, and both paths already exist.
        assertTrue(ProviderRegistryStore.decodeModels("not json").isEmpty())
        assertTrue(ProviderRegistryStore.decodeModels("{\"models\":[]}").isEmpty())
        assertTrue(ProviderRegistryStore.decodeModels("[").isEmpty())
    }

    @Test
    fun `ignores an unquoted entry rather than inventing a model`() {
        // Better to drop a garbled entry than to offer the user a model id the provider never named.
        assertEquals(listOf("good"), ProviderRegistryStore.decodeModels("[\"good\",bad]"))
    }

    @Test
    fun `drops an empty model id`() {
        // An empty string would render as a selectable blank row and produce a request with no model.
        assertTrue(ProviderRegistryStore.decodeModels("[\"\"]").isEmpty())
    }
}

/**
 * The mode constants.
 *
 * Thin, but they are a contract: Agent Mode and the workflow builder agent must never read each other's
 * sessions (ADR 0014), and that isolation is enforced by these two strings being different at the query.
 */
class SessionModeTest {
    @Test
    fun `agent and builder modes are distinct`() {
        assertTrue(SessionStore.MODE_AGENT != SessionStore.MODE_WORKFLOW_BUILDER)
    }

    @Test
    fun `the memory seed window is bounded`() {
        // A window large enough to be useful and small enough to afford. Zero would mean the agent starts
        // every run with no idea what it already tried, which is the bug per-session memory exists to fix.
        assertTrue(SessionStore.MEMORY_SEED_MESSAGES > 0)
        assertTrue(SessionStore.MEMORY_SEED_MESSAGES <= 200)
    }
}
