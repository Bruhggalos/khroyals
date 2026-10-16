/**
 * Moves the iOS app to the UIScene life cycle. Apps built with the iOS 27 SDK
 * (Xcode 27) won't launch without it ("UIScene life cycle is required for apps
 * built with this SDK"), but Expo SDK 57's template still creates the window in
 * the app delegate.
 *
 * Expo already ships the scene delegate (ExpoAppSceneDelegate); this wires it in:
 *  - AppDelegate conforms to ExpoReactNativeFactoryProvider and stops creating
 *    the window. It still builds the React Native factory at launch.
 *  - SceneDelegate (an ExpoAppSceneDelegate) creates the window, starts React
 *    Native in it and forwards links and life-cycle events to AppDelegate.
 *  - Info.plist names SceneDelegate as the app's window scene delegate.
 *
 * Remove this plugin once the Expo template adopts scenes itself.
 */
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const CLASS_DECL = 'class AppDelegate: ExpoAppDelegate {';
const WINDOW_BLOCK = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

const SCENE_DELEGATE = `
// UIKit creates one of these for the app's window scene (see UIApplicationSceneManifest
// in Info.plist). Added by plugins/withSceneLifecycle.js.
class SceneDelegate: ExpoAppSceneDelegate {}
`;

/** Rewrites the template's AppDelegate.swift for the scene life cycle. Safe to run twice. */
function transformAppDelegate(src) {
  if (src.includes('class SceneDelegate: ExpoAppSceneDelegate')) return src;
  if (!src.includes(CLASS_DECL) || !WINDOW_BLOCK.test(src)) {
    throw new Error(
      "withSceneLifecycle: AppDelegate.swift doesn't match the Expo SDK 57 template. "
      + 'Check whether the new template already uses ExpoAppSceneDelegate; if not, update plugins/withSceneLifecycle.js.',
    );
  }
  return src
    .replace(CLASS_DECL, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {')
    .replace(WINDOW_BLOCK, '\n    // SceneDelegate creates the window and starts React Native in it.\n')
    + SCENE_DELEGATE;
}

/** Declares a single window scene handled by SceneDelegate. */
function addSceneManifest(plist) {
  plist.UIApplicationSceneManifest = {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [{
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
      }],
    },
  };
  return plist;
}

const withSceneLifecycle = (config) => {
  config = withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') throw new Error('withSceneLifecycle: expected a Swift AppDelegate.');
    c.modResults.contents = transformAppDelegate(c.modResults.contents);
    return c;
  });
  return withInfoPlist(config, (c) => {
    addSceneManifest(c.modResults);
    return c;
  });
};

module.exports = withSceneLifecycle;
module.exports.transformAppDelegate = transformAppDelegate;
module.exports.addSceneManifest = addSceneManifest;
