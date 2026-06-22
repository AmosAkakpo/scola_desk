import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/api/grades/dashboard/stats').then(res => {
      setStats(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>

  if (!stats) return <p className="text-steel-400 text-center py-20">Impossible de charger le tableau de bord</p>

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium text-steel-900">Tableau de bord</h1>
        <p className="text-sm text-steel-500 mt-0.5">Année scolaire {stats.academic_year || '—'}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Élèves', value: stats.total_students, icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', link: '/students' },
          { label: 'Classes', value: stats.total_classrooms, icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', link: '/classrooms' },
          { label: 'Enseignants', value: stats.total_teachers, icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', link: '/teachers' },
        ].map(s => (
          <button key={s.label} onClick={() => navigate(s.link)}
            className="bg-white rounded-xl border border-steel-200 p-5 text-left hover:border-steel-300 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-steel-500">{s.label}</p>
                <p className="text-2xl font-medium text-steel-900 mt-1">{s.value}</p>
              </div>
              <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={s.icon} />
                </svg>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Semester progress */}
      <div className="bg-white rounded-xl border border-steel-200 p-6 mb-6">
        <h2 className="text-sm font-medium text-steel-700 mb-4">Progression par trimestre</h2>
        <div className="grid grid-cols-3 gap-6">
          {stats.semesters?.map(sem => (
            <div key={sem.semester}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-steel-800">Trimestre {sem.semester}</span>
                <span className="text-xs text-steel-400">{sem.grades_entered_pct}%</span>
              </div>
              <div className="w-full h-2 bg-steel-100 rounded-full mb-3">
                <div className={`h-full rounded-full transition-all ${sem.grades_entered_pct >= 80 ? 'bg-brand' : sem.grades_entered_pct >= 40 ? 'bg-yellow-400' : 'bg-steel-300'}`}
                  style={{ width: `${sem.grades_entered_pct}%` }} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-steel-500">Notes saisies</span>
                  <span className={`font-medium ${sem.grades_entered_pct >= 80 ? 'text-brand' : 'text-steel-700'}`}>{sem.grades_entered_pct}%</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-steel-500">Classes calculées</span>
                  <span className="text-steel-700 font-medium">{sem.classrooms_computed}/{stats.total_classrooms}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-steel-500">Bulletins générés</span>
                  <span className="text-steel-700 font-medium">{sem.bulletins_generated}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions + Recent bulletins */}
      <div className="grid grid-cols-2 gap-6">
        {/* Quick actions */}
        <div className="bg-white rounded-xl border border-steel-200 p-6">
          <h2 className="text-sm font-medium text-steel-700 mb-4">Actions rapides</h2>
          <div className="space-y-2">
            {[
              { label: 'Saisir des notes', desc: 'Ouvrir la grille de saisie', link: '/grades', color: 'bg-brand' },
              { label: 'Calculer les moyennes', desc: 'Lancer le calcul et classement', link: '/grades/compute', color: 'bg-blue-500' },
              { label: 'Générer les bulletins', desc: 'Créer et imprimer les bulletins', link: '/report-cards', color: 'bg-purple-500' },
            ].map(a => (
              <button key={a.label} onClick={() => navigate(a.link)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-steel-200 hover:bg-steel-50 transition-colors text-left">
                <div className={`w-8 h-8 ${a.color} rounded-lg flex items-center justify-center shrink-0`}>
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-steel-800">{a.label}</p>
                  <p className="text-xs text-steel-500">{a.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent bulletins */}
        <div className="bg-white rounded-xl border border-steel-200 p-6">
          <h2 className="text-sm font-medium text-steel-700 mb-4">Derniers bulletins générés</h2>
          {stats.recent_bulletins?.length > 0 ? (
            <div className="space-y-2">
              {stats.recent_bulletins.map(b => (
                <button key={b.id} onClick={() => navigate(`/report-cards/${b.id}`)}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-steel-50 transition-colors text-left">
                  <div>
                    <p className="text-sm text-steel-800">{b.full_name}</p>
                    <p className="text-xs text-steel-500">{b.classroom_label} · T{b.semester}</p>
                  </div>
                  <span className="text-xs text-steel-400">
                    {b.generated_at ? new Date(b.generated_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-steel-400 text-center py-4">Aucun bulletin généré</p>
          )}
        </div>
      </div>
    </div>
  )
}
