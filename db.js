require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- HR admin accounts (one per department/office)
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        office_name VARCHAR(200) NOT NULL,       -- department/office name
        role VARCHAR(20) DEFAULT 'hr',           -- 'super_admin' or 'hr'
        full_name VARCHAR(200),
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Job postings
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES admins(id),
        title VARCHAR(200) NOT NULL,             -- job title
        title_am VARCHAR(200),                   -- Amharic title
        office_name VARCHAR(200) NOT NULL,       -- which office posted this
        org_photo_url TEXT,                      -- organization photo/logo
        description TEXT,
        description_am TEXT,
        -- Requirements (used for auto-scoring)
        min_education VARCHAR(50),               -- 'certificate','diploma','degree','masters','phd'
        field_of_study VARCHAR(200),             -- required field e.g. "Computer Science"
        min_experience INTEGER DEFAULT 0,        -- minimum years of experience
        required_skills TEXT,                    -- comma-separated list of required skills
        -- Meta
        positions INTEGER DEFAULT 1,            -- number of open positions
        deadline DATE,
        status VARCHAR(20) DEFAULT 'open',      -- 'open' or 'closed'
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Applicant submissions
      CREATE TABLE IF NOT EXISTS applications (
        id SERIAL PRIMARY KEY,
        job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        reference_number VARCHAR(20) UNIQUE NOT NULL,

        -- Personal info
        full_name VARCHAR(200) NOT NULL,
        full_name_am VARCHAR(200),
        email VARCHAR(150),
        phone VARCHAR(30),
        gender VARCHAR(10),
        date_of_birth DATE,
        region VARCHAR(100),
        woreda VARCHAR(100),

        -- Education
        education_level VARCHAR(50),             -- certificate/diploma/degree/masters/phd
        field_of_study VARCHAR(200),
        institution VARCHAR(200),
        graduation_year INTEGER,
        gpa NUMERIC(3,2),
        exit_exam_score NUMERIC(5,2),

        -- Experience
        years_of_experience INTEGER DEFAULT 0,
        current_employer VARCHAR(200),
        current_position VARCHAR(200),
        experience_description TEXT,

        -- Skills & certifications
        skills TEXT,                             -- comma-separated
        certifications TEXT,

        -- CV
        cv_url TEXT,
        cv_public_id TEXT,

        -- Scoring (auto-calculated on submit)
        match_score INTEGER DEFAULT 0,          -- 0-100 percentage match
        score_breakdown TEXT,                   -- JSON string of score details

        -- HR decision
        status VARCHAR(20) DEFAULT 'pending',   -- 'pending','shortlisted','rejected','hired'
        hr_notes TEXT,
        reviewed_by INTEGER REFERENCES admins(id),
        reviewed_at TIMESTAMP,

        submitted_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id);
      CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
      CREATE INDEX IF NOT EXISTS idx_applications_score ON applications(match_score DESC);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

      -- Migrations for existing tables
      ALTER TABLE applications ALTER COLUMN cv_url TYPE TEXT;
      ALTER TABLE applications ADD COLUMN IF NOT EXISTS exit_exam_score NUMERIC(5,2);
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS org_photo_url TEXT;
    `);
    console.log('Database initialized.');
  } catch (err) {
    console.error('DB init error:', err.message);
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
