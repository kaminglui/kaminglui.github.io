# scripts/

Small local helpers, not part of the deployed site.

## topics_sync.py

Keeps lab pages in sync with [`content/topics.json`](../content/topics.json).

Two kinds of metadata drift painfully when sections are inserted or reordered:

1. The "N ·" prefix on every `<h3>` inside `<article class="rl-theory__panel">`.
2. The Prereqs / Continues-in chips in the `<nav class="lab-xrefs">` block —
   both the `href` and the "§N" mention inside the label text.

This script owns both. For each lab flagged `"managed": true` in
`topics.json`, it:

- rewrites `<h3>N · …</h3>` numbers to match the JSON ordering, and
- regenerates the `<nav class="lab-xrefs">` block between the markers
  `<!-- topics:xrefs:begin LAB_ID -->` / `<!-- topics:xrefs:end -->` from the
  JSON `xrefs` spec, resolving `{n}` in labels to the target section's
  current number.

Prose, figures, demo markup, and the clustering map are left untouched.

### Usage

From repo root:

```
python scripts/topics_sync.py           # apply
python scripts/topics_sync.py --check   # dry-run; exit 1 on drift
python scripts/topics_sync.py --lab math-lab   # restrict to one lab
```

Validation errors (unknown ref, missing section id in HTML) fail with exit
code 2 regardless of mode.

### Opting a lab in

1. Add its `sections` and `xrefs` to `content/topics.json` and flip
   `"managed": true`.
2. Wrap the existing `<nav class="lab-xrefs">` block in marker comments:

   ```html
   <!-- topics:xrefs:begin CLAB_ID -->
   <nav class="lab-xrefs" aria-label="Related labs">
     …existing hand-written content…
   </nav>
   <!-- topics:xrefs:end -->
   ```

3. Run `python scripts/topics_sync.py --check`. If it reports "up to date",
   the JSON and HTML already agree — commit the JSON and markers. Otherwise
   inspect the diff, fix whichever side is wrong, and re-run.

### Label templates

Each xref item looks like:

```json
{ "ref": "rl-lab/theory-dp", "label": "RL · §{n} DP" }
```

- `ref` resolves to `../<slug>/#<section-id>` for the `href`, or
  `../<slug>/` for a lab-level link (no `/`).
- `label` is rendered verbatim with `{n}` substituted for the target section's
  current display number. Omit `label` to get the target lab's `title` as the
  chip text.

### Non-obvious behaviour

- Sections with `"skipNumbering": true` (e.g. RL Lab's `demo-chain`) don't
  advance the counter. Their `<h3>` — which doesn't begin with a digit — is
  never rewritten.
- A lab that declares sections but isn't `managed` is still validated: the
  script checks every section id in JSON has a matching `<article id=…>` in
  the HTML, and that every xref ref from another managed lab resolves. This
  catches stale ids before they ship.
- The generated block uses the indentation of the begin-marker line. If the
  script produces ugly indentation, fix the marker line's leading whitespace.
- Re-running the script on an already-synced repo is a no-op and prints
  `up to date: <path>` for each managed lab.
