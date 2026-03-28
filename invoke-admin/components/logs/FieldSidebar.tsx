import { useEffect, useState } from 'react'
import { Plus, ChevronDown, ChevronRight, X } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { cn } from '@/lib/cn'

interface FieldValue {
  value: string
  count: number
  percentage: number
}

interface FieldStat {
  name: string
  type: string
  topValues: FieldValue[]
}

interface FieldSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  status: string
  kqlQuery: string
  onClickFilter: (field: string, value: string) => void
}

export function FieldSidebar({
  open,
  onOpenChange,
  projectId,
  status,
  kqlQuery,
  onClickFilter,
}: FieldSidebarProps) {
  const [fields, setFields] = useState<FieldStat[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open || !projectId) return
    let cancelled = false

    const fetchFields = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ projectId, status })
        if (kqlQuery) params.set('q', kqlQuery)
        const res = await authenticatedFetch(`/api/logs/fields?${params}`)
        const json = await res.json()
        if (!cancelled && json.success) {
          setFields(json.data?.fields ?? [])
          // Auto-expand all fields initially
          setExpandedFields(new Set(json.data?.fields?.map((f: FieldStat) => f.name) ?? []))
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchFields()
    return () => { cancelled = true }
  }, [open, projectId, status, kqlQuery])

  const toggleField = (name: string) => {
    setExpandedFields(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-72 p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border flex-shrink-0">
          <SheetTitle className="text-sm">Fields</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              ))}
            </div>
          ) : fields.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground text-center mt-4">
              No field data available
            </p>
          ) : (
            <div className="divide-y divide-border">
              {fields.map(field => (
                <Collapsible
                  key={field.name}
                  open={expandedFields.has(field.name)}
                  onOpenChange={() => toggleField(field.name)}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-muted/50 transition-colors text-left">
                    <span className="text-xs font-mono font-medium text-foreground truncate">
                      {field.name}
                    </span>
                    {expandedFields.has(field.name) ? (
                      <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0 ml-1" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0 ml-1" />
                    )}
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    {field.topValues.length === 0 ? (
                      <p className="px-4 pb-2 text-xs text-muted-foreground">No values found</p>
                    ) : (
                      <div className="px-4 pb-3 space-y-1.5">
                        {field.topValues.map(tv => (
                          <div key={tv.value} className="group flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onClickFilter(field.name, tv.value)}
                              className="flex items-center gap-2 flex-1 min-w-0 text-left hover:text-primary transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                  <span className="text-xs font-mono truncate text-foreground">
                                    {tv.value}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                    {tv.count}
                                  </span>
                                </div>
                                <div className="h-1 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-primary/60 transition-all"
                                    style={{ width: `${Math.max(2, tv.percentage)}%` }}
                                  />
                                </div>
                              </div>
                              <Plus className="w-3 h-3 text-muted-foreground group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all flex-shrink-0" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
