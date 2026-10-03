import { listRows, saveRows } from '@/data/local-store'
import { calcDeadline, cmpDate, diffDays, today } from '@/data/adr-calendar'
import { KIND_ORDER, KIND_RULES, canSubmit, kindLabel, statusChainFor } from '@/data/adr-rules'
import { adrState, resetAdr, saveAdrState } from '@/data/adr-store'
import type {
  AdrComplaintTodo,
  AdrFollowUp,
  AdrReport,
  AdrReportKind,
  AdrState,
  AdrStatus,
  AdrSubmission,
  HolidayEntry,
} from '@/data/adr-types'

/** 不良反应台账服务：所有业务规则都在这一层拦，页面只负责展示和取参。
 *
 * 定版规则（业务说了算的部分都在 adr-rules.ts）：
 * - 报告按类型分栏；按怀疑药品归口；报告人登记随访节点
 * - 上报时限各处统一从 KIND_RULES 取（同一套），落节假日顺延且留痕
 * - 状态单向流转，只能走到链上下一个状态，跨级/回退拦下
 * - 同一报告重复上报只算一次；同指纹报告不可重复登记
 * - 上报日期越界（超过截止日）先打回重填，要求逾期说明
 * - 每个动作回写质量投诉待办（COMP-xxxx） */

export type Result<T = undefined> = { ok: boolean; message: string; data?: T }

export type CreateInput = {
  kind: AdrReportKind
  suspectDrug: string
  batchNo: string
  reaction: string
  eventDate: string
  reporter: string
  reporterContact?: string
  source: string
  complaintNo?: string
}

const STATUSES_FOR_KIND: Record<AdrReportKind, AdrStatus[]> = Object.fromEntries(
  KIND_ORDER.map((k) => [k, statusChainFor(k)]),
) as Record<AdrReportKind, AdrStatus[]>

function state(): AdrState {
  return adrState()
}

function persist(next: AdrState): void {
  saveAdrState({ ...next })
}

/** 判断报告是否超时限未报：未上报且当前日期已过截止日。 */
export function isOverdue(report: AdrReport, now: string = today()): boolean {
  if (report.submitted || report.status === '已闭环') return false
  return cmpDate(now, report.deadline) > 0
}

/** 临近时限（含最后一天）提醒。 */
export function isDueSoon(report: AdrReport, now: string = today(), within = 3): boolean {
  if (isOverdue(report, now) || report.submitted) return false
  const d = diffDays(now, report.deadline)
  return d >= 0 && d <= within
}

export function followUpsOf(reportId: number): AdrFollowUp[] {
  return state().followUps.filter((f) => f.reportId === reportId)
}

export function submissionsOf(reportId: number): AdrSubmission[] {
  return state().submissions.filter((s) => s.reportId === reportId)
}

export function shiftsOf(reportId: number) {
  return state().shifts.filter((s) => s.reportId === reportId)
}

export function todosOf(reportId: number): AdrComplaintTodo[] {
  return state().todos.filter((t) => t.reportId === reportId)
}

export function allTodos(): AdrComplaintTodo[] {
  return [...state().todos].sort((a, b) => (a.created < b.created ? 1 : -1))
}

/** 某类型随访节点的完成情况：哪些节点已登记、还差哪些。 */
export function followProgress(report: AdrReport): { label: string; done: boolean }[] {
  const nodes = KIND_RULES[report.kind].followUpNodes
  const recorded = new Set(followUpsOf(report.id).map((f) => f.nodeLabel))
  return nodes.map((label) => ({ label, done: recorded.has(label) }))
}

export function isFollowUpComplete(report: AdrReport): boolean {
  return followProgress(report).every((p) => p.done)
}

/** 登记新报告：截止日按同一套时限规则即时算好，撞节假日就顺延并留痕。 */
export function createReport(input: CreateInput, operator: string): Result<AdrReport> {
  if (!input.suspectDrug.trim()) return { ok: false, message: '请填写怀疑药品（报告按怀疑药品归口）' }
  if (!input.reaction.trim()) return { ok: false, message: '请填写不良反应表现' }
  if (!input.eventDate) return { ok: false, message: '请填写不良反应发生/获知日期（上报时限从此起算）' }
  if (!input.reporter.trim()) return { ok: false, message: '请填写报告人（随访节点由报告人登记）' }
  if (cmpDate(input.eventDate, today()) > 0) {
    return { ok: false, message: '发生日期不能晚于今天，发生日期越界，请改后重填' }
  }

  const s = state()
  const dedupeKey = `${input.eventDate}|${input.reporter.trim()}|${input.suspectDrug.trim()}|${input.kind}`
  if (s.reports.some((r) => r.dedupeKey === dedupeKey)) {
    const dup = s.reports.find((r) => r.dedupeKey === dedupeKey)!
    return { ok: false, message: `同一报告已登记过（${dup.reportNo}）：发生日期+报告人+怀疑药品+类型相同，不允许重复登记` }
  }

  const rule = KIND_RULES[input.kind]
  const seq = s.seq.report + 1
  const reportNo = `ADR-${input.eventDate.slice(0, 4)}${String(seq).padStart(4, '0')}`
  const dl = calcDeadline(input.eventDate, rule.deadlineDays, s.holidays)
  const now = today()
  const report: AdrReport = {
    id: seq,
    reportNo,
    kind: input.kind,
    status: STATUSES_FOR_KIND[input.kind][0],
    suspectDrug: input.suspectDrug.trim(),
    batchNo: input.batchNo.trim(),
    reaction: input.reaction.trim(),
    eventDate: input.eventDate,
    deadlineDays: rule.deadlineDays,
    rawDeadline: dl.rawDeadline,
    deadline: dl.deadline,
    reporter: input.reporter.trim(),
    reporterContact: (input.reporterContact ?? '').trim(),
    source: input.source,
    complaintNo: (input.complaintNo ?? '').trim(),
    outcome: '不详',
    overdueNote: '',
    dedupeKey,
    submitted: false,
    created: now,
    updated: now,
  }

  const shifts = [...s.shifts]
  dl.hits.forEach((hit, i) => {
    shifts.push({
      id: s.seq.shift + i + 1,
      reportId: report.id,
      reportNo,
      fromDate: hit.date,
      toDate: dl.deadline,
      hitHoliday: hit.name,
      operator: `系统（时限规则）/${operator}确认`,
      created: now,
    })
  })
  const nextShiftSeq = s.seq.shift + dl.hits.length

  const todos = [...s.todos]
  if (report.complaintNo) {
    todos.push(makeTodo(s.seq.todo + 1, report, '登记报告',
      `${reportNo} 不良反应报告已登记（怀疑药品：${report.suspectDrug}），请在质量投诉 ${report.complaintNo} 中挂接并跟进调查`,
      operator, now, false))
  }

  persist({
    ...s,
    reports: [...s.reports, report],
    shifts,
    todos,
    seq: { ...s.seq, report: seq, shift: nextShiftSeq, todo: report.complaintNo ? s.seq.todo + 1 : s.seq.todo },
  })
  syncComplaintTodoBadge()
  const shiftedMsg = dl.hits.length
    ? `；原始截止 ${dl.rawDeadline} 撞${dl.hits.map((h) => h.name).join('、')}，顺延至 ${dl.deadline}（已留痕）`
    : ''
  return { ok: true, message: `${reportNo} 已登记，类型「${kindLabel(input.kind)}」，${rule.deadlineDays} 日内上报，截止 ${dl.deadline}${shiftedMsg}`, data: report }
}

function makeTodo(id: number, report: AdrReport, action: string, detail: string, operator: string, created: string, done: boolean): AdrComplaintTodo {
  return { id, reportId: report.id, reportNo: report.reportNo, kind: report.kind, complaintNo: report.complaintNo, action, detail, operator, created, done }
}

function appendTodo(s: AdrState, report: AdrReport, action: string, detail: string, operator: string, done: boolean): { state: AdrState; todo: AdrComplaintTodo } {
  const id = s.seq.todo + 1
  const todo = makeTodo(id, report, action, detail, operator, today(), done)
  return { state: { ...s, todos: [...s.todos, todo], seq: { ...s.seq, todo: id } }, todo }
}

/** 报告人登记随访节点。
 * - 必须在已上报之后登记（先受理/上报，再随访；未受理拦下）
 * - 节点名称必须是该类型规则表里规定的节点，且按顺序、不能重复
 * - 全部节点登记齐：随访中 -> 待随访结案（已上报后的随访段走完，允许闭环） */
export function registerFollowUp(
  reportId: number,
  nodeLabel: string,
  followDate: string,
  content: string,
  outcome: string,
  operator: string,
): Result {
  const s = state()
  const report = s.reports.find((r) => r.id === reportId)
  if (!report) return { ok: false, message: '没有找到这条报告' }
  const rule = KIND_RULES[report.kind]
  if (rule.followUpNodes.length === 0) {
    return { ok: false, message: `${kindLabel(report.kind)}按业务规则不需要个案随访` }
  }
  if (report.status === '待上报') {
    return { ok: false, message: `${report.reportNo} 还未上报监管，随访节点须在上报后登记` }
  }
  const idx = rule.followUpNodes.indexOf(nodeLabel)
  if (idx < 0) return { ok: false, message: `「${nodeLabel}」不是${kindLabel(report.kind)}规定的随访节点（随访要求由报告类型说了算）` }
  const existing = followUpsOf(reportId)
  if (existing.some((f) => f.nodeLabel === nodeLabel)) {
    return { ok: false, message: `随访节点「${nodeLabel}」已登记过，不能重复登记` }
  }
  // 顺序：前面的节点必须先完成，跳节点登记算跨级，拦下
  for (let i = 0; i < idx; i += 1) {
    if (!existing.some((f) => f.nodeLabel === rule.followUpNodes[i])) {
      return { ok: false, message: `随访必须按节点顺序登记，请先完成「${rule.followUpNodes[i]}」` }
    }
  }
  if (!followDate) return { ok: false, message: '请选择随访日期' }
  if (!content.trim()) return { ok: false, message: '请填写随访记录内容' }
  if (cmpDate(followDate, report.eventDate) < 0) {
    return { ok: false, message: '随访日期不能早于不良反应发生日期，请改后重填' }
  }
  if (cmpDate(followDate, today()) > 0) {
    return { ok: false, message: '随访日期不能晚于今天，请改后重填' }
  }

  const id = s.seq.follow + 1
  const follow: AdrFollowUp = {
    id, reportId, nodeLabel, followDate, recorder: operator, content: content.trim(), outcome, created: today(),
  }

  let status = report.status
  if (status === '已上报') status = '随访中'
  const updated: AdrReport = { ...report, status, outcome, updated: today() }
  let next: AdrState = {
    ...s,
    followUps: [...s.followUps, follow],
    reports: s.reports.map((r) => (r.id === reportId ? updated : r)),
    seq: { ...s.seq, follow: id },
  }
  if (report.complaintNo) {
    next = appendTodo(next, updated, '随访登记',
      `${report.reportNo} 登记随访节点「${nodeLabel}」，转归：${outcome}`, operator, false).state
  }
  persist(next)
  syncComplaintTodoBadge()
  return { ok: true, message: `${report.reportNo} 随访节点「${nodeLabel}」已登记，状态「${report.status}」→「${status}」` }
}

/** 监管上报：
 * - 状态必须是「待上报」，跨级拦下
 * - 已上报过的同一条报告再次上报，只留失败记录、不算第二次（重复上报只算一次）
 * - 上报日期超过截止日：越界打回重填，必须补逾期说明；有说明才接收
 * 成功后：有随访要求的 -> 已上报（等随访），无随访的 -> 待闭环。 */
export function submitToAuthority(
  reportId: number,
  submitDate: string,
  channel: string,
  receiver: string,
  overdueNote: string,
  operator: string,
): Result {
  const s = state()
  const report = s.reports.find((r) => r.id === reportId)
  if (!report) return { ok: false, message: '没有找到这条报告' }

  // 已成功上报：重复上报只算一次，只追加一条失败留痕
  if (report.submitted) {
    const id = s.seq.submit + 1
    const failed: AdrSubmission = {
      id, reportId, reportNo: report.reportNo, kind: report.kind, submitDate, channel, receiver,
      ok: false, message: '该报告已成功上报过，重复上报只算一次，本次不计入', operator, created: today(),
    }
    persist({ ...s, submissions: [...s.submissions, failed], seq: { ...s.seq, submit: id } })
    return { ok: false, message: `${report.reportNo} 已上报成功过，同一条报告重复上报只算一次` }
  }
  if (!canSubmit(report.status)) {
    return { ok: false, message: `${report.reportNo} 当前「${report.status}」，监管上报只能在「待上报」阶段发起，跨级操作已拦下` }
  }
  if (!submitDate) return { ok: false, message: '请填写上报日期' }
  if (cmpDate(submitDate, today()) > 0) return { ok: false, message: '上报日期不能晚于今天，请改后重填' }
  if (cmpDate(submitDate, report.eventDate) < 0) {
    return { ok: false, message: '上报日期不能早于发生日期，请改后重填' }
  }
  const overdue = cmpDate(submitDate, report.deadline) > 0
  if (overdue && !overdueNote.trim()) {
    // 越界打回：先落一条失败记录留痕，再让表单重填
    const id = s.seq.submit + 1
    const rejected: AdrSubmission = {
      id, reportId, reportNo: report.reportNo, kind: report.kind, submitDate, channel, receiver,
      ok: false, message: `上报日期 ${submitDate} 晚于法定截止日 ${report.deadline}，未填逾期说明，打回重填`, operator, created: today(),
    }
    persist({ ...s, submissions: [...s.submissions, rejected], seq: { ...s.seq, submit: id } })
    return { ok: false, message: `上报时限越界：截止 ${report.deadline}，拟报 ${submitDate}。请填写逾期说明后重新上报（本次已打回留痕）` }
  }

  const id = s.seq.submit + 1
  const msg = overdue
    ? `逾期上报：晚于截止日 ${report.deadline} 共 ${diffDays(report.deadline, submitDate)} 天，已登记逾期说明并接收`
    : `${channel}上报成功，截止 ${report.deadline}，在时限内`
  const submission: AdrSubmission = {
    id, reportId, reportNo: report.reportNo, kind: report.kind, submitDate, channel, receiver,
    ok: true, message: msg, operator, created: today(),
  }
  const updated: AdrReport = {
    ...report, status: '已上报', submitted: true, overdueNote: overdue ? overdueNote.trim() : report.overdueNote, updated: today(),
  }
  let next: AdrState = {
    ...s,
    submissions: [...s.submissions, submission],
    reports: s.reports.map((r) => (r.id === reportId ? updated : r)),
    seq: { ...s.seq, submit: id },
  }
  if (report.complaintNo) {
    next = appendTodo(next, updated, '监管上报',
      `${report.reportNo} 已通过${channel}上报「${receiver || '监管部门'}」${overdue ? '（逾期，附说明）' : ''}，请更新投诉 ${report.complaintNo} 进展`,
      operator, false).state
  }
  persist(next)
  syncComplaintTodoBadge()
  return { ok: true, message: `${report.reportNo} ${msg}` }
}

/** 结案闭环：
 * - 有随访要求的，随访节点必须全部完成，否则拦下
 * - 已上报 -> 已闭环；未上报不许闭环 */
export function closeReport(reportId: number, operator: string): Result {
  const s = state()
  const report = s.reports.find((r) => r.id === reportId)
  if (!report) return { ok: false, message: '没有找到这条报告' }
  if (!report.submitted) {
    return { ok: false, message: `${report.reportNo} 还未上报监管，不能闭环（跨级操作已拦下）` }
  }
  if (KIND_RULES[report.kind].followUpNodes.length > 0 && !isFollowUpComplete(report)) {
    const left = followProgress(report).filter((p) => !p.done).map((p) => p.label)
    return { ok: false, message: `${report.reportNo} 随访未完成，还差：${left.join('、')}，随访补齐后才能闭环` }
  }
  if (report.status === '已闭环') {
    return { ok: false, message: `${report.reportNo} 已闭环，状态单向不可重复操作` }
  }
  const updated = { ...report, status: '已闭环' as AdrStatus, updated: today() }
  let next: AdrState = { ...s, reports: s.reports.map((r) => (r.id === reportId ? updated : r)) }
  if (report.complaintNo) {
    next = appendTodo(next, updated, '闭环结案',
      `${report.reportNo} 随访齐、已上报，现闭环结案，请同步关闭质量投诉 ${report.complaintNo}`,
      operator, true).state
  }
  persist(next)
  syncComplaintTodoBadge()
  return { ok: true, message: `${report.reportNo} 已闭环` }
}

/** 节假日维护：新增/调整一条节假日或调休日，
 * 对仍未上报的在册报告按同一套规则重算截止日，发生顺延的追加留痕。 */
export function upsertHoliday(entry: HolidayEntry, operator: string): Result {
  const s = state()
  const holidays = [...s.holidays.filter((h) => h.date !== entry.date), { ...entry }]
  let reports = [...s.reports]
  const shifts = [...s.shifts]
  let shiftSeq = s.seq.shift
  const now = today()
  for (const report of reports) {
    if (report.submitted || report.status === '已闭环') continue
    const dl = calcDeadline(report.eventDate, report.deadlineDays, holidays)
    if (dl.deadline !== report.deadline || dl.rawDeadline !== report.rawDeadline) {
      for (const hit of dl.hits) {
        shiftSeq += 1
        shifts.push({
          id: shiftSeq, reportId: report.id, reportNo: report.reportNo,
          fromDate: hit.date, toDate: dl.deadline, hitHoliday: hit.name,
          operator: `节假日调整/${operator}`, created: now,
        })
      }
      reports = reports.map((r) => r.id === report.id ? { ...r, rawDeadline: dl.rawDeadline, deadline: dl.deadline, updated: now } : r)
    }
  }
  persist({ ...s, holidays, reports, shifts, seq: { ...s.seq, shift: shiftSeq } })
  return { ok: true, message: `节假日表已更新（${entry.date} ${entry.name}，${entry.off ? '休息' : '调休上班'}），在册未报报告截止日已按同一套规则重算` }
}

export function listHolidays(): HolidayEntry[] {
  return [...state().holidays].sort((a, b) => (a.date < b.date ? -1 : 1))
}

export function listReports(): AdrReport[] {
  return [...state().reports].sort((a, b) => (a.eventDate < b.eventDate ? 1 : -1))
}

/** 回写质量投诉待办：把该投诉编号下未完成的台账待办数写到投诉行上，
 * 质量投诉台账页直接能看到「ADR待办 N 条」。 */
export function syncComplaintTodoBadge(): void {
  const s = state()
  const complaints = listRows('complaint')
  if (!complaints.length) return
  const pendingByNo = new Map<string, number>()
  for (const t of s.todos) {
    if (!t.complaintNo || t.done) continue
    pendingByNo.set(t.complaintNo, (pendingByNo.get(t.complaintNo) ?? 0) + 1)
  }
  const next = complaints.map((row) => {
    const no = String(row['投诉编号'] ?? '')
    const pending = pendingByNo.get(no) ?? 0
    return { ...row, ADR待办: pending, abnormal: pending > 0 ? true : row.abnormal, pending: row.pending || pending > 0 }
  })
  saveRows('complaint', next)
}

export function pendingTodoCount(complaintNo: string): number {
  return state().todos.filter((t) => t.complaintNo === complaintNo && !t.done).length
}

export function resetLedger(): Result {
  resetAdr()
  // 重置后把投诉行上的待办角标也按种子重算
  const complaints = listRows('complaint')
  const s = state()
  const pendingByNo = new Map<string, number>()
  for (const t of s.todos) {
    if (!t.complaintNo || t.done) continue
    pendingByNo.set(t.complaintNo, (pendingByNo.get(t.complaintNo) ?? 0) + 1)
  }
  saveRows('complaint', complaints.map((row) => {
    const pending = pendingByNo.get(String(row['投诉编号'] ?? '')) ?? 0
    return { ...row, ADR待办: pending, abnormal: pending > 0 ? true : row.abnormal, pending: row.pending || pending > 0 }
  }))
  return { ok: true, message: '不良反应台账已恢复为示例数据' }
}
