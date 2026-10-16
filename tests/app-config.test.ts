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
import { addCarManifestEntries, addDependencies, kotlinSources } from '../plugins/withAndroidAuto';

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

test('Android Auto: car messaging service replaces Expo\'s, and the app declares notification support', () => {
  assert.ok(appJson.expo.plugins.includes('./plugins/withAndroidAuto'));
  const manifest = { manifest: { $: {}, application: [{ $: {}, service: [], receiver: [] }] } } as any;
  addCarManifestEntries(manifest, 'com.khroyals.app');
  addCarManifestEntries(manifest, 'com.khroyals.app');   // running prebuild twice doesn't duplicate
  const app = manifest.manifest.application[0];
  assert.equal(manifest.manifest.$['xmlns:tools'], 'http://schemas.android.com/tools');
  assert.deepEqual(app['meta-data'].map((m: any) => m.$['android:resource']), ['@xml/automotive_app_desc']);
  const services = app.service.map((s: any) => [s.$['android:name'], s.$['tools:node'] ?? 'keep']);
  assert.deepEqual(services, [
    ['expo.modules.notifications.service.ExpoFirebaseMessagingService', 'remove'],
    ['com.khroyals.app.auto.CarMessagingService', 'keep'],
  ]);
  assert.equal(app.receiver.length, 1);

  const gradle = addDependencies('android {}\ndependencies {\n    implementation("com.facebook.react:react-android")\n}\n');
  assert.match(gradle, /firebase-messaging/);
  assert.equal(addDependencies(gradle), gradle, 'added once');

  const src = kotlinSources('com.khroyals.app', appJson.expo.extra.supabaseUrl, appJson.expo.extra.supabaseKey);
  assert.match(src['CarMessaging.kt'], /SEMANTIC_ACTION_REPLY/);
  assert.match(src['CarMessaging.kt'], /SEMANTIC_ACTION_MARK_AS_READ/);
  assert.match(src['CarReplyReceiver.kt'], /\$\{CarMessaging\.SUPABASE_URL\}\/rest\/v1\/rpc\/reply_from_push/);
  assert.doesNotMatch(Object.values(src).join(''), /sb_secret_|service_role/, 'only the publishable key ships');
});
