import React, { ReactNode, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

export interface ModalProps {
  isOpen: boolean
  title: string | ReactNode
  description?: string | ReactNode
  children?: ReactNode
  onCancel?: () => void
  onConfirm?: () => void | Promise<void>
  cancelText?: string
  confirmText?: string
  confirmVariant?: 'default' | 'danger'
  loading?: boolean
  confirmDisabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  hideFooter?: boolean
  className?: string
}

export default function Modal({
  isOpen,
  title,
  description,
  children,
  onCancel,
  onConfirm,
  cancelText = 'Cancel',
  confirmText = 'Confirm',
  confirmVariant = 'default',
  loading = false,
  confirmDisabled = false,
  size = 'md',
  hideFooter = false,
  className
}: ModalProps) {
  const sizeClass = size === 'lg' ? 'sm:max-w-2xl' : size === 'sm' ? 'sm:max-w-sm' : 'sm:max-w-md'
  const [isLoading, setIsLoading] = useState(false)

  const handleConfirm = async () => {
    if (!onConfirm) return
    setIsLoading(true)
    try {
      await onConfirm()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onCancel?.()}>
      <DialogContent className={cn(sizeClass, className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription asChild={typeof description !== 'string'}>
              {typeof description === 'string' ? description : <div>{description}</div>}
            </DialogDescription>
          )}
        </DialogHeader>
        {children}
        {!hideFooter && (onCancel || onConfirm) && (
          <DialogFooter className='gap-2'>
            {onCancel && (
              <Button variant='outline' onClick={onCancel} disabled={loading || isLoading}>
                {cancelText}
              </Button>
            )}
            {onConfirm && (
              <Button
                variant={confirmVariant === 'danger' ? 'destructive' : 'default'}
                onClick={handleConfirm}
                disabled={loading || isLoading || confirmDisabled}
              >
                {confirmText}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
