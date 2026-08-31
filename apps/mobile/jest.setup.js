// Gesture Handler installs a native module at import time, so anything that transitively imports
// it - the canvas, and now the shell that renders the canvas - fails to load under Jest without
// this. It ships its own mock for exactly this purpose.
require('react-native-gesture-handler/jestSetup');

// Skia does the same, via TurboModuleRegistry.getEnforcing. Its own setup registers the mock, and
// without it any test that reaches the canvas dies on import rather than on a render.
require('@shopify/react-native-skia/jestSetup');

// Reanimated ships a Jest mock; the canvas work in Phase 6 depends on it.
require('react-native-reanimated').setUpTests?.();

// react-native-svg 15 ships no Jest mock of its own (older versions did), and its components resolve through
// `requireNativeComponent`, which the react-native preset already turns into an inert host component. So the
// icons render as empty host views under test — enough for every assertion here, since none look at path
// geometry, only at whether a labelled control is present. Recorded because the natural instinct on seeing an
// icon render as nothing in a snapshot is to go hunting for a missing mock.
