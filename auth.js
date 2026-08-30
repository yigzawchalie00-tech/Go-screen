const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_prod';

function generateToken(admin) {
  return jwt.sign(
    { id: admin.id, username: admin.username, role: admin.role, office: admin.office_name },
    SECRET,
    { expiresIn: '8h' }
  );
}

function requireAuth(roles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    try {
      const payload = jwt.verify(header.slice(7), SECRET);
      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ error: 'Not authorized.' });
      }
      req.admin = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
  };
}

async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const office = process.env.ADMIN_OFFICE || 'Main Office';
  const existing = await pool.query('SELECT id FROM admins WHERE username = $1', [username]);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO admins (username, password_hash, office_name, role, full_name) VALUES ($1,$2,$3,$4,$5)',
      [username, hash, office, 'super_admin', 'Super Admin']
    );
    console.log(`Admin created: ${username}`);
  }
}

module.exports = { generateToken, requireAuth, seedAdmin, bcrypt };
