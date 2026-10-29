/**
 * Build settings. app.config.js: the web prefix (/khroyals) stays for web and
 * Android but is dropped from iPhone release bundles, and developers can sign
 * with their own Apple team under a separate app ID. plugins/withGradleMemory.js:
 * the Android release build gets enough memory.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import appJson from '../app.json';
import makeConfig from '../app.config';
import { JVM_ARGS, setJvmArgs } from '../plugins/withGradleMemory';

const withArgs = (args: string[], env: Record<string, string> = {}) => {
  const [argv, saved] = [process.argv, { ...process.env }];
  process.argv = ['node', 'expo', ...args];
  Object.assign(process.env, env);
  try {
    return makeConfig({ config: appJson.expo });
  } finally {
    process.argv = argv;
    process.env = saved;
  }
};

test('the web export and Android keep the /khroyals prefix', () => {
  assert.equal(withArgs(['export', '--platform', 'web']).experiments.baseUrl, '/khroyals');
  assert.equal(withArgs(['export:embed', '--platform', 'android']).experiments.baseUrl, '/khroyals');
});

test('iPhone release bundles drop the prefix', () => {
  assert.equal(withArgs(['export:embed', '--platform', 'ios']).experiments.baseUrl, undefined);
  assert.equal(withArgs(['export:embed', '--platform=ios']).experiments.baseUrl, undefined);
  assert.equal(withArgs(['export:embed', '--platform', 'ios']).experiments.typedRoutes, false, 'other settings kept');
});

test('signing overrides apply only when set', () => {
  assert.equal(withArgs([]).ios.bundleIdentifier, 'com.khroyals.app');
  assert.equal(withArgs([]).ios.appleTeamId, undefined);
  const dev = withArgs([], { APPLE_TEAM_ID: 'ABCDE12345', IOS_BUNDLE_ID: 'com.khroyals.app.dev' });
  assert.equal(dev.ios.bundleIdentifier, 'com.khroyals.app.dev');
  assert.equal(dev.ios.appleTeamId, 'ABCDE12345');
});

test('the Android build gets 4 GB for Gradle', () => {
  assert.ok(appJson.expo.plugins.includes('./plugins/withGradleMemory'));
  const template = [{ type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx2048m -XX:MaxMetaspaceSize=512m' }];
  const out = setJvmArgs(template);
  assert.equal(out.filter((i: any) => i.key === 'org.gradle.jvmargs').length, 1, 'replaced, not duplicated');
  assert.match(out[0].value, /-Xmx4096m/);
  assert.equal(setJvmArgs([]).find((i: any) => i.key === 'org.gradle.jvmargs')?.value, JVM_ARGS, 'added when missing');
});

test('automatic car line check-in has background location on iPhone and Android', () => {
  const loc = (appJson.expo.plugins as any[]).find((p) => Array.isArray(p) && p[0] === 'expo-location')?.[1];
  assert.equal(loc?.isIosBackgroundLocationEnabled, true, 'iPhone: the "location" background mode, or startGeofencingAsync fails');
  assert.equal(loc?.isAndroidBackgroundLocationEnabled, true);
});

test('iPhone builds can read the Wi-Fi access point, and the location prompt says alert answers use it', () => {
  assert.equal(withArgs(['prebuild']).ios.entitlements['com.apple.developer.networking.wifi-info'], true);
  const loc = (appJson.expo.plugins as any[]).find((p) => Array.isArray(p) && p[0] === 'expo-location')?.[1];
  for (const k of ['locationWhenInUsePermission', 'locationAlwaysAndWhenInUsePermission']) assert.match(loc[k], /critical alert/, k);
});
