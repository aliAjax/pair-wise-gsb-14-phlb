<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useLedgerStore } from "../store";
import { STATUS_TAG_TYPE, deriveStatus, finalPrice, formatMoney, formatRange } from "../rules";

const store = useLedgerStore();
const { chains } = storeToRefs(store);
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>版本链（旧价继续可查）</h2>
      <span class="muted">每条链对应同一油品 + 同一会员等级的历次调价；已撤回与已失效版本均保留</span>
    </div>

    <el-empty v-if="chains.length === 0" description="暂无版本链" :image-size="60" />
    <div v-for="chain in chains" :id="`chain-${chain.chainId}`" :key="chain.chainId" class="chain">
      <p class="chain-title">{{ chain.fuel }} / {{ chain.tier }}</p>
      <el-timeline class="chain-timeline">
        <el-timeline-item
          v-for="v in chain.versions"
          :key="v.id"
          :type="deriveStatus(v) === '生效中' ? 'success' : deriveStatus(v) === '已撤回' ? 'danger' : 'info'"
          :hollow="deriveStatus(v) === '已失效'"
          size="large"
        >
          <div class="chain-card">
            <div class="chain-card-head">
              <strong>v{{ v.versionNo }} · {{ v.discountRatePercent }}% · {{ formatMoney(finalPrice(v.snapshotListPrice, v.discountRatePercent)) }}</strong>
              <el-tag :type="STATUS_TAG_TYPE[deriveStatus(v)]" size="small">{{ deriveStatus(v) }}</el-tag>
            </div>
            <p class="muted">{{ formatRange(v.startAt, v.endAt) }} ｜ 建版挂牌价 {{ formatMoney(v.snapshotListPrice) }}</p>
            <p v-if="v.reason">原因：{{ v.reason }}</p>
            <p class="muted">
              审批：{{ v.approvalNo || "—" }} ｜ 操作员：{{ v.operator }}
              <template v-if="v.supersedesId"> ｜ 修订自上一版</template>
              <template v-if="v.withdrawn"> ｜ 已撤回</template>
            </p>
          </div>
        </el-timeline-item>
      </el-timeline>
    </div>
  </section>
</template>
