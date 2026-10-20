// app.json holds the app's settings; this adjusts three things at build time.
//
// 1. Developers can sign iPhone builds with their own Apple team under a
//    separate app ID, so the real ID (com.khroyals.app) stays free for whoever
//    publishes the app:
//      APPLE_TEAM_ID=XXXXXXXXXX IOS_BUNDLE_ID=com.khroyals.app.dev npx expo prebuild --platform ios --clean
//    With neither variable set (CI, the web build, everyone else) nothing changes.
//    IOS_BUILD_NUMBER sets the iPhone build number; every TestFlight upload needs
//    a new one (scripts/testflight.sh uses the date and time).
//    Critical alerts break through Focus modes as Time Sensitive notifications. Once
//    Apple grants the Critical Alerts entitlement, build with
//    CRITICAL_ALERTS_ENTITLEMENT=1 so they ring on silent too (signing fails without it).
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
      ...(process.env.IOS_BUILD_NUMBER ? { buildNumber: process.env.IOS_BUILD_NUMBER } : {}),
      entitlements: {
        ...config.ios?.entitlements,
        'com.apple.developer.usernotifications.time-sensitive': true,
        ...(process.env.CRITICAL_ALERTS_ENTITLEMENT === '1' ? { 'com.apple.developer.usernotifications.critical-alerts': true } : {}),
      },
    },
  };
};
