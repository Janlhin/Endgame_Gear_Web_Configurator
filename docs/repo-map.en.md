# Repository Map (what every file is for)

**[简体中文](repo-map.md) | English**

> Start here as a new contributor. Grouped by directory; "where each file lives and what it does" at a glance.
> Maintenance rule: when a top-level directory is added or a file's responsibility changes, update this file in the same commit.

## Root — meta documents (living docs)

| File | Purpose |
|---|---|
| `README.md` / `README.zh-CN.md` | Project front page, English + full Simplified Chinese, cross-linked at the top |
| `AGENTS.md` | Engineering conventions for AI collaborators (incl. the spec version reference) |
| `CHANGELOG.md` | Version history (semantic, maintained since v1.3) |
| `DECISIONS.md` | Case-law file (append-only): background and rationale of every architecture/cleanup decision |
| `TASKS.md` | The single task queue: T-xxx IDs, dependencies, completion status |
| `MANIFEST.md` | Third-party material compliance list (license conclusions for everything under `re/upstream/`) |
| `LICENSE` | GPL-3.0-or-later full text |

## Root — build & engineering config

| File | Purpose |
|---|---|
| `build.mjs` | Build script: esbuild bundles TS + sass compiles SCSS + injects into the template → single-file artifact; includes the size budget gate (`SIZE_BUDGET_KB`) |
| `index.template.html` | Page skeleton template; only the `/*__BUNDLE__*/`, `/*__STYLES__*/`, `/*__CHECKLIST__*/` placeholders |
| `index.html` | **The final artifact** (root copy), zero-dependency single file, works by double-clicking; GitHub Pages points at it directly |
| `package.json` / `package-lock.json` | npm deps and scripts (the whole build/check/verify/lint chain) |
| `tsconfig.json` / `eslint.config.mjs` / `knip.config.js` | Strict TS check / ESLint (81-warning threshold) / unused-export detection |
| `stylelint.config.cjs` / `.markdownlint-cli2.jsonc` / `commitlint.config.cjs` | Lint rules for SCSS / Markdown / commit subjects (≤ 72 chars) |
| `docs/.markdownlint.jsonc` | Directory-local markdownlint exceptions for docs/ |
| `.gitignore` / `.nojekyll` | Ignore vendor binaries and artifacts / disable Jekyll on Pages (keeps underscore files excluded from Jekyll, and a failed Jekyll build from 404ing the whole site) |
| `.husky/pre-commit` / `.husky/commit-msg` | Git hooks: full verify before commit; commit subject through commitlint |
| `.github/workflows/verify.yml` | CI: the full check suite on ubuntu + windows |
| `.github/workflows/deploy.yml` | CI: build the artifact and publish to GitHub Pages |

## `src/` — TypeScript source (strict layering, bottom → top)

| File | Purpose |
|---|---|
| `state.ts` | Bottom layer: global state store |
| `transport.ts` | HID transport: open/close interfaces, feature report I/O, the official tools' retry pattern (error codes ×4 at 50 ms) |
| `protocol.ts` | 4k-family protocol: command table (0x0F/0x0D/0x0E/0xB4/0x12…), status codes, blob read/write |
| `blob.ts` | Byte-level codec for the 1024B config blob |
| `verify.ts` | Write safety: read-back verification, diff preview, send-layer whitelist |
| `device-4k.ts` / `device-8k.ts` / `device-xm1.ts` | High-level wrappers for the three device families (4k wireless / 8k wired / XM1) |
| `xm2we.ts` / `xm2we-ui.ts` | The fully independent second protocol family (2020 wired/2.4G): implementation + its dedicated UI |
| `render.ts` | State → DOM rendering |
| `presence.ts` | Connection robustness: `disconnect` event + periodic enumeration as two independent signals; the UI resets itself when the device vanishes |
| `session.ts` | Connection session orchestration |
| `connect.ts` | "Connect device" button logic and interface selection |
| `layout.ts` | **The single decision point for UI adaptation**: which cards show/hide per connected model |
| `diag.ts` | Diagnostics: export the test data packet (.json) |
| `err.ts` / `util.ts` | Error types / generic helpers |
| `i18n.ts` | i18n core: the 8-language entry table, browser language detection, `applyI18n()` (incl. the bilingual checklist-card switch) |
| `i18n/de·es·fr·ja·ko·zh-TW.ts` | Entry files for the 6 non-default languages (zh-CN and en live inside i18n.ts) |
| `types/webhid.d.ts` | TS type declarations for WebHID |

## `scss/` — the single source of styles

| File | Purpose |
|---|---|
| `_tokens.scss` | Design tokens: colors / spacing / radii / font sizes |
| `_mixins.scss` | SCSS mixins |
| `main.scss` | Main-page component styles |
| `studio.scss` | blob-studio tool-page styles |

Everything is compiled and inlined into the HTML at build time; the artifact ships no external style files.

## `tools/` — build helpers and standalone tools

| File | Purpose |
|---|---|
| `md2html.mjs` | Minimal Markdown→HTML converter; renders the test checklist into the page at build time |
| `blob-studio.template.html` / `blob-studio.html` | Offline blob analyzer (template/artifact): paste hex or JSON to get a field table; two packets auto-diff |

## `docs/` — human-facing documents

| File | Purpose |
|---|---|
| `remote-beta-guide.md` / `.en.md` | Remote-volunteer process (risks, backups, recovery); bilingual, cross-linked |
| `test-checklist.md` / `.en.md` | Test checklist (single source of truth, rendered into the page at build time); bilingual |
| `xm1-diff-kit.md` | The XM1 differential experiment kit |
| `official-product-catalog.md` | Firmware/tool versions and official download index for 16 mice |
| `ecosystem-survey.md` | Survey of comparable community tools |
| `release-safety-audit.md` | Release safety audit: per-model write-permission rationale and residual risk |
| `cpi-step-check.md` / `field-parity.md` / `user-facing-settings.md` / `web-driver-extra-features.md` | Focused analyses: CPI step consistency / cross-family field parity / user-visible settings / extra features in the official tools |

## `re/` — reverse-engineering evidence chain and tests (not part of the build)

| Group | Purpose |
|---|---|
| `PROTOCOL_NOTES.md` / `XM1_NOTES.md` / `FAMILY4_NOTES.md` | The full reverse-engineering notes for the three protocol families (the evidence-chain proper) |
| `test_*.ts` (10 files) | Offline regression tests: 8k writes, CPI steps, write gates, XM1 writes, XM2we simulation, repo hygiene… (driven by `run_test.mjs`) |
| `check_verify.mjs` / `i18n_audit.mjs` | verify pipeline structure self-check / i18n completeness audit |
| `i18n_check.py` / `layout_check.py` / `render_check.py` / `reset_check.py` | Four focused static-check scripts |
| `_domstub.ts` | DOM stub for tests |
| `archive/*.py` (11 files) | Archived one-off disassembly/scanning scripts (kept as evidence, unmaintained) |
| `upstream/` (30+ files) | Scripts and intermediate artifacts for extracting evidence from official tool binaries: the `xm1_*` series (XM1 disassembly), `tool8k_*` (8k-tool PID extraction), `is_*` (InstallShield unpacking), `xm2we_PROTOCOL.md` + `xm2we_linux.py` (collected upstream), `we_series_cfg.ini` (source of the OP1we PID)…; compliance conclusions in `MANIFEST.md` |
