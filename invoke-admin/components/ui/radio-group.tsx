import * as React from 'react'
import { cn } from '@/lib/cn'

const RadioGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} role='radiogroup' className={cn('grid gap-2', className)} {...props} />
  )
)
RadioGroup.displayName = 'RadioGroup'

interface RadioGroupItemProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string
}

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(({ className, id, ...props }, ref) => (
  <input
    ref={ref}
    type='radio'
    id={id}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded-full border border-primary text-primary ring-offset-background',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'accent-primary',
      className
    )}
    {...props}
  />
))
RadioGroupItem.displayName = 'RadioGroupItem'

export { RadioGroup, RadioGroupItem }
