/**
 * Minimal dependency-free SVG line chart for scenario volume-over-step
 * comparisons (plan section 2: "Lightweight SVG volume chart").
 */
export function renderVolumeChartSvg(
  series: { label: string; color: string; values: number[] }[],
  options: { width?: number; height?: number; padding?: number } = {},
): string {
  const width = options.width ?? 320;
  const height = options.height ?? 160;
  const padding = options.padding ?? 24;

  const allValues = series.flatMap((s) => s.values);
  const maxValue = Math.max(1, ...allValues);
  const stepCount = Math.max(1, ...series.map((s) => s.values.length - 1));

  const toX = (i: number) => padding + (i / stepCount) * (width - 2 * padding);
  const toY = (v: number) => height - padding - (v / maxValue) * (height - 2 * padding);

  const paths = series
    .map((s) => {
      const points = s.values.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
      return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2" />`;
    })
    .join("\n");

  const axis = `<line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="currentColor" stroke-opacity="0.3" />`;

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Scenario volume comparison">${axis}\n${paths}</svg>`;
}
