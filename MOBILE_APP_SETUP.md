# Buy Sell Trade SXM Mobile App

Capacitor is set up for the mobile app wrapper.

## App Identity

```text
App name: Buy Sell Trade SXM
Bundle/package ID: com.tchalaplus.mobile
Live app URL: https://buyselltradesxm.com
```

The bundle ID matches the Apple App ID that already has Sign in with Apple enabled.

## Commands

```bash
npm run cap:sync
npm run cap:assets
npm run cap:open:android
npm run cap:open:ios
```

## Android

The Android project is in `android/`.

To build on this Windows PC, install:

- Java JDK 21
- Android Studio
- Android SDK platform 36

After that:

```bash
cd android
.\gradlew.bat assembleDebug
```

The debug APK will be generated under:

```text
android/app/build/outputs/apk/debug/
```

## iOS

The iOS project is in `ios/`.

iOS can only be opened and built on a Mac with Xcode:

```bash
npm run cap:open:ios
```

Then in Xcode:

- Select the Apple Developer team
- Confirm bundle ID `com.tchalaplus.mobile`
- Archive for App Store Connect

## Notes

The current app loads the live PWA inside Capacitor, so website updates still come from `https://buyselltradesxm.com`.

Browser/PWA push notifications are already set up. Native App Store / Google Play push notifications use Apple APNs and Google FCM, so that should be a separate mobile-native push step before final store launch.
