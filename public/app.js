// ── STATE ─────────────────────────────────────────────────────────
let token = localStorage.getItem('screening_token');
let currentUser = null;
let currentJobId = null;

// ── API ───────────────────────────────────────────────────────────
async function api(method, path, data, isFormData = false) {
  const opts = {
    method,
    headers: { Authorization: token ? `Bearer ${token}` : '' },
  };
  if (data) {
    if (isFormData) { opts.body = data; }
    else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(data); }
  }
  const res = await fetch(path, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

// ── TOAST ─────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 3500);
}

// ── SCREENS ───────────────────────────────────────────────────────
function showPublic() {
  document.getElementById('public-screen').style.display = 'block';
  document.getElementById('apply-screen').style.display = 'none';
  document.getElementById('success-screen').style.display = 'none';
  document.getElementById('hr-login-screen').style.display = 'none';
  document.getElementById('hr-screen').style.display = 'none';
  loadPublicJobs();
}

function showHRLogin() {
  document.getElementById('public-screen').style.display = 'none';
  document.getElementById('hr-login-screen').style.display = 'flex';
}

function showHRDashboard() {
  document.getElementById('hr-login-screen').style.display = 'none';
  document.getElementById('public-screen').style.display = 'none';
  document.getElementById('hr-screen').style.display = 'flex';
  document.getElementById('hr-office-name').textContent = currentUser.office;
  document.getElementById('hr-user-info').textContent = `${currentUser.fullName || currentUser.username}`;

  const isSuperAdmin = currentUser.role === 'super_admin';
  document.getElementById('nav-hr-admins').style.display = isSuperAdmin ? 'flex' : 'none';

  loadHRStats();
  hrShowPage('dashboard');
}

// ── HR NAV ────────────────────────────────────────────────────────
function hrShowPage(pageId) {
  document.querySelectorAll('#hr-screen .page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.style.display = 'block';
  const link = document.querySelector(`.nav-link[data-page="${pageId}"]`);
  if (link) link.classList.add('active');
}

// ── PUBLIC: LOAD JOBS ─────────────────────────────────────────────
async function loadPublicJobs() {
  try {
    const jobs = await api('GET', '/api/jobs/public');
    const container = document.getElementById('jobs-list');
    if (jobs.length === 0) {
      container.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--text-dim);padding:60px;">
        <div style="font-size:48px;margin-bottom:12px;">📋</div>
        <div>No open positions at this time</div>
      </div>`;
      return;
    }
    container.innerHTML = jobs.map(j => `
      <div class="job-card" onclick="showApplyForm(${j.id})">
        <div class="job-card-office">${j.office_name}</div>
        <div class="job-card-title">${j.title}</div>
        <div class="job-card-meta">
          ${j.min_education ? `<span class="job-tag">${j.min_education}</span>` : ''}
          ${j.field_of_study ? `<span class="job-tag">${j.field_of_study}</span>` : ''}
          ${j.min_experience > 0 ? `<span class="job-tag exp">${j.min_experience}+ yrs exp</span>` : ''}
          ${j.positions > 1 ? `<span class="job-tag">${j.positions} positions</span>` : ''}
        </div>
        ${j.deadline ? `<div class="job-deadline">📅 Deadline: ${new Date(j.deadline).toLocaleDateString()}</div>` : ''}
        <button class="apply-btn" style="margin-top:14px;">Apply Now</button>
      </div>
    `).join('');
  } catch (err) {
    showToast('Could not load jobs', 'error');
  }
}

// ── TEXT HELPERS ──────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
function formatDescription(str) {
  return escapeHtml(str).replace(/\n/g, '<br>');
}

// ── PUBLIC: APPLY FORM ────────────────────────────────────────────
function revealApplyForm() {
  document.getElementById('show-apply-form-btn').style.display = 'none';
  const card = document.getElementById('apply-form-card');
  card.style.display = '';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function showApplyForm(jobId) {
  try {
    const job = await api('GET', `/api/jobs/public/${jobId}`);
    document.getElementById('apply-job-id').value = jobId;
    document.getElementById('apply-job-title').textContent = job.title;
    document.getElementById('apply-job-info').innerHTML = `
      <h3>${job.title}</h3>
      <p>${job.office_name}</p>
      ${job.description ? `<p style="margin-top:8px;">${formatDescription(job.description)}</p>` : ''}
      <div class="job-facts">
        ${job.min_education ? `<p><strong>Min Education:</strong> ${job.min_education}</p>` : ''}
        ${job.field_of_study ? `<p><strong>Field:</strong> ${job.field_of_study}</p>` : ''}
        ${job.min_experience > 0 ? `<p><strong>Min Experience:</strong> ${job.min_experience} years</p>` : ''}
        ${job.required_skills ? `<p><strong>Required Skills:</strong> ${job.required_skills}</p>` : ''}
      </div>
    `;
    document.getElementById('apply-form-card').style.display = 'none';
    document.getElementById('show-apply-form-btn').style.display = '';
    document.getElementById('apply-form').reset();
    document.getElementById('apply-error').textContent = '';

    const expGroup = document.getElementById('fg-years_of_experience');
    const expInput = document.getElementById('f-years_of_experience');
    if (job.min_experience === 0 || !job.min_experience) {
      expGroup.style.display = 'none';
      expInput.required = false;
      expInput.value = '0';
    } else {
      expGroup.style.display = '';
      expInput.required = true;
    }

    document.getElementById('public-screen').style.display = 'none';
    document.getElementById('apply-screen').style.display = 'block';
    window.scrollTo(0, 0);
  } catch (err) {
    showToast('Could not load job details', 'error');
  }
}

async function submitApplication(e) {
  e.preventDefault();
  const errEl = document.getElementById('apply-error');
  errEl.textContent = '';
  const jobId = document.getElementById('apply-job-id').value;
  const formData = new FormData(document.getElementById('apply-form'));

  try {
    const result = await api('POST', `/api/apply/${jobId}`, formData, true);
    document.getElementById('apply-screen').style.display = 'none';
    document.getElementById('success-screen').style.display = 'flex';
    document.getElementById('success-ref').textContent = result.reference_number;
    window.scrollTo(0, 0);
  } catch (err) {
    errEl.textContent = err.message;
  }
}

// ── HR: LOGIN ─────────────────────────────────────────────────────
async function hrLogin() {
  const errEl = document.getElementById('hr-login-error');
  errEl.textContent = '';
  try {
    const data = await api('POST', '/api/auth/login', {
      username: document.getElementById('hr-username').value.trim(),
      password: document.getElementById('hr-password').value,
    });
    token = data.token;
    localStorage.setItem('screening_token', token);
    currentUser = data;
    showHRDashboard();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

function hrLogout() {
  token = null;
  localStorage.removeItem('screening_token');
  currentUser = null;
  showPublic();
}

// ── HR: STATS ─────────────────────────────────────────────────────
async function loadHRStats() {
  try {
    const s = await api('GET', '/api/stats');
    document.getElementById('hr-stats-grid').innerHTML = `
      <div class="stat-card"><div class="stat-value">${s.totalJobs}</div><div class="stat-label">Total Jobs</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--accent-2)">${s.openJobs}</div><div class="stat-label">Open Jobs</div></div>
      <div class="stat-card"><div class="stat-value">${s.totalApplications}</div><div class="stat-label">Total Applications</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--gold)">${s.pendingReview}</div><div class="stat-label">Pending Review</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--accent-2)">${s.shortlisted}</div><div class="stat-label">Shortlisted</div></div>
    `;
  } catch (err) {
    showToast('Could not load stats', 'error');
  }
}

// ── HR: JOBS ──────────────────────────────────────────────────────
async function loadHRJobs() {
  try {
    const jobs = await api('GET', '/api/jobs');
    const container = document.getElementById('hr-jobs-list');
    if (jobs.length === 0) {
      container.innerHTML = `<div class="card" style="text-align:center;color:var(--text-dim);padding:40px;">No jobs posted yet.</div>`;
      return;
    }
    container.innerHTML = jobs.map(j => `
      <div class="hr-job-card">
        <div class="hr-job-info">
          <div class="hr-job-title">${j.title}</div>
          <div class="hr-job-meta">
            ${j.office_name} · ${j.positions} position(s)
            ${j.deadline ? ` · Deadline: ${new Date(j.deadline).toLocaleDateString()}` : ''}
            ${j.min_education ? ` · Min: ${j.min_education}` : ''}
          </div>
        </div>
        <div class="hr-job-actions">
          <span class="badge ${j.status === 'open' ? 'badge-open' : 'badge-closed'}">${j.status}</span>
          <span class="badge badge-count">${j.applicant_count} applicants</span>
          <button class="btn-ghost" style="padding:7px 12px;font-size:12px;" onclick="viewApplicants(${j.id}, '${j.title.replace(/'/g,"\\'")}')">View Applicants</button>
          <button class="btn-ghost" style="padding:7px 12px;font-size:12px;" onclick="editJob(${j.id})">Edit</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    showToast('Could not load jobs', 'error');
  }
}

// ── HR: POST/EDIT JOB ─────────────────────────────────────────────
function resetJobForm() {
  document.getElementById('edit-job-id').value = '';
  document.getElementById('job-form').reset();
  document.getElementById('job-form-title').textContent = 'Post a Job';
  document.getElementById('job-save-btn').textContent = 'Post Job';
  document.getElementById('job-form-error').textContent = '';
}

async function editJob(id) {
  try {
    const jobs = await api('GET', '/api/jobs');
    const j = jobs.find(j => j.id === id);
    if (!j) return;
    document.getElementById('edit-job-id').value = id;
    document.getElementById('jf-title').value = j.title || '';
    document.getElementById('jf-description').value = j.description || '';
    document.getElementById('jf-min_education').value = j.min_education || '';
    document.getElementById('jf-field_of_study').value = j.field_of_study || '';
    document.getElementById('jf-min_experience').value = j.min_experience || 0;
    document.getElementById('jf-required_skills').value = j.required_skills || '';
    document.getElementById('jf-positions').value = j.positions || 1;
    document.getElementById('jf-deadline').value = j.deadline ? j.deadline.split('T')[0] : '';
    document.getElementById('jf-status').value = j.status || 'open';
    document.getElementById('job-form-title').textContent = 'Edit Job';
    document.getElementById('job-save-btn').textContent = 'Save Changes';
    document.getElementById('job-form-error').textContent = '';
    hrShowPage('post-job');
  } catch (err) {
    showToast('Could not load job for editing', 'error');
  }
}

async function submitJobForm(e) {
  e.preventDefault();
  const errEl = document.getElementById('job-form-error');
  errEl.textContent = '';
  const jobId = document.getElementById('edit-job-id').value;
  const data = {
    title: document.getElementById('jf-title').value.trim(),
    description: document.getElementById('jf-description').value.trim(),
    min_education: document.getElementById('jf-min_education').value,
    field_of_study: document.getElementById('jf-field_of_study').value.trim(),
    min_experience: parseInt(document.getElementById('jf-min_experience').value) || 0,
    required_skills: document.getElementById('jf-required_skills').value.trim(),
    positions: parseInt(document.getElementById('jf-positions').value) || 1,
    deadline: document.getElementById('jf-deadline').value || null,
    status: document.getElementById('jf-status').value,
  };
  try {
    if (jobId) { await api('PUT', `/api/jobs/${jobId}`, data); showToast('Job updated!'); }
    else { await api('POST', '/api/jobs', data); showToast('Job posted!'); }
    hrShowPage('jobs');
    loadHRJobs();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

// ── HR: APPLICANTS ────────────────────────────────────────────────
async function viewApplicants(jobId, jobTitle) {
  currentJobId = jobId;
  document.getElementById('applicants-job-title').textContent = jobTitle;
  hrShowPage('applicants');
  loadApplicants();
}

async function loadApplicants() {
  if (!currentJobId) return;
  const params = new URLSearchParams();
  const status = document.getElementById('af-status').value;
  const edu = document.getElementById('af-education').value;
  const minScore = document.getElementById('af-min_score').value;
  const minExp = document.getElementById('af-min_exp').value;
  const sort = document.getElementById('af-sort').value;
  if (status) params.set('status', status);
  if (edu) params.set('education_level', edu);
  if (minScore) params.set('min_score', minScore);
  if (minExp) params.set('min_experience', minExp);
  if (sort) params.set('sort', sort);

  try {
    const apps = await api('GET', `/api/jobs/${currentJobId}/applications?${params}`);
    const container = document.getElementById('applicants-list');
    if (apps.length === 0) {
      container.innerHTML = `<div class="card" style="text-align:center;color:var(--text-dim);padding:40px;">No applicants match the current filters.</div>`;
      return;
    }
    container.innerHTML = apps.map(a => {
      const scoreClass = a.match_score >= 70 ? 'score-high' : a.match_score >= 40 ? 'score-mid' : 'score-low';
      return `
        <div class="applicant-row" onclick="viewApplicant(${a.id})">
          <div class="score-circle ${scoreClass}">${a.match_score}%</div>
          <div class="applicant-info">
            <div class="applicant-name">${a.full_name}</div>
            <div class="applicant-meta">
              ${a.education_level || ''} ${a.field_of_study ? '· ' + a.field_of_study : ''}
              ${a.years_of_experience !== null ? '· ' + a.years_of_experience + ' yrs exp' : ''}
              ${a.phone ? '· ' + a.phone : ''}
            </div>
            ${a.skills ? `<div class="applicant-meta" style="margin-top:2px;">Skills: ${a.skills}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
            <span class="status-badge status-${a.status}">${a.status}</span>
            <span style="font-size:11px;color:var(--text-dim);">${new Date(a.submitted_at).toLocaleDateString()}</span>
            ${a.cv_url ? `<a href="${a.cv_url}" target="_blank" onclick="event.stopPropagation()" style="font-size:12px;color:var(--accent);">View CV</a>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    showToast('Could not load applicants', 'error');
  }
}

// ── HR: APPLICANT DETAIL ──────────────────────────────────────────
async function viewApplicant(id) {
  try {
    const a = await api('GET', `/api/applications/${id}`);
    hrShowPage('applicant-detail');

    document.getElementById('back-to-applicants').onclick = () => {
      hrShowPage('applicants');
    };

    const breakdown = a.score_breakdown || {};
    const scoreClass = a.match_score >= 70 ? 'var(--accent-2)' : a.match_score >= 40 ? 'var(--gold)' : 'var(--danger)';
    const f = v => v || '<span style="color:var(--text-dim)">—</span>';

    document.getElementById('applicant-detail-content').innerHTML = `
      <div class="detail-card">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
          <div>
            <h2 style="font-size:20px;font-weight:700;">${a.full_name}</h2>
            <div style="margin-top:6px;"><span class="status-badge status-${a.status}">${a.status}</span></div>
          </div>
          <div style="margin-left:auto;text-align:center;">
            <div style="font-size:42px;font-weight:700;color:${scoreClass}">${a.match_score}%</div>
            <div style="font-size:12px;color:var(--text-dim);">Match Score</div>
          </div>
        </div>

        <div class="score-bar-wrap">
          <div class="score-bar-label"><span>Match Score</span><span>${a.match_score}%</span></div>
          <div class="score-bar-track">
            <div class="score-bar-fill" style="width:${a.match_score}%;background:${scoreClass}"></div>
          </div>
          ${breakdown.education !== undefined ? `
          <div style="margin-top:10px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;">
            <div style="font-size:12px;color:var(--text-dim);">Education: <strong>${breakdown.education || 0}/30</strong></div>
            <div style="font-size:12px;color:var(--text-dim);">Field: <strong>${breakdown.field || 0}/25</strong></div>
            <div style="font-size:12px;color:var(--text-dim);">Experience: <strong>${breakdown.experience || 0}/25</strong></div>
            <div style="font-size:12px;color:var(--text-dim);">Skills: <strong>${breakdown.skills || 0}/20</strong></div>
          </div>` : ''}
          ${breakdown.matched_skills?.length > 0 ? `
          <div style="margin-top:8px;font-size:12px;color:var(--accent-2);">
            ✓ Matched skills: ${breakdown.matched_skills.join(', ')}
          </div>` : ''}
        </div>

        <div class="detail-section">
          <div class="detail-section-label">Personal Info</div>
          <div class="detail-grid">
            <div class="detail-field"><label>Phone</label><span>${f(a.phone)}</span></div>
            <div class="detail-field"><label>Email</label><span>${f(a.email)}</span></div>
            <div class="detail-field"><label>Gender</label><span>${f(a.gender)}</span></div>
            <div class="detail-field"><label>Date of Birth</label><span>${f(a.date_of_birth ? new Date(a.date_of_birth).toLocaleDateString() : null)}</span></div>
            <div class="detail-field"><label>Region</label><span>${f(a.region)}</span></div>
            <div class="detail-field"><label>Woreda</label><span>${f(a.woreda)}</span></div>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-label">Education</div>
          <div class="detail-grid">
            <div class="detail-field"><label>Level</label><span>${f(a.education_level)}</span></div>
            <div class="detail-field"><label>Field</label><span>${f(a.field_of_study)}</span></div>
            <div class="detail-field"><label>Institution</label><span>${f(a.institution)}</span></div>
            <div class="detail-field"><label>Graduation Year</label><span>${f(a.graduation_year)}</span></div>
            <div class="detail-field"><label>GPA</label><span>${f(a.gpa)}</span></div>
            <div class="detail-field"><label>National Exit Exam</label><span>${f(a.exit_exam_score)}</span></div>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-label">Experience</div>
          <div class="detail-grid">
            <div class="detail-field"><label>Years</label><span>${a.years_of_experience ?? '—'}</span></div>
            <div class="detail-field"><label>Current Employer</label><span>${f(a.current_employer)}</span></div>
            <div class="detail-field"><label>Current Position</label><span>${f(a.current_position)}</span></div>
          </div>
          ${a.experience_description ? `<div style="margin-top:10px;font-size:14px;line-height:1.6;">${a.experience_description}</div>` : ''}
        </div>

        <div class="detail-section">
          <div class="detail-section-label">Skills & Certifications</div>
          <div class="detail-grid">
            <div class="detail-field"><label>Skills</label><span>${f(a.skills)}</span></div>
            <div class="detail-field"><label>Certifications</label><span>${f(a.certifications)}</span></div>
          </div>
        </div>

        ${a.cv_url ? `
        <div class="detail-section">
          <div class="detail-section-label">CV / Resume</div>
          <a href="${a.cv_url}" target="_blank" class="btn-primary" style="display:inline-block;">View CV / Download</a>
        </div>` : ''}

        <div class="hr-decision">
          <h4>HR Decision</h4>
          <select class="status-select" id="decision-status">
            <option value="pending" ${a.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="shortlisted" ${a.status === 'shortlisted' ? 'selected' : ''}>Shortlisted</option>
            <option value="rejected" ${a.status === 'rejected' ? 'selected' : ''}>Rejected</option>
            <option value="hired" ${a.status === 'hired' ? 'selected' : ''}>Hired</option>
          </select>
          <textarea class="hr-notes-input" id="decision-notes" rows="3" placeholder="HR notes...">${a.hr_notes || ''}</textarea>
          <button class="btn-primary" onclick="saveDecision(${a.id})">Save Decision</button>
        </div>

        <div style="margin-top:12px;font-size:12px;color:var(--text-dim);">
          Reference: ${a.reference_number} · Submitted: ${new Date(a.submitted_at).toLocaleString()}
        </div>
      </div>
    `;
  } catch (err) {
    showToast('Could not load applicant', 'error');
  }
}

async function saveDecision(id) {
  try {
    await api('PATCH', `/api/applications/${id}`, {
      status: document.getElementById('decision-status').value,
      hr_notes: document.getElementById('decision-notes').value,
    });
    showToast('Decision saved!', 'success');
  } catch (err) {
    showToast('Could not save decision', 'error');
  }
}

// ── HR: EXPORT ────────────────────────────────────────────────────
async function exportApplicants() {
  if (!currentJobId) return;
  try {
    const rows = await api('GET', `/api/jobs/${currentJobId}/export`);
    const ws = XLSX.utils.json_to_sheet(rows.map(a => ({
      'Reference': a.reference_number,
      'Full Name': a.full_name,
      'Phone': a.phone || '',
      'Email': a.email || '',
      'Gender': a.gender || '',
      'Education Level': a.education_level || '',
      'Field of Study': a.field_of_study || '',
      'Institution': a.institution || '',
      'Graduation Year': a.graduation_year || '',
      'GPA': a.gpa || '',
      'Years of Experience': a.years_of_experience || 0,
      'Current Employer': a.current_employer || '',
      'Current Position': a.current_position || '',
      'Skills': a.skills || '',
      'Certifications': a.certifications || '',
      'Match Score (%)': a.match_score,
      'Status': a.status,
      'HR Notes': a.hr_notes || '',
      'Submitted': new Date(a.submitted_at).toLocaleDateString(),
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Applicants');
    XLSX.writeFile(wb, `applicants-job-${currentJobId}-${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Exported!', 'success');
  } catch (err) {
    showToast('Export failed', 'error');
  }
}

// ── HR: ADMINS ────────────────────────────────────────────────────
async function loadHRAdmins() {
  try {
    const admins = await api('GET', '/api/admins');
    document.getElementById('hr-admins-list').innerHTML = `
      <div class="card">
        ${admins.map(a => `
          <div class="admin-row">
            <div>
              <div style="font-weight:600;">${a.full_name || a.username}</div>
              <div style="font-size:12px;color:var(--text-dim);">@${a.username} · ${a.office_name}</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="badge badge-count">${a.role}</span>
              ${a.role !== 'super_admin' ? `<button class="btn-danger" onclick="deleteHRAdmin(${a.id})" style="padding:5px 10px;font-size:12px;">✕</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    showToast('Could not load admins', 'error');
  }
}

async function saveHRAdmin() {
  const errEl = document.getElementById('hr-admin-error');
  errEl.textContent = '';
  try {
    await api('POST', '/api/admins', {
      username: document.getElementById('new-admin-username').value.trim(),
      password: document.getElementById('new-admin-password').value,
      office_name: document.getElementById('new-admin-office').value.trim(),
      full_name: document.getElementById('new-admin-fullname').value.trim(),
      role: document.getElementById('new-admin-role').value,
    });
    document.getElementById('add-hr-admin-form').style.display = 'none';
    showToast('Admin added!', 'success');
    loadHRAdmins();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function deleteHRAdmin(id) {
  if (!confirm('Remove this admin?')) return;
  try {
    await api('DELETE', `/api/admins/${id}`);
    showToast('Admin removed.', 'success');
    loadHRAdmins();
  } catch (err) {
    showToast('Could not remove admin', 'error');
  }
}

// ── EVENT WIRING ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('hr-login-btn').addEventListener('click', showHRLogin);
  document.getElementById('hr-login-submit').addEventListener('click', hrLogin);
  document.getElementById('hr-password').addEventListener('keydown', e => { if (e.key === 'Enter') hrLogin(); });
  document.getElementById('hr-logout-btn').addEventListener('click', hrLogout);
  document.getElementById('apply-form').addEventListener('submit', submitApplication);
  document.getElementById('job-form').addEventListener('submit', submitJobForm);
  document.getElementById('export-applicants-btn').addEventListener('click', exportApplicants);

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      const page = link.dataset.page;
      hrShowPage(page);
      if (page === 'dashboard') loadHRStats();
      else if (page === 'jobs') loadHRJobs();
      else if (page === 'post-job') resetJobForm();
      else if (page === 'hr-admins') loadHRAdmins();
    });
  });

  document.getElementById('show-add-hr-admin').addEventListener('click', () => {
    const f = document.getElementById('add-hr-admin-form');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('save-hr-admin-btn').addEventListener('click', saveHRAdmin);

  // Check existing session
  if (token) {
    try {
      currentUser = await api('GET', '/api/auth/me');
      showHRDashboard();
      return;
    } catch {
      token = null;
      localStorage.removeItem('screening_token');
    }
  }

  showPublic();
});
