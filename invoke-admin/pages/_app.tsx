import '@/styles/globals.css'
import type { AppProps, AppContext, AppInitialProps } from 'next/app'
import NextApp from 'next/app'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProjectProvider } from '@/contexts/ProjectContext'
import { FeatureFlagsProvider, FeatureFlags } from '@/contexts/FeatureFlagsContext'
import PageTransition from '@/components/PageTransition'

type AppPropsWithFlags = AppProps & { featureFlags: FeatureFlags }

export default function App({ Component, pageProps, featureFlags }: AppPropsWithFlags) {
  return (
    <FeatureFlagsProvider flags={featureFlags}>
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
    </FeatureFlagsProvider>
  )
}

App.getInitialProps = async (appContext: AppContext): Promise<AppInitialProps & { featureFlags: FeatureFlags }> => {
  const appProps = await NextApp.getInitialProps(appContext)

  let gatewayEnabled = false

  // Only query the DB on the server (ctx.req is undefined during client-side navigation)
  if (typeof window === 'undefined') {
    try {
      const database = require('@/lib/database')
      await database.connect()
      const result = await database.query(
        `SELECT setting_value FROM global_settings WHERE setting_key = 'api_gateway_domain'`
      )
      const value: string = result.rows[0]?.setting_value || ''
      gatewayEnabled = value.trim() !== ''
    } catch (_) {
      // On error keep false — the sidebar item stays hidden rather than broken
    }
  } else {
    // Client-side navigation: preserve current value by defaulting to true (no flash of removal)
    gatewayEnabled = true
  }

  return { ...appProps, featureFlags: { gatewayEnabled } }
}