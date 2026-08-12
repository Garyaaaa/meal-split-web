# Meal Split Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WeChat mini-program delivery with a bilingual, browser-only meal-splitting web app that can be served directly by GitHub Pages.

**Architecture:** Keep the existing tested domain algorithms and expose them to both Node tests and the browser through a small CommonJS/browser-global compatibility wrapper. Build the UI as a dependency-free static page with explicit application state, a translation dictionary, `localStorage` persistence, and a clipboard fallback. The public branch will contain the Web app and documentation, not WeChat page/config files.

**Tech Stack:** HTML, CSS, browser JavaScript, Node.js built-in `node:test`, GitHub Pages.

---

## File map

Create `index.html`, `web/app.js`, `web/i18n.js`, `web/storage.js`, `web/clipboard.js`, and `web/styles.css` for the static browser app. Modify `domain/participants.js`, `services/settlement.js`, `services/share.js`, and `utils/money.js` only as needed to expose their existing behavior to the browser without changing the tested API. Replace the mini-program `package.json` metadata and README with Web instructions. Create `.nojekyll`, `LICENSE`, and Web-focused tests under `tests/`.

Delete the WeChat-only `app.*`, `pages/`, `components/`, `project.config.json`, `project.private.config.json`, and `sitemap.json` from this public branch. Remove tests whose only purpose is to assert WeChat page/config structure; retain domain and service regression coverage and replace UI coverage with browser-state tests.

### Task 1: Establish the Web test harness and browser-compatible core exports

**Files:**
- Create: `tests/web-core.test.js`
- Modify: `domain/participants.js`, `services/settlement.js`, `services/share.js`, `utils/money.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing browser-export tests**

Add tests that evaluate each core file in a VM context without CommonJS and assert that it creates the matching browser global:

```js
const context = { console };
vm.runInNewContext(source, context, { filename });
assert.equal(typeof context.MealSplitParticipants.createBill, 'function');
assert.equal(typeof context.MealSplitSettlement.calculateSettlement, 'function');
assert.equal(typeof context.MealSplitShare.buildShareText, 'function');
assert.equal(typeof context.MealSplitMoney.formatCents, 'function');
```

- [ ] **Step 2: Run the focused test and verify it fails for the missing browser globals**

Run: `node --test tests/web-core.test.js`  
Expected: FAIL because the existing files only expose `module.exports`.

- [ ] **Step 3: Add a compatibility wrapper while preserving CommonJS exports**

Wrap each existing module so Node keeps receiving `module.exports`, while a browser context receives its named global. Keep all existing error messages and function signatures unchanged.

- [ ] **Step 4: Add a Web test script and run both focused and legacy tests**

Update `package.json` to use:

```json
"private": false,
"scripts": {
  "test": "node --test tests/*.test.js"
}
```

Run: `node --test tests/web-core.test.js` and `npm test`  
Expected: browser-export tests pass and all retained domain/service tests remain green.

- [ ] **Step 5: Commit the core compatibility layer**

```bash
git add package.json domain/participants.js services/settlement.js services/share.js utils/money.js tests/web-core.test.js
git commit -m "refactor: expose split logic to the browser"
```

### Task 2: Add browser storage and clipboard adapters

**Files:**
- Create: `web/storage.js`, `web/clipboard.js`
- Create: `tests/web-services.test.js`

- [ ] **Step 1: Write failing adapter tests**

Cover safe draft loading, persistence, clearing, corrupt-data recovery, successful async clipboard writes, and a manual-copy fallback when `navigator.clipboard` is unavailable or rejects.

- [ ] **Step 2: Run the focused tests and verify the expected missing-module failure**

Run: `node --test tests/web-services.test.js`  
Expected: FAIL because the browser adapters do not exist.

- [ ] **Step 3: Implement the minimal adapters**

Use the existing draft envelope shape and key `meal_split_draft`. Expose browser globals `MealSplitStorage` and `MealSplitClipboard`; do not access `window` or `navigator` at module evaluation time so the adapters remain testable.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/web-services.test.js` and `npm test`  
Expected: all adapter and retained regression tests pass.

- [ ] **Step 5: Commit the browser service adapters**

```bash
git add web/storage.js web/clipboard.js tests/web-services.test.js
git commit -m "feat: add local browser storage and clipboard fallback"
```

### Task 3: Build the bilingual static application shell

**Files:**
- Create: `index.html`, `web/app.js`, `web/i18n.js`
- Create: `tests/web-app.test.js`

- [ ] **Step 1: Write failing application-state tests**

Test the language default (`zh` for Chinese browser languages and `en` otherwise), persisted language switching, creation of a two-person bill, and render-state transitions between `start`, `ledger`, and `result`.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `node --test tests/web-app.test.js`  
Expected: FAIL because the application controller and translation dictionary do not exist.

- [ ] **Step 3: Implement the translation dictionary and application controller**

Use a dictionary keyed by `zh` and `en`, with every visible label and error represented as a translation key. Keep user-entered names and notes outside the translation system. The controller owns one state object containing `language`, `screen`, `bill`, `editor`, `error`, and `copyFallbackText`, and re-renders after each state mutation.

- [ ] **Step 4: Implement the HTML shell and event delegation**

Create semantic landmarks, a language toggle, start/ledger/result containers, live error/status regions, and buttons with stable `data-action` attributes. Load core scripts before `web/app.js` and render the initial screen after `DOMContentLoaded`.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/web-app.test.js` and `npm test`  
Expected: application-state tests and all prior tests pass.

- [ ] **Step 6: Commit the bilingual app shell**

```bash
git add index.html web/app.js web/i18n.js tests/web-app.test.js
git commit -m "feat: add bilingual web app shell"
```

### Task 4: Implement participant and expense workflows

**Files:**
- Modify: `web/app.js`, `index.html`, `web/i18n.js`
- Create: `tests/web-workflows.test.js`

- [ ] **Step 1: Write failing workflow tests**

Cover choosing 2–20 participants, named participants, adding an all-participants expense, editing an expense, choosing a selected split, deleting an expense, and saving after each mutation.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/web-workflows.test.js`  
Expected: FAIL because the workflow actions are not implemented.

- [ ] **Step 3: Implement the start and ledger workflows**

Reuse `createBill`, `createNamedParticipants`, `reconcileParticipants`, `parseYuanToCents`, and the existing bill validation rules. Keep all participant and expense IDs stable during edits. Use one form for add/edit and reset it when opened for a new expense.

- [ ] **Step 4: Implement validation and localized errors**

Reject blank or duplicate names, invalid/non-positive amounts, missing payer, and empty selected splits. Show the translated error in the live region and leave the current bill unchanged.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/web-workflows.test.js` and `npm test`  
Expected: workflow tests pass and no retained core regression fails.

- [ ] **Step 6: Commit participant and expense workflows**

```bash
git add index.html web/app.js web/i18n.js tests/web-workflows.test.js
git commit -m "feat: add participant and expense workflows"
```

### Task 5: Implement settlement results, sharing, and completion

**Files:**
- Modify: `web/app.js`, `index.html`, `web/i18n.js`
- Create: `tests/web-results.test.js`

- [ ] **Step 1: Write failing result tests**

Use the two existing five-person examples and assert total, collector, transfer rows, `$`-prefixed amounts, collector switching, bilingual share text, copy fallback, cancellation, and confirmed draft clearing.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/web-results.test.js`  
Expected: FAIL because the result screen and completion actions are not implemented.

- [ ] **Step 3: Implement result rendering and collector selection**

Call `calculateSettlement` with the stored collector ID, render every transfer, and allow only positive-net members to become the selected collector. Format every displayed amount as `$${formatCents(cents)}` without exchange-rate logic.

- [ ] **Step 4: Implement copy and completion actions**

Generate the current-language summary through `buildShareText`, use the clipboard adapter, expose fallback text on failure, and require explicit confirmation before clearing local storage.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/web-results.test.js` and `npm test`  
Expected: result tests pass and all prior tests remain green.

- [ ] **Step 6: Commit settlement results**

```bash
git add index.html web/app.js web/i18n.js tests/web-results.test.js
git commit -m "feat: add bilingual settlement results"
```

### Task 6: Add responsive and accessible styling

**Files:**
- Create: `web/styles.css`
- Modify: `index.html`
- Create: `tests/web-layout.test.js`

- [ ] **Step 1: Write failing static layout tests**

Assert the page loads `web/styles.css`, contains viewport metadata, has a visible language control, uses semantic form labels, and includes no WeChat-only markup or configuration references.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/web-layout.test.js`  
Expected: FAIL because the stylesheet and final semantic markup are not present.

- [ ] **Step 3: Implement the visual system**

Create a mobile-first layout with a centered content column, readable spacing, `$` amount styling, cards for expenses and transfers, clear primary/secondary/danger actions, visible `:focus-visible` styles, and media queries for desktop widths. Keep touch targets at least 44 CSS pixels high.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/web-layout.test.js` and `npm test`  
Expected: layout checks and all functional tests pass.

- [ ] **Step 5: Commit responsive styling**

```bash
git add index.html web/styles.css tests/web-layout.test.js
git commit -m "feat: add responsive accessible web styling"
```

### Task 7: Convert the branch into a public Web repository

**Files:**
- Modify: `README.md`, `package.json`, `.gitignore`
- Create: `LICENSE`, `.nojekyll`
- Delete: `app.js`, `app.json`, `app.wxss`, `pages/`, `components/`, `project.config.json`, `project.private.config.json`, `sitemap.json`, and WeChat-only tests

- [ ] **Step 1: Write the bilingual repository metadata**

README sections must cover the online demo placeholder, features, Chinese/English usage, local development, `npm test`, privacy, limitations of `$`, contribution/feedback, and GitHub Pages deployment. The MIT license must name the project author as `Gary` and use the year `2026`.

- [ ] **Step 2: Add ignore rules before removing local-only files**

Ensure `.gitignore` contains `.DS_Store`, `project.private.config.json`, `node_modules/`, and common build output directories. Do not ignore source files needed by GitHub Pages.

- [ ] **Step 3: Remove WeChat delivery files from the public branch**

Delete only the files listed above from this isolated branch. Keep domain/service source and tests that still exercise the Web app.

- [ ] **Step 4: Run repository-wide checks**

Run: `rg -n -i 'wx\\.|微信|project\\.config|touristappid|appid' --glob '!docs/superpowers/**' .`  
Expected: no WeChat runtime/config references in the public Web source; historical design docs may retain migration context.

Run: `npm test`  
Expected: all retained Web and domain tests pass.

- [ ] **Step 5: Commit the public repository cleanup**

```bash
git add -A
git commit -m "chore: prepare repository for public web release"
```

### Task 8: Verify the published candidate and prepare GitHub Pages

**Files:**
- Modify: `README.md` with the final Pages URL and feedback instructions after the repository name is known
- Test: browser manual verification against `index.html`

- [ ] **Step 1: Run the complete automated suite and inspect the candidate tree**

Run: `npm test` and `git status --short`  
Expected: all tests pass; only intentional source/docs changes are present; no private config or `.DS_Store` is tracked.

- [ ] **Step 2: Serve the static site locally**

Run: `python3 -m http.server 4173` from the repository root, then open `http://127.0.0.1:4173/` in a browser. Confirm the app loads without console errors.

- [ ] **Step 3: Manually verify the acceptance matrix**

Test both languages, 2 and 20 participants, long names, both arithmetic examples, refresh recovery, edit/delete, collector switching, copy fallback, completion cancellation/confirmation, narrow mobile width, desktop width, keyboard focus, and screen-reader labels. Record any browser limitation in README before publishing.

- [ ] **Step 4: Check the final diff and history for sensitive material**

Run: `git diff --check HEAD~1` and `git ls-files | rg '(^|/)(project\\.private\\.config\\.json|.*secret.*|.*token.*)$'`  
Expected: no whitespace errors and no private configuration tracked.

- [ ] **Step 5: Commit final verification notes**

```bash
git add README.md
git commit -m "docs: add web release verification notes"
```

- [ ] **Step 6: Push and configure GitHub Pages only after repository identity is confirmed**

Use the confirmed public GitHub repository and branch, push with tracking, enable Pages from the repository branch root, replace the README demo placeholder with the actual URL, and run one final `npm test` after the URL change.

## Plan self-review

- Spec coverage: Web-only delivery, bilingual UI, `$` display without currency selector, local-only storage, clipboard fallback, responsive/accessibility checks, public cleanup, MIT license, README, GitHub Pages, and user feedback are covered by Tasks 1–8.
- Placeholder scan: the only temporary URL is explicitly tied to the point at which the GitHub repository identity becomes known; it is not a missing implementation detail.
- Type/API consistency: the plan preserves the existing CommonJS APIs and adds the named browser globals `MealSplitParticipants`, `MealSplitSettlement`, `MealSplitShare`, `MealSplitMoney`, `MealSplitStorage`, and `MealSplitClipboard`; application tests consume those stable boundaries.
- Scope: the plan contains one deployable static Web subsystem. WeChat-specific files are removed from the public branch rather than maintained as a second product.
