package com.mobileautomation.accessibility.selector

import com.mobileautomation.accessibility.model.Bounds
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SelectorStrategyTest {
    @Test
    fun `orders resource id above everything else`() {
        assertEquals(0, SelectorStrategy.RESOURCE_ID.rank)
        assertTrue(SelectorStrategy.RESOURCE_ID.isStrongerThan(SelectorStrategy.TEXT))
    }

    @Test
    fun `ranks coordinates weaker than every semantic strategy`() {
        val semantic =
            listOf(
                SelectorStrategy.RESOURCE_ID,
                SelectorStrategy.ACCESSIBILITY_SEMANTICS,
                SelectorStrategy.TEXT,
                SelectorStrategy.STRUCTURAL,
                SelectorStrategy.RELATIVE_POSITION,
            )
        assertTrue(semantic.all { it.isStrongerThan(SelectorStrategy.COORDINATES) })
    }

    @Test
    fun `treats vision as the final fallback`() {
        assertEquals(SelectorStrategy.entries.size - 1, SelectorStrategy.VISION.rank)
    }

    @Test
    fun `wire names match the typescript contract`() {
        assertEquals(
            listOf(
                "resourceId",
                "accessibilitySemantics",
                "text",
                "structural",
                "relativePosition",
                "coordinates",
                "vision",
            ),
            SelectorStrategy.wireNames,
        )
    }

    @Test
    fun `resolves a strategy from its wire name`() {
        assertEquals(SelectorStrategy.STRUCTURAL, SelectorStrategy.fromWireName("structural"))
        assertNull(SelectorStrategy.fromWireName("telepathy"))
    }
}

class SelectorTest {
    @Test
    fun `an empty selector carries nothing to locate with`() {
        assertTrue(Selector().isEmpty)
        assertTrue(Selector(className = "android.widget.Button").isEmpty)
    }

    @Test
    fun `a selector with any locator is not empty`() {
        assertFalse(Selector(resourceId = "a").isEmpty)
        assertFalse(Selector(text = "Send").isEmpty)
        assertFalse(Selector(coordinates = Point(1, 2)).isEmpty)
    }

    @Test
    fun `lists available strategies in priority order`() {
        val selector =
            Selector(
                resourceId = "com.app:id/send",
                contentDescription = "Send",
                text = "Send",
                structuralPath = "0.1",
                bounds = Bounds(0, 0, 10, 10),
            )

        assertEquals(
            listOf(
                SelectorStrategy.RESOURCE_ID,
                SelectorStrategy.ACCESSIBILITY_SEMANTICS,
                SelectorStrategy.TEXT,
                SelectorStrategy.STRUCTURAL,
                SelectorStrategy.RELATIVE_POSITION,
                SelectorStrategy.COORDINATES,
            ),
            selector.availableStrategies(),
        )
    }

    @Test
    fun `omits strategies it has no data for`() {
        assertEquals(listOf(SelectorStrategy.TEXT), Selector(text = "Send").availableStrategies())
    }

    @Test
    fun `bounds enable both relative position and coordinate fallback`() {
        val strategies = Selector(bounds = Bounds(0, 0, 100, 100)).availableStrategies()
        assertEquals(
            listOf(SelectorStrategy.RELATIVE_POSITION, SelectorStrategy.COORDINATES),
            strategies,
        )
    }

    @Test
    fun `explicit coordinates alone enable only the coordinate strategy`() {
        assertEquals(
            listOf(SelectorStrategy.COORDINATES),
            Selector.byCoordinates(100, 200).availableStrategies(),
        )
    }

    @Test
    fun `factory helpers build the expected selectors`() {
        assertEquals("com.app:id/send", Selector.byResourceId("com.app:id/send").resourceId)
        assertTrue(Selector.byText("Send", exact = true).exactText)
        assertEquals("Attach", Selector.byContentDescription("Attach").contentDescription)
        assertEquals(Point(5, 6), Selector.byCoordinates(5, 6).coordinates)
    }
}
