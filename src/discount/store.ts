// 状态层（Pinia）：页面唯一的数据入口。
// 只做“编排”：校验/状态流转调规则层，读写调存储层；自身不写业务规则。

import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  discountedPrice,
  fuelByCode,
  levelByCode
} from "./catalog";
import {
  applySubmission,
  emptyDraft,
  refreshStatuses,
  validateDraft,
  withdrawVersion
} from "./rules";
import {
  activeVersionOf,
  boardStats,
  chainSummaries,
  findPolicy,
  priceBoard
} from "./selectors";
import { loadLedger, saveLedger, type LoadResult } from "./storage";
import { formatRange, todayISO } from "./time";
import type { Conflict, Draft, PolicyVersion } from "./types";

export interface SubmitResult {
  ok: boolean;
  conflicts: Conflict[];
  version?: PolicyVersion;
}

export const useLedgerStore = defineStore("member-discount-ledger", () => {
  const today = ref(todayISO());
  const policies = ref<ReturnType<typeof refreshStatuses>>([]);
  const draft = ref<Draft>(emptyDraft(today.value));
  const conflicts = ref<Conflict[]>([]);
  /** 是否处于“整单被拒绝”状态：仅提交失败（或恢复了带冲突的草稿）后展示冲突清单 */
  const rejected = ref(false);
  const lastMessage = ref("");
  const dataSource = ref<LoadResult["source"]>("seed");

  // ------------------------------------------------------------ 初始化 / 刷新

  function init() {
    const { state, source } = loadLedger();
    dataSource.value = source;
    policies.value = refreshStatuses(state.policies, today.value);
    draft.value = state.draft ?? emptyDraft(today.value);
    // 恢复的草稿若仍不合法，视为上次被整单拒绝，继续展示冲突清单
    const restored = state.draft ? validateDraft(state.draft, policies.value, today.value) : [];
    conflicts.value = restored;
    rejected.value = restored.length > 0;
    lastMessage.value =
      source === "storage"
        ? restored.length > 0
          ? "已恢复上次被拒绝的草稿，请按冲突清单修正后重新提交"
          : "已从本地存储恢复台账（策略、当前价、版本链一致）"
        : source === "seed"
          ? "首次打开，已载入示例台账"
          : "本地数据损坏，已回退到示例台账";
  }

  /** 手动刷新：以今天为基准重算状态，再重新落库，保证三者一致 */
  function refresh() {
    policies.value = refreshStatuses(policies.value, today.value);
    persist();
    conflicts.value = rejected.value
      ? validateDraft(draft.value, policies.value, today.value)
      : [];
    lastMessage.value = `已刷新：策略状态、当前价与版本链已按 ${today.value} 重新对齐`;
  }

  function persist() {
    saveLedger({ policies: policies.value, draft: draft.value });
  }

  // ------------------------------------------------------------ 草稿编辑

  function updateDraft(patch: Partial<Draft>) {
    draft.value = { ...draft.value, ...patch, updatedAt: new Date().toISOString() };
    // 编辑时即时预检；只有已经处于“被拒绝”状态时才持续展示冲突清单
    if (rejected.value) {
      conflicts.value = validateDraft(draft.value, policies.value, today.value);
    }
    persist();
  }

  function discardDraft() {
    draft.value = emptyDraft(today.value);
    conflicts.value = [];
    rejected.value = false;
    persist();
  }

  /** 进入“调价”模式：以某链当前生效版本为基础生成草稿（必须填原因） */
  function startRevise(policyId: string) {
    const policy = findPolicy(policies.value, policyId);
    if (!policy) return;
    const active = activeVersionOf(policy, today.value);
    if (!active) return;
    draft.value = {
      fuelCode: policy.fuelCode,
      levelCode: policy.levelCode,
      discountRate: active.discountRate,
      startDate: today.value,
      endDate: active.originalEndDate,
      approvalNo: "",
      reason: "",
      operator: active.operator,
      updatedAt: new Date().toISOString(),
      revise: { policyId, fromVersionId: active.id }
    };
    conflicts.value = [];
    rejected.value = false;
    persist();
    lastMessage.value = `已基于生效版本 V${active.versionNo} 创建调价草稿，旧价将继续保留可查`;
  }

  // ------------------------------------------------------------ 提交

  function submit(): SubmitResult {
    const found = validateDraft(draft.value, policies.value, today.value);
    conflicts.value = found;
    if (found.length > 0) {
      // 整单拒绝：草稿原样保留（已通过 updateDraft 持久化，刷新后仍在）
      rejected.value = true;
      persist();
      lastMessage.value = `整单拒绝：命中 ${found.length} 条规则，草稿已保留`;
      return { ok: false, conflicts: found };
    }

    const result = applySubmission(policies.value, draft.value, {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      onDate: today.value
    });
    policies.value = refreshStatuses(result.policies, today.value);
    const submitted = result.version;
    draft.value = emptyDraft(today.value);
    conflicts.value = [];
    rejected.value = false;
    persist();
    lastMessage.value = submitted
      ? `已保存 V${submitted.versionNo}（${formatRange(submitted.startDate, submitted.endDate)}），旧价保留在版本链中可查`
      : "已保存";
    return { ok: true, conflicts: [], version: submitted };
  }

  // ------------------------------------------------------------ 撤回

  function withdraw(policyId: string, versionId: string): Conflict[] {
    const result = withdrawVersion(policies.value, policyId, versionId, today.value);
    if (result.conflicts.length > 0) {
      conflicts.value = result.conflicts;
      rejected.value = true;
      lastMessage.value = "撤回被拒绝";
      return result.conflicts;
    }
    policies.value = result.policies;
    persist();
    conflicts.value = [];
    rejected.value = false;
    lastMessage.value = "已撤回未生效版本，上一版区间已恢复";
    return [];
  }

  // ------------------------------------------------------------ 派生数据

  const board = computed(() => priceBoard(policies.value, today.value));
  const chains = computed(() => chainSummaries(policies.value, today.value));
  const stats = computed(() => boardStats(board.value));

  /** 表单实时预览：优惠后价、是否低于成本 */
  const draftPreview = computed(() => {
    const fuel = fuelByCode(draft.value.fuelCode);
    const rate = draft.value.discountRate;
    if (!fuel || rate === null) return null;
    const price = discountedPrice(fuel.listPrice, rate);
    return {
      listPrice: fuel.listPrice,
      cost: fuel.cost,
      price,
      belowCost: price < fuel.cost,
      levelName: levelByCode(draft.value.levelCode)?.name ?? ""
    };
  });

  return {
    today,
    policies,
    draft,
    conflicts,
    rejected,
    lastMessage,
    dataSource,
    board,
    chains,
    stats,
    draftPreview,
    init,
    refresh,
    updateDraft,
    discardDraft,
    startRevise,
    submit,
    withdraw
  };
});
