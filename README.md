# Ka-Ming Lui — Technical Site

This repository contains a lightweight, content-driven website for Ka-Ming Lui. The single page is structured like a
machine-learning-focused blog so research questions, working notes, and project snapshots stay easy to maintain.

## Getting started

Open `index.html` in your browser to preview the site locally. Styles and scripts live in the `assets/` directory.

### Local preview

For a live-reload free preview that mirrors production, launch a simple HTTP server from the project root:

```bash
python -m http.server 8000
```

Then visit [http://localhost:8000](http://localhost:8000) in your browser. Stop the server with <kbd>Ctrl</kbd> + <kbd>C</kbd> when you're done.

### Lab state API

The Transformer Lab remembers each visitor's theme, stage, and token selections through a lightweight Express + Redis service that lives alongside the static files.

1. Install the backend dependencies: `npm install`.
2. Provide a Redis connection via `REDIS_URL` (e.g., add `REDIS_URL=redis://localhost:6379` to a `.env` file).
3. (Optional) Point `FRONTEND_ORIGIN` to your static server if it's not `http://localhost:8000`.
4. Start the API with `npm run dev:server` and keep it running while you work on `ml-game.html`.

The server exposes `GET /api/lab-state/:sessionId` and `POST /api/lab-state/:sessionId` routes that the front-end calls to hydrate and persist the lab state. Requests fall back to browser storage automatically if Redis is unreachable so the front-end still works offline.

### HTML validation

The markup can be linted with [HTMLHint](https://htmlhint.com/):

```bash
npx htmlhint index.html
```

Some environments may require access to the public npm registry to install the tool on first run.

### Script checks

The client-side logic is plain ES modules, so you can confirm there are no syntax errors by running Node's parser against each file:

```bash
node --check assets/js/content.js
node --check assets/js/main.js
```

These commands are quick syntax validations and do not execute the scripts.

## Highlights

- Sticky navigation with theme toggle, mobile-friendly menu, and a maintainer shortcut (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd>) that opens the site management dialog.
- Machine-learning-focused sections for learning topics, journal posts, projects, and LinkedIn-synced experience and education timelines.
- Modular cards and sidebar blocks that share a single design system for consistent presentation in both themes.
- Inline editors powered by local storage so copy, lists, and cards can be added or updated without touching the markup.
- Automatic LinkedIn badge plus experience/education sync that rehydrates from your public profile whenever the page loads.

## Content management

### Publish updates through GitHub

1. Press <kbd>.</kbd> while viewing the repository to launch [github.dev](https://github.dev/kaminglui/kaminglui.github.io). This browser-based VS Code lets you edit `assets/js/content.js`, Markdown posts, or styles without cloning locally.
2. Prefer a static site generator? GitHub Pages supports Jekyll out of the box and Quarto via GitHub Actions. Build with your chosen tool, then let the Pages workflow deploy—everything stays on GitHub infrastructure.
3. Enjoy Editor.js? Draft posts in a local `editor.html`, export to Markdown, and commit the file through GitHub to keep tokens and secrets out of the public site.
4. Commit your changes to the `main` branch (or open a pull request) and GitHub Pages will publish the updated static files automatically.

### Prototype with the local edit toolbar

1. Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd> to open the site management dialog, then choose **Enable edit toolbar** to reveal the inline editors for this browser session.
2. Use the toolbar buttons to open each modal editor (intro, about, learning, posts, projects, sidebar). Updates are saved to `localStorage` so you can iterate before committing real changes.
3. The **Reset** action clears local overrides and reverts to the defaults defined in `assets/js/content.js`.
4. Select **Hide edit toolbar** from the Manage dialog to tuck the controls away; the preference is stored in `sessionStorage` until you refresh.

### LinkedIn syncing

- The site attempts to fetch experience and education details from your public LinkedIn profile (`ka-ming-lui`) using a read-only CORS proxy. Updates you publish on LinkedIn will appear here after a page refresh.
- If the request fails—typically because LinkedIn blocks the proxy—the timelines gracefully fall back to the entries defined in `experienceFallback.positions` and `experienceFallback.education` within `assets/js/content.js`.
- The official LinkedIn badge embedded in the sidebar remains a live widget provided by LinkedIn.

### Styling and behavior

- Component tokens, layout spacing, and editor styles all live in `assets/css/style.css`.
- Additions to the primary navigation should wrap their interactive element with the shared `nav-pill` class so hover, focus,
  and active states remain consistent across themes.
- `assets/js/content.js` holds the default data structure for all editable sections. Update the defaults there if you want different starter content shipped with the site.
- `assets/js/main.js` wires together navigation, theming, edit-mode dialogs, LinkedIn synchronization, and persistence.
