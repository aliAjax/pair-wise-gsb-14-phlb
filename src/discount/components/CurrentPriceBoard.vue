<script setup lang="ts">
// 页面层：当前价看板。每个油品 × 会员等级一行，与版本链来自同一份 policies，
// 因此刷新后“策略、当前价、版本链”必然一致。
import { computed, ref } from "vue";
import { useLedgerStore } from "../store";
import { formatRate, money, STATUS_CLASS, STATUS_LABEL } from "../ui";
import { FUELS, MEMBER_LEVELS } from "../catalog";

const store = useLedgerStore();
const highlightBelowCost = ref(true);

const rowsByFuel = computed(() =>
  FUELS.map((fuel) => ({
    fuel,
    rows: store.board.filter((row) => row.fuelCode === fuel.code)
  }))
);
</script>

<template>
  <section class="panel board-panel">
    <div class="panel-head">
      <h2>当前会员价看板（基准日 {{ store.today }}）</h2>
      <label class="inline-check small">
        <input type="checkbox" v-model="highlightBelowCost" />
        高亮低于成本价
      </label>
    </div>

    <div class="board-scroll">
      <table class="board-table">
        <thead>
          <tr>
            <th>油品</th>
            <th>成本 / 挂牌</th>
            <th v-for="level in MEMBER_LEVELS" :key="level.code">{{ level.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="group in rowsByFuel" :key="group.fuel.code">
            <th class="fuel-cell">{{ group.fuel.name }}</th>
            <td class="list-cell">
              <div class="cost">成本 {{ money(group.fuel.cost) }}</div>
              <div class="list">挂牌 {{ money(group.fuel.listPrice) }}</div>
            </td>
            <td
              v-for="row in group.rows"
              :key="row.levelCode"
              :class="{
                'below-cost': highlightBelowCost && row.belowCost,
                'has-rate': !!row.version
              }"
            >
              <div class="cell-price">¥{{ money(row.currentPrice) }}</div>
              <div v-if="row.version" class="cell-meta">
                <span class="rate">{{ formatRate(row.version.discountRate) }}</span>
                <span :class="['status', STATUS_CLASS[row.version.status]]">
                  {{ STATUS_LABEL[row.version.status] }}
                </span>
              </div>
              <div v-else class="cell-meta muted">无折扣</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="board-note">
      低于成本价的会员价均已携带审批编号；版本链调价后此看板立即更新，旧价仍可在版本链中查看。
    </p>
  </section>
</template>
