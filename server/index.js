const express = require('express')
const cors = require('cors')
const { initializeDatabase } = require('./db/init')

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Initialize DB
initializeDatabase()

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: 'ScolaDesk', version: '1.0.0' })
})

// Routes
app.use('/api/auth', require('./routes/auth'))
app.use('/api/activation', require('./routes/activation'))
app.use('/api/onboarding', require('./routes/onboarding'))

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] ScolaDesk running on port ${PORT}`)
})