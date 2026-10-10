import { useEffect, useRef, useState } from "react";
import { Animated, Easing, ScrollView, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pearls } from "../ui/Pearls";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Notice";
import { Rise } from "../ui/Rise";
import { SlipBar } from "../ui/SlipBar";
import { Mark } from "../ui/Splash";
import { T } from "../ui/Type";
import { colors, portionColors } from "../ui/theme";
import type { Split } from "../ui/split";

const SHOWREEL: Split[] = [
  { home: 50, save: 30, stocks: 20 },
  { home: 70, save: 20, stocks: 10 },
  { home: 100, save: 0, stocks: 0 },
  { home: 40, save: 40, stocks: 20 },
];

function Portions() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((current) => (current + 1) % SHOWREEL.length), 2400);
    return () => clearInterval(timer);
  }, []);
  const split = SHOWREEL[index];
  const rows = [
    { key: "home" as const, name: "Home now", value: split.home },
    { key: "save" as const, name: "Savings that earn", value: split.save },
    { key: "stocks" as const, name: "US tech stocks", value: split.stocks },
  ];
  return (
    <View style={{ gap: 22, width: "100%" }}>
      <SlipBar split={split} />
      <View style={{ gap: 10 }}>
        {rows.map((row) => (
          <View key={row.key} style={{ flexDirection: "row", alignItems: "center", gap: 10, opacity: row.value === 0 ? 0.35 : 1 }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: portionColors[row.key].bg }} />
            <T variant="body" style={{ flex: 1 }}>{row.name}</T>
            <T variant="strong">{row.value}%</T>
          </View>
        ))}
      </View>
    </View>
  );
}

function Lands() {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(t, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }), Animated.delay(500), Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [t]);
  const track = 190;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 0 }}>
      <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#3f31a0" }}>
        <Mark size={30} />
      </View>
      <View style={{ width: track, height: 6, borderRadius: 3, backgroundColor: "rgba(111,82,245,0.18)", marginHorizontal: 6, justifyContent: "center" }}>
        <Animated.View
          style={{
            position: "absolute",
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: colors.accent,
            opacity: t.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] }),
            transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-8, track - 14] }) }],
          }}
        />
      </View>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.home, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#3f31a0" }}>
        <T variant="strong" color="#ffffff" style={{ fontFamily: "Satoshi-Black", fontSize: 26 }}>$</T>
      </View>
    </View>
  );
}

function Fingerprint() {
  const rings = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = rings.map((value, index) => {
      const loop = Animated.loop(Animated.sequence([Animated.delay(index * 700), Animated.timing(value, { toValue: 1, duration: 2100, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.delay((2 - index) * 700)]));
      loop.start();
      return loop;
    });
    return () => loops.forEach((loop) => loop.stop());
  }, [rings]);
  return (
    <View style={{ width: 220, height: 220, alignItems: "center", justifyContent: "center" }}>
      {rings.map((value, index) => (
        <Animated.View
          key={index}
          style={{
            position: "absolute",
            width: 120,
            height: 120,
            borderRadius: 60,
            borderWidth: 2,
            borderColor: colors.accent,
            opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
            transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
          }}
        />
      ))}
      <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", elevation: 8, shadowColor: "#3f31a0" }}>
        <Svg width={72} height={72} viewBox="0 0 48 48" fill="none">
          <Path d="M24 6c-9 0-16 7-16 16v4" stroke={colors.accent} strokeWidth={2.4} strokeLinecap="round" />
          <Path d="M40 24c0-9-7-16-16-16" stroke={colors.home} strokeWidth={2.4} strokeLinecap="round" />
          <Path d="M14 28v-5a10 10 0 0 1 20 0v3c0 4-1 8-3 12" stroke={colors.accent} strokeWidth={2.4} strokeLinecap="round" />
          <Path d="M20 40c1-3 2-6 2-10v-6a2 2 0 0 1 4 0v6c0 3 .6 6 1.6 9" stroke={colors.save} strokeWidth={2.4} strokeLinecap="round" />
          <Path d="M9 34c1-3 1.5-5 1.5-8" stroke={colors.save} strokeWidth={2.4} strokeLinecap="round" />
          <Circle cx={24} cy={24} r={1.6} fill={colors.home} />
        </Svg>
      </View>
    </View>
  );
}

type Props = {
  /** Skip the intro pages (they were seen before) and go straight to the account page. */
  lastPageOnly: boolean;
  busy: string | null;
  error: string | null;
  onCreate: () => void;
  onSignIn: () => void;
  /** Set when this phone already has an account: the last page just unlocks it. */
  onContinue?: () => void;
};

/** Three swipeable pages. The last one creates or opens the account. */
export function Onboarding({ lastPageOnly, busy, error, onCreate, onSignIn, onContinue }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const x = useRef(new Animated.Value(0)).current;
  const [page, setPage] = useState(lastPageOnly ? 2 : 0);

  useEffect(() => {
    if (lastPageOnly) scroll.current?.scrollTo({ x: width * 2, animated: false });
  }, [lastPageOnly, width]);

  const pages = [
    {
      title: "Don't just send it. Portion it.",
      body: "One payment pays today's bills, builds savings and buys stocks.",
      visual: <Portions />,
    },
    {
      title: "It lands in seconds.",
      body: "Straight into their own account. Portionly never holds your money.",
      visual: <Lands />,
    },
    {
      title: "Your fingerprint is your account.",
      body: "No passwords and no recovery words to lose. Your phone keeps it safe.",
      visual: <Fingerprint />,
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.sky }}>
      <Pearls />
      <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Mark size={36} />
        {page < 2 && <Button small variant="ghost" label="Skip" onPress={() => scroll.current?.scrollTo({ x: width * 2, animated: true })} />}
      </View>
      <Animated.ScrollView
        ref={scroll as never}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x } } }], { useNativeDriver: true })}
        onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}
        style={{ flex: 1 }}
      >
        {pages.map((item, index) => (
          <View key={item.title} style={{ width, paddingHorizontal: 28, justifyContent: "center", gap: 36 }}>
            <View style={{ alignItems: "center", justifyContent: "center", minHeight: 240 }}>{item.visual}</View>
            <View style={{ gap: 12 }}>
              <T variant="title" style={{ fontFamily: "Satoshi-Black", fontSize: 38, lineHeight: 42, letterSpacing: -1.4 }}>
                {item.title}
              </T>
              <T variant="body" color={colors.muted} style={{ fontSize: 18, lineHeight: 26 }}>
                {item.body}
              </T>
            </View>
          </View>
        ))}
      </Animated.ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24, gap: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, height: 10 }}>
          {pages.map((item, index) => (
            <Animated.View
              key={item.title}
              style={{
                width: 28,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.accent,
                opacity: x.interpolate({ inputRange: [(index - 1) * width, index * width, (index + 1) * width], outputRange: [0.25, 1, 0.25], extrapolate: "clamp" }),
                transform: [{ scaleX: x.interpolate({ inputRange: [(index - 1) * width, index * width, (index + 1) * width], outputRange: [0.3, 1, 0.3], extrapolate: "clamp" }) }],
              }}
            />
          ))}
        </View>
        {error && <Notice tone="error" text={error} />}
        {page === 2 ? (
          <Rise>
            <View style={{ gap: 12 }}>
              {onContinue ? (
                <Button label="Continue with my fingerprint" onPress={onContinue} loading={busy !== null} />
              ) : (
                <>
                  <Button label="Create my account" onPress={onCreate} loading={busy !== null} />
                  <Button variant="secondary" label="I already have an account" onPress={onSignIn} disabled={busy !== null} />
                </>
              )}
            </View>
          </Rise>
        ) : (
          <Button label="Next" onPress={() => scroll.current?.scrollTo({ x: width * (page + 1), animated: true })} />
        )}
      </View>
    </View>
  );
}
