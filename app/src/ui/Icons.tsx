import Svg, { Circle, Path } from "react-native-svg";

export type IconName = "home" | "send" | "receive" | "money";

/** Simple stroke icons for the tab bar. */
export function Icon({ name, color, size = 24 }: { name: IconName; color: string; size?: number }) {
  const common = { stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "home" && (
        <>
          <Path d="M3 11.5 12 4l9 7.5" {...common} />
          <Path d="M5.5 10v9.5h13V10" {...common} />
          <Path d="M10 19.5v-5h4v5" {...common} />
        </>
      )}
      {name === "send" && <Path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7z" {...common} />}
      {name === "receive" && (
        <>
          <Path d="M12 4v11" {...common} />
          <Path d="M7.5 10.5 12 15l4.5-4.5" {...common} />
          <Path d="M4 17v2.5h16V17" {...common} />
        </>
      )}
      {name === "money" && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...common} />
          <Path d="M12 6.5v11" {...common} />
          <Path d="M14.6 9.4c-.6-.8-1.5-1.2-2.6-1.2-1.4 0-2.5.8-2.5 1.9 0 2.6 5 1.4 5 4 0 1.1-1.1 1.9-2.5 1.9-1.1 0-2-.5-2.6-1.3" {...common} />
        </>
      )}
    </Svg>
  );
}

export function Tick({ size = 40, color = "#ffffff" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12.5 10 17.5 19 7" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
