#!/usr/bin/env python3
"""Keep lab pages in sync with content/topics.json.

The site authors labs as hand-written HTML, but two kinds of metadata drift
painfully when sections are inserted or reordered:

  1. The "N ·" prefix on every <h3> inside <article class="rl-theory__panel">.
  2. The Prereqs / Continues-in chips in the <nav class="lab-xrefs"> block —
     both href and the "§N" mention inside the label.

This script owns both. For each lab flagged "managed": true in topics.json,
it rewrites section numbers to match the JSON ordering and regenerates the
<nav class="lab-xrefs"> block from the JSON "xrefs" spec. Everything else on
the page — prose, figures, demos, the clustering map — is left untouched.

Usage (from repo root):

    python scripts/topics_sync.py           # apply changes
    python scripts/topics_sync.py --check   # dry-run; exit 1 on drift
    python scripts/topics_sync.py --lab math-lab   # just one lab

For a lab to be rewritten:
  - topics.json must set "managed": true on it.
  - Its HTML must already contain the <!-- topics:xrefs:begin LAB_ID --> /
    <!-- topics:xrefs:end --> marker pair around its xrefs block (section
    renumbering works without markers).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple


REPO_ROOT = Path(__file__).resolve().parent.parent
TOPICS_PATH = REPO_ROOT / "content" / "topics.json"

# Any <article class="rl-theory__panel" id="…"> — used by the validator.
ARTICLE_ID_RE = re.compile(
    r'<article\s+class="rl-theory__panel"\s+id="(?P<id>[A-Za-z][\w-]*)"',
)

# Numbered section heading: <article …><h3>1 · …</h3>. Only this shape is
# rewritten by the renumber pass; unnumbered demo panels ("<h3>Demo · …</h3>")
# are left alone.
SECTION_HEADING_RE = re.compile(
    r'(<article\s+class="rl-theory__panel"\s+id="(?P<id>[A-Za-z][\w-]*)">\s*'
    r'<h3>)(?P<num>\d+)(?P<sep>\s*·\s*)',
    flags=re.DOTALL,
)

# <!-- topics:xrefs:begin math-lab --> ... <!-- topics:xrefs:end -->
# Anchored at line-start via MULTILINE so we can capture the leading indent.
XREFS_BLOCK_RE = re.compile(
    r'(?P<indent>[ \t]*)<!--\s*topics:xrefs:begin\s+(?P<lab>[\w-]+)\s*-->'
    r'(?P<body>.*?)'
    r'(?P=indent)<!--\s*topics:xrefs:end\s*-->',
    flags=re.DOTALL | re.MULTILINE,
)


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class Section:
    id: str
    title: str
    skip_numbering: bool = False


@dataclass
class Lab:
    id: str
    title: str
    short_name: str
    slug: str
    page: Path
    managed: bool
    sections: List[Section]
    xrefs: Dict[str, list]

    def numbering(self) -> Dict[str, Optional[int]]:
        """Map section id → display number (or None if skipNumbering)."""
        out: Dict[str, Optional[int]] = {}
        n = 0
        for sec in self.sections:
            if sec.skip_numbering:
                out[sec.id] = None
            else:
                n += 1
                out[sec.id] = n
        return out

    def section_number(self, sec_id: str) -> Optional[int]:
        return self.numbering().get(sec_id)


def load_topics(path: Path) -> Dict[str, Lab]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    labs: Dict[str, Lab] = {}
    for lab_id, lab_data in raw.get("labs", {}).items():
        sections = [
            Section(
                id=s["id"],
                title=s["title"],
                skip_numbering=bool(s.get("skipNumbering", False)),
            )
            for s in lab_data.get("sections", [])
        ]
        labs[lab_id] = Lab(
            id=lab_id,
            title=lab_data["title"],
            short_name=lab_data.get("shortName", lab_data["title"]),
            slug=lab_data.get("slug", lab_id),
            page=REPO_ROOT / lab_data["page"],
            managed=bool(lab_data.get("managed", False)),
            sections=sections,
            xrefs=lab_data.get("xrefs", {}),
        )
    return labs


# ---------------------------------------------------------------------------
# Section heading renumbering
# ---------------------------------------------------------------------------


def renumber_sections(html: str, lab: Lab) -> Tuple[str, List[str]]:
    """Rewrite `<h3>N · …</h3>` to match the JSON ordering. Returns new HTML
    and a list of human-readable change notes."""
    numbering = lab.numbering()
    changes: List[str] = []

    def repl(match: re.Match) -> str:
        sid = match.group("id")
        if sid not in numbering:
            return match.group(0)
        expected = numbering[sid]
        if expected is None:
            return match.group(0)
        current = int(match.group("num"))
        if current == expected:
            return match.group(0)
        changes.append(f"  section {current} -> {expected}  ({sid})")
        return f"{match.group(1)}{expected}{match.group('sep')}"

    new_html = SECTION_HEADING_RE.sub(repl, html)
    return new_html, changes


# ---------------------------------------------------------------------------
# Xref chip rendering
# ---------------------------------------------------------------------------


def resolve_ref(item: dict, labs: Dict[str, Lab]) -> Tuple[str, str]:
    """Given a {ref, label?} item, return (href, label) for the chip."""
    ref = item["ref"]
    if "/" in ref:
        target_lab_id, target_sec_id = ref.split("/", 1)
    else:
        target_lab_id, target_sec_id = ref, None
    if target_lab_id not in labs:
        raise ValueError(f"ref {ref!r}: unknown lab {target_lab_id!r}")
    target = labs[target_lab_id]
    href = f"../{target.slug}/"
    number: Optional[int] = None
    if target_sec_id:
        known = {s.id for s in target.sections}
        if target_sec_id not in known:
            raise ValueError(
                f"ref {ref!r}: section {target_sec_id!r} not found in lab "
                f"{target_lab_id!r}"
            )
        href = f"{href}#{target_sec_id}"
        number = target.section_number(target_sec_id)
    label_template = item.get("label") or target.title
    label = label_template.replace(
        "{n}", str(number) if number is not None else ""
    )
    return href, label


def render_xrefs(lab: Lab, labs: Dict[str, Lab], indent: str) -> str:
    """Render the managed <nav class='lab-xrefs'> block with indent prefix."""
    groups = [
        ("prereqs", "Prereqs"),
        ("continuesIn", "Continues in"),
    ]
    lines = [f'{indent}<nav class="lab-xrefs" aria-label="Related labs">']
    for key, label_text in groups:
        items = lab.xrefs.get(key, [])
        lines.append(f'{indent}  <div class="lab-xrefs__group">')
        lines.append(
            f'{indent}    <span class="lab-xrefs__label">{label_text}</span>'
        )
        if not items:
            filler = (
                "none — start here"
                if key == "prereqs"
                else "—"
            )
            lines.append(
                f'{indent}    <span class="lab-xrefs__chip '
                f'lab-xrefs__chip--empty">{filler}</span>'
            )
        else:
            for item in items:
                href, label = resolve_ref(item, labs)
                lines.append(
                    f'{indent}    <a class="lab-xrefs__chip" '
                    f'href="{href}">{label}</a>'
                )
        lines.append(f"{indent}  </div>")
    lines.append(f"{indent}</nav>")
    return "\n".join(lines)


def rewrite_xrefs(
    html: str, lab: Lab, labs: Dict[str, Lab]
) -> Tuple[str, List[str]]:
    changes: List[str] = []

    def repl(match: re.Match) -> str:
        marker_lab = match.group("lab")
        if marker_lab != lab.id:
            raise ValueError(
                f"xrefs marker in {lab.page} names lab {marker_lab!r}, "
                f"expected {lab.id!r}"
            )
        indent = match.group("indent")
        rendered = render_xrefs(lab, labs, indent)
        body_old = match.group("body").strip("\r\n")
        # Newline-normalise for comparison so CRLF vs LF in-file doesn't
        # register as drift.
        existing_normalised = (
            indent + body_old.strip()
        ).replace("\r\n", "\n")
        candidate_normalised = rendered.replace("\r\n", "\n").strip()
        # The full replacement between markers is: newline + rendered body +
        # newline + indent (so the closing marker stays at its original
        # indent). We compare by walking both sides.
        new_block = (
            match.group("indent")
            + f"<!-- topics:xrefs:begin {lab.id} -->\n"
            + rendered
            + "\n"
            + match.group("indent")
            + "<!-- topics:xrefs:end -->"
        )
        if new_block != match.group(0):
            changes.append("  xrefs block regenerated")
        return new_block

    new_html = XREFS_BLOCK_RE.sub(repl, html)
    return new_html, changes


# ---------------------------------------------------------------------------
# Validation (run on every lab, managed or not)
# ---------------------------------------------------------------------------


def validate_lab(lab: Lab, labs: Dict[str, Lab]) -> List[str]:
    """Check referential integrity: every xref points at a real section, and
    every section id declared in JSON appears in the HTML."""
    errors: List[str] = []
    # Xref targets exist.
    for group_key in ("prereqs", "continuesIn"):
        for item in lab.xrefs.get(group_key, []):
            try:
                resolve_ref(item, labs)
            except ValueError as exc:
                errors.append(f"{lab.id}: {exc}")
    # HTML sections declared in JSON actually exist on the page.
    if lab.sections and lab.page.exists():
        html = read_text(lab.page)
        html_ids = {m.group("id") for m in ARTICLE_ID_RE.finditer(html)}
        for sec in lab.sections:
            if sec.id not in html_ids:
                errors.append(
                    f"{lab.id}: section {sec.id!r} declared in JSON but no "
                    f"matching <article id={sec.id!r}> found in {lab.page}"
                )
    return errors


# ---------------------------------------------------------------------------
# File IO preserving CRLF/LF
# ---------------------------------------------------------------------------


def read_text(path: Path) -> str:
    with open(path, "r", encoding="utf-8", newline="") as fh:
        return fh.read()


def write_text(path: Path, content: str) -> None:
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(content)


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def process_lab(
    lab: Lab, labs: Dict[str, Lab], check: bool
) -> Tuple[bool, List[str]]:
    """Returns (would_change, notes)."""
    if not lab.managed:
        return False, []
    if not lab.page.exists():
        return False, [f"{lab.id}: missing page {lab.page}"]

    original = read_text(lab.page)
    updated = original
    notes: List[str] = []

    updated, section_notes = renumber_sections(updated, lab)
    notes.extend(section_notes)

    updated, xref_notes = rewrite_xrefs(updated, lab, labs)
    notes.extend(xref_notes)

    if updated == original:
        return False, []

    if not check:
        write_text(lab.page, updated)
    return True, notes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Dry-run: exit 1 if any managed lab would be rewritten.",
    )
    parser.add_argument(
        "--lab",
        help="Restrict to one lab id (must still be managed).",
    )
    args = parser.parse_args()

    if not TOPICS_PATH.exists():
        print(f"topics.json not found at {TOPICS_PATH}", file=sys.stderr)
        return 2

    labs = load_topics(TOPICS_PATH)

    all_errors: List[str] = []
    for lab in labs.values():
        all_errors.extend(validate_lab(lab, labs))
    if all_errors:
        print("Validation errors:", file=sys.stderr)
        for err in all_errors:
            print(f"  {err}", file=sys.stderr)
        return 2

    drifted = False
    for lab_id, lab in labs.items():
        if args.lab and lab_id != args.lab:
            continue
        would_change, notes = process_lab(lab, labs, check=args.check)
        if would_change:
            drifted = True
            verb = "would rewrite" if args.check else "rewrote"
            print(f"{verb} {lab.page.relative_to(REPO_ROOT)}")
            for note in notes:
                print(note)
        elif lab.managed:
            print(f"up to date: {lab.page.relative_to(REPO_ROOT)}")

    if args.check and drifted:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
