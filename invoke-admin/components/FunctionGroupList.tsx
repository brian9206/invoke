import { useState, useRef, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  FolderOpen,
} from 'lucide-react'
import { authenticatedFetch } from '@/lib/frontend-utils'
import { FunctionCard, FunctionItem } from '@/components/FunctionCard'
import { buildGroupTree, TreeNode, FunctionGroup } from '@/lib/group-tree'

export type { FunctionGroup }

const MAX_DEPTH = 4 // 0-indexed max: allows depths 0–4 (5 levels total)

interface FunctionGroupListProps {
  functions: FunctionItem[]
  groups: FunctionGroup[]
  projectId: string
  functionUrls: Record<string, string>
  canWrite: boolean
  onFunctionsChange: (functions: FunctionItem[]) => void
  onGroupsChange: (groups: FunctionGroup[]) => void
  onGroupsRefresh: () => Promise<void>
  onToggleFunction: (id: string, isActive: boolean) => void
  onDeleteFunction: (id: string) => void
}

// ── Recursive Group Tree Node ─────────────────────────────────────────────────

interface GroupTreeNodeProps {
  node: TreeNode
  allFunctions: FunctionItem[]
  functionUrls: Record<string, string>
  canWrite: boolean
  projectId: string
  isSystemView: boolean
  openGroups: Record<string, boolean>
  toggleGroupOpen: (id: string) => void
  onRename: (id: string, newSegment: string) => Promise<void>
  onGroupCreated: (group: FunctionGroup) => void
  onDelete: (node: TreeNode) => void
  onToggleFunction: (id: string, isActive: boolean) => void
  onDeleteFunction: (id: string) => void
}

function GroupTreeNode({
  node,
  allFunctions,
  functionUrls,
  canWrite,
  projectId,
  isSystemView,
  openGroups,
  toggleGroupOpen,
  onRename,
  onGroupCreated,
  onDelete,
  onToggleFunction,
  onDeleteFunction,
}: GroupTreeNodeProps) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editError, setEditError] = useState('')
  const [addingSubGroup, setAddingSubGroup] = useState(false)
  const [subGroupName, setSubGroupName] = useState('')
  const [subGroupSaving, setSubGroupSaving] = useState(false)
  const editRef = useRef<HTMLInputElement>(null)
  const subGroupRef = useRef<HTMLInputElement>(null)

  const isProjectFake = node.group.id.startsWith('project:')
  const isOpen = openGroups[node.group.id] !== false

  const { attributes, listeners, setNodeRef: setSortRef, transform, transition, isDragging } =
    useSortable({
      id: `group:${node.group.id}`,
      data: { type: 'group', node },
      disabled: !canWrite || isProjectFake,
    })

  const { setNodeRef: setDropRef, isOver: isDropOver } = useDroppable({
    id: `nest:${node.group.id}`,
    data: { type: 'nest', node },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const functionsInGroup = allFunctions
    .filter((f) => f.group_id === node.group.id)
    .sort((a, b) => a.sort_order - b.sort_order)

  const indent = node.depth * 24

  const startEdit = () => {
    setEditName(node.displayName)
    setEditError('')
    setEditing(true)
    setTimeout(() => editRef.current?.focus(), 0)
  }

  const cancelEdit = () => { setEditing(false); setEditError('') }

  const commitEdit = async () => {
    const trimmed = editName.trim()
    if (!trimmed) { cancelEdit(); return }
    if (trimmed.includes('/')) { setEditError('Group name cannot contain /'); return }
    if (trimmed === node.displayName) { cancelEdit(); return }
    await onRename(node.group.id, trimmed)
    setEditing(false)
    setEditError('')
  }

  const openSubGroupAdd = () => {
    setSubGroupName('')
    setAddingSubGroup(true)
    setTimeout(() => subGroupRef.current?.focus(), 0)
  }

  const cancelSubGroup = () => { setAddingSubGroup(false); setSubGroupName('') }

  const saveSubGroup = async () => {
    const trimmed = subGroupName.trim()
    if (!trimmed || subGroupSaving) return
    setSubGroupSaving(true)
    try {
      const res = await authenticatedFetch(
        `/api/function-groups?projectId=${encodeURIComponent(projectId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed, parentPath: node.fullPath }),
        }
      )
      const data = await res.json()
      if (data.success) {
        onGroupCreated(data.data)
        setSubGroupName('')
        setAddingSubGroup(false)
      }
    } finally {
      setSubGroupSaving(false)
    }
  }

  return (
    <div ref={setSortRef} style={style}>
      {/* Group header */}
      <div
        ref={setDropRef}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border group/header transition-colors ${
          isDropOver && canWrite
            ? 'bg-primary/10 border-primary/40'
            : 'bg-muted/40 border-border/50'
        }`}
        style={{ marginLeft: indent }}
      >
        {canWrite && !isProjectFake && (
          <button
            {...attributes}
            {...listeners}
            className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground focus:outline-none"
            aria-label="Drag group"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}

        {isProjectFake && (
          <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
        )}

        <button
          onClick={() => toggleGroupOpen(node.group.id)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          )}

          {editing ? (
            <span className="flex flex-col flex-1 gap-1" onClick={(e) => e.stopPropagation()}>
              <span className="flex items-center gap-1">
                <Input
                  ref={editRef}
                  value={editName}
                  onChange={(e) => { setEditName(e.target.value); setEditError('') }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit()
                    if (e.key === 'Escape') cancelEdit()
                  }}
                  className="h-7 text-sm py-0"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={commitEdit}
                  disabled={!editName.trim()}
                >
                  <Check className="w-3.5 h-3.5 text-green-400" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={cancelEdit}
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </span>
              {editError && (
                <span className="text-xs text-red-400 pl-1">{editError}</span>
              )}
            </span>
          ) : (
            <span className="font-medium text-sm text-foreground truncate">
              {node.displayName}
            </span>
          )}

          {!editing && (
            <span className="ml-1 text-xs text-muted-foreground shrink-0">
              ({functionsInGroup.length})
            </span>
          )}
        </button>

        {canWrite && !editing && !isProjectFake && (
          <div className="flex items-center gap-1">
            {node.depth < MAX_DEPTH && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Add sub-group"
                onClick={openSubGroupAdd}
              >
                <Plus className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={startEdit}>
              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(node)}>
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </Button>
          </div>
        )}
      </div>

      {/* Sub-group creation input */}
      {addingSubGroup && (
        <div
          className="flex items-center gap-2 px-3 py-2 mt-1 rounded-lg border border-primary/30 bg-muted/20"
          style={{ marginLeft: indent + 24 }}
        >
          <Input
            ref={subGroupRef}
            placeholder="Sub-group name…"
            value={subGroupName}
            onChange={(e) => setSubGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveSubGroup()
              if (e.key === 'Escape') cancelSubGroup()
            }}
            className="h-7 text-sm"
            disabled={subGroupSaving}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={saveSubGroup}
            disabled={subGroupSaving || !subGroupName.trim()}
          >
            <Check className="w-3.5 h-3.5 text-green-400" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={cancelSubGroup}
            disabled={subGroupSaving}
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </div>
      )}

      {/* Group body: functions first, then subgroups */}
      {isOpen && (
        <div className="mt-1 space-y-1">
          {/* Only render the function drop area when the group has direct functions,
              or when it has no children (so the "Empty group" hint is visible).
              This prevents a blank min-h gap between the header and nested subgroups. */}
          {!isProjectFake && (functionsInGroup.length > 0 || node.children.length === 0) && (
            <SortableContext
              items={functionsInGroup.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div
                className="space-y-2 min-h-[2rem] rounded-lg transition-colors"
                style={{ marginLeft: indent + 24 }}
              >
                {functionsInGroup.length > 0 ? (
                  functionsInGroup.map((func) => (
                    <FunctionCard
                      key={func.id}
                      func={func}
                      functionUrl={functionUrls[func.id] || ''}
                      onToggle={onToggleFunction}
                      onDelete={onDeleteFunction}
                      draggable={canWrite}
                    />
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    {canWrite ? 'Empty group. Drag functions here' : 'Empty group'}
                  </p>
                )}
              </div>
            </SortableContext>
          )}

          {node.children.length > 0 && (
            <SortableContext
              items={node.children.map((c) => `group:${c.group.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {node.children.map((child) => (
                <GroupTreeNode
                  key={child.group.id}
                  node={child}
                  allFunctions={allFunctions}
                  functionUrls={functionUrls}
                  canWrite={canWrite}
                  projectId={projectId}
                  isSystemView={isSystemView}
                  openGroups={openGroups}
                  toggleGroupOpen={toggleGroupOpen}
                  onRename={onRename}
                  onGroupCreated={onGroupCreated}
                  onDelete={onDelete}
                  onToggleFunction={onToggleFunction}
                  onDeleteFunction={onDeleteFunction}
                />
              ))}
            </SortableContext>
          )}

          {/* Per-project ungrouped section shown inside fake project roots */}
          {isProjectFake && isSystemView && (() => {
            const projectUngrouped = allFunctions
              .filter((f) => f.group_id === null && f.project_id === node.group.project_id)
              .sort((a, b) => a.sort_order - b.sort_order)
            if (projectUngrouped.length === 0) return null
            return (
              <div style={{ marginLeft: indent + 24 }}>
                <UngroupedSection
                  functions={projectUngrouped}
                  functionUrls={functionUrls}
                  canWrite={false}
                  droppableId={`ungrouped:${node.group.project_id}`}
                  onToggleFunction={onToggleFunction}
                  onDeleteFunction={onDeleteFunction}
                />
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ── Ungrouped droppable section ───────────────────────────────────────────────

function UngroupedSection({
  functions,
  functionUrls,
  canWrite,
  droppableId = 'ungrouped',
  onToggleFunction,
  onDeleteFunction,
}: {
  functions: FunctionItem[]
  functionUrls: Record<string, string>
  canWrite: boolean
  droppableId?: string
  onToggleFunction: (id: string, isActive: boolean) => void
  onDeleteFunction: (id: string) => void
}) {
  const [isOpen, setIsOpen] = useState(true)
  // The ref goes on the outer wrapper so both the header and the content area
  // act as a drop target — this lets groups be dragged onto "Ungrouped" too.
  const { setNodeRef, isOver } = useDroppable({ id: droppableId })

  return (
    <div ref={setNodeRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center gap-2 px-3 py-2 w-full text-left rounded-lg border border-dashed transition-colors ${
          isOver && canWrite
            ? 'bg-primary/10 border-primary/40'
            : 'bg-muted/20 border-border/50 hover:bg-muted/30'
        }`}
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="text-sm text-muted-foreground">Ungrouped</span>
        <span className="text-xs text-muted-foreground">({functions.length})</span>
      </button>

      {isOpen && (
        <div
          className={`mt-2 space-y-2 min-h-[2rem] rounded-lg transition-colors ${
            isOver ? 'bg-primary/5 ring-1 ring-primary/30' : ''
          }`}
        >
          {functions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">
              No ungrouped functions
            </p>
          ) : (
            <SortableContext
              items={functions.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              {functions.map((func) => (
                <FunctionCard
                  key={func.id}
                  func={func}
                  functionUrl={functionUrls[func.id] || ''}
                  onToggle={onToggleFunction}
                  onDelete={onDeleteFunction}
                  draggable={canWrite}
                />
              ))}
            </SortableContext>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add Group row (root level — allows `/` for nested path creation) ──────────

function AddGroupRow({
  projectId,
  onCreated,
}: {
  projectId: string
  onCreated: (group: FunctionGroup) => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const open = () => {
    setAdding(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const cancel = () => { setAdding(false); setName('') }

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      const res = await authenticatedFetch(
        `/api/function-groups?projectId=${encodeURIComponent(projectId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed }),
        }
      )
      const data = await res.json()
      if (data.success) {
        onCreated(data.data)
        setName('')
        setAdding(false)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!adding) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={open}
        className="text-muted-foreground w-full justify-start gap-2"
      >
        <Plus className="w-4 h-4" />
        Add Group
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-muted/20">
      <Input
        ref={inputRef}
        placeholder="Group name (use / for sub-groups)…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') cancel()
        }}
        className="h-7 text-sm"
        disabled={saving}
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={save}
        disabled={saving || !name.trim()}
      >
        <Check className="w-3.5 h-3.5 text-green-400" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={cancel}
        disabled={saving}
      >
        <X className="w-3.5 h-3.5 text-muted-foreground" />
      </Button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function FunctionGroupList({
  functions,
  groups,
  projectId,
  functionUrls,
  canWrite,
  onFunctionsChange,
  onGroupsChange,
  onGroupsRefresh,
  onToggleFunction,
  onDeleteFunction,
}: FunctionGroupListProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [activeDragGroupNode, setActiveDragGroupNode] = useState<TreeNode | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const isSystemView = projectId === 'system'
  const tree = buildGroupTree(groups)
  const ungrouped = functions
    .filter((f) => !f.group_id)
    .sort((a, b) => a.sort_order - b.sort_order)

  const toggleGroupOpen = (id: string) =>
    setOpenGroups((prev) => ({ ...prev, [id]: prev[id] !== false ? false : true }))

  // ── Helpers ────────────────────────────────────────────────────────────────

  const findNode = useCallback(
    (id: string): TreeNode | null => {
      const search = (nodes: TreeNode[]): TreeNode | null => {
        for (const n of nodes) {
          if (n.group.id === id) return n
          const found = search(n.children)
          if (found) return found
        }
        return null
      }
      return search(tree)
    },
    [tree]
  )

  const parentPathOf = (fullPath: string) => {
    const i = fullPath.lastIndexOf('/')
    return i === -1 ? '' : fullPath.slice(0, i)
  }

  const siblingsOf = useCallback(
    (fullPath: string): FunctionGroup[] => {
      const parent = parentPathOf(fullPath)
      return groups
        .filter((g) => parentPathOf(g.name) === parent)
        .sort((a, b) => a.sort_order - b.sort_order)
    },
    [groups]
  )

  // ── Persist reorder to API ─────────────────────────────────────────────────

  const saveReorder = useCallback(
    async (
      updatedGroups: { id: string; sort_order: number; parentPath?: string | null }[],
      updatedFunctions: { id: string; group_id: string | null; sort_order: number }[]
    ) => {
      try {
        await authenticatedFetch(
          `/api/function-groups/reorder?projectId=${encodeURIComponent(projectId)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groups: updatedGroups, functions: updatedFunctions }),
          }
        )
      } catch (e) {
        console.error('Failed to save reorder', e)
      }
    },
    [projectId]
  )

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    setActiveDragId(id)
    if (id.startsWith('group:')) {
      // Grab the node from the drag data so we can render a compact overlay
      const data = event.active.data.current as { type: string; node: TreeNode } | undefined
      setActiveDragGroupNode(data?.node ?? null)
    } else {
      setActiveDragGroupNode(null)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragId(null)
    setActiveDragGroupNode(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)

    // ── Group dragged onto a nest target (reparent) ──────────────────────────
    if (activeId.startsWith('group:') && overId.startsWith('nest:')) {
      const activeGroupId = activeId.replace('group:', '')
      const nestGroupId = overId.replace('nest:', '')
      if (activeGroupId === nestGroupId) return

      const activeNode = findNode(activeGroupId)
      const nestNode = findNode(nestGroupId)
      if (!activeNode || !nestNode) return

      // Prevent nesting inside a descendant (cycle guard)
      if (
        nestNode.fullPath === activeNode.fullPath ||
        nestNode.fullPath.startsWith(activeNode.fullPath + '/')
      ) return

      await saveReorder([{ id: activeGroupId, sort_order: 0, parentPath: nestNode.fullPath }], [])
      await onGroupsRefresh()
      return
    }

    // ── Group dragged onto Ungrouped (delete group + ungroup its functions) ───
    if (activeId.startsWith('group:') && (overId === 'ungrouped' || overId.startsWith('ungrouped:'))) {
      const activeGroupId = activeId.replace('group:', '')
      const activeNode = findNode(activeGroupId)
      if (!activeNode) return
      try {
        const res = await authenticatedFetch(`/api/function-groups/${activeGroupId}`, {
          method: 'DELETE',
        })
        const data = await res.json()
        if (data.success) {
          const nodePath = activeNode.fullPath
          const deletedIds = new Set(
            groups
              .filter((g) => g.name === nodePath || g.name.startsWith(nodePath + '/'))
              .map((g) => g.id)
          )
          onGroupsChange(groups.filter((g) => !deletedIds.has(g.id)))
          onFunctionsChange(
            functions.map((f) =>
              f.group_id && deletedIds.has(f.group_id) ? { ...f, group_id: null } : f
            )
          )
        }
      } catch (e) {
        console.error('Failed to delete group on drop to ungrouped', e)
      }
      return
    }

    // ── Group dragged to reorder among siblings ──────────────────────────────
    if (activeId.startsWith('group:') && overId.startsWith('group:')) {
      const activeGroupId = activeId.replace('group:', '')
      const overGroupId = overId.replace('group:', '')

      const activeGroup = groups.find((g) => g.id === activeGroupId)
      const overGroup = groups.find((g) => g.id === overGroupId)
      if (!activeGroup || !overGroup) return

      if (parentPathOf(activeGroup.name) !== parentPathOf(overGroup.name)) return

      const siblings = siblingsOf(activeGroup.name)
      const oldIdx = siblings.findIndex((g) => g.id === activeGroupId)
      const newIdx = siblings.findIndex((g) => g.id === overGroupId)
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return

      const reordered = arrayMove(siblings, oldIdx, newIdx).map((g, i) => ({
        ...g,
        sort_order: i,
      }))
      onGroupsChange(groups.map((g) => reordered.find((r) => r.id === g.id) || g))
      await saveReorder(
        reordered.map((g) => ({ id: g.id, sort_order: g.sort_order })),
        []
      )
      return
    }

    // ── Function dragged ─────────────────────────────────────────────────────
    if (!activeId.startsWith('group:')) {
      const funcId = activeId
      let destGroupId: string | null = null

      if (overId === 'ungrouped') {
        destGroupId = null
      } else if (overId.startsWith('nest:')) {
        destGroupId = overId.replace('nest:', '')
      } else if (overId.startsWith('group:')) {
        destGroupId = overId.replace('group:', '')
      } else {
        const overFunc = functions.find((f) => f.id === overId)
        destGroupId = overFunc ? overFunc.group_id : null
      }

      const sourceFunc = functions.find((f) => f.id === funcId)
      if (!sourceFunc) return

      let newFunctions = functions.map((f) =>
        f.id === funcId ? { ...f, group_id: destGroupId } : f
      )

      const destList = newFunctions
        .filter((f) => f.group_id === destGroupId)
        .sort((a, b) => a.sort_order - b.sort_order)

      if (!overId.startsWith('group:') && !overId.startsWith('nest:') && overId !== 'ungrouped') {
        const destIds = destList.map((f) => f.id)
        const oldIdx2 = destIds.indexOf(funcId)
        const newIdx2 = destIds.indexOf(overId)
        if (oldIdx2 !== -1 && newIdx2 !== -1 && oldIdx2 !== newIdx2) {
          const reorderedDest = arrayMove(destList, oldIdx2, newIdx2).map((f, i) => ({
            ...f,
            sort_order: i,
          }))
          newFunctions = newFunctions.map((f) => reorderedDest.find((r) => r.id === f.id) || f)
        } else {
          newFunctions = newFunctions.map((f) => {
            const idx = destList.findIndex((d) => d.id === f.id)
            return idx !== -1 ? { ...f, sort_order: idx } : f
          })
        }
      } else {
        const maxSortOrder = destList.reduce((m, f) => Math.max(m, f.sort_order), -1)
        newFunctions = newFunctions.map((f) =>
          f.id === funcId ? { ...f, sort_order: maxSortOrder + 1 } : f
        )
      }

      onFunctionsChange(newFunctions)
      await saveReorder(
        [],
        newFunctions.map((f) => ({ id: f.id, group_id: f.group_id, sort_order: f.sort_order }))
      )
      return
    }
  }

  // ── Group rename ──────────────────────────────────────────────────────────────

  const handleRename = async (id: string, newSegment: string) => {
    try {
      const res = await authenticatedFetch(`/api/function-groups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSegment }),
      })
      const data = await res.json()
      if (data.success) {
        await onGroupsRefresh()
      }
    } catch (e) {
      console.error('Failed to rename group', e)
    }
  }

  // ── Delete group ──────────────────────────────────────────────────────────────

  const handleDeleteGroup = async (node: TreeNode) => {
    try {
      const res = await authenticatedFetch(`/api/function-groups/${node.group.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        const nodePath = node.fullPath
        const deletedIds = new Set(
          groups
            .filter((g) => g.name === nodePath || g.name.startsWith(nodePath + '/'))
            .map((g) => g.id)
        )
        onGroupsChange(groups.filter((g) => !deletedIds.has(g.id)))
        onFunctionsChange(
          functions.map((f) =>
            f.group_id && deletedIds.has(f.group_id) ? { ...f, group_id: null } : f
          )
        )
      }
    } catch (e) {
      console.error('Failed to delete group', e)
    }
  }

  const handleGroupCreated = (_newGroup: FunctionGroup) => {
    onGroupsRefresh()
  }

  const activeDragFunc =
    activeDragId && !activeDragId.startsWith('group:')
      ? functions.find((f) => f.id === activeDragId)
      : null

  return (
    <TooltipProvider>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-3">
          <SortableContext
            items={tree.map((n) => `group:${n.group.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {tree.map((node) => (
              <GroupTreeNode
                key={node.group.id}
                node={node}
                allFunctions={functions}
                functionUrls={functionUrls}
                canWrite={canWrite}
                projectId={projectId}
                isSystemView={isSystemView}
                openGroups={openGroups}
                toggleGroupOpen={toggleGroupOpen}
                onRename={handleRename}
                onGroupCreated={handleGroupCreated}
                onDelete={handleDeleteGroup}
                onToggleFunction={onToggleFunction}
                onDeleteFunction={onDeleteFunction}
              />
            ))}
          </SortableContext>

          {!isSystemView && (
            <UngroupedSection
              functions={ungrouped}
              functionUrls={functionUrls}
              canWrite={canWrite}
              onToggleFunction={onToggleFunction}
              onDeleteFunction={onDeleteFunction}
            />
          )}

          {canWrite && (
            <AddGroupRow
              projectId={projectId}
              onCreated={handleGroupCreated}
            />
          )}
        </div>

        <DragOverlay>
          {activeDragGroupNode ? (
            // Compact header-only overlay so the collision detection rect
            // matches the cursor position (not the whole group including children)
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card border-border shadow-lg pointer-events-none">
              <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm text-foreground">{activeDragGroupNode.displayName}</span>
            </div>
          ) : activeDragFunc ? (
            <FunctionCard
              func={activeDragFunc}
              functionUrl={functionUrls[activeDragFunc.id] || ''}
              onToggle={() => {}}
              onDelete={() => {}}
              draggable={false}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </TooltipProvider>
  )
}
