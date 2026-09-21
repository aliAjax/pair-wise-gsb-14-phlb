// 存储层：台账快照的 localStorage 读写、种子装配与损坏回退。
// 规则层不感知存储；页面层只通过本模块读写。

import { seedPolicies } from "./seed-data";
import { todayISO } from "./time";
import type { Draft, LedgerState, Policy } from "./types";

const STORAGE_KEY = "dfwlfront-9-member-discount-ledger";
export const STORAGE_VERSION = 1;

function seedState(): LedgerState {
  return { policies: seedPolicies(), draft: null };
}

export interface LoadResult {
  state: LedgerState;
  /** 数据来源，页面可用于提示 */
  source: "storage" | "seed" | "corrupt-reset";
}

export function loadLedger(): LoadResult {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { state: seedState(), source: "seed" };
  try {
    const parsed = JSON.parse(raw) as Partial<LedgerState>;
    if (!Array.isArray(parsed.policies)) throw new Error("invalid shape");
    return {
      state: {
        policies: parsed.policies as Policy[],
        draft: (parsed.draft as Draft | null) ?? null
      },
      source: "storage"
    };
  } catch {
    // 数据损坏时回退到种子数据，保证页面可用
    return { state: seedState(), source: "corrupt-reset" };
  }
}

export function saveLedger(state: LedgerState): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: STORAGE_VERSION, ...state })
  );
}

export function clearLedger(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** 开发/排障用：当前存储键与基准日期 */
export const ledgerMeta = {
  storageKey: STORAGE_KEY,
  storageVersion: STORAGE_VERSION,
  today: todayISO()
};
