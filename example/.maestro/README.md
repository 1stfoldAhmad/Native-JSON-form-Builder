# Native iOS (SwiftUI) & Android (Jetpack Compose) E2E Verification

While `npm test` runs fast component, schema, security, ReDoS, performance, and `@expo/ui` iOS/Android bridge contract tests in Node, full simulator/emulator SwiftUI and Jetpack Compose runtime behavior is verified end-to-end with [Maestro](https://maestro.mobile.dev/).

## Prerequisites

1. Install Maestro CLI:
   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```
2. Boot an iOS Simulator or Android Emulator and run the example app:
   ```bash
   cd example
   npx expo run:ios      # SwiftUI native build on iOS Simulator
   npx expo run:android  # Jetpack Compose native build on Android Emulator
   ```

## Run Native Critical Flows Locally

```bash
cd example
maestro test .maestro/smoke-forms.yaml
```

## Run in GitHub Actions (iOS Simulator & Android Emulator)

Trigger **Native & Bundle Verification** (`.github/workflows/native-verify.yml`) via `workflow_dispatch` with:
- `run_maestro_ios: true` — builds the Release iOS Simulator app on `macos-15` and runs `.maestro/smoke-forms.yaml`.
- `run_maestro_android: true` — builds the Release Android APK with Gradle/JDK 17, boots a KVM-accelerated API 34 `x86_64` Android Emulator on `ubuntu-latest`, installs the APK, and runs `.maestro/smoke-forms.yaml`.
