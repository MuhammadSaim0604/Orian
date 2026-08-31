package com.mobileautomation.storage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The provider registry's model-list encoding.
 *
 * Unit-testable off-device because it is hand-rolled JSON rather than `org.json` — which is **stubbed** in
 * Android JVM unit tests and returns default values, so anything that must be tested here cannot use it. Same
 * reason `android/bridge` hand-rolls its JSON.
 *
 * A model is an **id and a name**. They answer different questions: the id is what the request must carry and
 * is not negotiable, while the name is what a person picks from a list and should be theirs to write. The tests
 * that matter most are the ones protecting the older bare-string format, because a user who saved a list before
 * that change must not open settings to find it empty.
 */
class ProviderModelEncodingTest {
    private fun model(
        id: String,
        name: String = id,
    ) = StoredModel(id = id, name = name)

    @Test
    fun `encodes an empty list`() {
        assertEquals("[]", ProviderRegistryStore.encodeModels(emptyList()))
    }

    @Test
    fun `round trips a single model`() {
        val encoded = ProviderRegistryStore.encodeModels(listOf(model("gpt-4o-mini")))

        assertEquals(listOf(model("gpt-4o-mini")), ProviderRegistryStore.decodeModels(encoded))
    }

    @Test
    fun `round trips a user-chosen name alongside the id`() {
        // The point of the pair. The id goes in the request; the name is how the user thinks about it.
        val models = listOf(model(id = "gpt-4o-mini-2024-07-18", name = "cheap and fast"))

        val decoded = ProviderRegistryStore.decodeModels(ProviderRegistryStore.encodeModels(models))

        assertEquals("gpt-4o-mini-2024-07-18", decoded[0].id)
        assertEquals("cheap and fast", decoded[0].name)
    }

    @Test
    fun `round trips several models`() {
        val models = listOf(model("gpt-4o"), model("gpt-4o-mini"), model("o1-preview"))

        assertEquals(models, ProviderRegistryStore.decodeModels(ProviderRegistryStore.encodeModels(models)))
    }

    @Test
    fun `preserves order`() {
        // The order is the provider's own preference order, and a settings screen presents the first as the
        // obvious choice - so reordering would silently change what a user is nudged towards.
        val models = listOf(model("z-model"), model("a-model"), model("m-model"))

        assertEquals(models, ProviderRegistryStore.decodeModels(ProviderRegistryStore.encodeModels(models)))
    }

    @Test
    fun `survives a comma in the id or the name`() {
        // A naive split on commas would tear these into entries that name nothing. The splitter also has to
        // ignore the comma between an object's own two fields, which is the trap this format introduced.
        val models = listOf(model(id = "weird,id", name = "a, name"), model("plain"))

        assertEquals(models, ProviderRegistryStore.decodeModels(ProviderRegistryStore.encodeModels(models)))
    }

    @Test
    fun `survives a quote in the name`() {
        val models = listOf(model(id = "m1", name = "the \"good\" one"))

        assertEquals(models, ProviderRegistryStore.decodeModels(ProviderRegistryStore.encodeModels(models)))
    }

    @Test
    fun `survives a backslash`() {
        val models = listOf(model(id = "back\\slash", name = "back\\slash"))

        assertEquals(models, ProviderRegistryStore.decodeModels(ProviderRegistryStore.encodeModels(models)))
    }

    @Test
    fun `reads the older bare-string format`() {
        // An upgrade must not silently empty a saved list. A bare id becomes a model whose name is that id,
        // which is exactly what discovery produces for a fresh list - so the two are indistinguishable.
        val decoded = ProviderRegistryStore.decodeModels("[\"gpt-4o\",\"gpt-4o-mini\"]")

        assertEquals(listOf(model("gpt-4o"), model("gpt-4o-mini")), decoded)
    }

    @Test
    fun `reads a mixed list`() {
        // Possible mid-upgrade if a write happened between versions. Neither form should be dropped.
        val decoded = ProviderRegistryStore.decodeModels("[\"old-style\",{\"id\":\"new\",\"name\":\"New\"}]")

        assertEquals(listOf(model("old-style"), model(id = "new", name = "New")), decoded)
    }

    @Test
    fun `does not assume field order`() {
        // Nothing guarantees order survives a round trip through another writer.
        val decoded = ProviderRegistryStore.decodeModels("[{\"name\":\"Fast\",\"id\":\"m1\"}]")

        assertEquals(listOf(model(id = "m1", name = "Fast")), decoded)
    }

    @Test
    fun `falls back to the id when a name is missing`() {
        // A model with no label is unpickable from a list.
        val decoded = ProviderRegistryStore.decodeModels("[{\"id\":\"m1\"}]")

        assertEquals(listOf(model(id = "m1", name = "m1")), decoded)
    }

    @Test
    fun `drops an entry with no id`() {
        // Keeping it would render a selectable row that produces a request naming no model.
        assertTrue(ProviderRegistryStore.decodeModels("[{\"name\":\"Nameless\"}]").isEmpty())
    }

    @Test
    fun `treats a null cache as no models`() {
        // Never discovered. Different from "discovered and empty" only in the UI's wording, but the list must be
        // empty rather than null either way.
        assertTrue(ProviderRegistryStore.decodeModels(null).isEmpty())
    }

    @Test
    fun `treats a malformed cache as no models`() {
        // A corrupt cache is not worth failing a settings screen over: the user re-runs discovery or types a
        // name, and both paths already exist.
        assertTrue(ProviderRegistryStore.decodeModels("not json").isEmpty())
        assertTrue(ProviderRegistryStore.decodeModels("{\"models\":[]}").isEmpty())
        assertTrue(ProviderRegistryStore.decodeModels("[").isEmpty())
    }

    @Test
    fun `drops an empty model id`() {
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
        // A window large enough to be useful and small enough to afford. Zero would mean the agent starts every
        // run with no idea what it already tried, which is the bug per-session memory exists to fix.
        assertTrue(SessionStore.MEMORY_SEED_MESSAGES > 0)
        assertTrue(SessionStore.MEMORY_SEED_MESSAGES <= 200)
    }
}
