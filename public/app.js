const $ = (id) => document.getElementById(id);
const form = $('searchForm');
const searchBtn = $('searchBtn');
const jobList = $('jobList');
const template = $('jobTemplate');
const statusBox = $('status');
let currentJobs = [];
let activeView = 'discover';
let sortBest = true;
const savedKey = 'jobhunter-saved-v1';
const prefsKey = 'jobhunter-prefs-v1';
const readSaved = () => { try { return JSON.parse(localStorage.getItem(savedKey) || '[]'); } catch { return []; } };
const readPrefs = () => { try { return JSON.parse(localStorage.getItem(prefsKey) || '{}'); } catch { return {}; } };
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function getPrefs() {
  return { role: $('role').value.trim(), location: $('location').value.trim(), seniority: $('seniority').value,
    keywords: $('keywords').value.trim(), extraKeywords: $('extraKeywords').value.trim(),
    sources: [...document.querySelectorAll('input[name="source"]:checked')].map(x => x.value) };
}
function setPrefs(p) {
  if (p.role !== undefined) $('role').value = p.role;
  if (p.location !== undefined) $('location').value = p.location;
  if (p.seniority !== undefined) $('seniority').value = p.seniority;
  if (p.keywords !== undefined) $('keywords').value = p.keywords;
  if (p.extraKeywords !== undefined) $('extraKeywords').value = p.extraKeywords;
  if (p.sources) document.querySelectorAll('input[name="source"]').forEach(x => x.checked = p.sources.includes(x.value));
}
function showStatus(title, message, kind = '') {
  statusBox.className = `status-message ${kind}`;
  statusBox.innerHTML = `<span class="status-icon">${kind === 'error' ? '!' : '✳'}</span><div><b>${escapeHtml(title)}</b><p>${escapeHtml(message)}</p></div>`;
  statusBox.classList.remove('hidden');
}
function updateSavedCount() { $('savedCount').textContent = readSaved().length; }
function renderJobs(jobs, target = jobList) {
  target.innerHTML = '';
  const saved = readSaved();
  if (!jobs.length) return;
  for (const job of jobs) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector('h3').textContent = job.title || 'Untitled role';
    node.querySelector('.job-company').textContent = job.company || 'Company not specified';
    node.querySelector('.company-logo').textContent = (job.company || job.title || 'J').trim().charAt(0).toUpperCase();
    node.querySelector('.match-badge').textContent = `${job.matchScore ?? '—'}% match`;
    const meta = node.querySelector('.job-meta');
    [job.location, job.type, job.postedDate && job.postedDate !== 'Not listed' ? job.postedDate : 'Date not listed'].forEach(v => {
      if (v && v !== 'Not specified') { const span = document.createElement('span'); span.textContent = v; meta.appendChild(span); }
    });
    node.querySelector('.job-description').textContent = job.description || 'Open the original listing to review responsibilities, requirements, and eligibility.';
    const skills = node.querySelector('.skill-list');
    (job.skills || []).slice(0, 5).forEach(skill => { const s = document.createElement('span'); s.textContent = skill; skills.appendChild(s); });
    if (!skills.children.length) skills.classList.add('hidden');
    let hostname = 'Source page'; try { hostname = new URL(job.sourceUrl || job.applyUrl).hostname.replace(/^www\./, ''); } catch {}
    node.querySelector('.source-label').textContent = hostname;
    const apply = node.querySelector('.apply-button'); apply.href = job.applyUrl; apply.title = 'Opens the original listing in a new tab';
    const save = node.querySelector('.save-button');
    const isSaved = saved.some(x => x.applyUrl === job.applyUrl);
    save.classList.toggle('saved', isSaved); save.textContent = isSaved ? '♥' : '♡';
    save.addEventListener('click', () => toggleSave(job));
    target.appendChild(node);
  }
}
function toggleSave(job) {
  let saved = readSaved();
  if (saved.some(x => x.applyUrl === job.applyUrl)) saved = saved.filter(x => x.applyUrl !== job.applyUrl);
  else saved.unshift(job);
  localStorage.setItem(savedKey, JSON.stringify(saved)); updateSavedCount();
  if (activeView === 'saved') renderJobs(saved, $('savedList'));
  else renderJobs(currentJobs);
}
function setStats(stats = {}) { $('statFound').textContent = stats.found ?? '—'; $('statFetched').textContent = stats.fetched ?? '—'; $('statAgents').textContent = stats.agents ?? '—'; }
function setLoading(loading) {
  searchBtn.disabled = loading;
  searchBtn.innerHTML = loading ? '<span>✳</span><b>Searching live sources<span class="loading-dots"><i></i><i></i><i></i></span></b>' : '<span>✳</span><b>Find matching opportunities</b><span class="button-arrow">↗</span>';
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const prefs = getPrefs();
  if (!prefs.role) return showStatus('Add a role to start', 'Enter a role or job title, then run the search.', 'error');
  localStorage.setItem(prefsKey, JSON.stringify(prefs));
  setLoading(true); jobList.innerHTML = ''; setStats();
  $('resultsTitle').textContent = 'Searching the live web'; $('resultsSubtitle').textContent = 'Discovering pages, reading listings, and matching your preferences.';
  showStatus('TinyFish is looking for opportunities', 'Search discovers live URLs, Fetch reads page content, and Agent explores selected career pages. This may take a minute.');
  try {
    const response = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prefs) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    currentJobs = data.jobs || [];
    setStats({ found: currentJobs.length, fetched: data.stats?.fetched ?? 0, agents: data.stats?.agentSites ?? 0 });
    $('resultsTitle').textContent = currentJobs.length ? 'Your best matches' : 'No matches this time';
    $('resultsSubtitle').textContent = currentJobs.length ? `${currentJobs.length} deduplicated result${currentJobs.length === 1 ? '' : 's'} ranked for ${prefs.role}.` : 'Try broader keywords or another location.';
    if (currentJobs.length) {
      showStatus('Search complete', `Discovered ${data.stats?.discovered ?? 0} live URLs · read ${data.stats?.fetched ?? 0} pages · ran ${data.stats?.agentSites ?? 0} career agents. Verify each role on the employer's site.`);
      renderJobs(currentJobs);
    } else {
      showStatus('No structured matches found', (data.notices || ['Try a broader role or keywords.']).join(' '));
    }
  } catch (error) {
    showStatus('Could not complete the search', error.message || 'Check the server and TinyFish API key, then try again.', 'error');
    $('resultsTitle').textContent = 'Search needs a quick fix'; $('resultsSubtitle').textContent = 'Check setup details below and try again.';
  } finally { setLoading(false); }
});
function activateView(view) {
  activeView = view;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('searchPanel').classList.toggle('hidden', view !== 'discover');
  $('resultsSection').classList.toggle('hidden', view !== 'discover');
  $('savedSection').classList.toggle('hidden', view !== 'saved');
  $('preferencesSection').classList.toggle('hidden', view !== 'preferences');
  $('crumb').textContent = view === 'discover' ? 'Discover jobs' : view === 'saved' ? 'Saved jobs' : 'Preferences';
  if (view === 'saved') {
    const saved = readSaved(); $('savedList').innerHTML = '';
    if (saved.length) renderJobs(saved, $('savedList'));
    else $('savedList').innerHTML = '<div class="status-message"><span class="status-icon">♡</span><div><b>No saved jobs yet</b><p>Save interesting roles from your search results and they will appear here.</p></div></div>';
  }
  if (view === 'preferences') {
    const p = readPrefs(); const entries = [['Role',p.role],['Location',p.location],['Experience',p.seniority],['Skills & keywords',p.keywords],['Extra keywords',p.extraKeywords || 'None'],['Sources',(p.sources || []).join(', ') || 'Default sources']];
    $('preferenceSummary').innerHTML = entries.map(([k,v]) => `<div class="pref-item"><span>${escapeHtml(k.toUpperCase())}</span><b>${escapeHtml(v || 'Not set')}</b></div>`).join('');
  }
}
document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => activateView(button.dataset.view)));
$('editPrefs').addEventListener('click', () => { activateView('discover'); $('role').focus(); window.scrollTo({top:0,behavior:'smooth'}); });
$('resetBtn').addEventListener('click', () => { setPrefs({role:'Frontend Developer Intern',location:'India',seniority:'Internship',keywords:'JavaScript, React, HTML, CSS',extraKeywords:'',sources:['Company career pages','LinkedIn Jobs','Wellfound','Greenhouse and Lever']}); });
$('sortBtn').addEventListener('click', () => { sortBest = !sortBest; $('sortBtn').innerHTML = sortBest ? '✧ Best match <span>⌄</span>' : '↻ Recently found <span>⌄</span>'; if (currentJobs.length) { const jobs = [...currentJobs]; if (!sortBest) jobs.reverse(); else jobs.sort((a,b) => (b.matchScore || 0) - (a.matchScore || 0)); renderJobs(jobs); } });
setPrefs(readPrefs()); updateSavedCount();
