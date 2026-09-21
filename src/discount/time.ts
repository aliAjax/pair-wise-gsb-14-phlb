// 纯日期工具：统一按 UTC 解析 “YYYY-MM-DD”，避免时区误差。
// 不依赖任何业务模型，可被规则层与页面层共同使用。

export const DAY_MS = 24 * 60 * 60 * 1000;

/** 取本地今天的 YYYY-MM-DD */
export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD -> UTC 时间戳（当日 00:00） */
export function toTime(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export function isValidISO(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(toTime(iso));
}

export function addDays(iso: string, days: number): string {
  return new Date(toTime(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 生成“今天 + 偏移天数”的日期串，便于种子数据按当前日期生效 */
export function isoFromToday(offsetDays: number): string {
  return addDays(todayISO(), offsetDays);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toTime(b) - toTime(a)) / DAY_MS);
}

/** 两个闭区间是否重叠（null 终点表示长期有效） */
export function overlaps(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  return !(
    (aEnd !== null && toTime(aEnd) < toTime(bStart)) ||
    (bEnd !== null && toTime(bEnd) < toTime(aStart))
  );
}

/** 区间是否在基准日仍有效（含当天） */
export function isInEffect(
  start: string,
  end: string | null,
  onDate: string = todayISO(),
): boolean {
  const t = toTime(onDate);
  return toTime(start) <= t && (end === null || t <= toTime(end));
}

export function formatRange(start: string, end: string | null): string {
  return `${start} 至 ${end ?? "长期"}`;
}

export function formatISODate(iso: string): string {
  if (!isValidISO(iso)) return iso;
  return iso.replace(/-/g, "/");
}
