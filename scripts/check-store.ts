// 存储层编排测试：localStorage 垫片 + Pinia，验证版本链事务行为
import { createPinia, setActivePinia } from "pinia";
import { useLedgerStore } from "../src/ledger/store";
import { deriveStatus, emptyDraft } from "../src/ledger/rules";

// ---- localStorage 垫片 ----
const map = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
  setItem: (k: string, v: string) => void map.set(k, v),
  removeItem: (k: string) => void map.delete(k),
  clear: () => map.clear()
};

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

function freshStore() {
  map.clear();
  setActivePinia(createPinia());
  return useLedgerStore();
}

console.log("种子数据:");
let store = freshStore();
check("4 条种子版本", store.versions.length === 4, String(store.versions.length));
check("95金卡 v1 已失效", deriveStatus(store.getVersion("seed-95-gold-v1")!) === "已失效");
check("95金卡 v2 生效中", deriveStatus(store.getVersion("seed-95-gold-v2")!) === "生效中");
check("92普通 未生效", deriveStatus(store.getVersion("seed-92-normal-scheduled")!) === "未生效");
check("0号柴油银卡 已失效", deriveStatus(store.getVersion("seed-diesel-silver-expired")!) === "已失效");

console.log("整单拒绝保留草稿:");
const countBefore = store.versions.length;
let res = store.submit({
  fuel: "92号汽油",
  tier: "普通会员",
  discountRatePercent: 50, // 3.81 < 成本 7.1，且不填审批
  startAt: "2026-12-01",
  endAt: "2026-12-31",
  approvalNo: "",
  reason: "",
  operator: "测试员"
});
check("提交返回失败", !res.ok);
check("整单拒绝不产生版本", store.versions.length === countBefore, String(store.versions.length));
check("草稿被保留（含折扣率）", store.draft.discountRatePercent === 50 && store.draft.fuel === "92号汽油");
check("冲突含 BELOW_COST_NO_APPROVAL", res.conflicts.some((c) => c.ruleCode === "BELOW_COST_NO_APPROVAL"));
check("草稿已持久化到 localStorage", map.get("dfwlfront-9-discount-draft")?.includes("50") === true);

console.log("合规提交成功:");
res = store.submit({
  ...store.draft,
  approvalNo: "APR-TEST-1"
} as any);
check("补审批后通过", res.ok, JSON.stringify(res.conflicts));
check("新版本入库", store.versions.length === countBefore + 1);
// 92号汽油/普通会员种子里已有一条 10 月版本（链 seed-chain-92-normal），
// 12 月新版本不重叠，应归入同一条链，版本号 v2
const created = store.versions.at(-1)!;
check("同油品同等级归入已有链并递增 v2", created.chainId === "seed-chain-92-normal" && created.versionNo === 2, `${created.chainId} v${created.versionNo}`);

console.log("已生效版本不能撤回:");
const conflict = store.withdraw("seed-95-gold-v2");
check("生效中撤回被规则拒绝", conflict !== null && conflict.ruleCode === "WITHDRAW_FORBIDDEN", JSON.stringify(conflict));
check("被拒版本未打撤回标记", store.getVersion("seed-95-gold-v2")!.withdrawn === false);

console.log("未生效修订 + 撤回恢复:");
// 对未生效的 92 普通会员 10 月策略新建版本，开始日 2026-10-15
store.startRevision("seed-92-normal-scheduled");
check("进入修订模式", store.draft.mode === "revision" && store.draft.predecessorId === "seed-92-normal-scheduled");
check("修订默认开始日为今天", store.draft.startAt === "2026-09-21");
check("修订原因必填校验", store.submit({ ...store.draft, reason: "" } as any).ok === false);
res = store.submit({
  ...store.draft,
  startAt: "2026-10-15",
  discountRatePercent: 95,
  reason: "测试调价原因"
} as any);
check("带原因修订通过", res.ok, JSON.stringify(res.conflicts));
const v2new = store.versions.find((v) => v.supersedesId === "seed-92-normal-scheduled")!;
check("修订版同链且版本号递增到 v3（前一步已新增 12 月 v2）", v2new.chainId === "seed-chain-92-normal" && v2new.versionNo === 3, `${v2new.chainId} v${v2new.versionNo}`);
const old92 = store.getVersion("seed-92-normal-scheduled")!;
check("旧版截断到开始日前一天", old92.endAt === "2026-10-14", old92.endAt ?? "");
check("新版记录了可恢复的旧结束日", v2new.restoreEndAt === "2026-10-31", v2new.restoreEndAt ?? "");
check("旧版折扣值未改，旧价可查", old92.discountRatePercent === 98);

// 撤回未生效新版
const wConflict = store.withdraw(v2new.id);
check("未生效新版可撤回", wConflict === null, JSON.stringify(wConflict));
check("新版已撤回", store.getVersion(v2new.id)!.withdrawn === true);
check("旧版区间恢复为 2026-10-31", store.getVersion("seed-92-normal-scheduled")!.endAt === "2026-10-31");

console.log("刷新一致性（从 localStorage 重建 store）:");
setActivePinia(createPinia());
const reloaded = useLedgerStore();
const reloadedOld = reloaded.getVersion("seed-92-normal-scheduled")!;
const reloadedNew = reloaded.getVersion(v2new.id)!;
check("刷新后撤回状态保留", reloadedNew.withdrawn === true);
check("刷新后恢复的区间保留", reloadedOld.endAt === "2026-10-31");
const matrix92 = reloaded.currentPriceMatrix.find((r) => r.fuel === "92号汽油")!;
check("撤回版不计入当前价", matrix92.byTier["普通会员"] === undefined, JSON.stringify(matrix92.byTier));
const matrix95 = reloaded.currentPriceMatrix.find((r) => r.fuel === "95号汽油")!;
check("生效链当前价取 v2 快照价 8.15×88%", Math.abs(matrix95.byTier["金卡会员"] - 7.172) < 1e-9, String(matrix95.byTier["金卡会员"]));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
