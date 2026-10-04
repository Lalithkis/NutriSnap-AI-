import { Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { colors, font, radius } from "@/theme";

export function ProgressRing({ size = 200, stroke = 16, progress, color = colors.primary, children, label }: {
  size?: number; stroke?: number; progress: number; color?: string; children?: React.ReactNode; label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  const over = progress > 1;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessible accessibilityLabel={label}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r} stroke={over ? colors.warning : color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - p)} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

export function MacroBar({ label, value, target, color, unit = "g" }: { label: string; value: number; target: number; color: string; unit?: string }) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <View style={{ gap: 6, flex: 1 }} accessible accessibilityLabel={`${label}: ${Math.round(value)} of ${target} ${unit}`}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[font.small, { color: colors.text, fontWeight: "600" }]}>{label}</Text>
        <Text style={font.tiny}>{Math.round(value)}/{target}{unit}</Text>
      </View>
      <View style={{ height: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, overflow: "hidden" }}>
        <View style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: color, borderRadius: radius.pill }} />
      </View>
    </View>
  );
}

/** Simple vertical bar chart with an optional target line. Values of null render as "no data". */
export function BarChart({ data, target, color = colors.primary, height = 160, unit = "", label }: {
  data: { label: string; value: number | null }[]; target?: number; color?: string; height?: number; unit?: string; label: string;
}) {
  const width = 320;
  const pad = { l: 8, r: 8, t: 12, b: 22 };
  const max = Math.max(1, target ?? 0, ...data.map((d) => d.value ?? 0)) * 1.1;
  const bw = (width - pad.l - pad.r) / Math.max(1, data.length);
  const y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - v / max);
  const step = Math.ceil(data.length / 8);
  const desc = data.map((d) => `${d.label}: ${d.value == null ? "no data" : Math.round(d.value) + unit}`).join(", ");
  return (
    <View accessible accessibilityLabel={`${label}. ${desc}`}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {data.map((d, i) => (
          <Rect key={i} x={pad.l + i * bw + bw * 0.15} y={d.value == null ? y(0) - 2 : y(d.value)} width={bw * 0.7}
            height={d.value == null ? 2 : Math.max(2, y(0) - y(d.value))} rx={3} fill={d.value == null ? colors.border : color} />
        ))}
        {target ? <Line x1={pad.l} x2={width - pad.r} y1={y(target)} y2={y(target)} stroke={colors.textMuted} strokeDasharray="4 4" strokeWidth={1} /> : null}
        {data.map((d, i) => i % step === 0 ? (
          <SvgText key={`l${i}`} x={pad.l + i * bw + bw / 2} y={height - 6} fontSize={10} fill={colors.textFaint} textAnchor="middle">{d.label}</SvgText>
        ) : null)}
      </Svg>
    </View>
  );
}

export function LineChart({ points, height = 160, color = colors.primary, label, unit = "" }: { points: { label: string; value: number }[]; height?: number; color?: string; label: string; unit?: string }) {
  const width = 320;
  if (points.length === 0) return null;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = Math.max(1, hi - lo);
  const x = (i: number) => 16 + (i * (width - 32)) / Math.max(1, points.length - 1);
  const y = (v: number) => 14 + (height - 40) * (1 - (v - lo) / span);
  return (
    <View accessible accessibilityLabel={`${label}. ${points.map((p) => `${p.label}: ${p.value}${unit}`).join(", ")}`}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke={color} strokeWidth={2.5} />
        {points.map((p, i) => <Circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} fill={color} />)}
        <SvgText x={16} y={height - 6} fontSize={10} fill={colors.textFaint}>{points[0].label}</SvgText>
        <SvgText x={width - 16} y={height - 6} fontSize={10} fill={colors.textFaint} textAnchor="end">{points[points.length - 1].label}</SvgText>
        <SvgText x={width - 16} y={12} fontSize={10} fill={colors.textFaint} textAnchor="end">{`${hi}${unit}`}</SvgText>
      </Svg>
    </View>
  );
}
