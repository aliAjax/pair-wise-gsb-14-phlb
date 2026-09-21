// 会员折扣台账 —— 领域模型
// 三层划分中的「模型层」：只描述数据结构，不包含规则、存储与页面逻辑。

/** 油品（含成本价与挂牌价，是判断“优惠后低于成本价”的基准） */
export interface Fuel {
  code: string;
  name: string;
  /** 成本价（元/升） */
  cost: number;
  /** 挂牌价（元/升） */
  listPrice: number;
}

/** 会员等级 */
export interface MemberLevel {
  code: string;
  name: string;
  rank: number;
}

/** 生效区间：闭区间 [startDate, endDate]；endDate 为 null 表示长期有效 */
export interface Interval {
  startDate: string;
  endDate: string | null;
}

/** 策略生命周期状态（显式落库，刷新后保持一致） */
export type VersionStatus = "upcoming" | "active" | "expired" | "withdrawn";

/**
 * 一条策略版本。
 * 同一油品 + 同一会员等级对应一条链（Policy），链上每个节点是一个版本。
 */
export interface PolicyVersion {
  id: string;
  versionNo: number;
  /** 折扣率，0~1 之间，例如 0.95 表示 95 折 */
  discountRate: number;
  startDate: string;
  /** 被新版本接替时，区间会被截到新版本开始前一天；撤回时恢复原区间 */
  endDate: string | null;
  /** 该版本当前区间的原始终点，撤回上一版时用于恢复 */
  originalEndDate: string | null;
  /** 审批编号（优惠后低于成本价时强制） */
  approvalNo: string;
  reason: string;
  operator: string;
  createdAt: string;
  status: VersionStatus;
}

/** 版本链：固定绑定一个油品与一个会员等级 */
export interface Policy {
  id: string;
  fuelCode: string;
  levelCode: string;
  versions: PolicyVersion[];
  createdAt: string;
}

/** 提交表单的草稿（被规则拒绝后保留，刷新后仍可继续编辑） */
export interface Draft {
  fuelCode: string;
  levelCode: string;
  discountRate: number | null;
  startDate: string;
  endDate: string | null;
  approvalNo: string;
  reason: string;
  operator: string;
  updatedAt: string;
  /** revise 模式下指向被调价的版本链与版本；create 模式为 null */
  revise: { policyId: string; fromVersionId: string } | null;
}

/** 触发规则的稳定编号，页面据此展示“触发规则” */
export type RuleCode =
  | "R1_REQUIRED"
  | "R2_RATE_RANGE"
  | "R3_INTERVAL"
  | "R4_BELOW_COST_APPROVAL"
  | "R5_INTERVAL_OVERLAP"
  | "R6_REASON_ON_REVISE"
  | "R7_WITHDRAW_ONLY_UPCOMING";

export interface RuleDef {
  code: RuleCode;
  name: string;
  message: string;
}

/** 一次校验命中的冲突；按要求列出油品、等级、区间与触发规则 */
export interface Conflict {
  rule: RuleDef;
  /** 冲突涉及的油品名（可能多个，如区间重叠的双方） */
  fuelNames: string[];
  /** 冲突涉及的会员等级名 */
  levelNames: string[];
  /** 冲突区间（人类可读） */
  intervals: string[];
  detail: string;
}

/** 台账整体快照（storage 层持久化的对象） */
export interface LedgerState {
  policies: Policy[];
  draft: Draft | null;
}
