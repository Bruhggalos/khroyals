// app.json holds the app's settings; this adjusts two things at build time.
//
// 1. Developers can sign iPhone builds with their own Apple team under a
//    separate app ID, so the real ID (com.khroyals.app) stays free for whoever
//    publishes the app:
//      APPLE_TEAM_ID=XXXXXXXXXX IOS_BUNDLE_ID=com.khroyals.app.dev npx expo prebuild --platform ios --clean
//    With neither variable set (CI, the web build, everyone else) nothing changes.
//
// 2. The web app is served from /khroyals (experiments.baseUrl), but iPhone
//    release builds must not use that prefix: Xcode's bundling step
//    (`expo export:embed --platform ios`) would copy images into
//    KHRoyals.app/khroyals/…, which collides with the KHRoyals program file on
//    the Mac's case-insensitive disk. Expo doesn't support baseUrl in native
//    release bundles anyway.

/** The platform being bundled into a native release build, or null. */
function embeddingPlatform(argv = process.argv) {
  if (!argv.includes('export:embed')) return null;
  const i = argv.indexOf('--platform');
  if (i >= 0) return argv[i + 1] ?? null;
  return argv.find((a) => a.startsWith('--platform='))?.split('=')[1] ?? null;
}

module.exports = ({ config }) => {
  const { baseUrl, ...experiments } = config.experiments ?? {};
  return {
    ...config,
    experiments: embeddingPlatform() === 'ios' ? experiments : config.experiments,
    ios: {
      ...config.ios,
      ...(process.env.IOS_BUNDLE_ID ? { bundleIdentifier: process.env.IOS_BUNDLE_ID } : {}),
      ...(process.env.APPLE_TEAM_ID ? { appleTeamId: process.env.APPLE_TEAM_ID } : {}),
    },
  };
};
