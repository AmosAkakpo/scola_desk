import { useState, useEffect } from 'react'
import { AuthProvider } from './context/AuthContext.jsx'
import ActivationPage from './pages/general/ActivationPage'
import OnboardingWizard from './pages/general/OnboardingWizard'
import api from './utils/api'
import './App.css'

function ExpiredScreen({ schoolName, expiry }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-steel-900">
      <div className="w-full max-w-sm p-8 text-center">
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-medium text-steel-200 mb-2">Licence expirée</h1>
        <p className="text-sm text-steel-400 mb-4">{schoolName || 'ScolaDesk'}</p>
        <p className="text-sm text-steel-500">
          Votre licence a expiré le {expiry ? new Date(expiry).toLocaleDateString('fr-FR') : '—'}.
        </p>
        <p className="text-sm text-steel-500 mt-2">
          Contactez ScolaDesk pour renouveler votre licence.
        </p>
      </div>
    </div>
  )
}

function SuspendedScreen({ schoolName }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-steel-900">
      <div className="w-full max-w-sm p-8 text-center">
        <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h1 className="text-xl font-medium text-steel-200 mb-2">Licence suspendue</h1>
        <p className="text-sm text-steel-400 mb-4">{schoolName || 'ScolaDesk'}</p>
        <p className="text-sm text-steel-500">
          Votre licence a été suspendue. Contactez ScolaDesk.
        </p>
      </div>
    </div>
  )
}

function TamperedScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-steel-900">
      <div className="w-full max-w-sm p-8 text-center">
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-xl font-medium text-steel-200 mb-2">Erreur système</h1>
        <p className="text-sm text-steel-500">
          Une anomalie a été détectée sur la date du système. Contactez ScolaDesk.
        </p>
      </div>
    </div>
  )
}

function AppContent() {
  const [appState, setAppState] = useState('loading')
  const [schoolInfo, setSchoolInfo] = useState(null)

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await api.get('/api/activation/status')
        const { activated, configured, license_status } = res.data

        setSchoolInfo(res.data)

        if (!activated) {
          setAppState('activation')
          return
        }

        if (license_status === 'tampered') { setAppState('tampered'); return }
        if (license_status === 'expired') { setAppState('expired'); return }
        if (license_status === 'suspended') { setAppState('suspended'); return }

        setAppState(configured ? 'app' : 'onboarding')
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
    return <ActivationPage onActivated={(data) => { setSchoolInfo(data); setAppState('onboarding') }} />
  }

  if (appState === 'tampered') return <TamperedScreen />
  if (appState === 'expired') return <ExpiredScreen schoolName={schoolInfo?.school_name} expiry={schoolInfo?.expiry} />
  if (appState === 'suspended') return <SuspendedScreen schoolName={schoolInfo?.school_name} />

  if (appState === 'onboarding') {
    return <OnboardingWizard onComplete={() => setAppState('app')} />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-steel-50">
      <div className="text-center">
        <div className="w-16 h-16 bg-steel-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-brand-200 text-3xl font-semibold">S</span>
        </div>
        <h1 className="text-xl font-medium text-steel-900 mb-1">{schoolInfo?.school_name || 'ScolaDesk'}</h1>
        <p className="text-steel-500 text-sm mb-6">{schoolInfo?.school_code || ''}</p>
        <p className="text-steel-400 text-sm">Configuration terminée — login à venir (Phase 4)</p>
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
