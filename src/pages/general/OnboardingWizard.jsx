import { useState, useEffect } from 'react'
import api from '../../utils/api'

const STEP_LABELS = [
  'Confirmation', 'Comptes', 'Année scolaire', 'Niveaux', 'Séries',
  'Matières', 'Évaluations', 'Classes', 'Enseignants', 'Élèves',
  'Affectations', 'Frais', 'Finalisation',
]

// ─── Progress Bar ────────────────────────────────────────────
function ProgressBar({ current, total }) {
  const pct = Math.round(((current - 1) / (total - 1)) * 100)
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-steel-700">
          Étape {current}/{total} — {STEP_LABELS[current - 1]}
        </span>
        <span className="text-xs text-steel-400">{pct}%</span>
      </div>
      <div className="w-full h-2 bg-steel-200 rounded-full overflow-hidden">
        <div className="h-full bg-brand rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Step 1: Confirmation ────────────────────────────────────
function Step1Confirm({ school, license, onNext }) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      await api.post('/api/onboarding/step1')
      onNext()
    } catch { setLoading(false) }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Confirmation des informations</h2>
      <p className="text-sm text-steel-500 mb-6">Vérifiez que les informations ci-dessous sont correctes.</p>

      <div className="bg-white rounded-xl border border-steel-200 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-steel-400 text-xs">École</p>
            <p className="text-steel-800 font-medium">{school?.school_name || '—'}</p>
          </div>
          <div>
            <p className="text-steel-400 text-xs">Code</p>
            <p className="text-steel-800 font-mono">{school?.school_code || '—'}</p>
          </div>
          <div>
            <p className="text-steel-400 text-xs">Directeur</p>
            <p className="text-steel-800">{school?.director_name || '—'}</p>
          </div>
          <div>
            <p className="text-steel-400 text-xs">Ville</p>
            <p className="text-steel-800">{school?.city || '—'}</p>
          </div>
          <div>
            <p className="text-steel-400 text-xs">Pays</p>
            <p className="text-steel-800">{school?.country || '—'}</p>
          </div>
          <div>
            <p className="text-steel-400 text-xs">Licence</p>
            <p className="text-steel-800">
              <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium mr-1 ${
                license?.tier === 'PRO' ? 'bg-brand-50 text-brand-600' : 'bg-steel-100 text-steel-600'
              }`}>{license?.tier || '—'}</span>
            </p>
          </div>
          <div>
            <p className="text-steel-400 text-xs">Expiration</p>
            <p className="text-steel-800">
              {license?.expiry ? new Date(license.expiry).toLocaleDateString('fr-FR') : '—'}
            </p>
          </div>
          <div>
            <p className="text-steel-400 text-xs">Statut</p>
            <p className={`font-medium ${license?.is_active ? 'text-brand' : 'text-red-500'}`}>
              {license?.is_active ? 'Active' : 'Inactive'}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? 'Validation...' : 'Confirmer et continuer'}
        </button>
      </div>
    </div>
  )
}

// ─── Step 2: Account Creation ────────────────────────────────
function Step2Accounts({ license, onNext }) {
  const [admin, setAdmin] = useState({ full_name: '', username: '', password: '' })
  const [secretary, setSecretary] = useState({ full_name: '', username: '', password: '' })
  const [accountant, setAccountant] = useState({ full_name: '', username: '', password: '' })
  const [addSecretary, setAddSecretary] = useState(false)
  const [addAccountant, setAddAccountant] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isPro = license?.tier === 'PRO'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const payload = { admin }
    if (addSecretary && secretary.full_name) payload.secretary = secretary
    if (addAccountant && accountant.full_name && isPro) payload.accountant = accountant

    try {
      await api.post('/api/onboarding/step2', payload)
      onNext()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la création des comptes')
      setLoading(false)
    }
  }

  function AccountForm({ label, value, onChange, required }) {
    return (
      <div className="bg-white rounded-xl border border-steel-200 p-5 space-y-3">
        <h3 className="text-sm font-medium text-steel-700">{label} {required && <span className="text-red-500">*</span>}</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Nom complet <span className="text-red-500">*</span></label>
            <input
              type="text" required={required} value={value.full_name}
              onChange={(e) => onChange({ ...value, full_name: e.target.value })}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Nom d'utilisateur <span className="text-red-500">*</span></label>
            <input
              type="text" required={required} value={value.username}
              onChange={(e) => onChange({ ...value, username: e.target.value })}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-steel-500 mb-1">Mot de passe <span className="text-red-500">*</span></label>
          <input
            type="password" required={required} value={value.password} minLength={6}
            onChange={(e) => onChange({ ...value, password: e.target.value })}
            className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            placeholder="Minimum 6 caractères"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Création des comptes</h2>
      <p className="text-sm text-steel-500 mb-6">Créez les comptes utilisateurs pour cette école.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <AccountForm label="Administrateur" value={admin} onChange={setAdmin} required />

        {/* Secretary toggle */}
        {!addSecretary ? (
          <button
            type="button"
            onClick={() => setAddSecretary(true)}
            className="w-full py-3 border border-dashed border-steel-300 rounded-xl text-sm text-steel-500 hover:border-brand hover:text-brand transition-colors"
          >
            + Ajouter un(e) secrétaire
          </button>
        ) : (
          <div className="relative">
            <AccountForm label="Secrétaire" value={secretary} onChange={setSecretary} required={false} />
            <button
              type="button"
              onClick={() => { setAddSecretary(false); setSecretary({ full_name: '', username: '', password: '' }) }}
              className="absolute top-3 right-3 text-steel-400 hover:text-red-500 text-xs"
            >
              Retirer
            </button>
          </div>
        )}

        {/* Accountant toggle (PRO only) */}
        {isPro && (
          !addAccountant ? (
            <button
              type="button"
              onClick={() => setAddAccountant(true)}
              className="w-full py-3 border border-dashed border-steel-300 rounded-xl text-sm text-steel-500 hover:border-brand hover:text-brand transition-colors"
            >
              + Ajouter un(e) comptable (PRO)
            </button>
          ) : (
            <div className="relative">
              <AccountForm label="Comptable" value={accountant} onChange={setAccountant} required={false} />
              <button
                type="button"
                onClick={() => { setAddAccountant(false); setAccountant({ full_name: '', username: '', password: '' }) }}
                className="absolute top-3 right-3 text-steel-400 hover:text-red-500 text-xs"
              >
                Retirer
              </button>
            </div>
          )
        )}

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading || !admin.full_name || !admin.username || !admin.password}
            className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? 'Création...' : 'Créer les comptes'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 3: Academic Year Setup ─────────────────────────────
function Step3AcademicYear({ onNext }) {
  const now = new Date()
  const yearStart = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  const yearEnd = yearStart + 1

  const [form, setForm] = useState({
    label: `${yearStart}-${yearEnd}`,
    start_date: `${yearStart}-09-01`,
    end_date: `${yearEnd}-08-20`,
    periode_type: 'trimestre',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await api.post('/api/onboarding/step3', form)
      onNext()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur')
      setLoading(false)
    }
  }

  const periodes = form.periode_type === 'trimestre'
    ? ['Trimestre 1 (T1)', 'Trimestre 2 (T2)', 'Trimestre 3 (T3)']
    : ['Semestre 1 (S1)', 'Semestre 2 (S2)']

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Année scolaire</h2>
      <p className="text-sm text-steel-500 mb-6">Configurez l'année scolaire en cours.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-xl border border-steel-200 p-5 space-y-4">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Libellé <span className="text-red-500">*</span></label>
            <input
              type="text" required value={form.label}
              onChange={(e) => update('label', e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              placeholder="2025-2026"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Date de début <span className="text-red-500">*</span></label>
              <input
                type="date" required value={form.start_date}
                onChange={(e) => update('start_date', e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Date de fin <span className="text-red-500">*</span></label>
              <input
                type="date" required value={form.end_date}
                onChange={(e) => update('end_date', e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-steel-500 mb-2">Type de période <span className="text-red-500">*</span></label>
            <div className="flex gap-3">
              {['trimestre', 'semestre'].map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => update('periode_type', type)}
                  className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${
                    form.periode_type === type
                      ? 'border-brand bg-brand-50 text-brand-600'
                      : 'border-steel-200 text-steel-500 hover:border-steel-300'
                  }`}
                >
                  {type === 'trimestre' ? 'Trimestre (3 périodes)' : 'Semestre (2 périodes)'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-steel-50 rounded-lg p-4">
          <p className="text-xs text-steel-400 mb-2">Périodes qui seront créées :</p>
          <div className="flex gap-2">
            {periodes.map(p => (
              <span key={p} className="px-3 py-1.5 bg-white border border-steel-200 rounded-lg text-xs text-steel-600">
                {p}
              </span>
            ))}
          </div>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading || !form.label || !form.start_date || !form.end_date}
            className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? 'Enregistrement...' : 'Enregistrer et continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Placeholder for steps 4-13 ─────────────────────────────
function StepPlaceholder({ step, onNext }) {
  return (
    <div className="max-w-lg mx-auto text-center py-12">
      <div className="w-16 h-16 bg-steel-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-2xl text-steel-400">{step}</span>
      </div>
      <h2 className="text-lg font-medium text-steel-900 mb-1">{STEP_LABELS[step - 1]}</h2>
      <p className="text-sm text-steel-500">Cette étape sera implémentée dans la phase 3{step <= 6 ? 'B' : step <= 8 ? 'C' : step <= 11 ? 'D' : 'E'}.</p>
    </div>
  )
}

// ─── Main Wizard ─────────────────────────────────────────────
export default function OnboardingWizard({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(1)
  const [school, setSchool] = useState(null)
  const [license, setLicense] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await api.get('/api/onboarding/status')
        setCurrentStep(res.data.current_step)
        setSchool(res.data.school)
        setLicense(res.data.license)

        if (res.data.is_configured) {
          onComplete && onComplete()
        }
      } catch {
        setTimeout(loadStatus, 1000)
        return
      }
      setLoading(false)
    }
    loadStatus()
  }, [onComplete])

  function advance() {
    const next = currentStep + 1
    setCurrentStep(next)
    if (next > 13) {
      onComplete && onComplete()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-steel-50">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  function renderStep() {
    switch (currentStep) {
      case 1: return <Step1Confirm school={school} license={license} onNext={advance} />
      case 2: return <Step2Accounts license={license} onNext={advance} />
      case 3: return <Step3AcademicYear onNext={advance} />
      default: return <StepPlaceholder step={currentStep} onNext={advance} />
    }
  }

  return (
    <div className="min-h-screen bg-steel-50">
      {/* Header */}
      <div className="bg-white border-b border-steel-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-steel-900 rounded-xl flex items-center justify-center">
            <span className="text-brand-200 text-sm font-semibold">S</span>
          </div>
          <div>
            <p className="text-sm font-medium text-steel-800">ScolaDesk — Configuration</p>
            <p className="text-xs text-steel-400">{school?.school_name || ''}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <ProgressBar current={currentStep} total={13} />
        {renderStep()}
      </div>
    </div>
  )
}
