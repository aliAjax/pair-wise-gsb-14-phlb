// ============================================================
// 存储层：Pinia + localStorage
// 只负责状态、持久化与版本链编排；所有判定规则来自 ./rules
// ============================================================

import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  DiscountDraftInput,
  DiscountVersion,
  DraftState,
  Fuel,
  FuelPrice,
  Conflict,
  RULE_META,
  addDaysISO,
  deriveStatus,
  emptyDraft,
  formatRange,
  todayISO,
  validateDraft
} from "./rules";

const VERSIONS_KEY = "dfwlfront-9-discount-versions";
const PRICES_KEY = "dfwlfront-9-discount-prices";
const DRAFT_KEY = "dfwlfront-9-discount-draft";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ---------------- 种子数据：固定日期，保证刷新后可复现 ----------------

function seedPrices(): FuelPrice[] {
  const stamp = "2026-09-01T08:00:00.000Z";
  return [
    { fuel: "92号汽油", listPrice: 7.62, costPrice: 7.10, updatedAt: stamp },
    { fuel: "95号汽油", listPrice: 8.15, costPrice: 7.70, updatedAt: stamp },
    { fuel: "98号汽油", listPrice: 9.28, costPrice: 8.90, updatedAt: stamp },
    { fuel: "0号柴油", listPrice: 7.18, costPrice: 6.80, updatedAt: stamp }
  ];
}

function seedVersions(): DiscountVersion[] {
  // 95号汽油 × 金卡会员：一条完整版本链（v1 旧价可查，v2 生效中）
  const v1: DiscountVersion = {
    id: "seed-95-gold-v1",
    chainId: "seed-chain-95-gold",
    versionNo: 1,
    fuel: "95号汽油",
    tier: "金卡会员",
    discountRatePercent: 95,
    startAt: "2026-07-01",
    endAt: "2026-09-14",
    approvalNo: "",
    reason: "",
    operator: "站长",
    createdAt: "2026-06-25T09:00:00.000Z",
    supersedesId: null,
    snapshotListPrice: 8.1,
    withdrawn: false,
    withdrawnAt: null,
    restoreEndAt: null
  };
  const v2: DiscountVersion = {
    id: "seed-95-gold-v2",
    chainId: "seed-chain-95-gold",
    versionNo: 2,
    fuel: "95号汽油",
    tier: "金卡会员",
    discountRatePercent: 88,
    startAt: "2026-09-15",
    endAt: null,
    approvalNo: "APR-2026-0901",
    reason: "秋季会员回馈，八八折优惠后价低于成本价，已报批。",
    operator: "站长",
    createdAt: "2026-09-10T09:30:00.000Z",
    supersedesId: v1.id,
    snapshotListPrice: 8.15,
    withdrawn: false,
    withdrawnAt: null,
    restoreEndAt: null
  };
  // 92号汽油 × 普通会员：未生效（已排期，可撤回）
  const v3: DiscountVersion = {
    id: "seed-92-normal-scheduled",
    chainId: "seed-chain-92-normal",
    versionNo: 1,
    fuel: "92号汽油",
    tier: "普通会员",
    discountRatePercent: 98,
    startAt: "2026-10-01",
    endAt: "2026-10-31",
    approvalNo: "",
    reason: "",
    operator: "值班经理",
    createdAt: "2026-09-15T14:00:00.000Z",
    supersedesId: null,
    snapshotListPrice: 7.62,
    withdrawn: false,
    withdrawnAt: null,
    restoreEndAt: null
  };
  // 0号柴油 × 银卡会员：已失效（旧价仍可在版本链中查看）
  const v4: DiscountVersion = {
    id: "seed-diesel-silver-expired",
    chainId: "seed-chain-diesel-silver",
    versionNo: 1,
    fuel: "0号柴油",
    tier: "银卡会员",
    discountRatePercent: 96,
    startAt: "2026-06-01",
    endAt: "2026-08-31",
    approvalNo: "",
    reason: "",
    operator: "站长",
    createdAt: "2026-05-28T10:00:00.000Z",
    supersedesId: null,
    snapshotListPrice: 7.2,
    withdrawn: false,
    withdrawnAt: null,
    restoreEndAt: null
  };
  return [v1, v2, v3, v4];
}

// ---------------- Store ----------------

export const useLedgerStore = defineStore("member-discount-ledger", () => {
  const prices = ref<FuelPrice[]>(parse(localStorage.getItem(PRICES_KEY), seedPrices()));
  const versions = ref<DiscountVersion[]>(parse(localStorage.getItem(VERSIONS_KEY), seedVersions()));
  const draft = ref<DraftState>(parse(localStorage.getItem(DRAFT_KEY), emptyDraft()));
  const conflicts = ref<Conflict[]>([]);

  function persistPrices() {
    localStorage.setItem(PRICES_KEY, JSON.stringify(prices.value));
  }
  function persistVersions() {
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions.value));
  }
  function persistDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft.value));
  }

  const visibleVersions = computed(() =>
    [...versions.value].sort((a, b) =>
      a.fuel === b.fuel
        ? a.tier === b.tier
          ? b.versionNo - a.versionNo
          : a.tier.localeCompare(b.tier)
        : a.fuel.localeCompare(b.fuel)
    )
  );

  const chains = computed(() => {
    const map = new Map<string, DiscountVersion[]>();
    for (const version of versions.value) {
      const list = map.get(version.chainId) ?? [];
      list.push(version);
      map.set(version.chainId, list);
    }
    return [...map.entries()]
      .map(([chainId, list]) => ({
        chainId,
        fuel: list[0].fuel,
        tier: list[0].tier,
        versions: [...list].sort((a, b) => b.versionNo - a.versionNo)
      }))
      .sort((a, b) =>
        a.fuel === b.fuel ? a.tier.localeCompare(b.tier) : a.fuel.localeCompare(b.fuel)
      );
  });

  function priceOf(fuel: Fuel): FuelPrice | undefined {
    return prices.value.find((item) => item.fuel === fuel);
  }

  /**
   * 当前价矩阵：刷新后与策略、版本链保持一致——
   * 状态全部由日期推导，当前生效版本唯一，无生效版本则该组合按挂牌价结算。
   */
  const currentPriceMatrix = computed(() => {
    const today = todayISO();
    return prices.value.map((price) => {
      const row: Record<string, number> = {};
      for (const version of versions.value) {
        if (
          version.fuel === price.fuel &&
          !version.withdrawn &&
          today >= version.startAt &&
          (version.endAt === null || today <= version.endAt)
        ) {
          row[version.tier] = (version.snapshotListPrice * version.discountRatePercent) / 100;
        }
      }
      return { fuel: price.fuel, listPrice: price.listPrice, costPrice: price.costPrice, byTier: row };
    });
  });

  function getVersion(id: string): DiscountVersion | undefined {
    return versions.value.find((item) => item.id === id);
  }

  // ---- 草稿：整单被拒时保留，刷新后仍在 ----
  function updateDraft(patch: Partial<DraftState>) {
    Object.assign(draft.value, patch);
    persistDraft();
  }

  function clearDraft() {
    draft.value = emptyDraft();
    persistDraft();
  }

  /** 进入“新建版本”：已生效/已排期的调价不允许直接改，只能带原因新建 */
  function startRevision(id: string) {
    const predecessor = getVersion(id);
    if (!predecessor) return;
    const today = todayISO();
    draft.value = {
      mode: "revision",
      predecessorId: predecessor.id,
      fuel: predecessor.fuel,
      tier: predecessor.tier,
      discountRatePercent: predecessor.discountRatePercent,
      startAt: today,
      endAt: predecessor.endAt && predecessor.endAt < today ? null : predecessor.endAt,
      approvalNo: predecessor.approvalNo,
      reason: "",
      operator: predecessor.operator
    };
    conflicts.value = [];
    persistDraft();
  }

  /**
   * 提交整单：任何规则冲突都整单拒绝，事务式（不产生半截版本），草稿原样保留。
   */
  function submit(input: DiscountDraftInput): { ok: boolean; conflicts: Conflict[] } {
    const found = validateDraft(input, {
      mode: draft.value.mode,
      predecessorId: draft.value.predecessorId,
      versions: versions.value,
      fuelPrices: prices.value,
      today: todayISO()
    });
    conflicts.value = found;
    if (found.length > 0) {
      Object.assign(draft.value, input);
      persistDraft();
      return { ok: false, conflicts: found };
    }

    const fuel = input.fuel as Fuel;
    const price = priceOf(fuel)!;
    const predecessor = draft.value.predecessorId ? getVersion(draft.value.predecessorId) : undefined;

    const chainVersions = versions.value.filter(
      (v) =>
        v.fuel === fuel &&
        v.tier === input.tier &&
        (!predecessor ? !v.withdrawn : true)
    );
    const chainId = predecessor?.chainId ?? chainVersions[0]?.chainId ?? uid();
    const versionNo = chainVersions.length
      ? Math.max(...chainVersions.map((v) => v.versionNo)) + 1
      : 1;

    const created: DiscountVersion = {
      id: uid(),
      chainId,
      versionNo,
      fuel,
      tier: input.tier as DiscountVersion["tier"],
      discountRatePercent: input.discountRatePercent!,
      startAt: input.startAt,
      endAt: input.endAt,
      approvalNo: input.approvalNo.trim(),
      reason: input.reason.trim(),
      operator: input.operator.trim() || "未填写",
      createdAt: new Date().toISOString(),
      supersedesId: predecessor?.id ?? null,
      snapshotListPrice: price.listPrice,
      withdrawn: false,
      withdrawnAt: null,
      restoreEndAt: null
    };

    // 修订：旧版区间截至新版开始日前一天（旧价继续可查，不删不改折扣值）
    if (predecessor && predecessor.startAt < created.startAt && predecessor.endAt !== created.startAt) {
      const cutEnd = addDaysISO(created.startAt, -1);
      if (predecessor.endAt === null || predecessor.endAt >= created.startAt) {
        created.restoreEndAt = predecessor.endAt;
        predecessor.endAt = cutEnd;
      }
    }

    versions.value = [...versions.value, created];
    persistVersions();
    clearDraft();
    conflicts.value = [];
    return { ok: true, conflicts: [] };
  }

  /**
   * 撤回：只允许未生效项；撤回时按快照恢复上一版区间（恢复上一版）。
   * 已生效 / 已失效项返回规则冲突，需走“新建版本”。
   */
  function withdraw(id: string): Conflict | null {
    const version = getVersion(id);
    if (!version) return null;
    const status = deriveStatus(version);
    if (status !== "未生效") {
      return {
        ruleCode: "WITHDRAW_FORBIDDEN",
        rule: RULE_META.WITHDRAW_FORBIDDEN.rule,
        fuel: version.fuel,
        tier: version.tier,
        range: formatRange(version.startAt, version.endAt),
        message: `v${version.versionNo} 当前为「${status}」，不能撤回；请使用“新建版本”并填写调价原因。`
      };
    }

    version.withdrawn = true;
    version.withdrawnAt = new Date().toISOString();

    if (version.supersedesId) {
      const previous = getVersion(version.supersedesId);
      if (previous && !previous.withdrawn) {
        previous.endAt = version.restoreEndAt;
      }
    }

    if (draft.value.mode === "revision" && draft.value.predecessorId === version.id) {
      clearDraft();
    }
    persistVersions();
    return null;
  }

  function saveFuelPrice(fuel: Fuel, listPrice: number, costPrice: number) {
    const existing = priceOf(fuel);
    if (existing) {
      existing.listPrice = listPrice;
      existing.costPrice = costPrice;
      existing.updatedAt = new Date().toISOString();
    } else {
      prices.value.push({ fuel, listPrice, costPrice, updatedAt: new Date().toISOString() });
    }
    persistPrices();
  }

  return {
    prices,
    versions,
    visibleVersions,
    chains,
    draft,
    conflicts,
    currentPriceMatrix,
    priceOf,
    getVersion,
    updateDraft,
    clearDraft,
    startRevision,
    submit,
    withdraw,
    saveFuelPrice
  };
});
