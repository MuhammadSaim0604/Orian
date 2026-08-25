module.exports = {
  presets: [
    ['@react-native/babel-preset', { unstable_transformProfile: 'hermes-stable' }],
    'nativewind/babel',
  ],
  plugins: ['react-native-reanimated/plugin'],
};
