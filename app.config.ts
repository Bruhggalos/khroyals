import type { ConfigContext, ExpoConfig } from 'expo/config';

// Beta versioning: every CI build is 0.<build>, where <build> is the GitHub
// Actions run number (passed in as APP_BUILD_NUMBER). The same number becomes
// the Android versionCode and the iOS buildNumber, so each build installs as
// an upgrade over the previous one. Local builds fall back to build 0 (0.0).
const build = Number.parseInt(process.env.APP_BUILD_NUMBER ?? '0', 10) || 0;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'KH Royals',
  slug: config.slug ?? 'khroyals',
  version: `0.${build}`,
  ios: { ...config.ios, buildNumber: String(build) },
  // Android rejects versionCode 0, so local builds use 1.
  android: { ...config.android, versionCode: Math.max(build, 1) },
});
