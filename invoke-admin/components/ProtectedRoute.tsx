import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/contexts/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user && router.pathname !== '/login') {
      router.push('/login')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className='min-h-screen bg-background flex items-center justify-center animate-fadeIn'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4'></div>
          <p className='text-muted-foreground animate-pulse'>Loading...</p>
        </div>
      </div>
    )
  }

  if (!user && router.pathname !== '/login') {
    return null
  }

  return <>{children}</>
}
