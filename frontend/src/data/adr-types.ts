/** 不良反应报告与监管上报台账的领域类型。
 * 这一卷独立于通用 EntryRow：报告类型分栏、上报时限、随访、节假日顺延、
 * 重复上报去重、状态单向流转都在这里建模。 */

/** 报告类型：台账按此分栏排列，时限与随访规则也按此归口。 */
export type AdrReportKind = 'new' | 'serious' | 'general' | 'aggregate' | 'cluster'

/** 上报状态：全类型共用一条单向链，越靠后越是终态。 */
export type AdrStatus = '待报告' | '待随访' | '随访中' | '待上报' | '已上报' | '已闭环'

/** 报告归口：按怀疑药品归口管理。 */
export type AdrReport = {
  id: number
  /** 报告编号，ADR-yyyyNNNN，登记即生成。 */
  reportNo: string
  kind: AdrReportKind
  status: AdrStatus
  /** 怀疑药品（归口维度）。 */
  suspectDrug: string
  /** 用药批号。 */
  batchNo: string
  /** 不良反应名称/表现。 */
  reaction: string
  /** 发生日期：时限从这里起算。 */
  eventDate: string
  /** 原始时限天数（业务规则表给定，多处取数同源）。 */
  deadlineDays: number
  /** 按日历算出的原始截止日。 */
  rawDeadline: string
  /** 节假日顺延后的法定上报截止日。 */
  deadline: string
  reporter: string
  reporterContact: string
  /** 报告来源：电话 / 邮件 / 临床 等，用于说明两头传的归口。 */
  source: string
  /** 关联质量投诉编号（可空）。 */
  complaintNo: string
  /** 报告结果（痊愈/好转/未好转/不详/死亡）。 */
  outcome: string
  /** 越界/逾期上报时必须填写的说明，留痕。 */
  overdueNote: string
  /** 去重用指纹：发生日期 + 报告人 + 怀疑药品 + 类型。 */
  dedupeKey: string
  /** 是否已成功上报过：同一条报告重复上报只算一次。 */
  submitted: boolean
  created: string
  updated: string
}

/** 随访记录：报告人登记随访节点，随访要求由报告类型说了算。 */
export type AdrFollowUp = {
  id: number
  reportId: number
  /** 第几次随访（按报告类型要求的节点序号）。 */
  nodeLabel: string
  followDate: string
  recorder: string
  content: string
  outcome: string
  created: string
}

/** 上报登记：同一条报告每一次尝试都留痕，成功只认一次。 */
export type AdrSubmission = {
  id: number
  reportId: number
  reportNo: string
  kind: AdrReportKind
  submitDate: string
  channel: string
  receiver: string
  ok: boolean
  message: string
  operator: string
  created: string
}

/** 节假日顺延留痕：为什么截止日从哪天挪到哪天。 */
export type AdrHolidayShift = {
  id: number
  reportId: number
  reportNo: string
  fromDate: string
  toDate: string
  /** 撞到的休息日/法定节假日名称。 */
  hitHoliday: string
  operator: string
  created: string
}

/** 回写到质量投诉待办的事项。 */
export type AdrComplaintTodo = {
  id: number
  reportId: number
  reportNo: string
  kind: AdrReportKind
  complaintNo: string
  action: string
  detail: string
  operator: string
  created: string
  done: boolean
}

/** 节假日维护：法定节假日 + 调休上班日。 */
export type HolidayEntry = {
  date: string
  name: string
  /** true 为休息日（截止日撞此日顺延），false 为调休上班日。 */
  off: boolean
}

export type AdrState = {
  reports: AdrReport[]
  followUps: AdrFollowUp[]
  submissions: AdrSubmission[]
  shifts: AdrHolidayShift[]
  todos: AdrComplaintTodo[]
  holidays: HolidayEntry[]
  seq: { report: number; follow: number; submit: number; shift: number; todo: number }
}
