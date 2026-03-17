import Link from 'next/link'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Package, Play, Pause, Trash2, ExternalLink, GripVertical } from 'lucide-react'

export interface FunctionItem {
  id: string
  name: string
  description: string
  active_version: string
  file_size: number
  is_active: boolean
  created_at: string
  last_executed: string | null
  execution_count: number
  requires_api_key: boolean
  project_id: string
  project_name: string
  user_role?: string
  group_id: string | null
  sort_order: number
}

interface FunctionCardProps {
  func: FunctionItem
  functionUrl: string
  onToggle: (id: string, isActive: boolean) => void
  onDelete: (id: string) => void
  draggable?: boolean
}

export function FunctionCard({ func, functionUrl, onToggle, onDelete, draggable = true }: FunctionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: func.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const formatDate = (d: string) => new Date(d).toLocaleString()

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="hover:bg-card/80 transition-colors">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            {/* Drag handle */}
            {draggable && (
              <button
                {...attributes}
                {...listeners}
                className="mt-1 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground focus:outline-none"
                tabIndex={0}
                aria-label="Drag to reorder"
              >
                <GripVertical className="w-4 h-4" />
              </button>
            )}

            <Link
              href={`/admin/functions/${func.id}`}
              className="flex items-start space-x-4 flex-1 min-w-0"
            >
              <div
                className={`p-3 rounded-lg shrink-0 ${
                  func.is_active
                    ? 'bg-green-900/30 text-green-400'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Package className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2">
                  <h3 className="text-base font-semibold text-foreground">{func.name}</h3>
                  <Badge variant="secondary">v{func.active_version || '1'}</Badge>
                  {func.requires_api_key && (
                    <Badge variant="warning">API Key Required</Badge>
                  )}
                  <Badge variant={func.is_active ? 'success' : 'secondary'}>
                    {func.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-sm mt-1 truncate">
                  {func.description || 'No description provided'}
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span>Executions: {func.execution_count}</span>
                  <span>Created: {formatDate(func.created_at)}</span>
                  {func.last_executed && <span>Last: {formatDate(func.last_executed)}</span>}
                </div>
              </div>
            </Link>

            <div
              className="flex items-center gap-1 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onToggle(func.id, func.is_active)}
                    className={
                      func.is_active
                        ? 'text-yellow-400 hover:bg-yellow-900/20'
                        : 'text-green-400 hover:bg-green-900/20'
                    }
                  >
                    {func.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{func.is_active ? 'Deactivate' : 'Activate'}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    className="text-blue-400 hover:bg-blue-900/20"
                  >
                    <a href={functionUrl || '#'} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Execute Function</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(func.id)}
                    className="text-red-400 hover:bg-red-900/20"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete Function</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
