import { useEffect } from "react";
import { isNative, platform } from "@/lib/native";
import { trpc } from "@/lib/trpc";

export function useNativeInit() {
  const registerToken = trpc.user.registerPushToken.useMutation();

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

      const { PushNotifications } = await import("@capacitor/push-notifications");
      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive === "granted") {
        await PushNotifications.register();
        const handler = await PushNotifications.addListener("registration", async (token) => {
          await handler.remove();
          registerToken.mutate({
            token: token.value,
            platform: platform() as "ios" | "android",
          });
        });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
