import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Tableau de bord', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', perm: null },
  { to: '/students', label: 'Élèves', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', perm: 'students.view' },
  { to: '/teachers', label: 'Enseignants', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', perm: 'students.view' },
  { to: '/classrooms', label: 'Classes', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', perm: 'students.view' },
  { to: '/grades', label: 'Notes', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', perm: 'grades.view' },
  { to: '/report-cards', label: 'Bulletins', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', perm: 'reports.view' },
  { to: '/finance', label: 'Finance', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', perm: 'finance.view' },
  { to: '/settings', label: 'Paramètres', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', perm: 'admin' },
]

export default function Layout({ schoolInfo }) {
  const { user, logout, hasPermission } = useAuth()

  const visibleItems = NAV_ITEMS.filter(item => {
    if (!item.perm) return true
    if (item.perm === 'admin') return user?.role === 'admin'
    return hasPermission(item.perm)
  })

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-steel-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-steel-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-steel-900 rounded-xl flex items-center justify-center">
              <span className="text-brand-200 text-sm font-semibold">S</span>
            </div>
            <div className="min-w-0">
              <p className="text-steel-200 font-medium text-xs truncate">{schoolInfo?.school_name || 'ScolaDesk'}</p>
              <p className="text-steel-500 text-[10px]">{schoolInfo?.school_code || ''}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {visibleItems.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive ? 'bg-steel-700/50 text-steel-200' : 'text-steel-400 hover:text-steel-200 hover:bg-steel-700/30'
              }`}>
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-steel-700">
          <div className="px-3 py-2 mb-1">
            <p className="text-steel-300 text-xs font-medium truncate">{user?.fullName}</p>
            <p className="text-steel-500 text-[10px]">{user?.roleLabel}</p>
          </div>
          <button onClick={logout}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-steel-400 hover:text-steel-200 hover:bg-steel-700/30 text-sm w-full transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 bg-white border-b border-steel-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm text-steel-700 font-medium">{schoolInfo?.tier || ''}</span>
            {schoolInfo?.features?.length > 0 && (
              <span className="text-xs text-steel-400">
                {schoolInfo.features.length} fonctionnalité(s)
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-steel-500">
            <span>{user?.fullName}</span>
            <span className="px-2 py-0.5 bg-steel-100 rounded text-steel-600">{user?.roleLabel}</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-steel-50">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
