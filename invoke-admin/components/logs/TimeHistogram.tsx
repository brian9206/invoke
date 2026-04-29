import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { Loader, BarChart2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Interval = 'auto' | 'minute' | 'hour' | 'day' | 'week' | 'month'

const INTERVAL_OPTIONS: { value: Interval; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'minute', label: 'By minute' },
  { value: 'hour', label: 'By hour' },
  { value: 'day', label: 'By day' },
  { value: 'week', label: 'By week' },
  { value: 'month', label: 'By month' }
]

interface HistogramBucket {
  time: string
  count: number
  error_count: number
}

interface TimeHistogramProps {
  projectId: string
  kqlQuery: string
  from: Date
  to: Date
  logType?: string
  /** Optional additional className for the root element */
  className?: string
}

export function TimeHistogram({ projectId, kqlQuery, from, to, logType, className }: TimeHistogramProps) {
  const [data, setData] = useState<HistogramBucket[]>([])
  const [loading, setLoading] = useState(false)
  const [interval, setInterval] = useState<Interval>('auto')

  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    const fetchData = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          projectId,
          from: from.toISOString(),
          to: to.toISOString()
        })
        if (kqlQuery) params.set('q', kqlQuery)
        if (interval !== 'auto') params.set('interval', interval)
        if (logType) params.set('logType', logType)
        const res = await authenticatedFetch(`/api/logs/histogram?${params}`)
        const json = await res.json()
        if (!cancelled && json.success) setData(json.data || [])
      } catch {
        // silent — histogram is supplementary
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => {
      cancelled = true
    }
  }, [projectId, kqlQuery, from, to, logType, interval])

  const rangeMs = to.getTime() - from.getTime()

  const effectiveInterval: Interval =
    interval !== 'auto'
      ? interval
      : rangeMs <= 3_600_000
        ? 'minute'
        : rangeMs <= 172_800_000
          ? 'hour'
          : rangeMs <= 90 * 86_400_000
            ? 'day'
            : rangeMs <= 365 * 86_400_000
              ? 'week'
              : 'month'

  const formatTime = (t: string) => {
    const d = new Date(t)
    if (effectiveInterval === 'minute') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (effectiveInterval === 'hour') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (effectiveInterval === 'day') return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    if (effectiveInterval === 'week') return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    return d.toLocaleDateString([], { month: 'short', year: '2-digit' })
  }

  const chartData = data.map(d => ({
    time: formatTime(d.time),
    Count: Number(d.count)
  }))

  return (
    <div className={`flex flex-col h-full${className ? ' ' + className : ''}`}>
      <div className='flex items-center gap-2 px-4 pt-3 pb-1 flex-shrink-0'>
        <BarChart2 className='w-3.5 h-3.5 text-muted-foreground' />
        <span className='text-xs font-medium text-muted-foreground'>Log Volume</span>
        <div className='ml-auto'>
          <Select value={interval} onValueChange={v => setInterval(v as Interval)}>
            <SelectTrigger className='h-6 w-28 text-[11px] border-0 bg-transparent shadow-none px-1 focus:ring-0 focus-visible:ring-0'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value} className='text-xs'>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className='flex-1 min-h-0 px-4 pb-3'>
        {loading ? (
          <div className='flex items-center justify-center h-full'>
            <Loader className='w-4 h-4 animate-spin text-muted-foreground' />
          </div>
        ) : data.length === 0 ? (
          <div className='flex items-center justify-center h-full text-xs text-muted-foreground'>
            No data for this time range
          </div>
        ) : (
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart data={chartData} barSize={4} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray='3 3' vertical={false} stroke='hsl(var(--border))' />
              <XAxis
                dataKey='time'
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <RechartsTooltip
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px',
                  padding: '8px 12px'
                }}
                labelStyle={{ color: 'hsl(var(--foreground))', marginBottom: 4 }}
                itemStyle={{ color: 'hsl(var(--muted-foreground))' }}
              />
              <Bar dataKey='Count' fill='hsl(var(--primary))' radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
