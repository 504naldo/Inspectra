import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ca.inspectrafire.app",
  appName: "Inspectra",
  webDir: "dist/public",
  server: {
    // Use HTTPS scheme so cookies and tRPC work the same as on the web
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#16324F",
      androidSplashResourceName: "splash",
      androidSpinnerStyle: "small",
      splashFullScreen: true,
      splashImmersive: true,
      showSpinner: false,
    },
    StatusBar: {
      style: "Dark",
      backgroundColor: "#16324F",
    },
    Camera: {
      // Prompt the user once then remember; no re-prompting per session
      permissionType: "prompt-with-rationale",
    },
  },
};

export default config;
