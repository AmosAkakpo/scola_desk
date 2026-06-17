import axios from 'axios'

const api = axios.create({
    baseURL: 'http://localhost:3000',
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json'
    }
})

// Response interceptor — handle global errors
api.interceptors.response.use(
    res => res,
    err => {
        const message = err.response?.data?.message || 'Erreur de connexion au serveur'
        return Promise.reject({ ...err, friendlyMessage: message })
    }
)

export default api