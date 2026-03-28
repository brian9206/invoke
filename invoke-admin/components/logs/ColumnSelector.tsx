import { Columns3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ColumnDef, ALL_COLUMN_DEFS, DEFAULT_COLUMN_KEYS } from './LogRow'

interface ColumnSelectorProps {
  selectedKeys: string[]
  onChange: (keys: string[]) => void
}

export function ColumnSelector({ selectedKeys, onChange }: ColumnSelectorProps) {
  const toggle = (key: string) => {
    if (selectedKeys.includes(key)) {
      // Keep at least 1 column
      if (selectedKeys.length <= 1) return
      onChange(selectedKeys.filter(k => k !== key))
    } else {
      onChange([...selectedKeys, key])
    }
  }

  const reset = () => onChange(DEFAULT_COLUMN_KEYS)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
          <Columns3 className="w-3.5 h-3.5" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs">Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ALL_COLUMN_DEFS.map((col: ColumnDef) => (
          <DropdownMenuCheckboxItem
            key={col.key}
            checked={selectedKeys.includes(col.key)}
            onCheckedChange={() => toggle(col.key)}
            className="text-xs"
          >
            {col.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={false}
          onCheckedChange={reset}
          className="text-xs text-muted-foreground"
        >
          Reset to default
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
