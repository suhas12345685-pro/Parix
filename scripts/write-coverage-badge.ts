import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd());
const summaryPath = resolve(root, "atrium/coverage/coverage-summary.json");
const badgePath = resolve(root, "docs/assets/coverage.svg");

if (!existsSync(summaryPath)) {
  throw new Error(`Coverage summary not found: ${summaryPath}`);
}

const summary = JSON.parse(readFileSync(summaryPath, "utf-8")) as {
  total?: { lines?: { pct?: number } };
};
const pct = Number(summary.total?.lines?.pct ?? 0);
const label = "coverage";
const value = `${pct.toFixed(1)}%`;
const color = colorForCoverage(pct);
const svg = renderBadge(label, value, color);

mkdirSync(dirname(badgePath), { recursive: true });
writeFileSync(badgePath, svg, "utf-8");
console.log(`Wrote ${badgePath} (${value})`);

function colorForCoverage(value: number): string {
  if (value >= 90) return "#16a34a";
  if (value >= 75) return "#65a30d";
  if (value >= 60) return "#ca8a04";
  return "#dc2626";
}

function renderBadge(labelText: string, valueText: string, color: string): string {
  const labelWidth = textWidth(labelText);
  const valueWidth = textWidth(valueText);
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${escapeXml(labelText)}: ${escapeXml(valueText)}">
  <title>${escapeXml(labelText)}: ${escapeXml(valueText)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${(labelWidth * 10) / 2}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(labelWidth - 10) * 10}">${escapeXml(labelText)}</text>
    <text x="${(labelWidth * 10) / 2}" y="140" transform="scale(.1)" textLength="${(labelWidth - 10) * 10}">${escapeXml(labelText)}</text>
    <text aria-hidden="true" x="${labelWidth * 10 + (valueWidth * 10) / 2}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(valueWidth - 10) * 10}">${escapeXml(valueText)}</text>
    <text x="${labelWidth * 10 + (valueWidth * 10) / 2}" y="140" transform="scale(.1)" textLength="${(valueWidth - 10) * 10}">${escapeXml(valueText)}</text>
  </g>
</svg>
`;
}

function textWidth(value: string): number {
  return Math.max(38, value.length * 7 + 10);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
