import { useState, useEffect, useCallback } from 'react'
import api from '../../utils/api'
import { useAuth } from '../../context/AuthContext.jsx'

const DAY_LABELS = { 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi', 7: 'Dimanche' }
const ROW_H = 30 // px per 30-min slot

const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const toTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

function subjectColor(name) {
  const palette = [
    'bg-brand-100 border-brand-300 text-brand-800',
    'bg-blue-100 border-blue-300 text-blue-800',
    'bg-amber-100 border-amber-300 text-amber-800',
    'bg-violet-100 border-violet-300 text-violet-800',
    'bg-rose-100 border-rose-300 text-rose-800',
    'bg-teal-100 border-teal-300 text-teal-800',
    'bg-indigo-100 border-indigo-300 text-indigo-800',
    'bg-lime-100 border-lime-300 text-lime-800',
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
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
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
    if (tab === 'class' && classId) setData((await api.get(`/api/timetable/class/${classId}`)).data)
    else if (tab === 'teacher' && teacherId) setData((await api.get(`/api/timetable/teacher/${teacherId}`)).data)
  }, [tab, classId, teacherId])

  useEffect(() => { loadGrid() }, [loadGrid])

  if (loading || !config) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>

  const startMin = toMin(config.day_start), endMin = toMin(config.day_end)
  const slots = []
  for (let m = startMin; m < endMin; m += 30) slots.push(m)
  const days = config.days || [1, 2, 3, 4, 5, 6]
  const entries = data?.entries || []
  const blocks = entries.map(e => ({
    entry: e, day: e.day_of_week,
    topSlot: Math.max(0, (toMin(e.start_time) - startMin) / 30),
    span: Math.max(1, (toMin(e.end_time) - toMin(e.start_time)) / 30),
  }))

  async function deleteEntry(id) { await api.delete(`/api/timetable/entry/${id}`); loadGrid() }

  function printView() {
    const title = tab === 'class' ? `Emploi du temps — ${data?.classroom?.label || ''}` : `Emploi du temps — ${data?.teacher?.full_name || ''}`
    const cover = {}; for (const d of days) cover[d] = new Array(slots.length).fill(null)
    for (const b of blocks) {
      if (!cover[b.day]) continue
      const s = b.topSlot, span = Math.min(b.span, slots.length - s)
      cover[b.day][s] = { start: true, b, span }
      for (let i = 1; i < span; i++) cover[b.day][s + i] = { covered: true }
    }
    const rows = slots.map((m, si) => {
      const tds = days.map(d => {
        const c = cover[d][si]
        if (c?.covered) return ''
        if (c?.start) {
          const e = c.b.entry, second = tab === 'class' ? (e.teacher_name || '') : (e.classroom_label || '')
          return `<td rowspan="${c.span}" class="ent">${e.subject_name}<br><small>${second}${e.room ? ' · ' + e.room : ''}</small></td>`
        }
        return '<td></td>'
      }).join('')
      return `<tr><th class="t">${toTime(m)}</th>${tds}</tr>`
    }).join('')
    const w = window.open('', '_blank')
    w.document.write(`<html><head><title>${title}</title><style>
      body{font-family:Arial,sans-serif;padding:16px}h2{margin:0 0 12px}
      table{border-collapse:collapse;width:100%;font-size:11px}
      th,td{border:1px solid #cbd5e1;padding:4px;text-align:center;vertical-align:middle}
      th.t{background:#f1f5f9;width:54px;font-weight:normal;color:#475569}thead th{background:#f1f5f9}
      td.ent{background:#ecfdf5;font-weight:600}td.ent small{font-weight:400;color:#475569}
      @media print{@page{size:landscape}}
    </style></head><body><h2>${title}</h2>
    <table><thead><tr><th class="t"></th>${days.map(d => `<th>${DAY_LABELS[d]}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table></body></html>`)
    w.document.close(); w.focus(); w.print()
  }

  const gridHeight = slots.length * ROW_H

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Emploi du temps</h1>
          <p className="text-sm text-steel-500 mt-0.5">Grille de 30 min · {config.day_start}–{config.day_end}</p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === 'admin' && <button onClick={() => setShowConfig(true)} className="px-3 py-2 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">Réglages</button>}
          <button onClick={printView} className="px-3 py-2 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">Imprimer</button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-steel-200 mb-4">
        {[{ k: 'class', l: 'Par classe' }, { k: 'teacher', l: 'Par enseignant' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.k ? 'border-brand text-brand' : 'border-transparent text-steel-500 hover:text-steel-700'}`}>{t.l}</button>
        ))}
      </div>

      <div className="mb-4">
        {tab === 'class' ? (
          <select value={classId} onChange={e => setClassId(e.target.value)} className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
            {classrooms.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        ) : (
          <select value={teacherId} onChange={e => setTeacherId(e.target.value)} className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
            {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        )}
      </div>

      <div className="flex gap-4 items-start">
        {tab === 'class' && (
          <AddCourseForm classId={classId} subjects={data?.subjects || []} config={config} days={days} onAdded={loadGrid} />
        )}

        {/* Grid */}
        <div className="flex-1 bg-white rounded-xl border border-steel-200 overflow-auto">
          <div className="flex min-w-[640px]">
            <div className="w-14 shrink-0 border-r border-steel-200">
              <div className="h-8 border-b border-steel-200 bg-steel-50" />
              {slots.map(m => (
                <div key={m} className="text-[10px] text-steel-400 text-center" style={{ height: ROW_H }}>
                  {m % 60 === 0 ? <span className="relative -top-1.5">{toTime(m)}</span> : null}
                </div>
              ))}
            </div>
            <div className="flex flex-1">
              {days.map(day => (
                <div key={day} className="flex-1 border-l border-steel-200 relative">
                  <div className="h-8 border-b border-steel-200 bg-steel-50 flex items-center justify-center text-xs font-medium text-steel-600">{DAY_LABELS[day]}</div>
                  <div className="relative" style={{ height: gridHeight }}>
                    {slots.map((m, i) => (
                      <div key={m} className={`absolute left-0 right-0 ${m % 60 === 0 ? 'border-t border-steel-200' : 'border-t border-steel-50'}`} style={{ top: i * ROW_H, height: ROW_H }} />
                    ))}
                    {blocks.filter(b => b.day === day).map(b => {
                      const e = b.entry
                      const second = tab === 'class' ? e.teacher_name : e.classroom_label
                      return (
                        <div key={e.id} className={`absolute left-1 right-1 rounded-md border px-1.5 py-1 text-[10px] leading-tight overflow-hidden group ${subjectColor(e.subject_name)}`}
                          style={{ top: b.topSlot * ROW_H + 1, height: b.span * ROW_H - 2 }}>
                          <p className="font-semibold truncate">{e.subject_name}</p>
                          <p className="truncate opacity-80">{second || '—'}</p>
                          <p className="opacity-60">{e.start_time}–{e.end_time}{e.room ? ` · ${e.room}` : ''}</p>
                          {tab === 'class' && (
                            <button onClick={() => deleteEntry(e.id)}
                              className="absolute top-0.5 right-0.5 w-4 h-4 rounded bg-white/70 text-steel-400 hover:text-red-500 hidden group-hover:flex items-center justify-center text-[10px]">✕</button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showConfig && <ConfigModal config={config} onClose={() => setShowConfig(false)} onSaved={(c) => { setConfig(c); setShowConfig(false) }} />}
    </div>
  )
}

function AddCourseForm({ classId, subjects, config, days, onAdded }) {
  const ticks = []
  for (let m = toMin(config.day_start); m <= toMin(config.day_end); m += 30) ticks.push(toTime(m))

  const [subjectId, setSubjectId] = useState('')
  const [selDays, setSelDays] = useState([])
  const [start, setStart] = useState(config.day_start)
  const [end, setEnd] = useState(toTime(Math.min(toMin(config.day_start) + 60, toMin(config.day_end))))
  const [room, setRoom] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const selSubject = subjects.find(s => String(s.subject_id) === String(subjectId))
  function toggleDay(d) { setSelDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()) }

  async function add() {
    setFeedback(null)
    if (!subjectId) { setFeedback({ err: 'Choisissez une matière' }); return }
    if (selDays.length === 0) { setFeedback({ err: 'Choisissez au moins un jour' }); return }
    if (start >= end) { setFeedback({ err: 'L\'heure de fin doit suivre le début' }); return }
    setSaving(true)
    const results = await Promise.allSettled(selDays.map(d =>
      api.post('/api/timetable/entry', { classroom_id: parseInt(classId), day_of_week: d, start_time: start, end_time: end, subject_id: parseInt(subjectId), room: room.trim() || null })
    ))
    const fails = []
    results.forEach((r, i) => { if (r.status === 'rejected') fails.push(`${DAY_LABELS[selDays[i]]}: ${r.reason.response?.data?.message || 'erreur'}`) })
    const ok = results.length - fails.length
    setFeedback({ ok, fails })
    setSaving(false)
    onAdded()
  }

  return (
    <div className="w-72 shrink-0 bg-white rounded-xl border border-steel-200 p-4">
      <h2 className="text-sm font-semibold text-steel-700 mb-3">Ajouter un cours</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-steel-500 mb-1">Matière</label>
          <select value={subjectId} onChange={e => setSubjectId(e.target.value)}
            className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
            <option value="">— Choisir —</option>
            {subjects.map(s => <option key={s.subject_id} value={s.subject_id}>{s.subject_name}</option>)}
          </select>
          {selSubject && <p className="text-xs mt-1 text-steel-500">Enseignant : {selSubject.teacher_name || <span className="text-amber-600">non assigné</span>}</p>}
        </div>

        <div>
          <label className="block text-xs text-steel-500 mb-1.5">Jour(s)</label>
          <div className="flex gap-1 flex-wrap">
            {days.map(d => (
              <button key={d} type="button" onClick={() => toggleDay(d)}
                className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${selDays.includes(d) ? 'bg-brand text-white border-brand' : 'bg-white border-steel-200 text-steel-600 hover:bg-steel-50'}`}>
                {DAY_LABELS[d].slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs text-steel-500 mb-1">De</label>
            <select value={start} onChange={e => setStart(e.target.value)} className="w-full px-2 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
              {ticks.slice(0, -1).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-steel-500 mb-1">À</label>
            <select value={end} onChange={e => setEnd(e.target.value)} className="w-full px-2 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
              {ticks.filter(t => t > start).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-steel-500 mb-1">Salle (optionnel)</label>
          <input type="text" value={room} onChange={e => setRoom(e.target.value)} placeholder="Ex: Salle 12"
            className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
        </div>

        <button onClick={add} disabled={saving}
          className="w-full py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
          {saving ? 'Ajout...' : `Ajouter${selDays.length > 1 ? ` (${selDays.length} jours)` : ''}`}
        </button>

        {feedback && (
          <div className="text-xs">
            {feedback.err ? <p className="text-red-600">{feedback.err}</p> : (
              <>
                {feedback.ok > 0 && <p className="text-brand-700">{feedback.ok} créneau(x) ajouté(s)</p>}
                {feedback.fails?.length > 0 && (
                  <ul className="text-red-600 mt-1 space-y-0.5">{feedback.fails.map((f, i) => <li key={i}>{f}</li>)}</ul>
                )}
              </>
            )}
          </div>
        )}
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
