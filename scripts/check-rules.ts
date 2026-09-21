// 规则层行为测试（不经过页面与 localStorage），用 esbuild 转译后执行
import {
  DiscountVersion,
  FuelPrice,
  addDaysISO,
  deriveStatus,
  emptyDraft,
  rangesOverlap,
  validateDraft
} from "../src/ledger/rules";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

const prices: FuelPrice[] = [
  { fuel: "92号汽油", listPrice: 7.62, costPrice: 7.1, updatedAt: "" },
  { fuel: "95号汽油", listPrice: 8.15, costPrice: 7.7, updatedAt: "" }
];

function makeVersion(partial: Partial<DiscountVersion>): DiscountVersion {
  return {
    id: "v",
    chainId: "c",
    versionNo: 1,
    fuel: "92号汽油",
    tier: "普通会员",
    discountRatePercent: 95,
    startAt: "2026-09-01",
    endAt: null,
    approvalNo: "",
    reason: "",
    operator: "",
    createdAt: "",
    supersedesId: null,
    snapshotListPrice: 7.62,
    withdrawn: false,
    withdrawnAt: null,
    restoreEndAt: null,
    ...partial
  };
}

console.log("区间重叠:");
check("相接区间不重叠", !rangesOverlap(
  { startAt: "2026-09-01", endAt: "2026-09-15" },
  { startAt: "2026-09-16", endAt: "2026-09-30" }
));
check("重叠区间被识别", rangesOverlap(
  { startAt: "2026-09-01", endAt: "2026-09-20" },
  { startAt: "2026-09-20", endAt: null }
));
check("长期区间与任意未来区间重叠", rangesOverlap(
  { startAt: "2026-09-01", endAt: null },
  { startAt: "2030-01-01", endAt: "2030-02-01" }
));

console.log("状态推导（今天 2026-09-21）:");
check("未来开始 = 未生效", deriveStatus(makeVersion({ startAt: "2026-10-01" }), "2026-09-21") === "未生效");
check("区间内含今天 = 生效中", deriveStatus(makeVersion({ startAt: "2026-09-01", endAt: "2026-09-30" }), "2026-09-21") === "生效中");
check("结束在昨天 = 已失效", deriveStatus(makeVersion({ startAt: "2026-09-01", endAt: "2026-09-20" }), "2026-09-21") === "已失效");
check("withdrawn = 已撤回", deriveStatus(makeVersion({ withdrawn: true, startAt: "2030-01-01" }), "2026-09-21") === "已撤回");

console.log("整单校验:");
const base = { ...emptyDraft() };
const ctx = { mode: "new" as const, predecessorId: null, versions: [] as DiscountVersion[], fuelPrices: prices, today: "2026-09-21" };

// 1) 空单
let r = validateDraft({ ...base }, ctx);
check("空单被拒且首条是区间规则", r.length >= 1 && r.some((c) => c.ruleCode === "INVALID_RANGE"), JSON.stringify(r));

// 2) 低于成本价无审批：92 挂牌 7.62，88 折 = 6.7056 < 7.1
r = validateDraft({ ...base, fuel: "92号汽油", tier: "普通会员", discountRatePercent: 88, startAt: "2026-10-01", endAt: "2026-10-31" }, ctx);
check("低于成本无审批被拒", r.some((c) => c.ruleCode === "BELOW_COST_NO_APPROVAL"), JSON.stringify(r));

// 冲突项包含油品/等级/区间
const c0 = r.find((c) => c.ruleCode === "BELOW_COST_NO_APPROVAL")!;
check("冲突列出油品/等级/区间", c0.fuel === "92号汽油" && c0.tier === "普通会员" && c0.range.includes("2026-10-01") && c0.range.includes("2026-10-31"), JSON.stringify(c0));

// 3) 带上审批编号且无其它版本 → 通过
r = validateDraft({ ...base, fuel: "92号汽油", tier: "普通会员", discountRatePercent: 88, startAt: "2026-10-01", endAt: "2026-10-31", approvalNo: "APR-1" }, ctx);
check("低于成本带审批通过", r.length === 0, JSON.stringify(r));

// 4) 同油品同等级区间重叠
const existing = makeVersion({ id: "x1", startAt: "2026-10-15", endAt: "2026-11-15" });
r = validateDraft(
  { ...base, fuel: "92号汽油", tier: "普通会员", discountRatePercent: 99, startAt: "2026-11-01", endAt: "2026-11-30" },
  { ...ctx, versions: [existing] }
);
check("同油品同等级重叠被拒", r.some((c) => c.ruleCode === "OVERLAP"), JSON.stringify(r));
check("重叠冲突带对方版本号与区间", r.some((c) => c.ruleCode === "OVERLAP" && c.message.includes("v1")), "");

// 5) 不同等级可同日生效
r = validateDraft(
  { ...base, fuel: "92号汽油", tier: "银卡会员", discountRatePercent: 99, startAt: "2026-11-01", endAt: "2026-11-30" },
  { ...ctx, versions: [existing] }
);
check("不同等级同期可共存", r.length === 0, JSON.stringify(r));

// 6) 修订时排除被修订版本本身
r = validateDraft(
  { ...base, fuel: "92号汽油", tier: "普通会员", discountRatePercent: 90, startAt: "2026-11-01", endAt: null, reason: "调价" },
  { ...ctx, mode: "revision", predecessorId: existing.id, versions: [existing] }
);
check("修订时与上一版重叠不冲突", !r.some((c) => c.ruleCode === "OVERLAP"), JSON.stringify(r));
check("修订开始日早于今天被拒", validateDraft(
  { ...base, fuel: "92号汽油", tier: "普通会员", discountRatePercent: 90, startAt: "2026-09-01", endAt: null, reason: "x" },
  { ...ctx, mode: "revision", predecessorId: existing.id, versions: [existing] }
).some((c) => c.ruleCode === "INVALID_RANGE"), "");
check("修订缺原因被拒", r.every((c) => c.ruleCode !== "REVISION_REASON_REQUIRED") && validateDraft(
  { ...base, fuel: "92号汽油", tier: "普通会员", discountRatePercent: 90, startAt: "2026-11-01", endAt: null },
  { ...ctx, mode: "revision", predecessorId: existing.id, versions: [existing] }
).some((c) => c.ruleCode === "REVISION_REASON_REQUIRED"), "");

console.log("日期工具:");
check("addDaysISO 跨界", addDaysISO("2026-09-01", -1) === "2026-08-31" && addDaysISO("2026-12-31", 1) === "2027-01-01");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
