// 种子数据：首次打开（或本地数据损坏回退）时的示例台账。
// 独立成模块，供 storage 层与规则验证脚本共用，不接触 localStorage。

import { isoFromToday } from "./time";
import type { Policy, PolicyVersion, VersionStatus } from "./types";

function version(
  partial: Omit<PolicyVersion, "status" | "originalEndDate"> &
    Partial<Pick<PolicyVersion, "status" | "originalEndDate">>
): PolicyVersion {
  return {
    ...partial,
    // 显式 null（长期有效）不能被 ?? 吞掉，按“是否提供该字段”决定
    originalEndDate: "originalEndDate" in partial
      ? partial.originalEndDate!
      : partial.endDate,
    status: partial.status ?? ("upcoming" as VersionStatus)
  };
}

export function seedPolicies(): Policy[] {
  const now = new Date();
  const createdAt = (offsetDays: number) =>
    new Date(now.getTime() - offsetDays * 86400000).toISOString();

  return [
    // 92号汽油 × 银卡：长期 98 折（7.62×0.98=7.4676，不低于成本 7.41）
    {
      id: "seed-policy-92-silver",
      fuelCode: "FU92",
      levelCode: "LV_SILVER",
      createdAt: createdAt(30),
      versions: [
        version({
          id: "seed-92-silver-v1",
          versionNo: 1,
          discountRate: 0.98,
          startDate: isoFromToday(-30),
          endDate: null,
          approvalNo: "",
          reason: "挂牌价维护：银卡长期优惠",
          operator: "站长",
          createdAt: createdAt(30)
        })
      ]
    },
    // 95号汽油 × 金卡：V1 已过期、V2 当前生效，均低于成本价，带审批编号
    {
      id: "seed-policy-95-gold",
      fuelCode: "FU95",
      levelCode: "LV_GOLD",
      createdAt: createdAt(40),
      versions: [
        version({
          id: "seed-95-gold-v1",
          versionNo: 1,
          discountRate: 0.95,
          startDate: isoFromToday(-40),
          endDate: isoFromToday(-11),
          approvalNo: "AP-2026-0018",
          reason: "季度促销，会员拉新",
          operator: "站长",
          createdAt: createdAt(40)
        }),
        version({
          id: "seed-95-gold-v2",
          versionNo: 2,
          discountRate: 0.92,
          startDate: isoFromToday(-10),
          endDate: null,
          approvalNo: "AP-2026-0042",
          reason: "竞品站点降价，跟进维持金卡客流",
          operator: "区域经理",
          createdAt: createdAt(10)
        })
      ]
    },
    // 92号汽油 × 金卡：V1 当前生效但被 V2 周末特惠截断；撤回 V2 可恢复 V1 长期
    {
      id: "seed-policy-92-gold",
      fuelCode: "FU92",
      levelCode: "LV_GOLD",
      createdAt: createdAt(3),
      versions: [
        version({
          id: "seed-92-gold-v1",
          versionNo: 1,
          discountRate: 0.97,
          startDate: isoFromToday(-3),
          // 被 V2 接替而截断；撤回 V2 后恢复 originalEndDate=null（长期）
          endDate: isoFromToday(4),
          originalEndDate: null,
          approvalNo: "",
          reason: "金卡常态优惠",
          operator: "值班经理",
          createdAt: createdAt(3)
        }),
        version({
          id: "seed-92-gold-v2",
          versionNo: 2,
          discountRate: 0.9,
          startDate: isoFromToday(5),
          endDate: isoFromToday(6),
          approvalNo: "AP-2026-0109",
          reason: "周末冲量特惠，低于成本价销售",
          operator: "值班经理",
          createdAt: createdAt(1)
        })
      ]
    },
    // 98号汽油 × 钻石：V1 已过期（周年庆），V2 当前生效，低于成本需审批
    {
      id: "seed-policy-98-diamond",
      fuelCode: "FU98",
      levelCode: "LV_DIAMOND",
      createdAt: createdAt(60),
      versions: [
        version({
          id: "seed-98-diamond-v1",
          versionNo: 1,
          discountRate: 0.96,
          startDate: isoFromToday(-60),
          endDate: isoFromToday(-31),
          approvalNo: "",
          reason: "周年庆第一期",
          operator: "站长",
          createdAt: createdAt(60)
        }),
        version({
          id: "seed-98-diamond-v2",
          versionNo: 2,
          discountRate: 0.93,
          startDate: isoFromToday(-30),
          endDate: null,
          approvalNo: "AP-2026-0077",
          reason: "周年庆延续，9.18×0.93=8.5374 低于成本 8.86，特批",
          operator: "区域经理",
          createdAt: createdAt(30)
        })
      ]
    },
    // 柴油 × 普通：明天起生效（未生效，可撤回演示，不低于成本）
    {
      id: "seed-policy-0-normal",
      fuelCode: "FU0",
      levelCode: "LV_NORMAL",
      createdAt: createdAt(2),
      versions: [
        version({
          id: "seed-0-normal-v1",
          versionNo: 1,
          discountRate: 0.99,
          startDate: isoFromToday(1),
          endDate: isoFromToday(14),
          approvalNo: "",
          reason: "物流车队推广",
          operator: "值班经理",
          createdAt: createdAt(2)
        })
      ]
    }
  ];
}
