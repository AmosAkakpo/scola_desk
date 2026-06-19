import { useState, useEffect } from 'react'
import { AuthProvider } from './context/AuthContext.jsx'
import ActivationPage from './pages/general/ActivationPage'
import OnboardingWizard from './pages/general/OnboardingWizard'
import api from './utils/api'
import './App.css'

function AppContent() {
  const [appState, setAppState] = useState('loading') // loading | activation | onboarding | login | app
  const [schoolInfo, setSchoolInfo] = useState(null)

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await api.get('/api/activation/status')
        if (res.data.activated) {
          setSchoolInfo(res.data)
          if (res.data.configured) {
            setAppState('app')
          } else {
            setAppState('onboarding')
          }
        } else {
          setAppState('activation')
        }
      } catch {
        setTimeout(checkStatus, 1000)
      }
    }
    checkStatus()
  }, [])

  if (appState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-steel-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-steel-900 border-2 border-steel-700 rounded-2xl flex items-center justify-center">
            <span className="text-brand text-2xl font-semibold">S</span>
          </div>
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (appState === 'activation') {
    return (
      <ActivationPage
        onActivated={(data) => {
          setSchoolInfo(data)
          setAppState('onboarding')
        }}
      />
    )
  }

  if (appState === 'onboarding') {
    return (
      <OnboardingWizard
        onComplete={() => setAppState('app')}
      />
    )
  }

  // Placeholder for login + main app (Phase 4+)
  return (
    <div className="min-h-screen flex items-center justify-center bg-steel-50">
      <div className="text-center">
        <div className="w-16 h-16 bg-steel-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-brand-200 text-3xl font-semibold">S</span>
        </div>
        <h1 className="text-xl font-medium text-steel-900 mb-1">
          {schoolInfo?.school_name || 'ScolaDesk'}
        </h1>
        <p className="text-steel-500 text-sm mb-6">
          {schoolInfo?.school_code || ''}
        </p>
        <p className="text-steel-400 text-sm">
          Configuration terminée — en attente du module académique (Phase 4)
        </p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
