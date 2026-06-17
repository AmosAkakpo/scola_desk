const { randomUUID, randomBytes } = require('crypto')

function generateUUID() {
    return randomUUID()
}

// Generates structured UIDs like T-202506-A3F1
function generateShortUID(prefix = '') {
    const now = new Date()
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    const rand = randomBytes(2).toString('hex').toUpperCase()
    return prefix ? `${prefix}-${ym}-${rand}` : `${ym}-${rand}`
}

// Generates matricule from mask pattern
// Mask: SCH/YEAR/SEQ → ATL/2026/001
function generateMatricule(mask, context = {}) {
    const { schoolCode = 'SCH', year = new Date().getFullYear(), seq = 1 } = context
    return mask
        .replace('SCH', schoolCode)
        .replace('YEAR', year)
        .replace('SEQ', String(seq).padStart(3, '0'))
        .replace('YYYYMM', `${year}${String(new Date().getMonth() + 1).padStart(2, '0')}`)
        .replace('XXXX', String(seq).padStart(4, '0'))
}

module.exports = { generateUUID, generateShortUID, generateMatricule }