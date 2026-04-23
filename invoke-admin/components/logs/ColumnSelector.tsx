import { useEffect, useRef, useState } from 'react'
import { Columns3, GripVertical, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import Modal from '@/components/Modal'
import { ALL_COLUMN_DEFS, getDefaultColumnKeys } from './LogRow'
import { authenticatedFetch } from '@/lib/frontend-utils'

interface DiscoveredField {
  path: string
  type: string
}

interface ColumnSelectorProps {
  selectedKeys: string[]
  onChange: (keys: string[]) => void
  projectId: string
  logType: 'request' | 'app' | 'build'
}

export function ColumnSelector({ selectedKeys, onChange, projectId, logType }: ColumnSelectorProps) {
  const [open, setOpen] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [discoveredFields, setDiscoveredFields] = useState<DiscoveredField[]>([])
  const [loadingFields, setLoadingFields] = useState(false)
  const fetchedForProject = useRef<string | null>(null)
  const dragIndex = useRef<number | null>(null)

  useEffect(() => {
    if (!open || !projectId || fetchedForProject.current === projectId) return
    let cancelled = false
    setLoadingFields(true)
    authenticatedFetch(`/api/logs/discover?projectId=${encodeURIComponent(projectId)}`)
      .then(r => r.json())
      .then(json => {
        if (!cancelled && json.success) {
          setDiscoveredFields(json.data?.fields ?? [])
          fetchedForProject.current = projectId
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingFields(false) })
    return () => { cancelled = true }
  }, [open, projectId])

  const staticPaths = new Set(ALL_COLUMN_DEFS.map(c => c.key))

  const getLabel = (key: string) => {
    const staticDef = ALL_COLUMN_DEFS.find(c => c.key === key)
    return staticDef ? staticDef.label : key
  }

  const toggle = (key: string) => {
    if (selectedKeys.includes(key)) {
      if (selectedKeys.length <= 1) return
      onChange(selectedKeys.filter(k => k !== key))
    } else {
      onChange([...selectedKeys, key])
    }
  }

  const handleDragStart = (index: number) => {
    dragIndex.current = index
  }

  const handleDrop = (targetIndex: number) => {
    if (dragIndex.current === null || dragIndex.current === targetIndex) return
    const next = [...selectedKeys]
    const [moved] = next.splice(dragIndex.current, 1)
    next.splice(targetIndex, 0, moved)
    onChange(next)
    dragIndex.current = null
  }

  const reset = () => onChange(getDefaultColumnKeys(logType))

  const dynamicSelected = selectedKeys.filter(k => !staticPaths.has(k))

  // Available (not yet selected) columns for the Command search
  const staticFields = ALL_COLUMN_DEFS.map(c => ({ path: c.key, label: c.label }))
  const dynamicFields = discoveredFields.filter(f => !staticPaths.has(f.path))
  const availableStatic = staticFields.filter(f => !selectedKeys.includes(f.path))
  const availableDynamic = dynamicFields.filter(f => !selectedKeys.includes(f.path))

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
          <Columns3 className="w-3.5 h-3.5" />
          Columns
          {dynamicSelected.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
              +{dynamicSelected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        {/* ── Active columns (draggable to reorder) ── */}
        <div className="p-2 border-b border-border">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Active columns
            </span>
            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              Reset
            </button>
          </div>
          <div className="flex flex-col gap-0.5">
            {selectedKeys.map((key, i) => (
              <div
                key={key}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(i)}
                className="flex items-center gap-1.5 px-1.5 py-1 rounded text-xs hover:bg-muted/50 cursor-grab active:cursor-grabbing group select-none"
              >
                <GripVertical className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground flex-shrink-0" />
                <span className="flex-1 truncate">{getLabel(key)}</span>
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  disabled={selectedKeys.length <= 1}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity disabled:cursor-not-allowed"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Available columns (searchable) ── */}
        <Command>
          <CommandInput placeholder="Add column..." className="h-8 text-xs" />
          <CommandList className="max-h-52">
            <CommandEmpty className="py-3 text-xs text-center text-muted-foreground">
              {loadingFields ? 'Loading...' : 'No available columns'}
            </CommandEmpty>

            {availableStatic.length > 0 && (
              <CommandGroup heading="Built-in columns">
                {availableStatic.map(f => (
                  <CommandItem
                    key={f.path}
                    value={f.path}
                    onSelect={() => toggle(f.path)}
                    className="text-xs"
                  >
                    {f.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(availableDynamic.length > 0 || loadingFields) && (
              <>
                {availableStatic.length > 0 && <CommandSeparator />}
                <CommandGroup heading="Payload fields">
                  {loadingFields && availableDynamic.length === 0 ? (
                    <CommandItem disabled className="text-xs text-muted-foreground">
                      Loading...
                    </CommandItem>
                  ) : (
                    availableDynamic.map(f => (
                      <CommandItem
                        key={f.path}
                        value={f.path}
                        onSelect={() => toggle(f.path)}
                        className="text-xs gap-2"
                      >
                        <span className="font-mono flex-1 truncate">{f.path}</span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{f.type}</span>
                      </CommandItem>
                    ))
                  )}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>

    <Modal
      isOpen={showResetModal}
      title="Reset columns to default?"
      description={`This will replace your current column selection with the default columns.`}
      confirmText="Reset"
      confirmVariant="danger"
      size="sm"
      onCancel={() => setShowResetModal(false)}
      onConfirm={() => {
        reset()
        setShowResetModal(false)
      }}
    />
    </>
  )
}
