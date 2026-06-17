const jwt = require('jsonwebtoken')

const SECRET = process.env.JWT_SECRET || 'scola_desk_dev_secret_change_in_prod'
const EXPIRY = '12h'

function signToken(payload) {
    return jwt.sign(payload, SECRET, { expiresIn: EXPIRY })
}

function verifyToken(token) {
    try {
        return jwt.verify(token, SECRET)
    } catch {
        return null
    }
}

module.exports = { signToken, verifyToken }