import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { api, tokenStorage, UNAUTHORIZED_EVENT } from '../api/client'

type AuthState = {
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(() => tokenStorage.get())

  const applyToken = useCallback(
    (value: string | null) => {
      if (value) tokenStorage.set(value)
      else tokenStorage.clear()
      queryClient.clear() // never show the previous user's cached data
      setToken(value)
    },
    [queryClient],
  )

  useEffect(() => {
    const onUnauthorized = () => setToken(null)
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      isAuthenticated: Boolean(token),
      async login(username, password) {
        const data = await api<{ token: string }>('/auth/token/', {
          method: 'POST',
          body: { username, password },
        })
        applyToken(data.token)
      },
      async register(username, password) {
        const data = await api<{ token: string }>('/auth/register/', {
          method: 'POST',
          body: { username, password },
        })
        applyToken(data.token)
      },
      logout: () => applyToken(null),
    }),
    [token, applyToken],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
