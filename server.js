require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { pool, initDB } = require('./db');
const { generateToken, requireAuth, seedAdmin } = require('./auth');
const { uploadCV, cloudinary } = require('./upload');
const { scoreApplication } = require('./scoring');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const applyLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });

// ─── AUTH ────────────────────────────────────────────────────────────────────

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  try {
    const result = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
    const admin = result.rows[0];
    if (!admin) return res.status(401).json({ error: 'Incorrect username or password.' });
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect username or password.' });
    const token = generateToken(admin);
    res.json({ token, role: admin.role, office: admin.office_name, fullName: admin.full_name, username: admin.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.get('/api/auth/me', requireAuth(), (req, res) => res.json(req.admin));

// ─── ADMIN MANAGEMENT (super_admin only) ─────────────────────────────────────

app.get('/api/admins', requireAuth(['super_admin']), async (req, res) => {
  const result = await pool.query('SELECT id, username, office_name, role, full_name, created_at FROM admins ORDER BY created_at');
  res.json(result.rows);
});

app.post('/api/admins', requireAuth(['super_admin']), async (req, res) => {
  const { username, password, office_name, role, full_name } = req.body;
  if (!username || !password || !office_name) return res.status(400).json({ error: 'Username, password and office required.' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO admins (username, password_hash, office_name, role, full_name) VALUES ($1,$2,$3,$4,$5) RETURNING id, username, office_name, role, full_name',
      [username, hash, office_name, role || 'hr', full_name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists.' });
    res.status(500).json({ error: 'Server error.' });
  }
});

app.delete('/api/admins/:id', requireAuth(['super_admin']), async (req, res) => {
  await pool.query('DELETE FROM admins WHERE id = $1 AND role != $2', [req.params.id, 'super_admin']);
  res.json({ ok: true });
});

// ─── JOBS ─────────────────────────────────────────────────────────────────────

// Public: list open jobs
app.get('/api/jobs/public', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, title, title_am, office_name, description, description_am,
             min_education, field_of_study, min_experience, required_skills,
             positions, deadline, created_at
      FROM jobs WHERE status = 'open' ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Public: single job detail
app.get('/api/jobs/public/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, title_am, office_name, description, description_am,
              min_education, field_of_study, min_experience, required_skills,
              positions, deadline, created_at
       FROM jobs WHERE id = $1 AND status = 'open'`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Job not found or closed.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// HR: list jobs for this office
app.get('/api/jobs', requireAuth(), async (req, res) => {
  try {
    const isSuperAdmin = req.admin.role === 'super_admin';
    const query = isSuperAdmin
      ? `SELECT j.*, a.full_name as posted_by,
               (SELECT COUNT(*) FROM applications WHERE job_id = j.id) as applicant_count
         FROM jobs j LEFT JOIN admins a ON j.admin_id = a.id ORDER BY j.created_at DESC`
      : `SELECT j.*, a.full_name as posted_by,
               (SELECT COUNT(*) FROM applications WHERE job_id = j.id) as applicant_count
         FROM jobs j LEFT JOIN admins a ON j.admin_id = a.id
         WHERE j.office_name = $1 ORDER BY j.created_at DESC`;
    const params = isSuperAdmin ? [] : [req.admin.office];
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// HR: create job
app.post('/api/jobs', requireAuth(), async (req, res) => {
  try {
    const f = req.body;
    const result = await pool.query(`
      INSERT INTO jobs (admin_id, title, title_am, office_name, description, description_am,
        min_education, field_of_study, min_experience, required_skills, positions, deadline, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'open') RETURNING *`,
      [req.admin.id, f.title, f.title_am, req.admin.office, f.description, f.description_am,
       f.min_education, f.field_of_study, f.min_experience || 0, f.required_skills,
       f.positions || 1, f.deadline || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create job.' });
  }
});

// HR: update job
app.put('/api/jobs/:id', requireAuth(), async (req, res) => {
  try {
    const f = req.body;
    const result = await pool.query(`
      UPDATE jobs SET title=$1, title_am=$2, description=$3, description_am=$4,
        min_education=$5, field_of_study=$6, min_experience=$7, required_skills=$8,
        positions=$9, deadline=$10, status=$11
      WHERE id=$12 AND (office_name=$13 OR $14=true) RETURNING *`,
      [f.title, f.title_am, f.description, f.description_am,
       f.min_education, f.field_of_study, f.min_experience || 0, f.required_skills,
       f.positions || 1, f.deadline || null, f.status || 'open',
       req.params.id, req.admin.office, req.admin.role === 'super_admin']
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Job not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not update job.' });
  }
});

// HR: delete job
app.delete('/api/jobs/:id', requireAuth(), async (req, res) => {
  await pool.query('DELETE FROM jobs WHERE id=$1 AND (office_name=$2 OR $3=true)',
    [req.params.id, req.admin.office, req.admin.role === 'super_admin']);
  res.json({ ok: true });
});

// ─── APPLICATIONS ─────────────────────────────────────────────────────────────

function generateRef() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `APP-${ts}-${rand}`;
}

// Public: submit application
app.post('/api/apply/:jobId', applyLimiter, uploadCV.single('cv'), async (req, res) => {
  try {
    const job = await pool.query('SELECT * FROM jobs WHERE id=$1 AND status=$2', [req.params.jobId, 'open']);
    if (!job.rows[0]) return res.status(404).json({ error: 'Job not found or closed.' });

    const f = req.body;
    const cvUrl = req.file?.secure_url || req.file?.path || req.file?.url || null;
    const cvPublicId = req.file?.public_id || req.file?.filename || null;
    const ref = generateRef();

    const applicationData = {
      education_level: f.education_level,
      field_of_study: f.field_of_study,
      years_of_experience: parseInt(f.years_of_experience) || 0,
      skills: f.skills,
    };

    const { score, breakdown } = scoreApplication(job.rows[0], applicationData);

    const result = await pool.query(`
      INSERT INTO applications (
        job_id, reference_number,
        full_name, full_name_am, email, phone, gender, date_of_birth, region, woreda,
        education_level, field_of_study, institution, graduation_year, gpa, exit_exam_score,
        years_of_experience, current_employer, current_position, experience_description,
        skills, certifications, cv_url, cv_public_id,
        match_score, score_breakdown
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
      RETURNING id, reference_number, match_score`,
      [
        req.params.jobId, ref,
        f.full_name, f.full_name_am || null, f.email, f.phone,
        f.gender, f.date_of_birth || null, f.region, f.woreda,
        f.education_level, f.field_of_study, f.institution,
        f.graduation_year ? parseInt(f.graduation_year) : null,
        f.gpa ? parseFloat(f.gpa) : null,
        f.exit_exam_score ? parseFloat(f.exit_exam_score) : null,
        parseInt(f.years_of_experience) || 0,
        f.current_employer, f.current_position, f.experience_description,
        f.skills, f.certifications,
        cvUrl, cvPublicId,
        score, JSON.stringify(breakdown)
      ]
    );

    res.status(201).json({
      message: 'Application submitted successfully.',
      reference_number: ref,
      match_score: score,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit application.' });
  }
});

// HR: list applicants for a job with filters
app.get('/api/jobs/:jobId/applications', requireAuth(), async (req, res) => {
  try {
    const { status, min_score, education_level, min_experience, sort = 'score' } = req.query;
    const conditions = ['a.job_id = $1'];
    const params = [req.params.jobId];

    if (status) { params.push(status); conditions.push(`a.status = $${params.length}`); }
    if (min_score) { params.push(parseInt(min_score)); conditions.push(`a.match_score >= $${params.length}`); }
    if (education_level) { params.push(education_level); conditions.push(`a.education_level = $${params.length}`); }
    if (min_experience) { params.push(parseInt(min_experience)); conditions.push(`a.years_of_experience >= $${params.length}`); }

    const orderBy = sort === 'score' ? 'a.match_score DESC' :
                    sort === 'date' ? 'a.submitted_at DESC' :
                    sort === 'name' ? 'a.full_name ASC' : 'a.match_score DESC';

    const result = await pool.query(`
      SELECT a.id, a.reference_number, a.full_name, a.email, a.phone, a.gender,
             a.education_level, a.field_of_study, a.institution,
             a.years_of_experience, a.skills, a.match_score, a.status,
             a.submitted_at, a.cv_url
      FROM applications a
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
    `, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// HR: get single application detail
app.get('/api/applications/:id', requireAuth(), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM applications WHERE id=$1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Application not found.' });
    const app = result.rows[0];
    if (app.score_breakdown) {
      try { app.score_breakdown = JSON.parse(app.score_breakdown); } catch {}
    }
    res.json(app);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// HR: update application status + notes
app.patch('/api/applications/:id', requireAuth(), async (req, res) => {
  try {
    const { status, hr_notes } = req.body;
    const result = await pool.query(`
      UPDATE applications SET status=$1, hr_notes=$2, reviewed_by=$3, reviewed_at=NOW()
      WHERE id=$4 RETURNING id, status, hr_notes`,
      [status, hr_notes, req.admin.id, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Application not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not update application.' });
  }
});

// HR: export applicants for a job
app.get('/api/jobs/:jobId/export', requireAuth(), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT reference_number, full_name, email, phone, gender, date_of_birth,
             region, woreda, education_level, field_of_study, institution,
             graduation_year, gpa, exit_exam_score, years_of_experience, current_employer,
             current_position, skills, certifications, match_score, status,
             hr_notes, submitted_at
      FROM applications WHERE job_id=$1 ORDER BY match_score DESC`,
      [req.params.jobId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Export failed.' });
  }
});

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────

app.get('/api/stats', requireAuth(), async (req, res) => {
  try {
    const isSuperAdmin = req.admin.role === 'super_admin';
    const officeFilter = isSuperAdmin ? '' : `WHERE office_name = '${req.admin.office}'`;
    const appFilter = isSuperAdmin ? '' : `WHERE j.office_name = '${req.admin.office}'`;

    const [jobs, openJobs, totalApps, pendingApps, shortlisted] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM jobs ${officeFilter}`),
      pool.query(`SELECT COUNT(*) FROM jobs ${officeFilter ? officeFilter + ' AND' : 'WHERE'} status='open'`),
      pool.query(`SELECT COUNT(*) FROM applications a LEFT JOIN jobs j ON a.job_id=j.id ${appFilter}`),
      pool.query(`SELECT COUNT(*) FROM applications a LEFT JOIN jobs j ON a.job_id=j.id ${appFilter ? appFilter + ' AND' : 'WHERE'} a.status='pending'`),
      pool.query(`SELECT COUNT(*) FROM applications a LEFT JOIN jobs j ON a.job_id=j.id ${appFilter ? appFilter + ' AND' : 'WHERE'} a.status='shortlisted'`),
    ]);

    res.json({
      totalJobs: parseInt(jobs.rows[0].count),
      openJobs: parseInt(openJobs.rows[0].count),
      totalApplications: parseInt(totalApps.rows[0].count),
      pendingReview: parseInt(pendingApps.rows[0].count),
      shortlisted: parseInt(shortlisted.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── START ────────────────────────────────────────────────────────────────────

async function start() {
  await initDB();
  await seedAdmin();
  app.listen(PORT, () => console.log(`Gov Screening System running on port ${PORT}`));
}

start().catch(console.error);
