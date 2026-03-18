import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from '@/contexts/AuthContext'
import { Rocket, Lock, User } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

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
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="flex justify-center">
              <Rocket className="w-14 h-14 text-primary" />
            </div>
            <h2 className="mt-4 text-3xl font-bold text-foreground">Sign in to Invoke</h2>
            <p className="mt-2 text-muted-foreground text-sm">
              Access your serverless function management panel
            </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="username" className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    Username
                  </Label>
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    Password
                  </Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                  />
                </div>

                <div>
                  <div ref={turnstileWidgetRef} className="flex justify-center" />
                </div>

                <Button
                  type="submit"
                  disabled={loading || !turnstileToken}
                  className="w-full"
                  size="lg"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Signing in...
                    </span>
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground">
            Need an admin account? Contact your system administrator.
          </p>
        </div>
      </div>
    </>
  )
}