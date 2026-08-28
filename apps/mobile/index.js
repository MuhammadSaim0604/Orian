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

AppRegistry.registerComponent(appName, () => App);
