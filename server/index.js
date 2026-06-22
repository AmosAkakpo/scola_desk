const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

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
app.use('/api/students', require('./routes/students'))
app.use('/api/classrooms', require('./routes/classrooms'))
app.use('/api/teachers', require('./routes/teachers'))
app.use('/api/settings', require('./routes/settings'))
app.use('/api/grades', require('./routes/grades'))
app.use('/api/decisions', require('./routes/decisions'))
app.use('/api/report-cards', require('./routes/reportcards'))

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] ScolaDesk running on port ${PORT}`)
})