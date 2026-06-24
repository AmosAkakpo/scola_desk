import { useState, useEffect, useCallback } from 'react'
import api from '../../utils/api'
import { useAuth } from '../../context/AuthContext.jsx'

const DAY_LABELS = { 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi', 7: 'Dimanche' }

const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const toTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

// Deterministic soft color per subject name
function subjectColor(name) {
  const palette = [
    'bg-brand-50 border-brand-200 text-brand-700',
    'bg-blue-50 border-blue-200 text-blue-700',
    'bg-amber-50 border-amber-200 text-amber-700',
    'bg-violet-50 border-violet-200 text-violet-700',
    'bg-rose-50 border-rose-200 text-rose-700',
    'bg-teal-50 border-teal-200 text-teal-700',
    'bg-indigo-50 border-indigo-200 text-indigo-700',
    'bg-lime-50 border-lime-200 text-lime-700',
  ]
  let h = 0
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

export default function TimetablePage() {
  const { user } = useAuth()
  const [tab, setTab] = useState('class')
  const [config, setConfig] = useState(null)
  const [classrooms, setClassrooms] = useState([])
  const [teachers, setTeachers] = useState([])
  const [classId, setClassId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [data, setData] = useState(null) // {entries, subjects?} for current view
  const [loading, setLoading] = useState(true)
  const [addCtx, setAddCtx] = useState(null) // {day, start}
  const [showConfig, setShowConfig] = useState(false)

  useEffect(() => {
    Promise.all([api.get('/api/timetable/config'), api.get('/api/timetable/options')]).then(([cfg, opt]) => {
      setConfig(cfg.data)
      setClassrooms(opt.data.classrooms || [])
      setTeachers(opt.data.teachers || [])
      if (opt.data.classrooms?.length) setClassId(String(opt.data.classrooms[0].id))
      if (opt.data.teachers?.length) setTeacherId(String(opt.data.teachers[0].id))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const loadGrid = useCallback(async () => {
    if (tab === 'class' && classId) {
      const res = await api.get(`/api/timetable/class/${classId}`)
      setData(res.data)
    } else if (tab === 'teacher' && teacherId) {
      const res = await api.get(`/api/timetable/teacher/${teacherId}`)
      setData(res.data)
    }
  }, [tab, classId, teacherId])

  useEffect(() => { loadGrid() }, [loadGrid])

  if (loading || !config) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>

  const startMin = toMin(config.day_start)
  const endMin = toMin(config.day_end)
  const slots = []
  for (let m = startMin; m < endMin; m += 30) slots.push(m)
  const days = config.days || [1, 2, 3, 4, 5, 6]

  // Build per-day cover map from entries
  function buildCover(entries) {
    const cover = {}
    for (const d of days) cover[d] = new Array(slots.length).fill(null)
    for (const e of entries) {
      const s = (toMin(e.start_time) - startMin) / 30
      let span = (toMin(e.end_time) - toMin(e.start_time)) / 30
      if (s < 0 || s >= slots.length) continue
      span = Math.min(span, slots.length - s)
      if (!cover[e.day_of_week]) continue
      cover[e.day_of_week][s] = { type: 'start', entry: e, span }
      for (let i = 1; i < span; i++) cover[e.day_of_week][s + i] = { type: 'covered' }
    }
    return cover
  }

  const entries = data?.entries || []
  const cover = buildCover(entries)

  async function deleteEntry(id) {
    await api.delete(`/api/timetable/entry/${id}`)
    loadGrid()
  }

  function printView() {
    const title = tab === 'class'
      ? `Emploi du temps — ${data?.classroom?.label || ''}`
      : `Emploi du temps — ${data?.teacher?.full_name || ''}`
    const w = window.open('', '_blank')
    const rows = slots.map((m, si) => {
      const tds = days.map(d => {
        const cell = cover[d][si]
        if (cell?.type === 'covered') return ''
        if (cell?.type === 'start') {
          const e = cell.entry
          const second = tab === 'class' ? (e.teacher_name || '') : (e.classroom_label || '')
          return `<td rowspan="${cell.span}" class="ent">${e.subject_name}<br><small>${second}${e.room ? ' · ' + e.room : ''}</small></td>`
        }
        return '<td></td>'
      }).join('')
      return `<tr><th class="t">${toTime(m)}</th>${tds}</tr>`
    }).join('')
    w.document.write(`<html><head><title>${title}</title><style>
      body{font-family:Arial,sans-serif;padding:16px}
      h2{margin:0 0 12px}
      table{border-collapse:collapse;width:100%;font-size:11px}
      th,td{border:1px solid #cbd5e1;padding:4px;text-align:center;vertical-align:middle}
      th.t{background:#f1f5f9;width:54px;font-weight:normal;color:#475569}
      thead th{background:#f1f5f9}
      td.ent{background:#ecfdf5;font-weight:600}
      td.ent small{font-weight:400;color:#475569}
      @media print{@page{size:landscape}}
    </style></head><body><h2>${title}</h2>
    <table><thead><tr><th class="t"></th>${days.map(d => `<th>${DAY_LABELS[d]}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table></body></html>`)
    w.document.close(); w.focus(); w.print()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Emploi du temps</h1>
          <p className="text-sm text-steel-500 mt-0.5">Grille de 30 min · {config.day_start}–{config.day_end}</p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === 'admin' && (
            <button onClick={() => setShowConfig(true)} className="px-3 py-2 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">Réglages</button>
          )}
          <button onClick={printView} className="px-3 py-2 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">Imprimer</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-steel-200 mb-4">
        {[{ k: 'class', l: 'Par classe' }, { k: 'teacher', l: 'Par enseignant' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.k ? 'border-brand text-brand' : 'border-transparent text-steel-500 hover:text-steel-700'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Picker */}
      <div className="mb-4">
        {tab === 'class' ? (
          <select value={classId} onChange={e => setClassId(e.target.value)}
            className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
            {classrooms.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        ) : (
          <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
            className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
            {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        )}
      </div>

      {/* Grid */}
      <div className="bg-white rounded-xl border border-steel-200 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-steel-50 border-b border-steel-200 w-14 py-2 text-steel-400 font-medium z-10"></th>
              {days.map(d => (
                <th key={d} className="border-b border-l border-steel-200 bg-steel-50 py-2 text-steel-600 font-medium">{DAY_LABELS[d]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((m, si) => (
              <tr key={m}>
                <td className="sticky left-0 bg-white border-b border-steel-100 text-steel-400 text-[10px] text-center align-top py-1 w-14">{toTime(m)}</td>
                {days.map(d => {
                  const cell = cover[d][si]
                  if (cell?.type === 'covered') return null
                  if (cell?.type === 'start') {
                    const e = cell.entry
                    const second = tab === 'class' ? e.teacher_name : e.classroom_label
                    return (
                      <td key={d} rowSpan={cell.span} className="border-b border-l border-steel-100 p-1 align-top">
                        <div className={`h-full rounded-md border px-2 py-1 text-[11px] leading-tight relative group ${subjectColor(e.subject_name)}`}>
                          <p className="font-semibold truncate">{e.subject_name}</p>
                          <p className="truncate opacity-80">{second || '—'}</p>
                          <p className="opacity-60">{e.start_time}–{e.end_time}{e.room ? ` · ${e.room}` : ''}</p>
                          {tab === 'class' && (
                            <button onClick={() => deleteEntry(e.id)}
                              className="absolute top-0.5 right-0.5 w-4 h-4 rounded bg-white/70 text-steel-400 hover:text-red-500 hidden group-hover:flex items-center justify-center text-[10px]">✕</button>
                          )}
                        </div>
                      </td>
                    )
                  }
                  // empty
                  return (
                    <td key={d} className="border-b border-l border-steel-100 h-7 p-0.5">
                      {tab === 'class' && (
                        <button onClick={() => setAddCtx({ day: d, start: toTime(m) })}
                          className="w-full h-full min-h-[24px] rounded text-steel-200 hover:bg-brand-50 hover:text-brand text-sm">+</button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tab === 'class' && addCtx && (
        <AddEntryModal ctx={addCtx} classId={classId} subjects={data?.subjects || []} config={config}
          onClose={() => setAddCtx(null)} onDone={() => { setAddCtx(null); loadGrid() }} />
      )}

      {showConfig && <ConfigModal config={config} onClose={() => setShowConfig(false)} onSaved={(c) => { setConfig(c); setShowConfig(false) }} />}
    </div>
  )
}

function AddEntryModal({ ctx, classId, subjects, config, onClose, onDone }) {
  const startMin = toMin(config.day_start), endMin = toMin(config.day_end)
  const ticks = []
  for (let m = startMin; m <= endMin; m += 30) ticks.push(toTime(m))

  const [subjectId, setSubjectId] = useState('')
  const [start, setStart] = useState(ctx.start)
  const [end, setEnd] = useState(toTime(Math.min(toMin(ctx.start) + 60, endMin)))
  const [room, setRoom] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selSubject = subjects.find(s => String(s.subject_id) === String(subjectId))

  async function submit(e) {
    e.preventDefault()
    if (!subjectId) { setError('Choisissez une matière'); return }
    if (start >= end) { setError('L\'heure de fin doit suivre le début'); return }
    setError(''); setSaving(true)
    try {
      await api.post('/api/timetable/entry', {
        classroom_id: parseInt(classId), day_of_week: ctx.day,
        start_time: start, end_time: end, subject_id: parseInt(subjectId), room: room.trim() || null,
      })
      onDone()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-medium text-steel-900 mb-1">Ajouter un cours</h2>
        <p className="text-sm text-steel-500 mb-4">{DAY_LABELS[ctx.day]}</p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Matière</label>
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
              <option value="">— Choisir —</option>
              {subjects.map(s => <option key={s.subject_id} value={s.subject_id}>{s.subject_name}</option>)}
            </select>
            {selSubject && (
              <p className="text-xs mt-1 text-steel-500">Enseignant : {selSubject.teacher_name || <span className="text-amber-600">non assigné</span>}</p>
            )}
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-steel-500 mb-1">Début</label>
              <select value={start} onChange={e => setStart(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
                {ticks.slice(0, -1).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-steel-500 mb-1">Fin</label>
              <select value={end} onChange={e => setEnd(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
                {ticks.filter(t => t > start).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Salle (optionnel)</label>
            <input type="text" value={room} onChange={e => setRoom(e.target.value)} placeholder="Ex: Salle 12"
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">Annuler</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium">{saving ? '...' : 'Ajouter'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ConfigModal({ config, onClose, onSaved }) {
  const ticks = []
  for (let m = 5 * 60; m <= 22 * 60; m += 30) ticks.push(toTime(m))
  const [dayStart, setDayStart] = useState(config.day_start)
  const [dayEnd, setDayEnd] = useState(config.day_end)
  const [days, setDays] = useState(config.days || [1, 2, 3, 4, 5, 6])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggleDay(d) { setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()) }

  async function save() {
    if (dayStart >= dayEnd) { setError('Plage horaire invalide'); return }
    setError(''); setSaving(true)
    try {
      await api.put('/api/timetable/config', { day_start: dayStart, day_end: dayEnd, days })
      onSaved({ day_start: dayStart, day_end: dayEnd, days })
    } catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-medium text-steel-900 mb-4">Réglages de l'emploi du temps</h2>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-steel-500 mb-1">Début de journée</label>
              <select value={dayStart} onChange={e => setDayStart(e.target.value)} className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
                {ticks.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-steel-500 mb-1">Fin de journée</label>
              <select value={dayEnd} onChange={e => setDayEnd(e.target.value)} className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
                {ticks.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1.5">Jours ouvrés</label>
            <div className="flex gap-1.5 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7].map(d => (
                <button key={d} onClick={() => toggleDay(d)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${days.includes(d) ? 'bg-brand text-white border-brand' : 'bg-white border-steel-200 text-steel-600 hover:bg-steel-50'}`}>
                  {DAY_LABELS[d].slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">Annuler</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium">{saving ? '...' : 'Enregistrer'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
