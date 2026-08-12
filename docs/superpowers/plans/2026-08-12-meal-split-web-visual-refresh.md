# Meal Split Web Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the public bilingual Meal Split Web UI so it visibly follows the approved WeChat mini-program visual language while remaining a browser-only GitHub Pages app. The Chinese ledger title will render as “今天 / 消费了多少”, the English title will remain one line as “Today’s spending”, and each expense row will place the expense name and payer on the left with the dollar amount fixed on the right.

**Architecture:** Keep the current dependency-free static application, state controller, local draft storage, clipboard fallback, and tested settlement algorithms. Change only translation contracts, rendered semantic markup, interaction presentation, and CSS. Use the existing document.getElementById('app').innerHTML render seam in Node tests with a tiny fake document; do not introduce a framework, build step, backend, currency selector, or currency-consistency prompt.

**Tech Stack:** HTML, CSS, browser JavaScript, Node.js built-in node:test, GitHub Pages.

---

## File map

Modify:

- web/i18n.js — add the approved bilingual page and expense-row wording.
- web/app.js — render the approved start, ledger, editor, and result structures; add the participant-count stepper interaction; keep all business calculations and persistence calls unchanged.
- web/styles.css — replace the warm visual system with the approved light-gray, white-card, blue-CTA system and responsive editor sheet.
- index.html — update the static theme color to match the refreshed visual system.

Create:

- tests/web-visual-refresh.test.js — render-level bilingual and semantic hierarchy regression tests.

Do not modify:

- utils/money.js, domain/participants.js, services/settlement.js, services/share.js, web/storage.js, or web/clipboard.js; the refresh must consume their existing APIs without changing arithmetic, settlement, storage, or sharing behavior.
- The existing public-repository cleanup or GitHub Pages setup.

## Task 1: Lock the bilingual visual contract with failing render tests

**Files:**

- Create: tests/web-visual-refresh.test.js
- Modify later: web/i18n.js, web/app.js, web/styles.css

- [ ] **Step 1: Add a render-test harness.**

Load the same browser-global modules as tests/web-results.test.js, then create a fake document with one mount object:

~~~js
function createRenderDocument() {
  const mount = { innerHTML: '' };
  return {
    mount,
    getElementById(id) {
      return id === 'app' ? mount : null;
    },
  };
}
~~~

Use an in-memory draft store and languageStorage so each test can create a named bill with Alex and Jamie, add a Dinner/晚餐 expense of 86, and inspect document.mount.innerHTML after each render. The fake document does not need event listeners because these tests exercise rendering, not browser bootstrapping.

- [ ] **Step 2: Write the failing translation and markup assertions.**

Cover these exact contracts:

1. Chinese translations return 今天, 消费了多少, Alex 付款, 全部参与, and 消费明细.
2. Chinese ledger markup contains one .ledger-headline with two separate spans whose text is 今天 and 消费了多少.
3. English ledger markup contains Today’s spending in one .ledger-headline span, plus Paid by Alex and Everyone in the expense row.
4. The expense row contains .expense-note, .expense-payer, .expense-split, and .expense-amount in that semantic order, with $86.00 in .expense-amount.
5. The ledger contains .total-card and a .button.primary add-expense action.
6. The result screen contains .collector-hero, .collector-avatar, .transfer-list, and .transfer-row after navigating to result.

Use assert.match against rendered HTML and assert.equal for exact translation strings. The test must fail against the current warm markup because the required keys and class hooks do not yet exist.

- [ ] **Step 3: Run the focused test and confirm the expected failure.**

Run:

~~~bash
node --test tests/web-visual-refresh.test.js
~~~

Expected result: FAIL on the first missing translation or visual markup assertion; no business test should be changed to make this test pass.

- [ ] **Step 4: Commit the test contract only when the focused test is demonstrably red.**

Do not commit implementation in this step. The next task supplies the minimum implementation needed to turn these assertions green.

## Task 2: Implement the approved bilingual render structures and interactions

**Files:**

- Modify: web/i18n.js
- Modify: web/app.js
- Modify: tests/web-visual-refresh.test.js

- [ ] **Step 1: Add the translation keys without changing unrelated wording.**

Add these keys in both zh and en dictionaries:

~~~text
ledger.eyebrow
ledger.headline
ledger.headlineZhTop
ledger.headlineZhBottom
ledger.expenseCount
ledger.paidByName
ledger.splitAll
result.collectorHint
result.peopleSummary
~~~

Use these approved values:

~~~text
zh:
  ledger.eyebrow: "{{count}} 人的账单"
  ledger.headline: "今天\n消费了多少"
  ledger.headlineZhTop: "今天"
  ledger.headlineZhBottom: "消费了多少"
  ledger.expenseCount: "{{count}} 笔"
  ledger.paidByName: "{{name}} 付款"
  ledger.splitAll: "全部参与"

en:
  ledger.eyebrow: "Bill for {{count}} people"
  ledger.headline: "Today’s spending"
  ledger.headlineZhTop: "Today’s"
  ledger.headlineZhBottom: "spending"
  ledger.expenseCount: "{{count}} item(s)"
  ledger.paidByName: "Paid by {{name}}"
  ledger.splitAll: "Everyone"
~~~

Use ledger.title as 消费明细 for Chinese and keep Expenses for English. Keep the existing error, confirmation, copy, and completion keys intact; update only the labels whose approved visual copy requires a new hierarchy.

- [ ] **Step 2: Replace the start-page count select with a touch-sized stepper while preserving form submission.**

Render a data-action="change-count" decrease button, an output data-count-value value, an increase button, and a hidden name="count" input initialized to 2. The decrease action clamps at 2; the increase action clamps at 20. submitStartForm continues to read form.elements.count.value, so the domain API receives the same numeric count as before. Keep the naming-mode radio inputs and names textarea, but render them as the approved segmented control and white setup card.

In handleClick, process change-count by finding the closest create-bill form, updating its hidden count value, and updating the output text without rerendering the whole form. This preserves a user’s partially entered names while changing the count.

- [ ] **Step 3: Render the ledger with the approved information hierarchy.**

Change renderLedger to produce this structure:

~~~html
<div class="ledger-topbar">
  <div>
    <p class="eyebrow">...</p>
    <h1 class="ledger-headline"><span>...</span><span>...</span></h1>
  </div>
  <button class="button primary" data-action="open-expense">＋ ...</button>
</div>
<section class="total-card">...</section>
<div class="section-heading expense-section-heading">...</div>
<div class="expense-list card">...</div>
~~~

For Chinese, render two headline spans from ledger.headlineZhTop and ledger.headlineZhBottom. For English, render only the ledger.headline span so it remains one line. Render each expense row as a two-column semantic layout:

~~~html
<article class="expense-row">
  <div class="expense-copy">
    <div class="expense-primary">
      <strong class="expense-note">晚餐</strong>
      <span class="expense-payer">Alex 付款</span>
    </div>
    <span class="expense-split">全部参与</span>
  </div>
  <strong class="expense-amount">$86.00</strong>
  <div class="row-actions">...</div>
</article>
~~~

Use the existing note fallback when no note is stored. Keep edit and delete data-action attributes and keep all displayed money routed through formatAmount.

- [ ] **Step 4: Render the editor as a mobile sheet-ready grouped form.**

Keep the existing data-action="save-expense", name="amount", name="payerId", name="splitMode", name="participantIds", and name="note" fields so submitExpenseForm remains compatible. Replace the payer select with a group of radio-backed .choice-chip labels. Render split-mode radios as a .segmented-control. Render selected participants as radio-hidden .choice-chip checkboxes. Preserve the editor’s existing add/edit initialization and validation behavior.

- [ ] **Step 5: Render the result page with the approved dark collector hero and transfer rows.**

Add a small deterministic avatar helper in web/app.js that returns the first user-visible character of a participant name. Render the selected collector in .collector-hero with .collector-avatar, .collector-hero-name, .collector-hero-amount, .collector-hero-meta, and the existing collector-choice buttons. Render transfer rows inside .transfer-list; each row must include a from avatar, the route from → to, auxiliary text, and the right-aligned dollar amount. Preserve existing collector eligibility, copy fallback, and finish confirmation behavior.

- [ ] **Step 6: Run the focused and full suites.**

Run:

~~~bash
node --test tests/web-visual-refresh.test.js
npm test
~~~

Expected result: the new render tests pass and all existing domain, service, workflow, app, and result tests remain green. If an existing test fails, adjust only the test fixture or presentation seam; do not alter settlement or money logic.

## Task 3: Replace the warm CSS with the approved responsive visual system

**Files:**

- Modify: web/styles.css
- Modify: index.html
- Modify: tests/web-visual-refresh.test.js

- [ ] **Step 1: Add failing static style assertions.**

Extend tests/web-visual-refresh.test.js to read web/styles.css and assert the presence of the approved hooks and constraints:

~~~text
--paper: #f5f5f7
--ink: #17191c
--accent: #1476f2
.total-card
.collector-hero
.expense-note
.expense-payer
.expense-split
.expense-amount
.overlay
@media
:focus-visible
min-height: 44px
~~~

Also assert that index.html uses #f5f5f7 for its theme color. Run the focused test before implementing the stylesheet and confirm it is red against the current warm values.

- [ ] **Step 2: Implement the visual tokens and mobile-first shell.**

Replace the current warm palette and decorative radial background with:

~~~css
:root {
  --ink: #17191c;
  --muted: #747b85;
  --paper: #f5f5f7;
  --card: #ffffff;
  --line: #e5e7eb;
  --accent: #1476f2;
  --accent-dark: #0d5fc9;
  --deep: #17191c;
  --soft-blue: #eef5ff;
}
~~~

Use a centered min(100%, 640px) app column, 16px mobile side padding, white cards with modest 16–24px radii, light shadows, stable line-height, and no external font. Keep all interactive controls at least 44px high and retain the existing visible :focus-visible outline.

- [ ] **Step 3: Style the ledger hierarchy and amount alignment.**

Make .ledger-headline compact and make only Chinese headline spans block-level; keep the English span inline/one line. Give .total-card a dark background and white amount. Make .expense-list.card a single white card with internal dividers. Use .expense-row grid columns minmax(0, 1fr) auto, .expense-note as the largest row text, .expense-payer smaller and muted, .expense-split on its own line, and .expense-amount right-aligned with white-space: nowrap. Keep row actions available without changing the left/right information order.

- [ ] **Step 4: Style start/editor/result states and responsive behavior.**

Style .segmented-control, .stepper, .choice-chip, .collector-hero, .collector-avatar, .transfer-list, .transfer-row, and .action-avatar using the same blue/white/deep palette. Set .overlay to align the .modal to the bottom edge on narrow screens with a rounded top sheet (border-radius: 24px 24px 0 0); at min-width 680px, center the modal and restore a full rounded card. Keep the form scrollable within 90vh and keep cancel/close controls visible.

- [ ] **Step 5: Update static metadata and run style tests.**

Change the meta[name="theme-color"] value in index.html to #f5f5f7, then run:

~~~bash
node --test tests/web-visual-refresh.test.js
npm test
~~~

Expected result: all style and render assertions pass, with no regression in the existing test suite.

## Task 4: Verify the candidate before committing the refresh

**Files:**

- Test: index.html, web/app.js, web/i18n.js, web/styles.css, tests/web-visual-refresh.test.js

- [ ] **Step 1: Run repository checks.**

Run:

~~~bash
npm test
git diff --check
rg -n -i 'wx:|wx\.|微信小程序|project\.config|touristappid' index.html web tests
~~~

Expected result: all tests pass, git diff --check is silent, and the Web files contain no WeChat runtime/config dependency. The existing public-repository docs may retain migration context, but the delivered Web source must stay browser-only.

- [ ] **Step 2: Perform the manual acceptance pass at two widths.**

Serve the repository root with python3 -m http.server 4173 and inspect it at a narrow mobile-like width and a desktop width. Check both languages for:

- start page count stepper, naming segmented control, and dark full-width start button;
- Chinese two-line title exactly 今天 then 消费了多少, and English one-line Today’s spending;
- expense row order: note and payer on the left, $ amount on the right, 全部参与/Everyone below;
- editor sheet on narrow screens and centered card on desktop;
- dark collector hero, avatars, transfer routes, copy fallback, and finish confirmation;
- visible keyboard focus, readable contrast, no clipped buttons, and no unexpected horizontal scrolling.

- [ ] **Step 3: Review the diff for scope and sensitive files.**

Run:

~~~bash
git status --short
git diff --stat
git diff --check
git ls-files | rg '(^|/)(project\.private\.config\.json|.*secret.*|.*token.*)$'
~~~

Expected result: only the four implementation files and the new visual regression test are changed by this refresh; no private config, token, or unrelated business file is added.

- [ ] **Step 4: Commit the completed visual refresh.**

After the automated and manual checks pass, create one intentional commit:

~~~bash
git add index.html web/app.js web/i18n.js web/styles.css tests/web-visual-refresh.test.js
git commit -m "feat: refresh web app visual design"
~~~

Then verify:

~~~bash
git status -sb
git show --stat --oneline HEAD
~~~

The branch should be clean and the commit should contain only the approved visual refresh.
