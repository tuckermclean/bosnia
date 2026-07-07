module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // react-native-reanimated v4 moved its Babel plugin into react-native-worklets.
      // This must remain the LAST plugin in the list.
      'react-native-worklets/plugin',
    ],
  };
};
