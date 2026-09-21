// 页面层共享展示工具（不含业务规则）。

import type { VersionStatus } from "./types";

export const STATUS_LABEL: Record<VersionStatus, string> = {
  upcoming: "未生效",
  active: "生效中",
  expired: "已过期",
  withdrawn: "已撤回"
};

export const STATUS_CLASS: Record<VersionStatus, string> = {
  upcoming: "st-upcoming",
  active: "st-active",
  expired: "st-expired",
  withdrawn: "st-withdrawn"
};

export function formatRate(rate: number): string {
  // 0.95 -> "95折"，0.9 -> "9折"，0.875 -> "87.5折"
  const pct = rate * 100;
  const text = Number.isInteger(pct) ? String(pct) : String(+pct.toFixed(2));
  return `${text}折`;
}

export function money(value: number): string {
  return value.toFixed(2);
}
