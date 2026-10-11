import type { ExpoConfig } from "expo/config";

const rpId = process.env.MERA_RP_ID;
if (!rpId) throw new Error("MERA_RP_ID is required to build the Android passkey app");

const config: ExpoConfig = {
  name: "Portionly",
  slug: "portionly",
  owner: "xtrabees-team",
  version: "0.4.0",
  scheme: "portionly",
  icon: "./assets/icon.png",
  orientation: "portrait",
  runtimeVersion: { policy: "appVersion" },
  updates: { url: "https://u.expo.dev/58a5c9d3-6b61-4b9d-8715-4ee79f20a7e9" },
  android: {
    package: "com.portionly.app",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-foreground.png", backgroundColor: "#ffffff" },
    // A money link opens the app straight on the collect screen. The site's Digital Asset Links file lets Android verify this.
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: rpId, pathPrefix: "/claim" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
    versionCode: 1,
  },
  plugins: [
    ["expo-splash-screen", { backgroundColor: "#e6f2fd", image: "./assets/splash-mark.png", imageWidth: 120 }],
    [
      "expo-secure-store",
      {
        "faceIDPermission": "Allow Portionly to unlock your passkey account.",
      },
    ],
  ],
  extra: {
    eas: { projectId: "58a5c9d3-6b61-4b9d-8715-4ee79f20a7e9" },
    rpId,
    splitterAddress: process.env.PORTIONLY_SPLITTER_ADDRESS ?? null,
    envioUrl: process.env.ENVIO_GRAPHQL_URL ?? null,
  },
};

export default config;
