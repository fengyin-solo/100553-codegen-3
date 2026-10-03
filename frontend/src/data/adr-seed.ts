import { baseDeadline, rollToWorkday, type AdrTypeKey } from './adr-rules'
import type { AdrLogEntry, AdrReport, DeadlineTrace } from './adr-store'

// 示例数据：覆盖五栏、节假日顺延留痕、超期未报、随访未补齐等情形。
// 日期均取自 2026 年 9-10 月（当前日期 2026-10-03），便于直接看出超期与顺延。

function autoTrace(type: AdrTypeKey, awarenessDate: string): DeadlineTrace {
  const base = baseDeadline(type, awarenessDate)
  const rolled = rollToWorkday(base)
  return {
    baseDeadline: base,
    effectiveDeadline: rolled.to,
    hits: rolled.hits,
    note: '登记时按节假日规则自动顺延',
    changedAt: awarenessDate,
  }
}

function seedLogs(actions: Array<{ at: string; action: string; detail: string }>): AdrLogEntry[] {
  return actions.map((item) => ({ operator: '值班管理员', ...item }))
}

export const SEED_ADR_REPORTS: AdrReport[] = [
  {
    id: 1,
    reportNo: 'ADR-2026-0001',
    suspectDrug: '阿莫西林胶囊',
    type: 'general',
    awarenessDate: '2026-09-10',
    reporter: '王药师',
    source: '电话',
    reaction: '皮疹瘙痒',
    status: '已登记',
    reportChannel: '待报送',
    submittedAt: '',
    follows: [],
    traces: [autoTrace('general', '2026-09-10')],
    logs: seedLogs([
      { at: '2026-09-10', action: '登记报告', detail: '电话获知，归口怀疑药品阿莫西林胶囊' },
    ]),
  },
  {
    id: 2,
    reportNo: 'ADR-2026-0002',
    suspectDrug: '头孢呋辛酯片',
    type: 'serious',
    awarenessDate: '2026-09-12',
    reporter: '李药师',
    source: '邮件',
    reaction: '过敏性休克',
    status: '已上报',
    reportChannel: '国家药监局不良反应监测系统',
    submittedAt: '2026-09-25',
    follows: [{ node: '紧急随访（获知后24小时）', followDate: '2026-09-13', content: '已住院观察，生命体征平稳', reporter: '李药师' }],
    traces: [autoTrace('serious', '2026-09-12')],
    logs: seedLogs([
      { at: '2026-09-12', action: '登记报告', detail: '邮件获知，归口怀疑药品头孢呋辛酯片' },
      { at: '2026-09-25', action: '提交上报', detail: '15日时限内，经国家监测系统上报' },
      { at: '2026-09-13', action: '登记随访', detail: '紧急随访（获知后24小时）' },
    ]),
  },
  {
    id: 3,
    reportNo: 'ADR-2026-0003',
    suspectDrug: '左氧氟沙星注射液',
    type: 'death',
    awarenessDate: '2026-09-30',
    reporter: '赵药师',
    source: '电话',
    reaction: '用药后死亡',
    status: '已登记',
    reportChannel: '待报送',
    submittedAt: '',
    follows: [],
    traces: [autoTrace('death', '2026-09-30')],
    logs: seedLogs([
      { at: '2026-09-30', action: '登记报告', detail: '24小时立即报告口径，基础时限落国庆假期已自动顺延' },
    ]),
  },
  {
    id: 4,
    reportNo: 'ADR-2026-0004',
    suspectDrug: '布洛芬缓释胶囊',
    type: 'new',
    awarenessDate: '2026-08-20',
    reporter: '王药师',
    source: '邮件',
    reaction: '说明书未载明的视物模糊',
    status: '已登记',
    reportChannel: '待报送',
    submittedAt: '',
    follows: [],
    traces: [autoTrace('new', '2026-08-20')],
    logs: seedLogs([
      { at: '2026-08-20', action: '登记报告', detail: '新的不良反应，15日口径' },
    ]),
  },
  {
    id: 5,
    reportNo: 'ADR-2026-0005',
    suspectDrug: '克林霉素注射液',
    type: 'cluster',
    awarenessDate: '2026-09-20',
    reporter: '周药师',
    source: '电话',
    reaction: '3名患者寒战发热',
    status: '已上报',
    reportChannel: '电话快报+国家监测系统',
    submittedAt: '2026-09-21',
    follows: [
      { node: '首次随访（获知后24小时）', followDate: '2026-09-21', content: '3名患者已处置', reporter: '周药师' },
      { node: '续报随访（获知后7日）', followDate: '2026-09-28', content: '2名出院，1名留观', reporter: '周药师' },
    ],
    traces: [autoTrace('cluster', '2026-09-20')],
    logs: seedLogs([
      { at: '2026-09-20', action: '登记报告', detail: '群体事件，归口怀疑药品克林霉素注射液' },
      { at: '2026-09-21', action: '提交上报', detail: '24小时内电话快报并系统上报' },
    ]),
  },
  {
    id: 6,
    reportNo: 'ADR-2026-0006',
    suspectDrug: '二甲双胍片',
    type: 'general',
    awarenessDate: '2026-07-15',
    reporter: '孙药师',
    source: '邮件',
    reaction: '轻度胃肠不适',
    status: '已关闭',
    reportChannel: '国家药监局不良反应监测系统',
    submittedAt: '2026-07-20',
    follows: [
      { node: '首次随访（获知后30日）', followDate: '2026-08-14', content: '症状缓解', reporter: '孙药师' },
      { node: '转归随访（获知后60日）', followDate: '2026-09-13', content: '已痊愈，转归良好', reporter: '孙药师' },
    ],
    traces: [autoTrace('general', '2026-07-15')],
    logs: seedLogs([
      { at: '2026-07-15', action: '登记报告', detail: '一般不良反应' },
      { at: '2026-07-20', action: '提交上报', detail: '30日时限内系统上报' },
      { at: '2026-09-14', action: '随访完成', detail: '全部随访节点已登记' },
      { at: '2026-09-15', action: '关闭报告', detail: '随访齐备，关闭' },
    ]),
  },
  {
    id: 7,
    reportNo: 'ADR-2026-0007',
    suspectDrug: '阿莫西林胶囊',
    type: 'serious',
    awarenessDate: '2026-09-05',
    reporter: '王药师',
    source: '电话',
    reaction: '严重肝功能异常',
    status: '已登记',
    reportChannel: '待报送',
    submittedAt: '',
    follows: [],
    traces: [autoTrace('serious', '2026-09-05')],
    logs: seedLogs([
      { at: '2026-09-05', action: '登记报告', detail: '严重不良反应，15日口径' },
    ]),
  },
]
