# Native iOS (SwiftUI) & Android (Jetpack Compose) E2E Verification

While `npm test` runs fast component, schema, security, and `@expo/ui` iOS/Android bridge contract tests in Node, physical/simulator SwiftUI and Jetpack Compose runtime behavior can be verified end-to-end with [Maestro](https://maestro.mobile.dev/):

## Prerequisites

1. Install Maestro CLI:
   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```
2. Boot an iOS Simulator or Android Emulator and run the example app (either via **Expo Go SDK 58+** or a development build):
   ```bash
   cd example
   npx expo run:ios    # or: npx expo run:android
   ```

## Run Native Flows

```bash
cd example
maestro test .maestro/smoke-forms.yaml
```
