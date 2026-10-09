import type { ExpoConfig } from "expo/config";

const rpId = process.env.MERA_RP_ID;
if (!rpId) throw new Error("MERA_RP_ID is required to build the Android passkey app");

const config: ExpoConfig = {
  name: "Portionly",
  slug: "portionly",
  owner: "xtrabees-team",
  version: "0.1.0",
  orientation: "portrait",
  android: {
    package: "com.portionly.app",
    versionCode: 1,
  },
  plugins: [
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
  },
};

export default config;
