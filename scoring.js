// Scoring engine — calculates how well an applicant matches a job's requirements.
// Returns a score 0-100 and a breakdown of each component.

const EDUCATION_LEVELS = ['certificate', 'diploma', 'degree', 'masters', 'phd'];

function scoreApplication(job, application) {
  const breakdown = {};
  let totalPoints = 0;
  let maxPoints = 0;

  // ── 1. EDUCATION LEVEL (30 points) ───────────────────────────────
  if (job.min_education) {
    maxPoints += 30;
    const jobLevel = EDUCATION_LEVELS.indexOf(job.min_education.toLowerCase());
    const appLevel = EDUCATION_LEVELS.indexOf((application.education_level || '').toLowerCase());

    if (appLevel >= jobLevel && appLevel !== -1) {
      // Meets or exceeds minimum — full points, +5 bonus per extra level (capped)
      const bonus = Math.min((appLevel - jobLevel) * 5, 10);
      breakdown.education = Math.min(30 + bonus, 30);
      totalPoints += breakdown.education;
    } else if (appLevel === jobLevel - 1) {
      // One level below — partial credit
      breakdown.education = 10;
      totalPoints += 10;
    } else {
      breakdown.education = 0;
    }
  }

  // ── 2. FIELD OF STUDY (25 points) ────────────────────────────────
  if (job.field_of_study) {
    maxPoints += 25;
    const jobField = job.field_of_study.toLowerCase();
    const appField = (application.field_of_study || '').toLowerCase();

    if (appField.includes(jobField) || jobField.includes(appField)) {
      breakdown.field = 25;
      totalPoints += 25;
    } else {
      // Check for partial keyword match
      const jobWords = jobField.split(/[\s,]+/).filter(w => w.length > 3);
      const appWords = appField.split(/[\s,]+/).filter(w => w.length > 3);
      const matches = jobWords.filter(w => appWords.some(a => a.includes(w) || w.includes(a)));
      if (matches.length > 0) {
        const partial = Math.round((matches.length / jobWords.length) * 15);
        breakdown.field = partial;
        totalPoints += partial;
      } else {
        breakdown.field = 0;
      }
    }
  }

  // ── 3. EXPERIENCE (25 points) ─────────────────────────────────────
  if (job.min_experience > 0) {
    maxPoints += 25;
    const appYears = application.years_of_experience || 0;
    const reqYears = job.min_experience;

    if (appYears >= reqYears) {
      // Meets requirement — scale up to 25, bonus for extra years (capped)
      const bonus = Math.min((appYears - reqYears) * 2, 5);
      breakdown.experience = Math.min(25 + bonus, 25);
      totalPoints += breakdown.experience;
    } else if (appYears > 0) {
      // Partial experience
      breakdown.experience = Math.round((appYears / reqYears) * 20);
      totalPoints += breakdown.experience;
    } else {
      breakdown.experience = 0;
    }
  }

  // ── 4. SKILLS (20 points) ─────────────────────────────────────────
  if (job.required_skills) {
    const requiredSkills = job.required_skills.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (requiredSkills.length > 0) {
      maxPoints += 20;
      const appSkills = (application.skills || '').toLowerCase();
      const matched = requiredSkills.filter(skill =>
        appSkills.includes(skill) || skill.split(' ').some(w => w.length > 3 && appSkills.includes(w))
      );
      breakdown.skills = Math.round((matched.length / requiredSkills.length) * 20);
      totalPoints += breakdown.skills;
      breakdown.matched_skills = matched;
      breakdown.required_skills = requiredSkills;
    }
  }

  // ── FINAL SCORE ───────────────────────────────────────────────────
  const score = maxPoints > 0 ? Math.min(Math.round((totalPoints / maxPoints) * 100), 100) : 50;

  return {
    score,
    breakdown: {
      ...breakdown,
      total_points: totalPoints,
      max_points: maxPoints,
    },
  };
}

module.exports = { scoreApplication };
