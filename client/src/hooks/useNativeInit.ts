import { useEffect } from "react";
import { isNative } from "@/lib/native";

export function useNativeInit() {
  useEffect(() => {
    if (!isNative()) return;

    (async () => {
      const [{ SplashScreen }, { StatusBar, Style }] = await Promise.all([
        import("@capacitor/splash-screen"),
        import("@capacitor/status-bar"),
      ]);
      await SplashScreen.hide({ fadeOutDuration: 300 });
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: "#16324F" });
    })();
  }, []);
}
