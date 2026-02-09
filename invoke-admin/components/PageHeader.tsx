import React from 'react'

interface PageHeaderProps {
  title: string
  subtitle: string
  icon?: React.ReactNode
  children?: React.ReactNode
}

export default function PageHeader({
  title,
  subtitle,
  icon,
  children
}: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-100 flex items-center">
          {icon && <span className="mr-3">{icon}</span>}
          {title}
        </h1>
        <p className="text-gray-400 mt-1">
          {subtitle}
        </p>
      </div>
      {children && (
        <div className="flex items-center space-x-4">
          {children}
        </div>
      )}
    </div>
  )
}
