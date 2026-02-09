/**
 * Login page with Cloudflare Turnstile integration
 * 
 * Setup instructions:
 * 1. Get Turnstile keys from https://dash.cloudflare.com/
 * 2. Add to .env file:
 *    - TURNSTILE_SITE_KEY (for frontend)
 *    - TURNSTILE_SECRET_KEY (for backend verification)
 * 3. For testing, use dummy keys (always passes):
 *    - Site key: 1x00000000000000000000AA
 *    - Secret key: 1x0000000000000000000000000000000AA
 */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from '@/contexts/AuthContext'
import { Rocket, Lock, User } from 'lucide-react'
import toast from 'react-hot-toast'

declare global {
  interface Window {
    turnstile?: any;
  }
}

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [siteKey, setSiteKey] = useState<string>('1x00000000000000000000AA')
  const turnstileWidgetRef = useRef<HTMLDivElement>(null)
  const turnstileIdRef = useRef<string | null>(null)
  const { login } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Fetch Turnstile site key and load script
    const initTurnstile = async () => {
      try {
        // Fetch site key from server
        const response = await fetch('/api/turnstile-config')
        let key = '1x00000000000000000000AA'
        if (response.ok) {
          const data = await response.json()
          key = data.siteKey
          setSiteKey(key)
        }

        // Define the callback before loading the script
        (window as any).onTurnstileSuccess = (token: string) => {
          console.log('Turnstile success:', token)
          setTurnstileToken(token)
        }

        // Load Turnstile script
        const script = document.createElement('script')
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
        script.async = true
        script.defer = true
        script.onload = () => {
          console.log('Turnstile script loaded')
          // Render the widget once the script is loaded
          if (window.turnstile && turnstileWidgetRef.current && !turnstileIdRef.current) {
            try {
              turnstileIdRef.current = window.turnstile.render(turnstileWidgetRef.current, {
                sitekey: key,
                callback: (token: string) => {
                  console.log('Turnstile callback triggered:', token)
                  setTurnstileToken(token)
                },
                theme: 'dark',
              })
              console.log('Turnstile widget rendered with ID:', turnstileIdRef.current)
            } catch (error) {
              console.error('Error rendering Turnstile widget:', error)
            }
          }
        }
        document.body.appendChild(script)
      } catch (error) {
        console.error('Failed to initialize Turnstile:', error)
      }

      return () => {
        const scripts = document.querySelectorAll('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]')
        scripts.forEach(script => script.remove())
        delete (window as any).onTurnstileSuccess
      }
    }

    initTurnstile()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!turnstileToken) {
      toast.error('Please complete the verification challenge')
      return
    }
    
    setLoading(true)

    try {
      const {success, message} = await login(username, password, turnstileToken)
      if (success) {
        toast.success('Welcome to Invoke !')
        router.push('/admin')
      } else {
        toast.error(message)
        // Reset Turnstile on failed login
        if (window.turnstile && turnstileIdRef.current) {
          window.turnstile.reset(turnstileIdRef.current)
          setTurnstileToken(null)
        }
      }
    } catch (error) {
      toast.error('Login failed')
      // Reset Turnstile on error
      if (window.turnstile && turnstileIdRef.current) {
        window.turnstile.reset(turnstileIdRef.current)
        setTurnstileToken(null)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>Welcome to Invoke Admin</title>
        <meta name="description" content="Sign in to Invoke Admin Panel" />
      </Head>
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center">
            <Rocket className="w-16 h-16 text-primary-500" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-white">
            Sign in to Invoke
          </h2>
          <p className="mt-2 text-gray-400">
            Access your serverless function management panel
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="username" className="form-label">
              <User className="w-4 h-4 inline mr-2" />
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="form-input"
              placeholder="Enter your username"
            />
          </div>

          <div>
            <label htmlFor="password" className="form-label">
              <Lock className="w-4 h-4 inline mr-2" />
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="Enter your password"
            />
          </div>

          <div>
            <div 
              ref={turnstileWidgetRef}
              className="flex justify-center"
            ></div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || !turnstileToken}
              className="w-full btn-primary py-3 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Signing in...
                </div>
              ) : (
                'Sign in'
              )}
            </button>
          </div>
        </form>

        <div className="text-center text-sm text-gray-400">
          <p>Need an admin account? Contact your system administrator.</p>
        </div>
      </div>
      </div>
    </>
  )
}