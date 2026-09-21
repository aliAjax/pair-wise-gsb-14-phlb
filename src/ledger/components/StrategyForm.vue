<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElMessage } from "element-plus";
import { useLedgerStore } from "../store";
import {
  FUELS,
  MEMBER_TIERS,
  RULE_META,
  addDaysISO,
  finalPrice,
  formatMoney,
  isBelowCost,
  todayISO,
  type DiscountDraftInput,
  type Fuel,
  type MemberTier
} from "../rules";

const store = useLedgerStore();
const { draft, conflicts } = storeToRefs(store);

const formRef = ref<HTMLElement>();
const longTerm = ref(draft.value.endAt === null);

watch(
  () => draft.value.predecessorId,
  () => {
    longTerm.value = draft.value.endAt === null;
  }
);

// 统一通过 store 更新并持久化，保证刷新后草稿仍在
function patch(p: Partial<typeof draft.value>) {
  store.updateDraft(p);
}

const fuelProxy = computed({
  get: () => draft.value.fuel || undefined,
  set: (v?: Fuel) => patch({ fuel: v ?? "" })
});
const tierProxy = computed({
  get: () => draft.value.tier || undefined,
  set: (v?: MemberTier) => patch({ tier: v ?? "" })
});
const rateProxy = computed({
  get: () => draft.value.discountRatePercent ?? undefined,
  set: (v?: number) => patch({ discountRatePercent: v === undefined ? null : v })
});
const startProxy = computed({
  get: () => draft.value.startAt || undefined,
  set: (v?: string) => patch({ startAt: v ?? "" })
});
const endProxy = computed({
  get: () => draft.value.endAt ?? undefined,
  set: (v?: string) => patch({ endAt: v ?? null })
});
const approvalProxy = computed({
  get: () => draft.value.approvalNo,
  set: (v?: string) => patch({ approvalNo: v ?? "" })
});
const reasonProxy = computed({
  get: () => draft.value.reason,
  set: (v?: string) => patch({ reason: v ?? "" })
});
const operatorProxy = computed({
  get: () => draft.value.operator,
  set: (v?: string) => patch({ operator: v ?? "" })
});

function toggleLongTerm(on: boolean) {
  longTerm.value = on;
  if (on) {
    patch({ endAt: null });
  } else {
    const base = draft.value.startAt || todayISO();
    patch({ endAt: addDaysISO(base, 30) });
  }
}

const fuelPrice = computed(() => (draft.value.fuel ? store.priceOf(draft.value.fuel as Fuel) : undefined));
const discounted = computed(() =>
  fuelPrice.value && draft.value.discountRatePercent
    ? finalPrice(fuelPrice.value.listPrice, draft.value.discountRatePercent)
    : null
);
const belowCost = computed(
  () =>
    fuelPrice.value !== undefined &&
    draft.value.discountRatePercent !== null &&
    isBelowCost(fuelPrice.value.listPrice, fuelPrice.value.costPrice, draft.value.discountRatePercent)
);

const predecessor = computed(() =>
  draft.value.predecessorId ? store.getVersion(draft.value.predecessorId) : undefined
);

// 进入“新建版本”后把页面定位到表单
watch(
  () => draft.value.mode,
  (mode) => {
    if (mode === "revision") {
      setTimeout(() => formRef.value?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }
);

function submit() {
  const input: DiscountDraftInput = {
    fuel: draft.value.fuel,
    tier: draft.value.tier,
    discountRatePercent: draft.value.discountRatePercent,
    startAt: draft.value.startAt,
    endAt: longTerm.value ? null : draft.value.endAt,
    approvalNo: draft.value.approvalNo,
    reason: draft.value.reason,
    operator: draft.value.operator
  };
  const result = store.submit(input);
  if (result.ok) {
    longTerm.value = true;
    ElMessage.success("折扣策略已保存，策略、当前价与版本链已同步。");
  } else {
    ElMessage.error(`整单拒绝：${result.conflicts.length} 条规则冲突，草稿已保留。`);
  }
}

function cancelRevision() {
  store.clearDraft();
  longTerm.value = true;
}

const ruleList = Object.values(RULE_META);
</script>

<template>
  <section ref="formRef" class="panel form-panel">
    <h2>折扣策略{{ draft.mode === "revision" ? " · 新建版本" : " · 新建" }}</h2>

    <el-alert
      v-if="draft.mode === 'revision' && predecessor"
      type="warning"
      :closable="false"
      show-icon
      class="revision-banner"
    >
      <template #title>
        正在基于「{{ predecessor.fuel }} / {{ predecessor.tier }} / v{{ predecessor.versionNo }}」新建版本
      </template>
      <div class="banner-body">
        已生效或已排期的调价不能直接覆盖；新版开始日前旧版自动截至前一天，旧价继续保留在版本链中。本次必须填写调价原因。
        <el-button link type="primary" @click="cancelRevision">取消修订</el-button>
      </div>
    </el-alert>

    <el-form label-position="top" @submit.prevent>
      <div class="form-row">
        <el-form-item label="油品" required>
          <el-select v-model="fuelProxy" placeholder="请选择油品" :disabled="draft.mode === 'revision'" style="width: 100%">
            <el-option v-for="f in FUELS" :key="f" :label="f" :value="f" />
          </el-select>
        </el-form-item>
        <el-form-item label="会员等级" required>
          <el-select v-model="tierProxy" placeholder="请选择等级" :disabled="draft.mode === 'revision'" style="width: 100%">
            <el-option v-for="t in MEMBER_TIERS" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
      </div>

      <el-form-item label="折扣率（百分数，88 = 八八折）" required>
        <el-input-number
          v-model="rateProxy"
          :min="1"
          :max="100"
          :precision="0"
          controls-position="right"
          style="width: 100%"
        />
      </el-form-item>

      <div class="form-row">
        <el-form-item label="生效开始日" required>
          <el-date-picker
            v-model="startProxy"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择开始日"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="生效结束日">
          <el-date-picker
            v-model="endProxy"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择结束日"
            :disabled="longTerm"
            style="width: 100%"
          />
        </el-form-item>
      </div>
      <el-switch
        :model-value="longTerm"
        active-text="长期有效（结束日为空）"
        inline-prompt
        class="longterm-switch"
        @change="toggleLongTerm"
      />

      <div v-if="fuelPrice" class="price-preview">
        <span>挂牌价 <strong>{{ formatMoney(fuelPrice.listPrice) }}</strong></span>
        <span>成本价 <strong>{{ formatMoney(fuelPrice.costPrice) }}</strong></span>
        <span>
          优惠后价
          <strong :class="{ 'price-danger': belowCost }">
            {{ discounted === null ? "—" : formatMoney(discounted) }}
          </strong>
          <el-tag v-if="belowCost" type="danger" size="small" effect="plain">低于成本价</el-tag>
        </span>
      </div>

      <el-form-item :label="belowCost ? '审批编号（低于成本价，必填）' : '审批编号'" :required="belowCost">
        <el-input v-model="approvalProxy" placeholder="例如 APR-2026-0901；低于成本价时不填将整单拒绝" />
      </el-form-item>

      <el-form-item :label="draft.mode === 'revision' ? '调价原因（必填）' : '调价原因'" :required="draft.mode === 'revision'">
        <el-input
          v-model="reasonProxy"
          type="textarea"
          :rows="2"
          placeholder="新建版本时必须填写原因，例如：秋季会员回馈"
        />
      </el-form-item>

      <el-form-item label="操作员">
        <el-input v-model="operatorProxy" placeholder="请输入操作员姓名" />
      </el-form-item>

      <div class="form-actions">
        <el-button type="primary" @click="submit">提交整单</el-button>
        <el-button @click="cancelRevision">{{ draft.mode === "revision" ? "取消修订" : "清空草稿" }}</el-button>
      </div>
    </el-form>

    <el-alert
      v-if="conflicts.length"
      type="error"
      show-icon
      :closable="false"
      class="conflict-head"
      :title="`整单拒绝，草稿已保留（${conflicts.length} 条规则冲突）`"
    />
    <el-table v-if="conflicts.length" :data="conflicts" size="small" class="conflict-table" border>
      <el-table-column prop="rule" label="触发规则" min-width="200" />
      <el-table-column label="油品" width="100">
        <template #default="{ row }">{{ row.fuel || "—" }}</template>
      </el-table-column>
      <el-table-column label="等级" width="100">
        <template #default="{ row }">{{ row.tier || "—" }}</template>
      </el-table-column>
      <el-table-column prop="range" label="冲突区间" min-width="190" />
      <el-table-column prop="message" label="说明" min-width="240" />
    </el-table>

    <el-collapse class="rule-book">
      <el-collapse-item title="规则台账（提交前生效的 5 条规则）" name="rules">
        <ol class="rule-list">
          <li v-for="meta in ruleList" :key="meta.rule">
            <strong>{{ meta.rule }}</strong>
            <span>{{ meta.message }}</span>
          </li>
        </ol>
      </el-collapse-item>
    </el-collapse>
  </section>
</template>
