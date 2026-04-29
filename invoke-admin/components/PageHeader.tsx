import React from 'react'

interface PageHeaderProps {
  title: string | React.ReactNode
  subtitle: string
  icon?: React.ReactNode
  children?: React.ReactNode
}

export default function PageHeader({ title, subtitle, icon, children }: PageHeaderProps) {
  return (
    <div className='flex items-start justify-between gap-4'>
      <div className='space-y-1'>
        <h1 className='text-2xl font-bold tracking-tight text-foreground flex items-center gap-2'>
          {icon && <span className='text-muted-foreground'>{icon}</span>}
          {title}
        </h1>
        <p className='text-sm text-muted-foreground'>{subtitle}</p>
      </div>
      {children && <div className='flex items-center gap-2 shrink-0'>{children}</div>}
    </div>
  )
}
