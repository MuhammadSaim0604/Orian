// Must be the very first import in the app.
//
// Gesture Handler installs its native module and replaces React Native's touch
// handling at load time. Imported anywhere later and gestures registered before
// that point silently do nothing - which on the canvas presents as pan and zoom
// simply not working, with no error to follow.
import 'react-native-gesture-handler';

import { AppRegistry } from 'react-native';

import { name as appName } from './app.json';
import App from './src/App';
import OverlayRoot from './src/overlay/OverlayRoot';

AppRegistry.registerComponent(appName, () => App);

// The Configure-with-AI overlay is a second React root, mounted by Kotlin into a
// WindowManager window rather than into the activity. Registered here because
// AppRegistry is process-wide, and the name must match
// `OverlayReactHost.COMPONENT_NAME` - a mismatch produces an empty window with
// only a log warning.
AppRegistry.registerComponent('ConfigureWithAiOverlay', () => OverlayRoot);
