# Wallet Note Play Store Edition

This Android Trusted Web Activity opens `/play-app`, which routes to the
server-enforced Play Edition. That edition contains Wallet Note and Mini Mart
features and does not expose 3D pages or APIs.

## Build

1. Install Bubblewrap and Android SDK 36.
2. Keep the upload keystore outside Git and pass it with
   `--signingKeyPath`.
3. Run `bubblewrap update`, then ensure `compileSdk` and `targetSdk` are 36.
   Bubblewrap currently regenerates `targetSdkVersion 35`, so restore it to 36
   before building.
4. Run `bubblewrap build` and provide the signing passwords when prompted.

The package ID is `online.maharshwe.walletnote`. It must not change after the
first Google Play release.
