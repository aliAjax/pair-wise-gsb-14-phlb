<script setup lang="ts">
// 页面层：版本链台账主表。
// 每条链固定一个油品+等级，列出全部版本；撤回只面向“未生效最新版”，
// 已生效版本只提供“新建调价版本”。
import { computed, ref } from "vue";
import { discountedPrice, FUELS, fuelByCode, MEMBER_LEVELS } from "../catalog";
import { useLedgerStore } from "../store";
import { formatRange } from "../time";
import { formatRate, money, STATUS_CLASS, STATUS_LABEL } from "../ui";
import type { Policy } from "../types";

const store = useLedgerStore();
const filterFuel = ref("");
const filterLevel = ref("");
const expanded = ref<Set<string>>(new Set());

const filteredChains = computed(() =>
  store.chains.filter(
    (row) =>
      (!filterFuel.value || row.fuelCode === filterFuel.value) &&
      (!filterLevel.value || row.levelCode === filterLevel.value)
  )
);

function toggle(id: string) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

function canWithdraw(policy: Policy, versionId: string): boolean {
  const live = policy.versions.filter((v) => v.status !== "withdrawn");
  const latest = live[live.length - 1];
  const version = policy.versions.find((v) => v.id === versionId);
  return latest?.id === versionId && version?.status === "upcoming";
}

function finalPrice(policy: Policy, rate: number) {
  const fuel = fuelByCode(policy.fuelCode);
  return fuel ? money(discountedPrice(fuel.listPrice, rate)) : "—";
}

function withdrawTitle(policy: Policy, versionId: string): string {
  return canWithdraw(policy, versionId)
    ? "撤回该未生效版本，并恢复上一版区间"
    : "仅未生效的最新版本可撤回；已生效调价只能新建带原因版本";
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>折扣版本链台账</h2>
      <span class="chain-count">共 {{ filteredChains.length }} 条链</span>
    </div>

    <div class="filters-inline">
      <label>油品
        <select v-model="filterFuel">
          <option value="">全部油品</option>
          <option v-for="fuel in FUELS" :key="fuel.code" :value="fuel.code">{{ fuel.name }}</option>
        </select>
      </label>
      <label>等级
        <select v-model="filterLevel">
          <option value="">全部等级</option>
          <option v-for="level in MEMBER_LEVELS" :key="level.code" :value="level.code">{{ level.name }}</option>
        </select>
      </label>
    </div>

    <div v-if="filteredChains.length === 0" class="empty">暂无策略版本链</div>

    <div class="chain-list">
      <article v-for="row in filteredChains" :key="row.policy.id" class="chain-card">
        <header class="chain-head" @click="toggle(row.policy.id)">
          <div class="chain-id">
            <strong>{{ row.fuelName }}</strong>
            <span class="sep">/</span>
            <span>{{ row.levelName }}</span>
          </div>
          <div class="chain-current">
            <template v-if="row.active">
              <span :class="['status', STATUS_CLASS[row.active.status]]">
                {{ STATUS_LABEL[row.active.status] }}
              </span>
              <span class="rate">{{ formatRate(row.active.discountRate) }}</span>
              <span class="price">会员价 ¥{{ finalPrice(row.policy, row.active.discountRate) }}</span>
            </template>
            <span v-else class="no-active">当前无生效折扣（执行挂牌价）</span>
          </div>
          <div class="chain-meta">
            {{ row.total }} 个版本<span v-if="row.withdrawnCount">（含 {{ row.withdrawnCount }} 个已撤回）</span>
            <span class="caret">{{ expanded.has(row.policy.id) ? "收起 ▲" : "展开 ▼" }}</span>
          </div>
        </header>

        <div v-if="expanded.has(row.policy.id)" class="version-timeline">
          <div
            v-for="version in [...row.policy.versions].reverse()"
            :key="version.id"
            class="version-row"
            :class="{ withdrawn: version.status === 'withdrawn' }"
          >
            <div class="version-main">
              <span class="vno">V{{ version.versionNo }}</span>
              <span :class="['status', STATUS_CLASS[version.status]]">
                {{ STATUS_LABEL[version.status] }}
              </span>
              <span class="rate">{{ formatRate(version.discountRate) }}</span>
              <span class="price">¥{{ finalPrice(row.policy, version.discountRate) }}</span>
              <span class="range">{{ formatRange(version.startDate, version.endDate) }}</span>
            </div>
            <div class="version-sub">
              <span v-if="version.approvalNo" class="approval">审批：{{ version.approvalNo }}</span>
              <span v-else class="approval muted">无审批（不低于成本）</span>
              <span class="reason">{{ version.reason || "—" }}</span>
              <span class="operator">{{ version.operator }} · {{ version.createdAt.slice(0, 10) }}</span>
            </div>
            <div class="version-actions">
              <button
                v-if="version.status === 'active'"
                type="button"
                class="mini"
                @click.stop="store.startRevise(row.policy.id)"
              >
                新建调价版本
              </button>
              <button
                type="button"
                class="mini danger"
                :disabled="!canWithdraw(row.policy, version.id)"
                :title="withdrawTitle(row.policy, version.id)"
                @click.stop="store.withdraw(row.policy.id, version.id)"
              >
                撤回
              </button>
            </div>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
