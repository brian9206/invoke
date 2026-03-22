import { Input } from '@/components/ui/input'

/**
 * Parse a memory string into MB, aligned down to the nearest 256 MB boundary.
 * Accepts: "512", "512M", "0.5G", "1.1G", etc.
 * Returns null for empty input, NaN for unparseable input.
 */
export function parseMemoryMb(raw: string): number | null {
  if (!raw.trim()) return null
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*([MmGg]?)$/)
  if (!m) return NaN
  const num = parseFloat(m[1])
  const unit = m[2].toUpperCase()
  const rawMb = unit === 'G' ? num * 1024 : num
  const aligned = Math.floor(rawMb / 256) * 256
  return aligned < 256 ? 256 : aligned
}

/** Format an MB value to the most readable form (e.g. 1024 → "1G", 1536 → "1.5G", 512 → "512M"). */
export function formatMemoryMb(mb: number): string {
  if (mb >= 1024) {
    const g = mb / 1024
    // Use at most 2 decimal places, strip trailing zeros
    return `${parseFloat(g.toFixed(2))}G`
  }
  return `${mb}M`
}

interface MemoryInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

/**
 * Text input for memory values with suffix support and on-blur normalization.
 * Accepts free-form input like "512", "512M", "0.5G", "1.1G".
 * On blur, normalizes to the nearest 256 MB boundary and formats with a suffix.
 */
export function MemoryInput({ value, onChange, placeholder = 'e.g. 512M or 1G', className }: MemoryInputProps) {
  return (
    <Input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        const mb = parseMemoryMb(e.target.value)
        if (mb !== null && !isNaN(mb)) {
          onChange(formatMemoryMb(mb))
        }
      }}
      placeholder={placeholder}
      className={className}
    />
  )
}
