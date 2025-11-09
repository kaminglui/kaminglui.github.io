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

## Highlights

- Sticky navigation with theme toggle and mobile-friendly menu
- Intro hero paired with learning tracks, machine-learning posts, project case studies, and experience timeline
- Modular card system shared by primary content and sidebar components for consistent styling
- Embedded LinkedIn badge that pulls profile updates automatically alongside contact CTAs
- Light/dark theme that respects system preferences and stores the visitor's choice

## Customization

- Update copy and links directly in `index.html`. Sections are grouped to mirror the navigation for quick edits.
- The learning journal entries live inside the `#posts` section. Duplicate a `.post-card` element to add new notes and
  update the metadata inline.
- Adjust tokens, spacing, and shared card styles in `assets/css/style.css`. Components reuse the `.card` base class so
  visual tweaks cascade consistently.
- `assets/js/main.js` manages navigation interactions, theme switching, and the dynamic footer year. The LinkedIn badge
  is pulled from the hosted script—profile updates there propagate automatically.
