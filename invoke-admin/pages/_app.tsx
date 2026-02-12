import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProjectProvider } from '@/contexts/ProjectContext'
import PageTransition from '@/components/PageTransition'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <ProjectProvider>
        <PageTransition />
        <Component {...pageProps} />
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1f2937',
              color: '#f9fafb',
              border: '1px solid #374151',
            },
          }}
        />
      </ProjectProvider>
    </AuthProvider>
  )
}