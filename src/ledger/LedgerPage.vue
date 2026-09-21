<script setup lang="ts">
import { computed } from "vue";
import { useLedgerStore } from "./store";
import { deriveStatus, finalPrice, formatMoney, todayISO } from "./rules";
import StrategyForm from "./components/StrategyForm.vue";
import StrategyLedger from "./components/StrategyLedger.vue";
import CurrentPrices from "./components/CurrentPrices.vue";
import VersionChains from "./components/VersionChains.vue";
import FuelPrices from "./components/FuelPrices.vue";

const store = useLedgerStore();
const today = todayISO();

const metrics = computed(() => {
  const versions = store.versions;
  const active = versions.filter((v) => deriveStatus(v, today) === "生效中");
  const pending = versions.filter((v) => deriveStatus(v, today) === "未生效");
  const belowCostActive = active.filter((v) => {
    const price = store.priceOf(v.fuel);
    return price ? finalPrice(v.snapshotListPrice, v.discountRatePercent) < price.costPrice : false;
  });
  const chainCount = new Set(versions.map((v) => v.chainId)).size;
  return [
    { label: "生效中策略", value: active.length, sub: `未生效 ${pending.length} 条` },
    { label: "低于成本价（已审批）", value: belowCostActive.length, sub: "生效中且有审批编号" },
    { label: "版本链", value: chainCount, sub: `版本总数 ${versions.length}` },
    { label: "未保存草稿", value: store.draft.fuel || store.draft.tier ? 1 : 0, sub: "被拒草稿自动保留" }
  ];
});

const averageActive = computed(() => {
  const active = store.versions.filter((v) => deriveStatus(v, today) === "生效中");
  if (!active.length) return "—";
  const avg = active.reduce((sum, v) => sum + finalPrice(v.snapshotListPrice, v.discountRatePercent), 0) / active.length;
  return formatMoney(avg);
});
</script>

<template>
  <main class="app ledger-app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 油品价格维护扩展</p>
          <h1>会员折扣台账</h1>
          <p class="subtitle">
            按油品与会员等级维护折扣率、生效区间与审批编号；同油品同等级区间不得重叠，低于成本价必须审批。
            状态由日期实时推导，策略、当前价与版本链刷新后始终一致。
          </p>
        </div>
        <div class="stack">
          <span class="tag">规则层 rules.ts</span>
          <span class="tag">存储层 store.ts</span>
          <span class="tag">页面层 components</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="m in metrics" :key="m.label" class="metric">
          <span>{{ m.label }}</span>
          <strong>{{ m.value }}</strong>
          <em class="metric-sub">{{ m.sub }}</em>
        </article>
        <article class="metric metric-accent">
          <span>生效策略平均优惠价</span>
          <strong>{{ averageActive }}</strong>
          <em class="metric-sub">按建版挂牌价快照计算</em>
        </article>
      </section>

      <div class="ledger-layout">
        <div class="ledger-left">
          <StrategyForm />
        </div>
        <div class="ledger-right">
          <StrategyLedger />
        </div>
      </div>

      <CurrentPrices />
      <VersionChains />
      <FuelPrices />

      <footer class="footnote">
        数据仅保存在本浏览器 localStorage（折扣版本 / 油品价格 / 被拒草稿分三个键）；清空浏览器数据后恢复内置种子数据。
      </footer>
    </div>
  </main>
</template>
