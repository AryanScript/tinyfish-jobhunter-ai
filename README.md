# JobHunter AI — TinyFish × TechnoJam

A student-focused job and internship discovery dashboard powered by TinyFish Search, Fetch, and Agent. It searches live web results, reads discovered pages, extracts candidate job links/listings, deduplicates URLs, ranks matches, and gives users direct links to the original sources.

## Features

- Custom role, location, experience level, skills, and keyword preferences
- TinyFish Search for live job and career-page discovery
- TinyFish Fetch for clean content from discovered URLs
- TinyFish Agent for browser-based structured extraction on selected career pages
- URL-based deduplication and preference match scoring
- Direct links to original listings
- Save jobs and retain preferences with browser local storage
- Responsive dark dashboard
- API key stored server-side in `.env`

## Requirements

- Node.js 18 or newer
- A TinyFish API key from <https://agent.tinyfish.ai/>

## Run locally (Windows / PowerShell)

1. Extract the ZIP and open the `tinyfish-jobhunter` folder in VS Code.
2. Open a terminal in that folder.
3. Install dependencies:

   ```powershell
   npm install
   ```

4. Create your local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

5. Open `.env` and replace the placeholder with your TinyFish key:

   ```text
   TINYFISH_API_KEY=your_real_key_here
   PORT=3000
   ```

6. Start the server:

   ```powershell
   npm start
   ```

7. Visit <http://localhost:3000>.

Do not share your `.env` file or commit your API key to GitHub. `.env` is excluded by `.gitignore`.

## TinyFish integration (for the bounty submission)

1. **Search** — queries the live web for role, location, and skills, including company career pages and supported job portals. Search results provide candidate URLs and snippets.
2. **Fetch** — requests clean Markdown and links for up to ten discovered URLs in a batch. The app uses the page text and extracted links to find job-specific destinations.
3. **Agent** — runs browser automation on up to three discovered career-site candidates with a constrained goal and JSON schema, to extract structured listings from dynamic pages.

The backend normalizes the returned fields, requires an HTTP(S) application URL, deduplicates by URL, and scores results against the user's role and keywords. API/provider response formats can change, so test against your own key and inspect the server console before recording the demo.

## Important notes

- Live search coverage varies by location, provider response, site structure, and rate limits. The app intentionally does not use a hardcoded vacancy list.
- The `Sources` controls currently express the user's desired source categories; the live web query set is broad and the API's returned URLs determine which sources are actually found. For a polished submission, consider expanding each selected category into a dedicated query and displaying per-source coverage.
- Some sites restrict automated access or do not expose their full listings. Respect each site's terms and robots policies; the app does not log in, bypass access controls, or submit applications.
- The match score is a transparent keyword-based relevance estimate, not an employer assessment or guarantee of eligibility.
- The Agent API is a separate call from Search and Fetch. Agent calls may take a while, so the UI communicates that a search can take up to a minute or more.

## Demo checklist

- [ ] Add a valid TinyFish key to `.env` and verify `/api/health` reports `configured: true`.
- [ ] Run searches for at least three different roles/locations.
- [ ] Check that results come from live URLs and that Apply opens the original source.
- [ ] Confirm duplicate application URLs are removed.
- [ ] Try saving and unsaving jobs, then refresh the browser.
- [ ] Record a short demo showing preferences, live search, results, and direct apply links.
- [ ] Publish a build post on both LinkedIn and X, tagging TinyFish on both platforms as required by the bounty.

## Suggested LinkedIn / X post

Built **JobHunter AI**, a TinyFish-powered internship discovery tool for students. It uses TinyFish Search to discover live career pages, Fetch to read page content, and Agent to extract structured listings from selected career sites. Then it deduplicates and ranks results against role, location, and skill preferences—with direct links to apply.

Built for the TinyFish × TechnoJam Technical Student Bounty Drop 001. Feedback welcome!

Tag TinyFish's official account on each platform before posting, and include your demo/repository link.
