/**
 * Adds CarPlay to the iPhone app as a "driving task" app: parents check in to the
 * car line from the car's screen. modules/carplay draws it; src/carplay decides
 * what it shows.
 *
 *  - Info.plist: a CarPlay scene, handled by CarPlaySceneDelegate.
 *  - AppDelegate.swift: CarPlaySceneDelegate, a subclass of the module's
 *    CarPlaySceneDelegateBase that starts React Native when CarPlay launches the
 *    app without its phone window.
 *  - Entitlement: Apple must grant com.apple.developer.carplay-driving-task.
 *    Simulator builds always have it (plugins/carplay/Simulator.entitlements), so
 *    CarPlay works in Xcode's CarPlay simulator now. iPhone builds get it only
 *    with CARPLAY_ENTITLEMENT=1, once Apple has approved it: a provisioning profile
 *    without it can't sign the app. See DEVELOPING.md, "CarPlay".
 */
const { withAppDelegate, withEntitlementsPlist, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const ENTITLEMENT = 'com.apple.developer.carplay-driving-task';
const SIMULATOR_ENTITLEMENTS = '../plugins/carplay/Simulator.entitlements';  // relative to ios/
const SIMULATOR_KEY = '"CODE_SIGN_ENTITLEMENTS[sdk=iphonesimulator*]"';

const IMPORT = 'internal import KHCarPlay';
const DELEGATE = `
// UIKit creates one of these for the CarPlay scene (see UIApplicationSceneManifest in
// Info.plist); modules/carplay draws the car line. Added by plugins/withCarPlay.js.
class CarPlaySceneDelegate: CarPlaySceneDelegateBase {
  private var headless: UIView?

  // CarPlay can launch the app without its phone window, and then nothing else starts
  // React Native. Run the empty "carplay" component, which loads src/carplay/controller.ts.
  override func startJavaScriptIfNeeded() {
    let phoneOpen = UIApplication.shared.connectedScenes.contains { $0 is UIWindowScene }
    guard !phoneOpen, headless == nil,
          let factory = (UIApplication.shared.delegate as? ExpoReactNativeFactoryProvider)?.reactNativeFactory else { return }
    headless = factory.rootViewFactory.view(withModuleName: "carplay")
  }
}
`;

/** Adds CarPlaySceneDelegate to AppDelegate.swift. Safe to run twice. */
function addCarPlayDelegate(src) {
  if (src.includes('class CarPlaySceneDelegate')) return src;
  if (!/^internal import Expo$/m.test(src)) throw new Error('withCarPlay: expected "internal import Expo" in AppDelegate.swift.');
  return src.replace(/^internal import Expo$/m, `internal import Expo\n${IMPORT}`) + DELEGATE;
}

/** Declares the CarPlay scene beside whatever scenes are already there. */
function addCarPlayScene(plist) {
  const manifest = plist.UIApplicationSceneManifest ?? {};
  plist.UIApplicationSceneManifest = {
    ...manifest,
    UISceneConfigurations: {
      ...manifest.UISceneConfigurations,
      CPTemplateApplicationSceneSessionRoleApplication: [{
        UISceneClassName: 'CPTemplateApplicationScene',
        UISceneConfigurationName: 'CarPlay',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).CarPlaySceneDelegate',
      }],
    },
  };
  return plist;
}

/** The driving task entitlement for iPhone builds, only once Apple has granted it. */
function setEntitlement(entitlements, granted) {
  if (granted) entitlements[ENTITLEMENT] = true;
  else delete entitlements[ENTITLEMENT];
  return entitlements;
}

/** Points the app's simulator builds at plugins/carplay/Simulator.entitlements. */
function useSimulatorEntitlements(project) {
  const configs = project.pbxXCBuildConfigurationSection();
  for (const key of Object.keys(configs)) {
    const settings = configs[key].buildSettings;
    if (settings && settings.PRODUCT_BUNDLE_IDENTIFIER && settings.INFOPLIST_FILE) {
      settings[SIMULATOR_KEY] = `"${SIMULATOR_ENTITLEMENTS}"`;
    }
  }
  return project;
}

const withCarPlay = (config) => {
  config = withInfoPlist(config, (c) => { addCarPlayScene(c.modResults); return c; });
  config = withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') throw new Error('withCarPlay: expected a Swift AppDelegate.');
    c.modResults.contents = addCarPlayDelegate(c.modResults.contents);
    return c;
  });
  config = withEntitlementsPlist(config, (c) => {
    setEntitlement(c.modResults, process.env.CARPLAY_ENTITLEMENT === '1');
    return c;
  });
  return withXcodeProject(config, (c) => { useSimulatorEntitlements(c.modResults); return c; });
};

module.exports = withCarPlay;
module.exports.addCarPlayDelegate = addCarPlayDelegate;
module.exports.addCarPlayScene = addCarPlayScene;
module.exports.setEntitlement = setEntitlement;
module.exports.useSimulatorEntitlements = useSimulatorEntitlements;
module.exports.ENTITLEMENT = ENTITLEMENT;
