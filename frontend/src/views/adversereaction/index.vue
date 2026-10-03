<template>
  <section class="page adr-page">
    <header class="page-head">
      <div>
        <h2>不良反应报告与监管上报台账</h2>
        <p class="page-desc">
          电话、邮件获知统一登记归口；按报告类型分栏，逐栏呈现报告编号、上报时限、随访记录与上报状态，
          超时限未报单独成栏。时限口径唯一，节假日顺延留痕，状态单向流转。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记不良反应报告</button>
        <button class="btn" type="button" @click="downloadLedger">导出台账</button>
        <button class="btn ghost" type="button" @click="resetAll">重置示例</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">在册报告</span>
        <strong class="stat-value">{{ reports.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">待上报</span>
        <strong class="stat-value">{{ countByStatus('已登记') }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">超时限未报</span>
        <strong class="stat-value overdue-text">{{ overdueReports.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已上报/随访中</span>
        <strong class="stat-value">{{ countByStatus('已上报') }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已关闭</span>
        <strong class="stat-value">{{ countByStatus('已关闭') }}</strong>
      </article>
    </div>

    <p class="notice-bar">
      业务口径（先按业务定，报告类型说了算）：
      <strong>报告类型决定上报时限和随访节点</strong>；随访只能登记该类型清单内的节点。
      时限落在法定节假日/休息日自动顺延到工作日，顺延逐天留痕；手工顺延不得越过法定上限，越界打回重填。
    </p>

    <details class="rule-box">
      <summary>报告类型 / 上报时限 / 随访节点口径（点击展开）</summary>
      <table class="data-table rule-table">
        <thead>
          <tr><th>报告类型</th><th>上报时限</th><th>随访节点</th><th>口径依据</th></tr>
        </thead>
        <tbody>
          <tr v-for="rule in ADR_TYPE_RULES" :key="rule.key">
            <td>{{ rule.label }}</td>
            <td>{{ rule.limitLabel }}</td>
            <td>
              <span v-for="node in rule.followups" :key="node.node" class="node-chip">{{ node.node }}</span>
            </td>
            <td>{{ rule.basis }}</td>
          </tr>
        </tbody>
      </table>
      <p class="rule-foot">
        节假日顺延日历：2026年法定节假日与调休按国务院办公厅安排统一维护，台账、详情、导出取到的是同一套。
      </p>
    </details>

    <form class="filter-bar" @submit.prevent>
      <label class="filter-item">
        <span>按怀疑药品归口筛选</span>
        <input v-model="drugFilter" placeholder="输入怀疑药品" />
      </label>
      <button class="btn ghost" type="button" @click="drugFilter = ''">清除</button>
      <span class="filter-hint">报告按怀疑药品归口，共 {{ drugOptions.length }} 个品种</span>
    </form>

    <!-- 超时限未报：单独一栏展示 -->
    <section class="overdue-panel">
      <header class="overdue-head">
        <h3>超时限未报（{{ overdueReports.length }}）</h3>
        <span>状态仍为「已登记」且当前日期晚于上报时限；上报时须超期知情确认并回写质量投诉待办。</span>
      </header>
      <div v-if="overdueReports.length" class="overdue-grid">
        <article v-for="report in overdueReports" :key="report.id" class="overdue-card">
          <div class="overdue-card-head">
            <strong>{{ report.reportNo }}</strong>
            <span class="badge red">超 {{ overdueDays(report) }} 天</span>
          </div>
          <p class="overdue-drug">{{ report.suspectDrug }} · {{ typeLabel(report.type) }}</p>
          <p class="overdue-meta">时限 {{ effectiveDeadline(report) }} · 报告人 {{ report.reporter }}</p>
          <div class="overdue-actions">
            <button class="btn primary small" type="button" @click="openSubmit(report)">超期上报</button>
            <button class="btn small" type="button" @click="openDetail(report)">详情</button>
          </div>
        </article>
      </div>
      <p v-else class="empty-state">暂无超时限未报报告</p>
    </section>

    <!-- 按报告类型分栏 -->
    <div class="kanban">
      <section v-for="rule in ADR_TYPE_RULES" :key="rule.key" class="kanban-col">
        <header class="col-head">
          <h3>{{ rule.label }}</h3>
          <span class="col-limit">{{ rule.limitLabel }}</span>
        </header>
        <p class="col-count">{{ columnReports(rule.key).length }} 条</p>
        <div class="card-list">
          <article v-for="report in columnReports(rule.key)" :key="report.id" class="adr-card" :class="{ late: isOverdue(report) }">
            <div class="card-head">
              <strong>{{ report.reportNo }}</strong>
              <span class="badge" :class="statusClass(report.status)">{{ report.status }}</span>
            </div>
            <p class="card-drug">{{ report.suspectDrug }}</p>
            <dl class="card-meta">
              <div><dt>上报时限</dt><dd :class="{ 'overdue-text': isOverdue(report) }">{{ effectiveDeadline(report) }}</dd></div>
              <div><dt>获知日期</dt><dd>{{ report.awarenessDate }}</dd></div>
              <div><dt>报告人</dt><dd>{{ report.reporter }}（{{ report.source }}）</dd></div>
              <div><dt>随访记录</dt><dd>{{ report.follows.length }}/{{ requiredFollow(report).length }} 节点</dd></div>
            </dl>
            <div v-if="latestTrace(report).hits.length" class="trace-mini" :title="traceTitle(report)">
              顺延 {{ latestTrace(report).hits.length }} 天：{{ latestTrace(report).hits.map((h) => h.date).join('、') }}
            </div>
            <div class="card-actions">
              <button
                v-if="nextAction(report.status)"
                class="link"
                type="button"
                @click="onAdvance(report)"
              >
                {{ nextAction(report.status) }}
              </button>
              <button v-if="canFollow(report)" class="link" type="button" @click="openFollow(report)">登记随访</button>
              <button v-if="report.status === '已登记'" class="link" type="button" @click="openExtend(report)">节假日顺延</button>
              <button class="link" type="button" @click="openDetail(report)">详情</button>
            </div>
          </article>
          <p v-if="!columnReports(rule.key).length" class="empty-state">本栏暂无报告</p>
        </div>
      </section>
    </div>

    <p v-if="message" class="message-bar" :class="messageKind">{{ message }}</p>

    <!-- 登记报告 -->
    <div v-if="createOpen" class="modal-mask" @click.self="createOpen = false">
      <form class="modal" @submit.prevent="submitCreate">
        <h3>登记不良反应报告</h3>
        <label class="form-item">
          <span>报告编号 *</span>
          <input v-model="createForm.reportNo" placeholder="如 ADR-2026-0008" />
        </label>
        <label class="form-item">
          <span>怀疑药品（归口）*</span>
          <input v-model="createForm.suspectDrug" placeholder="按怀疑药品归口" list="drug-options" />
          <datalist id="drug-options">
            <option v-for="drug in drugOptions" :key="drug" :value="drug" />
          </datalist>
        </label>
        <label class="form-item">
          <span>报告类型 *（决定时限与随访节点）</span>
          <select v-model="createForm.type" @change="syncDeclaredDeadline">
            <option v-for="rule in ADR_TYPE_RULES" :key="rule.key" :value="rule.key">{{ rule.label }} · {{ rule.limitLabel }}</option>
          </select>
        </label>
        <label class="form-item">
          <span>获知日期 *</span>
          <input v-model="createForm.awarenessDate" type="date" @change="syncDeclaredDeadline" />
        </label>
        <div class="form-item readonly">
          <span>法定时限 / 顺延上限</span>
          <strong>{{ createDeadlineHint }}</strong>
        </div>
        <label class="form-item">
          <span>上报时限填报 *（越界打回重填）</span>
          <input v-model="createForm.declaredDeadline" type="date" />
          <small class="field-hint">只能填在获知日与法定顺延上限之间</small>
        </label>
        <div class="form-row">
          <label class="form-item">
            <span>报告人 *</span>
            <input v-model="createForm.reporter" />
          </label>
          <label class="form-item">
            <span>获知渠道</span>
            <select v-model="createForm.source">
              <option>电话</option>
              <option>邮件</option>
              <option>现场</option>
            </select>
          </label>
        </div>
        <label class="form-item">
          <span>不良反应表现 *</span>
          <textarea v-model="createForm.reaction" rows="2" />
        </label>
        <p v-if="createError" class="error-text">{{ createError }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="createOpen = false">取消</button>
          <button class="btn primary" type="submit">保存登记</button>
        </div>
      </form>
    </div>

    <!-- 上报确认（超期需知情） -->
    <div v-if="submitOpen" class="modal-mask" @click.self="submitOpen = false">
      <form class="modal" @submit.prevent="confirmSubmit">
        <h3>提交监管上报 · {{ submitTarget?.reportNo }}</h3>
        <p class="field-hint">状态单向流转：已登记 → 已上报。上报后按类型节点登记随访。</p>
        <label class="form-item">
          <span>上报渠道</span>
          <input v-model="submitChannel" />
        </label>
        <label v-if="submitLate" class="form-item check">
          <input v-model="submitAck" type="checkbox" />
          <span>超期已知情：该报告时限为 {{ submitTarget ? effectiveDeadline(submitTarget) : '' }}，现已超期，确认迟报并回写投诉待办</span>
        </label>
        <p v-if="submitError" class="error-text">{{ submitError }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="submitOpen = false">取消</button>
          <button class="btn primary" type="submit">确认上报</button>
        </div>
      </form>
    </div>

    <!-- 登记随访 -->
    <div v-if="followOpen" class="modal-mask" @click.self="followOpen = false">
      <form class="modal" @submit.prevent="submitFollow">
        <h3>登记随访 · {{ followTarget?.reportNo }}</h3>
        <label class="form-item">
          <span>随访节点 *（{{ typeLabel(followTarget?.type) }}规定）</span>
          <select v-model="followForm.node">
            <option value="" disabled>请选择节点</option>
            <option
              v-for="node in selectableFollowNodes(followTarget)"
              :key="node"
              :value="node"
            >{{ node }}</option>
          </select>
        </label>
        <div class="form-row">
          <label class="form-item">
            <span>随访日期 *</span>
            <input v-model="followForm.followDate" type="date" />
          </label>
          <label class="form-item">
            <span>报告人 *</span>
            <input v-model="followForm.reporter" />
          </label>
        </div>
        <label class="form-item">
          <span>随访内容/转归 *</span>
          <textarea v-model="followForm.content" rows="3" />
        </label>
        <p v-if="followError" class="error-text">{{ followError }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="followOpen = false">取消</button>
          <button class="btn primary" type="submit">保存随访</button>
        </div>
      </form>
    </div>

    <!-- 节假日顺延登记 -->
    <div v-if="extendOpen" class="modal-mask" @click.self="extendOpen = false">
      <form class="modal" @submit.prevent="submitExtend">
        <h3>节假日顺延登记 · {{ extendTarget?.reportNo }}</h3>
        <p class="field-hint">
          当前时限 {{ extendTarget ? effectiveDeadline(extendTarget) : '' }}，
          法定顺延上限 {{ extendTarget ? lawfulDeadlineCap(extendTarget.type, extendTarget.awarenessDate) : '' }}，
          越过上限打回重填，顺延必须写明理由留痕。
        </p>
        <label class="form-item">
          <span>顺延后时限 *</span>
          <input v-model="extendForm.newDeadline" type="date" />
        </label>
        <label class="form-item">
          <span>顺延理由 *</span>
          <textarea v-model="extendForm.reason" rows="2" placeholder="如：时限落国庆假期，按国务院放假安排顺延" />
        </label>
        <p v-if="extendError" class="error-text">{{ extendError }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="extendOpen = false">取消</button>
          <button class="btn primary" type="submit">保存顺延留痕</button>
        </div>
      </form>
    </div>

    <!-- 详情 -->
    <div v-if="detailTarget" class="modal-mask" @click.self="detailTarget = null">
      <div class="modal modal-wide">
        <h3>{{ detailTarget.reportNo }} · {{ detailTarget.suspectDrug }}</h3>
        <dl class="detail-grid">
          <div><dt>报告类型</dt><dd>{{ typeLabel(detailTarget.type) }}</dd></div>
          <div><dt>上报状态</dt><dd>{{ detailTarget.status }}</dd></div>
          <div><dt>获知日期</dt><dd>{{ detailTarget.awarenessDate }}</dd></div>
          <div><dt>上报时限</dt><dd>{{ effectiveDeadline(detailTarget) }}</dd></div>
          <div><dt>报告人</dt><dd>{{ detailTarget.reporter }}（{{ detailTarget.source }}）</dd></div>
          <div><dt>上报渠道/日期</dt><dd>{{ detailTarget.reportChannel }} / {{ detailTarget.submittedAt || '—' }}</dd></div>
          <div class="span-2"><dt>不良反应表现</dt><dd>{{ detailTarget.reaction }}</dd></div>
        </dl>

        <h4>随访记录（报告人按类型节点登记）</h4>
        <table class="data-table">
          <thead><tr><th>节点</th><th>随访日期</th><th>内容/转归</th><th>报告人</th></tr></thead>
          <tbody>
            <tr v-for="follow in detailTarget.follows" :key="follow.node">
              <td>{{ follow.node }}</td><td>{{ follow.followDate }}</td><td>{{ follow.content }}</td><td>{{ follow.reporter }}</td>
            </tr>
            <tr v-if="!detailTarget.follows.length"><td colspan="4" class="empty-state">尚无随访记录</td></tr>
          </tbody>
        </table>

        <h4>节假日顺延留痕</h4>
        <table class="data-table">
          <thead><tr><th>基础时限</th><th>生效时限</th><th>命中顺延日</th><th>说明</th><th>登记日期</th></tr></thead>
          <tbody>
            <tr v-for="trace in detailTarget.traces" :key="trace.changedAt + trace.effectiveDeadline">
              <td>{{ trace.baseDeadline }}</td>
              <td>{{ trace.effectiveDeadline }}</td>
              <td>{{ trace.hits.length ? trace.hits.map((h) => `${h.date} ${h.reason}`).join('；') : '—' }}</td>
              <td>{{ trace.note }}</td>
              <td>{{ trace.changedAt }}</td>
            </tr>
          </tbody>
        </table>

        <h4>操作日志</h4>
        <ul class="log-list">
          <li v-for="(log, index) in detailTarget.logs" :key="index">
            {{ log.at }} · {{ log.operator }} · {{ log.action }} — {{ log.detail }}
          </li>
        </ul>
        <div class="modal-actions">
          <button class="btn primary" type="button" @click="detailTarget = null">关闭</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  ADR_NEXT_ACTION,
  ADR_TYPE_BY_KEY,
  ADR_TYPE_RULES,
  baseDeadline,
  lawfulDeadlineCap,
  todayText,
  type AdrStatus,
  type AdrTypeKey,
} from '@/data/adr-rules'
import type { AdrReport, CreateAdrInput, CreateFollowInput } from '@/data/adr-store'
import {
  advanceStatus,
  createReport,
  downloadLedger as doDownload,
  effectiveDeadline as deadlineOf,
  isOverdue as reportOverdue,
  overdueDays as daysOverdue,
  registerExtension,
  registerFollowUp,
} from '@/api/adr-service'
import { listAdrReports, resetAdrReports } from '@/data/adr-store'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const operator = session.operator

const reports = ref<AdrReport[]>([])
const drugFilter = ref('')
const message = ref('')
const messageKind = ref<'ok' | 'err'>('ok')

function showMessage(text: string, kind: 'ok' | 'err' = 'ok') {
  message.value = text
  messageKind.value = kind
}

function reload() {
  reports.value = listAdrReports()
}

onMounted(reload)

function typeLabel(type: AdrTypeKey | undefined): string {
  return type ? ADR_TYPE_BY_KEY.get(type)?.label ?? type : '—'
}

function requiredFollow(report: AdrReport) {
  return ADR_TYPE_BY_KEY.get(report.type)?.followups ?? []
}

function latestTrace(report: AdrReport) {
  return report.traces[report.traces.length - 1]
}

function traceTitle(report: AdrReport): string {
  return latestTrace(report).hits.map((hit) => `${hit.date} ${hit.reason}`).join('；')
}

function effectiveDeadline(report: AdrReport): string {
  return deadlineOf(report)
}

function isOverdue(report: AdrReport): boolean {
  return reportOverdue(report)
}

function overdueDays(report: AdrReport): number {
  return daysOverdue(report)
}

function nextAction(status: AdrStatus): string | undefined {
  return ADR_NEXT_ACTION[status]
}

function canFollow(report: AdrReport): boolean {
  return report.status === '已上报' || report.status === '已随访'
}

function statusClass(status: AdrStatus): string {
  return {
    已登记: 'amber',
    已上报: 'blue',
    已随访: 'cyan',
    已关闭: 'green',
  }[status]
}

const filteredReports = computed(() => {
  const drug = drugFilter.value.trim()
  if (!drug) {
    return reports.value
  }
  return reports.value.filter((report) => report.suspectDrug.includes(drug))
})

const drugOptions = computed(() => [...new Set(reports.value.map((report) => report.suspectDrug))])

function columnReports(type: AdrTypeKey): AdrReport[] {
  return filteredReports.value.filter((report) => report.type === type)
}

const overdueReports = computed(() =>
  filteredReports.value.filter((report) => isOverdue(report)),
)

function countByStatus(status: AdrStatus): number {
  return reports.value.filter((report) => report.status === status).length
}

// ----- 登记报告 -------------------------------------------------------------

const createOpen = ref(false)
const createError = ref('')
const createForm = reactive<CreateAdrInput>({
  reportNo: '',
  suspectDrug: '',
  type: 'general',
  awarenessDate: todayText(),
  reporter: operator,
  source: '电话',
  reaction: '',
  declaredDeadline: '',
})

const createDeadlineHint = computed(() => {
  if (!createForm.awarenessDate) {
    return '先选获知日期'
  }
  const base = baseDeadline(createForm.type, createForm.awarenessDate)
  const cap = lawfulDeadlineCap(createForm.type, createForm.awarenessDate)
  return base === cap ? `${base}（无顺延）` : `${base}，顺延后 ${cap}`
})

function syncDeclaredDeadline() {
  if (createForm.awarenessDate) {
    createForm.declaredDeadline = lawfulDeadlineCap(createForm.type, createForm.awarenessDate)
  }
}

function openCreate() {
  Object.assign(createForm, {
    reportNo: '',
    suspectDrug: '',
    type: 'general',
    awarenessDate: todayText(),
    reporter: operator,
    source: '电话',
    reaction: '',
    declaredDeadline: '',
  })
  syncDeclaredDeadline()
  createError.value = ''
  createOpen.value = true
}

function submitCreate() {
  const result = createReport({ ...createForm }, operator)
  if (!result.ok) {
    createError.value = result.message
    return
  }
  createOpen.value = false
  reload()
  showMessage(result.message)
}

// ----- 状态流转（上报） ------------------------------------------------------

const submitOpen = ref(false)
const submitError = ref('')
const submitTarget = ref<AdrReport | null>(null)
const submitChannel = ref('国家药监局不良反应监测系统')
const submitAck = ref(false)
const submitLate = ref(false)

function onAdvance(report: AdrReport) {
  const action = nextAction(report.status)
  if (action === '提交上报') {
    openSubmit(report)
    return
  }
  const result = advanceStatus(report.id, operator)
  if (!result.ok) {
    showMessage(result.message, 'err')
    return
  }
  reload()
  showMessage(result.message)
}

function openSubmit(report: AdrReport) {
  submitTarget.value = report
  submitChannel.value = '国家药监局不良反应监测系统'
  submitAck.value = false
  submitLate.value = isOverdue(report)
  submitError.value = ''
  submitOpen.value = true
}

function confirmSubmit() {
  if (!submitTarget.value) {
    return
  }
  const result = advanceStatus(
    submitTarget.value.id,
    operator,
    submitLate.value ? submitAck.value : false,
    submitChannel.value,
  )
  if (!result.ok) {
    submitError.value = result.message
    return
  }
  submitOpen.value = false
  reload()
  showMessage(result.message)
}

// ----- 登记随访 -------------------------------------------------------------

const followOpen = ref(false)
const followError = ref('')
const followTarget = ref<AdrReport | null>(null)
const followForm = reactive<CreateFollowInput>({ node: '', followDate: todayText(), content: '', reporter: operator })

function selectableFollowNodes(report: AdrReport | null): string[] {
  if (!report) {
    return []
  }
  const allowed = ADR_TYPE_BY_KEY.get(report.type)?.followups.map((item) => item.node) ?? []
  return allowed.filter((node) => !report.follows.some((follow) => follow.node === node))
}

function openFollow(report: AdrReport) {
  followTarget.value = report
  Object.assign(followForm, { node: '', followDate: todayText(), content: '', reporter: report.reporter || operator })
  followError.value = ''
  followOpen.value = true
}

function submitFollow() {
  if (!followTarget.value) {
    return
  }
  const result = registerFollowUp(followTarget.value.id, { ...followForm }, operator)
  if (!result.ok) {
    followError.value = result.message
    return
  }
  followOpen.value = false
  reload()
  showMessage(result.message)
}

// ----- 节假日顺延 -----------------------------------------------------------

const extendOpen = ref(false)
const extendError = ref('')
const extendTarget = ref<AdrReport | null>(null)
const extendForm = reactive({ newDeadline: '', reason: '' })

function openExtend(report: AdrReport) {
  extendTarget.value = report
  const cap = lawfulDeadlineCap(report.type, report.awarenessDate)
  Object.assign(extendForm, {
    newDeadline: cap === effectiveDeadline(report) ? '' : cap,
    reason: '',
  })
  extendError.value = ''
  extendOpen.value = true
}

function submitExtend() {
  if (!extendTarget.value) {
    return
  }
  const result = registerExtension(extendTarget.value.id, extendForm.newDeadline, extendForm.reason, operator)
  if (!result.ok) {
    extendError.value = result.message
    return
  }
  extendOpen.value = false
  reload()
  showMessage(result.message)
}

// ----- 详情 / 导出 / 重置 ----------------------------------------------------

const detailTarget = ref<AdrReport | null>(null)

function openDetail(report: AdrReport) {
  detailTarget.value = reports.value.find((item) => item.id === report.id) ?? report
}

function downloadLedger() {
  doDownload()
}

function resetAll() {
  reports.value = resetAdrReports()
  showMessage('已重置为示例数据（不影响其他台账）')
}
</script>

<style scoped>
.adr-page { display: flex; flex-direction: column; gap: 12px; }
.overdue-text { color: #b42318; }
.notice-bar { background: #fff7ed; border: 1px solid #fdba74; color: #9a3412; border-radius: 8px; padding: 8px 12px; font-size: 13px; margin: 0; }
.rule-box { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; }
.rule-box summary { cursor: pointer; font-size: 13px; color: var(--brand); }
.rule-table { margin-top: 8px; }
.rule-foot { font-size: 12px; color: var(--muted); margin: 6px 0 0; }
.node-chip { display: inline-block; background: #eef2f7; border-radius: 999px; padding: 2px 8px; margin: 1px 4px 1px 0; font-size: 12px; }
.filter-hint { font-size: 12px; color: var(--muted); align-self: center; }

.overdue-panel { border: 1px solid #f04438; border-radius: 8px; background: #fef3f2; padding: 10px 12px; }
.overdue-head { display: flex; gap: 12px; align-items: baseline; }
.overdue-head h3 { margin: 0; color: #b42318; font-size: 15px; }
.overdue-head span { font-size: 12px; color: #912018; }
.overdue-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; margin-top: 10px; }
.overdue-card { background: #fff; border: 1px solid #fda29b; border-radius: 8px; padding: 10px; }
.overdue-card-head { display: flex; justify-content: space-between; align-items: center; }
.overdue-drug { margin: 6px 0 2px; font-size: 13px; font-weight: 600; }
.overdue-meta { margin: 0 0 8px; font-size: 12px; color: var(--muted); }
.overdue-actions { display: flex; gap: 8px; }

.kanban { display: grid; grid-template-columns: repeat(5, minmax(230px, 1fr)); gap: 10px; align-items: start; }
.kanban-col { background: #eef2f7; border-radius: 8px; padding: 8px; min-height: 120px; }
.col-head { display: flex; flex-direction: column; gap: 2px; }
.col-head h3 { margin: 0; font-size: 14px; }
.col-limit { font-size: 11px; color: var(--muted); }
.col-count { font-size: 12px; color: var(--muted); margin: 2px 0 6px; }
.card-list { display: flex; flex-direction: column; gap: 8px; }
.adr-card { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
.adr-card.late { border-color: #f04438; box-shadow: inset 3px 0 0 #f04438; }
.card-head { display: flex; justify-content: space-between; align-items: center; }
.card-drug { margin: 6px 0 4px; font-size: 13px; font-weight: 600; }
.card-meta { margin: 0; display: grid; grid-template-columns: 1fr; gap: 2px; font-size: 12px; }
.card-meta div { display: flex; justify-content: space-between; gap: 8px; }
.card-meta dt { color: var(--muted); }
.card-meta dd { margin: 0; text-align: right; }
.trace-mini { margin-top: 4px; font-size: 11px; color: #b54708; background: #fffaeb; border-radius: 4px; padding: 2px 6px; }
.card-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
.badge { border-radius: 999px; padding: 1px 8px; font-size: 11px; background: #e5e7eb; }
.badge.amber { background: #fef3c7; color: #92400e; }
.badge.blue { background: #dbeafe; color: #1e40af; }
.badge.cyan { background: #cffafe; color: #155e75; }
.badge.green { background: #dcfce7; color: #166534; }
.badge.red { background: #fee2e2; color: #991b1b; }

.message-bar { position: sticky; bottom: 8px; align-self: center; border-radius: 8px; padding: 8px 14px; font-size: 13px; margin: 0; }
.message-bar.ok { background: #ecfdf3; border: 1px solid #6ce9a6; color: #027a48; }
.message-bar.err { background: #fef3f2; border: 1px solid #fda29b; color: #b42318; }

.modal-mask { position: fixed; inset: 0; background: rgba(16, 24, 40, 0.45); display: flex; align-items: center; justify-content: center; z-index: 20; }
.modal { background: #fff; border-radius: 10px; padding: 18px 20px; width: 460px; max-height: 88vh; overflow: auto; }
.modal-wide { width: 720px; }
.modal h3 { margin: 0 0 12px; font-size: 16px; }
.modal h4 { margin: 14px 0 6px; font-size: 14px; }
.form-item { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; font-size: 13px; }
.form-item span { color: var(--muted); }
.form-item input, .form-item select, .form-item textarea { border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; font: inherit; }
.form-item.check { flex-direction: row; align-items: flex-start; gap: 8px; }
.form-item.readonly strong { font-weight: 600; }
.form-row { display: flex; gap: 10px; }
.form-row .form-item { flex: 1; }
.field-hint { font-size: 12px; color: var(--muted); }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.btn.small { padding: 4px 10px; font-size: 12px; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; margin: 0 0 8px; }
.detail-grid div { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; }
.detail-grid .span-2 { grid-column: 1 / -1; }
.detail-grid dt { color: var(--muted); }
.detail-grid dd { margin: 0; text-align: right; }
.log-list { margin: 0; padding-left: 18px; font-size: 12px; color: var(--muted); max-height: 140px; overflow: auto; }
.log-list li { margin-bottom: 2px; }
</style>

