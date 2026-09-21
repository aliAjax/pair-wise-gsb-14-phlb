<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { ElMessage, ElMessageBox } from "element-plus";
import { useLedgerStore } from "../store";
import {
  FUELS,
  MEMBER_TIERS,
  STATUS_TAG_TYPE,
  deriveStatus,
  finalPrice,
  formatMoney,
  formatRange,
  type DiscountVersion,
  type VersionStatus
} from "../rules";

const store = useLedgerStore();
const { visibleVersions } = storeToRefs(store);

const fuelFilter = ref<string>("");
const tierFilter = ref<string>("");
const statusFilter = ref<VersionStatus | "">("");

const filtered = computed(() =>
  visibleVersions.value.filter(
    (v) =>
      (!fuelFilter.value || v.fuel === fuelFilter.value) &&
      (!tierFilter.value || v.tier === tierFilter.value) &&
      (!statusFilter.value || deriveStatus(v) === statusFilter.value)
  )
);

const statusOptions: VersionStatus[] = ["未生效", "生效中", "已失效", "已撤回"];

function priceOfVersion(v: DiscountVersion) {
  return finalPrice(v.snapshotListPrice, v.discountRatePercent);
}

function revise(v: DiscountVersion) {
  store.startRevision(v.id);
}

async function withdraw(v: DiscountVersion) {
  try {
    await ElMessageBox.confirm(
      `撤回 v${v.versionNo}（${v.fuel} / ${v.tier}）后，上一版区间将自动恢复。该操作仅允许对未生效项执行。`,
      "确认撤回未生效项",
      { type: "warning", confirmButtonText: "确认撤回", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  const conflict = store.withdraw(v.id);
  if (conflict) {
    ElMessage.error(`${conflict.rule}：${conflict.message}`);
  } else {
    ElMessage.success("已撤回未生效版本，上一版区间已恢复。");
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>折扣策略台账</h2>
      <div class="filters">
        <el-select v-model="fuelFilter" placeholder="油品" clearable size="small" style="width: 128px">
          <el-option v-for="f in FUELS" :key="f" :label="f" :value="f" />
        </el-select>
        <el-select v-model="tierFilter" placeholder="会员等级" clearable size="small" style="width: 128px">
          <el-option v-for="t in MEMBER_TIERS" :key="t" :label="t" :value="t" />
        </el-select>
        <el-select v-model="statusFilter" placeholder="状态" clearable size="small" style="width: 110px">
          <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
        </el-select>
      </div>
    </div>

    <el-table :data="filtered" size="small" border stripe class="ledger-table">
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="expand">
            <span>审批编号：{{ row.approvalNo || "—" }}</span>
            <span>调价原因：{{ row.reason || "—" }}</span>
            <span>建版挂牌价：{{ formatMoney(row.snapshotListPrice) }}</span>
            <span>操作员：{{ row.operator }}</span>
            <span>建版时间：{{ new Date(row.createdAt).toLocaleString("zh-CN") }}</span>
            <span v-if="row.withdrawn">撤回时间：{{ new Date(row.withdrawnAt!).toLocaleString("zh-CN") }}</span>
            <span v-if="row.supersedesId">上一版 ID：{{ row.supersedesId }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="fuel" label="油品" width="100" />
      <el-table-column prop="tier" label="会员等级" width="100" />
      <el-table-column label="版本" width="70" align="center">
        <template #default="{ row }">
          <el-link type="primary" :href="`#chain-${row.chainId}`">{{ `v${row.versionNo}` }}</el-link>
        </template>
      </el-table-column>
      <el-table-column label="折扣率" width="80" align="center">
        <template #default="{ row }">{{ row.discountRatePercent }}%</template>
      </el-table-column>
      <el-table-column label="优惠后价" width="100" align="right">
        <template #default="{ row }">{{ formatMoney(priceOfVersion(row)) }}</template>
      </el-table-column>
      <el-table-column label="生效区间" min-width="200">
        <template #default="{ row }">{{ formatRange(row.startAt, row.endAt) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAG_TYPE[deriveStatus(row)]" size="small">
            {{ deriveStatus(row) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="revise(row)">新建版本</el-button>
          <el-button
            v-if="deriveStatus(row) === '未生效'"
            link
            type="danger"
            size="small"
            @click="withdraw(row)"
          >
            撤回
          </el-button>
          <el-tooltip v-else content="仅未生效项可撤回，已生效调价请新建带原因版本" placement="top">
            <el-button link type="info" size="small" disabled>撤回</el-button>
          </el-tooltip>
        </template>
      </el-table-column>
      <template #empty>暂无匹配的折扣策略</template>
    </el-table>
  </section>
</template>
