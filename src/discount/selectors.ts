// 派生查询层：基于规则刷新后的 policies 计算“当前价 / 版本链 / 看板”。
// 纯函数，供 store 与页面直接使用，保证刷新后策略、当前价和版本链来自同一份数据。

import {
  discountedPrice,
  fuelByCode,
  FUELS,
  levelByCode,
  MEMBER_LEVELS
} from "./catalog";
import { versionInEffect } from "./rules";
import { todayISO } from "./time";
import type { Policy, PolicyVersion } from "./types";

export function findPolicy(policies: Policy[], policyId: string): Policy | undefined {
  return policies.find((policy) => policy.id === policyId);
}

export function chainOf(
  policies: Policy[],
  fuelCode: string,
  levelCode: string
): Policy | undefined {
  return policies.find(
    (policy) => policy.fuelCode === fuelCode && policy.levelCode === levelCode
  );
}

/** 链上当前生效版本（同链不重叠，至多一个）；返回 null 表示当前无折扣策略。 */
export function activeVersionOf(policy: Policy, onDate: string = todayISO()): PolicyVersion | null {
  return policy.versions.find((version) => versionInEffect(version, onDate)) ?? null;
}

/** 链上最新一版（含 withdrawn，用于版本号/操作判定） */
export function latestVersion(policy: Policy): PolicyVersion | undefined {
  return policy.versions[policy.versions.length - 1];
}

/** 链上“有意义”的版本：撤回版本默认折叠，需要时可在页面展开 */
export function visibleVersions(policy: Policy, includeWithdrawn = false): PolicyVersion[] {
  return includeWithdrawn
    ? policy.versions
    : policy.versions.filter((version) => version.status !== "withdrawn");
}

export interface PriceRow {
  fuelCode: string;
  fuelName: string;
  cost: number;
  listPrice: number;
  levelCode: string;
  levelName: string;
  policyId: string | null;
  /** 当前生效版本；null = 该油品+等级当前无在执行折扣 */
  version: PolicyVersion | null;
  /** 当前会员价（无策略时等于挂牌价） */
  currentPrice: number;
  /** 是否低于成本价（必有审批编号） */
  belowCost: boolean;
}

/** 当前价看板：每个油品 × 每个会员等级一行，策略 / 价格 / 版本链共用同一份 policies。 */
export function priceBoard(policies: Policy[], onDate: string = todayISO()): PriceRow[] {
  const rows: PriceRow[] = [];
  for (const fuel of FUELS) {
    for (const level of MEMBER_LEVELS) {
      const policy = chainOf(policies, fuel.code, level.code) ?? null;
      const version = policy ? activeVersionOf(policy, onDate) : null;
      const currentPrice = version
        ? discountedPrice(fuel.listPrice, version.discountRate)
        : fuel.listPrice;
      rows.push({
        fuelCode: fuel.code,
        fuelName: fuel.name,
        cost: fuel.cost,
        listPrice: fuel.listPrice,
        levelCode: level.code,
        levelName: level.name,
        policyId: policy?.id ?? null,
        version,
        currentPrice,
        belowCost: currentPrice < fuel.cost
      });
    }
  }
  return rows;
}

export interface ChainSummary {
  policy: Policy;
  fuelCode: string;
  fuelName: string;
  levelCode: string;
  levelName: string;
  active: PolicyVersion | null;
  total: number;
  withdrawnCount: number;
}

/** 台账主表数据：每条版本链一行摘要。 */
export function chainSummaries(policies: Policy[], onDate: string = todayISO()): ChainSummary[] {
  return policies
    .map((policy) => {
      const fuel = fuelByCode(policy.fuelCode);
      const level = levelByCode(policy.levelCode);
      return {
        policy,
        fuelCode: policy.fuelCode,
        fuelName: fuel?.name ?? policy.fuelCode,
        levelCode: policy.levelCode,
        levelName: level?.name ?? policy.levelCode,
        active: activeVersionOf(policy, onDate),
        total: policy.versions.length,
        withdrawnCount: policy.versions.filter((v) => v.status === "withdrawn").length
      };
    })
    .sort((a, b) =>
      a.fuelCode === b.fuelCode
        ? a.levelCode.localeCompare(b.levelCode)
        : a.fuelCode.localeCompare(b.fuelCode)
    );
}

/** 看板统计 */
export function boardStats(rows: PriceRow[]) {
  const discounted = rows.filter((row) => row.version);
  const belowCost = rows.filter((row) => row.belowCost);
  return {
    chainCount: new Set(rows.filter((r) => r.policyId).map((r) => r.policyId)).size,
    discountedCount: discounted.length,
    belowCostCount: belowCost.length,
    avgDiscount: discounted.length
      ? discounted.reduce((sum, row) => sum + row.currentPrice, 0) / discounted.length
      : 0
  };
}
