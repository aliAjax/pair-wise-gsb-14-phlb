// 基础数据目录：油品（含成本价/挂牌价）与会员等级。
// 这是规则判定与页面下拉的唯一数据来源。

import type { Fuel, MemberLevel, RuleDef, RuleCode } from "./types";

export const FUELS: readonly Fuel[] = [
  { code: "FU92", name: "92号汽油", cost: 7.41, listPrice: 7.62 },
  { code: "FU95", name: "95号汽油", cost: 7.88, listPrice: 8.11 },
  { code: "FU98", name: "98号汽油", cost: 8.86, listPrice: 9.18 },
  { code: "FU0", name: "柴油", cost: 6.93, listPrice: 7.18 }
];

export const MEMBER_LEVELS: readonly MemberLevel[] = [
  { code: "LV_NORMAL", name: "普通会员", rank: 1 },
  { code: "LV_SILVER", name: "银卡会员", rank: 2 },
  { code: "LV_GOLD", name: "金卡会员", rank: 3 },
  { code: "LV_DIAMOND", name: "钻石会员", rank: 4 }
];

/** 规则目录：编号 + 名称 + 说明。冲突项引用这里的定义，页面展示“触发规则”。 */
export const RULES: Record<RuleCode, RuleDef> = {
  R1_REQUIRED: {
    code: "R1_REQUIRED",
    name: "必填项校验",
    message: "油品、会员等级、折扣率与生效开始日期必须完整填写。"
  },
  R2_RATE_RANGE: {
    code: "R2_RATE_RANGE",
    name: "折扣率范围",
    message: "折扣率必须在 0.01~1（不含）之间，例如 0.95 表示 95 折。"
  },
  R3_INTERVAL: {
    code: "R3_INTERVAL",
    name: "区间合法性",
    message: "结束日期不得早于开始日期；生效开始日期不得早于今天。"
  },
  R4_BELOW_COST_APPROVAL: {
    code: "R4_BELOW_COST_APPROVAL",
    name: "低于成本价强制审批",
    message: "优惠后价格低于成本价时，必须填写审批编号，否则整单拒绝并保留草稿。"
  },
  R5_INTERVAL_OVERLAP: {
    code: "R5_INTERVAL_OVERLAP",
    name: "同油品同等级区间不得重叠",
    message: "同一油品、同一会员等级的有效策略区间不得相互重叠。"
  },
  R6_REASON_ON_REVISE: {
    code: "R6_REASON_ON_REVISE",
    name: "调价必须填写原因",
    message: "对已生效价格进行调价时，新版本必须填写调价原因。"
  },
  R7_WITHDRAW_ONLY_UPCOMING: {
    code: "R7_WITHDRAW_ONLY_UPCOMING",
    name: "仅允许撤回未生效项",
    message: "只有未生效（upcoming）的版本可以撤回；撤回后恢复上一版区间。"
  }
};

export function fuelByCode(code: string): Fuel | undefined {
  return FUELS.find((fuel) => fuel.code === code);
}

export function levelByCode(code: string): MemberLevel | undefined {
  return MEMBER_LEVELS.find((level) => level.code === code);
}

export function fuelName(code: string): string {
  return fuelByCode(code)?.name ?? code;
}

export function levelName(code: string): string {
  return levelByCode(code)?.name ?? code;
}

/** 优惠后价格（元/升），保留 4 位小数避免浮点误差 */
export function discountedPrice(listPrice: number, discountRate: number): number {
  return Math.round(listPrice * discountRate * 10000) / 10000;
}
