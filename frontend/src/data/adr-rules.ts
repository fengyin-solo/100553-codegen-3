import type { AdrReportKind, AdrStatus } from './adr-types'

/** 业务规则定版：
 * 报告类型与随访记录「谁说了算」——先按业务定，就定在这张表。
 * 上报时限「多处取到的属于同一套」——台账、登记、上报、超期判断都从这里取，
 * 任何页面不允许自己再写一份天数。 */
export type KindRule = {
  kind: AdrReportKind
  label: string
  /** 获知/发生之日起多少日内报出去（日历日，撞节假日再顺延）。 */
  deadlineDays: number
  /** 该类型必须完成的随访节点（顺序即业务定版）。 */
  followUpNodes: string[]
  /** 是否需要随访通过后才能上报监管（一般个例）。 */
  followUpBeforeSubmit: boolean
  desc: string
}

export const KIND_ORDER: AdrReportKind[] = ['new', 'serious', 'general', 'aggregate', 'cluster']

export const KIND_RULES: Record<AdrReportKind, KindRule> = {
  // 新的（严重，含死亡）不良反应：15 日内报告，随访到转归
  new: {
    kind: 'new',
    label: '新的/严重不良反应',
    deadlineDays: 15,
    followUpNodes: ['首次随访', '转归随访'],
    followUpBeforeSubmit: false,
    desc: '新的或严重的药品不良反应，自发现/获知之日起15日内报告，需随访至明确转归',
  },
  // 严重不良反应紧急报告：立即报告（不超过24小时），随访到转归
  serious: {
    kind: 'serious',
    label: '严重不良反应紧急报告',
    deadlineDays: 1,
    followUpNodes: ['24小时紧急核实', '7日随访', '转归随访'],
    followUpBeforeSubmit: false,
    desc: '致死/危及生命等严重病例须立即报告，不迟于获知后24小时（按1日时限管控），后续随访到转归',
  },
  // 一般不良反应：30 日内报告，一次转归随访
  general: {
    kind: 'general',
    label: '一般不良反应',
    deadlineDays: 30,
    followUpNodes: ['转归随访'],
    followUpBeforeSubmit: false,
    desc: '一般药品不良反应，自发现/获知之日起30日内报告，登记一次转归随访',
  },
  // 定期安全性更新报告/汇总报告：按固定周期，90 日窗口
  aggregate: {
    kind: 'aggregate',
    label: '定期/汇总报告(PSUR)',
    deadlineDays: 90,
    followUpNodes: [],
    followUpBeforeSubmit: false,
    desc: '定期安全性更新与个例汇总分析，按周期窗口汇总上报，不做个案随访',
  },
  // 群体不良反应：立即报告（当日），应急随访
  cluster: {
    kind: 'cluster',
    label: '群体不良事件报告',
    deadlineDays: 1,
    followUpNodes: ['当日应急核实', '进展续报', '结案评估'],
    followUpBeforeSubmit: false,
    desc: '同一药品在使用过程中出现的群体不良事件，须立即（当日内）报告并续报进展',
  },
}

export function kindLabel(kind: AdrReportKind): string {
  return KIND_RULES[kind].label
}

/** 状态机：单向流转，只能走到链上的下一个状态，跨级/回退一律拦下。
 * 业务定版——个例先报监管、再随访到转归、最后闭环：
 * 待上报 -> 已上报 -> 随访中 -> 已闭环
 * 汇总报告无随访环节：待上报 -> 已上报 -> 已闭环
 * 严重/群体病例走「立即上报」，也必须先落到待上报再由上报动作推进，
 * 不能跳过上报直接随访/闭环。 */
export const STATUS_CHAIN: AdrStatus[] = ['待上报', '已上报', '随访中', '已闭环']

/** 各类型允许的状态顺序：无随访节点的类型跳过随访段。 */
export function statusChainFor(kind: AdrReportKind): AdrStatus[] {
  if (KIND_RULES[kind].followUpNodes.length === 0) {
    return ['待上报', '已上报', '已闭环']
  }
  return STATUS_CHAIN
}

/** 只允许推进到紧邻的下一个状态；跨级、回退、同级都拦下。 */
export function nextStatus(kind: AdrReportKind, current: AdrStatus): AdrStatus | null {
  const chain = statusChainFor(kind)
  const i = chain.indexOf(current)
  if (i < 0 || i >= chain.length - 1) return null
  return chain[i + 1]
}

export function isTerminal(status: AdrStatus): boolean {
  return status === '已闭环'
}

/** 监管上报动作只能从「待上报」发起——已上报后重复报、未登记直接报都拦下。 */
export function canSubmit(status: AdrStatus): boolean {
  return status === '待上报'
}

/** 报告来源（电话、邮件两头传的归口）。 */
export const SOURCE_OPTIONS = ['电话', '邮件', '临床来访', '文献', '监管机构反馈']

/** 上报渠道。 */
export const CHANNEL_OPTIONS = ['国家ADR监测系统', '省ADR监测中心', '电话快报', '邮件快报', '现场报告']

/** 转归选项。 */
export const OUTCOME_OPTIONS = ['痊愈', '好转', '未好转', '后遗症', '死亡', '不详']
