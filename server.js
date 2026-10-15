import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.TINYFISH_API_KEY;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const headers = () => ({ 'X-API-Key': API_KEY, 'Content-Type': 'application/json' });
const clean = (v, max = 140) => String(v ?? '').trim().slice(0, max);

async function tinyfishSearch(query, location) {
  const params = new URLSearchParams({ query, location: location === 'Remote' ? 'IN' : 'IN', language: 'en' });
  const response = await fetch(`https://api.search.tinyfish.ai?${params}`, { headers: headers(), signal: AbortSignal.timeout(20000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || `TinyFish Search failed (${response.status})`);
  return Array.isArray(body.results) ? body.results : [];
}

async function tinyfishFetch(urls) {
  const response = await fetch('https://api.fetch.tinyfish.ai', {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ urls: urls.slice(0, 10), format: 'markdown', links: true, image_links: false }),
    signal: AbortSignal.timeout(120000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || `TinyFish Fetch failed (${response.status})`);
  return Array.isArray(body.results) ? body.results : [];
}

async function tinyfishAgent(url, role, location, keywords) {
  const goal = `Find current job or internship openings on this career website relevant to role: ${role}; location: ${location}; keywords: ${keywords || 'relevant technical skills'}. Extract up to 8 listings visible on this site. Return ONLY JSON matching {"jobs":[{"title":"","company":"","location":"","type":"","skills":[],"postedDate":"","applyUrl":"","sourceUrl":"","description":""}]}. Use real links found on the page. Do not invent listings or URLs. If no relevant open jobs are visible, return {"jobs":[]}.`;
  const response = await fetch('https://agent.tinyfish.ai/v1/automation/run', {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ url, goal, browser_profile: 'lite' }),
    signal: AbortSignal.timeout(120000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || body?.message || `TinyFish Agent failed (${response.status})`);
  let result = body.result;
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { result = { raw: result }; }
  }
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.jobs)) return result.jobs;
  if (Array.isArray(result?.data?.jobs)) return result.data.jobs;
  // Some Agent runs return extracted content in a string field; parse JSON if possible.
  const raw = result?.text || result?.output || result?.raw || '';
  const match = typeof raw === 'string' ? raw.match(/\{[\s\S]*\}/) : null;
  if (match) { try { const parsed = JSON.parse(match[0]); return parsed.jobs || []; } catch {} }
  return [];
}

function scoreJob(job, prefs) {
  const haystack = [job.title, job.company, job.location, job.type, job.description, ...(job.skills || [])].join(' ').toLowerCase();
  const terms = [prefs.role, ...prefs.keywords.split(',').map(x => x.trim()), ...prefs.extraKeywords.split(',').map(x => x.trim())].filter(Boolean);
  let matched = 0;
  for (const term of terms) if (haystack.includes(term.toLowerCase())) matched++;
  let score = terms.length ? Math.round(100 * matched / terms.length) : 60;
  const loc = prefs.location.toLowerCase();
  if (loc && loc !== 'anywhere' && haystack.includes(loc)) score = Math.min(100, score + 10);
  const level = prefs.seniority.toLowerCase();
  if (level !== 'any' && haystack.includes(level)) score = Math.min(100, score + 5);
  if (!job.applyUrl) score = Math.max(0, score - 15);
  return score;
}
function normalizeJob(job, fallback = {}) {
  const title = clean(job.title || job.role || job.jobTitle, 180);
  const applyUrl = clean(job.applyUrl || job.apply_url || job.url || job.link || fallback.url, 600);
  const sourceUrl = clean(job.sourceUrl || job.source_url || fallback.url || applyUrl, 600);
  if (!title || !/^https?:\/\//i.test(applyUrl)) return null;
  let host = '';
  try { host = new URL(sourceUrl).hostname.replace(/^www\./, ''); } catch {}
  return {
    title, company: clean(job.company || job.companyName || host || 'Company', 140),
    location: clean(job.location || 'Not specified', 120), type: clean(job.type || job.seniority || 'Not specified', 80),
    skills: Array.isArray(job.skills) ? job.skills.map(x => clean(x, 40)).slice(0, 8) : [],
    postedDate: clean(job.postedDate || job.posted_date || job.date || 'Not listed', 80),
    applyUrl, sourceUrl, description: clean(job.description || job.snippet || '', 500)
  };
}
function dedupe(jobs) {
  const seen = new Set();
  return jobs.filter(job => {
    const key = (job.applyUrl.replace(/\?.*$/, '').replace(/\/$/, '') || `${job.title}-${job.company}`).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

app.get('/api/health', (_req, res) => res.json({ ok: true, configured: Boolean(API_KEY) }));
app.post('/api/search', async (req, res) => {
  const prefs = {
    role: clean(req.body.role || 'Software Engineer Intern'),
    location: clean(req.body.location || 'India'),
    seniority: clean(req.body.seniority || 'Internship'),
    keywords: clean(req.body.keywords || 'JavaScript, React, HTML, CSS', 240),
    extraKeywords: clean(req.body.extraKeywords || '', 240),
    sources: Array.isArray(req.body.sources) ? req.body.sources.slice(0, 5).map(x => clean(x, 80)) : ['Company career pages', 'LinkedIn Jobs', 'Wellfound']
  };
  if (!API_KEY) return res.status(503).json({ error: 'TinyFish API key missing. Copy .env.example to .env and add your key.' });
  if (!prefs.role) return res.status(400).json({ error: 'Please enter a role.' });
  const searchQueries = [
    `site:careers.google.com ${prefs.role} ${prefs.location} ${prefs.keywords}`,
    `site:jobs.lever.co OR site:boards.greenhouse.io ${prefs.role} ${prefs.location} ${prefs.keywords}`,
    `site:linkedin.com/jobs OR site:wellfound.com/jobs ${prefs.role} ${prefs.location} ${prefs.keywords}`,
    `${prefs.role} ${prefs.location} ${prefs.seniority} careers jobs ${prefs.keywords}`
  ];
  try {
    // TinyFish Search: discover live listings and career-page URLs from multiple sources.
    const searchBatches = await Promise.allSettled(searchQueries.map(q => tinyfishSearch(q, prefs.location)));
    const discovered = searchBatches.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    const uniqueResults = [...new Map(discovered.filter(r => r.url && /^https?:\/\//i.test(r.url)).map(r => [r.url, r])).values()];
    if (!uniqueResults.length) return res.json({ jobs: [], stats: { discovered: 0, fetched: 0, agentSites: 0 }, notices: ['Search returned no usable URLs. Try broader keywords or check your API access.'] });

    const normalizedSearchJobs = uniqueResults.map(r => normalizeJob({ title: r.title, description: r.snippet, applyUrl: r.url, sourceUrl: r.url, company: r.site_name || '' })).filter(Boolean);
    // Fetch: read up to 10 live pages and extract job links/content. More can be added in subsequent batches.
    const fetchUrls = uniqueResults.slice(0, 10).map(r => r.url);
    let fetched = [];
    try { fetched = await tinyfishFetch(fetchUrls); } catch (e) { console.warn('Fetch stage:', e.message); }
    const fetchedJobs = [];
    for (const page of fetched) {
      const text = String(page.text || '');
      // Find actual job URLs from TinyFish's extracted links when available.
      const links = Array.isArray(page.links) ? page.links : [];
      for (const link of links) {
        const url = typeof link === 'string' ? link : (link.url || link.href || '');
        const label = typeof link === 'string' ? link : (link.text || link.title || '');
        if (/^https?:\/\//i.test(url) && /(job|career|opening|apply|intern|position|requisition)/i.test(`${url} ${label}`)) {
          fetchedJobs.push({ title: label || '', company: page.title || '', location: '', applyUrl: url, sourceUrl: page.final_url || page.url, description: '' });
        }
      }
      // Keep page-level search result as a grounded lead if no job-specific link was available.
      if (!links.length && text.length > 80) {
        const fallback = uniqueResults.find(r => r.url === page.url);
        if (fallback) fetchedJobs.push({ title: fallback.title, company: fallback.site_name, location: prefs.location, applyUrl: fallback.url, sourceUrl: page.final_url || page.url, description: text.slice(0, 400) });
      }
    }

    // Agent: use browser automation on a small number of career pages for structured extraction.
    const careerCandidates = uniqueResults.filter(r => /(careers\.|jobs\.|greenhouse\.io|lever\.co|workdayjobs\.com|wellfound\.com)/i.test(r.url)).slice(0, 3);
    const agentRuns = await Promise.allSettled(careerCandidates.map(r => tinyfishAgent(r.url, prefs.role, prefs.location, prefs.keywords)));
    const agentJobs = agentRuns.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    const all = [...agentJobs, ...fetchedJobs, ...normalizedSearchJobs].map(j => normalizeJob(j)).filter(Boolean);
    const ranked = dedupe(all).map(job => ({ ...job, matchScore: scoreJob(job, prefs) }))
      .filter(job => {
        const text = `${job.title} ${job.description} ${job.type} ${job.location} ${job.skills.join(' ')}`.toLowerCase();
        const roleWords = prefs.role.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !['intern','internship','junior','entry','level'].includes(w));
        return roleWords.length === 0 || roleWords.some(w => text.includes(w)) || job.matchScore >= 35;
      })
      .sort((a, b) => b.matchScore - a.matchScore).slice(0, 40);
    res.json({ jobs: ranked, stats: { discovered: uniqueResults.length, fetched: fetched.length, agentSites: careerCandidates.length, agentJobs: agentJobs.length }, notices: ranked.length ? [] : ['No structured matches found. Try a broader role or keywords; job sites vary in how they expose listings.'] });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: error.message || 'Search failed. Please try again.' });
  }
});

app.listen(PORT, () => console.log(`JobHunter AI running at http://localhost:${PORT}`));
