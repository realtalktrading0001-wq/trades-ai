// Timezone-aware time formatting. Timezone strings look like "UTC+5:30 (Mumbai)"
// or "UTC-5 (New York)"; we parse the offset and format an absolute timestamp in
// that zone. Falls back to the device's local time if the offset can't be parsed.

export function tzOffsetMinutes(tz: string | null | undefined): number | null {
  const m = (tz ?? '').match(/UTC\s*([+-])\s*(\d{1,2})(?::(\d{2}))?/i);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatHHMM(ts: number, tz: string | null | undefined): string {
  const off = tzOffsetMinutes(tz);
  const d = new Date(ts);
  if (off === null) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  let total = d.getUTCHours() * 60 + d.getUTCMinutes() + off;
  total = ((total % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
