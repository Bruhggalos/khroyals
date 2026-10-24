#!/usr/bin/env bash
# Build the iPhone app and upload it to App Store Connect for TestFlight.
#
#   APPLE_TEAM_ID=XXXXXXXXXX scripts/testflight.sh ["What to test in this build"]
#
# Runs on a Mac with Xcode signed in (Settings → Accounts) to an Apple account on
# the team that owns com.khroyals.app in App Store Connect (Admin or App Manager).
# Xcode makes the distribution certificate and profile itself. Uses the real app ID,
# so it replaces any developer test setup in ios/ (prebuild again for your test
# phone afterwards). Each upload gets a new build number from the date and time
# (2026.1019.1432), unless IOS_BUILD_NUMBER is set. Apple takes 10–30 minutes to
# process a build before it shows up under TestFlight.
#
# With an App Store Connect API key (ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH), Xcode signs
# and uploads with the key instead of its signed-in account (whose session lapses:
# "Failed to Use Accounts"), and the script then waits for that processing and hands
# the build to the external tester groups (scripts/testflight_distribute.mjs; all of
# them, or TESTFLIGHT_GROUPS="Core 4"), with the optional "What to Test" note.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID to the Apple team that owns the app in App Store Connect}"
read -r year monthday time <<<"$(date -u +'%Y %m%d %H%M')"
export IOS_BUILD_NUMBER="${IOS_BUILD_NUMBER:-$year.$((10#$monthday)).$((10#$time))}"
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # CocoaPods fails without a UTF-8 locale
unset IOS_BUNDLE_ID                          # the real app ID, com.khroyals.app

key=""
[ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ] && [ -n "${ASC_KEY_PATH:-}" ] && key=1
auth=()
[ -n "$key" ] && auth=(-authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")

echo "Building KH Royals $(node -p "require('./app.json').expo.version") ($IOS_BUILD_NUMBER) for team $APPLE_TEAM_ID"
CI=1 npx expo prebuild --platform ios --clean
[ -d ios/Pods ] || { echo "pod install failed (prebuild doesn't stop for it); see above" >&2; exit 1; }

out=ios/build/testflight
mkdir -p "$out"
xcodebuild -workspace ios/KHRoyals.xcworkspace -scheme KHRoyals -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$out/KHRoyals.xcarchive" \
  -allowProvisioningUpdates ${auth[@]+"${auth[@]}"} archive

cat > "$out/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$APPLE_TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
EOF
xcodebuild -exportArchive -archivePath "$out/KHRoyals.xcarchive" \
  -exportOptionsPlist "$out/ExportOptions.plist" -exportPath "$out/export" -allowProvisioningUpdates ${auth[@]+"${auth[@]}"}

echo "Uploaded build $IOS_BUILD_NUMBER."
if [ -n "$key" ]; then
  if [ -n "${1:-}" ]; then node scripts/testflight_distribute.mjs "$IOS_BUILD_NUMBER" --note "$1"
  else node scripts/testflight_distribute.mjs "$IOS_BUILD_NUMBER"; fi
else
  echo "It shows up in App Store Connect → TestFlight once Apple has processed it; add it to the tester groups there"
  echo "(or set ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH to have this script do it)."
fi
