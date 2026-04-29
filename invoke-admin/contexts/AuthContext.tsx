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
  success: boolean
  message: string
}

interface AuthContextType {
  user: User | null
  setUser: (user: User | null) => void
  login: (username: string, password: string, turnstileToken?: string) => Promise<LoginResult>
  logout: () => Promise<void>
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
      const response = await authenticatedFetch('/api/auth/me')

      if (response.ok) {
        const userData = await response.json()
        setUser(userData.data)
      }
    } catch (error) {
      console.error('Auth check failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const login = async (username: string, password: string, turnstileToken?: string): Promise<LoginResult> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ username, password, turnstileToken })
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setUser(result.data.user)
        return { success: true, message: 'Login successful' }
      }

      return { success: false, message: result.message || 'Login failed' }
    } catch (error) {
      console.error('Login failed:', error)
      return { success: false, message: 'Login failed due to an error' }
    }
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      })
    } catch (error) {
      console.error('Logout request failed:', error)
    }
    setUser(null)
    router.push('/login')
  }

  return <AuthContext.Provider value={{ user, setUser, login, logout, loading }}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
