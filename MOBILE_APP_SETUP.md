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

This Windows PC is now configured with:

- Java JDK 21
- Android Studio
- Android SDK platform 36
- Android build-tools 35/36
- Android platform-tools / ADB

Build a debug APK with:

```bash
cd android
.\gradlew.bat assembleDebug
```

The current debug APK is generated here:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

To install it on a connected Android phone:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

The phone must have Developer Options and USB debugging enabled.

An Android emulator is also configured on this PC:

```text
BuySellTradeSXM_Pixel8_API36
```

To launch the emulator and install the current debug APK:

```bash
emulator -avd BuySellTradeSXM_Pixel8_API36
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell monkey -p com.tchalaplus.mobile -c android.intent.category.LAUNCHER 1
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
