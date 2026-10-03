import assert from 'node:assert'
import { adrState } from '../src/data/adr-store'
import { calcDeadline } from '../src/data/adr-calendar'
import { KIND_RULES, nextStatus } from '../src/data/adr-rules'
import {
  closeReport,
  createReport,
  isFollowUpComplete,
  isOverdue,
  listReports,
  registerFollowUp,
  resetLedger,
  submitToAuthority,
} from '../src/api/adr-service'

const NOW = '2026-10-03'
let pass = 0
const ok = (name: string, cond: boolean) => { assert.ok(cond, name); pass += 1; console.log('PASS', name) }

resetLedger()
const reports = listReports()
const byNo = Object.fromEntries(reports.map((r) => [r.reportNo, r]))

// 1. 时限同源：deadlineDays 全部来自规则表
for (const r of reports) {
  ok(`${r.reportNo} 时限与规则表一致(${r.deadlineDays})`, r.deadlineDays === KIND_RULES[r.kind].deadlineDays)
}

// 2. 超期判定：2026-10-03 时超期的是 0002(严重0928)、0003(一般0825)、0004(新发0915)
const overdueIds = reports.filter((r) => isOverdue(r, NOW)).map((r) => r.id).sort()
ok('超时限未报恰为 id 2,3,4', JSON.stringify(overdueIds) === JSON.stringify([2, 3, 4]))

// 3. 节假日顺延：群体 10-01 起 +1 日 = 10-02，撞国庆 8 天，顺延至 10-09
const r7 = byNo['ADR-20260007']
ok('群体报告顺延到 2026-10-09', r7.deadline === '2026-10-09' && r7.rawDeadline === '2026-10-02')
ok('群体报告 10-03 未超期', !isOverdue(r7, NOW))

// 严重 10-02 +1 = 10-03 撞假期 -> 10-09
const r1 = byNo['ADR-20260001']
ok('紧急报告顺延到 2026-10-09', r1.deadline === '2026-10-09')

// 4. 新的 09-11 +15 = 09-26（周六）-> 09-27（国庆调休上班），不顺到周一
const r5 = byNo['ADR-20260005']
ok('周末顺延: raw=09-26 -> 09-27(调休上班)', r5.rawDeadline === '2026-09-26' && r5.deadline === '2026-09-27')

// 一般 08-20 +30 = 09-19（周六）-> 09-21（周一）
const r9 = byNo['ADR-20260009']
ok('一般报告 raw=09-19 -> 09-21', r9.rawDeadline === '2026-09-19' && r9.deadline === '2026-09-21')

// 5. 状态机单向：nextStatus 只给紧邻
ok('待上报下一步=已上报', nextStatus('serious', '待上报') === '已上报')
ok('已上报下一步=随访中', nextStatus('serious', '已上报') === '随访中')
ok('随访中下一步=已闭环', nextStatus('serious', '随访中') === '已闭环')
ok('终态无下一步', nextStatus('serious', '已闭环') === null)
ok('汇总类跳过随访', JSON.stringify(nextStatus('aggregate', '已上报')) === JSON.stringify('已闭环'))

// 6. 跨级拦下：未上报直接闭环
const crossLevel = closeReport(r1.id, '测试员')
ok('未上报闭环被拦', !crossLevel.ok && /未上报/.test(crossLevel.message))

// 7. 随访未完成不能闭环（0008 已上报、随访0节点）
const r8 = byNo['ADR-20260008']
ok('0008 随访未完成', !isFollowUpComplete(r8))
const close8 = closeReport(r8.id, '测试员')
ok('随访不齐闭环被拦', !close8.ok && /随访未完成/.test(close8.message))

// 8. 随访节点必须按顺序、不能在待上报阶段登记
const fuEarly = registerFollowUp(r1.id, '24小时紧急核实', '2026-10-03', '已核实', '好转', '测试员')
ok('待上报阶段登记随访被拦', !fuEarly.ok && /还未上报/.test(fuEarly.message))

// 9. 越界上报先打回（无说明），补说明后接收。用已过期的 0002（截止 09-29）
const r2id = byNo['ADR-20260002'].id
const rejectLate = submitToAuthority(r2id, '2026-10-02', '国家ADR监测系统', '监测中心', '', '测试员')
ok('越界无说明打回', !rejectLate.ok && /越界|逾期说明/.test(rejectLate.message))
const acceptLate = submitToAuthority(r2id, '2026-10-02', '国家ADR监测系统', '监测中心', '交接延误，已通报', '测试员')
ok('越界补说明后接收', acceptLate.ok)

// 10. 重复上报只算一次：0002 再报
const dupSubmit = submitToAuthority(r2id, '2026-10-02', '电话快报', '省中心', '', '测试员')
ok('重复上报只算一次', !dupSubmit.ok && /只算一次/.test(dupSubmit.message))
const state = adrState()
const succCount1 = state.submissions.filter((s) => s.reportId === r2id && s.ok).length
ok('0002 成功上报计数仍为 1', succCount1 === 1)

// 11. 随访按顺序：0002 三节点，先报第二个应被拦，再按序补齐后可闭环
const skipNode = registerFollowUp(r2id, '7日随访', '2026-10-02', '进展', '好转', '测试员')
ok('随访跳节点被拦', !skipNode.ok && /顺序/.test(skipNode.message))
registerFollowUp(r2id, '24小时紧急核实', '2026-10-02', '已核实', '好转', '测试员')
registerFollowUp(r2id, '7日随访', '2026-10-03', '稳定', '好转', '测试员')
const beforeClose = registerFollowUp(r2id, '转归随访', '2026-10-03', '痊愈', '痊愈', '测试员')
ok('末节点登记成功', beforeClose.ok)
ok('0002 随访齐', isFollowUpComplete(listReports().find((x) => x.id === r2id)!))
const closed = closeReport(r2id, '测试员')
ok('随访齐+已上报可闭环', closed.ok)

// 12. 重复登记去重：同 发生日+报告人+药品+类型
const dupCreate = createReport({
  kind: 'serious', suspectDrug: r1.suspectDrug, batchNo: '', reaction: '再次反映',
  eventDate: r1.eventDate, reporter: r1.reporter, source: '电话',
}, '测试员')
ok('同指纹重复登记被拦', !dupCreate.ok && /重复登记/.test(dupCreate.message))

// 13. 发生日期越界（未来）打回
const future = createReport({
  kind: 'general', suspectDrug: '测试药', batchNo: '', reaction: '皮疹',
  eventDate: '2026-10-10', reporter: '张三', source: '邮件',
}, '测试员')
ok('未来发生日期被拦', !future.ok)

// 14. 汇总类无随访，上报后直接可闭环
const createAgg = createReport({
  kind: 'aggregate', suspectDrug: '某注射液PSUR', batchNo: 'PSUR-2026Q3', reaction: '季度汇总',
  eventDate: '2026-07-05', reporter: '李四', source: '文献',
}, '测试员')
ok('汇总报告可登记', createAgg.ok)
const agg = createAgg.data!
const aggFu = registerFollowUp(agg.id, '任意', '2026-07-10', 'x', '痊愈', '测试员')
ok('汇总类随访被拒', !aggFu.ok)
const aggSubmit = submitToAuthority(agg.id, '2026-09-20', '国家ADR监测系统', '监测中心', '', '测试员')
ok('汇总报告按时上报', aggSubmit.ok)
const aggClose = closeReport(agg.id, '测试员')
ok('汇总类上报后直接闭环', aggClose.ok)

// 15. 回写待办：关联投诉的 0002 在闭环后存在已完成条目
const todos1 = adrState().todos.filter((t) => t.reportId === r2id)
ok('回写待办含闭环已完成项', todos1.some((t) => t.action === '闭环结案' && t.done))
ok('上报、随访各环节均已回写', todos1.filter((t) => t.action === '随访登记').length === 3 && todos1.some((t) => t.action === '监管上报'))

// 16. 时限试算工具
const trial = calcDeadline('2026-05-01', 30, state.holidays)
console.log('试算 05-01 +30:', trial.rawDeadline, '->', trial.deadline)
ok('试算返回结构完整', !!trial.rawDeadline && !!trial.deadline && trial.hits.length >= 0)

console.log(`\n全部 ${pass} 条断言通过`)
