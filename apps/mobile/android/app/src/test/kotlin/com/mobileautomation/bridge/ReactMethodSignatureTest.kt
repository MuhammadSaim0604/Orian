package com.mobileautomation.bridge

import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.Dynamic
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.mobileautomation.agentoverlay.AgentOverlayModule
import com.mobileautomation.overlay.OverlayModule
import com.mobileautomation.permissions.PermissionsModule
import com.mobileautomation.preferences.AppPreferencesModule
import com.mobileautomation.settings.ProviderSettingsModule
import com.mobileautomation.storage.WorkflowStorageModule
import org.junit.Assert.assertTrue
import org.junit.Test
import java.lang.reflect.Method

/**
 * Every `@ReactMethod` signature must be one React Native can parse.
 *
 * This exists because of a real crash. `AppPreferencesModule.getAllSync()` was declared as
 * returning `WritableNativeMap` - the concrete class - and the app died at startup with
 *
 * > Unable to parse JNI signature. Detected unsupported return class:
 * > com.facebook.react.bridge.WritableNativeMap
 *
 * The reason it was fatal rather than a failed call: under the new architecture `NativeModules.X`
 * is a host-object getter that validates the module's whole method table on **first access**, and
 * that access happens while a module is being evaluated - before any error boundary exists.
 *
 * Nothing else catches this. It compiles cleanly, ktlint does not look at types, and the app
 * module's other tests never touch the annotations. `TurboModuleInteropUtils` does the same check
 * at runtime with an **exact class comparison**, so a subclass of a supported type fails; this test
 * reproduces that comparison by reflection, with no React runtime needed.
 */
class ReactMethodSignatureTest {
    /**
     * From `TurboModuleInteropUtils.convertReturnClassToJniType`.
     *
     * Exact classes, not assignable-from: that is the whole point. `WritableNativeMap` is a
     * `WritableMap` and is still rejected.
     */
    private val supportedReturnTypes =
        setOf<Class<*>>(
            Void.TYPE,
            java.lang.Boolean.TYPE,
            Integer.TYPE,
            java.lang.Double.TYPE,
            java.lang.Float.TYPE,
            java.lang.Boolean::class.java,
            Integer::class.java,
            java.lang.Double::class.java,
            java.lang.Float::class.java,
            String::class.java,
            WritableMap::class.java,
            WritableArray::class.java,
            Map::class.java,
        )

    /** From `TurboModuleInteropUtils.convertParamClassToJniType`. */
    private val supportedParamTypes =
        setOf<Class<*>>(
            java.lang.Boolean.TYPE,
            Integer.TYPE,
            java.lang.Double.TYPE,
            java.lang.Float.TYPE,
            java.lang.Boolean::class.java,
            Integer::class.java,
            java.lang.Double::class.java,
            java.lang.Float::class.java,
            String::class.java,
            Callback::class.java,
            Promise::class.java,
            ReadableMap::class.java,
            ReadableArray::class.java,
            Dynamic::class.java,
        )

    /**
     * Every native module the app registers.
     *
     * Listed by class rather than discovered, because a module missing from `AutomationPackage`
     * would also be missing here - and the failure mode of that is a feature silently absent, which
     * a different test should catch.
     */
    private val moduleClasses =
        listOf(
            AutomationModule::class.java,
            ProviderSettingsModule::class.java,
            WorkflowStorageModule::class.java,
            OverlayModule::class.java,
            AppPreferencesModule::class.java,
            PermissionsModule::class.java,
            AgentOverlayModule::class.java,
        )

    private fun reactMethodsOf(moduleClass: Class<*>): List<Method> =
        moduleClass.declaredMethods.filter { it.isAnnotationPresent(ReactMethod::class.java) }

    @Test
    fun everyReactMethodHasAParseableReturnType() {
        val problems = mutableListOf<String>()

        for (moduleClass in moduleClasses) {
            for (method in reactMethodsOf(moduleClass)) {
                if (method.returnType !in supportedReturnTypes) {
                    problems += "${moduleClass.simpleName}.${method.name} returns ${method.returnType.name}"
                }
            }
        }

        assertTrue(
            "React Native cannot parse these return types, which crashes the app on first access " +
                "of the module rather than on the call: $problems",
            problems.isEmpty(),
        )
    }

    @Test
    fun everyReactMethodHasParseableParameterTypes() {
        val problems = mutableListOf<String>()

        for (moduleClass in moduleClasses) {
            for (method in reactMethodsOf(moduleClass)) {
                for (parameter in method.parameterTypes) {
                    if (parameter !in supportedParamTypes) {
                        problems += "${moduleClass.simpleName}.${method.name} takes ${parameter.name}"
                    }
                }
            }
        }

        assertTrue("React Native cannot parse these parameter types: $problems", problems.isEmpty())
    }

    @Test
    fun anAsynchronousReactMethodReturnsNothing() {
        // A method taking a Promise reports its result through it. Returning a value as well would
        // mean two answers to one call, and RN would resolve neither reliably.
        val problems = mutableListOf<String>()

        for (moduleClass in moduleClasses) {
            for (method in reactMethodsOf(moduleClass)) {
                val takesPromise = method.parameterTypes.any { it == Promise::class.java }

                if (takesPromise && method.returnType != Void.TYPE) {
                    problems += "${moduleClass.simpleName}.${method.name} returns ${method.returnType.simpleName}"
                }
            }
        }

        assertTrue("A promise-based method must return void: $problems", problems.isEmpty())
    }

    @Test
    fun aPromiseIsAlwaysTheLastParameter() {
        // `getJsArgCount` throws otherwise, with the same fatal timing as a bad return type.
        val problems = mutableListOf<String>()

        for (moduleClass in moduleClasses) {
            for (method in reactMethodsOf(moduleClass)) {
                val index = method.parameterTypes.indexOfFirst { it == Promise::class.java }

                if (index != -1 && index != method.parameterTypes.size - 1) {
                    problems += "${moduleClass.simpleName}.${method.name}"
                }
            }
        }

        assertTrue("A Promise must be the final parameter: $problems", problems.isEmpty())
    }

    @Test
    fun theSynchronousPreferencesReadIsStillDeclaredAsAnInterface() {
        // The specific regression. Pinned by name because this is the method whose concrete return
        // type crashed the app, and the mistake is an easy one to make again.
        val method = AppPreferencesModule::class.java.getDeclaredMethod("getAllSync")

        assertTrue(
            "getAllSync must return the WritableMap interface, not a concrete subclass",
            method.returnType == WritableMap::class.java,
        )
    }

    @Test
    fun thereAreReactMethodsToCheck() {
        // Guards against the reflection silently finding nothing - for instance if the annotation
        // stopped being retained at runtime, which would make every test above pass vacuously.
        val total = moduleClasses.sumOf { reactMethodsOf(it).size }

        assertTrue("expected native methods across the registered modules, found $total", total > 40)
    }
}
