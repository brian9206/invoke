import '@/styles/globals.css'
import type { AppProps, AppContext, AppInitialProps } from 'next/app'
import NextApp from 'next/app'
import { Inter } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProjectProvider } from '@/contexts/ProjectContext'
import { FeatureFlagsProvider, FeatureFlags } from '@/contexts/FeatureFlagsContext'
import PageTransition from '@/components/PageTransition'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

type AppPropsWithFlags = AppProps & { featureFlags: FeatureFlags }

export default function App({ Component, pageProps, featureFlags }: AppPropsWithFlags) {
  return (
    <FeatureFlagsProvider flags={featureFlags}>
      <AuthProvider>
        <ProjectProvider>
          <div className={`${inter.variable} font-sans`}>
            <PageTransition />
            <Component {...pageProps} />
            <Toaster position="bottom-right" />
          </div>
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
      const { default: database } = await import('@/lib/database')
      const setting = await database.models.GlobalSetting.findOne({
        where: { setting_key: 'api_gateway_domain' },
      })
      const value: string = setting?.setting_value || ''
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