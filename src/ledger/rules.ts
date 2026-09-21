// ============================================================
// 规则层：会员折扣台账的领域类型与纯函数规则（不含存储、不含页面）
// ============================================================

export const FUELS = ["92号汽油", "95号汽油", "98号汽油", "0号柴油"] as const;
export type Fuel = (typeof FUELS)[number];

export const MEMBER_TIERS = ["普通会员", "银卡会员", "金卡会员", "钻石会员"] as const;
export type MemberTier = (typeof MEMBER_TIERS)[number];

/** 版本状态全部由日期与撤回标记实时推导，不持久存储，避免刷新后不一致 */
export type VersionStatus = "未生效" | "生效中" | "已失效" | "已撤回";

export interface FuelPrice {
  fuel: Fuel;
  /** 挂牌价 */
  listPrice: number;
  /** 成本价 */
  costPrice: number;
  updatedAt: string;
}

/** 一条折扣策略的一个版本；版本只增不改（撤回仅打标记），旧价永远可查 */
export interface DiscountVersion {
  id: string;
  /** 版本链 ID：同一油品 + 同一等级的历次版本共用一条链 */
  chainId: string;
  versionNo: number;
  fuel: Fuel;
  tier: MemberTier;
  /** 折扣率（百分数）：88 表示八八折，优惠后价 = 挂牌价 × 88 / 100 */
  discountRatePercent: number;
  startAt: string;
  endAt: string | null; // null 表示长期有效
  /** 审批编号：优惠后低于成本价时必填 */
  approvalNo: string;
  /** 调价原因：修订已生效 / 已排期策略时必填 */
  reason: string;
  operator: string;
  createdAt: string;
  /** 上一版 ID（新建版本时为 null） */
  supersedesId: string | null;
  /** 建版时挂牌价快照，保证旧版本优惠后价可追溯 */
  snapshotListPrice: number;
  withdrawn: boolean;
  withdrawnAt: string | null;
  /** 建版前上一版 endAt 的快照，撤回本版时用于恢复上一版区间 */
  restoreEndAt: string | null;
}

export type RuleCode =
  | "INVALID_RANGE"
  | "OVERLAP"
  | "BELOW_COST_NO_APPROVAL"
  | "REVISION_REASON_REQUIRED"
  | "WITHDRAW_FORBIDDEN";

/** 规则台账：页面冲突列表中的“触发规则”列直接取这里的描述 */
export const RULE_META: Record<RuleCode, { rule: string; message: string }> = {
  INVALID_RANGE: {
    rule: "生效区间必须合法",
    message: "油品、等级、折扣率与生效日期必须完整，且开始日不得晚于结束日；修订版开始日不得早于今天。"
  },
  OVERLAP: {
    rule: "同一油品同等级区间不得重叠",
    message: "同一油品、同一会员等级只允许存在一条在该日生效的折扣版本。"
  },
  BELOW_COST_NO_APPROVAL: {
    rule: "优惠后低于成本价必须填审批编号",
    message: "优惠后价低于成本价的策略，未填写审批编号时整单拒绝并保留草稿。"
  },
  REVISION_REASON_REQUIRED: {
    rule: "已生效调价只能新建带原因版本",
    message: "对已生效或已排期的调价做调整，必须新建版本并填写调价原因，不能直接覆盖旧价。"
  },
  WITHDRAW_FORBIDDEN: {
    rule: "撤回只允许未生效项",
    message: "已生效 / 已失效版本不能撤回，只能新建带原因版本；撤回未生效项会自动恢复上一版区间。"
  }
};

export interface Conflict {
  ruleCode: RuleCode;
  /** 触发规则（人话描述） */
  rule: string;
  fuel: Fuel | "";
  tier: MemberTier | "";
  /** 冲突区间，如 2026-09-01 ~ 长期 */
  range: string;
  message: string;
}

/** 表单草稿内容（被整单拒绝时原样保留） */
export interface DiscountDraftInput {
  fuel: Fuel | "";
  tier: MemberTier | "";
  discountRatePercent: number | null;
  startAt: string;
  endAt: string | null;
  approvalNo: string;
  reason: string;
  operator: string;
}

export interface DraftState extends DiscountDraftInput {
  mode: "new" | "revision";
  predecessorId: string | null;
}

// ---------------- 纯函数：日期与区间 ----------------

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toISODate(new Date(y, m - 1, d + delta));
}

export function formatRange(startAt: string, endAt: string | null): string {
  return `${startAt || "未填"} ~ ${endAt ?? "长期"}`;
}

const FAR_FUTURE = "9999-12-31";

/** 闭区间重叠判定，null 结束日视为长期有效 */
export function rangesOverlap(
  a: { startAt: string; endAt: string | null },
  b: { startAt: string; endAt: string | null }
): boolean {
  const aEnd = a.endAt ?? FAR_FUTURE;
  const bEnd = b.endAt ?? FAR_FUTURE;
  return a.startAt <= bEnd && b.startAt <= aEnd;
}

// ---------------- 纯函数：价格与状态推导 ----------------

export function finalPrice(listPrice: number, discountRatePercent: number): number {
  return (listPrice * discountRatePercent) / 100;
}

export function formatMoney(value: number): string {
  return `¥${value.toFixed(2)}`;
}

export function isBelowCost(listPrice: number, costPrice: number, discountRatePercent: number): boolean {
  return finalPrice(listPrice, discountRatePercent) < costPrice;
}

export function deriveStatus(version: DiscountVersion, today: string = todayISO()): VersionStatus {
  if (version.withdrawn) return "已撤回";
  if (today < version.startAt) return "未生效";
  if (version.endAt !== null && today > version.endAt) return "已失效";
  return "生效中";
}

export const STATUS_TAG_TYPE: Record<VersionStatus, "success" | "warning" | "info" | "danger"> = {
  生效中: "success",
  未生效: "warning",
  已失效: "info",
  已撤回: "danger"
};

export function emptyDraft(): DraftState {
  return {
    mode: "new",
    predecessorId: null,
    fuel: "",
    tier: "",
    discountRatePercent: null,
    startAt: "",
    endAt: null,
    approvalNo: "",
    reason: "",
    operator: ""
  };
}

// ---------------- 纯函数：整单校验 ----------------

export interface ValidationContext {
  mode: "new" | "revision";
  predecessorId: string | null;
  versions: DiscountVersion[];
  fuelPrices: FuelPrice[];
  today: string;
}

/**
 * 校验整张草稿单：
 * 1) 字段与区间合法；修订版开始日不得早于今天
 * 2) 同油品同等级区间不得与其它版本重叠（修订时排除被修订的上一版）
 * 3) 优惠后低于成本价必须填审批编号
 * 4) 修订必须带调价原因
 * 任一不通过即整单拒绝。
 */
export function validateDraft(input: DiscountDraftInput, ctx: ValidationContext): Conflict[] {
  const conflicts: Conflict[] = [];
  const range = formatRange(input.startAt, input.endAt);

  if (!input.fuel) {
    conflicts.push({ ruleCode: "INVALID_RANGE", rule: RULE_META.INVALID_RANGE.rule, fuel: "", tier: input.tier, range: "—", message: "请选择油品。" });
  }
  if (!input.tier) {
    conflicts.push({ ruleCode: "INVALID_RANGE", rule: RULE_META.INVALID_RANGE.rule, fuel: input.fuel, tier: "", range: "—", message: "请选择会员等级。" });
  }
  if (input.discountRatePercent === null || input.discountRatePercent <= 0 || input.discountRatePercent > 100) {
    conflicts.push({
      ruleCode: "INVALID_RANGE",
      rule: RULE_META.INVALID_RANGE.rule,
      fuel: input.fuel,
      tier: input.tier,
      range,
      message: "折扣率必须在 0（不含）~ 100 之间，例如 88 表示八八折。"
    });
  }
  if (!input.startAt) {
    conflicts.push({
      ruleCode: "INVALID_RANGE",
      rule: RULE_META.INVALID_RANGE.rule,
      fuel: input.fuel,
      tier: input.tier,
      range,
      message: "请选择生效开始日。"
    });
  }
  if (input.endAt !== null && input.startAt && input.startAt > input.endAt) {
    conflicts.push({
      ruleCode: "INVALID_RANGE",
      rule: RULE_META.INVALID_RANGE.rule,
      fuel: input.fuel,
      tier: input.tier,
      range,
      message: `生效区间不合法：开始日 ${input.startAt} 晚于结束日 ${input.endAt}。`
    });
  }
  if (ctx.mode === "revision" && input.startAt && input.startAt < ctx.today) {
    conflicts.push({
      ruleCode: "INVALID_RANGE",
      rule: RULE_META.INVALID_RANGE.rule,
      fuel: input.fuel,
      tier: input.tier,
      range,
      message: `修订版本的开始日（${input.startAt}）不得早于今天（${ctx.today}），旧版本区间将自动截至前一天。`
    });
  }

  if (ctx.mode === "revision" && !input.reason.trim()) {
    conflicts.push({
      ruleCode: "REVISION_REASON_REQUIRED",
      rule: RULE_META.REVISION_REASON_REQUIRED.rule,
      fuel: input.fuel,
      tier: input.tier,
      range,
      message: RULE_META.REVISION_REASON_REQUIRED.message
    });
  }

  if (input.fuel && input.discountRatePercent !== null && input.discountRatePercent > 0 && input.discountRatePercent <= 100) {
    const price = ctx.fuelPrices.find((item) => item.fuel === input.fuel);
    if (price) {
      const final = finalPrice(price.listPrice, input.discountRatePercent);
      if (final < price.costPrice && !input.approvalNo.trim()) {
        conflicts.push({
          ruleCode: "BELOW_COST_NO_APPROVAL",
          rule: RULE_META.BELOW_COST_NO_APPROVAL.rule,
          fuel: input.fuel,
          tier: input.tier,
          range,
          message: `优惠后价 ${formatMoney(final)} 低于成本价 ${formatMoney(price.costPrice)}（挂牌价 ${formatMoney(price.listPrice)} × ${input.discountRatePercent}%），必须填写审批编号。`
        });
      }

      // 区间重叠：仅与同油品、同等级、未撤回的其它版本比较
      const others = ctx.versions.filter(
        (v) =>
          !v.withdrawn &&
          v.fuel === input.fuel &&
          v.tier === input.tier &&
          v.id !== ctx.predecessorId &&
          input.startAt
      );
      for (const other of others) {
        const candidate = { startAt: input.startAt, endAt: input.endAt };
        if (rangesOverlap(candidate, other)) {
          conflicts.push({
            ruleCode: "OVERLAP",
            rule: RULE_META.OVERLAP.rule,
            fuel: input.fuel,
            tier: input.tier,
            range,
            message: `与 v${other.versionNo}（${formatRange(other.startAt, other.endAt)}，${deriveStatus(other, ctx.today)}）区间重叠；若要调价请使用该版本的“新建版本”。`
          });
        }
      }
    }
  }

  return conflicts;
}
