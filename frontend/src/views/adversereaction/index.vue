<template>
  <section class="page adr-page" data-module="adr">
    <header class="page-head">
      <div>
        <h2>不良反应报告与监管上报台账</h2>
        <p class="page-desc">
          电话、邮件两头来的不良反应统一归口到这一卷：按报告类型分栏，逐栏呈现报告编号、上报时限、随访记录与上报状态；
          报告按怀疑药品归口，随访节点由报告人登记，时限撞节假日顺延留痕，超时限未报单独挂出。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记不良反应报告</button>
        <button class="btn" type="button" @click="showHoliday = true">节假日/时限规则</button>
        <button class="btn" type="button" @click="exportRows">导出上报台账</button>
        <button class="btn ghost" type="button" @click="doReset">恢复示例</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">在册报告</span>
        <strong class="stat-value">{{ reports.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">待上报（监管未收）</span>
        <strong class="stat-value">{{ pendingSubmit.length }}</strong>
      </article>
      <article class="stat-card stat-danger">
        <span class="stat-label">超时限未报</span>
        <strong class="stat-value">{{ overdueList.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">随访进行中</span>
        <strong class="stat-value">{{ following.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已上报 / 已闭环</span>
        <strong class="stat-value">{{ submittedCount }} / {{ closedCount }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">回写投诉待办（未完成）</span>
        <strong class="stat-value">{{ openTodoCount }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span class="legend-item">状态单向链（个例）：待上报 → 已上报 → 随访中 → 已闭环</span>
      <span class="legend-item">汇总类：待上报 → 已上报 → 已闭环（无随访段）</span>
      <span class="legend-item">跨级、回退、重复上报一律拦下</span>
    </p>

    <!-- 超时限未报：单独展示 -->
    <section class="overdue-box">
      <h3 class="box-title">⚠ 超时限未报（已过法定截止日，监管尚未收到）</h3>
      <table v-if="overdueList.length" class="data-table overdue-table">
        <thead>
          <tr>
            <th>报告编号</th><th>报告类型</th><th>怀疑药品</th><th>发生/获知日</th>
            <th>原始截止</th><th>顺延后截止</th><th>逾期天数</th><th>报告人/来源</th><th>上报状态</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in overdueList" :key="r.id" class="row-danger">
            <td><button class="link" type="button" @click="openDetail(r)">{{ r.reportNo }}</button></td>
            <td>{{ kindLabel(r.kind) }}</td>
            <td>{{ r.suspectDrug }}</td>
            <td>{{ r.eventDate }}</td>
            <td>{{ r.rawDeadline }}</td>
            <td><strong>{{ r.deadline }}</strong></td>
            <td>已逾期 {{ overdueDays(r) }} 天</td>
            <td>{{ r.reporter }} / {{ r.source }}</td>
            <td><span class="pill" :class="pillClass(r.status)">{{ r.status }}</span></td>
            <td><button class="btn primary btn-sm" type="button" @click="openDetail(r, 'submit')">立即上报（需逾期说明）</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-state" style="padding:12px">当前没有超时限未报的报告。</p>
    </section>

    <!-- 按报告类型分栏 -->
    <section class="kanban">
      <div v-for="kind in KIND_ORDER" :key="kind" class="kanban-col">
        <header class="col-head">
          <div>
            <strong>{{ kindLabel(kind) }}</strong>
            <span class="col-rule">{{ ruleOf(kind).deadlineDays === 1 ? '24小时内/当日' : ruleOf(kind).deadlineDays + '日内' }}上报</span>
          </div>
          <span class="col-count">{{ byKind[kind]?.length ?? 0 }}</span>
        </header>
        <p class="col-follow" v-if="ruleOf(kind).followUpNodes.length">
          随访节点：{{ ruleOf(kind).followUpNodes.join(' → ') }}
        </p>
        <p class="col-follow muted" v-else>按业务规则不做个案随访</p>

        <article
          v-for="r in byKind[kind]"
          :key="r.id"
          class="report-card"
          :class="{ danger: isOverdue(r), due: isDueSoon(r) && !isOverdue(r), done: r.status === '已闭环' }"
        >
          <div class="card-top">
            <button class="link card-no" type="button" @click="openDetail(r)">{{ r.reportNo }}</button>
            <span class="pill" :class="pillClass(r.status)">{{ r.status }}</span>
          </div>
          <div class="card-drug" :title="r.suspectDrug">怀疑药品：{{ r.suspectDrug }}</div>
          <div class="card-line">批号：{{ r.batchNo || '—' }}</div>
          <div class="card-line">发生：{{ r.eventDate }} · {{ r.source }} · {{ r.reporter }}</div>
          <div class="card-line deadline-line">
            上报时限：<strong :class="{ 'text-danger': isOverdue(r) }">{{ r.deadline }}</strong>
            <span v-if="r.rawDeadline !== r.deadline" class="shift-tag" :title="shiftTip(r)">顺延留痕</span>
            <span v-if="isOverdue(r)" class="text-danger">（逾期{{ overdueDays(r) }}天）</span>
          </div>
          <div class="card-line">
            随访：
            <template v-if="ruleOf(kind).followUpNodes.length">
              <span v-for="p in progressOf(r)" :key="p.label" class="fu-dot" :class="{ on: p.done }" :title="p.label"></span>
              <span class="fu-text">{{ doneCount(r) }}/{{ ruleOf(kind).followUpNodes.length }} 节点</span>
            </template>
            <span v-else class="muted">免随访</span>
          </div>
          <div v-if="r.complaintNo" class="card-line">↩ 已回写投诉 {{ r.complaintNo }}</div>
          <div class="card-actions">
            <button class="link" type="button" @click="openDetail(r)">查看/办理</button>
          </div>
        </article>
        <p v-if="!(byKind[kind]?.length)" class="empty-state col-empty">暂无该类型报告</p>
      </div>
    </section>

    <footer class="page-foot">
      <span>时限规则、随访节点全部取自同一张业务规则表；今天 {{ todayStr }}</span>
      <RouterLink to="/complaint" class="link">前往质量投诉待办 →</RouterLink>
    </footer>

    <!-- 登记弹窗 -->
    <div v-if="creating" class="modal-mask" @click.self="creating = false">
      <div class="modal">
        <h3>登记不良反应报告</h3>
        <p class="modal-tip">报告类型决定上报时限与随访节点（业务定版）；截止日按规则即时算出，撞节假日自动顺延并留痕。</p>
        <div class="form-grid">
          <label class="form-item">
            <span>报告类型 *</span>
            <select v-model="form.kind">
              <option v-for="k in KIND_ORDER" :key="k" :value="k">{{ kindLabel(k) }}（{{ ruleOf(k).deadlineDays === 1 ? '24小时/当日' : ruleOf(k).deadlineDays + '日内' }}）</option>
            </select>
          </label>
          <label class="form-item">
            <span>发生/获知日期 *</span>
            <input type="date" v-model="form.eventDate" :max="todayStr" />
          </label>
          <label class="form-item span2">
            <span>怀疑药品 *（归口维度）</span>
            <input v-model="form.suspectDrug" placeholder="通用名/商品名，如：注射用头孢哌酮钠舒巴坦钠" />
          </label>
          <label class="form-item">
            <span>用药批号</span>
            <input v-model="form.batchNo" />
          </label>
          <label class="form-item">
            <span>报告来源</span>
            <select v-model="form.source">
              <option v-for="s in SOURCE_OPTIONS" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
          <label class="form-item span2">
            <span>不良反应表现 *</span>
            <input v-model="form.reaction" placeholder="症状、出现时间、处置与转归概要" />
          </label>
          <label class="form-item">
            <span>报告人 *（随访登记人）</span>
            <input v-model="form.reporter" />
          </label>
          <label class="form-item">
            <span>联系方式</span>
            <input v-model="form.reporterContact" />
          </label>
          <label class="form-item span2">
            <span>关联质量投诉编号（可空，填了即回写该投诉待办）</span>
            <input v-model="form.complaintNo" placeholder="COMP-xxxx" list="complaint-list" />
            <datalist id="complaint-list">
              <option v-for="c in complaintNos" :key="c" :value="c"></option>
            </datalist>
          </label>
        </div>
        <p class="rule-preview">{{ ruleOf(form.kind).desc }}</p>
        <p v-if="form.kind && form.eventDate" class="rule-preview">
          时限试算：{{ form.eventDate }} 起 {{ ruleOf(form.kind).deadlineDays }} 日
          <template v-if="previewDeadline">
            → 原始截止 {{ previewDeadline.rawDeadline }}
            <template v-if="previewDeadline.deadline !== previewDeadline.rawDeadline">
              ，撞{{ previewDeadline.hits.map(h => h.name).join('、') }}顺延至 <strong>{{ previewDeadline.deadline }}</strong>
            </template>
          </template>
        </p>
        <p v-if="formError" class="error-text">{{ formError }}</p>
        <div class="modal-foot">
          <button class="btn" type="button" @click="creating = false">取消</button>
          <button class="btn primary" type="button" @click="submitCreate">登记并算出时限</button>
        </div>
      </div>
    </div>

    <!-- 详情抽屉 -->
    <div v-if="current" class="drawer-mask" @click.self="current = null">
      <div class="drawer">
        <div class="drawer-head">
          <div>
            <h3>{{ current.reportNo }} · {{ kindLabel(current.kind) }}</h3>
            <span class="pill" :class="pillClass(current.status)">{{ current.status }}</span>
            <span v-if="isOverdue(current)" class="pill danger">超时限未报</span>
            <span v-else-if="isDueSoon(current)" class="pill warn">临近时限</span>
            <span v-if="current.submitted" class="pill ok">已上报</span>
          </div>
          <button class="btn" type="button" @click="current = null">关闭</button>
        </div>

        <div class="drawer-body">
          <section class="d-block">
            <h4>报告信息（按怀疑药品归口）</h4>
            <table class="kv-table">
              <tbody>
                <tr><th>怀疑药品</th><td>{{ current.suspectDrug }}</td><th>用药批号</th><td>{{ current.batchNo || '—' }}</td></tr>
                <tr><th>不良反应表现</th><td colspan="3">{{ current.reaction }}</td></tr>
                <tr><th>发生/获知日</th><td>{{ current.eventDate }}</td><th>报告来源</th><td>{{ current.source }}</td></tr>
                <tr><th>报告人</th><td>{{ current.reporter }}</td><th>联系方式</th><td>{{ current.reporterContact || '—' }}</td></tr>
                <tr><th>当前转归</th><td>{{ current.outcome }}</td><th>关联投诉</th><td>{{ current.complaintNo || '—' }}</td></tr>
              </tbody>
            </table>
          </section>

          <section class="d-block">
            <h4>上报时限（多处取数同一套）</h4>
            <table class="kv-table">
              <tbody>
                <tr>
                  <th>规则时限</th><td>{{ current.deadlineDays === 1 ? '24小时内/当日（按1日管控）' : current.deadlineDays + ' 日内' }}</td>
                  <th>原始截止日</th><td>{{ current.rawDeadline }}</td>
                </tr>
                <tr>
                  <th>顺延后截止</th><td><strong :class="{ 'text-danger': isOverdue(current) }">{{ current.deadline }}</strong></td>
                  <th>今天</th><td>{{ todayStr }}（{{ isOverdue(current) ? `已逾期 ${overdueDays(current)} 天` : diffToDeadline(current) + ' 天' }}）</td>
                </tr>
              </tbody>
            </table>
            <ul v-if="shiftsOf(current.id).length" class="trace-list">
              <li v-for="h in shiftsOf(current.id)" :key="h.id">
                「{{ h.fromDate }}」为{{ h.hitHoliday }}，截止日顺延至 {{ h.toDate }} —— {{ h.operator }} · {{ h.created }}
              </li>
            </ul>
            <p v-else class="muted small">无节假日顺延。</p>
          </section>

          <!-- 办理动作：按当前状态只给下一步，跨级没有按钮 -->
          <section class="d-block">
            <h4>办理（状态单向流转，只允许下一步）</h4>
            <div class="action-row">
              <button v-if="current.status === '待上报' && !current.submitted" class="btn primary" type="button" @click="tab = 'submit'">去监管上报</button>
              <button
                v-if="(current.status === '已上报' || current.status === '随访中') && ruleOf(current.kind).followUpNodes.length"
                class="btn"
                type="button"
                @click="tab = 'follow'"
              >登记随访节点</button>
              <button v-if="canClose" class="btn primary" type="button" @click="doClose">闭环结案</button>
              <span v-if="current.status === '已闭环'" class="muted">已到终态，不能再流转。</span>
              <span v-if="current.status === '待上报' && current.submitted" class="muted">重复上报只算一次，不可再次上报。</span>
            </div>
          </section>

          <section class="d-block" v-show="tab === 'submit'">
            <h4>监管上报登记</h4>
            <div class="form-grid">
              <label class="form-item"><span>上报日期 *</span><input type="date" v-model="submitForm.submitDate" :max="todayStr" /></label>
              <label class="form-item"><span>上报渠道</span>
                <select v-model="submitForm.channel"><option v-for="c in CHANNEL_OPTIONS" :key="c" :value="c">{{ c }}</option></select>
              </label>
              <label class="form-item span2"><span>接收单位</span><input v-model="submitForm.receiver" placeholder="如：国家药品不良反应监测中心" /></label>
              <label class="form-item span2" v-if="submitLate">
                <span class="text-danger">逾期说明 *（上报日期已越界，不填打回重填）</span>
                <textarea v-model="submitForm.overdueNote" rows="2" placeholder="说明超时限原因、责任与纠正措施"></textarea>
              </label>
            </div>
            <p v-if="submitForm.submitDate && !submitLate" class="small ok-text">上报日期在时限内。</p>
            <p v-if="submitLate" class="error-text small">上报日期 {{ submitForm.submitDate }} 晚于截止 {{ current.deadline }}，属越界上报，须补说明。</p>
            <button class="btn primary" type="button" @click="doSubmit">提交监管上报</button>
          </section>

          <section class="d-block" v-show="tab === 'follow'">
            <h4>随访记录（报告人登记，节点由报告类型说了算）</h4>
            <table v-if="followList.length" class="data-table">
              <thead><tr><th>节点</th><th>随访日期</th><th>记录人</th><th>内容</th><th>转归</th></tr></thead>
              <tbody>
                <tr v-for="f in followList" :key="f.id"><td>{{ f.nodeLabel }}</td><td>{{ f.followDate }}</td><td>{{ f.recorder }}</td><td>{{ f.content }}</td><td>{{ f.outcome }}</td></tr>
              </tbody>
            </table>
            <p v-else class="muted small">尚无随访记录。</p>
            <div class="form-grid" v-if="nextNode">
              <label class="form-item"><span>下一节点</span><input :value="nextNode.label" disabled /></label>
              <label class="form-item"><span>随访日期 *</span><input type="date" v-model="followForm.followDate" :max="todayStr" :min="current.eventDate" /></label>
              <label class="form-item"><span>本次转归</span>
                <select v-model="followForm.outcome"><option v-for="o in OUTCOME_OPTIONS" :key="o" :value="o">{{ o }}</option></select>
              </label>
              <label class="form-item span2"><span>随访内容 *</span><textarea rows="2" v-model="followForm.content"></textarea></label>
            </div>
            <p v-else-if="ruleOf(current.kind).followUpNodes.length" class="small ok-text">该类型随访节点已全部完成，可闭环结案。</p>
            <p v-else class="muted small">汇总报告无需个案随访。</p>
            <button v-if="nextNode" class="btn primary" type="button" @click="doFollow">保存随访节点</button>
          </section>

          <section class="d-block">
            <h4>上报记录（重复上报只算一次）</h4>
            <ul class="trace-list">
              <li v-for="s in submissionList" :key="s.id" :class="{ 'trace-fail': !s.ok }">
                <span :class="s.ok ? 'ok-text' : 'error-text'">{{ s.ok ? '✓ 接收' : '✗ 未计数' }}</span>
                {{ s.submitDate }} · {{ s.channel }} → {{ s.receiver || '监管部门' }}：{{ s.message }} —— {{ s.operator }}
              </li>
            </ul>
            <p v-if="!submissionList.length" class="muted small">尚无上报记录。</p>
          </section>

          <section class="d-block" v-if="current.complaintNo">
            <h4>回写质量投诉待办（{{ current.complaintNo }}）</h4>
            <ul class="trace-list">
              <li v-for="t in todoList" :key="t.id">
                <span :class="t.done ? 'ok-text' : 'warn-text'">{{ t.done ? '[已完成]' : '[待办]' }}</span>
                {{ t.action }}：{{ t.detail }} —— {{ t.operator }} · {{ t.created }}
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>

    <!-- 节假日/规则维护 -->
    <div v-if="showHoliday" class="modal-mask" @click.self="showHoliday = false">
      <div class="modal modal-wide">
        <h3>节假日与时限规则</h3>
        <p class="modal-tip">上报时限全部取自下方同一张规则表；法定节假日休息、调休日上班。调整后对在册未报报告按同一套规则重算并追加顺延留痕。</p>
        <table class="data-table">
          <thead><tr><th>报告类型</th><th>上报时限</th><th>随访节点（业务定版）</th></tr></thead>
          <tbody>
            <tr v-for="k in KIND_ORDER" :key="k">
              <td>{{ kindLabel(k) }}</td>
              <td>{{ ruleOf(k).deadlineDays === 1 ? '立即（不迟于24小时/当日）' : ruleOf(k).deadlineDays + ' 日内' }}</td>
              <td>{{ ruleOf(k).followUpNodes.length ? ruleOf(k).followUpNodes.join(' → ') : '无（汇总报告）' }}</td>
            </tr>
          </tbody>
        </table>
        <h4 style="margin-top:14px">节假日 / 调休维护</h4>
        <div class="filter-bar">
          <label class="filter-item"><span>日期</span><input type="date" v-model="holidayForm.date" /></label>
          <label class="filter-item"><span>名称</span><input v-model="holidayForm.name" placeholder="如：国庆节 / 调休上班" /></label>
          <label class="filter-item"><span>类型</span>
            <select v-model="holidayForm.off"><option :value="true">休息日（顺延）</option><option :value="false">调休上班（不顺延）</option></select>
          </label>
          <button class="btn primary" type="button" @click="saveHoliday">保存并重算在册报告</button>
        </div>
        <table class="data-table" style="max-height:220px;overflow:auto;display:block">
          <thead><tr><th>日期</th><th>名称</th><th>休息/上班</th></tr></thead>
          <tbody>
            <tr v-for="h in nearHolidays" :key="h.date"><td>{{ h.date }}</td><td>{{ h.name }}</td><td>{{ h.off ? '休息' : '上班' }}</td></tr>
          </tbody>
        </table>
        <p v-if="formError" class="error-text">{{ formError }}</p>
        <div class="modal-foot"><button class="btn" type="button" @click="showHoliday = false">关闭</button></div>
      </div>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { listRows } from '@/data/local-store'
import {
  allTodos,
  closeReport,
  createReport,
  followProgress,
  followUpsOf,
  isDueSoon,
  isFollowUpComplete,
  isOverdue,
  listHolidays,
  listReports,
  registerFollowUp,
  resetLedger,
  shiftsOf,
  submissionsOf,
  syncComplaintTodoBadge,
  todosOf,
  submitToAuthority,
  upsertHoliday,
} from '@/api/adr-service'
import { calcDeadline, diffDays, today } from '@/data/adr-calendar'
import { CHANNEL_OPTIONS, KIND_ORDER, KIND_RULES, OUTCOME_OPTIONS, SOURCE_OPTIONS, kindLabel } from '@/data/adr-rules'
import type { AdrReport, AdrReportKind, AdrStatus } from '@/data/adr-types'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const operator = computed(() => session.operator)

const reports = ref<AdrReport[]>([])
const allTodoRows = ref(allTodos())
const todayStr = today()

const creating = ref(false)
const showHoliday = ref(false)
const current = ref<AdrReport | null>(null)
const tab = ref<'submit' | 'follow'>('submit')
const formError = ref('')
const toast = ref('')

const form = reactive({
  kind: 'serious' as AdrReportKind,
  eventDate: todayStr,
  suspectDrug: '',
  batchNo: '',
  source: '电话',
  reaction: '',
  reporter: '',
  reporterContact: '',
  complaintNo: '',
})

const submitForm = reactive({ submitDate: todayStr, channel: '国家ADR监测系统', receiver: '国家药品不良反应监测中心', overdueNote: '' })
const followForm = reactive({ followDate: todayStr, outcome: '好转', content: '' })
const holidayForm = reactive({ date: '', name: '', off: true })

const ruleOf = (kind: AdrReportKind) => KIND_RULES[kind]
const byKind = computed<Record<string, AdrReport[]>>(() => {
  const map: Record<string, AdrReport[]> = {}
  for (const k of KIND_ORDER) map[k] = []
  for (const r of reports.value) (map[r.kind] ??= []).push(r)
  return map
})

const pendingSubmit = computed(() => reports.value.filter((r) => !r.submitted))
const overdueList = computed(() => reports.value.filter((r) => isOverdue(r)).sort((a, b) => (a.deadline < b.deadline ? -1 : 1)))
const following = computed(() => reports.value.filter((r) => r.status === '随访中'))
const submittedCount = computed(() => reports.value.filter((r) => r.submitted).length)
const closedCount = computed(() => reports.value.filter((r) => r.status === '已闭环').length)
const openTodoCount = computed(() => allTodoRows.value.filter((t) => !t.done).length)

const complaintNos = computed(() =>
  listRows('complaint').map((r) => String(r['投诉编号'] ?? '')).filter(Boolean),
)
const nearHolidays = computed(() => listHolidays().filter((h) => h.date >= '2026-09-01'))

const followList = computed(() => (current.value ? followUpsOf(current.value.id) : []))
const submissionList = computed(() => (current.value ? submissionsOf(current.value.id) : []))
const todoList = computed(() => (current.value ? todosOf(current.value.id) : []))
const progressOf = (r: AdrReport) => followProgress(r)
const doneCount = (r: AdrReport) => followProgress(r).filter((p) => p.done).length
const overdueDays = (r: AdrReport) => diffDays(r.deadline, todayStr)
const diffToDeadline = (r: AdrReport) => diffDays(todayStr, r.deadline)
const shiftTip = (r: AdrReport) => shiftsOf(r.id).map((h) => `${h.fromDate} ${h.hitHoliday} → ${h.toDate}`).join('；')

const previewDeadline = computed(() => {
  if (!form.eventDate) return null
  return calcDeadline(form.eventDate, KIND_RULES[form.kind].deadlineDays, listHolidays())
})

const submitLate = computed(() =>
  current.value !== null && submitForm.submitDate !== '' && submitForm.submitDate > current.value.deadline,
)
const nextNode = computed(() => {
  if (!current.value) return null
  const p = followProgress(current.value).find((x) => !x.done)
  return p ?? null
})
const canClose = computed(() => {
  if (!current.value || !current.value.submitted || current.value.status === '已闭环') return false
  if (KIND_RULES[current.value.kind].followUpNodes.length === 0) return true
  return isFollowUpComplete(current.value)
})

function pillClass(status: AdrStatus): string {
  if (status === '已闭环') return 'ok'
  if (status === '随访中') return 'warn'
  if (status === '已上报') return 'info'
  return ''
}

function reload() {
  reports.value = listReports()
  allTodoRows.value = allTodos()
  if (current.value) {
    const fresh = reports.value.find((r) => r.id === current.value!.id)
    current.value = fresh ?? null
  }
}

function flash(message: string) {
  toast.value = message
  window.setTimeout(() => { if (toast.value === message) toast.value = '' }, 3500)
}

function openCreate() {
  formError.value = ''
  Object.assign(form, {
    kind: 'serious', eventDate: todayStr, suspectDrug: '', batchNo: '', source: '电话',
    reaction: '', reporter: operator.value, reporterContact: '', complaintNo: '',
  })
  creating.value = true
}

function submitCreate() {
  formError.value = ''
  const result = createReport({ ...form }, operator.value)
  if (!result.ok) { formError.value = result.message; return }
  creating.value = false
  reload()
  flash(result.message)
}

function openDetail(r: AdrReport, focus: 'submit' | 'follow' = 'submit') {
  current.value = r
  tab.value = focus
  formError.value = ''
  Object.assign(submitForm, {
    submitDate: todayStr,
    channel: '国家ADR监测系统', receiver: '国家药品不良反应监测中心', overdueNote: r.overdueNote,
  })
  Object.assign(followForm, { followDate: todayStr, outcome: r.outcome === '不详' ? '好转' : r.outcome, content: '' })
}

function doSubmit() {
  if (!current.value) return
  const result = submitToAuthority(
    current.value.id, submitForm.submitDate, submitForm.channel, submitForm.receiver, submitForm.overdueNote, operator.value,
  )
  if (!result.ok) { formError.value = result.message; flash(result.message); return }
  submitForm.overdueNote = ''
  formError.value = ''
  reload()
  flash(result.message)
}

function doFollow() {
  if (!current.value || !nextNode.value) return
  const result = registerFollowUp(
    current.value.id, nextNode.value.label, followForm.followDate, followForm.content, followForm.outcome, operator.value,
  )
  if (!result.ok) { formError.value = result.message; flash(result.message); return }
  followForm.content = ''
  formError.value = ''
  reload()
  flash(result.message)
}

function doClose() {
  if (!current.value) return
  const result = closeReport(current.value.id, operator.value)
  if (!result.ok) { formError.value = result.message; flash(result.message); return }
  reload()
  flash(result.message)
}

function saveHoliday() {
  if (!holidayForm.date || !holidayForm.name) { formError.value = '请填写节假日日期与名称'; return }
  const result = upsertHoliday({ date: holidayForm.date, name: holidayForm.name, off: holidayForm.off }, operator.value)
  formError.value = ''
  reload()
  flash(result.message)
}

function doReset() {
  const result = resetLedger()
  reload()
  flash(result.message)
}

function exportRows() {
  // 用通用导出不方便（本卷结构独立），直接拼台账 CSV
  const header = ['报告编号', '报告类型', '怀疑药品', '批号', '不良反应表现', '发生日期', '时限(日)', '原始截止', '顺延后截止', '报告人', '来源', '随访完成', '上报状态', '关联投诉']
  const lines = [header.join(',')]
  for (const r of listReports()) {
    const fu = `${doneCount(r)}/${KIND_RULES[r.kind].followUpNodes.length}`
    lines.push([r.reportNo, kindLabel(r.kind), r.suspectDrug, r.batchNo, r.reaction, r.eventDate, r.deadlineDays, r.rawDeadline, r.deadline, r.reporter, r.source, fu, r.status, r.complaintNo].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
  }
  const blob = new Blob([`${String.fromCharCode(0xfeff)}${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '不良反应报告与监管上报台账.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

onMounted(() => {
  syncComplaintTodoBadge()
  reload()
})
</script>

<style scoped>
.adr-page { display: flex; flex-direction: column; gap: 12px; }
.stat-danger .stat-value { color: #b42318; }
.overdue-box { background: #fff4f2; border: 1px solid #f0a99f; border-radius: 8px; padding: 10px 12px; }
.box-title { margin: 0 0 8px; font-size: 14px; color: #b42318; }
.overdue-table { background: #fff; }
.row-danger td { background: #fff8f7; }
.kanban { display: grid; grid-template-columns: repeat(5, minmax(230px, 1fr)); gap: 10px; align-items: start; }
.kanban-col { background: #eef2f7; border: 1px solid var(--border); border-radius: 8px; padding: 8px; min-height: 200px; }
.col-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.col-rule { display: block; font-size: 11px; color: var(--muted); }
.col-count { background: #1f6feb; color: #fff; border-radius: 999px; font-size: 12px; min-width: 22px; text-align: center; padding: 1px 7px; }
.col-follow { font-size: 11px; color: #475569; margin: 2px 0 8px; }
.report-card { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; border-left: 3px solid #cbd5e1; }
.report-card.danger { border-left-color: #d92d20; background: #fff8f7; }
.report-card.due { border-left-color: #f79009; }
.report-card.done { border-left-color: #12b76a; }
.card-top { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
.card-no { font-weight: 600; font-size: 13px; }
.card-drug { font-size: 12px; font-weight: 600; margin: 4px 0 2px; }
.card-line { font-size: 12px; color: #475569; margin-top: 2px; }
.deadline-line strong { font-weight: 600; }
.shift-tag { background: #fef3c7; color: #92400e; border-radius: 4px; padding: 0 5px; font-size: 11px; margin-left: 4px; cursor: help; }
.fu-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #cbd5e1; margin-right: 3px; }
.fu-dot.on { background: #12b76a; }
.fu-text { font-size: 11px; color: var(--muted); margin-left: 4px; }
.card-actions { margin-top: 6px; text-align: right; }
.col-empty { font-size: 12px; padding: 8px; background: transparent; }
.pill { border-radius: 999px; padding: 1px 8px; font-size: 11px; background: #e2e8f0; color: #334155; white-space: nowrap; }
.pill.ok { background: #d1fadf; color: #05603a; }
.pill.warn { background: #fef0c7; color: #93370d; }
.pill.info { background: #dbeafe; color: #1d4ed8; }
.pill.danger { background: #fee4e2; color: #b42318; }
.text-danger { color: #b42318; }
.muted { color: var(--muted); }
.small { font-size: 12px; }
.ok-text { color: #05603a; }
.warn-text { color: #93370d; }
.btn-sm { padding: 3px 8px; font-size: 12px; }

.modal-mask { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center; justify-content: center; z-index: 50; }
.modal { background: #fff; border-radius: 10px; padding: 18px 20px; width: 640px; max-width: 94vw; max-height: 90vh; overflow: auto; }
.modal-wide { width: 820px; }
.modal h3 { margin: 0 0 6px; }
.modal-tip { font-size: 12px; color: var(--muted); margin: 0 0 12px; }
.rule-preview { font-size: 12px; background: #f1f5f9; border-radius: 6px; padding: 6px 10px; margin: 8px 0 0; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.form-item.span2 { grid-column: span 2; }
.form-item span { display: block; font-size: 12px; color: var(--muted); margin-bottom: 3px; }
.form-item input, .form-item select, .form-item textarea { width: 100%; border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; font: inherit; }
.modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }

.drawer-mask { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); z-index: 40; display: flex; justify-content: flex-end; }
.drawer { background: #fff; width: 760px; max-width: 96vw; height: 100%; overflow: auto; box-shadow: -6px 0 18px rgba(0,0,0,0.12); }
.drawer-head { position: sticky; top: 0; background: #fff; display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border); z-index: 2; }
.drawer-head h3 { margin: 0 0 6px; font-size: 16px; }
.drawer-body { padding: 14px 18px; display: flex; flex-direction: column; gap: 14px; }
.d-block { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }
.d-block h4 { margin: 0 0 8px; font-size: 13px; }
.kv-table { width: 100%; border-collapse: collapse; }
.kv-table th { background: #f8fafc; color: var(--muted); font-weight: 500; width: 110px; font-size: 12px; text-align: left; border: 1px solid var(--border); padding: 6px 8px; }
.kv-table td { border: 1px solid var(--border); padding: 6px 8px; font-size: 13px; }
.trace-list { margin: 8px 0 0; padding-left: 18px; font-size: 12px; color: #475569; display: flex; flex-direction: column; gap: 4px; }
.trace-fail { color: #b42318; }
.action-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #101828; color: #fff; padding: 8px 16px; border-radius: 8px; font-size: 13px; z-index: 99; }
</style>
