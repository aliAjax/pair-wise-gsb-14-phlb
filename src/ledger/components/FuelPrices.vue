<script setup lang="ts">
import { reactive, watch } from "vue";
import { ElMessage } from "element-plus";
import { useLedgerStore } from "../store";
import type { Fuel } from "../rules";

const store = useLedgerStore();

const edits = reactive<Record<string, { listPrice: number; costPrice: number }>>(
  Object.fromEntries(store.prices.map((p) => [p.fuel, { listPrice: p.listPrice, costPrice: p.costPrice }]))
);
watch(
  () => store.prices.length,
  () => {
    for (const p of store.prices) {
      if (!edits[p.fuel]) edits[p.fuel] = { listPrice: p.listPrice, costPrice: p.costPrice };
    }
  }
);

function save(fuel: Fuel) {
  const value = edits[fuel];
  if (!(value.listPrice > 0) || !(value.costPrice > 0)) {
    ElMessage.error("挂牌价与成本价必须大于 0。");
    return;
  }
  if (value.costPrice > value.listPrice) {
    ElMessage.warning("成本价高于挂牌价，请确认是否录入有误（仍可保存）。");
  }
  store.saveFuelPrice(fuel, Number(value.listPrice), Number(value.costPrice));
  ElMessage.success(`${fuel} 价格已更新；新建策略将按新价格计算优惠后价，历史版本保留建版时快照价。`);
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>油品价格维护</h2>
      <span class="muted">挂牌价用于计算优惠后价，成本价用于触发审批编号规则</span>
    </div>
    <el-table :data="store.prices" size="small" border>
      <el-table-column prop="fuel" label="油品" width="120" />
      <el-table-column label="挂牌价（元/升）" min-width="150">
        <template #default="{ row }">
          <el-input-number v-model="edits[row.fuel].listPrice" :min="0.01" :precision="2" :step="0.05" controls-position="right" size="small" style="width: 100%" />
        </template>
      </el-table-column>
      <el-table-column label="成本价（元/升）" min-width="150">
        <template #default="{ row }">
          <el-input-number v-model="edits[row.fuel].costPrice" :min="0.01" :precision="2" :step="0.05" controls-position="right" size="small" style="width: 100%" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="save(row.fuel as Fuel)">保存</el-button>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>
