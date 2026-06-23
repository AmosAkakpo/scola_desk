import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import api from '../../utils/api'

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [schoolName, setSchoolName] = useState('')
  const { login } = useAuth()

  useEffect(() => {
    api.get('/api/activation/status').then(res => {
      if (res.data.school_name) setSchoolName(res.data.school_name)
    }).catch(() => {})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username.trim().toLowerCase(), password)
      onLogin()
    } catch (err) {
      setError(err.response?.data?.message || err.friendlyMessage || 'Identifiants incorrects')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-steel-900">
      <div className="w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-8">
          <img src="/android-chrome-192x192.png" alt="ScolaDesk" className="w-16 h-16 rounded-2xl mb-4" />
          <h1 className="text-xl font-medium text-steel-200">{schoolName || 'ScolaDesk'}</h1>
          <p className="text-steel-400 text-sm mt-1">Connexion</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-steel-400 mb-1.5">Nom d'utilisateur</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required autoFocus
              className="w-full px-3 py-2.5 bg-steel-800 border border-steel-700 rounded-lg text-steel-200 placeholder-steel-500 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-sm"
              placeholder="admin" />
          </div>
          <div>
            <label className="block text-sm text-steel-400 mb-1.5">Mot de passe</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full px-3 py-2.5 bg-steel-800 border border-steel-700 rounded-lg text-steel-200 placeholder-steel-500 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-sm"
              placeholder="••••••••" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading || !username || !password}
            className="w-full py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors">
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
