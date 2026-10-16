/**
 * plugins/withSceneLifecycle.js — the iOS 27 SDK won't launch apps that still
 * create their window in the app delegate. Checks the rewrite of Expo SDK 57's
 * template AppDelegate (tests/fixtures) and the Info.plist scene manifest.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import appJson from '../app.json';
import { addSceneManifest, transformAppDelegate } from '../plugins/withSceneLifecycle';

const template = readFileSync(join(__dirname, 'fixtures/AppDelegate.sdk57.swift'), 'utf8');

test('app.json applies the scene plugin', () => {
  assert.ok(appJson.expo.plugins.includes('./plugins/withSceneLifecycle'));
});

test('AppDelegate hands the window to SceneDelegate', () => {
  const out = transformAppDelegate(template);
  assert.match(out, /class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider \{/);
  assert.match(out, /class SceneDelegate: ExpoAppSceneDelegate \{\}/);
  assert.doesNotMatch(out, /UIWindow\(frame:/);
  assert.doesNotMatch(out, /startReactNative/);
  // The factory is still built at launch, and links still reach React Native.
  assert.match(out, /reactNativeFactory = factory/);
  assert.match(out, /super\.application\(application, didFinishLaunchingWithOptions: launchOptions\)/);
  assert.match(out, /RCTLinkingManager\.application\(app, open: url, options: options\)/);
});

test('rewriting twice changes nothing', () => {
  const once = transformAppDelegate(template);
  assert.equal(transformAppDelegate(once), once);
});

test('an unexpected template fails the build instead of shipping a crash', () => {
  assert.throws(() => transformAppDelegate('class AppDelegate: UIResponder {}'), /doesn't match the Expo SDK 57 template/);
});

test('Info.plist names SceneDelegate for the app window scene', () => {
  const plist: any = addSceneManifest({});
  const [scene] = plist.UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication;
  assert.equal(scene.UISceneDelegateClassName, '$(PRODUCT_MODULE_NAME).SceneDelegate');
  assert.equal(plist.UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes, false);
});
