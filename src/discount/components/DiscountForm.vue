<script setup lang="ts">
// 页面层：折扣策略表单（新建 / 调价草稿）。
// 只读 store、派发动作；所有判定来自规则层，组件内不写规则。
import { computed } from "vue";
import { FUELS, MEMBER_LEVELS } from "../catalog";
import { useLedgerStore } from "../store";
import { formatRate, money } from "../ui";

const store = useLedgerStore();
const draft = computed(() => store.draft);
const preview = computed(() => store.draftPreview);
const isRevise = computed(() => draft.value.revise !== null);

function patch(data: Record<string, unknown>) {
  store.updateDraft(data);
}

function onEndDateToggle(longTerm: boolean) {
  store.updateDraft({ endDate: longTerm ? null : store.today });
}

function submit() {
  store.submit();
}
</script>

<template>
  <form class="panel form-panel" @submit.prevent="submit">
    <div class="panel-head">
      <h2>{{ isRevise ? "新建调价版本" : "新增折扣策略" }}</h2>
      <span v-if="isRevise" class="revise-badge">调价模式 · 需填原因</span>
    </div>

    <div v-if="isRevise" class="revise-tip">
      基于已生效价格发起调价：将生成新版本并替换当前价，旧版本与旧价保留在版本链中可查。
    </div>

    <div class="form-grid">
      <label>
        油品
        <select
          :value="draft.fuelCode"
          :disabled="isRevise"
          required
          @change="patch({ fuelCode: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">请选择油品</option>
          <option v-for="fuel in FUELS" :key="fuel.code" :value="fuel.code">
            {{ fuel.name }}（挂牌 {{ money(fuel.listPrice) }} / 成本 {{ money(fuel.cost) }}）
          </option>
        </select>
      </label>

      <label>
        会员等级
        <select
          :value="draft.levelCode"
          :disabled="isRevise"
          required
          @change="patch({ levelCode: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">请选择等级</option>
          <option v-for="level in MEMBER_LEVELS" :key="level.code" :value="level.code">
            {{ level.name }}
          </option>
        </select>
      </label>

      <label>
        折扣率（0.01~1，如 0.95 = 95折）
        <input
          type="number"
          min="0.01"
          max="0.9999"
          step="0.01"
          :value="draft.discountRate ?? ''"
          required
          @input="patch({ discountRate: ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value) })"
        />
      </label>

      <div class="form-row">
        <label>
          生效开始日期
          <input
            type="date"
            :value="draft.startDate"
            :min="store.today"
            required
            @change="patch({ startDate: ($event.target as HTMLInputElement).value })"
          />
        </label>
        <label>
          结束日期
          <input
            v-if="draft.endDate !== null"
            type="date"
            :value="draft.endDate"
            :min="draft.startDate"
            @change="patch({ endDate: ($event.target as HTMLInputElement).value })"
          />
          <input v-else type="text" value="长期有效" disabled />
        </label>
      </div>
      <label class="inline-check">
        <input
          type="checkbox"
          :checked="draft.endDate === null"
          @change="onEndDateToggle(($event.target as HTMLInputElement).checked)"
        />
        长期有效（不设结束日期）
      </label>

      <label :class="{ required: preview?.belowCost }">
        审批编号{{ preview?.belowCost ? "（低于成本价，必填）" : "（低于成本价时必填）" }}
        <input
          type="text"
          :value="draft.approvalNo"
          placeholder="如 AP-2026-0109"
          @input="patch({ approvalNo: ($event.target as HTMLInputElement).value })"
        />
      </label>

      <label :class="{ required: isRevise }">
        调价原因{{ isRevise ? "（必填）" : "" }}
        <textarea
          :value="draft.reason"
          placeholder="已生效价格调价必须填写原因，便于版本追溯"
          @input="patch({ reason: ($event.target as HTMLTextAreaElement).value })"
        />
      </label>

      <label>
        操作员
        <input
          type="text"
          :value="draft.operator"
          placeholder="录入人"
          @input="patch({ operator: ($event.target as HTMLInputElement).value })"
        />
      </label>
    </div>

    <div v-if="preview" class="price-preview" :class="{ alert: preview.belowCost }">
      <div>
        挂牌价 <strong>{{ money(preview.listPrice) }}</strong> ×
        <strong>{{ draft.discountRate }}</strong>（{{ draft.discountRate !== null ? formatRate(draft.discountRate) : "—" }}）
      </div>
      <div>
        优惠后 <strong class="final-price">{{ money(preview.price) }} 元/升</strong>
        <span class="cost-line">成本 {{ money(preview.cost) }}</span>
      </div>
      <div v-if="preview.belowCost" class="below-cost">
        ⚠ 优惠后低于成本价：必须填写审批编号，否则整单拒绝（草稿保留）
      </div>
    </div>

    <div class="form-actions">
      <button type="submit">{{ isRevise ? "提交新版本" : "保存策略" }}</button>
      <button type="button" class="secondary" @click="store.discardDraft()">清空草稿</button>
    </div>
  </form>
</template>
