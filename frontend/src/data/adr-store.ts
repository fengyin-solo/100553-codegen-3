import type { AdrStatus, AdrTypeKey, RollHit } from './adr-rules'
import { SEED_ADR_REPORTS } from './adr-seed'

/** 随访记录：节点必须取自报告类型规定的节点清单，由报告人登记。 */
export type FollowUpRecord = {
  node: string
  followDate: string
  content: string
  reporter: string
}

/** 节假日顺延留痕：基础时限为何、落到哪一天、命中哪些休息日。 */
export type DeadlineTrace = {
  baseDeadline: string
  effectiveDeadline: string
  hits: RollHit[]
  /** 顺延依据，自动顺延写规则，手工改期要写明理由。 */
  note: string
  changedAt: string
}

export type AdrLogEntry = {
  at: string
  operator: string
  action: string
  detail: string
}

export type AdrReport = {
  id: number
  reportNo: string
  /** 按怀疑药品归口。 */
  suspectDrug: string
  type: AdrTypeKey
  awarenessDate: string
  reporter: string
  source: string
  reaction: string
  status: AdrStatus
  reportChannel: string
  submittedAt: string
  follows: FollowUpRecord[]
  traces: DeadlineTrace[]
  logs: AdrLogEntry[]
}

export type CreateAdrInput = {
  reportNo: string
  suspectDrug: string
  type: AdrTypeKey
  awarenessDate: string
  reporter: string
  source: string
  reaction: string
  /** 手工填报的上报时限：只能落在「获知日～法定顺延上限」之间，越界打回重填。 */
  declaredDeadline: string
}

export type CreateFollowInput = {
  node: string
  followDate: string
  content: string
  reporter: string
}

// 本地持久化：不良反应台账独立一卷，与既有模块清单分开存放，互不影响。
const ADR_STORAGE_KEY = 'pharma-cleanroom:adr-reports'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): AdrReport[] {
  const fallback = clone(SEED_ADR_REPORTS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(ADR_STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(ADR_STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    return JSON.parse(raw) as AdrReport[]
  } catch {
    window.localStorage.setItem(ADR_STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: AdrReport[] | null = null

export function listAdrReports(): AdrReport[] {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function saveAdrReports(reports: AdrReport[]): void {
  cache = reports
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(ADR_STORAGE_KEY, JSON.stringify(reports))
  }
}

export function resetAdrReports(): AdrReport[] {
  const reports = clone(SEED_ADR_REPORTS)
  saveAdrReports(reports)
  return reports
}

export function adrStorageKey(): string {
  return ADR_STORAGE_KEY
}
