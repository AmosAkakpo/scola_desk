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

function drawTimetableOnPage(doc, label, yearLabel, entries, activeDays, dayStart, dayEnd, secondLineFn, W, H) {
  const margin = 10, timeColW = 18, headerH = 15, dayRowH = 7
  const startMin = toMin(dayStart), endMin = toMin(dayEnd)
  const slots = []
  for (let m = startMin; m < endMin; m += 30) slots.push(m)
  if (!slots.length) return

  const gridW = W - 2 * margin - timeColW
  const dayW = gridW / activeDays.length
  const gridTop = margin + headerH
  const slotTop = gridTop + dayRowH
  const slotH = (H - margin - slotTop) / slots.length

  // Title
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42)
  doc.text(label, margin, margin + 7)
  if (yearLabel) {
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139)
    doc.text(yearLabel, margin, margin + 12)
  }

  // Day header row
  doc.setLineWidth(0.2); doc.setFillColor(241, 245, 249); doc.setDrawColor(203, 213, 225)
  doc.rect(margin, gridTop, timeColW, dayRowH, 'FD')
  activeDays.forEach((d, di) => {
    const x = margin + timeColW + di * dayW
    doc.setFillColor(241, 245, 249); doc.rect(x, gridTop, dayW, dayRowH, 'FD')
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(71, 85, 105)
    doc.text(DAY_LABELS[d], x + dayW / 2, gridTop + dayRowH / 2 + 1.5, { align: 'center' })
  })

  // Slot grid
  slots.forEach((m, si) => {
    const y = slotTop + si * slotH
    doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240)
    doc.rect(margin, y, timeColW, slotH, 'FD')
    if (m % 60 === 0) {
      doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139)
      doc.text(toTime(m), margin + timeColW / 2, y + Math.min(3, slotH - 1), { align: 'center' })
    }
    activeDays.forEach((_, di) => {
      const x = margin + timeColW + di * dayW
      doc.setFillColor(255, 255, 255); doc.rect(x, y, dayW, slotH, 'FD')
    })
  })

  // Entry blocks
  entries.forEach(e => {
    const dayIdx = activeDays.indexOf(e.day_of_week)
    if (dayIdx < 0) return
    const startSlot = (toMin(e.start_time) - startMin) / 30
    const endSlot = (toMin(e.end_time) - startMin) / 30
    if (startSlot < 0 || endSlot > slots.length || endSlot <= startSlot) return
    const x = margin + timeColW + dayIdx * dayW + 0.5
    const y = slotTop + startSlot * slotH + 0.5
    const cW = dayW - 1, cH = (endSlot - startSlot) * slotH - 1
    doc.setFillColor(236, 253, 245); doc.setDrawColor(134, 239, 172); doc.setLineWidth(0.3)
    doc.rect(x, y, cW, cH, 'FD'); doc.setLineWidth(0.2)
    doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42)
    const subLines = doc.splitTextToSize(e.subject_name || '', cW - 1.5)
    doc.text(subLines[0], x + cW / 2, y + Math.min(4, cH * 0.55), { align: 'center' })
    const second = secondLineFn(e)
    if (second && cH > 7) {
      doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105)
      const secLines = doc.splitTextToSize(second, cW - 1.5)
      doc.text(secLines[0], x + cW / 2, y + Math.min(7.5, cH * 0.82), { align: 'center' })
    }
  })
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
  const [editEntry, setEditEntry] = useState(null)
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [pdfSelections, setPdfSelections] = useState([])
  const [pdfOrientation, setPdfOrientation] = useState('landscape')
  const [generating, setGenerating] = useState(false)
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null)

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

  async function deleteEntry(id) {
    await api.delete(`/api/timetable/entry/${id}`)
    setEditEntry(null)
    loadGrid()
  }

  async function buildPdf(selectionIds, orientation) {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
    const W = orientation === 'landscape' ? 297 : 210
    const H = orientation === 'landscape' ? 210 : 297
    const isClass = tab === 'class'
    const list = isClass ? classrooms : teachers
    const selected = list.filter(item => selectionIds.includes(String(item.id)))
    for (let i = 0; i < selected.length; i++) {
      if (i > 0) doc.addPage()
      const item = selected[i]
      const res = await api.get(isClass ? `/api/timetable/class/${item.id}` : `/api/timetable/teacher/${item.id}`)
      const pageLabel = isClass ? `Emploi du temps — ${item.label}` : `Emploi du temps — ${item.full_name}`
      const secondFn = isClass ? (e => e.teacher_name || '') : (e => e.classroom_label || '')
      drawTimetableOnPage(doc, pageLabel, config.year_label || '', res.data.entries || [], config.days || [1, 2, 3, 4, 5], config.day_start, config.day_end, secondFn, W, H)
    }
    return doc
  }

  async function previewPdf() {
    if (!pdfSelections.length) return
    setGenerating(true)
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl)
    try {
      const doc = await buildPdf(pdfSelections, pdfOrientation)
      setPdfBlobUrl(URL.createObjectURL(doc.output('blob')))
    } catch (err) { console.error('PDF preview error', err) }
    setGenerating(false)
  }

  async function downloadPdf() {
    if (!pdfSelections.length) return
    setGenerating(true)
    try {
      const doc = await buildPdf(pdfSelections, pdfOrientation)
      const yearSlug = (config.year_label || 'edt').replace(/[^a-z0-9]/gi, '_')
      doc.save(`EDT_${yearSlug}.pdf`)
    } catch (err) { console.error('PDF download error', err) }
    setGenerating(false)
  }

  function openPdfModal() {
    const id = tab === 'class' ? classId : teacherId
    if (id) setPdfSelections([id])
    setShowPdfModal(true)
  }

  function closePdfModal() {
    if (pdfBlobUrl) { URL.revokeObjectURL(pdfBlobUrl); setPdfBlobUrl(null) }
    setShowPdfModal(false)
    setPdfSelections([])
  }

  const gridHeight = slots.length * ROW_H

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Emploi du temps</h1>
          <p className="text-sm text-steel-500 mt-0.5">Grille de 30 min · {config.day_start}–{config.day_end}{config.year_label ? ` · ${config.year_label}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === 'admin' && <button onClick={() => setShowConfig(true)} className="px-3 py-2 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">Réglages</button>}
          <button onClick={openPdfModal} className="px-3 py-2 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            PDF / Imprimer
          </button>
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
                        <div key={e.id}
                          onClick={() => setEditEntry(e)}
                          className={`absolute left-1 right-1 rounded-md border px-1.5 py-1 text-[10px] leading-tight overflow-hidden group cursor-pointer hover:brightness-95 transition-all ${subjectColor(e.subject_name)}`}
                          style={{ top: b.topSlot * ROW_H + 1, height: b.span * ROW_H - 2 }}>
                          <p className="font-semibold truncate">{e.subject_name}</p>
                          <p className="truncate opacity-80">{second || '—'}</p>
                          <p className="opacity-60">{e.start_time}–{e.end_time}{e.room ? ` · ${e.room}` : ''}</p>
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
      {editEntry && (
        <EditEntryModal
          entry={editEntry}
          config={config}
          days={days}
          onClose={() => setEditEntry(null)}
          onSaved={() => { setEditEntry(null); loadGrid() }}
          onDeleted={() => deleteEntry(editEntry.id)}
        />
      )}
      {showPdfModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl flex flex-col" style={{ width: 820, maxHeight: '92vh' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-steel-200 shrink-0">
              <h2 className="text-sm font-semibold text-steel-800">Générer PDF</h2>
              <button onClick={closePdfModal} className="text-steel-400 hover:text-steel-600 text-lg leading-none">✕</button>
            </div>

            <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
              {/* Left: class / teacher selection */}
              <div className="w-56 border-r border-steel-200 flex flex-col shrink-0">
                <div className="px-3 py-2 border-b border-steel-100 flex gap-3">
                  <button onClick={() => setPdfSelections((tab === 'class' ? classrooms : teachers).map(x => String(x.id)))}
                    className="text-xs text-brand hover:underline">Tout</button>
                  <button onClick={() => setPdfSelections([])}
                    className="text-xs text-steel-400 hover:underline">Aucun</button>
                </div>
                <div className="overflow-y-auto flex-1 p-2 space-y-0.5">
                  {(tab === 'class' ? classrooms : teachers).map(item => (
                    <label key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-steel-50 cursor-pointer">
                      <input type="checkbox" className="accent-brand"
                        checked={pdfSelections.includes(String(item.id))}
                        onChange={e => {
                          const id = String(item.id)
                          setPdfSelections(prev => e.target.checked ? [...prev, id] : prev.filter(x => x !== id))
                          setPdfBlobUrl(null)
                        }} />
                      <span className="text-sm text-steel-700 leading-snug">{tab === 'class' ? item.label : item.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Right: options + preview */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-steel-200 shrink-0 flex-wrap">
                  <span className="text-xs text-steel-500 mr-1">Orientation :</span>
                  {['landscape', 'portrait'].map(o => (
                    <button key={o} onClick={() => { setPdfOrientation(o); setPdfBlobUrl(null) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${pdfOrientation === o ? 'bg-brand text-white border-brand' : 'bg-white border-steel-200 text-steel-600 hover:bg-steel-50'}`}>
                      {o === 'landscape' ? 'Paysage' : 'Portrait'}
                    </button>
                  ))}
                  <div className="ml-auto flex gap-2">
                    <button onClick={previewPdf} disabled={!pdfSelections.length || generating}
                      className="px-3 py-1.5 border border-steel-200 text-steel-600 hover:bg-steel-50 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors">
                      {generating ? 'Génération...' : 'Aperçu'}
                    </button>
                    <button onClick={downloadPdf} disabled={!pdfSelections.length || generating}
                      className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-colors">
                      Télécharger PDF
                    </button>
                  </div>
                </div>

                {pdfBlobUrl ? (
                  <iframe src={pdfBlobUrl} className="flex-1 w-full" style={{ border: 'none' }} title="Aperçu PDF" />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-steel-400 gap-3">
                    <svg className="w-12 h-12 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm">Sélectionnez des classes puis cliquez sur <span className="font-medium text-steel-600">Aperçu</span></p>
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-2 border-t border-steel-200 shrink-0">
              <p className="text-xs text-steel-400">
                {pdfSelections.length} {tab === 'class' ? 'classe(s)' : 'enseignant(s)'} sélectionné(s){pdfSelections.length > 0 ? ` · 1 page par ${tab === 'class' ? 'classe' : 'enseignant'}` : ''}
              </p>
            </div>
          </div>
        </div>
      )}
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

function EditEntryModal({ entry, config, days, onClose, onSaved, onDeleted }) {
  const ticks = []
  for (let m = toMin(config.day_start); m <= toMin(config.day_end); m += 30) ticks.push(toTime(m))

  const [day, setDay] = useState(entry.day_of_week)
  const [start, setStart] = useState(entry.start_time)
  const [end, setEnd] = useState(entry.end_time)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  async function save() {
    if (start >= end) { setError('L\'heure de fin doit suivre le début'); return }
    setError(''); setSaving(true)
    try {
      await api.put(`/api/timetable/entry/${entry.id}`, { day_of_week: day, start_time: start, end_time: end })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la modification')
      setSaving(false)
    }
  }

  const label = entry.classroom_label ? `${entry.subject_name} — ${entry.classroom_label}` : `${entry.subject_name} — ${entry.teacher_name || '—'}`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-steel-900">Modifier le créneau</h2>
            <p className="text-xs text-steel-500 mt-0.5 truncate max-w-[240px]">{label}</p>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-600 text-lg leading-none">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-steel-500 mb-1.5">Jour</label>
            <div className="flex gap-1.5 flex-wrap">
              {days.map(d => (
                <button key={d} type="button" onClick={() => setDay(d)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${day === d ? 'bg-brand text-white border-brand' : 'bg-white border-steel-200 text-steel-600 hover:bg-steel-50'}`}>
                  {DAY_LABELS[d].slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-steel-500 mb-1">De</label>
              <select value={start} onChange={e => setStart(e.target.value)}
                className="w-full px-2 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
                {ticks.slice(0, -1).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-steel-500 mb-1">À</label>
              <select value={end} onChange={e => setEnd(e.target.value)}
                className="w-full px-2 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
                {ticks.filter(t => t > start).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex gap-2 pt-1">
            {!confirming ? (
              <button onClick={() => setConfirming(true)}
                className="px-3 py-2.5 border border-red-200 text-red-500 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors">
                Supprimer
              </button>
            ) : (
              <button onClick={onDeleted}
                className="px-3 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors">
                Confirmer
              </button>
            )}
            <button onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors">
              Annuler
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? '...' : 'Enregistrer'}
            </button>
          </div>
        </div>
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
