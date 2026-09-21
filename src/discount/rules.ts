// 规则层：会员折扣台账的全部业务规则都在这里，且为纯函数。
// 不依赖 Vue / Pinia / localStorage，可独立单测。
//
// 规则目录见 catalog.ts 的 RULES：
//  R1 必填项  R2 折扣率范围  R3 区间合法性  R4 低于成本价强制审批
//  R5 同油品同等级区间不得重叠  R6 调价必须填原因  R7 仅允许撤回未生效项

import {
  discountedPrice,
  fuelByCode,
  fuelName,
  levelByCode,
  levelName,
  RULES
} from "./catalog";
import {
  addDays,
  formatRange,
  isInEffect,
  isValidISO,
  overlaps,
  toTime,
  todayISO
} from "./time";
import type {
  Conflict,
  Draft,
  Interval,
  Policy,
  PolicyVersion,
  VersionStatus
} from "./types";

// 领域模型全部为 JSON 可序列化数据；用 JSON 深拷贝同时兼容传入 Vue 响应式代理的场景。
function clonePolicies(policies: Policy[]): Policy[] {
  return JSON.parse(JSON.stringify(policies)) as Policy[];
}

// ---------------------------------------------------------------- 草稿工厂

export function emptyDraft(onDate: string = todayISO()): Draft {
  return {
    fuelCode: "",
    levelCode: "",
    discountRate: null,
    startDate: onDate,
    endDate: null,
    approvalNo: "",
    reason: "",
    operator: "",
    updatedAt: new Date(0).toISOString(),
    revise: null
  };
}

// ---------------------------------------------------------------- 工具

export function isBelowCost(
  listPrice: number,
  cost: number,
  discountRate: number
): boolean {
  return discountedPrice(listPrice, discountRate) < cost;
}

function conflict(
  code: keyof typeof RULES,
  detail: string,
  ctx: {
    fuelNames?: string[];
    levelNames?: string[];
    intervals?: string[];
  } = {}
): Conflict {
  return {
    rule: RULES[code],
    detail,
    fuelNames: ctx.fuelNames ?? [],
    levelNames: ctx.levelNames ?? [],
    intervals: ctx.intervals ?? []
  };
}

function draftInterval(draft: Draft): Interval | null {
  if (!isValidISO(draft.startDate)) return null;
  if (draft.endDate !== null && !isValidISO(draft.endDate)) return null;
  return { startDate: draft.startDate, endDate: draft.endDate };
}

// ---------------------------------------------------------------- 提交校验（R1~R6）

/**
 * 校验一条草稿。返回全部命中冲突（而非命中即停），页面可一次性列出。
 * 无冲突时返回空数组，调用方才可执行 applySubmission。
 */
export function validateDraft(
  draft: Draft,
  policies: Policy[],
  onDate: string = todayISO()
): Conflict[] {
  const conflicts: Conflict[] = [];
  const fuel = fuelByCode(draft.fuelCode);
  const level = levelByCode(draft.levelCode);
  const interval = draftInterval(draft);

  const fuelNames = fuel ? [fuel.name] : draft.fuelCode ? [draft.fuelCode] : [];
  const levelNames = level ? [level.name] : draft.levelCode ? [draft.levelCode] : [];
  const intervalText = interval ? [formatRange(interval.startDate, interval.endDate)] : [];
  const ctx = { fuelNames, levelNames, intervals: intervalText };
  const rate = draft.discountRate;

  // R1 必填项
  if (!draft.fuelCode || !draft.levelCode || rate === null || !draft.startDate) {
    conflicts.push(conflict("R1_REQUIRED", "存在未填写的必填字段。", ctx));
  }

  // R2 折扣率范围
  if (rate !== null && !(rate > 0 && rate < 1)) {
    conflicts.push(
      conflict("R2_RATE_RANGE", `当前折扣率：${rate}，不在 (0, 1) 开区间内。`, ctx)
    );
  }

  // R3 区间合法性
  if (isValidISO(draft.startDate)) {
    if (toTime(draft.startDate) < toTime(onDate)) {
      conflicts.push(
        conflict("R3_INTERVAL", `生效开始日期 ${draft.startDate} 早于今天 ${onDate}，不能补录历史策略。`, ctx)
      );
    }
    if (draft.endDate !== null && isValidISO(draft.endDate) &&
      toTime(draft.endDate) < toTime(draft.startDate)) {
      conflicts.push(
        conflict("R3_INTERVAL", `结束日期 ${draft.endDate} 早于开始日期 ${draft.startDate}。`, ctx)
      );
    }
  }

  // R4 优惠后低于成本价 → 必须有审批编号
  if (fuel && rate !== null && rate > 0 && rate < 1) {
    const finalPrice = discountedPrice(fuel.listPrice, rate);
    if (isBelowCost(fuel.listPrice, fuel.cost, rate) && !draft.approvalNo.trim()) {
      conflicts.push(
        conflict(
          "R4_BELOW_COST_APPROVAL",
          `${fuel.name} 挂牌价 ${fuel.listPrice.toFixed(2)} × ${rate} = ${finalPrice.toFixed(
            2
          )} 元/升，低于成本价 ${fuel.cost.toFixed(2)}，必须填写审批编号；未填写则整单拒绝并保留草稿。`,
          ctx
        )
      );
    }
  }

  // R6 调价（修订已生效价）必须填写原因
  if (draft.revise && !draft.reason.trim()) {
    const fromPolicy = policies.find((item) => item.id === draft.revise!.policyId);
    const fromVersion = fromPolicy?.versions.find(
      (item) => item.id === draft.revise!.fromVersionId
    );
    conflicts.push(
      conflict(
        "R6_REASON_ON_REVISE",
        `该单由已生效版本 V${fromVersion?.versionNo ?? "?"} 调价而来，必须填写调价原因。`,
        ctx
      )
    );
  }

  // R5 同一油品同等级区间不得重叠
  if (fuel && level && interval) {
    for (const policy of policies) {
      if (policy.fuelCode !== fuel.code || policy.levelCode !== level.code) continue;
      for (const version of policy.versions) {
        if (version.status === "withdrawn" || version.status === "expired") continue;
        // 修订模式下，仅“被调价替换的当前生效版本”允许与新版本首尾相接；
        // 同链上的未来排期版本仍参与重叠检查。
        if (
          draft.revise &&
          policy.id === draft.revise.policyId &&
          version.id === draft.revise.fromVersionId
        ) {
          continue;
        }
        if (overlaps(
          interval.startDate,
          interval.endDate,
          version.startDate,
          version.endDate
        )) {
          conflicts.push(
            conflict(
              "R5_INTERVAL_OVERLAP",
              `与已有版本 V${version.versionNo}（${formatRange(
                version.startDate,
                version.endDate
              )}）区间重叠；同一油品同等级的有效策略区间不得交叉。`,
              {
                fuelNames: [fuel.name],
                levelNames: [level.name],
                intervals: [
                  formatRange(interval.startDate, interval.endDate),
                  formatRange(version.startDate, version.endDate)
                ]
              }
            )
          );
        }
      }
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------- 状态刷新

/** 按基准日重算所有版本状态；withdrawn 为终态，不再参与流转。 */
export function refreshStatuses(policies: Policy[], onDate: string = todayISO()): Policy[] {
  return policies.map((policy) => ({
    ...policy,
    versions: policy.versions.map((version): PolicyVersion => {
      if (version.status === "withdrawn") return version;
      let status: VersionStatus;
      if (toTime(onDate) < toTime(version.startDate)) {
        status = "upcoming";
      } else if (version.endDate !== null && toTime(onDate) > toTime(version.endDate)) {
        status = "expired";
      } else {
        status = "active";
      }
      return { ...version, status };
    })
  }));
}

// ---------------------------------------------------------------- 提交落库（校验通过后调用）

export interface SubmitMeta {
  id: string;
  createdAt: string;
  onDate?: string;
}

/**
 * 把草稿追加为新版本。
 * - 新建：同油品+同等级已有链则续号（仅允许接在已过期版本之后，重叠由 R5 拦截），否则开新链。
 * - 修订：在原链追加版本，并把当前生效版本区间截断到新版本开始前一天；
 *   旧版本保留，旧价继续可查。
 */
export function applySubmission(
  policies: Policy[],
  draft: Draft,
  meta: SubmitMeta
): { policies: Policy[]; policyId: string; version: PolicyVersion } {
  const onDate = meta.onDate ?? todayISO();
  const next = clonePolicies(policies);
  const status: VersionStatus =
    toTime(draft.startDate) <= toTime(onDate) ? "active" : "upcoming";

  const newVersion: PolicyVersion = {
    id: meta.id,
    versionNo: 1,
    discountRate: draft.discountRate as number,
    startDate: draft.startDate,
    endDate: draft.endDate,
    originalEndDate: draft.endDate,
    approvalNo: draft.approvalNo.trim(),
    reason: draft.reason.trim(),
    operator: draft.operator.trim(),
    createdAt: meta.createdAt,
    status
  };

  let policy = next.find(
    (item) => item.fuelCode === draft.fuelCode && item.levelCode === draft.levelCode
  );

  if (!policy) {
    policy = {
      id: crypto.randomUUID(),
      fuelCode: draft.fuelCode,
      levelCode: draft.levelCode,
      versions: [],
      createdAt: meta.createdAt
    };
    next.push(policy);
  }

  // 修订已生效价：截断当前生效版本（R5 已保证新单不会与其它链冲突）
  if (draft.revise) {
    const active = [...policy.versions]
      .reverse()
      .find((version) => version.status === "active");
    if (active && toTime(draft.startDate) > toTime(active.startDate)) {
      active.endDate = addDays(draft.startDate, -1);
      if (toTime(onDate) > toTime(active.endDate)) active.status = "expired";
    }
  }

  newVersion.versionNo = policy.versions.reduce(
    (max, version) => Math.max(max, version.versionNo),
    0
  ) + 1;
  policy.versions.push(newVersion);

  return { policies: next, policyId: policy.id, version: newVersion };
}

// ---------------------------------------------------------------- 撤回（R7）

/**
 * 撤回未生效版本：
 *  - 仅最新版本、且状态为 upcoming 可撤回；
 *  - 标记 withdrawn 保留痕迹，并把上一版区间恢复为其原始区间（originalEndDate）。
 */
export function withdrawVersion(
  policies: Policy[],
  policyId: string,
  versionId: string,
  onDate: string = todayISO()
): { policies: Policy[]; conflicts: Conflict[] } {
  const policy = policies.find((item) => item.id === policyId);
  const version = policy?.versions.find((item) => item.id === versionId);

  if (!policy || !version) {
    return { policies, conflicts: [conflict("R7_WITHDRAW_ONLY_UPCOMING", "未找到目标版本。")] };
  }

  const liveVersions = policy.versions.filter((item) => item.status !== "withdrawn");
  const latest = liveVersions[liveVersions.length - 1];
  if (latest?.id !== version.id) {
    return {
      policies,
      conflicts: [
        conflict(
          "R7_WITHDRAW_ONLY_UPCOMING",
          `V${version.versionNo} 之后已有新版本，仅可撤回最新的未生效版本。`,
          {
            fuelNames: [fuelName(policy.fuelCode)],
            levelNames: [levelName(policy.levelCode)],
            intervals: [formatRange(version.startDate, version.endDate)]
          }
        )
      ]
    };
  }

  if (version.status !== "upcoming") {
    const label =
      version.status === "active" ? "已生效" : version.status === "expired" ? "已过期" : "已撤回";
    return {
      policies,
      conflicts: [
        conflict(
          "R7_WITHDRAW_ONLY_UPCOMING",
          `V${version.versionNo}（${label}）不能撤回；已生效调价只能新建带原因版本。`,
          {
            fuelNames: [fuelName(policy.fuelCode)],
            levelNames: [levelName(policy.levelCode)],
            intervals: [formatRange(version.startDate, version.endDate)]
          }
        )
      ]
    };
  }

  const next = clonePolicies(policies);
  const nextPolicy = next.find((item) => item.id === policyId)!;
  const target = nextPolicy.versions.find((item) => item.id === versionId)!;
  target.status = "withdrawn";

  // 恢复上一版区间：跳过中间已撤回的版本，找到最近一个仍有效的旧版本
  const index = nextPolicy.versions.indexOf(target);
  let previous: PolicyVersion | undefined;
  for (let i = index - 1; i >= 0; i--) {
    if (nextPolicy.versions[i].status !== "withdrawn") {
      previous = nextPolicy.versions[i];
      break;
    }
  }
  if (previous) {
    previous.endDate = previous.originalEndDate;
  }
  return { policies: refreshStatuses(next, onDate), conflicts: [] };
}

// ---------------------------------------------------------------- 读取辅助（规则层提供判定原语）

export function versionInEffect(version: PolicyVersion, onDate: string = todayISO()): boolean {
  return version.status !== "withdrawn" &&
    isInEffect(version.startDate, version.endDate, onDate);
}
