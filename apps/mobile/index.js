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
import { listenForExternalStop } from './src/features/agent/runController';
import AgentOverlayRoot from './src/overlay/AgentOverlayRoot';
import OverlayRoot from './src/overlay/OverlayRoot';

AppRegistry.registerComponent(appName, () => App);

// The Configure-with-AI overlay is a second React root, mounted by Kotlin into a
// WindowManager window rather than into the activity. Registered here because
// AppRegistry is process-wide, and the name must match
// `OverlayReactHost.COMPONENT_NAME` - a mismatch produces an empty window with
// only a log warning.
AppRegistry.registerComponent('ConfigureWithAiOverlay', () => OverlayRoot);

// The agent status overlay is a third root, on the same terms. Its name must match
// `AgentOverlayReactHost.COMPONENT_NAME`.
AppRegistry.registerComponent('AgentStatusOverlay', () => AgentOverlayRoot);

// A headless task that does nothing, on purpose.
//
// React Native's JavaTimerManager removes the timer choreographer callback in `onHostPause`, so
// setTimeout and setInterval stop firing entirely while the app is backgrounded - which froze the agent
// mid-run. `clearFrameCallback` skips the removal while any headless task is active, so the native
// RunKeepAlive module holds one open for the duration of a run and this is the JS half it needs.
//
// It must never resolve: resolving notifies native that the task finished, the callback is cleared, and
// the freeze returns. The native side ends it by task id when the run stops.
AppRegistry.registerHeadlessTask('AgentRunKeepAlive', () => () => new Promise(() => undefined));

// Wired here rather than in a component, deliberately: the notification's stop button is most useful
// when no screen is mounted, so the listener has to exist before any React tree does and outlive all
// of them. Registering it at the entry point is what makes stop work from the shade during a run the
// user has walked away from.
listenForExternalStop();
