import { calcDeadline } from './adr-calendar'
import { KIND_RULES } from './adr-rules'
import type {
  AdrComplaintTodo,
  AdrFollowUp,
  AdrHolidayShift,
  AdrReport,
  AdrReportKind,
  AdrState,
  AdrStatus,
  AdrSubmission,
  HolidayEntry,
} from './adr-types'

/** 2026 年法定节假日与调休上班日（节假日顺延留痕用这张表）。 */
export const HOLIDAYS_2026: HolidayEntry[] = [
  // 元旦
  { date: '2026-01-01', name: '元旦', off: true },
  { date: '2026-01-02', name: '元旦假期', off: true },
  { date: '2026-01-03', name: '元旦假期', off: true },
  { date: '2026-01-04', name: '调休上班', off: false },
  // 春节（农历正月初一 2026-02-17）
  { date: '2026-02-14', name: '春节调休上班', off: false },
  { date: '2026-02-16', name: '春节假期', off: true },
  { date: '2026-02-17', name: '春节（正月初一）', off: true },
  { date: '2026-02-18', name: '春节假期', off: true },
  { date: '2026-02-19', name: '春节假期', off: true },
  { date: '2026-02-20', name: '春节假期', off: true },
  { date: '2026-02-21', name: '春节假期', off: true },
  { date: '2026-02-22', name: '春节假期', off: true },
  { date: '2026-02-28', name: '春节调休上班', off: false },
  // 清明节（2026-04-05）
  { date: '2026-04-04', name: '清明节假期', off: true },
  { date: '2026-04-05', name: '清明节', off: true },
  { date: '2026-04-06', name: '清明节假期', off: true },
  // 劳动节
  { date: '2026-04-26', name: '劳动节调休上班', off: false },
  { date: '2026-05-01', name: '劳动节', off: true },
  { date: '2026-05-02', name: '劳动节假期', off: true },
  { date: '2026-05-03', name: '劳动节假期', off: true },
  { date: '2026-05-04', name: '劳动节假期', off: true },
  { date: '2026-05-05', name: '劳动节假期', off: true },
  { date: '2026-05-09', name: '劳动节调休上班', off: false },
  // 端午节（2026-06-19）
  { date: '2026-06-19', name: '端午节', off: true },
  { date: '2026-06-20', name: '端午节假期', off: true },
  { date: '2026-06-21', name: '端午节假期', off: true },
  // 中秋节（2026-09-25）
  { date: '2026-09-25', name: '中秋节', off: true },
  { date: '2026-09-27', name: '国庆调休上班', off: false },
  // 国庆节
  { date: '2026-10-01', name: '国庆节', off: true },
  { date: '2026-10-02', name: '国庆假期', off: true },
  { date: '2026-10-03', name: '国庆假期', off: true },
  { date: '2026-10-04', name: '国庆假期', off: true },
  { date: '2026-10-05', name: '国庆假期', off: true },
  { date: '2026-10-06', name: '国庆假期', off: true },
  { date: '2026-10-07', name: '国庆假期', off: true },
  { date: '2026-10-08', name: '国庆假期', off: true },
  { date: '2026-10-10', name: '国庆调休上班', off: false },
]

type SeedInput = {
  kind: AdrReportKind
  suspectDrug: string
  batchNo: string
  reaction: string
  eventDate: string
  reporter: string
  reporterContact?: string
  source: string
  complaintNo?: string
  outcome?: string
  status: AdrStatus
  created?: string
  submitted?: boolean
  overdueNote?: string
}

const SEED_INPUTS: SeedInput[] = [
  {
    kind: 'serious',
    suspectDrug: '注射用头孢哌酮钠舒巴坦钠',
    batchNo: 'CPF-260901',
    reaction: '输注后过敏性休克，经抢救生命体征平稳',
    eventDate: '2026-10-02',
    reporter: '王敏',
    reporterContact: '138****2041',
    source: '电话',
    complaintNo: 'COMP-0001',
    outcome: '好转',
    status: '待上报',
    created: '2026-10-02',
  },
  {
    kind: 'serious',
    suspectDrug: '盐酸左氧氟沙星氯化钠注射液',
    batchNo: 'LVX-260915',
    reaction: '输注部位静脉炎，伴寒战、高热39.2℃',
    eventDate: '2026-09-28',
    reporter: '陈立',
    reporterContact: '139****7712',
    source: '邮件',
    complaintNo: 'COMP-0002',
    outcome: '未好转',
    status: '待上报',
    created: '2026-09-28',
  },
  {
    kind: 'general',
    suspectDrug: '阿莫西林胶囊',
    batchNo: 'AMX-260702',
    reaction: '服药后躯干皮疹、瘙痒',
    eventDate: '2026-08-25',
    reporter: '赵雪',
    reporterContact: '137****3380',
    source: '电话',
    outcome: '好转',
    status: '待上报',
    created: '2026-08-26',
  },
  {
    kind: 'new',
    suspectDrug: '布洛芬缓释胶囊',
    batchNo: 'IBU-260811',
    reaction: '既往无肝病史，用药后ALT/AST急性升高（新的严重表现）',
    eventDate: '2026-09-15',
    reporter: '孙博',
    reporterContact: '135****9021',
    source: '临床来访',
    outcome: '不详',
    status: '待上报',
    created: '2026-09-16',
  },
  {
    kind: 'new',
    suspectDrug: '阿托伐他汀钙片',
    batchNo: 'ATV-260830',
    reaction: '肌痛伴CK升高，横纹肌溶解倾向',
    eventDate: '2026-09-11',
    reporter: '李珺',
    reporterContact: '136****5524',
    source: '邮件',
    complaintNo: 'COMP-0002',
    outcome: '好转',
    status: '随访中',
    created: '2026-09-12',
    submitted: true,
  },
  {
    kind: 'aggregate',
    suspectDrug: '阿托伐他汀钙片（定期安全性更新）',
    batchNo: 'PSUR-2026Q2',
    reaction: '2026年第二季度定期安全性更新报告（个例汇总分析）',
    eventDate: '2026-06-01',
    reporter: '李珺',
    reporterContact: '136****5524',
    source: '文献',
    outcome: '痊愈',
    status: '已闭环',
    created: '2026-06-01',
    submitted: true,
  },
  {
    kind: 'cluster',
    suspectDrug: '0.9%氯化钠注射液',
    batchNo: 'NS-260928',
    reaction: '同一批号连续3例患者输注后寒战、发热，疑似群体不良事件',
    eventDate: '2026-10-01',
    reporter: '周强',
    reporterContact: '138****6645',
    source: '电话',
    outcome: '未好转',
    status: '待上报',
    created: '2026-10-01',
  },
  {
    kind: 'serious',
    suspectDrug: '硫酸氢氯吡格雷片',
    batchNo: 'CLP-260901',
    reaction: '黑便、血红蛋白下降，消化道出血',
    eventDate: '2026-09-20',
    reporter: '陈立',
    reporterContact: '139****7712',
    source: '电话',
    outcome: '不详',
    status: '已上报',
    created: '2026-09-20',
    submitted: true,
  },
  {
    kind: 'general',
    suspectDrug: '氯雷他定片',
    batchNo: 'LOR-260618',
    reaction: '服药后明显嗜睡、乏力',
    eventDate: '2026-08-20',
    reporter: '赵雪',
    reporterContact: '137****3380',
    source: '邮件',
    complaintNo: 'COMP-0003',
    outcome: '痊愈',
    status: '已闭环',
    created: '2026-08-21',
    submitted: true,
    overdueNote: '报告人休假交接延误致超期，已补报并在科室质量例会通报',
  },
]

function build(): AdrState {
  const holidays = HOLIDAYS_2026.map((h) => ({ ...h }))
  const reports: AdrReport[] = []
  const shifts: AdrHolidayShift[] = []
  const followUps: AdrFollowUp[] = []
  const submissions: AdrSubmission[] = []
  const todos: AdrComplaintTodo[] = []
  let shiftSeq = 0
  let followSeq = 0
  let submitSeq = 0
  let todoSeq = 0

  for (let i = 0; i < SEED_INPUTS.length; i += 1) {
    const input = SEED_INPUTS[i]
    const rule = KIND_RULES[input.kind]
    const reportNo = `ADR-2026${String(i + 1).padStart(4, '0')}`
    const dl = calcDeadline(input.eventDate, rule.deadlineDays, holidays)
    const report: AdrReport = {
      id: i + 1,
      reportNo,
      kind: input.kind,
      status: input.status,
      suspectDrug: input.suspectDrug,
      batchNo: input.batchNo,
      reaction: input.reaction,
      eventDate: input.eventDate,
      deadlineDays: rule.deadlineDays,
      rawDeadline: dl.rawDeadline,
      deadline: dl.deadline,
      reporter: input.reporter,
      reporterContact: input.reporterContact ?? '',
      source: input.source,
      complaintNo: input.complaintNo ?? '',
      outcome: input.outcome ?? '不详',
      overdueNote: input.overdueNote ?? '',
      dedupeKey: `${input.eventDate}|${input.reporter}|${input.suspectDrug}|${input.kind}`,
      submitted: input.submitted ?? false,
      created: input.created ?? input.eventDate,
      updated: input.created ?? input.eventDate,
    }
    reports.push(report)

    // 顺延年/节假日的，逐日落点都留痕
    for (const hit of dl.hits) {
      shiftSeq += 1
      shifts.push({
        id: shiftSeq,
        reportId: report.id,
        reportNo,
        fromDate: hit.date,
        toDate: dl.deadline,
        hitHoliday: hit.name,
        operator: '系统（时限规则）',
        created: report.created,
      })
    }

    // 登记即回写质量投诉待办
    if (report.complaintNo) {
      todoSeq += 1
      todos.push({
        id: todoSeq,
        reportId: report.id,
        reportNo,
        kind: report.kind,
        complaintNo: report.complaintNo,
        action: '登记报告',
        detail: `${report.reportNo} 不良反应报告已登记（怀疑药品：${report.suspectDrug}），请在质量投诉 ${report.complaintNo} 中挂接并跟进调查`,
        operator: report.reporter,
        created: report.created,
        done: report.submitted || report.status === '已闭环',
      })
    }
  }

  const pushFollow = (
    reportId: number,
    nodeLabel: string,
    followDate: string,
    recorder: string,
    content: string,
    outcome: string,
  ) => {
    followSeq += 1
    followUps.push({
      id: followSeq,
      reportId,
      nodeLabel,
      followDate,
      recorder,
      content,
      outcome,
      created: followDate,
    })
  }
  const pushSubmit = (
    reportId: number,
    submitDate: string,
    channel: string,
    receiver: string,
    ok: boolean,
    message: string,
    operator: string,
  ) => {
    const r = reports.find((x) => x.id === reportId)!
    submitSeq += 1
    submissions.push({
      id: submitSeq,
      reportId,
      reportNo: r.reportNo,
      kind: r.kind,
      submitDate,
      channel,
      receiver,
      ok,
      message,
      operator,
      created: submitDate,
    })
  }
  const pushTodo = (
    reportId: number,
    action: string,
    detail: string,
    operator: string,
    created: string,
    done: boolean,
  ) => {
    const r = reports.find((x) => x.id === reportId)!
    todoSeq += 1
    todos.push({
      id: todoSeq,
      reportId,
      reportNo: r.reportNo,
      kind: r.kind,
      complaintNo: r.complaintNo,
      action,
      detail,
      operator,
      created,
      done,
    })
  }

  // ADR-20260005：已按时上报（9/11起15日落周六，按调休顺延至9/27），随访进行中
  pushSubmit(5, '2026-09-26', '国家ADR监测系统', '国家药品不良反应监测中心', true, '首次报告上报成功，监测系统回执 ADR-20260005（于顺延后时限前报出）', '李珺')
  pushSubmit(5, '2026-09-27', '国家ADR监测系统', '国家药品不良反应监测中心', false, '同一条报告重复上报，系统只认首次成功记录，本次不计', '值班管理员')
  pushFollow(5, '首次随访', '2026-09-28', '李珺', '肌痛缓解，CK 由 1200 U/L 降至 410 U/L，继续停药观察', '好转')
  pushTodo(5, '监管上报', 'ADR-20260005 已在时限内上报国家ADR监测系统，请更新投诉 COMP-0002 处理进展', '李珺', '2026-09-26', true)

  // ADR-20260006：PSUR 已上报并闭环
  pushSubmit(6, '2026-08-28', '国家ADR监测系统', '国家药品不良反应监测中心', true, '2026年第二季度PSUR上报成功', '李珺')

  // ADR-20260008：严重病例电话快报，已上报待随访
  pushSubmit(8, '2026-09-21', '电话快报', '省ADR监测中心值班电话', true, '24小时内电话快报完成，随后补纸质报告', '陈立')
  pushTodo(8, '监管上报', 'ADR-20260008 已电话快报省监测中心，待补随访到转归', '陈立', '2026-09-21', false)

  // ADR-20260009：超时限上报，填了说明重填后报出，随访闭环
  pushSubmit(9, '2026-09-25', '国家ADR监测系统', '国家药品不良反应监测中心', false, '上报日期超过时限（截止2026-09-21）且未填逾期说明，打回重填', '值班管理员')
  pushSubmit(9, '2026-09-28', '国家ADR监测系统', '国家药品不良反应监测中心', true, '逾期上报：已登记逾期说明并在科室质量例会通报，予以接收', '赵雪')
  pushFollow(9, '转归随访', '2026-10-01', '赵雪', '停药后嗜睡、乏力症状完全消失，患者已痊愈', '痊愈')
  pushTodo(9, '监管上报', 'ADR-20260009 超期补报完成（附逾期说明），请更新投诉 COMP-0003', '赵雪', '2026-09-28', true)
  pushTodo(9, '闭环结案', 'ADR-20260009 随访完成已闭环，请同步关闭投诉 COMP-0003', '赵雪', '2026-10-01', true)

  return {
    reports,
    followUps,
    submissions,
    shifts,
    todos,
    holidays,
    seq: { report: reports.length, follow: followSeq, submit: submitSeq, shift: shiftSeq, todo: todoSeq },
  }
}

export const ADR_SEED: AdrState = build()
