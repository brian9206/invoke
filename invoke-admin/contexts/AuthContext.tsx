import React, { createContext, useContext, useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { authenticatedFetch } from '@/lib/frontend-utils'

interface User {
  id: number
  username: string
  email: string
  isAdmin: boolean
}

interface LoginResult {
  success: boolean,
  message: string
}

interface AuthContextType {
  user: User | null
  login: (username: string, password: string) => Promise<LoginResult>
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
      if (!token) {
        setLoading(false)
        return
      }

      const response = await authenticatedFetch('/api/auth/me')

      if (response.ok) {
        const userData = await response.json()
        setUser(userData.data)
      } else {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth-token')
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth-token')
      }
    } finally {
      setLoading(false)
    }
  }

  const login = async (username: string, password: string): Promise<LoginResult> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth-token', result.data.token)
        }
        setUser(result.data.user)
        return { success: true, message: 'Login successful' }
      }

      return { success: false, message: result.message || 'Login failed' }
    } catch (error) {
      console.error('Login failed:', error)
      return { success: false, message: 'Login failed due to an error' }
    }
  }

  const logout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth-token')
    }
    setUser(null)
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}