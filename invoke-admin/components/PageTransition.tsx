import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Loader } from 'lucide-react'

export default function PageTransition() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const handleStart = () => setIsLoading(true)
    const handleStop = () => setIsLoading(false)

    router.events.on('routeChangeStart', handleStart)
    router.events.on('routeChangeComplete', handleStop)
    router.events.on('routeChangeError', handleStop)

    return () => {
      router.events.off('routeChangeStart', handleStart)
      router.events.off('routeChangeComplete', handleStop)
      router.events.off('routeChangeError', handleStop)
    }
  }, [router])

  return (
    <>
      {isLoading && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fadeIn pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <Loader className="w-8 h-8 text-primary-500 animate-spin" />
            <p className="text-gray-300 text-sm animate-pulse">Loading page...</p>
          </div>
        </div>
      )}
    </>
  )
}
