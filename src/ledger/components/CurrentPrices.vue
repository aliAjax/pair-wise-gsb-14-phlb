<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useLedgerStore } from "../store";
import { MEMBER_TIERS, formatMoney, todayISO } from "../rules";

const store = useLedgerStore();
const { currentPriceMatrix } = storeToRefs(store);

const today = todayISO();

function cellClass(row: { costPrice: number }, value: number | undefined) {
  if (value === undefined) return "";
  return value < row.costPrice ? "below-cost" : "";
}

const activeCount = computed(() =>
  store.versions.filter((v) => !v.withdrawn && today >= v.startAt && (v.endAt === null || today <= v.endAt))
    .length
);
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>当前价（{{ today }}）</h2>
      <span class="muted">生效中策略 {{ activeCount }} 条；无生效折扣的组合按挂牌价结算</span>
    </div>
    <el-table :data="currentPriceMatrix" size="small" border>
      <el-table-column prop="fuel" label="油品" width="110" />
      <el-table-column label="挂牌价" width="100" align="right">
        <template #default="{ row }">{{ formatMoney(row.listPrice) }}</template>
      </el-table-column>
      <el-table-column label="成本价" width="100" align="right">
        <template #default="{ row }">{{ formatMoney(row.costPrice) }}</template>
      </el-table-column>
      <el-table-column v-for="tier in MEMBER_TIERS" :key="tier" :label="tier" min-width="110" align="right">
        <template #default="{ row }">
          <template v-if="row.byTier[tier] !== undefined">
            <span :class="cellClass(row, row.byTier[tier])">{{ formatMoney(row.byTier[tier]) }}</span>
          </template>
          <el-text v-else type="info" size="small">挂牌价</el-text>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>
