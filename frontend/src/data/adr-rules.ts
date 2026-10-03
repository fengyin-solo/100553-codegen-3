/**
 * 不良反应报告业务规则：报告类型、上报时限、随访节点、节假日顺延日历都只在这一处定义。
 * 台账分栏、超期栏、详情、导出、回写质量投诉待办，取上报时限时一律走这里的算法，
 * 不在任何页面里各算一遍（多处取到的属于同一套）。
 *
 * 报告类型与随访记录谁说了算：先按业务定。
 * 以下时限与随访节点按药物警戒质量管理规范（GVP）结合本企业 SOP 固化，
 * 随访登记时节点只能从对应类型的节点清单里选，不能临时编。
 */

export type AdrTypeKey = 'general' | 'new' | 'serious' | 'death' | 'cluster'

export type AdrStatus = '已登记' | '已上报' | '已随访' | '已关闭'

/** 随访节点规则：获知之日起 offsetDays 天到期。 */
export type FollowRule = {
  node: string
  offsetDays: number
}

export type AdrTypeRule = {
  key: AdrTypeKey
  label: string
  /** 获知之日起多少天内必须向监管报告（1 天即 24 小时内立即报告）。 */
  limitDays: number
  limitLabel: string
  basis: string
  followups: FollowRule[]
}

export const ADR_TYPE_RULES: AdrTypeRule[] = [
  {
    key: 'general',
    label: '一般不良反应',
    limitDays: 30,
    limitLabel: '获知后30日内',
    basis: 'GVP一般个例：30日口径',
    followups: [
      { node: '首次随访（获知后30日）', offsetDays: 30 },
      { node: '转归随访（获知后60日）', offsetDays: 60 },
    ],
  },
  {
    key: 'new',
    label: '新的不良反应',
    limitDays: 15,
    limitLabel: '获知后15日内',
    basis: 'GVP非严重新发现：15日口径',
    followups: [
      { node: '首次随访（获知后15日）', offsetDays: 15 },
      { node: '转归随访（获知后30日）', offsetDays: 30 },
    ],
  },
  {
    key: 'serious',
    label: '严重不良反应',
    limitDays: 15,
    limitLabel: '获知后15日内',
    basis: 'GVP严重个例：15日口径，危急立即电话报告',
    followups: [
      { node: '紧急随访（获知后24小时）', offsetDays: 1 },
      { node: '阶段随访（获知后7日）', offsetDays: 8 },
      { node: '转归随访（获知后30日）', offsetDays: 31 },
    ],
  },
  {
    key: 'death',
    label: '死亡病例',
    limitDays: 1,
    limitLabel: '获知后24小时内（立即报告）',
    basis: 'GVP死亡病例：24小时立即报告',
    followups: [
      { node: '首次随访（获知后24小时）', offsetDays: 1 },
      { node: '补充随访（获知后7日）', offsetDays: 8 },
      { node: '阶段随访（获知后15日）', offsetDays: 15 },
      { node: '尸检/总结随访（获知后30日）', offsetDays: 30 },
    ],
  },
  {
    key: 'cluster',
    label: '群体不良反应',
    limitDays: 1,
    limitLabel: '获知后24小时内（立即报告）',
    basis: 'GVP群体事件：24小时立即报告并续报',
    followups: [
      { node: '首次随访（获知后24小时）', offsetDays: 1 },
      { node: '续报随访（获知后7日）', offsetDays: 8 },
      { node: '结案随访（获知后14日）', offsetDays: 14 },
    ],
  },
]

export const ADR_TYPE_BY_KEY: Map<AdrTypeKey, AdrTypeRule> = new Map(
  ADR_TYPE_RULES.map((rule) => [rule.key, rule]),
)

/** 状态只能单向流转，且只允许走到相邻的下一档，跨级一律拦下。 */
export const ADR_STATUSES: AdrStatus[] = ['已登记', '已上报', '已随访', '已关闭']

export const ADR_NEXT_ACTION: Partial<Record<AdrStatus, string>> = {
  已登记: '提交上报',
  已上报: '随访完成',
  已随访: '关闭报告',
}

// ---------------------------------------------------------------------------
// 节假日顺延：日历也属于同一套口径的一部分。
// 2026 年法定节假日按国务院办公厅放假安排维护；顺延遇周末同样后移到工作日，
// 调休上班的周末按工作日处理。
// ---------------------------------------------------------------------------

const HOLIDAYS_2026: Record<string, string> = {
  '2026-01-01': '元旦',
  '2026-01-02': '元旦',
  '2026-01-03': '元旦',
  '2026-02-16': '春节',
  '2026-02-17': '春节',
  '2026-02-18': '春节',
  '2026-02-19': '春节',
  '2026-02-20': '春节',
  '2026-02-21': '春节',
  '2026-02-22': '春节',
  '2026-04-06': '清明节',
  '2026-05-01': '劳动节',
  '2026-05-02': '劳动节',
  '2026-05-03': '劳动节',
  '2026-05-04': '劳动节',
  '2026-05-05': '劳动节',
  '2026-06-19': '端午节',
  '2026-09-25': '中秋节',
  '2026-10-01': '国庆节、中秋节',
  '2026-10-02': '国庆节、中秋节',
  '2026-10-03': '国庆节、中秋节',
  '2026-10-04': '国庆节、中秋节',
  '2026-10-05': '国庆节、中秋节',
  '2026-10-06': '国庆节、中秋节',
  '2026-10-07': '国庆节、中秋节',
  '2026-10-08': '国庆节、中秋节',
}

/** 调休上班日：落在周末但按工作日计。 */
const ADJUSTED_WORKDAYS_2026 = new Set<string>([
  '2026-02-14',
  '2026-02-28',
  '2026-04-26',
  '2026-09-26',
  '2026-10-10',
])

export function holidayName(day: string): string {
  return HOLIDAYS_2026[day] ?? ''
}

export function isWorkday(day: Date): boolean {
  const text = formatDay(day)
  if (ADJUSTED_WORKDAYS_2026.has(text)) {
    return true
  }
  if (HOLIDAYS_2026[text]) {
    return false
  }
  const weekday = day.getDay()
  return weekday !== 0 && weekday !== 6
}

export function parseDay(text: string): Date {
  const [year, month, date] = text.split('-').map(Number)
  return new Date(year, month - 1, date)
}

export function formatDay(day: Date): string {
  const year = day.getFullYear()
  const month = String(day.getMonth() + 1).padStart(2, '0')
  const date = String(day.getDate()).padStart(2, '0')
  return `${year}-${month}-${date}`
}

export function addDays(day: Date, days: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days)
}

export function todayText(): string {
  return formatDay(new Date())
}

/** 基础上报时限：获知之日 + 类型规定天数，不做任何顺延。 */
export function baseDeadline(type: AdrTypeKey, awarenessDate: string): string {
  const rule = ADR_TYPE_BY_KEY.get(type)
  if (!rule) {
    throw new Error(`未登记的报告类型：${type}`)
  }
  return formatDay(addDays(parseDay(awarenessDate), rule.limitDays))
}

export type RollHit = { date: string; reason: string }

export type RollResult = {
  /** 顺延前的原始时限。 */
  from: string
  /** 顺延后落到的工作日时限。 */
  to: string
  /** 途中命中的节假日/休息日，逐天留痕。 */
  hits: RollHit[]
}

/**
 * 时限落到法定节假日或休息日的，逐日顺延到最近工作日；
 * 调休上班的周末不顺延。顺延命中的每一天都带回台账留痕。
 */
export function rollToWorkday(deadline: string): RollResult {
  const from = deadline
  let cursor = parseDay(deadline)
  const hits: RollHit[] = []
  while (!isWorkday(cursor)) {
    const text = formatDay(cursor)
    const named = HOLIDAYS_2026[text]
    hits.push({ date: text, reason: named ? `法定节假日：${named}` : '休息日顺延' })
    cursor = addDays(cursor, 1)
  }
  return { from, to: formatDay(cursor), hits }
}

/** 法定（规程）时限上限：基础时限按节假日顺延后的工作日。任何手工填报不得越过它。 */
export function lawfulDeadlineCap(type: AdrTypeKey, awarenessDate: string): string {
  return rollToWorkday(baseDeadline(type, awarenessDate)).to
}
