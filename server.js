require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'cel.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// The four manufacturing verticals every vendor and consumer must register under.
// Product Issue complaints are always routed within a single one of these categories.
const MANUFACTURE_CATEGORIES = [
  'Defence & Strategic Systems',
  'Industrial Electronics & IT',
  'Railway Technologies',
  'Renewable Energy'
];
// Complaints that never involve a vendor and stay with admin only.
const DIRECT_CATEGORIES = ['HR', 'Payment', 'General'];
const COMPLAINT_TYPES = ['Product Issue', 'Direct'];
const COMPLAINT_STATUSES = ['Open', 'Assigned', 'Vendor Resolved', 'Disputed', 'Solved'];

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      vendor_id TEXT UNIQUE COLLATE NOCASE,
      user_type TEXT NOT NULL DEFAULT 'consumer' CHECK(user_type IN ('vendor','consumer')),
      category TEXT,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
      is_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_otps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      reset_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_code TEXT UNIQUE,
      user_id INTEGER NOT NULL,
      complaint_type TEXT NOT NULL DEFAULT 'Direct' CHECK(complaint_type IN ('Product Issue','Direct')),
      subject TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      attachment_path TEXT,
      attachment_name TEXT,
      assigned_vendor_id INTEGER,
      vendor_remark TEXT,
      vendor_resolved_at TEXT,
      consumer_confirmed_at TEXT,
      status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','Assigned','Vendor Resolved','Disputed','Solved')),
      admin_remark TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(assigned_vendor_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
      FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_complaints_user ON complaints(user_id);
    CREATE INDEX IF NOT EXISTS idx_comments_complaint ON comments(complaint_id);
  `);

  // Migration: add user_type to pre-existing databases created before this column existed.
  const userColumns = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userColumns.includes('user_type')) {
    db.exec("ALTER TABLE users ADD COLUMN user_type TEXT NOT NULL DEFAULT 'consumer'");
    // Anyone who already has a vendor_id was clearly registering as a vendor.
    db.exec("UPDATE users SET user_type='vendor' WHERE vendor_id IS NOT NULL");
    console.log('Migrated users table: added user_type column.');
  }
  if (!userColumns.includes('category')) {
    db.exec('ALTER TABLE users ADD COLUMN category TEXT');
    console.log('Migrated users table: added category column. Existing vendors/consumers should re-select their manufacture category from their profile.');
  }

  // Migration: rebuild complaints table for the vendor-routing workflow (category, complaint_type,
  // assigned_vendor_id, vendor_remark, etc. did not exist in the earlier single-flow schema).
  const complaintColumns = db.prepare("PRAGMA table_info(complaints)").all().map(c => c.name);
  if (complaintColumns.length && !complaintColumns.includes('complaint_type')) {
    db.exec('ALTER TABLE complaints RENAME TO complaints_old');
    db.exec(`
      CREATE TABLE complaints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_code TEXT UNIQUE,
        user_id INTEGER NOT NULL,
        complaint_type TEXT NOT NULL DEFAULT 'Direct' CHECK(complaint_type IN ('Product Issue','Direct')),
        subject TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        attachment_path TEXT,
        attachment_name TEXT,
        assigned_vendor_id INTEGER,
        vendor_remark TEXT,
        vendor_resolved_at TEXT,
        consumer_confirmed_at TEXT,
        status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','Assigned','Vendor Resolved','Disputed','Solved')),
        admin_remark TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(assigned_vendor_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    // Old complaints had no vendor routing at all, so every old row becomes a Direct (admin-only)
    // complaint under 'General', with its old category kept visible inside the description.
    db.exec(`
      INSERT INTO complaints(id, complaint_code, user_id, complaint_type, subject, category, description,
        attachment_path, attachment_name, status, admin_remark, created_at, updated_at)
      SELECT id, complaint_code, user_id, 'Direct', subject,
        CASE WHEN category = 'HR' THEN 'HR' ELSE 'General' END,
        '[Migrated from old category: ' || category || '] ' || description,
        attachment_path, attachment_name,
        CASE WHEN status = 'Solved' THEN 'Solved' ELSE 'Open' END,
        admin_remark, created_at, updated_at
      FROM complaints_old
    `);
    db.exec('DROP TABLE complaints_old');
    console.log('Migrated complaints table to the vendor-routing schema (old rows preserved as Direct/General).');
  }

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@cel.local').trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'Admin@12345', 12);
    db.prepare(`INSERT INTO users(name,email,password_hash,role,is_verified)
                VALUES(?,?,?,?,1)`).run(
      process.env.ADMIN_NAME || 'CEL Administrator',
      adminEmail,
      hash,
      'admin'
    );
    console.log(`Seeded admin account: ${adminEmail}`);
  }
}
initializeDatabase();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'development-only-change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8
  }
}));
app.use('/uploads', express.static(UPLOAD_DIR, { dotfiles: 'deny', index: false }));
app.use(express.static(path.join(ROOT, 'public')));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });

const allowedExtensions = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx']);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(ext)) return cb(new Error('Unsupported attachment type.'));
    cb(null, true);
  }
});

function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function cleanText(value, max = 5000) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function validVendorId(value) { return /^[A-Za-z0-9-]{3,30}$/.test(String(value || '').trim()); }
function strongPassword(password) {
  return typeof password === 'string' && password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
}
function requireUser(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in first.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}
function requireVendor(req, res, next) {
  if (!req.session.user || req.session.user.userType !== 'vendor') return res.status(403).json({ error: 'Vendor access required.' });
  next();
}
function publicUser(user) {
  return user ? {
    id: user.id,
    name: user.name,
    email: user.email,
    vendorId: user.vendor_id,
    userType: user.user_type,
    category: user.category,
    role: user.role,
    isVerified: Boolean(user.is_verified)
  } : null;
}
function generateOtp() { return String(crypto.randomInt(100000, 1000000)); }
function hashOtp(otp) { return crypto.createHash('sha256').update(otp).digest('hex'); }

async function sendMail(to, subject, text, html) {
  if ((process.env.EMAIL_MODE || 'mock').toLowerCase() !== 'smtp') {
    console.log(`[MOCK EMAIL] To: ${to} | Subject: ${subject} | ${text}`);
    return { mock: true };
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transporter.sendMail({ from: process.env.EMAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
  return { mock: false };
}

async function sendOtpEmail(email, otp) {
  return sendMail(
    email,
    'CEL account verification OTP',
    `Your CEL verification OTP is ${otp}. It expires in 10 minutes.`,
    `<p>Your CEL verification OTP is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`
  );
}

async function sendResetEmail(email, code) {
  return sendMail(
    email,
    'CEL password reset code',
    `Your CEL password reset code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    `<p>Your CEL password reset code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`
  );
}

async function sendStatusEmail(email, complaintCode, status, remark) {
  return sendMail(
    email,
    `Your CEL complaint ${complaintCode} was updated`,
    `Your complaint ${complaintCode} is now marked: ${status}.${remark ? ` Remark: ${remark}` : ''}`,
    `<p>Your complaint <strong>${complaintCode}</strong> is now marked: <strong>${status}</strong>.</p>${remark ? `<p>Remark: ${remark}</p>` : ''}`
  );
}

app.get('/api/auth/me', (req, res) => res.json({ user: req.session.user || null }));

// Public, read-only: powers the "Approved Vendor List" page. No auth required —
// this is meant to be visible to any visitor, same as it would be on the real site.
// Only exposes name/category/vendor code, never email or any account internals.
app.get('/api/public/vendors', (req, res) => {
  const vendors = db.prepare(
    `SELECT name, category, vendor_id FROM users
     WHERE role='user' AND user_type='vendor' AND is_verified=1
     ORDER BY category, name`
  ).all();
  res.json({ vendors });
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const name = cleanText(req.body.name, 80);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const adminCode = String(req.body.adminCode || '').trim();
    if (adminCode && (!process.env.ADMIN_SIGNUP_CODE || adminCode !== process.env.ADMIN_SIGNUP_CODE)) {
      return res.status(403).json({ error: 'Incorrect admin access code.' });
    }
    const wantsAdmin = Boolean(adminCode);

    if (name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!strongPassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters and include uppercase, lowercase and a number.' });
    if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'An account with this email already exists.' });

    let vendorId = null;
    let userType = 'consumer';
    let category = null;
    if (!wantsAdmin) {
      userType = String(req.body.userType || '').trim().toLowerCase();
      if (!['vendor', 'consumer'].includes(userType)) {
        return res.status(400).json({ error: 'Select whether you are registering as a Vendor/Seller or a Consumer.' });
      }
      category = cleanText(req.body.category, 60);
      if (!MANUFACTURE_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: 'Select the CEL manufacture category you belong to.' });
      }
      if (userType === 'vendor') {
        vendorId = cleanText(req.body.vendorId, 30).toUpperCase();
        if (!validVendorId(vendorId)) return res.status(400).json({ error: 'Enter a valid Seller/Vendor ID (3-30 letters, numbers or hyphens).' });
        if (db.prepare('SELECT id FROM users WHERE vendor_id=?').get(vendorId)) return res.status(409).json({ error: 'This Seller/Vendor ID is already registered.' });
      }
    }

    const role = wantsAdmin ? 'admin' : 'user';
    const result = db.prepare('INSERT INTO users(name,email,password_hash,vendor_id,user_type,category,role) VALUES(?,?,?,?,?,?,?)')
      .run(name, email, bcrypt.hashSync(password, 12), vendorId, userType, category, role);
    const otp = generateOtp();
    db.prepare('INSERT INTO email_otps(user_id,otp_hash,expires_at) VALUES(?,?,datetime(\'now\',\'+10 minutes\'))')
      .run(result.lastInsertRowid, hashOtp(otp));
    const delivery = await sendOtpEmail(email, otp);
    res.status(201).json({ message: 'Registration successful. Verify your email with the OTP.', email, mockOtp: delivery.mock ? otp : undefined });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not register the account.' });
  }
});

app.post('/api/auth/verify-otp', otpLimiter, (req, res) => {
  const email = normalizeEmail(req.body.email);
  const otp = cleanText(req.body.otp, 6);
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  const record = db.prepare(`SELECT * FROM email_otps WHERE user_id=? AND used_at IS NULL ORDER BY id DESC LIMIT 1`).get(user.id);
  if (!record) return res.status(400).json({ error: 'No active OTP found.' });
  if (new Date(record.expires_at.replace(' ', 'T') + 'Z') < new Date()) return res.status(400).json({ error: 'OTP has expired.' });
  if (record.attempts >= 5) return res.status(429).json({ error: 'Too many incorrect attempts. Request a new OTP.' });
  if (hashOtp(otp) !== record.otp_hash) {
    db.prepare('UPDATE email_otps SET attempts=attempts+1 WHERE id=?').run(record.id);
    return res.status(400).json({ error: 'Incorrect OTP.' });
  }
  db.transaction(() => {
    db.prepare('UPDATE users SET is_verified=1 WHERE id=?').run(user.id);
    db.prepare('UPDATE email_otps SET used_at=CURRENT_TIMESTAMP WHERE id=?').run(record.id);
  })();
  res.json({ message: 'Email verified. You may now log in.' });
});

app.post('/api/auth/resend-otp', otpLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    if (user.is_verified) return res.status(400).json({ error: 'This account is already verified.' });
    const otp = generateOtp();
    db.prepare('INSERT INTO email_otps(user_id,otp_hash,expires_at) VALUES(?,?,datetime(\'now\',\'+10 minutes\'))').run(user.id, hashOtp(otp));
    const delivery = await sendOtpEmail(email, otp);
    res.json({ message: 'A new OTP has been sent.', mockOtp: delivery.mock ? otp : undefined });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not resend OTP.' });
  }
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Incorrect email or password.' });
  if (!user.is_verified) return res.status(403).json({ error: 'Verify your email before logging in.', needsVerification: true, email });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not start session.' });
    req.session.user = publicUser(user);
    res.json({ message: 'Logged in successfully.', user: req.session.user });
  });
});

app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ message: 'Logged out.' })));

app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    let mockOtp;
    if (user) {
      const code = generateOtp();
      db.prepare(`INSERT INTO password_resets(user_id,reset_hash,expires_at) VALUES(?,?,datetime('now','+10 minutes'))`)
        .run(user.id, hashOtp(code));
      const delivery = await sendResetEmail(email, code);
      if (delivery.mock) mockOtp = code;
    }
    // Same response whether or not the account exists, so we don't reveal which emails are registered.
    res.json({ message: 'If an account exists for that email, a reset code has been sent.', mockOtp });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not process the request.' });
  }
});

app.post('/api/auth/reset-password', otpLimiter, (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = cleanText(req.body.code, 6);
  const newPassword = String(req.body.newPassword || '');
  if (!strongPassword(newPassword)) return res.status(400).json({ error: 'Password must be at least 8 characters and include uppercase, lowercase and a number.' });
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  const record = db.prepare(`SELECT * FROM password_resets WHERE user_id=? AND used_at IS NULL ORDER BY id DESC LIMIT 1`).get(user.id);
  if (!record) return res.status(400).json({ error: 'No active reset code found. Request a new one.' });
  if (new Date(record.expires_at.replace(' ', 'T') + 'Z') < new Date()) return res.status(400).json({ error: 'Reset code has expired.' });
  if (record.attempts >= 5) return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
  if (hashOtp(code) !== record.reset_hash) {
    db.prepare('UPDATE password_resets SET attempts=attempts+1 WHERE id=?').run(record.id);
    return res.status(400).json({ error: 'Incorrect reset code.' });
  }
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(newPassword, 12), user.id);
    db.prepare('UPDATE password_resets SET used_at=CURRENT_TIMESTAMP WHERE id=?').run(record.id);
  })();
  res.json({ message: 'Password updated. You may now log in.' });
});

const ALL_COMPLAINT_CATEGORIES = [...MANUFACTURE_CATEGORIES, ...DIRECT_CATEGORIES];
const COMPLAINT_JOIN_SQL = `FROM complaints c
  JOIN users u ON u.id = c.user_id
  LEFT JOIN users v ON v.id = c.assigned_vendor_id`;
const COMPLAINT_SELECT_COLS = `c.*, u.name user_name, u.email user_email, u.vendor_id seller_id,
  u.user_type complainant_type, u.category user_category,
  v.name assigned_vendor_name, v.vendor_id assigned_vendor_code`;

app.get('/api/complaints', requireUser, (req, res) => {
  const isAdmin = req.session.user.role === 'admin';
  const scope = req.query.scope === 'assigned' ? 'assigned' : 'own';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
  const offset = (page - 1) * pageSize;

  const filters = [];
  const params = [];
  if (!isAdmin) {
    if (scope === 'assigned') {
      if (req.session.user.userType !== 'vendor') return res.status(403).json({ error: 'Only vendor accounts have an assigned-complaints queue.' });
      filters.push('c.assigned_vendor_id=?'); params.push(req.session.user.id);
    } else {
      filters.push('c.user_id=?'); params.push(req.session.user.id);
    }
  }
  if (req.query.category && ALL_COMPLAINT_CATEGORIES.includes(req.query.category)) {
    filters.push('c.category=?'); params.push(req.query.category);
  }
  if (req.query.status && COMPLAINT_STATUSES.includes(req.query.status)) {
    filters.push('c.status=?'); params.push(req.query.status);
  }
  if (req.query.q) {
    filters.push('c.subject LIKE ?'); params.push(`%${cleanText(req.query.q, 160)}%`);
  }
  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) count ${COMPLAINT_JOIN_SQL} ${whereSql}`).get(...params).count;
  const rows = db.prepare(`SELECT ${COMPLAINT_SELECT_COLS} ${COMPLAINT_JOIN_SQL} ${whereSql} ORDER BY c.id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  res.json({ complaints: rows, total, page, pageSize });
});

app.get('/api/complaints/summary', requireUser, (req, res) => {
  const isAdmin = req.session.user.role === 'admin';
  const whereSql = isAdmin ? '' : 'WHERE user_id=?';
  const params = isAdmin ? [] : [req.session.user.id];
  const total = db.prepare(`SELECT COUNT(*) count FROM complaints ${whereSql}`).get(...params).count;
  const solvedWhere = isAdmin ? `WHERE status='Solved'` : `WHERE user_id=? AND status='Solved'`;
  const solved = db.prepare(`SELECT COUNT(*) count FROM complaints ${solvedWhere}`).get(...params).count;
  let assigned = 0;
  if (req.session.user.userType === 'vendor') {
    assigned = db.prepare(`SELECT COUNT(*) count FROM complaints WHERE assigned_vendor_id=? AND status IN ('Assigned','Disputed')`).get(req.session.user.id).count;
  }
  res.json({ total, solved, unsolved: total - solved, assigned });
});

app.post('/api/complaints', requireUser, upload.single('attachment'), (req, res) => {
  if (req.session.user.role === 'admin') return res.status(400).json({ error: 'Use a normal user account to register a complaint.' });
  const subject = cleanText(req.body.subject, 160);
  const description = cleanText(req.body.description, 5000);
  const complaintType = cleanText(req.body.complaintType, 20);
  if (subject.length < 4 || description.length < 10) return res.status(400).json({ error: 'Enter a clear subject and description.' });
  if (!COMPLAINT_TYPES.includes(complaintType)) return res.status(400).json({ error: 'Choose whether this is a Product Issue or a Direct query.' });

  let category;
  if (complaintType === 'Product Issue') {
    // The category is always the complainant's own registered manufacture category —
    // never taken from client input — so routing always lands on the correct vendor pool.
    category = req.session.user.category;
    if (!MANUFACTURE_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Your account has no manufacture category on file. Please contact admin to update your profile.' });
    }
  } else {
    category = cleanText(req.body.category, 30);
    if (!DIRECT_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Choose a valid category (HR, Payment or General).' });
  }

  const result = db.prepare(`INSERT INTO complaints(user_id,complaint_type,subject,category,description,attachment_path,attachment_name)
    VALUES(?,?,?,?,?,?,?)`).run(req.session.user.id, complaintType, subject, category, description, req.file?.filename || null, req.file?.originalname || null);
  const code = `CEL-${new Date().getFullYear()}-${String(result.lastInsertRowid).padStart(6, '0')}`;
  db.prepare('UPDATE complaints SET complaint_code=? WHERE id=?').run(code, result.lastInsertRowid);
  res.status(201).json({ message: 'Complaint registered successfully.', complaintId: code });
});

app.get('/api/complaints/:id', requireUser, (req, res) => {
  const complaint = db.prepare(`SELECT ${COMPLAINT_SELECT_COLS} ${COMPLAINT_JOIN_SQL} WHERE c.complaint_code=?`).get(req.params.id);
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });
  const isAdmin = req.session.user.role === 'admin';
  const isOwner = complaint.user_id === req.session.user.id;
  const isAssignedVendor = complaint.assigned_vendor_id === req.session.user.id;
  if (!isAdmin && !isOwner && !isAssignedVendor) return res.status(403).json({ error: 'You cannot access this complaint.' });
  const comments = db.prepare(`SELECT cm.*,u.name author_name,u.role author_role FROM comments cm JOIN users u ON u.id=cm.author_id WHERE cm.complaint_id=? ORDER BY cm.id ASC`).all(complaint.id);
  res.json({ complaint, comments });
});

app.post('/api/complaints/:id/comments', requireUser, (req, res) => {
  const body = cleanText(req.body.body, 1500);
  if (body.length < 1) return res.status(400).json({ error: 'Comment cannot be empty.' });
  const complaint = db.prepare('SELECT * FROM complaints WHERE complaint_code=?').get(req.params.id);
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });
  const isAdmin = req.session.user.role === 'admin';
  const isOwner = complaint.user_id === req.session.user.id;
  const isAssignedVendor = complaint.assigned_vendor_id === req.session.user.id;
  if (!isAdmin && !isOwner && !isAssignedVendor) return res.status(403).json({ error: 'You cannot comment on this complaint.' });
  db.prepare('INSERT INTO comments(complaint_id,author_id,body) VALUES(?,?,?)').run(complaint.id, req.session.user.id, body);
  db.prepare('UPDATE complaints SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(complaint.id);
  res.status(201).json({ message: 'Comment added.' });
});

// Admin is the mediator: assigns Product Issue complaints to one specific vendor in that
// category, and/or updates status and the official remark. Direct complaints only ever
// move between Open and Solved, same as before.
app.patch('/api/admin/complaints/:id', requireAdmin, async (req, res) => {
  const existing = db.prepare(`SELECT c.*, u.email user_email FROM complaints c JOIN users u ON u.id=c.user_id WHERE c.complaint_code=?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Complaint not found.' });

  let status = existing.status;
  let assignedVendorId = existing.assigned_vendor_id;
  const adminRemark = req.body.adminRemark !== undefined ? cleanText(req.body.adminRemark, 2000) : existing.admin_remark;

  if (req.body.assignedVendorId) {
    if (existing.complaint_type !== 'Product Issue') return res.status(400).json({ error: 'Only Product Issue complaints can be assigned to a vendor.' });
    const vendor = db.prepare(`SELECT * FROM users WHERE id=? AND user_type='vendor' AND category=?`).get(req.body.assignedVendorId, existing.category);
    if (!vendor) return res.status(400).json({ error: 'Select a valid vendor registered under this complaint\'s category.' });
    assignedVendorId = vendor.id;
    status = 'Assigned';
  } else if (req.body.status) {
    const nextStatus = cleanText(req.body.status, 30);
    const allowed = existing.complaint_type === 'Direct' ? ['Open', 'Solved'] : COMPLAINT_STATUSES;
    if (!allowed.includes(nextStatus)) return res.status(400).json({ error: 'Invalid status for this complaint.' });
    status = nextStatus;
  }

  db.prepare(`UPDATE complaints SET status=?, admin_remark=?, assigned_vendor_id=?, updated_at=CURRENT_TIMESTAMP WHERE complaint_code=?`)
    .run(status, adminRemark || null, assignedVendorId, req.params.id);
  if (status !== existing.status) {
    try { await sendStatusEmail(existing.user_email, req.params.id, status, adminRemark); }
    catch (error) { console.error('Status email failed:', error); }
  }
  res.json({ message: 'Complaint updated.' });
});

// Vendors only ever see and act on complaints admin has assigned to them.
app.patch('/api/vendor/complaints/:id/resolve', requireUser, requireVendor, async (req, res) => {
  const vendorRemark = cleanText(req.body.vendorRemark, 2000);
  if (vendorRemark.length < 4) return res.status(400).json({ error: 'Describe how the issue was resolved (e.g. replacement boxes dispatched, new delivery details).' });
  const existing = db.prepare(`SELECT c.*, u.email user_email FROM complaints c JOIN users u ON u.id=c.user_id WHERE c.complaint_code=?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Complaint not found.' });
  if (existing.assigned_vendor_id !== req.session.user.id) return res.status(403).json({ error: 'This complaint is not assigned to you.' });
  if (!['Assigned', 'Disputed'].includes(existing.status)) return res.status(400).json({ error: 'This complaint is not currently awaiting vendor action.' });
  db.prepare(`UPDATE complaints SET status='Vendor Resolved', vendor_remark=?, vendor_resolved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE complaint_code=?`)
    .run(vendorRemark, req.params.id);
  try { await sendStatusEmail(existing.user_email, req.params.id, 'Vendor Resolved', vendorRemark); }
  catch (error) { console.error('Status email failed:', error); }
  res.json({ message: 'Marked as resolved. The consumer will be asked to confirm before this closes.' });
});

// Consumer is the final check: only they can close the loop, or send it back to admin.
app.post('/api/complaints/:id/confirm', requireUser, (req, res) => {
  const existing = db.prepare('SELECT * FROM complaints WHERE complaint_code=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Complaint not found.' });
  if (existing.user_id !== req.session.user.id) return res.status(403).json({ error: 'You cannot confirm this complaint.' });
  if (existing.status !== 'Vendor Resolved') return res.status(400).json({ error: 'This complaint is not awaiting your confirmation.' });
  db.prepare(`UPDATE complaints SET status='Solved', consumer_confirmed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE complaint_code=?`).run(req.params.id);
  res.json({ message: 'Thanks for confirming — the complaint is now marked Solved.' });
});

app.post('/api/complaints/:id/dispute', requireUser, (req, res) => {
  const existing = db.prepare('SELECT * FROM complaints WHERE complaint_code=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Complaint not found.' });
  if (existing.user_id !== req.session.user.id) return res.status(403).json({ error: 'You cannot update this complaint.' });
  if (existing.status !== 'Vendor Resolved') return res.status(400).json({ error: 'This complaint is not awaiting your confirmation.' });
  db.prepare(`UPDATE complaints SET status='Disputed', updated_at=CURRENT_TIMESTAMP WHERE complaint_code=?`).run(req.params.id);
  res.json({ message: 'Marked as disputed. Admin will review it again before it goes back to the vendor.' });
});

// Admin's vendor-assignment dropdown: vendors registered under one specific manufacture category.
app.get('/api/admin/vendors', requireAdmin, (req, res) => {
  const category = cleanText(req.query.category, 60);
  if (!MANUFACTURE_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Provide a valid manufacture category.' });
  const vendors = db.prepare(`SELECT id, name, email, vendor_id FROM users WHERE role='user' AND user_type='vendor' AND category=? ORDER BY name`).all(category);
  res.json({ vendors });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) count FROM complaints').get().count;
  const solved = db.prepare(`SELECT COUNT(*) count FROM complaints WHERE status='Solved'`).get().count;
  const unsolved = total - solved;
  const users = db.prepare(`SELECT COUNT(*) count FROM users WHERE role='user'`).get().count;
  const vendors = db.prepare(`SELECT COUNT(*) count FROM users WHERE role='user' AND user_type='vendor'`).get().count;
  const consumers = db.prepare(`SELECT COUNT(*) count FROM users WHERE role='user' AND user_type='consumer'`).get().count;
  const awaitingAssignment = db.prepare(`SELECT COUNT(*) count FROM complaints WHERE complaint_type='Product Issue' AND status='Open'`).get().count;
  const withVendor = db.prepare(`SELECT COUNT(*) count FROM complaints WHERE status='Assigned'`).get().count;
  const disputed = db.prepare(`SELECT COUNT(*) count FROM complaints WHERE status='Disputed'`).get().count;
  res.json({ total, solved, unsolved, users, vendors, consumers, awaitingAssignment, withVendor, disputed });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
app.get('*', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File must be 5 MB or smaller.' : err.message });
  res.status(400).json({ error: err.message || 'Request could not be processed.' });
});

app.listen(PORT, () => console.log(`CEL clone running at http://localhost:${PORT}`));
