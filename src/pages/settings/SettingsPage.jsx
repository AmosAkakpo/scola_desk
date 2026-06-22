import { useState, useEffect } from 'react'
import api from '../../utils/api'

export default function SettingsPage() {
  const [logo, setLogo] = useState(null)
  const [scale, setScale] = useState([])
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.get('/api/settings').then(res => {
      setScale(res.data.appreciation_scale || [])
      setSections(res.data.school_sections || [])
      setLogo(res.data.school_logo_path)
      setLoading(false)
    })
  }, [])

  function showMsg(text) { setMsg(text); setTimeout(() => setMsg(''), 2000) }

  // ─── Logo ──────────────────────────────────────────────────
  async function uploadLogo(file) {
    setSaving(p => ({ ...p, logo: true }))
    const buf = await file.arrayBuffer()
    const res = await api.post('/api/settings/school-logo', buf, { headers: { 'Content-Type': 'application/octet-stream' } })
    setLogo(res.data.path)
    setSaving(p => ({ ...p, logo: false }))
    showMsg('Logo enregistré')
  }

  async function removeLogo() {
    await api.delete('/api/settings/school-logo')
    setLogo(null)
    showMsg('Logo supprimé')
  }

  // ─── Appreciation Scale ────────────────────────────────────
  function updateScale(i, field, value) {
    setScale(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: field === 'label' ? value : parseFloat(value) || 0 } : s))
  }

  function addScaleRow() {
    setScale(prev => [...prev, { min: 0, max: 0, label: '' }])
  }

  function removeScaleRow(i) {
    setScale(prev => prev.filter((_, idx) => idx !== i))
  }

  async function saveScale() {
    setSaving(p => ({ ...p, scale: true }))
    await api.put('/api/settings/appreciation-scale', { scale })
    setSaving(p => ({ ...p, scale: false }))
    showMsg('Barème enregistré')
  }

  // ─── School Sections ───────────────────────────────────────
  function addSection() {
    setSections(prev => [...prev, { level_from: '', level_to: '', name: '' }])
  }

  function updateSection(i, field, value) {
    setSections(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  function removeSection(i) {
    setSections(prev => prev.filter((_, idx) => idx !== i))
  }

  async function saveSections() {
    setSaving(p => ({ ...p, sections: true }))
    await api.put('/api/settings/school-sections', { sections })
    setSaving(p => ({ ...p, sections: false }))
    showMsg('Sections enregistrées')
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium text-steel-900">Paramètres</h1>
        {msg && <span className="text-sm text-brand font-medium">{msg}</span>}
      </div>

      {/* Logo */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-4">Logo de l'école</h2>
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 bg-steel-100 rounded-xl flex items-center justify-center overflow-hidden border border-steel-200">
            {logo ? (
              <img src={`/api/settings/school-logo?t=${Date.now()}`} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <svg className="w-10 h-10 text-steel-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm text-steel-500">Utilisé sur les bulletins de notes. Format: PNG ou JPG, max 5 Mo.</p>
            <div className="flex gap-2">
              <label className="px-3 py-1.5 bg-brand hover:bg-brand-600 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors">
                {saving.logo ? 'Envoi...' : 'Choisir un fichier'}
                <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files[0]) uploadLogo(e.target.files[0]); e.target.value = '' }} />
              </label>
              {logo && (
                <button onClick={removeLogo} className="px-3 py-1.5 border border-steel-200 text-steel-500 rounded-lg text-xs font-medium hover:bg-steel-50">
                  Supprimer
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Appreciation Scale */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Barème d'appréciation</h2>
          <button onClick={saveScale} disabled={saving.scale}
            className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
            {saving.scale ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
        <p className="text-xs text-steel-500 mb-3">Définit l'appréciation automatique en fonction de la moyenne.</p>
        <div className="space-y-2">
          {scale.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-2">
                <input type="number" step="0.01" value={s.min} onChange={e => updateScale(i, 'min', e.target.value)}
                  placeholder="Min" className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs text-center focus:outline-none focus:border-brand" />
              </div>
              <span className="text-xs text-steel-400 text-center">—</span>
              <div className="col-span-2">
                <input type="number" step="0.01" value={s.max} onChange={e => updateScale(i, 'max', e.target.value)}
                  placeholder="Max" className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs text-center focus:outline-none focus:border-brand" />
              </div>
              <div className="col-span-6">
                <input type="text" value={s.label} onChange={e => updateScale(i, 'label', e.target.value)}
                  placeholder="Appréciation" className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
              </div>
              <button onClick={() => removeScaleRow(i)} className="text-red-400 hover:text-red-500 text-xs">✕</button>
            </div>
          ))}
        </div>
        <button onClick={addScaleRow}
          className="mt-2 w-full py-2 border border-dashed border-steel-300 rounded-lg text-xs text-steel-500 hover:border-brand hover:text-brand transition-colors">
          + Ajouter un palier
        </button>
      </section>

      {/* School Sections */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Sections de l'école</h2>
          <button onClick={saveSections} disabled={saving.sections}
            className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
            {saving.sections ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
        <p className="text-xs text-steel-500 mb-3">
          Nom officiel par tranche de niveaux. Utilisé sur l'en-tête des bulletins.
          Ex: "École Primaire Privée St Michel" pour CI–CM2, "Collège Privé St Michel" pour 6ème–3ème.
        </p>
        <div className="space-y-2">
          {sections.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-2">
                <input type="text" value={s.level_from} onChange={e => updateSection(i, 'level_from', e.target.value)}
                  placeholder="Du (ex: CI)" className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
              </div>
              <span className="text-xs text-steel-400 text-center">→</span>
              <div className="col-span-2">
                <input type="text" value={s.level_to} onChange={e => updateSection(i, 'level_to', e.target.value)}
                  placeholder="Au (ex: CM2)" className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
              </div>
              <div className="col-span-6">
                <input type="text" value={s.name} onChange={e => updateSection(i, 'name', e.target.value)}
                  placeholder="Nom officiel de la section" className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
              </div>
              <button onClick={() => removeSection(i)} className="text-red-400 hover:text-red-500 text-xs">✕</button>
            </div>
          ))}
        </div>
        <button onClick={addSection}
          className="mt-2 w-full py-2 border border-dashed border-steel-300 rounded-lg text-xs text-steel-500 hover:border-brand hover:text-brand transition-colors">
          + Ajouter une section
        </button>
      </section>

      {/* Academic Settings */}
      <AcademicSettings showMsg={showMsg} />
    </div>
  )
}

// ─── Academic Settings Component ─────────────────────────────
function AcademicSettings({ showMsg }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [assessConfigs, setAssessConfigs] = useState({})
  const [savingAssess, setSavingAssess] = useState(false)
  const [tab, setTab] = useState('assessments')

  function loadData() {
    api.get('/api/settings/academic').then(res => {
      setData(res.data)
      setAssessConfigs(res.data.assess_configs || {})
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  function updateAssessConfig(levelId, field, value) {
    setAssessConfigs(prev => ({ ...prev, [levelId]: { ...prev[levelId], [field]: parseInt(value) || 0 } }))
  }

  async function saveAssessConfigs() {
    setSavingAssess(true)
    const configs = Object.entries(assessConfigs).map(([levelId, cfg]) => ({ level_id: parseInt(levelId), ...cfg }))
    await api.put('/api/settings/assessment-config', { configs })
    setSavingAssess(false)
    showMsg('Configuration des évaluations enregistrée')
  }

  async function updateCoefficient(lsId, newCoef) {
    await api.put(`/api/settings/level-subject/${lsId}`, { coefficient: parseInt(newCoef) || 1 })
    loadData()
  }

  async function reassignTeacher(assignId, newTeacherId) {
    await api.put(`/api/settings/teacher-assignment/${assignId}`, { teacher_id: parseInt(newTeacherId) })
    loadData()
  }

  async function removeAssignment(assignId) {
    await api.delete(`/api/settings/teacher-assignment/${assignId}`)
    loadData()
  }

  if (loading) return null

  return (
    <>
      {/* Academic year info */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-4">Année académique</h2>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><p className="text-steel-400 text-xs">Année</p><p className="text-steel-800 font-medium">{data.academic_year?.label || '—'}</p></div>
          <div><p className="text-steel-400 text-xs">Période</p><p className="text-steel-800">{data.periode_type === 'trimestre' ? 'Trimestre (3)' : 'Semestre (2)'}</p></div>
          <div><p className="text-steel-400 text-xs">Dates</p><p className="text-steel-800">{data.academic_year?.start_date || '—'} → {data.academic_year?.end_date || '—'}</p></div>
        </div>
      </section>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
        <div className="flex border-b border-steel-200">
          {[
            { key: 'assessments', label: 'Évaluations' },
            { key: 'coefficients', label: 'Coefficients' },
            { key: 'assignments', label: 'Affectations enseignants' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-brand text-brand' : 'border-transparent text-steel-500 hover:text-steel-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Assessment config tab */}
          {tab === 'assessments' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-steel-500">Nombre d'évaluations par trimestre et par niveau</p>
                <button onClick={saveAssessConfigs} disabled={savingAssess}
                  className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium">
                  {savingAssess ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-steel-200">
                    <th className="text-left py-2 text-steel-500 font-medium">Niveau</th>
                    <th className="text-center py-2 text-steel-500 font-medium">Interrogations</th>
                    <th className="text-center py-2 text-steel-500 font-medium">Devoirs</th>
                    <th className="text-center py-2 text-steel-500 font-medium">Compositions</th>
                    <th className="text-center py-2 text-steel-500 font-medium">Note /</th>
                  </tr>
                </thead>
                <tbody>
                  {data.levels?.map(l => {
                    const c = assessConfigs[l.id] || {}
                    return (
                      <tr key={l.id} className="border-b border-steel-50">
                        <td className="py-2 text-steel-700 font-medium">{l.name}</td>
                        {['interrogations', 'devoirs', 'compositions'].map(field => (
                          <td key={field} className="py-2 text-center">
                            <select value={c[field] || 0} onChange={e => updateAssessConfig(l.id, field, e.target.value)}
                              className="w-14 px-1 py-1 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand bg-white">
                              {(field === 'interrogations' ? [0,1,2,3,4,5,6] : field === 'devoirs' ? [0,1,2,3] : [0,1,2]).map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </td>
                        ))}
                        <td className="py-2 text-center">
                          <select value={c.max_score || 20} onChange={e => updateAssessConfig(l.id, 'max_score', e.target.value)}
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
          )}

          {/* Coefficients tab */}
          {tab === 'coefficients' && (
            <div>
              <p className="text-xs text-steel-500 mb-4">Modifier les coefficients par matière et par niveau. Les changements sont immédiats.</p>
              {data.levels?.map(l => {
                const subs = data.level_subjects?.filter(ls => ls.level_id === l.id) || []
                if (subs.length === 0) return null
                return (
                  <div key={l.id} className="mb-4">
                    <p className="text-xs font-medium text-steel-700 mb-2">{l.name}</p>
                    <div className="space-y-1">
                      {subs.map(ls => (
                        <div key={ls.id} className="flex items-center gap-3">
                          <span className="text-xs text-steel-600 w-48">{ls.subject_name}</span>
                          <select value={ls.coefficient} onChange={e => updateCoefficient(ls.id, e.target.value)}
                            className="w-14 px-1 py-1 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand bg-white">
                            {[1,2,3,4,5,6].map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Teacher assignments tab */}
          {tab === 'assignments' && (
            <div>
              <p className="text-xs text-steel-500 mb-4">Réaffecter ou supprimer des enseignants par classe et matière.</p>
              {data.assignments?.length === 0 ? (
                <p className="text-sm text-steel-400 text-center py-4">Aucune affectation</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-steel-200">
                      <th className="text-left py-2 text-steel-500 font-medium">Classe</th>
                      <th className="text-left py-2 text-steel-500 font-medium">Matière</th>
                      <th className="text-left py-2 text-steel-500 font-medium">Enseignant</th>
                      <th className="text-center py-2 text-steel-500 font-medium w-16">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.assignments?.map(a => (
                      <tr key={a.id} className="border-b border-steel-50">
                        <td className="py-2 text-steel-700">{a.classroom_label}</td>
                        <td className="py-2 text-steel-600">{a.subject_name}</td>
                        <td className="py-2">
                          <select value={a.teacher_id} onChange={e => reassignTeacher(a.id, e.target.value)}
                            className="px-2 py-1 border border-steel-200 rounded text-xs focus:outline-none focus:border-brand bg-white">
                            {data.teachers?.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                          </select>
                        </td>
                        <td className="py-2 text-center">
                          <button onClick={() => removeAssignment(a.id)} className="text-red-400 hover:text-red-500 text-xs">Retirer</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
