const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { hashPassword, verifyPassword } = require('../utils/password')
const { signToken } = require('../utils/jwt')
const { generateUUID, generateShortUID, generateUserUID, getSchoolPrefix } = require('../utils/uid')
const { requireAuth } = require('../middleware/requireAuth')

// ─── POST /api/auth/login ─────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body

        if (!username || !password) {
            return res.status(400).json({
                error: 'MISSING_FIELDS',
                message: 'Nom d\'utilisateur et mot de passe requis'
            })
        }

        const db = getDb()
        const user = db.prepare(`
      SELECT
        u.id,
        u.user_uid,
        u.full_name,
        u.username,
        u.password_hash,
        u.role_id,
        u.is_active,
        u.is_deleted,
        r.name  AS role_name,
        r.label AS role_label
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.username = ?
        AND u.is_deleted = 0
    `).get(username.trim().toLowerCase())

        if (!user) {
            return res.status(401).json({
                error: 'INVALID_CREDENTIALS',
                message: 'Identifiants incorrects'
            })
        }

        if (!user.is_active) {
            return res.status(401).json({
                error: 'ACCOUNT_DISABLED',
                message: 'Compte désactivé. Contactez l\'administrateur.'
            })
        }

        const valid = await verifyPassword(password, user.password_hash)
        if (!valid) {
            // Log failed attempt
            db.prepare(`
        INSERT INTO audit_logs
          (user_id, action, entity_type, entity_id, ip_address)
        VALUES (?, 'LOGIN_FAILED', 'user', ?, ?)
      `).run(user.id, String(user.id), req.ip)

            return res.status(401).json({
                error: 'INVALID_CREDENTIALS',
                message: 'Identifiants incorrects'
            })
        }

        const token = signToken({
            userId: user.id,
            userUid: user.user_uid,
            role: user.role_name
        })

        // Log successful login
        db.prepare(`
      INSERT INTO audit_logs
        (user_id, action, entity_type, entity_id, ip_address)
      VALUES (?, 'LOGIN_SUCCESS', 'user', ?, ?)
    `).run(user.id, String(user.id), req.ip)

        // Load permissions
        let permissions = ['*']
        if (user.role_name !== 'admin') {
            const perms = db.prepare(`
                SELECT p.code FROM role_permissions rp
                JOIN permissions p ON p.id = rp.permission_id
                WHERE rp.role_id = ?
            `).all(user.role_id)
            permissions = perms.map(p => p.code)
        }

        return res.json({
            token,
            user: {
                id: user.id,
                userUid: user.user_uid,
                fullName: user.full_name,
                username: user.username,
                role: user.role_name,
                roleLabel: user.role_label,
                permissions
            }
        })
    } catch (err) {
        console.error('[LOGIN]', err)
        return res.status(500).json({
            error: 'SERVER_ERROR',
            message: 'Erreur serveur'
        })
    }
})

// ─── GET /api/auth/me ─────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
    return res.json({
        user: {
            id: req.user.id,
            userUid: req.user.user_uid,
            fullName: req.user.full_name,
            username: req.user.username,
            role: req.user.role_name,
            roleLabel: req.user.role_label,
            permissions: req.user.permissions
        }
    })
})

// ─── POST /api/auth/logout ────────────────────────────────────────
router.post('/logout', requireAuth, (req, res) => {
    const db = getDb()
    db.prepare(`
    INSERT INTO audit_logs
      (user_id, action, entity_type, entity_id, ip_address)
    VALUES (?, 'LOGOUT', 'user', ?, ?)
  `).run(req.user.id, String(req.user.id), req.ip)

    return res.json({ message: 'Déconnecté avec succès' })
})

// ─── POST /api/auth/setup ─────────────────────────────────────────
// Creates the first admin user during onboarding.
// Blocked if any user already exists.
router.post('/setup', async (req, res) => {
    try {
        const { fullName, username, password } = req.body

        if (!fullName || !username || !password) {
            return res.status(400).json({
                error: 'MISSING_FIELDS',
                message: 'Tous les champs sont requis'
            })
        }

        if (password.length < 6) {
            return res.status(400).json({
                error: 'PASSWORD_TOO_SHORT',
                message: 'Mot de passe minimum 6 caractères'
            })
        }

        const db = getDb()

        // Block if admin already exists
        const existing = db.prepare(`
      SELECT id FROM users LIMIT 1
    `).get()

        if (existing) {
            return res.status(409).json({
                error: 'SETUP_ALREADY_DONE',
                message: 'Configuration déjà effectuée'
            })
        }

        const adminRole = db.prepare(`
      SELECT id FROM roles WHERE name = 'admin'
    `).get()

        if (!adminRole) {
            return res.status(500).json({
                error: 'ROLE_NOT_FOUND',
                message: 'Rôle admin introuvable'
            })
        }

        const passwordHash = await hashPassword(password)
        const userUid = generateUserUID(getSchoolPrefix(db))
        const matricule = generateShortUID('U')

        db.prepare(`
      INSERT INTO users
        (user_uid, matricule, full_name, username, password_hash, role_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
            userUid,
            matricule,
            fullName.trim(),
            username.trim().toLowerCase(),
            passwordHash,
            adminRole.id
        )

        // Log the event
        const newUser = db.prepare(`
      SELECT id FROM users WHERE user_uid = ?
    `).get(userUid)

        db.prepare(`
      INSERT INTO audit_logs
        (user_id, action, entity_type, entity_id)
      VALUES (?, 'ADMIN_CREATED', 'user', ?)
    `).run(newUser.id, String(newUser.id))

        return res.status(201).json({
            message: 'Administrateur créé avec succès'
        })
    } catch (err) {
        console.error('[SETUP]', err)
        return res.status(500).json({
            error: 'SERVER_ERROR',
            message: 'Erreur serveur'
        })
    }
})

module.exports = router