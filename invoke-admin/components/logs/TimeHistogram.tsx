import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { Loader, BarChart2 } from 'lucide-react'

interface HistogramBucket {
  time: string
  count: number
  error_count: number
}

interface TimeHistogramProps {
  projectId: string
  status: string
  kqlQuery: string
  from: Date
  to: Date
  /** Optional additional className for the root element */
  className?: string
}

export function TimeHistogram({ projectId, status, kqlQuery, from, to, className }: TimeHistogramProps) {
  const [data, setData] = useState<HistogramBucket[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    const fetchData = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          projectId,
          status,
          from: from.toISOString(),
          to: to.toISOString(),
        })
        if (kqlQuery) params.set('q', kqlQuery)
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
    return () => { cancelled = true }
  }, [projectId, status, kqlQuery, from, to])

  const rangeMs = to.getTime() - from.getTime()

  const formatTime = (t: string) => {
    const d = new Date(t)
    if (rangeMs <= 3_600_000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (rangeMs <= 172_800_000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const chartData = data.map(d => ({
    time: formatTime(d.time),
    Success: Math.max(0, Number(d.count) - Number(d.error_count)),
    Errors: Number(d.error_count),
  }))

  return (
    <div className={`flex flex-col h-full${className ? ' ' + className : ''}`}>
      <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground flex-shrink-0">
        <BarChart2 className="w-3.5 h-3.5" />
        Log Volume
      </div>
      <div className="flex-1 min-h-0 px-4 pb-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            No data for this time range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barSize={4} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="time"
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
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px',
                  padding: '8px 12px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))', marginBottom: 4 }}
                itemStyle={{ color: 'hsl(var(--muted-foreground))' }}
              />
              <Bar dataKey="Success" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Errors" stackId="a" fill="#ef4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
