import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'

export default function ClassroomsPage() {
  const [classrooms, setClassrooms] = useState([])
  const [totalRooms, setTotalRooms] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  async function fetchClassrooms() {
    const res = await api.get('/api/classrooms')
    setClassrooms(res.data.classrooms || [])
    setLoading(false)
    api.get('/api/onboarding/classroom-data').then(r => setTotalRooms(r.data.total_rooms || null)).catch(() => {})
  }

  useEffect(() => { fetchClassrooms() }, [])

  async function handleDelete(id, label) {
    if (!confirm(`Supprimer la classe "${label}" ?`)) return
    try {
      await api.delete(`/api/classrooms/${id}`)
      fetchClassrooms()
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur')
    }
  }

  const totalStudents = classrooms.reduce((s, c) => s + (c.student_count || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Classes</h1>
          <p className="text-sm text-steel-500 mt-0.5">
            {classrooms.length} classe(s) · {totalStudents} élève(s)
            {totalRooms && <span className="ml-2">· {classrooms.length}/{totalRooms} salles</span>}
          </p>
        </div>
      </div>

      {totalRooms && classrooms.length > parseInt(totalRooms) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 flex items-start gap-2">
          <svg className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-xs text-yellow-700"><strong>{classrooms.length} classes</strong> pour <strong>{totalRooms} salles</strong> disponibles.</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
      ) : classrooms.length === 0 ? (
        <div className="bg-white rounded-xl border border-steel-200 p-12 text-center">
          <p className="text-steel-400">Aucune classe pour cette année</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {classrooms.map(c => (
            <div key={c.id} onClick={() => navigate(`/classrooms/${c.id}`)}
              className="bg-white rounded-xl border border-steel-200 p-5 hover:border-steel-300 cursor-pointer transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-medium text-steel-900">{c.label}</h3>
                  <p className="text-xs text-steel-500">{c.level_name}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDelete(c.id, c.label) }}
                  className="text-xs text-steel-300 hover:text-red-500 transition-colors p-1" title="Supprimer">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-steel-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span className="text-sm text-steel-700">{c.student_count}</span>
                  <span className="text-xs text-steel-400">/ {c.capacity}</span>
                </div>
                {c.student_count > c.capacity && (
                  <span className="px-1.5 py-0.5 bg-red-50 text-red-500 rounded text-xs font-medium">Plein</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
