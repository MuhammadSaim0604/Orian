package com.mobileautomation.accessibility

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UiNodeAttributeTest {
    @Test
    fun `exposes the attributes selectors depend on`() {
        assertTrue(UiNodeAttribute.keys.contains("resourceId"))
        assertTrue(UiNodeAttribute.keys.contains("contentDescription"))
    }

    @Test
    fun `resolves an attribute from its serialization key`() {
        assertEquals(UiNodeAttribute.BOUNDS, UiNodeAttribute.fromKey("bounds"))
    }

    @Test
    fun `returns null for an unknown key`() {
        assertNull(UiNodeAttribute.fromKey("telepathy"))
    }

    @Test
    fun `declares a schema version so the bridge can reject stale payloads`() {
        assertEquals(1, UI_TREE_SCHEMA_VERSION)
    }
}
