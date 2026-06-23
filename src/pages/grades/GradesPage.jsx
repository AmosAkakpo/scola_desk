import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../utils/api'

const TYPE_LABELS = { interrogation: 'Interro', devoir: 'Devoir', composition: 'Compo', tp: 'TP', oral: 'Oral' }

export default function GradesPage() {
  const [classrooms, setClassrooms] = useState([])
  const [subjects, setSubjects] = useState([])
  const [periodeCount, setPeriodeCount] = useState(3)
  const [semester, setSemester] = useState(1)
  const [classroomId, setClassroomId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [templates, setTemplates] = useState([])
  const [rows, setRows] = useState([])
  const [classStats, setClassStats] = useState(null)
  const [coefficient, setCoefficient] = useState(1)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const pendingRef = useRef([])
  const fileRef = useRef(null)

  // Load selectors
  useEffect(() => {
    api.get('/api/grades/selectors').then(res => {
      setClassrooms(res.data.classrooms || [])
      setPeriodeCount(res.data.periode_count || 3)
    })
  }, [])

  // Load subjects when classroom changes
  useEffect(() => {
    if (!classroomId) { setSubjects([]); return }
    api.get(`/api/grades/subjects/${classroomId}`).then(res => {
      setSubjects(res.data.subjects || [])
      setSubjectId('')
    })
  }, [classroomId])

  // Load grades when all three selected
  const loadGrades = useCallback(async () => {
    if (!classroomId || !subjectId || !semester) return
    setLoading(true)
    const res = await api.get(`/api/grades/${classroomId}/${subjectId}/${semester}`)
    setTemplates(res.data.templates || [])
    setRows(res.data.rows || [])
    setClassStats(res.data.class_stats || null)
    setCoefficient(res.data.coefficient || 1)
    setLoading(false)
  }, [classroomId, subjectId, semester])

  useEffect(() => { loadGrades() }, [loadGrades])

  // Save score on blur
  async function saveScore(templateId, studentId, score, isAbsent) {
    pendingRef.current.push({ template_id: templateId, student_id: studentId, score, is_absent: isAbsent })

    // Debounce: save all pending after 300ms of no new entries
    clearTimeout(pendingRef.current.timer)
    pendingRef.current.timer = setTimeout(async () => {
      const batch = [...pendingRef.current.filter(p => p.template_id)]
      pendingRef.current = []
      if (batch.length === 0) return
      setSaving(true)
      await api.post('/api/grades/batch', { scores: batch })
      setSaving(false)
      loadGrades()
    }, 300)
  }

  async function downloadTemplate() {
    const res = await api.get(`/api/grades/template/${classroomId}/${subjectId}/${semester}`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    const cls = classrooms.find(c => String(c.id) === String(classroomId))?.label || 'classe'
    const sub = subjects.find(s => String(s.subject_id) === String(subjectId))?.subject_name || 'matiere'
    a.href = url
    a.download = `${cls}_${sub}_T${semester}.xlsx`.replace(/\s/g, '_')
    a.click()
    URL.revokeObjectURL(url)
  }

  async function uploadFile(file) {
    if (!file) return
    setImporting(true); setImportResult(null)
    try {
      const res = await api.post(`/api/grades/upload/${classroomId}/${subjectId}/${semester}`, file, {
        headers: { 'Content-Type': 'application/octet-stream' },
      })
      setImportResult(res.data)
      loadGrades()
    } catch (err) {
      setImportResult({ error: err.response?.data?.message || 'Erreur lors de l\'import' })
    }
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function updateLocalScore(studentId, templateId, value, isAbsent) {
    setRows(prev => prev.map(r => {
      if (r.student_id !== studentId) return r
      const newScores = { ...r.scores }
      newScores[templateId] = { ...newScores[templateId], score: value, is_absent: isAbsent }
      return { ...r, scores: newScores }
    }))
  }

  // Group templates by type for column headers
  const grouped = []
  templates.forEach(t => {
    const label = `${TYPE_LABELS[t.assessment_type] || t.assessment_type} ${t.sequence_number}`
    grouped.push({ ...t, label })
  })

  const typeGroups = {}
  templates.forEach(t => {
    if (!typeGroups[t.assessment_type]) typeGroups[t.assessment_type] = 0
    typeGroups[t.assessment_type]++
  })

  const gradedCount = classStats?.graded_count || 0
  const totalCount = classStats?.total_count || 0
  const pct = totalCount > 0 ? Math.round((gradedCount / totalCount) * 100) : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Saisie des notes</h1>
          <p className="text-sm text-steel-500 mt-0.5">Sélectionnez le trimestre, la classe et la matière</p>
        </div>
        {saving && <span className="text-xs text-brand animate-pulse">Enregistrement...</span>}
      </div>

      {/* Selectors */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select value={semester} onChange={e => setSemester(parseInt(e.target.value))}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          {Array.from({ length: periodeCount }, (_, i) => i + 1).map(n => (
            <option key={n} value={n}>Trimestre {n}</option>
          ))}
        </select>
        <select value={classroomId} onChange={e => setClassroomId(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          <option value="">— Classe —</option>
          {classrooms.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={subjectId} onChange={e => setSubjectId(e.target.value)} disabled={!classroomId}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand disabled:opacity-50">
          <option value="">— Matière —</option>
          {subjects.map(s => <option key={s.subject_id} value={s.subject_id}>{s.subject_name} (coef {s.coefficient})</option>)}
        </select>

        {classroomId && subjectId && (
          <div className="flex gap-2 ml-auto">
            <button onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-2 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Modèle Excel
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={importing}
              className="flex items-center gap-1.5 px-3 py-2 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              {importing ? 'Import...' : 'Importer'}
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => uploadFile(e.target.files?.[0])} />
          </div>
        )}
      </div>

      {/* Import result */}
      {importResult && (
        <div className={`rounded-lg p-3 mb-4 text-sm flex items-start justify-between gap-3 ${importResult.error ? 'bg-red-50 border border-red-200' : 'bg-brand-50 border border-brand-100'}`}>
          <div>
            {importResult.error ? (
              <p className="text-red-600">{importResult.error}</p>
            ) : (
              <>
                <p className="text-brand-700 font-medium">{importResult.saved} note(s) importée(s) · {importResult.matched}/{importResult.total_rows} élève(s) reconnu(s)</p>
                {importResult.errors?.length > 0 && (
                  <ul className="mt-1 text-xs text-red-600 space-y-0.5 max-h-32 overflow-y-auto">
                    {importResult.errors.slice(0, 20).map((e, i) => <li key={i}>Ligne {e.row}: {e.message}</li>)}
                    {importResult.errors.length > 20 && <li>… et {importResult.errors.length - 20} autre(s)</li>}
                  </ul>
                )}
              </>
            )}
          </div>
          <button onClick={() => setImportResult(null)} className="text-steel-400 hover:text-steel-600 text-xs shrink-0">✕</button>
        </div>
      )}

      {/* Progress */}
      {classStats && (
        <div className="bg-white rounded-lg border border-steel-200 p-3 mb-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-steel-500">{gradedCount}/{totalCount} élèves notés</span>
              <span className="text-xs text-steel-400">{pct}%</span>
            </div>
            <div className="w-full h-1.5 bg-steel-100 rounded-full">
              <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          {classStats.class_average !== null && (
            <div className="flex gap-4 text-xs text-steel-500">
              <span>Moy: <strong className="text-steel-800">{classStats.class_average}</strong></span>
              <span>Max: <strong className="text-steel-800">{classStats.highest}</strong></span>
              <span>Min: <strong className="text-steel-800">{classStats.lowest}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* Grade Table */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
      ) : !classroomId || !subjectId ? (
        <div className="bg-white rounded-xl border border-steel-200 p-12 text-center">
          <p className="text-steel-400 text-sm">Sélectionnez une classe et une matière pour commencer</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-steel-200 p-12 text-center">
          <p className="text-steel-400 text-sm">Aucun élève dans cette classe</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-steel-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-steel-200 bg-steel-50">
                <th className="text-left px-3 py-2.5 text-steel-500 font-medium sticky left-0 bg-steel-50 z-10 min-w-[40px]">#</th>
                <th className="text-left px-3 py-2.5 text-steel-500 font-medium sticky left-[40px] bg-steel-50 z-10 min-w-[160px]">Nom complet</th>
                {grouped.map(t => (
                  <th key={t.id} className="text-center px-2 py-2.5 text-steel-500 font-medium min-w-[60px]">
                    <span className="block">{t.label}</span>
                    <span className="text-[10px] text-steel-400">/{t.max_score}</span>
                  </th>
                ))}
                {Object.keys(typeGroups).filter(t => typeGroups[t] > 1).map(type => (
                  <th key={`avg_${type}`} className="text-center px-2 py-2.5 text-steel-500 font-medium bg-steel-100 min-w-[55px]">
                    Moy {TYPE_LABELS[type] || type}
                  </th>
                ))}
                <th className="text-center px-2 py-2.5 text-steel-700 font-semibold bg-steel-100 min-w-[55px]">Moy</th>
                <th className="text-center px-2 py-2.5 text-steel-500 font-medium bg-steel-100 min-w-[40px]">Coef</th>
                <th className="text-center px-2 py-2.5 text-steel-700 font-semibold bg-steel-100 min-w-[55px]">M×C</th>
                <th className="text-center px-2 py-2.5 text-steel-700 font-semibold bg-steel-100 min-w-[45px]">Rang</th>
                <th className="text-left px-2 py-2.5 text-steel-500 font-medium bg-steel-100 min-w-[80px]">Appréciation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.student_id} className={`border-b border-steel-50 ${idx % 2 === 0 ? '' : 'bg-steel-50/30'}`}>
                  <td className="px-3 py-1.5 text-steel-400 sticky left-0 bg-white z-10">{idx + 1}</td>
                  <td className="px-3 py-1.5 text-steel-800 font-medium sticky left-[40px] bg-white z-10 truncate max-w-[160px]">{row.full_name}</td>
                  {grouped.map(t => {
                    const s = row.scores[t.id] || {}
                    return (
                      <td key={t.id} className="px-1 py-1">
                        <GradeCell
                          value={s.score}
                          isAbsent={s.is_absent}
                          maxScore={t.max_score}
                          onChange={(val, absent) => {
                            updateLocalScore(row.student_id, t.id, val, absent)
                            saveScore(t.id, row.student_id, val, absent)
                          }}
                        />
                      </td>
                    )
                  })}
                  {Object.keys(typeGroups).filter(t => typeGroups[t] > 1).map(type => (
                    <td key={`avg_${type}`} className="px-2 py-1.5 text-center bg-steel-50/50 font-medium text-steel-700">
                      {row.type_averages[type]?.toFixed(2) ?? '—'}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center bg-steel-50/50 font-semibold text-steel-900">
                    {row.average?.toFixed(2) ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 text-center bg-steel-50/50 text-steel-500">{coefficient}</td>
                  <td className="px-2 py-1.5 text-center bg-steel-50/50 font-semibold text-steel-900">
                    {row.moy_coef?.toFixed(2) ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 text-center bg-steel-50/50 font-semibold text-brand">
                    {row.rank ? `${row.rank}${row.rank_suffix ? ' ex' : ''}` : '—'}
                  </td>
                  <td className="px-2 py-1.5 bg-steel-50/50 text-steel-600">{row.appreciation || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function GradeCell({ value, isAbsent, maxScore, onChange }) {
  const [localVal, setLocalVal] = useState(value ?? '')
  const [absent, setAbsent] = useState(isAbsent || false)
  const inputRef = useRef(null)

  useEffect(() => { setLocalVal(value ?? ''); setAbsent(isAbsent || false) }, [value, isAbsent])

  function handleBlur() {
    const num = localVal === '' ? null : parseFloat(localVal)
    if (num !== null && (num < 0 || num > maxScore)) return
    onChange(num, absent)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      handleBlur()
    }
  }

  function toggleAbsent() {
    const newAbsent = !absent
    setAbsent(newAbsent)
    if (newAbsent) setLocalVal('')
    onChange(newAbsent ? null : (localVal === '' ? null : parseFloat(localVal)), newAbsent)
  }

  return (
    <div className="relative group">
      {absent ? (
        <div className="w-full h-7 flex items-center justify-center bg-red-50 border border-red-200 rounded text-xs text-red-500 font-medium cursor-pointer" onClick={toggleAbsent}>
          ABS
        </div>
      ) : (
        <input ref={inputRef} type="number" min="0" max={maxScore} step="0.25"
          value={localVal} onChange={e => setLocalVal(e.target.value)}
          onBlur={handleBlur} onKeyDown={handleKeyDown}
          className="w-full h-7 px-1.5 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
      )}
      <button onClick={toggleAbsent}
        className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-steel-200 rounded-full text-[8px] text-steel-500 hidden group-hover:flex items-center justify-center hover:bg-red-200 hover:text-red-600"
        title="Absent">
        A
      </button>
    </div>
  )
}
