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

- Sticky navigation with theme toggle, mobile-friendly menu, and a login-gated edit toolbar.
- Machine-learning-focused sections for learning topics, journal posts, projects, and LinkedIn-synced experience and education timelines.
- Modular cards and sidebar blocks that share a single design system for consistent presentation in both themes.
- Inline editors powered by local storage so copy, lists, and cards can be added or updated without touching the markup.
- Automatic LinkedIn badge plus experience/education sync that rehydrates from your public profile whenever the page loads.
- Admin sign-in backed by Google reCAPTCHA so edit mode is only available after you authenticate.

## Customization & inline editing

### Admin sign-in

1. Update the `data-passcode` attribute on `#login-dialog` in `index.html` with a private access code.
2. Create a Google reCAPTCHA v2 site key and secret. Place the site key in the dialog's `data-recaptcha-key` attribute and keep the secret server-side for future verification.
3. Deploy the site and click **Sign in** in the top navigation. Solve the reCAPTCHA challenge and submit your access code to unlock edit mode.
4. When you're finished updating content, choose **Sign out** from the navigation or close the browser tab to end the session (the flag lives in `sessionStorage`).

### Content editors

1. After signing in, click **Edit mode** in the top navigation to reveal the toolbar.
2. Choose the area you want to adjust (intro, about, learning topics, posts, projects, or sidebar blocks).
3. Update text fields, add new entries, or delete existing ones in the modal editor. Changes are saved to `localStorage` so they persist between visits on the same browser.
4. Use the **Reset** button in the toolbar to clear saved edits and return to the defaults from `assets/js/content.js`.

### LinkedIn syncing

- The site attempts to fetch experience and education details from your public LinkedIn profile (`ka-ming-lui`) using a read-only CORS proxy. Updates you publish on LinkedIn will appear here after a page refresh.
- If the request fails—typically because LinkedIn blocks the proxy—the timelines gracefully fall back to the entries defined in `experienceFallback.positions` and `experienceFallback.education` within `assets/js/content.js`.
- The official LinkedIn badge embedded in the sidebar remains a live widget provided by LinkedIn.

### Styling and behavior

- Component tokens, layout spacing, and editor styles all live in `assets/css/style.css`.
- `assets/js/content.js` holds the default data structure for all editable sections. Update the defaults there if you want different starter content shipped with the site.
- `assets/js/main.js` wires together navigation, theming, edit-mode dialogs, LinkedIn synchronization, and persistence.
