<script setup lang="ts">
// 页面层：会员折扣台账页面，负责组合表单 / 冲突清单 / 版本链 / 当前价看板。
// 不包含任何规则实现：规则在 rules.ts，持久化在 storage.ts。
import { onMounted } from "vue";
import { useLedgerStore } from "../store";
import DiscountForm from "./DiscountForm.vue";
import ConflictList from "./ConflictList.vue";
import VersionChain from "./VersionChain.vue";
import CurrentPriceBoard from "./CurrentPriceBoard.vue";

const store = useLedgerStore();

onMounted(() => {
  store.init();
});
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 会员折扣台账</p>
          <h1>油品价格维护 · 会员折扣台账</h1>
          <p class="subtitle">
            每条策略选择油品、会员等级、折扣率、生效区间与审批编号；同油品同等级区间不重叠，
            低于成本价强制审批。未生效项可撤回并恢复上一版，已生效调价只能新建带原因版本，旧价可查。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">Pinia</span>
          <span class="tag">TypeScript</span>
          <span class="tag">规则/存储/页面分层</span>
        </div>
      </header>

      <section class="status-bar">
        <span class="status-message" :class="{ error: store.conflicts.length > 0 }">
          {{ store.lastMessage }}
        </span>
        <span class="status-today">基准日：{{ store.today }} · 数据来源：{{
          store.dataSource === "storage" ? "本地存储" : store.dataSource === "seed" ? "示例数据" : "损坏回退"
        }}</span>
        <button type="button" class="secondary mini" @click="store.refresh()">刷新并重新对齐</button>
      </section>

      <section class="metrics">
        <article class="metric">
          <span>版本链数量</span>
          <strong>{{ store.stats.chainCount }}</strong>
        </article>
        <article class="metric">
          <span>当前有折扣的油价</span>
          <strong>{{ store.stats.discountedCount }}</strong>
        </article>
        <article class="metric" :class="{ alert: store.stats.belowCostCount > 0 }">
          <span>低于成本价（已审批）</span>
          <strong>{{ store.stats.belowCostCount }}</strong>
        </article>
        <article class="metric">
          <span>折扣价均值</span>
          <strong>¥{{ store.stats.avgDiscount.toFixed(2) }}</strong>
        </article>
      </section>

      <section class="workspace">
        <div class="left-col">
          <DiscountForm />
          <ConflictList v-if="store.rejected" :conflicts="store.conflicts" />
        </div>
        <div class="right-col">
          <CurrentPriceBoard />
          <VersionChain />
        </div>
      </section>
    </div>
  </main>
</template>
