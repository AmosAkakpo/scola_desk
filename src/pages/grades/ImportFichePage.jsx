import { useState, useRef } from 'react'
import api from '../../utils/api'

export default function ImportFichePage() {
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  async function handleFiles(fileList) {
    const files = Array.from(fileList || [])
    if (files.length === 0) return
    setBusy(true)
    for (const file of files) {
      try {
        const res = await api.post('/api/grades/import-sheet', file, {
          headers: { 'Content-Type': 'application/octet-stream' },
        })
        setResults(prev => [{ name: file.name, ...res.data }, ...prev])
      } catch (err) {
        setResults(prev => [{ name: file.name, error: err.response?.data?.message || 'Erreur lors de l\'import' }, ...prev])
      }
    }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-medium text-steel-900">Importer fiches de notes</h1>
        <p className="text-sm text-steel-500 mt-0.5">Importez les fiches Excel remplies par les enseignants. Vous pouvez en sélectionner plusieurs à la fois.</p>
      </div>

      {/* Dropzone / picker */}
      <div onClick={() => !busy && fileRef.current?.click()}
        className={`bg-white rounded-xl border-2 border-dashed border-steel-200 p-10 text-center cursor-pointer hover:border-brand transition-colors ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
        <svg className="w-10 h-10 text-steel-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
        <p className="text-sm text-steel-600 font-medium">{busy ? 'Import en cours...' : 'Cliquez pour choisir les fichiers'}</p>
        <p className="text-xs text-steel-400 mt-1">Fichiers .xlsx générés par « Fiches de notes »</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
          onChange={e => handleFiles(e.target.files)} />
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Résultats</h2>
            <button onClick={() => setResults([])} className="text-xs text-steel-400 hover:text-steel-600">Effacer</button>
          </div>
          {results.map((r, i) => (
            <div key={i} className={`rounded-lg p-3 text-sm border ${r.error ? 'bg-red-50 border-red-200' : 'bg-white border-steel-200'}`}>
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 ${r.error ? 'text-red-500' : 'text-brand'}`}>
                  {r.error ? '✕' : '✓'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-steel-500 truncate">{r.name}</p>
                  {r.error ? (
                    <p className="text-red-600 mt-0.5">{r.error}</p>
                  ) : (
                    <>
                      <p className="text-steel-800 font-medium">{r.classe} · {r.matiere} · T{r.semester}{r.enseignant ? ` · ${r.enseignant}` : ''}</p>
                      <p className="text-steel-500 text-xs mt-0.5">{r.saved} note(s) importée(s) · {r.matched}/{r.total_rows} élève(s) reconnu(s)</p>
                      {r.errors?.length > 0 && (
                        <ul className="mt-1 text-xs text-red-600 space-y-0.5 max-h-28 overflow-y-auto">
                          {r.errors.slice(0, 10).map((e, j) => <li key={j}>Ligne {e.row}: {e.message}</li>)}
                          {r.errors.length > 10 && <li>… et {r.errors.length - 10} autre(s)</li>}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
