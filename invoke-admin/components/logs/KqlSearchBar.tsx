import { KeyboardEvent, useState, useEffect } from 'react'
import { Search, X, HelpCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface KqlSearchBarProps {
  onSearch: (value: string) => void
  initialValue?: string
}

const HELP_EXAMPLES = [
  { syntax: 'response.status:200', desc: 'Exact field match' },
  { syntax: 'response.status >= 400', desc: 'Numeric comparison' },
  { syntax: 'request.method:GET AND response.status:200', desc: 'Boolean AND' },
  { syntax: 'request.method:GET OR request.method:POST', desc: 'Boolean OR' },
  { syntax: 'error:*timeout*', desc: 'Wildcard match' },
  { syntax: 'NOT response.status:200', desc: 'Negation' },
  { syntax: '(response.status >= 500) AND request.ip:192.*', desc: 'Grouped expression' }
]

export function KqlSearchBar({ onSearch, initialValue = '' }: KqlSearchBarProps) {
  const [input, setInput] = useState(initialValue)

  // Sync external changes (e.g., when parent clears filters)
  useEffect(() => {
    setInput(initialValue)
  }, [initialValue])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch(input)
    }
    if (e.key === 'Escape') {
      const cleared = ''
      setInput(cleared)
      onSearch(cleared)
    }
  }

  const handleClear = () => {
    setInput('')
    onSearch('')
  }

  return (
    <div className='flex items-center gap-2 flex-1 min-w-0'>
      <div className='relative flex-1 min-w-0'>
        <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none' />
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Input KQL query to search logs...'
          className='pl-9 pr-9 font-mono text-sm h-9'
        />
        {input && (
          <button
            type='button'
            onClick={handleClear}
            className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors'
            aria-label='Clear search'
          >
            <X className='w-4 h-4' />
          </button>
        )}
      </div>

      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant='ghost' size='icon' className='flex-shrink-0 w-9 h-9' tabIndex={-1}>
              <HelpCircle className='w-4 h-4 text-muted-foreground' />
            </Button>
          </TooltipTrigger>
          <TooltipContent side='bottom' className='w-[26rem] max-w-[90vw] p-4' align='end'>
            <p className='text-xs font-semibold mb-3 text-foreground'>KQL Syntax</p>
            <div className='space-y-2'>
              {HELP_EXAMPLES.map(ex => (
                <div key={ex.syntax} className='flex flex-col gap-0.5 text-xs'>
                  <code className='text-primary font-mono break-all'>{ex.syntax}</code>
                  <span className='text-muted-foreground'>{ex.desc}</span>
                </div>
              ))}
            </div>
            <p className='text-xs text-muted-foreground mt-3 pt-2 border-t border-border'>
              Press <kbd className='px-1 py-0.5 rounded bg-muted font-mono text-[10px]'>Enter</kbd> to search
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
