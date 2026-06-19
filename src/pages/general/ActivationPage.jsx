import { useState } from 'react'
import api from '../../utils/api'

export default function ActivationPage({ onActivated }) {
  const [licenseKey, setLicenseKey] = useState('')
  const [schoolData, setSchoolData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('key') // key | activating | done

  function formatKey(value) {
    const clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 20)
    const parts = []
    if (clean.length > 0) parts.push(clean.slice(0, 4))
    if (clean.length > 4) parts.push(clean.slice(4, 8))
    if (clean.length > 8) parts.push(clean.slice(8, 12))
    if (clean.length > 12) parts.push(clean.slice(12, 16))
    if (clean.length > 16) parts.push(clean.slice(16, 20))
    return parts.join('-')
  }

  async function handleActivate(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    setStep('activating')

    try {
      // Capture hardware fingerprint
      let fingerprint
      if (window.scola) {
        const hwResult = await window.scola.invoke('get-hardware-fingerprint')
        if (!hwResult.success) {
          setError('Impossible de capturer l\'empreinte matérielle: ' + (hwResult.error || ''))
          setStep('key')
          setLoading(false)
          return
        }
        fingerprint = hwResult.fingerprint
      } else {
        fingerprint = 'dev-local-static-fingerprint'
      }

      // Activate
      const res = await api.post('/api/activation/activate', {
        license_key: licenseKey.trim().toUpperCase(),
        fingerprint,
      })

      if (res.data.success) {
        setSchoolData(res.data.school)
        setStep('done')
      } else {
        setError(res.data.message || 'Erreur d\'activation')
        setStep('key')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Impossible de contacter le serveur central')
      setStep('key')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-steel-900">
      <div className="w-full max-w-md p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-steel-900 border-2 border-steel-700 rounded-2xl flex items-center justify-center mb-4">
            <span className="text-brand text-4xl font-semibold">S</span>
          </div>
          <h1 className="text-2xl font-medium text-steel-200">ScolaDesk</h1>
          <p className="text-steel-400 text-sm mt-1">Activation de votre licence</p>
        </div>

        {/* Step: Enter license key */}
        {step === 'key' && (
          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label className="block text-sm text-steel-400 mb-1.5">Clé de licence</label>
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(formatKey(e.target.value))}
                required
                className="w-full px-4 py-3 bg-steel-800 border border-steel-700 rounded-lg text-steel-200 placeholder-steel-500 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-center text-lg font-mono tracking-wider"
                placeholder="SDLK-2026-XXXX-XXXX-XXXX"
              />
            </div>
            <p className="text-xs text-steel-500 text-center">
              Entrez la clé fournie par l'équipe ScolaDesk
            </p>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || licenseKey.replace(/-/g, '').length < 20}
              className="w-full py-3 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors"
            >
              Activer
            </button>
            <p className="text-xs text-steel-600 text-center mt-4">
              Une connexion internet est requise pour l'activation
            </p>
          </form>
        )}

        {/* Step: Activating (spinner) */}
        {step === 'activating' && (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-steel-300">Activation en cours...</p>
            <p className="text-steel-500 text-xs mt-2">Vérification de la licence et liaison matérielle</p>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && schoolData && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-brand/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-medium text-steel-200">Activation réussie</h2>
            </div>

            <div className="bg-steel-800 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-steel-500 text-xs">École</p>
                  <p className="text-steel-200 font-medium">{schoolData.school_name}</p>
                </div>
                <div>
                  <p className="text-steel-500 text-xs">Code</p>
                  <p className="text-steel-200 font-mono">{schoolData.school_code}</p>
                </div>
                {schoolData.director_name && (
                  <div>
                    <p className="text-steel-500 text-xs">Directeur</p>
                    <p className="text-steel-200">{schoolData.director_name}</p>
                  </div>
                )}
                <div>
                  <p className="text-steel-500 text-xs">Licence</p>
                  <p className="text-steel-200">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium mr-1 ${
                      schoolData.tier === 'PRO' ? 'bg-brand/20 text-brand-200' : 'bg-steel-700 text-steel-300'
                    }`}>{schoolData.tier}</span>
                    {schoolData.size || ''}
                  </p>
                </div>
                {schoolData.expiry_date && (
                  <div>
                    <p className="text-steel-500 text-xs">Expiration</p>
                    <p className="text-steel-200">{new Date(schoolData.expiry_date).toLocaleDateString('fr-FR')}</p>
                  </div>
                )}
                {schoolData.semesters_active && (
                  <div>
                    <p className="text-steel-500 text-xs">Trimestres</p>
                    <p className="text-steel-200">{schoolData.semesters_active}/3</p>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => onActivated && onActivated(schoolData)}
              className="w-full py-3 bg-brand hover:bg-brand-600 text-white font-medium rounded-lg text-sm transition-colors"
            >
              Continuer vers la configuration
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
