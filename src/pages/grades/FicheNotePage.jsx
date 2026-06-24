import { useState, useEffect } from 'react'
import api from '../../utils/api'

export default function FicheNotePage() {
  const [classrooms, setClassrooms] = useState([])
  const [periodeCount, setPeriodeCount] = useState(3)
  const [semesters, setSemesters] = useState([])
  const [classIds, setClassIds] = useState([])
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/grades/sheet-options').then(res => {
      setClassrooms(res.data.classrooms || [])
      setPeriodeCount(res.data.periode_count || 3)
      setLoading(false)
    }).catch(err => {
      setLoading(false)
      if (err.response?.status === 404) setError('Endpoint introuvable — redémarrez l\'application pour charger les nouvelles fonctions.')
      else setError(err.response?.data?.message || 'Impossible de charger les classes')
    })
  }, [])

  function toggleSem(n) {
    setSemesters(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n].sort())
  }
  function toggleClass(id) {
    setClassIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleAllClasses() {
    setClassIds(classIds.length === classrooms.length ? [] : classrooms.map(c => c.id))
  }

  async function download() {
    setError('')
    if (semesters.length === 0) { setError('Sélectionnez au moins un trimestre'); return }
    if (classIds.length === 0) { setError('Sélectionnez au moins une classe'); return }
    setDownloading(true)
    try {
      const res = await api.post('/api/grades/bulk-sheets', { semesters, classroom_ids: classIds }, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `fiches_notes.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      // error responses come back as a Blob — parse the JSON message
      let msg = 'Erreur lors de la génération'
      try { msg = JSON.parse(await err.response.data.text()).message || msg } catch { /* keep default */ }
      setError(msg)
    }
    setDownloading(false)
  }

  const fileCount = semesters.length * classIds.length

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-medium text-steel-900">Fiches de notes</h1>
        <p className="text-sm text-steel-500 mt-0.5">Téléchargez les fiches Excel à distribuer aux enseignants. Un fichier par classe, matière et trimestre.</p>
      </div>

      {/* Semesters */}
      <section className="bg-white rounded-xl border border-steel-200 p-5 mb-4">
        <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-3">Trimestres</h2>
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: periodeCount }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => toggleSem(n)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${semesters.includes(n) ? 'bg-brand text-white border-brand' : 'bg-white border-steel-200 text-steel-600 hover:bg-steel-50'}`}>
              Trimestre {n}
            </button>
          ))}
        </div>
      </section>

      {/* Classes */}
      <section className="bg-white rounded-xl border border-steel-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Classes</h2>
          <button onClick={toggleAllClasses} className="text-xs text-brand hover:text-brand-600 font-medium">
            {classIds.length === classrooms.length ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
        </div>
        {classrooms.length === 0 ? (
          <p className="text-sm text-steel-400 text-center py-4">Aucune classe</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {classrooms.map(c => (
              <label key={c.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${classIds.includes(c.id) ? 'border-brand bg-brand-50' : 'border-steel-200 hover:bg-steel-50'}`}>
                <input type="checkbox" checked={classIds.includes(c.id)} onChange={() => toggleClass(c.id)}
                  className="rounded border-steel-300 text-brand focus:ring-brand" />
                <span className="text-sm text-steel-700 truncate">{c.label}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <div className="flex items-center gap-4">
        <button onClick={download} disabled={downloading}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          {downloading ? 'Génération...' : 'Télécharger (ZIP)'}
        </button>
        {fileCount > 0 && <span className="text-xs text-steel-400">≈ {fileCount} classe-trimestre sélectionné(s)</span>}
      </div>
    </div>
  )
}
