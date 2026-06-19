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
function Step1Confirm({ school, license, features, size, semesters, onNext }) {
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
          {size && (
            <div>
              <p className="text-steel-400 text-xs">Taille</p>
              <p className="text-steel-800">{size}</p>
            </div>
          )}
          {semesters && (
            <div>
              <p className="text-steel-400 text-xs">Trimestres</p>
              <p className="text-steel-800">{semesters}/3</p>
            </div>
          )}
          {features?.length > 0 && (
            <div className="col-span-2">
              <p className="text-steel-400 text-xs mb-1">Fonctionnalités</p>
              <div className="flex flex-wrap gap-1">
                {features.map(f => <span key={f} className="px-2 py-0.5 bg-steel-100 text-steel-600 rounded text-xs">{f}</span>)}
              </div>
            </div>
          )}
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

// ─── Step 4: Levels Activation ───────────────────────────────
function Step4Levels({ onNext }) {
  const [levels, setLevels] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const res = await api.get('/api/onboarding/levels')
      setLevels(res.data.levels || [])
      setSelected((res.data.levels || []).filter(l => l.is_active).map(l => l.id))
      setLoading(false)
    }
    load()
  }, [])

  function toggle(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (selected.length === 0) { setError('Sélectionnez au moins un niveau'); return }
    setError('')
    setSaving(true)
    try {
      await api.post('/api/onboarding/step4', { level_ids: selected })
      onNext()
    } catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  if (loading) return <div className="text-center py-8"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" /></div>

  const primary = levels.filter(l => l.level_code <= 7)
  const secondary1 = levels.filter(l => l.level_code >= 8 && l.level_code <= 11)
  const secondary2 = levels.filter(l => l.level_code >= 12)

  function LevelGroup({ title, items }) {
    return (
      <div>
        <p className="text-xs font-medium text-steel-500 uppercase tracking-wide mb-2">{title}</p>
        <div className="grid grid-cols-4 gap-2">
          {items.map(l => (
            <button key={l.id} type="button" onClick={() => toggle(l.id)}
              className={`py-3 rounded-lg border text-sm font-medium transition-colors ${
                selected.includes(l.id)
                  ? 'border-brand bg-brand-50 text-brand-600'
                  : 'border-steel-200 text-steel-500 hover:border-steel-300'
              }`}>
              {l.name}
              {l.is_exam_cohort ? <span className="block text-xs text-steel-400">{l.exam_name}</span> : null}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Niveaux enseignés</h2>
      <p className="text-sm text-steel-500 mb-6">Sélectionnez les niveaux que votre école propose.</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl border border-steel-200 p-6 space-y-5">
          <LevelGroup title="Primaire" items={primary} />
          {secondary1.length > 0 && <LevelGroup title="Collège (1er cycle)" items={secondary1} />}
          {secondary2.length > 0 && <LevelGroup title="Lycée (2nd cycle)" items={secondary2} />}
        </div>

        <p className="text-xs text-steel-400">{selected.length} niveau(x) sélectionné(s)</p>
        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex justify-end">
          <button type="submit" disabled={saving || selected.length === 0}
            className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Enregistrement...' : 'Enregistrer et continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 5: Series Configuration ────────────────────────────
function Step5Series({ onNext }) {
  const [levels, setLevels] = useState([])
  const [seriesMap, setSeriesMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const COMMON_SERIES = ['A', 'B', 'C', 'D', 'E', 'F1', 'F2', 'F3', 'G1', 'G2']

  useEffect(() => {
    async function load() {
      const res = await api.get('/api/onboarding/series-levels')
      setLevels(res.data.levels || [])
      const map = {}
      ;(res.data.levels || []).forEach(l => { map[l.id] = [] })
      ;(res.data.existing_series || []).forEach(s => {
        if (map[s.level_id]) map[s.level_id].push(s.name)
      })
      setSeriesMap(map)
      setLoading(false)
    }
    load()
  }, [])

  function toggleSerie(levelId, name) {
    setSeriesMap(prev => {
      const current = prev[levelId] || []
      return { ...prev, [levelId]: current.includes(name) ? current.filter(s => s !== name) : [...current, name] }
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const allSeries = []
    for (const [levelId, names] of Object.entries(seriesMap)) {
      for (const name of names) {
        allSeries.push({ level_id: parseInt(levelId), name })
      }
    }

    const hasEmpty = levels.some(l => (seriesMap[l.id] || []).length === 0)
    if (hasEmpty) { setError('Chaque niveau doit avoir au moins une série'); return }

    setSaving(true)
    try {
      await api.post('/api/onboarding/step5', { series: allSeries })
      onNext()
    } catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  if (loading) return <div className="text-center py-8"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" /></div>

  useEffect(() => {
    if (!loading && levels.length === 0) {
      api.post('/api/onboarding/step5', { series: [] }).then(() => onNext())
    }
  }, [loading, levels.length, onNext])

  if (levels.length === 0) {
    return <div className="text-center py-8"><p className="text-steel-500">Aucun niveau avec séries — passage automatique...</p></div>
  }

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Séries par niveau</h2>
      <p className="text-sm text-steel-500 mb-6">Sélectionnez les séries proposées pour chaque niveau.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {levels.map(level => (
          <div key={level.id} className="bg-white rounded-xl border border-steel-200 p-5">
            <p className="text-sm font-medium text-steel-700 mb-3">{level.name}</p>
            <div className="flex flex-wrap gap-2">
              {COMMON_SERIES.map(s => (
                <button key={s} type="button" onClick={() => toggleSerie(level.id, s)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    (seriesMap[level.id] || []).includes(s)
                      ? 'border-brand bg-brand-50 text-brand-600'
                      : 'border-steel-200 text-steel-400 hover:border-steel-300'
                  }`}>{s}</button>
              ))}
            </div>
          </div>
        ))}

        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Enregistrement...' : 'Enregistrer et continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 6: Subjects & Coefficients ─────────────────────────
function Step6Subjects({ onNext }) {
  const [subjects, setSubjects] = useState([])
  const [levels, setLevels] = useState([])
  const [series, setSeries] = useState([])
  const [assignments, setAssignments] = useState([])
  const [selectedLevel, setSelectedLevel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const res = await api.get('/api/onboarding/subjects-data')
      setSubjects(res.data.subjects || [])
      setLevels(res.data.levels || [])
      setSeries(res.data.series || [])
      setAssignments(res.data.existing_assignments || [])
      if (res.data.levels?.length > 0) setSelectedLevel(res.data.levels[0].id)
      setLoading(false)
    }
    load()
  }, [])

  function getAssignment(levelId, subjectId, serieId) {
    return assignments.find(a => a.level_id === levelId && a.subject_id === subjectId && (a.serie_id || null) === (serieId || null))
  }

  function toggleSubject(levelId, subjectId, serieId) {
    const existing = getAssignment(levelId, subjectId, serieId)
    if (existing) {
      setAssignments(prev => prev.filter(a => !(a.level_id === levelId && a.subject_id === subjectId && (a.serie_id || null) === (serieId || null))))
    } else {
      setAssignments(prev => [...prev, { level_id: levelId, subject_id: subjectId, serie_id: serieId || null, coefficient: 1 }])
    }
  }

  function setCoefficient(levelId, subjectId, serieId, coeff) {
    setAssignments(prev => prev.map(a => {
      if (a.level_id === levelId && a.subject_id === subjectId && (a.serie_id || null) === (serieId || null)) {
        return { ...a, coefficient: parseInt(coeff) || 1 }
      }
      return a
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (assignments.length === 0) { setError('Assignez au moins une matière'); return }
    setError('')
    setSaving(true)
    try {
      await api.post('/api/onboarding/step6', { assignments })
      onNext()
    } catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  if (loading) return <div className="text-center py-8"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" /></div>

  const currentLevel = levels.find(l => l.id === selectedLevel)
  const levelSeries = series.filter(s => s.level_id === selectedLevel)
  const levelAssignments = assignments.filter(a => a.level_id === selectedLevel)

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Matières et coefficients</h2>
      <p className="text-sm text-steel-500 mb-6">Assignez les matières à chaque niveau avec leurs coefficients.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Level tabs */}
        <div className="flex gap-2 flex-wrap">
          {levels.map(l => {
            const count = assignments.filter(a => a.level_id === l.id).length
            return (
              <button key={l.id} type="button" onClick={() => setSelectedLevel(l.id)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  selectedLevel === l.id ? 'bg-brand text-white' : 'bg-white border border-steel-200 text-steel-600 hover:bg-steel-50'
                }`}>
                {l.name} {count > 0 && <span className="ml-1 text-xs opacity-70">({count})</span>}
              </button>
            )
          })}
        </div>

        {/* Subject list for selected level */}
        {currentLevel && (
          <div className="bg-white rounded-xl border border-steel-200 p-5">
            <p className="text-sm font-medium text-steel-700 mb-1">{currentLevel.name}</p>
            {levelSeries.length > 0 && (
              <p className="text-xs text-steel-400 mb-3">Séries: {levelSeries.map(s => s.name).join(', ')}</p>
            )}

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {subjects.map(sub => {
                const assigned = getAssignment(selectedLevel, sub.id, null)
                return (
                  <div key={sub.id} className="flex items-center gap-3 py-1.5 border-b border-steel-50">
                    <label className="flex items-center gap-2 flex-1 cursor-pointer">
                      <input type="checkbox" checked={!!assigned}
                        onChange={() => toggleSubject(selectedLevel, sub.id, null)}
                        className="rounded border-steel-300 text-brand focus:ring-brand" />
                      <span className="text-sm text-steel-700">{sub.name}</span>
                      <span className="text-xs text-steel-400">{sub.short_code}</span>
                    </label>
                    {assigned && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-steel-400">Coeff:</span>
                        <select value={assigned.coefficient}
                          onChange={e => setCoefficient(selectedLevel, sub.id, null, e.target.value)}
                          className="w-14 px-1 py-0.5 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand bg-white">
                          {[1,2,3,4,5,6].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <p className="text-xs text-steel-400">{assignments.length} assignation(s) au total</p>
        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex justify-end">
          <button type="submit" disabled={saving || assignments.length === 0}
            className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Enregistrement...' : 'Enregistrer et continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 7: Assessment Configuration ────────────────────────
function Step7Assessments({ onNext }) {
  const [levels, setLevels] = useState([])
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const res = await api.get('/api/onboarding/assessment-data')
      const lvls = res.data.levels || []
      setLevels(lvls)
      const cfg = {}
      lvls.forEach(l => { cfg[l.id] = { level_id: l.id, interrogations: 4, devoirs: 1, compositions: 1, max_score: 20 } })
      setConfig(cfg)
      setLoading(false)
    }
    load()
  }, [])

  function updateConfig(levelId, field, value) {
    setConfig(prev => ({ ...prev, [levelId]: { ...prev[levelId], [field]: parseInt(value) || 0 } }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post('/api/onboarding/step7', { config: Object.values(config) })
      onNext()
    } catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  if (loading) return <div className="text-center py-8"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" /></div>

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Configuration des évaluations</h2>
      <p className="text-sm text-steel-500 mb-6">Définissez le nombre d'évaluations par trimestre pour chaque niveau.</p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200 bg-steel-50">
                <th className="text-left px-4 py-2.5 text-steel-500 font-medium text-xs">Niveau</th>
                <th className="text-center px-3 py-2.5 text-steel-500 font-medium text-xs">Interrogations</th>
                <th className="text-center px-3 py-2.5 text-steel-500 font-medium text-xs">Devoirs</th>
                <th className="text-center px-3 py-2.5 text-steel-500 font-medium text-xs">Compositions</th>
                <th className="text-center px-3 py-2.5 text-steel-500 font-medium text-xs">Note /</th>
              </tr>
            </thead>
            <tbody>
              {levels.map(l => {
                const c = config[l.id] || {}
                return (
                  <tr key={l.id} className="border-b border-steel-100">
                    <td className="px-4 py-2.5 text-steel-700 font-medium">{l.name}</td>
                    <td className="px-3 py-2.5 text-center">
                      <select value={c.interrogations || 4} onChange={e => updateConfig(l.id, 'interrogations', e.target.value)}
                        className="w-14 px-1 py-1 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand bg-white">
                        {[0,1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <select value={c.devoirs || 1} onChange={e => updateConfig(l.id, 'devoirs', e.target.value)}
                        className="w-14 px-1 py-1 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand bg-white">
                        {[0,1,2,3].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <select value={c.compositions || 1} onChange={e => updateConfig(l.id, 'compositions', e.target.value)}
                        className="w-14 px-1 py-1 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand bg-white">
                        {[0,1,2].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <select value={c.max_score || 20} onChange={e => updateConfig(l.id, 'max_score', e.target.value)}
                        className="w-14 px-1 py-1 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand bg-white">
                        {[10,20,100].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-steel-400">Ces paramètres seront appliqués automatiquement lors de la création des classes.</p>
        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Enregistrement...' : 'Enregistrer et continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 8: Classrooms ──────────────────────────────────────
function Step8Classrooms({ onNext }) {
  const [levels, setLevels] = useState([])
  const [series, setSeries] = useState([])
  const [classrooms, setClassrooms] = useState([])
  const [totalRooms, setTotalRooms] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const res = await api.get('/api/onboarding/classroom-data')
      setLevels(res.data.levels || [])
      setSeries(res.data.series || [])
      if (res.data.total_rooms) setTotalRooms(res.data.total_rooms)
      if (res.data.existing_classrooms?.length > 0) {
        setClassrooms(res.data.existing_classrooms.map(c => ({
          label: c.label, level_id: c.level_id, serie_id: c.serie_id, capacity: c.capacity, expected_tuition: c.expected_tuition,
        })))
      }
      setLoading(false)
    }
    load()
  }, [])

  function addClassroom() {
    setClassrooms(prev => [...prev, { label: '', level_id: levels[0]?.id || '', serie_id: null, capacity: 50, expected_tuition: 0 }])
  }

  function updateClassroom(index, field, value) {
    setClassrooms(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c))
  }

  function removeClassroom(index) {
    setClassrooms(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const valid = classrooms.filter(c => c.label.trim() && c.level_id)
    if (valid.length === 0) { setError('Ajoutez au moins une classe'); return }
    setError('')
    setSaving(true)
    try {
      await api.post('/api/onboarding/step8', { classrooms: valid, total_rooms: parseInt(totalRooms) || 0 })
      onNext()
    } catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  if (loading) return <div className="text-center py-8"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" /></div>

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Classes</h2>
      <p className="text-sm text-steel-500 mb-6">Créez les classes pour cette année scolaire. Les modèles d'évaluation seront générés automatiquement.</p>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Room count */}
        <div className="bg-white rounded-xl border border-steel-200 p-4 flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-xs text-steel-500 mb-1">Nombre de salles disponibles</label>
            <input type="number" min="0" value={totalRooms} onChange={e => setTotalRooms(e.target.value)}
              placeholder="Ex: 10"
              className="w-32 px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
          </div>
          <p className="text-xs text-steel-400 flex-1">Ce nombre sera utilisé pour vous alerter si vous créez plus de classes que de salles disponibles.</p>
        </div>

        {/* Warning if more classrooms than rooms */}
        {totalRooms && parseInt(totalRooms) > 0 && classrooms.length > parseInt(totalRooms) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
            <svg className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-xs text-yellow-700">
              Vous avez <strong>{classrooms.length} classes</strong> pour <strong>{totalRooms} salles</strong> disponibles.
              Vous pouvez continuer, mais envisagez d'augmenter la capacité par classe ou d'ajouter des salles.
            </p>
          </div>
        )}
        {classrooms.map((c, i) => {
          const levelSeries = series.filter(s => s.level_id === parseInt(c.level_id))
          const level = levels.find(l => l.id === parseInt(c.level_id))
          return (
            <div key={i} className="bg-white rounded-xl border border-steel-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-steel-400">Classe {i + 1}</span>
                <button type="button" onClick={() => removeClassroom(i)} className="text-xs text-red-400 hover:text-red-500">Supprimer</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-steel-500 mb-1">Nom de la classe <span className="text-red-500">*</span></label>
                  <input type="text" value={c.label} onChange={e => updateClassroom(i, 'label', e.target.value)}
                    placeholder={level ? `${level.name} A` : 'Ex: 6ème A'}
                    className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
                </div>
                <div>
                  <label className="block text-xs text-steel-500 mb-1">Niveau <span className="text-red-500">*</span></label>
                  <select value={c.level_id} onChange={e => updateClassroom(i, 'level_id', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
                    {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                {levelSeries.length > 0 && (
                  <div>
                    <label className="block text-xs text-steel-500 mb-1">Série</label>
                    <select value={c.serie_id || ''} onChange={e => updateClassroom(i, 'serie_id', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
                      <option value="">— Aucune —</option>
                      {levelSeries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-steel-500 mb-1">Capacité</label>
                  <input type="number" value={c.capacity} onChange={e => updateClassroom(i, 'capacity', parseInt(e.target.value) || 50)}
                    className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
                </div>
                <div>
                  <label className="block text-xs text-steel-500 mb-1">Scolarité attendue (XOF)</label>
                  <input type="number" value={c.expected_tuition} onChange={e => updateClassroom(i, 'expected_tuition', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
                </div>
              </div>
            </div>
          )
        })}

        <button type="button" onClick={addClassroom}
          className="w-full py-3 border border-dashed border-steel-300 rounded-xl text-sm text-steel-500 hover:border-brand hover:text-brand transition-colors">
          + Ajouter une classe
        </button>

        <p className="text-xs text-steel-400">{classrooms.length} classe(s)</p>
        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving || classrooms.length === 0}
            className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Création...' : 'Créer les classes et continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Placeholder for steps 9-13 ─────────────────────────────
function StepPlaceholder({ step }) {
  return (
    <div className="max-w-lg mx-auto text-center py-12">
      <div className="w-16 h-16 bg-steel-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-2xl text-steel-400">{step}</span>
      </div>
      <h2 className="text-lg font-medium text-steel-900 mb-1">{STEP_LABELS[step - 1]}</h2>
      <p className="text-sm text-steel-500">Cette étape sera implémentée dans la phase 3{step <= 11 ? 'H' : 'I'}.</p>
    </div>
  )
}

// ─── Main Wizard ─────────────────────────────────────────────
export default function OnboardingWizard({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(1)
  const [school, setSchool] = useState(null)
  const [license, setLicense] = useState(null)
  const [features, setFeatures] = useState([])
  const [size, setSize] = useState(null)
  const [semesters, setSemesters] = useState(3)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await api.get('/api/onboarding/status')
        setCurrentStep(res.data.current_step)
        setSchool(res.data.school)
        setLicense(res.data.license)
        setFeatures(res.data.features || [])
        setSize(res.data.size || null)
        setSemesters(res.data.semesters_active || 3)

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
      case 1: return <Step1Confirm school={school} license={license} features={features} size={size} semesters={semesters} onNext={advance} />
      case 2: return <Step2Accounts license={license} onNext={advance} />
      case 3: return <Step3AcademicYear onNext={advance} />
      case 4: return <Step4Levels onNext={advance} />
      case 5: return <Step5Series onNext={advance} />
      case 6: return <Step6Subjects onNext={advance} />
      case 7: return <Step7Assessments onNext={advance} />
      case 8: return <Step8Classrooms onNext={advance} />
      default: return <StepPlaceholder step={currentStep} />
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
