import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../utils/api'

export default function ClassroomDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [classroom, setClassroom] = useState(null)
  const [students, setStudents] = useState([])
  const [teachers, setTeachers] = useState([])
  const [allClassrooms, setAllClassrooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('students')
  const [selected, setSelected] = useState([])
  const [showBulkMove, setShowBulkMove] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})

  async function fetchData() {
    const [detailRes, listRes] = await Promise.all([
      api.get(`/api/classrooms/${id}`),
      api.get('/api/classrooms'),
    ])
    setClassroom(detailRes.data.classroom)
    setStudents(detailRes.data.students || [])
    setTeachers(detailRes.data.teachers || [])
    setAllClassrooms((listRes.data.classrooms || []).filter(c => c.id !== parseInt(id)))
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

  function toggleSelect(sid) {
    setSelected(prev => prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid])
  }

  function toggleAll() {
    setSelected(prev => prev.length === students.length ? [] : students.map(s => s.id))
  }

  async function moveStudent(studentId, targetId) {
    await api.post(`/api/students/${studentId}/transfer`, { classroom_id: targetId })
    setSelected([])
    fetchData()
  }

  async function bulkMove(targetId) {
    await api.post(`/api/classrooms/${id}/bulk-transfer`, { student_ids: selected, target_classroom_id: targetId })
    setSelected([])
    setShowBulkMove(false)
    fetchData()
  }

  async function saveEdit() {
    await api.put(`/api/classrooms/${id}`, editForm)
    setEditing(false)
    fetchData()
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  if (!classroom) return <p className="text-steel-500 py-20 text-center">Classe introuvable</p>

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/classrooms')} className="text-xs text-steel-400 hover:text-steel-600 mb-2 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Retour aux classes
        </button>
        <div className="flex items-start justify-between">
          <div>
            {!editing ? (
              <>
                <h1 className="text-xl font-medium text-steel-900">{classroom.label}</h1>
                <p className="text-sm text-steel-500 mt-0.5">{classroom.level_name} · {students.length}/{classroom.capacity} élèves</p>
              </>
            ) : (
              <div className="flex gap-3 items-end">
                <div>
                  <label className="block text-xs text-steel-500 mb-1">Nom</label>
                  <input type="text" value={editForm.label || ''} onChange={e => setEditForm(p => ({ ...p, label: e.target.value }))}
                    className="px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
                </div>
                <div>
                  <label className="block text-xs text-steel-500 mb-1">Capacité</label>
                  <input type="number" value={editForm.capacity || ''} onChange={e => setEditForm(p => ({ ...p, capacity: parseInt(e.target.value) || 0 }))}
                    className="w-20 px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
                </div>
                <button onClick={saveEdit} className="px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-medium">Enregistrer</button>
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-steel-400 text-xs">Annuler</button>
              </div>
            )}
          </div>
          {!editing && (
            <button onClick={() => { setEditing(true); setEditForm({ label: classroom.label, capacity: classroom.capacity }) }}
              className="px-3 py-1.5 border border-steel-200 text-steel-600 rounded-lg text-xs font-medium hover:bg-steel-50">Modifier</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-steel-200">
        {[
          { key: 'students', label: `Élèves (${students.length})` },
          { key: 'teachers', label: `Enseignants (${teachers.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-brand text-brand' : 'border-transparent text-steel-500 hover:text-steel-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Students Tab */}
      {tab === 'students' && (
        <div>
          {selected.length > 0 && (
            <div className="bg-brand-50 border border-brand-100 rounded-lg p-3 mb-4 flex items-center justify-between">
              <p className="text-sm text-brand-600">{selected.length} élève(s) sélectionné(s)</p>
              <button onClick={() => setShowBulkMove(true)}
                className="px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-medium">Déplacer vers...</button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-steel-200 overflow-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-steel-200 bg-steel-50">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={selected.length === students.length && students.length > 0}
                      onChange={toggleAll} className="rounded border-steel-300 text-brand focus:ring-brand" />
                  </th>
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Matricule</th>
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Nom complet</th>
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Sexe</th>
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-steel-400">Aucun élève dans cette classe</td></tr>
                ) : students.map(s => (
                  <tr key={s.id} className="border-b border-steel-100 hover:bg-steel-50 transition-colors">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleSelect(s.id)}
                        className="rounded border-steel-300 text-brand focus:ring-brand" />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-brand-600">{s.matricule || '—'}</td>
                    <td className="px-4 py-3 text-steel-800 font-medium cursor-pointer hover:text-brand" onClick={() => navigate(`/students/${s.id}`)}>
                      {s.full_name}
                    </td>
                    <td className="px-4 py-3 text-steel-600">{s.gender || '—'}</td>
                    <td className="px-4 py-3">
                      <MoveDropdown classrooms={allClassrooms} onMove={(targetId) => moveStudent(s.id, targetId)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Teachers Tab */}
      {tab === 'teachers' && (
        <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
          {teachers.length === 0 ? (
            <p className="px-4 py-8 text-center text-steel-400 text-sm">Aucun enseignant assigné</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-steel-200 bg-steel-50">
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Matière</th>
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Enseignant</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((t, i) => (
                  <tr key={i} className="border-b border-steel-100">
                    <td className="px-4 py-3 text-steel-800">{t.subject_name}</td>
                    <td className="px-4 py-3 text-steel-600">{t.teacher_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Bulk Move Modal */}
      {showBulkMove && (
        <BulkMoveModal
          count={selected.length}
          classrooms={allClassrooms}
          onClose={() => setShowBulkMove(false)}
          onMove={bulkMove}
        />
      )}
    </div>
  )
}

function MoveDropdown({ classrooms, onMove }) {
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const btnRef = useRef(null)

  function handleOpen() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setOpenUp(window.innerHeight - rect.bottom < 200)
    }
    setOpen(!open)
  }

  if (classrooms.length === 0) return null

  return (
    <div className="relative">
      <button ref={btnRef} onClick={handleOpen} className="text-xs text-steel-400 hover:text-steel-600">Déplacer</button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={`absolute right-0 bg-white border border-steel-200 rounded-lg shadow-lg z-20 py-1 w-48 max-h-48 overflow-y-auto ${openUp ? 'bottom-6' : 'top-6'}`}>
            {classrooms.map(c => (
              <button key={c.id} onClick={() => { onMove(c.id); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-xs text-steel-700 hover:bg-steel-50">
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function BulkMoveModal({ count, classrooms, onClose, onMove }) {
  const [target, setTarget] = useState(classrooms[0]?.id || '')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!target) return
    setSaving(true)
    await onMove(parseInt(target))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-medium text-steel-900 mb-2">Déplacer {count} élève(s)</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Classe cible</label>
            <select value={target} onChange={e => setTarget(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
              {classrooms.map(c => <option key={c.id} value={c.id}>{c.label} ({c.student_count}/{c.capacity})</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">Annuler</button>
            <button type="submit" disabled={saving || !target} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
              {saving ? 'Déplacement...' : 'Déplacer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
