import { useState, useEffect, useRef } from 'react'
import api from '../../utils/api'

const today = () => new Date().toISOString().slice(0, 10)

export default function AttendancePage() {
  const [date, setDate] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const savedEdits = useRef({})

  function load(d) {
    setLoading(true)
    setError('')
    api.get(`/api/attendance?date=${d}`).then(res => {
      setData(res.data)
      const init = {}
      res.data.teachers.forEach(t => {
        if (t.log) {
          init[t.id] = {
            status: t.log.status,
            hours_credited: String(t.log.hours_credited ?? t.hours_scheduled),
            notes: t.log.notes || '',
          }
        }
      })
      setEdits(init)
      savedEdits.current = init
      setLoading(false)
    }).catch(() => { setError('Impossible de charger les données'); setLoading(false) })
  }

  useEffect(() => { load(date) }, [date])

  function setStatus(teacherId, status, hoursScheduled) {
    setEdits(prev => {
      const existing = prev[teacherId] || {}
      return {
        ...prev,
        [teacherId]: {
          status,
          hours_credited: existing.hours_credited !== undefined ? existing.hours_credited : String(hoursScheduled || 0),
          notes: existing.notes || '',
        },
      }
    })
    setSaved(false)
  }

  function setField(teacherId, field, value) {
    setEdits(prev => ({ ...prev, [teacherId]: { ...(prev[teacherId] || {}), [field]: value } }))
    setSaved(false)
  }

  function markAllPresent() {
    const next = {}
    data.teachers.filter(t => t.has_slots).forEach(t => {
      next[t.id] = {
        status: 'present',
        hours_credited: String(t.hours_scheduled || 0),
        notes: edits[t.id]?.notes || '',
      }
    })
    setEdits(prev => ({ ...prev, ...next }))
    setSaved(false)
  }

  async function save() {
    const entries = Object.entries(edits)
      .filter(([, e]) => e.status)
      .map(([teacherId, e]) => ({
        teacher_id: parseInt(teacherId),
        log_date: date,
        status: e.status,
        hours_credited: parseFloat(e.hours_credited) || 0,
        notes: e.notes || null,
      }))
    if (entries.length === 0) { setError('Aucune entrée à enregistrer'); return }
    setSaving(true); setError('')
    try {
      await api.post('/api/attendance', { entries })
      setSaved(true)
      load(date)
    } catch {
      setError("Erreur lors de l'enregistrement")
    }
    setSaving(false)
  }

  const withSlots = data?.teachers.filter(t => t.has_slots) || []
  const withoutSlots = data?.teachers.filter(t => !t.has_slots) || []
  const recordedCount = Object.values(edits).filter(e => e.status).length
  const isDirty = JSON.stringify(edits) !== JSON.stringify(savedEdits.current)

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Présences</h1>
          <p className="text-sm text-steel-500 mt-0.5">Feuille de présence des enseignants</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); setSaved(false) }}
            className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand"
          />
          {withSlots.length > 0 && (
            <button onClick={markAllPresent}
              className="px-3 py-2 border border-steel-200 text-steel-700 hover:bg-steel-50 rounded-lg text-sm font-medium transition-colors">
              Tous présents
            </button>
          )}
          <button onClick={save} disabled={saving || recordedCount === 0 || !isDirty}
            className="px-4 py-2 bg-brand hover:bg-brand-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Enregistrement...' : isDirty ? `Enregistrer (${recordedCount})` : 'Enregistré'}
          </button>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      {saved && <p className="text-brand text-sm mb-4">Présences enregistrées.</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {withSlots.length > 0 && (
            <div className="bg-white rounded-xl border border-steel-200 overflow-hidden mb-4">
              <div className="px-4 py-3 border-b border-steel-200 bg-steel-50">
                <h2 className="text-sm font-medium text-steel-700">
                  Enseignants avec cours ce jour <span className="text-steel-400 font-normal">({withSlots.length})</span>
                </h2>
              </div>
              <TeacherTable teachers={withSlots} edits={edits} onStatus={setStatus} onField={setField} />
            </div>
          )}

          {withoutSlots.length > 0 && (
            <div className="bg-white rounded-xl border border-steel-200 overflow-hidden opacity-60">
              <div className="px-4 py-3 border-b border-steel-200 bg-steel-50">
                <h2 className="text-sm font-medium text-steel-500">
                  Sans cours ce jour <span className="font-normal">({withoutSlots.length})</span>
                </h2>
              </div>
              <TeacherTable teachers={withoutSlots} edits={edits} onStatus={setStatus} onField={setField} />
            </div>
          )}

          {data?.teachers.length === 0 && (
            <p className="text-steel-400 text-sm text-center py-12">Aucun enseignant actif trouvé</p>
          )}
        </>
      )}
    </div>
  )
}

function TeacherTable({ teachers, edits, onStatus, onField }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-steel-100">
          <th className="text-left px-4 py-2.5 text-steel-500 font-medium text-xs">Enseignant</th>
          <th className="text-center px-4 py-2.5 text-steel-500 font-medium text-xs w-24">Prévu</th>
          <th className="text-center px-4 py-2.5 text-steel-500 font-medium text-xs w-44">Statut</th>
          <th className="text-center px-4 py-2.5 text-steel-500 font-medium text-xs w-28">H. créditées</th>
          <th className="text-left px-4 py-2.5 text-steel-500 font-medium text-xs">Notes</th>
        </tr>
      </thead>
      <tbody>
        {teachers.map(t => {
          const edit = edits[t.id]
          const status = edit?.status || null
          return (
            <tr key={t.id} className={`border-b border-steel-50 transition-colors ${status === 'absent' ? 'bg-red-50/40' : status === 'present' ? 'bg-brand-50/20' : ''}`}>
              <td className="px-4 py-3">
                <p className="font-medium text-steel-800">{t.full_name}</p>
                {t.matricule && <p className="text-[10px] text-steel-400">{t.matricule}</p>}
              </td>
              <td className="px-4 py-3 text-center text-steel-500 text-xs">
                {t.hours_scheduled > 0 ? `${t.hours_scheduled}h` : '—'}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1 justify-center">
                  <button
                    onClick={() => onStatus(t.id, 'present', t.hours_scheduled)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${status === 'present' ? 'bg-brand text-white border-brand' : 'bg-white text-steel-500 border-steel-200 hover:border-brand hover:text-brand'}`}>
                    Présent
                  </button>
                  <button
                    onClick={() => onStatus(t.id, 'absent', t.hours_scheduled)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${status === 'absent' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-steel-500 border-steel-200 hover:border-red-400 hover:text-red-500'}`}>
                    Absent
                  </button>
                </div>
              </td>
              <td className="px-4 py-3 text-center">
                {status === 'present' ? (
                  <input
                    type="number" min="0" max="12" step="0.5"
                    value={edit?.hours_credited ?? t.hours_scheduled}
                    onChange={e => onField(t.id, 'hours_credited', e.target.value)}
                    className="w-20 px-2 py-1 border border-steel-200 rounded text-sm text-center focus:outline-none focus:border-brand"
                  />
                ) : (
                  <span className="text-steel-300 text-xs">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <input
                  type="text"
                  value={edit?.notes || ''}
                  onChange={e => onField(t.id, 'notes', e.target.value)}
                  placeholder="Optionnel"
                  className="w-full px-2 py-1 border border-steel-200 rounded text-xs focus:outline-none focus:border-brand bg-transparent"
                />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
