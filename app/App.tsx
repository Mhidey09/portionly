import { useFonts } from "expo-font";
import { useCallback, useEffect, useState } from "react";
import { BackHandler, Keyboard, StatusBar, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Home } from "./src/screens/Home";
import { Money } from "./src/screens/Money";
import { Onboarding } from "./src/screens/Onboarding";
import { Receive } from "./src/screens/Receive";
import { LinkSuccess, Send, SendSuccess } from "./src/screens/Send";
import { loadOnboarded, saveOnboarded } from "./src/storage";
import { Splash } from "./src/ui/Splash";
import { TabBar, type TabKey } from "./src/ui/TabBar";
import { colors } from "./src/ui/theme";
import { usePortionly } from "./src/usePortionly";

function Root() {
  const p = usePortionly();
  const [tab, setTab] = useState<TabKey>("home");
  const [splashDone, setSplashDone] = useState(false);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    loadOnboarded().then(setOnboarded).catch(() => setOnboarded(false));
  }, []);

  // The intro shows once on every phone, and ends when the account is open.
  useEffect(() => {
    if (p.wallets && onboarded === false) {
      setOnboarded(true);
      void saveOnboarded().catch(() => undefined);
    }
  }, [p.wallets, onboarded]);

  // Returning users get the fingerprint prompt straight away, once, instead of hunting for an unlock button.
  const [askedUnlock, setAskedUnlock] = useState(false);
  useEffect(() => {
    if (!splashDone || !p.ready || onboarded !== true || askedUnlock) return;
    if (p.address && !p.wallets && p.busy === null) {
      setAskedUnlock(true);
      void p.connect("unlock");
    }
  }, [splashDone, p.ready, onboarded, askedUnlock, p.address, p.wallets, p.busy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboard(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Wallets other than Main only matter on the Send tab, so go back to Main anywhere else.
  const go = useCallback(
    (next: TabKey) => {
      if (next !== "send" && (p.activeIndex !== 0 || p.payee)) p.selectAccount(0, "");
      setTab(next);
    },
    [p.activeIndex, p.payee, p.selectAccount], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (p.linkResult) {
        p.setLinkResult(null);
        go("home");
        return true;
      }
      if (p.result) {
        p.setResult(null);
        go("home");
        return true;
      }
      if (p.review || p.linkReview) {
        p.setReview(null);
        return true;
      }
      if (tab !== "home") {
        go("home");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [tab, p.result, p.review, p.linkResult, p.linkReview, go]); // eslint-disable-line react-hooks/exhaustive-deps

  const loaded = p.ready && onboarded !== null;
  let body = <View style={{ flex: 1, backgroundColor: colors.sky }} />;
  if (loaded && (!p.address || onboarded === false)) {
    body = (
      <Onboarding
        lastPageOnly={onboarded === true}
        busy={p.busy}
        error={p.error}
        onCreate={() => void p.connect("create")}
        onSignIn={() => void p.connect("signin")}
        onContinue={p.address ? () => void p.connect("unlock") : undefined}
      />
    );
  } else if (loaded) {
    body = (
      <View style={{ flex: 1 }}>
        {tab === "home" && <Home p={p} go={go} />}
        {tab === "send" && <Send p={p} />}
        {tab === "receive" && <Receive p={p} />}
        {tab === "money" && <Money p={p} />}
        {!keyboard && !p.result && !p.linkResult && <TabBar active={tab} onChange={go} />}
        {p.linkResult && (
          <LinkSuccess
            p={p}
            onDone={() => {
              p.setLinkResult(null);
              p.setTotalInput("");
              go("home");
            }}
          />
        )}
        {p.result && (
          <SendSuccess
            p={p}
            onDone={() => {
              p.setResult(null);
              p.setTotalInput("");
              go("home");
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.sky }}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.sky} />
      {body}
      {!splashDone && <Splash onDone={finishSplash} />}
    </View>
  );
}

export default function App() {
  // Hold everything until Satoshi is ready, so no screen ever flashes in the wrong font.
  const [fontsLoaded, fontError] = useFonts({
    "Satoshi-Regular": require("./assets/fonts/Satoshi-Regular.ttf"),
    "Satoshi-Medium": require("./assets/fonts/Satoshi-Medium.ttf"),
    "Satoshi-Bold": require("./assets/fonts/Satoshi-Bold.ttf"),
    "Satoshi-Black": require("./assets/fonts/Satoshi-Black.ttf"),
  });
  return (
    <SafeAreaProvider>
      {fontsLoaded || fontError ? <Root /> : <View style={{ flex: 1, backgroundColor: colors.sky }} />}
    </SafeAreaProvider>
  );
}
