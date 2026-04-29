import { useState, useEffect } from 'react'
import { GripVertical, Plus, Trash2, AlertCircle, CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Modal from './Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/cn'

const ipaddr = require('ipaddr.js')

interface NetworkPolicyRule {
  action: 'allow' | 'deny'
  target_type: 'ip' | 'cidr' | 'domain'
  target_value: string
  description?: string
  priority: number
  id?: string
}

interface NetworkPolicyEditorProps {
  rules: NetworkPolicyRule[]
  onChange: (rules: NetworkPolicyRule[]) => void
  onSave: () => void
  saving: boolean
  onTestConnection?: (host: string) => Promise<{ allowed: boolean; reason: string }>
  readOnly?: boolean
}

function SortableRuleRow({
  rule,
  index,
  onDelete,
  onUpdate,
  readOnly = false
}: {
  rule: NetworkPolicyRule
  index: number
  onDelete: () => void
  onUpdate: (updates: Partial<NetworkPolicyRule>) => void
  readOnly?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rule.id || `rule-${index}`
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  const [validationError, setValidationError] = useState<string>('')
  const [validationTimeout, setValidationTimeout] = useState<NodeJS.Timeout | null>(null)

  const validateTarget = (value: string, type: string) => {
    if (validationTimeout) clearTimeout(validationTimeout)

    const timeout = setTimeout(() => {
      let error = ''
      if (!value.trim()) {
        error = 'Target value is required'
      } else if (type === 'ip') {
        if (!ipaddr.isValid(value)) {
          error = 'Invalid IP address'
        } else if (ipaddr.parse(value).kind() !== 'ipv4') {
          error = 'Only IPv4 addresses are supported'
        }
      } else if (type === 'cidr') {
        try {
          const [addr] = ipaddr.parseCIDR(value)
          if (addr.kind() !== 'ipv4') {
            error = 'Only IPv4 CIDR ranges are supported'
          }
        } catch {
          error = 'Invalid CIDR notation (e.g., 192.168.0.0/16)'
        }
      } else if (type === 'domain') {
        if (!/^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(value)) {
          error = 'Invalid domain format'
        }
      }
      setValidationError(error)
    }, 500)

    setValidationTimeout(timeout)
  }

  useEffect(() => {
    validateTarget(rule.target_value, rule.target_type)
    return () => {
      if (validationTimeout) clearTimeout(validationTimeout)
    }
  }, [rule.target_value, rule.target_type])

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className='w-10'>
        <button
          {...attributes}
          {...listeners}
          disabled={readOnly}
          className={
            readOnly
              ? 'text-muted-foreground/30 cursor-not-allowed'
              : 'cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground'
          }
        >
          <GripVertical className='w-4 h-4' />
        </button>
      </TableCell>
      <TableCell className='text-muted-foreground w-12'>{index + 1}</TableCell>
      <TableCell>
        <Select
          value={rule.action}
          onValueChange={v => onUpdate({ action: v as 'allow' | 'deny' })}
          disabled={readOnly}
        >
          <SelectTrigger className='w-24 h-8'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='allow'>Allow</SelectItem>
            <SelectItem value='deny'>Deny</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Badge variant={rule.action === 'allow' ? 'success' : 'destructive'}>
          {rule.action === 'allow' ? 'Allow' : 'Deny'}
        </Badge>
      </TableCell>
      <TableCell>
        <Select
          value={rule.target_type}
          onValueChange={v => {
            onUpdate({ target_type: v as 'ip' | 'cidr' | 'domain' })
            validateTarget(rule.target_value, v)
          }}
          disabled={readOnly}
        >
          <SelectTrigger className='w-32 h-8'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ip'>IP Address</SelectItem>
            <SelectItem value='cidr'>CIDR Block</SelectItem>
            <SelectItem value='domain'>Domain</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className='space-y-1'>
          <Input
            value={rule.target_value}
            onChange={e => {
              onUpdate({ target_value: e.target.value })
              validateTarget(e.target.value, rule.target_type)
            }}
            disabled={readOnly}
            placeholder={
              rule.target_type === 'ip'
                ? '192.168.1.1'
                : rule.target_type === 'cidr'
                  ? '192.168.0.0/16'
                  : '*.example.com'
            }
            className={cn('h-8', validationError && 'border-red-500')}
          />
          {validationError && (
            <p className='text-xs text-red-400 flex items-center gap-1'>
              <AlertCircle className='w-3 h-3' />
              {validationError}
            </p>
          )}
          {rule.target_type === 'domain' && !validationError && (
            <p className='text-xs text-muted-foreground flex items-center gap-1'>
              <HelpCircle className='w-3 h-3' />
              Wildcards supported: *.example.com
            </p>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Input
          value={rule.description || ''}
          onChange={e => onUpdate({ description: e.target.value })}
          disabled={readOnly}
          placeholder='Optional description'
          className='h-8'
        />
      </TableCell>
      <TableCell className='w-12'>
        <Button
          variant='ghost'
          size='icon'
          onClick={onDelete}
          disabled={readOnly}
          className='text-red-400 hover:text-red-300 h-8 w-8'
        >
          <Trash2 className='w-4 h-4' />
        </Button>
      </TableCell>
    </TableRow>
  )
}

export default function NetworkPolicyEditor({
  rules,
  onChange,
  onSave,
  saving,
  onTestConnection,
  readOnly = false
}: NetworkPolicyEditorProps) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [testHost, setTestHost] = useState('')
  const [testResult, setTestResult] = useState<{ allowed: boolean; reason: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const rulesWithIds = rules.map((rule, index) => ({
    ...rule,
    id: rule.id || `rule-${index}`
  }))

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = rulesWithIds.findIndex(r => r.id === active.id)
      const newIndex = rulesWithIds.findIndex(r => r.id === over.id)
      const reordered = arrayMove(rulesWithIds, oldIndex, newIndex)
      onChange(reordered.map((rule, index) => ({ ...rule, priority: index + 1 })))
    }
  }

  const handleAddRule = () => {
    const newRule: NetworkPolicyRule = {
      action: 'allow',
      target_type: 'cidr',
      target_value: '',
      description: '',
      priority: rules.length + 1,
      id: `rule-${Date.now()}`
    }
    onChange([...rules, newRule])
    setShowAddModal(false)
  }

  const handleDeleteRule = (index: number) => {
    const updated = rules.filter((_, i) => i !== index)
    onChange(updated.map((rule, i) => ({ ...rule, priority: i + 1 })))
  }

  const handleUpdateRule = (index: number, updates: Partial<NetworkPolicyRule>) => {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...updates } : rule)))
  }

  const handleTestConnection = async () => {
    if (!onTestConnection || !testHost.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await onTestConnection(testHost)
      setTestResult(result)
    } catch (err) {
      setTestResult({
        allowed: false,
        reason: 'Test failed: ' + (err instanceof Error ? err.message : String(err))
      })
    } finally {
      setTesting(false)
    }
  }

  const hasValidationErrors = rulesWithIds.some(rule => !rule.target_value.trim())

  return (
    <div className='space-y-6'>
      {rules.length === 0 && (
        <Card className='border-red-800 bg-red-900/10'>
          <CardContent className='pt-4 flex items-start gap-3'>
            <AlertCircle className='w-5 h-5 text-red-400 flex-shrink-0 mt-0.5' />
            <div className='text-sm'>
              <p className='text-red-400 font-medium'>At least one policy rule is required</p>
              <p className='text-red-300 mt-1'>
                Without any rules, all network connections will be blocked by default.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <div className='px-6 py-4 border-b border-border flex items-center justify-between'>
          <h3 className='text-base font-semibold text-foreground'>Network Policy Rules</h3>
          {!readOnly && (
            <Button size='sm' onClick={() => setShowAddModal(true)}>
              <Plus className='w-4 h-4 mr-2' />
              Add Rule
            </Button>
          )}
        </div>

        {rules.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={rulesWithIds.map(r => r.id!)} strategy={verticalListSortingStrategy}>
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-10'></TableHead>
                      <TableHead className='w-16'>Priority</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Badge</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className='w-12'></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rulesWithIds.map((rule, index) => (
                      <SortableRuleRow
                        key={rule.id}
                        rule={rule}
                        index={index}
                        onDelete={() => handleDeleteRule(index)}
                        onUpdate={updates => handleUpdateRule(index, updates)}
                        readOnly={readOnly}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <CardContent className='py-8 text-center text-muted-foreground'>
            No policy rules configured. Click &quot;Add Rule&quot; to get started.
          </CardContent>
        )}
      </Card>

      {onTestConnection && (
        <Card>
          <CardContent className='pt-6'>
            <h3 className='text-base font-semibold text-foreground mb-4'>Test Connection</h3>
            <div className='flex gap-3'>
              <Input
                value={testHost}
                onChange={e => setTestHost(e.target.value)}
                placeholder='Enter hostname or IP (e.g., example.com, 8.8.8.8)'
                onKeyPress={e => e.key === 'Enter' && handleTestConnection()}
              />
              <Button variant='outline' onClick={handleTestConnection} disabled={testing || !testHost.trim()}>
                {testing ? 'Testing...' : 'Test'}
              </Button>
            </div>
            {testResult && (
              <div
                className={cn(
                  'mt-3 p-3 rounded-lg flex items-start gap-2 border',
                  testResult.allowed ? 'bg-green-900/20 border-green-800' : 'bg-red-900/20 border-red-800'
                )}
              >
                {testResult.allowed ? (
                  <CheckCircle2 className='w-5 h-5 text-green-400 flex-shrink-0 mt-0.5' />
                ) : (
                  <XCircle className='w-5 h-5 text-red-400 flex-shrink-0 mt-0.5' />
                )}
                <div className='text-sm'>
                  <p className={testResult.allowed ? 'text-green-400' : 'text-red-400'}>
                    <span className='font-medium'>
                      {testResult.allowed ? 'Connection Allowed' : 'Connection Blocked'}
                    </span>
                  </p>
                  <p className='text-muted-foreground mt-1'>{testResult.reason}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!readOnly && (
        <div className='flex items-center justify-end gap-3'>
          {rules.length === 0 && <p className='text-sm text-red-400'>Cannot save without at least one rule</p>}
          <Button onClick={onSave} disabled={saving || rules.length === 0 || hasValidationErrors}>
            {saving ? 'Saving...' : 'Save Policy'}
          </Button>
        </div>
      )}

      <Modal
        isOpen={showAddModal}
        title='Add New Rule'
        description='A new rule will be added at the end. You can reorder it by dragging after saving.'
        onCancel={() => setShowAddModal(false)}
        onConfirm={handleAddRule}
        confirmText='Add Rule'
      />
    </div>
  )
}
