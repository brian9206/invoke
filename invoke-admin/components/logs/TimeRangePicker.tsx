import { useState, useEffect, useRef } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger, PopoverArrow } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/cn'

// ─── Public interface ──────────────────────────────────────────────────────────

export interface TimeRange {
  from: Date
  to: Date
  label: string
  fromExpr?: string
  toExpr?: string
}

interface TimeRangePickerProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

// ─── Internal types ────────────────────────────────────────────────────────────

type RelUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'
type EndpointMode = 'absolute' | 'relative' | 'now'

interface EndpointState {
  mode: EndpointMode
  absDate: Date
  absTime: string   // "HH:mm"
  relValue: string
  relUnit: RelUnit
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
] as const

const DAY_HEADERS = ['Su','Mo','Tu','We','Th','Fr','Sa'] as const

const REL_UNITS: { value: RelUnit; label: string }[] = [
  { value: 'seconds', label: 'Seconds ago' },
  { value: 'minutes', label: 'Minutes ago' },
  { value: 'hours',   label: 'Hours ago'   },
  { value: 'days',    label: 'Days ago'    },
  { value: 'weeks',   label: 'Weeks ago'   },
  { value: 'months',  label: 'Months ago'  },
  { value: 'years',   label: 'Years ago'   },
]

const UNIT_MS: Record<RelUnit, number> = {
  seconds:           1_000,
  minutes:          60_000,
  hours:         3_600_000,
  days:         86_400_000,
  weeks:     7 * 86_400_000,
  months:   30 * 86_400_000,
  years:   365 * 86_400_000,
}

// ─── Public helpers ────────────────────────────────────────────────────────────

const UNIT_ABBR: Record<RelUnit, string> = {
  seconds: 's', minutes: 'm', hours: 'h', days: 'd', weeks: 'w', months: 'mo', years: 'y',
}

const ABBR_TO_UNIT: Record<string, RelUnit> = {
  s: 'seconds', m: 'minutes', h: 'hours', d: 'days', w: 'weeks', mo: 'months', y: 'years',
}

function endpointExpr(ep: EndpointState): string {
  if (ep.mode === 'now') return 'now'
  if (ep.mode === 'relative') {
    const n = Math.max(1, parseInt(ep.relValue) || 1)
    return `ago:${n}${UNIT_ABBR[ep.relUnit]}`
  }
  const d = resolveEndpoint(ep)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}`
}

export function parseExprToDate(expr: string): Date | null {
  if (expr === 'now') return new Date()
  const ago = expr.match(/^ago:(\d+)(s|m|h|d|w|mo|y)$/)
  if (ago) {
    const n = parseInt(ago[1])
    const unit = ABBR_TO_UNIT[ago[2]]
    return unit ? new Date(Date.now() - n * UNIT_MS[unit]) : null
  }
  const abs = expr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})$/)
  if (abs) return new Date(+abs[1], +abs[2] - 1, +abs[3], +abs[4], +abs[5])
  return null
}

export function exprToLabel(expr: string): string {
  if (expr === 'now') return 'now'
  const ago = expr.match(/^ago:(\d+)(s|m|h|d|w|mo|y)$/)
  if (ago) {
    const n = parseInt(ago[1])
    const unit = ABBR_TO_UNIT[ago[2]]
    const unitLabel = REL_UNITS.find(u => u.value === unit)?.label ?? ''
    return `~ ${n} ${unitLabel.toLowerCase()}`
  }
  const d = parseExprToDate(expr)
  if (d) return d.toLocaleString([], { month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  return expr
}

export function makePresetRange(ms: number, label: string): TimeRange {
  const to = new Date()
  return { from: new Date(to.getTime() - ms), to, label }
}

export const DEFAULT_TIME_RANGE: TimeRange = {
  ...makePresetRange(15 * 60_000, '~ 15 minutes ago → now'),
  fromExpr: 'ago:15m',
  toExpr: 'now',
}

// ─── Private helpers ───────────────────────────────────────────────────────────

function pad2(n: number) { return String(n).padStart(2, '0') }
function toHHMM(d: Date) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}` }

function resolveEndpoint(ep: EndpointState): Date {
  if (ep.mode === 'now') return new Date()
  if (ep.mode === 'relative') {
    const n = Math.max(1, parseInt(ep.relValue) || 1)
    return new Date(Date.now() - n * UNIT_MS[ep.relUnit])
  }
  const d = new Date(ep.absDate)
  const [h, m] = ep.absTime.split(':').map(Number)
  d.setHours(h || 0, m || 0, 0, 0)
  return d
}

function endpointLabel(ep: EndpointState): string {
  if (ep.mode === 'now') return 'now'
  if (ep.mode === 'relative') {
    const n = Math.max(1, parseInt(ep.relValue) || 1)
    const unit = REL_UNITS.find(u => u.value === ep.relUnit)!
    return `~ ${n} ${unit.label.toLowerCase()}`
  }
  return resolveEndpoint(ep).toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function initFrom(d: Date): EndpointState {
  return { mode: 'absolute', absDate: new Date(d), absTime: toHHMM(d), relValue: '15', relUnit: 'minutes' }
}

function initTo(d: Date): EndpointState {
  const isNow = (Date.now() - d.getTime()) < 120_000
  return { mode: isNow ? 'now' : 'absolute', absDate: new Date(d), absTime: toHHMM(d), relValue: '1', relUnit: 'minutes' }
}

// ─── MiniCalendar ──────────────────────────────────────────────────────────────

function MiniCalendar({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [vy, setVy] = useState(value.getFullYear())
  const [vm, setVm] = useState(value.getMonth())

  const firstDow    = new Date(vy, vm, 1).getDay()
  const daysInMonth = new Date(vy, vm + 1, 0).getDate()
  const prevMonDays = new Date(vy, vm, 0).getDate()
  const today       = new Date()

  type CT = 'prev' | 'cur' | 'next'
  const cells: { day: number; t: CT }[] = []
  for (let i = 0; i < firstDow; i++)
    cells.push({ day: prevMonDays - firstDow + 1 + i, t: 'prev' })
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ day: d, t: 'cur' })
  let nxt = 1
  while (cells.length < 42) cells.push({ day: nxt++, t: 'next' })

  const isSel = (day: number, t: CT) =>
    t === 'cur' && value.getFullYear() === vy && value.getMonth() === vm && value.getDate() === day
  const isToday = (day: number, t: CT) =>
    t === 'cur' && today.getFullYear() === vy && today.getMonth() === vm && today.getDate() === day

  const nav = (dir: 1 | -1) => {
    const d = new Date(vy, vm + dir, 1)
    setVy(d.getFullYear()); setVm(d.getMonth())
  }

  return (
    <div className="shrink-0 w-[196px] select-none">
      {/* Month/year nav */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => nav(-1)} className="p-1 rounded hover:bg-accent transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-0.5">
          <Select value={String(vm)} onValueChange={v => setVm(Number(v))}>
            <SelectTrigger className="h-6 w-[100px] text-xs border-0 bg-transparent px-1 focus:ring-0 focus-visible:ring-0 shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, i) => (
                <SelectItem key={name} value={String(i)} className="text-xs">{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={vy}
            onChange={e => setVy(Number(e.target.value))}
            className="h-6 w-14 text-xs text-center border-0 bg-transparent p-0 focus-visible:ring-0 shadow-none"
          />
        </div>
        <button onClick={() => nav(1)} className="p-1 rounded hover:bg-accent transition-colors">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-0.5">
        {DAY_HEADERS.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-0.5">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((cell, idx) => (
          <button
            key={idx}
            disabled={cell.t !== 'cur'}
            onClick={() => {
              if (cell.t !== 'cur') return
              const d = new Date(value); d.setFullYear(vy, vm, cell.day); onChange(d)
            }}
            className={cn(
              'text-[11px] h-[22px] w-full rounded text-center transition-colors',
              cell.t !== 'cur' ? 'text-muted-foreground/25 cursor-default' : 'hover:bg-accent cursor-pointer',
              isSel(cell.day, cell.t) && '!bg-primary !text-primary-foreground',
              isToday(cell.day, cell.t) && !isSel(cell.day, cell.t) && 'font-bold text-primary',
            )}
          >
            {cell.day}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── TimeSlotList ──────────────────────────────────────────────────────────────

function TimeSlotList({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const active = value.substring(0, 5)

  const slots: string[] = []
  for (let h = 0; h < 24; h++)
    for (const m of [0, 30])
      slots.push(`${pad2(h)}:${pad2(m)}`)

  // Scroll active slot into view on mount
  useEffect(() => {
    const el = containerRef.current?.querySelector('[data-active="true"]') as HTMLElement | null
    el?.scrollIntoView({ block: 'center' })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} className="w-16 shrink-0 overflow-y-auto border-l border-border pl-1 max-h-full">
      {slots.map(slot => (
        <button
          key={slot}
          data-active={slot === active}
          onClick={() => onChange(slot)}
          className={cn(
            'block w-full text-left text-[11px] px-2 py-1 rounded transition-colors',
            slot === active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
          )}
        >
          {slot}
        </button>
      ))}
    </div>
  )
}

// ─── EndpointEditor ────────────────────────────────────────────────────────────

function EndpointEditor({
  title, state, onChange, isStart = false,
}: {
  title: string
  state: EndpointState
  onChange: (s: EndpointState) => void
  isStart?: boolean
}) {
  const resolved = resolveEndpoint(state)
  const resolvedStr = resolved.toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  return (
    <div className="flex flex-col flex-1 min-w-0 gap-3">
      <Tabs value={state.mode} onValueChange={v => onChange({ ...state, mode: v as EndpointMode })}>
        {/* Tab list + label on same row */}
        <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
          <TabsList className="h-7">
            <TabsTrigger value="absolute" className="text-xs px-2.5 h-6">Absolute</TabsTrigger>
            <TabsTrigger value="relative" className="text-xs px-2.5 h-6">Relative</TabsTrigger>
            <TabsTrigger value="now"      className="text-xs px-2.5 h-6">Now</TabsTrigger>
          </TabsList>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex-shrink-0">
            {title}
          </span>
        </div>

        {/* Absolute: calendar + time slot list */}
        <TabsContent value="absolute" className="mt-0">
          <div className="flex gap-2" style={{ height: 188 }}>
            <MiniCalendar value={state.absDate} onChange={d => onChange({ ...state, absDate: d })} />
            <TimeSlotList value={state.absTime} onChange={t => onChange({ ...state, absTime: t })} />
          </div>
        </TabsContent>

        {/* Relative: number + unit */}
        <TabsContent value="relative" className="mt-0">
          <div className="flex items-center gap-2 py-3">
            <Input
              type="number"
              min={1}
              value={state.relValue}
              onChange={e => onChange({ ...state, relValue: e.target.value })}
              className="w-20 h-8 text-sm"
            />
            <Select value={state.relUnit} onValueChange={v => onChange({ ...state, relUnit: v as RelUnit })}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REL_UNITS.map(u => (
                  <SelectItem key={u.value} value={u.value} className="text-xs">{u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TabsContent>

        {/* Now */}
        <TabsContent value="now" className="mt-0">
          <p className="text-xs text-muted-foreground leading-relaxed py-3">
            Setting the time to &ldquo;now&rdquo; means that on every refresh this time will be
            set to the time of the refresh.
          </p>
          <Button size="sm" className="w-full text-xs" onClick={() => onChange({ ...state, mode: 'now' })}>
            Set {title.toLowerCase()} date and time to now
          </Button>
        </TabsContent>
      </Tabs>

      {/* Resolved preview — only meaningful for absolute mode */}
      {state.mode === 'absolute' && (
        <p className="text-[11px] text-muted-foreground border-t border-border pt-2 mt-auto">
          <span className="font-medium text-foreground capitalize">{title} date</span>
          {' '}{resolvedStr}
        </p>
      )}
    </div>
  )
}

// ─── TimeRangePicker ───────────────────────────────────────────────────────────

export function TimeRangePicker({ value, onChange }: TimeRangePickerProps) {
  // Split label into two display parts
  const labelParts   = value.label.split(' → ')
  const startDisplay = labelParts[0] ?? ''
  const endDisplay   = labelParts.length > 1 ? labelParts.slice(1).join(' → ') : ''

  const [startOpen,  setStartOpen]  = useState(false)
  const [endOpen,    setEndOpen]    = useState(false)
  const [startState, setStartState] = useState<EndpointState>(() => initFrom(value.from))
  const [endState,   setEndState]   = useState<EndpointState>(() => initTo(value.to))
  const [startError, setStartError] = useState('')
  const [endError,   setEndError]   = useState('')

  const handleStartOpenChange = (open: boolean) => {
    if (open) { setStartState(initFrom(value.from)); setStartError('') }
    setStartOpen(open)
  }

  const handleEndOpenChange = (open: boolean) => {
    if (open) { setEndState(initTo(value.to)); setEndError('') }
    setEndOpen(open)
  }

  const handleUpdateStart = () => {
    const from = resolveEndpoint(startState)
    if (from >= value.to) { setStartError('"Start" must be before the current end.'); return }
    const right = labelParts.length > 1 ? labelParts.slice(1).join(' → ') : endpointLabel(initTo(value.to))
    onChange({ from, to: value.to, label: `${endpointLabel(startState)} → ${right}`, fromExpr: endpointExpr(startState), toExpr: value.toExpr })
    setStartOpen(false)
  }

  const handleUpdateEnd = () => {
    const to = resolveEndpoint(endState)
    if (value.from >= to) { setEndError('"End" must be after the current start.'); return }
    const left = labelParts[0] ?? endpointLabel(initFrom(value.from))
    onChange({ from: value.from, to, label: `${left} → ${endpointLabel(endState)}`, fromExpr: value.fromExpr, toExpr: endpointExpr(endState) })
    setEndOpen(false)
  }

  return (
    <div className="flex items-center h-9 border border-border rounded-md text-xs font-mono bg-background shrink-0 pe-2">
      <Calendar className="w-3.5 h-3.5 text-muted-foreground mx-2 shrink-0" />

      {/* Start trigger */}
      <Popover open={startOpen} onOpenChange={handleStartOpenChange}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'h-full px-1.5 text-muted-foreground hover:text-foreground transition-colors truncate max-w-[180px]',
              startOpen && 'underline text-foreground',
            )}
          >
            {startDisplay}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={6}
          className="w-[300px] p-4"
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <PopoverArrow style={{ fill: 'hsl(var(--popover))' }} />
          <EndpointEditor title="Start" state={startState} onChange={setStartState} isStart />
          {startError && <p className="text-xs text-destructive mt-2">{startError}</p>}
          <div className="flex justify-end gap-2 pt-3 border-t border-border mt-3">
            <Button variant="outline" size="sm" onClick={() => setStartOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleUpdateStart}>Update</Button>
          </div>
        </PopoverContent>
      </Popover>

      <span className="text-muted-foreground shrink-0 px-1">→</span>

      {/* End trigger */}
      <Popover open={endOpen} onOpenChange={handleEndOpenChange}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'h-full px-1.5 text-muted-foreground hover:text-foreground transition-colors truncate max-w-[180px]',
              endOpen && 'underline text-foreground',
            )}
          >
            {endDisplay}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={6}
          className="w-[300px] p-4"
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <PopoverArrow style={{ fill: 'hsl(var(--popover))' }} />
          <EndpointEditor title="End" state={endState} onChange={setEndState} />
          {endError && <p className="text-xs text-destructive mt-2">{endError}</p>}
          <div className="flex justify-end gap-2 pt-3 border-t border-border mt-3">
            <Button variant="outline" size="sm" onClick={() => setEndOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleUpdateEnd}>Update</Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

