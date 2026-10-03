import {
  ADR_NEXT_ACTION,
  ADR_STATUSES,
  ADR_TYPE_BY_KEY,
  baseDeadline,
  formatDay,
  lawfulDeadlineCap,
  parseDay,
  rollToWorkday,
  todayText,
} from '../data/adr-rules'
import {
  type AdrReport,
  type CreateAdrInput,
  type CreateFollowInput,
  listAdrReports,
  saveAdrReports,
} from '../data/adr-store'
import { listRows, saveRows } from '../data/local-store'
import type { EntryRow } from '../data/types'

export type AdrActionResult = {
  ok: boolean
  message: string
  /** 命中需用户知情确认的分支（如超期上报），确认后带 force 再提交。 */
  confirm?: boolean
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function validDate(text: string): boolean {
  if (!DATE_RE.test(text)) {
    return false
  }
  const day = parseDay(text)
  return formatDay(day) === text
}

/** 当前生效的上报时限：永远取最近一条顺延留痕上的日期，全系统只有这一处口径。 */
export function effectiveDeadline(report: AdrReport): string {
  return report.traces[report.traces.length - 1].effectiveDeadline
}

export function isOverdue(report: AdrReport, today = todayText()): boolean {
  return report.status === '已登记' && effectiveDeadline(report) < today
}

export function overdueDays(report: AdrReport, today = todayText()): number {
  const diff = parseDay(today).getTime() - parseDay(effectiveDeadline(report)).getTime()
  return Math.round(diff / 86_400_000)
}

function nextId(reports: AdrReport[]): number {
  return reports.reduce((max, item) => Math.max(max, item.id), 0) + 1
}

function appendLog(report: AdrReport, operator: string, action: string, detail: string): void {
  report.logs.push({ at: todayText(), operator, action, detail })
}

function persist(reports: AdrReport[]): void {
  saveAdrReports(reports.map((item) => ({ ...item })))
}

// 动作回写到质量投诉的待办：同一报告同一动作只回写一条，重复不再产生新待办。
function writeComplaintTodo(report: AdrReport, tag: string, content: string, abnormal: boolean): void {
  const rows = listRows('complaint')
  const sourceNo = `ADR:${report.reportNo}:${tag}`
  if (rows.some((row) => String(row['来源报告'] ?? '') === report.reportNo && String(row['回写动作'] ?? '') === tag)) {
    return
  }
  const todo: EntryRow = {
    id: rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1,
    status: '待受理',
    pending: true,
    abnormal,
    投诉编号: `ADR-TODO-${report.reportNo}-${rows.length + 1}`,
    投诉来源: '不良反应台账回写',
    涉及产品: report.suspectDrug,
    投诉内容: content,
    调查结论: '',
    处理措施: '',
    回复日期: '',
    投诉状态: '待受理',
    来源报告: report.reportNo,
    回写动作: tag,
    回写键: sourceNo,
  }
  saveRows('complaint', [...rows, todo])
}

function findReport(reports: AdrReport[], id: number): { report: AdrReport; index: number } | null {
  const index = reports.findIndex((item) => item.id === id)
  return index < 0 ? null : { report: reports[index], index }
}

/**
 * 登记报告。
 * 上报时限越界（非法日期、早于获知日、晚于按类型与节假日算出的法定上限）一律打回重填。
 */
export function createReport(input: CreateAdrInput, operator: string): AdrActionResult {
  const reportNo = input.reportNo.trim()
  const suspectDrug = input.suspectDrug.trim()
  const awarenessDate = input.awarenessDate
  const reporter = input.reporter.trim() || operator
  const reaction = input.reaction.trim()
  const source = input.source.trim() || '电话'

  if (!reportNo) {
    return { ok: false, message: '报告编号不能为空，打回重填' }
  }
  if (!suspectDrug) {
    return { ok: false, message: '怀疑药品不能为空，报告按怀疑药品归口', confirm: false }
  }
  if (!ADR_TYPE_BY_KEY.has(input.type)) {
    return { ok: false, message: '报告类型未在业务规则中登记，打回重填' }
  }
  if (!validDate(awarenessDate)) {
    return { ok: false, message: '获知日期不是合法日期，打回重填' }
  }
  if (awarenessDate > todayText()) {
    return { ok: false, message: '获知日期不能晚于今天，打回重填' }
  }
  if (!reaction) {
    return { ok: false, message: '不良反应表现不能为空，打回重填' }
  }
  const base = baseDeadline(input.type, awarenessDate)
  const cap = lawfulDeadlineCap(input.type, awarenessDate)
  if (!validDate(input.declaredDeadline)) {
    return { ok: false, message: '上报时限不是合法日期，打回重填' }
  }
  if (input.declaredDeadline < awarenessDate) {
    return { ok: false, message: `上报时限早于获知日，越界打回重填（法定时限：${base} 起，节假日顺延上限：${cap}）` }
  }
  if (input.declaredDeadline > cap) {
    return {
      ok: false,
      message: `上报时限晚于${ADR_TYPE_BY_KEY.get(input.type)!.limitLabel}的法定顺延上限 ${cap}，越界打回重填`,
    }
  }

  const reports = listAdrReports()
  if (reports.some((item) => item.reportNo === reportNo)) {
    return { ok: false, message: `报告编号 ${reportNo} 已登记，同一条报告只算一次` }
  }
  if (
    reports.some(
      (item) =>
        item.suspectDrug === suspectDrug &&
        item.type === input.type &&
        item.awarenessDate === awarenessDate &&
        item.reaction === reaction,
    )
  ) {
    return { ok: false, message: '同一怀疑药品、同一类型、同一获知日与表现的报告已存在，疑似重复上报，只算一次' }
  }

  const rolled = rollToWorkday(input.declaredDeadline)
  const rule = ADR_TYPE_BY_KEY.get(input.type)!
  const report: AdrReport = {
    id: nextId(reports),
    reportNo,
    suspectDrug,
    type: input.type,
    awarenessDate,
    reporter,
    source,
    reaction,
    status: '已登记',
    reportChannel: '待报送',
    submittedAt: '',
    follows: [],
    traces: [
      {
        baseDeadline: base,
        effectiveDeadline: rolled.to,
        hits: rolled.hits,
        note:
          input.declaredDeadline === cap
            ? `登记填报时限即法定顺延上限（${rule.limitLabel}），节假日顺延自动留痕`
            : `手工填报时限 ${input.declaredDeadline}，已校验未越法定上限 ${cap}`,
        changedAt: todayText(),
      },
    ],
    logs: [],
  }
  appendLog(report, operator, '登记报告', `${rule.label}，归口怀疑药品「${suspectDrug}」，获知日 ${awarenessDate}`)
  reports.push(report)
  persist(reports)
  writeComplaintTodo(
    report,
    '登记',
    `不良反应报告 ${reportNo} 已登记（${rule.label}），时限 ${rolled.to} 前须上报`,
    false,
  )
  return { ok: true, message: `报告 ${reportNo} 已登记，上报时限 ${rolled.to}，节假日顺延已留痕` }
}

/** 状态流转：只允许走到相邻下一档；跨级、回退、重复一律拦下。 */
export function advanceStatus(
  id: number,
  operator: string,
  forceLate = false,
  channel = '',
): AdrActionResult {
  const reports = listAdrReports()
  const found = findReport(reports, id)
  if (!found) {
    return { ok: false, message: '没有找到这条不良反应报告' }
  }
  const { report } = found
  const currentIndex = ADR_STATUSES.indexOf(report.status)
  if (currentIndex < 0 || currentIndex === ADR_STATUSES.length - 1) {
    return { ok: false, message: `报告已是「${report.status}」，没有可继续的状态` }
  }
  const target = ADR_STATUSES[currentIndex + 1]
  const action = ADR_NEXT_ACTION[report.status]!

  if (report.status === '已登记') {
    const late = isOverdue(report)
    if (late && !forceLate) {
      return {
        ok: false,
        confirm: true,
        message: `报告 ${report.reportNo} 已超过上报时限 ${effectiveDeadline(report)}（超期 ${overdueDays(report)} 天），请勾选「超期已知情」后再提交`,
      }
    }
    report.status = '已上报'
    report.submittedAt = todayText()
    if (channel.trim()) {
      report.reportChannel = channel.trim()
    } else if (report.reportChannel === '待报送') {
      report.reportChannel = '国家药监局不良反应监测系统'
    }
    appendLog(
      report,
      operator,
      action,
      `${todayText()} 经「${report.reportChannel}」上报` +
        (late ? `（超期上报，时限 ${effectiveDeadline(report)}）` : ''),
    )
    persist(reports)
    writeComplaintTodo(
      report,
      late ? '超期上报' : '上报',
      late
        ? `不良反应报告 ${report.reportNo} 超期 ${overdueDays(report)} 天才上报，须调查迟报原因`
        : `不良反应报告 ${report.reportNo} 已上报，待按节点完成随访`,
      late,
    )
    return { ok: true, message: `报告 ${report.reportNo} 已上报，下一档：随访` }
  }

  if (report.status === '已上报') {
    const rule = ADR_TYPE_BY_KEY.get(report.type)!
    const missing = rule.followups
      .map((item) => item.node)
      .filter((node) => !report.follows.some((follow) => follow.node === node))
    if (missing.length) {
      return { ok: false, message: `随访节点未补齐，不能跨到「${target}」：缺 ${missing.join('、')}` }
    }
    report.status = '已随访'
    appendLog(report, operator, action, '类型规定的全部随访节点均已登记')
    persist(reports)
    writeComplaintTodo(report, '随访', `不良反应报告 ${report.reportNo} 随访已齐，待关闭复核`, false)
    return { ok: true, message: `报告 ${report.reportNo} 随访完成，下一档：关闭` }
  }

  // 已随访 → 已关闭
  report.status = '已关闭'
  appendLog(report, operator, action, '随访齐备后关闭，状态不再流转')
  persist(reports)
  writeComplaintTodo(report, '关闭', `不良反应报告 ${report.reportNo} 已关闭，待质量复核归档`, false)
  return { ok: true, message: `报告 ${report.reportNo} 已关闭` }
}

/** 登记随访：节点只能选自该报告类型规定的清单，由报告人登记，不能临时造节点。 */
export function registerFollowUp(id: number, input: CreateFollowInput, operator: string): AdrActionResult {
  const reports = listAdrReports()
  const found = findReport(reports, id)
  if (!found) {
    return { ok: false, message: '没有找到这条不良反应报告' }
  }
  const { report } = found
  if (report.status === '已登记') {
    return { ok: false, message: '报告尚未向监管上报，先上报再登记随访' }
  }
  if (report.status === '已关闭') {
    return { ok: false, message: '报告已关闭，随访记录不可再补' }
  }
  const rule = ADR_TYPE_BY_KEY.get(report.type)!
  const allowed = rule.followups.map((item) => item.node)
  if (!allowed.includes(input.node)) {
    return { ok: false, message: `「${input.node}」不在${rule.label}规定的随访节点清单内，随访记录按报告类型定` }
  }
  if (report.follows.some((item) => item.node === input.node)) {
    return { ok: false, message: `随访节点「${input.node}」已登记，同一节点只登记一次` }
  }
  if (!validDate(input.followDate)) {
    return { ok: false, message: '随访日期不是合法日期，打回重填' }
  }
  if (input.followDate < report.awarenessDate) {
    return { ok: false, message: '随访日期早于获知日，打回重填' }
  }
  if (input.followDate > todayText()) {
    return { ok: false, message: '随访日期不能晚于今天，打回重填' }
  }
  if (!input.content.trim()) {
    return { ok: false, message: '随访内容不能为空，打回重填' }
  }
  report.follows.push({
    node: input.node,
    followDate: input.followDate,
    content: input.content.trim(),
    reporter: input.reporter.trim() || operator,
  })
  const order = new Map(rule.followups.map((item, index) => [item.node, index]))
  report.follows.sort((a, b) => (order.get(a.node) ?? 0) - (order.get(b.node) ?? 0))
  appendLog(report, operator, '登记随访', `${input.node}：${input.followDate}`)
  persist(reports)
  return { ok: true, message: `随访「${input.node}」已登记` }
}

/**
 * 手工登记节假日顺延：只能在法定顺延上限之内往后顺延，须写理由留痕；
 * 越过法定上限或试图往回改的一律拦下（时限越界打回）。
 */
export function registerExtension(id: number, newDeadline: string, reason: string, operator: string): AdrActionResult {
  const reports = listAdrReports()
  const found = findReport(reports, id)
  if (!found) {
    return { ok: false, message: '没有找到这条不良反应报告' }
  }
  const { report } = found
  if (report.status !== '已登记') {
    return { ok: false, message: '报告已上报，上报时限不能再顺延' }
  }
  if (!validDate(newDeadline)) {
    return { ok: false, message: '顺延时限不是合法日期，打回重填' }
  }
  const cap = lawfulDeadlineCap(report.type, report.awarenessDate)
  const current = effectiveDeadline(report)
  if (newDeadline <= current) {
    return { ok: false, message: `顺延时限必须晚于当前时限 ${current}，不能回改` }
  }
  if (newDeadline > cap) {
    return { ok: false, message: `顺延越过法定上限 ${cap}，越界打回重填` }
  }
  if (!reason.trim()) {
    return { ok: false, message: '顺延理由不能为空，节假日顺延必须留痕' }
  }
  const rolled = rollToWorkday(newDeadline)
  report.traces.push({
    baseDeadline: report.traces[report.traces.length - 1].baseDeadline,
    effectiveDeadline: rolled.to,
    hits: rolled.hits,
    note: `手工顺延登记：${reason.trim()}`,
    changedAt: todayText(),
  })
  appendLog(report, operator, '节假日顺延', `${current} → ${rolled.to}（${reason.trim()}）`)
  persist(reports)
  return { ok: true, message: `上报时限已顺延至 ${rolled.to}，顺延留痕已保存` }
}

export type AdrExportRow = {
  报告编号: string
  报告类型: string
  怀疑药品: string
  获知日期: string
  上报时限: string
  报告人: string
  上报渠道: string
  上报日期: string
  随访记录: string
  上报状态: string
}

export function buildExportRows(): AdrExportRow[] {
  return listAdrReports().map((report) => {
    const rule = ADR_TYPE_BY_KEY.get(report.type)!
    return {
      报告编号: report.reportNo,
      报告类型: rule.label,
      怀疑药品: report.suspectDrug,
      获知日期: report.awarenessDate,
      上报时限: effectiveDeadline(report),
      报告人: report.reporter,
      上报渠道: report.reportChannel,
      上报日期: report.submittedAt || '未上报',
      随访记录: report.follows.map((item) => `${item.node}@${item.followDate}`).join('；') || '无',
      上报状态: report.status,
    }
  })
}

export function downloadLedger(): void {
  const rows = buildExportRows()
  const header = ['报告编号', '报告类型', '怀疑药品', '获知日期', '上报时限', '报告人', '上报渠道', '上报日期', '随访记录', '上报状态']
  const lines = [header.join(',')]
  for (const row of rows) {
    lines.push(header.map((key) => row[key as keyof AdrExportRow]).join(','))
  }
  const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = '不良反应报告与监管上报台账.csv'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
