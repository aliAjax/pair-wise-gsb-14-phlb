<script setup lang="ts">
// 页面层：冲突清单。每条冲突按规则要求列出 油品 / 等级 / 区间 / 触发规则。
import type { Conflict } from "../types";

defineProps<{ conflicts: Conflict[] }>();
</script>

<template>
  <section v-if="conflicts.length > 0" class="panel conflict-panel">
    <div class="panel-head">
      <h2>整单拒绝 · 命中 {{ conflicts.length }} 条规则</h2>
      <span class="conflict-hint">草稿已保留，可修正后重新提交</span>
    </div>
    <ul class="conflict-list">
      <li v-for="(item, index) in conflicts" :key="index" class="conflict-item">
        <div class="conflict-top">
          <span class="rule-code">{{ item.rule.code }}</span>
          <span class="rule-name">{{ item.rule.name }}</span>
        </div>
        <p class="conflict-detail">{{ item.detail }}</p>
        <dl class="conflict-meta">
          <div>
            <dt>油品</dt>
            <dd>{{ item.fuelNames.length ? item.fuelNames.join("、") : "—" }}</dd>
          </div>
          <div>
            <dt>会员等级</dt>
            <dd>{{ item.levelNames.length ? item.levelNames.join("、") : "—" }}</dd>
          </div>
          <div class="wide">
            <dt>冲突区间</dt>
            <dd>
              <span v-for="(range, i) in item.intervals" :key="i" class="range-chip">
                {{ range }}
              </span>
              <span v-if="item.intervals.length === 0">—</span>
            </dd>
          </div>
          <div class="wide">
            <dt>触发规则</dt>
            <dd>{{ item.rule.code }} · {{ item.rule.message }}</dd>
          </div>
        </dl>
      </li>
    </ul>
  </section>
</template>
