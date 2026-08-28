// Gesture Handler installs a native module at import time, so anything that transitively imports
// it - the canvas, and now the shell that renders the canvas - fails to load under Jest without
// this. It ships its own mock for exactly this purpose.
require('react-native-gesture-handler/jestSetup');

// Skia does the same, via TurboModuleRegistry.getEnforcing. Its own setup registers the mock, and
// without it any test that reaches the canvas dies on import rather than on a render.
require('@shopify/react-native-skia/jestSetup');

// Reanimated ships a Jest mock; the canvas work in Phase 6 depends on it.
require('react-native-reanimated').setUpTests?.();
