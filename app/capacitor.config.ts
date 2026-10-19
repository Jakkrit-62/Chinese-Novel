import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.chinesenovel.reader",
  appName: "Hanzi Reader",
  webDir: "out",
  server: {
    androidScheme: "https",
    // lets the app reach a self-hosted FastAPI backend over plain http on a LAN
    cleartext: true,
  },
};

export default config;
