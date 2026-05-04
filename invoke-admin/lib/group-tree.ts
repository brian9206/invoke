export interface FunctionGroup {
  id: string
  name: string // full materialized path e.g. "Backend/Auth"
  project_id: string
  sort_order: number
  project_name?: string // only present in system/all-projects view
}

export interface TreeNode {
  group: FunctionGroup
  children: TreeNode[]
  displayName: string // last segment only
  depth: number // 0 = root
  fullPath: string // same as group.name
}

/**
 * Build a nested tree from a flat list of groups that use materialized paths.
 *
 * Groups whose names contain "/" are children; e.g. "Backend/Auth" is a child
 * of "Backend". Groups at depth 0 are root-level.
 *
 * Returns only root-level TreeNodes. Each node's `children` array is sorted by
 * the child group's sort_order.
 */
export function buildGroupTree(groups: FunctionGroup[]): TreeNode[] {
  // Index all groups by their full path
  const byPath = new Map<string, TreeNode>()

  // Sort groups so parents are always processed before children
  const sorted = [...groups].sort((a, b) => {
    const depthA = a.name.split('/').length
    const depthB = b.name.split('/').length
    if (depthA !== depthB) return depthA - depthB
    return a.sort_order - b.sort_order
  })

  for (const g of sorted) {
    const segments = g.name.split('/')
    const node: TreeNode = {
      group: g,
      children: [],
      displayName: segments[segments.length - 1],
      depth: segments.length - 1,
      fullPath: g.name
    }
    byPath.set(g.name, node)
  }

  const roots: TreeNode[] = []

  for (const node of byPath.values()) {
    const lastSlash = node.fullPath.lastIndexOf('/')
    if (lastSlash === -1) {
      // Root-level
      roots.push(node)
    } else {
      const parentPath = node.fullPath.slice(0, lastSlash)
      const parent = byPath.get(parentPath)
      if (parent) {
        parent.children.push(node)
      } else {
        // Orphaned group (parent deleted?) — show at root
        roots.push(node)
      }
    }
  }

  // Sort roots and all children by sort_order
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.group.sort_order - b.group.sort_order)
    nodes.forEach(n => sortNodes(n.children))
  }
  sortNodes(roots)

  return roots
}

/**
 * Build a system-level tree where each project's groups are nested under a
 * fake root TreeNode keyed as "project:<project_id>".
 */
export function buildSystemTree(
  groups: (FunctionGroup & { project_name: string })[],
  projects: { id: string; name: string }[]
): TreeNode[] {
  const projectTrees: TreeNode[] = []

  for (const proj of projects) {
    const projGroups = groups.filter(g => g.project_id === proj.id)
    const innerTree = buildGroupTree(projGroups)

    const fakeGroup: FunctionGroup = {
      id: `project:${proj.id}`,
      name: proj.name,
      project_id: proj.id,
      sort_order: 0,
      project_name: proj.name
    }

    projectTrees.push({
      group: fakeGroup,
      children: innerTree,
      displayName: proj.name,
      depth: 0,
      fullPath: proj.name
    })
  }

  return projectTrees
}
