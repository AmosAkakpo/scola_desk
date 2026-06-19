import { createContext, useContext, useState, useEffect } from 'react'
import api from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [token, setToken] = useState(null)
    const [loading, setLoading] = useState(true)

    // On mount, check if we have a token in memory
    // Token lives only in JS memory — never localStorage
    useEffect(() => {
        setLoading(false)
    }, [])

    async function login(username, password) {
        const res = await api.post('/api/auth/login', { username, password })
        const { token: newToken, user: newUser } = res.data
        setToken(newToken)
        setUser(newUser)
        // Attach token to all future requests
        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
        return newUser
    }

    async function logout() {
        try {
            await api.post('/api/auth/logout')
        } catch { }
        setToken(null)
        setUser(null)
        delete api.defaults.headers.common['Authorization']
    }

    function hasPermission(code) {
        if (!user) return false
        const perms = user.permissions || []
        if (perms.includes('*')) return true
        if (perms.includes(code)) return true
        const domain = code.split('.')[0]
        if (perms.includes(`${domain}.*`)) return true
        return false
    }

    return (
        <AuthContext.Provider value={{
            user,
            token,
            loading,
            login,
            logout,
            hasPermission,
            isAuthenticated: !!user
        }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}