import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../utils/api'

const STATUS_LABELS = { active: 'Actif', graduated: 'Diplômé', transferred: 'Transféré', excluded: 'Exclu', deceased: 'Décédé' }

export default function StudentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [guardians, setGuardians] = useState([])
  const [history, setHistory] = useState([])
  const [enrollment, setEnrollment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [showTransfer, setShowTransfer] = useState(false)
  const [showAddGuardian, setShowAddGuardian] = useState(false)

  async function fetchData() {
    const res = await api.get(`/api/students/${id}`)
    setStudent(res.data.student)
    setGuardians(res.data.guardians || [])
    setHistory(res.data.history || [])
    setEnrollment(res.data.current_enrollment)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

  async function saveEdit(e) {
    e.preventDefault()
    await api.put(`/api/students/${id}`, editForm)
    setEditing(false)
    fetchData()
  }

  async function deleteGuardian(gid) {
    await api.delete(`/api/students/${id}/guardians/${gid}`)
    fetchData()
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  if (!student) return <p className="text-steel-500 py-20 text-center">Élève introuvable</p>

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => navigate('/students')} className="text-xs text-steel-400 hover:text-steel-600 mb-2 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Retour aux élèves
          </button>
          <h1 className="text-xl font-medium text-steel-900">{student.full_name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm font-mono text-brand-600">{student.matricule || '—'}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${student.status === 'active' ? 'bg-brand-50 text-brand-600' : 'bg-steel-100 text-steel-600'}`}>
              {STATUS_LABELS[student.status] || student.status}
            </span>
          </div>
          {enrollment && <p className="text-xs text-steel-400 mt-1">Classe: {enrollment.classroom_label}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTransfer(true)} className="px-3 py-1.5 border border-steel-200 text-steel-600 rounded-lg text-xs font-medium hover:bg-steel-50 transition-colors">
            Changer de classe
          </button>
        </div>
      </div>

      {/* Personal Info */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Informations personnelles</h2>
          {!editing ? (
            <button onClick={() => { setEditing(true); setEditForm({ full_name: student.full_name, birth_date: student.birth_date || '', birth_place: student.birth_place || '', gender: student.gender || '', national_student_number: student.national_student_number || '' }) }}
              className="text-xs text-brand hover:text-brand-600 font-medium">Modifier</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="text-xs text-steel-400">Annuler</button>
              <button onClick={saveEdit} className="text-xs text-brand font-medium">Enregistrer</button>
            </div>
          )}
        </div>
        {!editing ? (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><p className="text-steel-400 text-xs">Nom complet</p><p className="text-steel-800 font-medium">{student.full_name}</p></div>
            <div><p className="text-steel-400 text-xs">Date de naissance</p><p className="text-steel-800">{student.birth_date || '—'}</p></div>
            <div><p className="text-steel-400 text-xs">Lieu de naissance</p><p className="text-steel-800">{student.birth_place || '—'}</p></div>
            <div><p className="text-steel-400 text-xs">Sexe</p><p className="text-steel-800">{student.gender === 'M' ? 'Masculin' : student.gender === 'F' ? 'Féminin' : '—'}</p></div>
            <div><p className="text-steel-400 text-xs">N° national</p><p className="text-steel-800">{student.national_student_number || '—'}</p></div>
            <div><p className="text-steel-400 text-xs">Inscrit le</p><p className="text-steel-800">{student.created_at ? new Date(student.created_at).toLocaleDateString('fr-FR') : '—'}</p></div>
          </div>
        ) : (
          <form onSubmit={saveEdit} className="grid grid-cols-2 gap-3">
            {[
              { field: 'full_name', label: 'Nom complet', type: 'text' },
              { field: 'birth_date', label: 'Date de naissance', type: 'date' },
              { field: 'birth_place', label: 'Lieu de naissance', type: 'text' },
              { field: 'national_student_number', label: 'N° national', type: 'text' },
            ].map(f => (
              <div key={f.field}>
                <label className="block text-xs text-steel-500 mb-1">{f.label}</label>
                <input type={f.type} value={editForm[f.field] || ''} onChange={e => setEditForm(p => ({ ...p, [f.field]: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
              </div>
            ))}
            <div>
              <label className="block text-xs text-steel-500 mb-1">Sexe</label>
              <select value={editForm.gender || ''} onChange={e => setEditForm(p => ({ ...p, gender: e.target.value }))}
                className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
                <option value="">—</option><option value="M">Masculin</option><option value="F">Féminin</option>
              </select>
            </div>
          </form>
        )}
      </section>

      {/* Guardians */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Tuteurs</h2>
          <button onClick={() => setShowAddGuardian(true)} className="text-xs text-brand hover:text-brand-600 font-medium">+ Ajouter</button>
        </div>
        {guardians.length === 0 ? (
          <p className="text-sm text-steel-400 text-center py-4">Aucun tuteur enregistré</p>
        ) : (
          <div className="space-y-2">
            {guardians.map(g => (
              <div key={g.id} className="flex items-center justify-between py-2 border-b border-steel-50 last:border-0">
                <div>
                  <p className="text-sm text-steel-800 font-medium">{g.full_name} {g.is_primary === 1 && <span className="text-xs text-brand ml-1">Principal</span>}</p>
                  <p className="text-xs text-steel-500">{g.phone || '—'} {g.relationship && `· ${g.relationship}`}</p>
                </div>
                <button onClick={() => deleteGuardian(g.id)} className="text-xs text-red-400 hover:text-red-500">Retirer</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Academic History */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-4">Parcours scolaire</h2>
        {history.length === 0 ? (
          <p className="text-sm text-steel-400 text-center py-4">Aucun historique</p>
        ) : (
          <div className="space-y-3">
            {history.map((h, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-steel-50 last:border-0">
                <div className="w-2 h-2 rounded-full bg-brand mt-1.5 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-steel-800">{h.year_label} — {h.classroom} ({h.level})</p>
                    {h.verdict && <span className={`px-2 py-0.5 rounded text-xs font-medium ${h.verdict === 'admis' ? 'bg-brand-50 text-brand-600' : h.verdict === 'doublant' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>{h.verdict}</span>}
                  </div>
                  {h.semesters?.length > 0 && (
                    <div className="flex gap-4 mt-1">
                      {h.semesters.map(s => (
                        <span key={s.semester} className="text-xs text-steel-500">
                          T{s.semester}: {s.average?.toFixed(2) || '—'} ({s.rank ? `${s.rank}ème/${s.class_size}` : '—'})
                        </span>
                      ))}
                    </div>
                  )}
                  {h.final_average && <p className="text-xs text-steel-500 mt-0.5">Moyenne annuelle: {h.final_average.toFixed(2)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Transfer Modal */}
      {showTransfer && <TransferModal studentId={id} currentClassroom={enrollment?.classroom_id} onClose={() => setShowTransfer(false)} onDone={() => { setShowTransfer(false); fetchData() }} />}

      {/* Add Guardian Modal */}
      {showAddGuardian && <AddGuardianModal studentId={id} onClose={() => setShowAddGuardian(false)} onDone={() => { setShowAddGuardian(false); fetchData() }} />}
    </div>
  )
}

function TransferModal({ studentId, currentClassroom, onClose, onDone }) {
  const [classrooms, setClassrooms] = useState([])
  const [target, setTarget] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/api/classrooms').then(r => {
      const list = (r.data.classrooms || []).filter(c => c.id !== currentClassroom)
      setClassrooms(list)
      if (list.length > 0) setTarget(list[0].id)
    })
  }, [currentClassroom])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!target) return
    setSaving(true)
    await api.post(`/api/students/${studentId}/transfer`, { classroom_id: parseInt(target) })
    onDone()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-medium text-steel-900 mb-4">Changer de classe</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <select value={target} onChange={e => setTarget(e.target.value)}
            className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
            {classrooms.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">Annuler</button>
            <button type="submit" disabled={saving || !target} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
              {saving ? 'Transfert...' : 'Transférer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddGuardianModal({ studentId, onClose, onDone }) {
  const [form, setForm] = useState({ full_name: '', phone: '', relationship: '', is_primary: false })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.full_name.trim()) return
    setSaving(true)
    await api.post(`/api/students/${studentId}/guardians`, form)
    onDone()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-medium text-steel-900 mb-4">Ajouter un tuteur</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Nom complet <span className="text-red-500">*</span></label>
            <input type="text" required value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Téléphone</label>
            <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Lien de parenté</label>
            <input type="text" value={form.relationship} onChange={e => setForm(p => ({ ...p, relationship: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="Père, Mère, Oncle..." />
          </div>
          <label className="flex items-center gap-2 text-sm text-steel-600 cursor-pointer">
            <input type="checkbox" checked={form.is_primary} onChange={e => setForm(p => ({ ...p, is_primary: e.target.checked }))}
              className="rounded border-steel-300 text-brand focus:ring-brand" />
            Tuteur principal
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">Annuler</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
              {saving ? 'Ajout...' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
