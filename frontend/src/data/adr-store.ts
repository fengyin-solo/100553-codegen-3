import { ADR_SEED } from './adr-seed'
import type { AdrState } from './adr-types'

// 不良反应台账独立一卷存储，不和通用 EntryRow 混在一起。
const STORAGE_KEY = 'pharma-cleanroom:adr-ledger'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): AdrState {
  const fallback = clone(ADR_SEED)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    // 合并是为了规则升级新增字段/新增节假日时，老缓存也能补齐。
    const parsed = JSON.parse(raw) as Partial<AdrState>
    const seed = clone(ADR_SEED)
    return {
      reports: parsed.reports ?? seed.reports,
      followUps: parsed.followUps ?? seed.followUps,
      submissions: parsed.submissions ?? seed.submissions,
      shifts: parsed.shifts ?? seed.shifts,
      todos: parsed.todos ?? seed.todos,
      holidays: parsed.holidays ?? seed.holidays,
      seq: { ...seed.seq, ...(parsed.seq ?? {}) },
    }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: AdrState | null = null

export function adrState(): AdrState {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function saveAdrState(state: AdrState): void {
  cache = state
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }
}

export function resetAdr(): AdrState {
  const fresh = clone(ADR_SEED)
  saveAdrState(fresh)
  return fresh
}

export function adrStorageKey(): string {
  return STORAGE_KEY
}
