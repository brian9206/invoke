import React, { createContext, useContext, useState } from 'react'

export interface FeatureFlags {
  gatewayEnabled: boolean
}

const defaultFlags: FeatureFlags = {
  gatewayEnabled: false,
}

interface FeatureFlagsContextValue {
  flags: FeatureFlags
  setFlags: (flags: Partial<FeatureFlags>) => void
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue>({
  flags: defaultFlags,
  setFlags: () => {},
})

export function FeatureFlagsProvider({
  flags: initialFlags,
  children,
}: {
  flags: FeatureFlags
  children: React.ReactNode
}) {
  const [flags, setFlagsState] = useState<FeatureFlags>(initialFlags)

  const setFlags = (partial: Partial<FeatureFlags>) =>
    setFlagsState(prev => ({ ...prev, ...partial }))

  return (
    <FeatureFlagsContext.Provider value={{ flags, setFlags }}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}

export function useFeatureFlags(): FeatureFlags {
  return useContext(FeatureFlagsContext).flags
}

export function useSetFeatureFlags(): (flags: Partial<FeatureFlags>) => void {
  return useContext(FeatureFlagsContext).setFlags
}
