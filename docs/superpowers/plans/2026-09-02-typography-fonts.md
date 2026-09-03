# Self-Hosted Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load Outfit and IBM Plex Mono from repository-hosted files and route every font declaration in the site through two shared variables, so the dashboard and the counterfactual page render one sans-serif plus one monospace system with no serif or system-font fallback in normal use.

**Architecture:** Three `@font-face` rules and two `:root` variables in `site/app/globals.css`; a deterministic Python transformation rewrites the existing 32 family declarations (verified by exact counts); font files live in `site/app/fonts/` and are emitted by Vite as hashed assets in both builds. Verification uses Playwright plus the DevTools protocol to read the actually rendered font per node.

**Tech Stack:** CSS `@font-face`, Vite asset handling (vinext and GitHub Pages builds), Python 3.12 for the stylesheet transform, Playwright (installed) for verification.

**Spec:** `docs/superpowers/specs/2026-09-02-typography-fonts-design.md`

## Global Constraints

- Font files (already placed by the controller): `site/app/fonts/outfit-latin-wght-normal.woff2`, `site/app/fonts/ibm-plex-mono-latin-500-normal.woff2`, `site/app/fonts/ibm-plex-mono-latin-600-normal.woff2`, `site/app/fonts/OFL-Outfit.txt`, `site/app/fonts/OFL-IBM-Plex-Mono.txt`. Do not add an npm dependency and do not download anything.
- Variables: `--font-sans: 'Outfit', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;` and `--font-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;`. After the change no rule may contain a family literal other than these two definitions.
- Mapping: every `Georgia` shorthand with weight 500 → weight 600 and `var(--font-sans)`; the two `Georgia` shorthands with weight 600 (`.stage-copy .stage-formula`, `.method-grid code`) → weight 500 and `var(--font-mono)`; every `ui-monospace` shorthand → `var(--font-mono)` with weights 700/750 mapped to 600; `body` → `var(--font-sans)`. Exactly 23 Georgia and 9 monospace shorthands exist today.
- Sizes are not changed. Letter-spacing values `-.04em`, `-.035em`, `-.03em` become `-.02em`.
- `font-variant-numeric: tabular-nums` is applied to the numeric display selectors listed in Task 1, not to `body`.
- `npm run lint` must print nothing; `npm test` must pass (68 tests); `npm run build` and `npm run build:pages` must succeed.
- Run `npm` commands from `site/`; run `python3` commands from the repository root.
- Commit only the files this task creates or modifies; never `git add -A`.

---

### Task 1: Load the fonts and rewire the typography

**Files:**
- Modify: `site/app/globals.css`
- Modify: `site/README.md` (short provenance note)
- Create (already present, to be committed): `site/app/fonts/*.woff2`, `site/app/fonts/OFL-*.txt`

**Interfaces:**
- Produces: CSS custom properties `--font-sans`, `--font-mono` on `:root`; `@font-face` families `'Outfit'` (weights 100–900) and `'IBM Plex Mono'` (500, 600).

- [ ] **Step 1: Record the baseline**

Run from the repository root:

```bash
grep -c "Georgia" site/app/globals.css; grep -c "monospace" site/app/globals.css; grep -c "Inter" site/app/globals.css; ls site/app/fonts
```

Expected: `23`, `9`, `1`, and the five font files listed in Global Constraints.

- [ ] **Step 2: Apply the stylesheet transformation**

Run from the repository root. The script asserts every count and refuses to write on any mismatch.

```bash
python3 - <<'EOF'
import re
from pathlib import Path

path = Path("site/app/globals.css")
css = path.read_text()

# 1. Variables: add the two font stacks to the existing :root block.
anchor = "  --line-strong: rgba(48, 52, 54, 0.28);\n"
assert css.count(anchor) == 1
css = css.replace(anchor, anchor + "  --font-sans: 'Outfit', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;\n  --font-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;\n")

# 2. Body: drop the undeclared Inter stack.
body_old = '  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\n'
assert css.count(body_old) == 1
css = css.replace(body_old, "  font-family: var(--font-sans);\n")

# 3. Georgia shorthands. Weight 500 (headings, wordmark, figures) -> Outfit 600.
#    Weight 600 (the two formula rules) -> IBM Plex Mono 500.
def serif(match):
    weight, size = match.group(1), match.group(2)
    if weight == "500":
        return f"font: 600 {size} var(--font-sans)"
    if weight == "600":
        return f"font: 500 {size} var(--font-mono)"
    raise AssertionError(f"unexpected Georgia weight {weight}")

css, serif_count = re.subn(
    r"font: (\d+) ((?:clamp\([^)]*\)|[\d.]+px)(?:/[\d.]+)?) Georgia, (?:'Times New Roman', )?serif",
    serif,
    css,
)
assert serif_count == 23, serif_count

# 4. Monospace shorthands -> IBM Plex Mono; 700/750 -> 600.
def mono(match):
    weight, size = match.group(1), match.group(2)
    if weight in ("700", "750"):
        weight = "600"
    prefix = f"{weight} " if weight else ""
    return f"font: {prefix}{size} var(--font-mono)"

css, mono_count = re.subn(
    r"font: (?:(\d+) )?([\d.]+px) ui-monospace, (?:SFMono-Regular, Menlo, )?monospace",
    mono,
    css,
)
assert mono_count == 9, mono_count

# 5. Ease heading tracking for a geometric sans.
for old in ("-.04em", "-.035em", "-.03em"):
    css = css.replace(f"letter-spacing: {old}", "letter-spacing: -.02em")

# 6. Font faces at the top, tabular digits at the end.
faces = """/* Self-hosted type: Outfit (variable, Latin) and IBM Plex Mono (500/600, Latin). OFL-1.1; licenses in ./fonts. */
@font-face {
  font-family: 'Outfit';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('./fonts/outfit-latin-wght-normal.woff2') format('woff2-variations'), url('./fonts/outfit-latin-wght-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('./fonts/ibm-plex-mono-latin-500-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('./fonts/ibm-plex-mono-latin-600-normal.woff2') format('woff2');
}

"""
css = faces + css
css = css.rstrip("\n") + """

/* Human-facing figures stay in Outfit; tabular digits keep columns aligned. */
.hero-summary-table dd, .market-orb strong, .load-orb strong, .reward-output strong, .protocol-footer strong, .capacity-row strong, .voter-cost strong, .voter-cost small, .sample-row span, .comparison-row span, .comparison-row strong, .market-table td, .quantile-row span, .detail-grid strong, .source-coverage strong, .cf-facts strong, .cf-headline strong, .cf-quantile-row span, .cf-shares span, .cf-caption { font-variant-numeric: tabular-nums; }
"""

# 7. Nothing serif or system-specific may remain outside the two variables.
body_only = css.split("--font-mono:", 1)[1].split("\n", 1)[1]
for forbidden in ("Georgia", "Times", "Inter", "ui-monospace", "SFMono", "Menlo"):
    assert forbidden not in body_only, forbidden
path.write_text(css)
print(f"rewrote {serif_count} serif and {mono_count} monospace declarations")
EOF
```

Expected: `rewrote 23 serif and 9 monospace declarations`.

- [ ] **Step 3: Document provenance in the README**

Append to `site/README.md`:

```markdown

## Typography

The site self-hosts two faces from `app/fonts/`: Outfit (variable, Latin
subset) for all text and human-facing figures, and IBM Plex Mono (500/600,
Latin subset) for technical values such as parameters, identifiers, gate
labels, formulas, and chart axis labels. Both are SIL Open Font License 1.1;
the license texts sit beside the files. The files are the Latin builds from
the fontsource packages `@fontsource-variable/outfit` 5.3.0 and
`@fontsource/ibm-plex-mono` 5.3.0, copied once rather than installed. No
font is fetched from a third-party host at runtime.
```

- [ ] **Step 4: Lint, test, build both targets**

Run from `site/`:

```bash
npm run lint && npm test 2>&1 | grep -E "Tests " && npm run build:pages 2>&1 | grep -E "woff2|built in" && npm run build 2>&1 | tail -3 && ls dist/client/assets 2>/dev/null | grep -c woff2; find dist -name "*.woff2" | head -3
```

Expected: lint prints nothing; `Tests  68 passed (68)`; the Pages build lists three `.woff2` assets; `npm run build` succeeds and its output contains the three `.woff2` files.

- [ ] **Step 5: Verify the rendered fonts with the DevTools protocol**

Start `npm run preview:pages -- --port 4173 --strictPort` from `site/` in the background, then run from the repository root:

```bash
python3 - <<'EOF'
import re
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4173/"
CHECKS = {
    BASE + "#/": [
        ("h1", "Outfit"), (".hero-copy", "Outfit"), (".hero-summary-table dd", "Outfit"),
        (".market-table td", "Outfit"), (".step-kicker", "IBM Plex Mono"), (".method-number", "IBM Plex Mono"),
    ],
    BASE + "#/counterfactual?round=10303&oi=1000000&seed=20260821&trials=200&scenario=baseline": [
        ("main h1", "Outfit"), (".cf-standfirst", "Outfit"), (".cf-headline strong", "Outfit"),
        (".cf-quantile-row span", "Outfit"), (".parameter-stack span", "IBM Plex Mono"),
        (".gate span", "IBM Plex Mono"), (".cf-grid text", "IBM Plex Mono"), (".cf-repro", "IBM Plex Mono"),
    ],
}

def rendered_families(client, root, selector):
    node = client.send("DOM.querySelector", {"nodeId": root, "selector": selector})
    if not node["nodeId"]:
        return None
    fonts = client.send("CSS.getPlatformFontsForNode", {"nodeId": node["nodeId"]})["fonts"]
    return sorted({f["familyName"] for f in fonts if f["glyphCount"] > 0})

failures = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    hosts = set()
    page.on("request", lambda r: hosts.add(re.sub(r"^(https?://[^/]+).*$", r"\1", r.url)))
    for url, checks in CHECKS.items():
        page.goto(url, wait_until="load")
        page.wait_for_selector(".cf-repro" if "counterfactual" in url else ".protocol-card", timeout=120_000)
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(500)
        extra = []
        if "counterfactual" not in url:
            page.get_by_role("button", name=re.compile("Load")).first.click()
            page.wait_for_timeout(200)
            extra.append((".stage-formula", "IBM Plex Mono"))
            page.get_by_role("button", name="Open attempt results →").click()
            page.wait_for_timeout(400)
            extra.append(("#drawer-title", "Outfit"))
        client = page.context.new_cdp_session(page)
        client.send("DOM.enable"); client.send("CSS.enable")
        root = client.send("DOM.getDocument", {"depth": -1})["root"]["nodeId"]
        for selector, expected in checks + extra:
            families = rendered_families(client, root, selector)
            # Chromium reports variable fonts by their first named instance ("Outfit Thin") and
            # static files by subfamily ("IBM Plex Mono SemiBold"), so match on the family prefix.
            ok = bool(families) and all(family.startswith(expected) for family in families)
            print(f"{'PASS' if ok else 'FAIL'} {selector:<28} rendered={families} expected=[{expected!r}]")
            if not ok:
                failures.append(selector)
        client.detach()
    browser.close()
print("hosts contacted:", sorted(hosts))
assert sorted(hosts) == ["http://localhost:4173"], "external request detected"
assert not failures, failures
print("all rendered-font checks passed")
EOF
```

Expected: every line `PASS` with `rendered=['Outfit Thin']` (the variable font's first named instance) or `rendered=['IBM Plex Mono Medium']` / `['IBM Plex Mono SemiBold']`, `hosts contacted: ['http://localhost:4173']`, and `all rendered-font checks passed`. Confirm the weight axis separately: `document.fonts` lists `Outfit 100 900 loaded`, computed `font-weight` on `h1` is `600`, and the same text measured at weights 100/600/900 grows in width. (A node whose text contains characters outside the Latin subset, such as `α`, may list a second fallback family for those glyphs; the `.parameter-stack span` check targets the first span, which begins with `α`, so if it reports `['.AppleSystemUIFontMonospaced', 'IBM Plex Mono']` or similar, treat IBM Plex Mono being present for the Latin glyphs as the pass condition and note it in the report.)

Then capture screenshots for the report and stop the preview server:

```bash
python3 - <<'EOF'
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    for width in (1440, 780):
        page = b.new_page(viewport={"width": width, "height": 900})
        for name, url, ready in (("dashboard", "http://localhost:4173/#/", ".protocol-card"), ("counterfactual", "http://localhost:4173/#/counterfactual", ".cf-repro")):
            page.goto(url, wait_until="load"); page.wait_for_selector(ready, timeout=120_000); page.wait_for_timeout(400)
            overflow = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
            page.screenshot(path=f"site/work/type-{name}-{width}.png", full_page=(width == 1440))
            print(name, width, "overflow" if overflow else "ok")
        page.close()
    b.close()
EOF
```

Expected: four `ok` lines; screenshots under `site/work/` (git-ignored) for the controller to inspect.

- [ ] **Step 6: Commit**

```bash
git add site/app/globals.css site/README.md site/app/fonts
git commit -m "Self-host Outfit and IBM Plex Mono and route all typography through two font variables

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Notes for the implementer

- If the transformation script's assertion fails, the stylesheet differs from the plan's expectations; report the failing count rather than editing the regexes to make it pass.
- Vite resolves `url('./fonts/…')` relative to `app/globals.css`; the emitted CSS points at hashed assets, which is why the fonts do not live in `public/`.
- `format('woff2-variations')` is listed first for older engines that key variable-font support on it; the plain `woff2` entry is the fallback for the same file.
