import type { HolidayEntry } from './adr-types'

/** 日历工具：上报时限按日历日起算，落到休息日/法定节假日的，
 * 顺延到第一个工作日，每一次顺延都要留痕（节假日顺延留痕）。 */

export function toDate(s: string): Date {
  // 统一按本地零点解析，避免 UTC 偏移把日期挪前一天。
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(s: string, n: number): string {
  const d = toDate(s)
  d.setDate(d.getDate() + n)
  return fmt(d)
}

export function today(): string {
  return fmt(new Date())
}

/** 该日是否为休息日：先看法定节假日/调休表，没登记再按周六周日。 */
export function isOffDay(s: string, holidays: HolidayEntry[]): { off: boolean; name: string } {
  const hit = holidays.find((h) => h.date === s)
  if (hit) {
    return { off: hit.off, name: hit.off ? hit.name : '' }
  }
  const dow = toDate(s).getDay()
  if (dow === 0) return { off: true, name: '星期日' }
  if (dow === 6) return { off: true, name: '星期六' }
  return { off: false, name: '' }
}

/** 从候选日起逐日往后找，直到第一个工作日；最多向后找 15 天兜底。
 * 返回顺延后日期与沿途撞到的休息日名称（用于留痕）。 */
export function shiftToWorkday(
  s: string,
  holidays: HolidayEntry[],
): { date: string; hits: { date: string; name: string }[] } {
  const hits: { date: string; name: string }[] = []
  let cur = s
  for (let i = 0; i < 15; i += 1) {
    const day = isOffDay(cur, holidays)
    if (!day.off) break
    hits.push({ date: cur, name: day.name })
    cur = addDays(cur, 1)
  }
  return { date: cur, hits }
}

/** 计算上报截止日：发生/获知日 + 时限天数（同一套规则），再做节假日顺延。 */
export function calcDeadline(
  eventDate: string,
  deadlineDays: number,
  holidays: HolidayEntry[],
): { rawDeadline: string; deadline: string; hits: { date: string; name: string }[] } {
  const rawDeadline = addDays(eventDate, deadlineDays)
  const shifted = shiftToWorkday(rawDeadline, holidays)
  return { rawDeadline, deadline: shifted.date, hits: shifted.hits }
}

/** 日期大小比较：a < b 返回 -1。 */
export function cmpDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function diffDays(from: string, to: string): number {
  const ms = toDate(to).getTime() - toDate(from).getTime()
  return Math.round(ms / 86400000)
}
