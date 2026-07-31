# 吃饭分账微信小程序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可在微信开发者工具中直接运行的原生小程序，支持字母或姓名参与人、多笔全员或指定人员分摊、主收款人统一结算、结果复制和本地草稿恢复。

**Architecture:** 页面只负责输入和展示；金额转换、参与人调整、分账、结算和分享文案均放在可由 Node.js 直接测试的 CommonJS 纯函数模块中。小程序不连接后端，当前账单通过同步本地存储保存，所有金额使用整数分。

**Tech Stack:** 微信原生小程序（WXML、WXSS、JavaScript）、Node.js 内置 `node:test`、CommonJS、微信本地存储与剪贴板 API。

---

## File map

### Application shell

- `app.js` — 小程序入口，不承载业务逻辑。
- `app.json` — 页面注册、全局导航栏和窗口配置。
- `app.wxss` — 石墨极简设计令牌与全局基础样式。
- `project.config.json` — 微信开发者工具项目配置，使用测试 AppID。
- `sitemap.json` — 页面索引规则。
- `package.json` — 仅定义 Node 测试命令，不引入运行时依赖。

### Domain and services

- `utils/money.js` — 元/分转换与格式化。
- `domain/participants.js` — 字母成员、姓名校验和已有账单成员调整。
- `services/settlement.js` — 账单校验、逐笔分币、成员净额与主收款人转账清单。
- `services/draft-store.js` — 本地草稿的版本化保存、读取和损坏数据降级。
- `services/share.js` — 从结算结果生成微信群可读文本。

### Pages and components

- `pages/start/*` — 新建账单、继续草稿、字母/姓名模式和已有账单成员编辑。
- `pages/ledger/*` — 单页账本、消费列表、实时汇总与结果入口。
- `components/expense-editor/*` — 新增/编辑消费的底部面板。
- `pages/result/*` — 主收款人、行动清单、收款人切换和复制结果。

### Tests

- `tests/project-structure.test.js` — 项目入口、页面和组件注册。
- `tests/money.test.js` — 金额输入与展示。
- `tests/participants.test.js` — 参与人创建、校验和调整。
- `tests/settlement.test.js` — 核心分账算法与守恒条件。
- `tests/draft-store.test.js` — 草稿保存、恢复、清理和损坏数据处理。
- `tests/share.test.js` — 结算文案。

---

### Task 1: Scaffold the native mini-program and test harness

**Files:**
- Create: `tests/project-structure.test.js`
- Create: `package.json`
- Create: `app.js`
- Create: `app.json`
- Create: `app.wxss`
- Create: `project.config.json`
- Create: `sitemap.json`
- Create: `pages/start/start.json`
- Create: `pages/ledger/ledger.json`
- Create: `pages/result/result.json`
- Create: `components/expense-editor/expense-editor.json`

- [ ] **Step 1: Write the failing project-structure test**

```js
// tests/project-structure.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('registers the three product pages', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.deepEqual(app.pages, [
    'pages/start/start',
    'pages/ledger/ledger',
    'pages/result/result',
  ]);
});

test('registers the expense editor on the ledger page', () => {
  const ledger = JSON.parse(
    fs.readFileSync(path.join(root, 'pages/ledger/ledger.json'), 'utf8'),
  );
  assert.equal(
    ledger.usingComponents['expense-editor'],
    '/components/expense-editor/expense-editor',
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/project-structure.test.js`

Expected: FAIL with `ENOENT` for `app.json`.

- [ ] **Step 3: Add the project shell**

```json
// package.json
{
  "name": "meal-split-mini-program",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "node --test tests/*.test.js"
  }
}
```

```js
// app.js
App({
  globalData: {},
});
```

```json
// app.json
{
  "pages": [
    "pages/start/start",
    "pages/ledger/ledger",
    "pages/result/result"
  ],
  "window": {
    "navigationBarBackgroundColor": "#F5F5F7",
    "navigationBarTextStyle": "black",
    "backgroundColor": "#F5F5F7",
    "backgroundTextStyle": "dark"
  },
  "sitemapLocation": "sitemap.json"
}
```

```css
/* app.wxss */
page {
  --ink: #17191c;
  --secondary: #747b85;
  --surface: #ffffff;
  --background: #f5f5f7;
  --line: #e7e9ed;
  --blue: #1476f2;
  --danger: #d94a4a;
  min-height: 100%;
  background: var(--background);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  font-size: 28rpx;
}

button::after { border: 0; }
.money { font-variant-numeric: tabular-nums; }
.page-shell { padding: 32rpx 32rpx calc(48rpx + env(safe-area-inset-bottom)); }
.card { background: var(--surface); border-radius: 32rpx; box-shadow: 0 8rpx 30rpx rgba(22, 29, 37, 0.05); }
.primary-button { background: var(--ink); color: #fff; border-radius: 26rpx; font-weight: 600; }
.secondary-text { color: var(--secondary); }
```

```json
// project.config.json
{
  "appid": "touristappid",
  "compileType": "miniprogram",
  "libVersion": "trial",
  "projectname": "meal-split-mini-program",
  "setting": {
    "es6": true,
    "enhance": true,
    "postcss": true,
    "minified": true
  }
}
```

```json
// sitemap.json
{
  "desc": "吃饭分账小程序页面索引配置",
  "rules": [{ "action": "disallow", "page": "*" }]
}
```

```json
// pages/start/start.json
{ "navigationBarTitleText": "开始分账" }
```

```json
// pages/ledger/ledger.json
{
  "navigationBarTitleText": "今天的账单",
  "usingComponents": {
    "expense-editor": "/components/expense-editor/expense-editor"
  }
}
```

```json
// pages/result/result.json
{ "navigationBarTitleText": "分账结果" }
```

```json
// components/expense-editor/expense-editor.json
{ "component": true }
```

- [ ] **Step 4: Run the structure test and verify GREEN**

Run: `node --test tests/project-structure.test.js`

Expected: 2 tests PASS.

- [ ] **Step 5: Commit the scaffold**

```bash
git add package.json app.js app.json app.wxss project.config.json sitemap.json pages components tests/project-structure.test.js
git commit -m "chore: scaffold meal split mini program"
```

---

### Task 2: Implement money and participant domain helpers

**Files:**
- Create: `tests/money.test.js`
- Create: `tests/participants.test.js`
- Create: `utils/money.js`
- Create: `domain/participants.js`

- [ ] **Step 1: Write failing money tests**

```js
// tests/money.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseYuanToCents, formatCents } = require('../utils/money');

test('parses valid yuan input into integer cents', () => {
  assert.equal(parseYuanToCents('390'), 39000);
  assert.equal(parseYuanToCents('60.5'), 6050);
  assert.equal(parseYuanToCents('0.01'), 1);
});

test('rejects invalid or non-positive input', () => {
  for (const value of ['', '0', '-1', '1.234', 'abc']) {
    assert.equal(parseYuanToCents(value), null);
  }
});

test('formats cents with two decimal places', () => {
  assert.equal(formatCents(1), '0.01');
  assert.equal(formatCents(9160), '91.60');
});
```

- [ ] **Step 2: Run money tests and verify RED**

Run: `node --test tests/money.test.js`

Expected: FAIL with `Cannot find module '../utils/money'`.

- [ ] **Step 3: Implement money helpers**

```js
// utils/money.js
function parseYuanToCents(value) {
  const normalized = String(value ?? '').trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [yuan, decimal = ''] = normalized.split('.');
  const cents = Number(yuan) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function formatCents(cents) {
  if (!Number.isSafeInteger(cents)) throw new TypeError('cents must be an integer');
  return (cents / 100).toFixed(2);
}

module.exports = { parseYuanToCents, formatCents };
```

- [ ] **Step 4: Run money tests and verify GREEN**

Run: `node --test tests/money.test.js`

Expected: 3 tests PASS.

- [ ] **Step 5: Write failing participant tests**

```js
// tests/participants.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createLetterParticipants,
  createNamedParticipants,
  reconcileParticipants,
} = require('../domain/participants');

test('creates sequential letter participants', () => {
  assert.deepEqual(createLetterParticipants(5).map((item) => item.displayName), [
    'A', 'B', 'C', 'D', 'E',
  ]);
});

test('rejects empty and duplicate custom names', () => {
  assert.throws(() => createNamedParticipants(['盖老师', '']), /姓名不能为空/);
  assert.throws(() => createNamedParticipants(['小李', '小李']), /姓名不能重复/);
});

test('preserves ids while renaming and adds ids for new members', () => {
  const bill = {
    participantMode: 'names',
    participants: [{ id: 'p1', displayName: 'A' }, { id: 'p2', displayName: 'B' }],
    expenses: [],
  };
  const next = reconcileParticipants(bill, ['盖老师', '小李', '老王']);
  assert.deepEqual(next.participants, [
    { id: 'p1', displayName: '盖老师' },
    { id: 'p2', displayName: '小李' },
    { id: 'p3', displayName: '老王' },
  ]);
});

test('prevents removing a participant who paid an expense', () => {
  const bill = {
    participantMode: 'letters',
    participants: [{ id: 'p1', displayName: 'A' }, { id: 'p2', displayName: 'B' }, { id: 'p3', displayName: 'C' }],
    expenses: [{ id: 'e1', amountCents: 1000, payerId: 'p3', splitMode: 'all', participantIds: [] }],
  };
  assert.throws(() => reconcileParticipants(bill, ['A', 'B']), /先修改 C 付款的消费/);
});
```

- [ ] **Step 6: Run participant tests and verify RED**

Run: `node --test tests/participants.test.js`

Expected: FAIL with `Cannot find module '../domain/participants'`.

- [ ] **Step 7: Implement participant helpers**

```js
// domain/participants.js
function validateCount(count) {
  if (!Number.isInteger(count) || count < 2 || count > 20) {
    throw new Error('参与人数必须为 2–20 人');
  }
}

function createLetterParticipants(count) {
  validateCount(count);
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    displayName: String.fromCharCode(65 + index),
  }));
}

function createNamedParticipants(names) {
  validateCount(names.length);
  const normalized = names.map((name) => String(name).trim());
  if (normalized.some((name) => !name)) throw new Error('姓名不能为空');
  if (new Set(normalized).size !== normalized.length) throw new Error('姓名不能重复');
  return normalized.map((displayName, index) => ({ id: `p${index + 1}`, displayName }));
}

function reconcileParticipants(bill, names) {
  const checked = createNamedParticipants(names);
  const old = bill.participants;
  const nextParticipants = checked.map((participant, index) => ({
    id: old[index]?.id || participant.id,
    displayName: participant.displayName,
  }));
  const nextIds = new Set(nextParticipants.map((item) => item.id));
  const removed = old.filter((item) => !nextIds.has(item.id));
  for (const participant of removed) {
    if (bill.expenses.some((expense) => expense.payerId === participant.id)) {
      throw new Error(`请先修改 ${participant.displayName} 付款的消费`);
    }
  }
  const expenses = bill.expenses.map((expense) => {
    if (expense.splitMode === 'all') return expense;
    const participantIds = expense.participantIds.filter((id) => nextIds.has(id));
    if (!participantIds.length) throw new Error('修改成员后有消费无人承担');
    return { ...expense, participantIds };
  });
  return { ...bill, participants: nextParticipants, expenses };
}

module.exports = {
  createLetterParticipants,
  createNamedParticipants,
  reconcileParticipants,
};
```

- [ ] **Step 8: Run domain tests and commit**

Run: `node --test tests/money.test.js tests/participants.test.js`

Expected: 7 tests PASS.

```bash
git add utils domain tests/money.test.js tests/participants.test.js
git commit -m "feat: add money and participant domain helpers"
```

---

### Task 3: Build the settlement engine with the confirmed examples

**Files:**
- Create: `tests/settlement.test.js`
- Create: `services/settlement.js`

- [ ] **Step 1: Write failing settlement tests**

```js
// tests/settlement.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSettlement } = require('../services/settlement');

const people = ['A', 'B', 'C', 'D', 'E'].map((displayName, index) => ({
  id: `p${index + 1}`,
  displayName,
}));

test('calculates confirmed meal and private drink example', () => {
  const result = calculateSettlement({
    participants: people,
    expenses: [
      { id: 'e1', amountCents: 39800, payerId: 'p1', splitMode: 'all', participantIds: [] },
      { id: 'e2', amountCents: 6000, payerId: 'p2', splitMode: 'all', participantIds: [] },
      { id: 'e3', amountCents: 1000, payerId: 'p2', splitMode: 'selected', participantIds: ['p3'] },
    ],
  });
  assert.equal(result.totalCents, 46800);
  assert.equal(result.collectorId, 'p1');
  assert.deepEqual(result.transfers, [
    { fromId: 'p2', toId: 'p1', amountCents: 2160 },
    { fromId: 'p3', toId: 'p1', amountCents: 10160 },
    { fromId: 'p4', toId: 'p1', amountCents: 9160 },
    { fromId: 'p5', toId: 'p1', amountCents: 9160 },
  ]);
});

test('calculates confirmed taxi subset and deterministic cents', () => {
  const result = calculateSettlement({
    participants: people,
    expenses: [
      { id: 'e1', amountCents: 39000, payerId: 'p1', splitMode: 'all', participantIds: [] },
      { id: 'e2', amountCents: 6000, payerId: 'p2', splitMode: 'all', participantIds: [] },
      { id: 'e3', amountCents: 5000, payerId: 'p3', splitMode: 'selected', participantIds: ['p1', 'p2', 'p3'] },
    ],
  });
  assert.deepEqual(result.members.map((item) => item.owedCents), [10667, 10667, 10666, 9000, 9000]);
  assert.deepEqual(result.transfers, [
    { fromId: 'p2', toId: 'p1', amountCents: 4667 },
    { fromId: 'p3', toId: 'p1', amountCents: 5666 },
    { fromId: 'p4', toId: 'p1', amountCents: 9000 },
    { fromId: 'p5', toId: 'p1', amountCents: 9000 },
  ]);
});

test('routes another creditors receivable through the collector', () => {
  const result = calculateSettlement({
    participants: people.slice(0, 3),
    expenses: [
      { id: 'e1', amountCents: 9000, payerId: 'p1', splitMode: 'all', participantIds: [] },
      { id: 'e2', amountCents: 6000, payerId: 'p2', splitMode: 'all', participantIds: [] },
    ],
  });
  assert.deepEqual(result.transfers, [
    { fromId: 'p1', toId: 'p2', amountCents: 1000 },
    { fromId: 'p3', toId: 'p1', amountCents: 5000 },
  ]);
});

test('preserves settlement invariants', () => {
  const result = calculateSettlement({
    participants: people.slice(0, 3),
    expenses: [{ id: 'e1', amountCents: 5000, payerId: 'p3', splitMode: 'all', participantIds: [] }],
  });
  assert.equal(result.members.reduce((sum, item) => sum + item.owedCents, 0), result.totalCents);
  assert.equal(result.members.reduce((sum, item) => sum + item.netCents, 0), 0);
});
```

- [ ] **Step 2: Run settlement tests and verify RED**

Run: `node --test tests/settlement.test.js`

Expected: FAIL with `Cannot find module '../services/settlement'`.

- [ ] **Step 3: Implement the settlement engine**

```js
// services/settlement.js
function assertBill(bill) {
  if (!bill || !Array.isArray(bill.participants) || bill.participants.length < 2 || bill.participants.length > 20) {
    throw new Error('参与人数必须为 2–20 人');
  }
  if (!Array.isArray(bill.expenses)) throw new Error('消费记录无效');
  const ids = new Set(bill.participants.map((item) => item.id));
  if (ids.size !== bill.participants.length) throw new Error('参与人 ID 重复');
  const names = bill.participants.map((item) => String(item.displayName || '').trim());
  if (names.some((name) => !name)) throw new Error('参与人姓名为空');
  if (new Set(names).size !== names.length) throw new Error('参与人姓名重复');
  for (const expense of bill.expenses) {
    if (!Number.isSafeInteger(expense.amountCents) || expense.amountCents <= 0) throw new Error('消费金额无效');
    if (!ids.has(expense.payerId)) throw new Error('付款人无效');
    if (expense.splitMode !== 'all' && expense.splitMode !== 'selected') throw new Error('承担方式无效');
    if (expense.splitMode === 'selected') {
      if (!Array.isArray(expense.participantIds) || !expense.participantIds.length) throw new Error('至少选择一位承担人');
      if (expense.participantIds.some((id) => !ids.has(id))) throw new Error('承担人无效');
    }
  }
}

function calculateSettlement(bill, requestedCollectorId) {
  assertBill(bill);
  const order = new Map(bill.participants.map((item, index) => [item.id, index]));
  const paid = new Map(bill.participants.map((item) => [item.id, 0]));
  const owed = new Map(bill.participants.map((item) => [item.id, 0]));
  let totalCents = 0;

  for (const expense of bill.expenses) {
    totalCents += expense.amountCents;
    paid.set(expense.payerId, paid.get(expense.payerId) + expense.amountCents);
    const selected = expense.splitMode === 'all'
      ? bill.participants.map((item) => item.id)
      : bill.participants.map((item) => item.id).filter((id) => expense.participantIds.includes(id));
    const base = Math.floor(expense.amountCents / selected.length);
    const remainder = expense.amountCents % selected.length;
    selected.forEach((id, index) => owed.set(id, owed.get(id) + base + (index < remainder ? 1 : 0)));
  }

  const members = bill.participants.map((participant) => ({
    ...participant,
    paidCents: paid.get(participant.id),
    owedCents: owed.get(participant.id),
    netCents: paid.get(participant.id) - owed.get(participant.id),
  }));
  const positive = members.filter((item) => item.netCents > 0);
  let collector = positive.find((item) => item.id === requestedCollectorId);
  if (!collector) {
    collector = positive.sort((a, b) => b.paidCents - a.paidCents || order.get(a.id) - order.get(b.id))[0];
  }
  const collectorId = collector?.id || null;
  const transfers = [];
  if (collectorId) {
    for (const member of members) {
      if (member.id === collectorId || member.netCents === 0) continue;
      transfers.push(member.netCents < 0
        ? { fromId: member.id, toId: collectorId, amountCents: -member.netCents }
        : { fromId: collectorId, toId: member.id, amountCents: member.netCents });
    }
  }
  return {
    totalCents,
    collectorId,
    collectorAmountCents: collector?.netCents || 0,
    members,
    transfers,
  };
}

module.exports = { assertBill, calculateSettlement };
```

- [ ] **Step 4: Run settlement tests and verify GREEN**

Run: `node --test tests/settlement.test.js`

Expected: 4 tests PASS.

- [ ] **Step 5: Run all tests and commit**

Run: `npm test`

Expected: all current tests PASS.

```bash
git add services/settlement.js tests/settlement.test.js
git commit -m "feat: implement exact settlement engine"
```

---

### Task 4: Add versioned local drafts and share text

**Files:**
- Create: `tests/draft-store.test.js`
- Create: `tests/share.test.js`
- Create: `services/draft-store.js`
- Create: `services/share.js`

- [ ] **Step 1: Write failing draft-store tests**

```js
// tests/draft-store.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDraftStore, STORAGE_KEY } = require('../services/draft-store');

function memoryStorage() {
  const values = new Map();
  return {
    getStorageSync: (key) => values.get(key),
    setStorageSync: (key, value) => values.set(key, value),
    removeStorageSync: (key) => values.delete(key),
  };
}

test('saves, loads, and clears a versioned draft', () => {
  const store = createDraftStore(memoryStorage());
  const bill = { participants: [{ id: 'p1', displayName: 'A' }, { id: 'p2', displayName: 'B' }], expenses: [] };
  store.save(bill);
  assert.deepEqual(store.load(), bill);
  store.clear();
  assert.equal(store.load(), null);
});

test('drops corrupt and incompatible drafts', () => {
  const storage = memoryStorage();
  storage.setStorageSync(STORAGE_KEY, { version: 999, bill: {} });
  assert.equal(createDraftStore(storage).load(), null);
  storage.setStorageSync(STORAGE_KEY, { version: 1, bill: { participants: [] } });
  assert.equal(createDraftStore(storage).load(), null);
});
```

- [ ] **Step 2: Run draft-store tests and verify RED**

Run: `node --test tests/draft-store.test.js`

Expected: FAIL with `Cannot find module '../services/draft-store'`.

- [ ] **Step 3: Implement the draft store**

```js
// services/draft-store.js
const { assertBill } = require('./settlement');

const STORAGE_KEY = 'meal_split_draft';
const VERSION = 1;

function hasDraftShape(bill) {
  try {
    assertBill(bill);
    return true;
  } catch (_error) {
    return false;
  }
}

function createDraftStore(storage) {
  return {
    save(bill) {
      if (!hasDraftShape(bill)) throw new Error('账单草稿无效');
      storage.setStorageSync(STORAGE_KEY, { version: VERSION, bill });
    },
    load() {
      try {
        const envelope = storage.getStorageSync(STORAGE_KEY);
        if (!envelope || envelope.version !== VERSION || !hasDraftShape(envelope.bill)) return null;
        return envelope.bill;
      } catch (_error) {
        return null;
      }
    },
    clear() {
      storage.removeStorageSync(STORAGE_KEY);
    },
  };
}

module.exports = { STORAGE_KEY, createDraftStore };
```

- [ ] **Step 4: Run draft-store tests and verify GREEN**

Run: `node --test tests/draft-store.test.js`

Expected: 2 tests PASS.

- [ ] **Step 5: Write failing share-text test**

```js
// tests/share.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildShareText } = require('../services/share');

test('builds a concise group-chat settlement message', () => {
  const result = {
    totalCents: 46800,
    collectorId: 'p1',
    collectorAmountCents: 30640,
    members: [
      { id: 'p1', displayName: 'A' },
      { id: 'p2', displayName: 'B' },
      { id: 'p3', displayName: 'C' },
    ],
    transfers: [
      { fromId: 'p2', toId: 'p1', amountCents: 2160 },
      { fromId: 'p3', toId: 'p1', amountCents: 10160 },
    ],
  };
  assert.equal(buildShareText(result), [
    '【吃饭分账】总消费 ¥468.00',
    '主收款人 A 应收 ¥306.40',
    '',
    'B → A：¥21.60',
    'C → A：¥101.60',
  ].join('\n'));
});
```

- [ ] **Step 6: Run share test and verify RED**

Run: `node --test tests/share.test.js`

Expected: FAIL with `Cannot find module '../services/share'`.

- [ ] **Step 7: Implement share text and commit**

```js
// services/share.js
const { formatCents } = require('../utils/money');

function buildShareText(result) {
  const names = new Map(result.members.map((item) => [item.id, item.displayName]));
  if (!result.collectorId) return `【吃饭分账】总消费 ¥${formatCents(result.totalCents)}\n大家已经结清，无需转账`;
  return [
    `【吃饭分账】总消费 ¥${formatCents(result.totalCents)}`,
    `主收款人 ${names.get(result.collectorId)} 应收 ¥${formatCents(result.collectorAmountCents)}`,
    '',
    ...result.transfers.map((transfer) =>
      `${names.get(transfer.fromId)} → ${names.get(transfer.toId)}：¥${formatCents(transfer.amountCents)}`),
  ].join('\n');
}

module.exports = { buildShareText };
```

Run: `node --test tests/draft-store.test.js tests/share.test.js`

Expected: 3 tests PASS.

```bash
git add services/draft-store.js services/share.js tests/draft-store.test.js tests/share.test.js
git commit -m "feat: add local drafts and share text"
```

---

### Task 5: Build the participant start page

**Files:**
- Create: `pages/start/start.js`
- Create: `pages/start/start.wxml`
- Create: `pages/start/start.wxss`
- Modify: `tests/participants.test.js`
- Modify: `domain/participants.js`

- [ ] **Step 1: Add a failing bill-creation test**

Append to `tests/participants.test.js`:

```js
const { createBill } = require('../domain/participants');

test('creates a clean bill in either participant mode', () => {
  const bill = createBill('names', ['盖老师', '小李']);
  assert.equal(bill.participantMode, 'names');
  assert.deepEqual(bill.participants.map((item) => item.displayName), ['盖老师', '小李']);
  assert.deepEqual(bill.expenses, []);
  assert.equal(bill.collectorId, null);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/participants.test.js`

Expected: FAIL because `createBill` is not a function.

- [ ] **Step 3: Add `createBill` to the participant module**

Add before `module.exports` in `domain/participants.js`:

```js
function createBill(mode, input) {
  const participants = mode === 'letters'
    ? createLetterParticipants(input)
    : createNamedParticipants(input);
  return {
    id: 'local-draft',
    participantMode: mode,
    participants,
    expenses: [],
    collectorId: null,
    updatedAt: Date.now(),
  };
}
```

Add `createBill` to `module.exports`.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test tests/participants.test.js`

Expected: 5 tests PASS.

- [ ] **Step 5: Implement start-page state and actions**

```js
// pages/start/start.js
const {
  createBill,
  reconcileParticipants,
} = require('../../domain/participants');
const { createDraftStore } = require('../../services/draft-store');

const store = createDraftStore(wx);
const LETTERS = 'ABCDEFGHIJKLMNOPQRST'.split('');

Page({
  data: {
    mode: 'letters',
    count: 5,
    letters: LETTERS.slice(0, 5),
    names: ['', '', '', '', ''],
    hasDraft: false,
    editing: false,
    error: '',
  },

  onLoad(options) {
    const draft = store.load();
    if (options.edit === '1' && draft) {
      this.setData({
        editing: true,
        mode: draft.participantMode,
        count: draft.participants.length,
        letters: LETTERS.slice(0, draft.participants.length),
        names: draft.participants.map((item) => item.displayName),
      });
    } else {
      this.setData({ hasDraft: Boolean(draft) });
    }
  },

  chooseMode(event) {
    this.setData({ mode: event.currentTarget.dataset.mode, error: '' });
  },

  changeCount(event) {
    const next = Math.min(20, Math.max(2, this.data.count + Number(event.currentTarget.dataset.delta)));
    const names = [...this.data.names];
    while (names.length < next) names.push('');
    this.setData({
      count: next,
      letters: LETTERS.slice(0, next),
      names: names.slice(0, next),
      error: '',
    });
  },

  editName(event) {
    const names = [...this.data.names];
    names[Number(event.currentTarget.dataset.index)] = event.detail.value;
    this.setData({ names, error: '' });
  },

  continueDraft() {
    wx.navigateTo({ url: '/pages/ledger/ledger' });
  },

  submit() {
    try {
      const input = this.data.mode === 'letters'
        ? this.data.count
        : this.data.names.slice(0, this.data.count);
      const old = this.data.editing ? store.load() : null;
      const bill = old
        ? { ...reconcileParticipants(old, this.data.mode === 'letters'
          ? Array.from({ length: this.data.count }, (_, index) => String.fromCharCode(65 + index))
          : input), participantMode: this.data.mode, updatedAt: Date.now() }
        : createBill(this.data.mode, input);
      store.save(bill);
      if (this.data.editing) wx.navigateBack();
      else wx.navigateTo({ url: '/pages/ledger/ledger' });
    } catch (error) {
      this.setData({ error: error.message });
    }
  },
});
```

- [ ] **Step 6: Implement the start-page view**

```xml
<!-- pages/start/start.wxml -->
<view class="page-shell start-page">
  <view class="draft-card card" wx:if="{{hasDraft && !editing}}">
    <view><text class="draft-title">上次的账单还在</text><text class="draft-copy">继续完成，或在下方开始新账单</text></view>
    <button class="continue" bindtap="continueDraft">继续</button>
  </view>
  <text class="eyebrow">{{editing ? '调整参与人' : '开始新账单'}}</text>
  <view class="headline">{{mode === 'letters' ? '今天几个人吃饭？' : '添加今天的饭搭子'}}</view>
  <view class="segment">
    <button class="segment-item {{mode === 'letters' ? 'active' : ''}}" data-mode="letters" bindtap="chooseMode">快速字母</button>
    <button class="segment-item {{mode === 'names' ? 'active' : ''}}" data-mode="names" bindtap="chooseMode">输入姓名</button>
  </view>
  <view class="card members-card" wx:if="{{mode === 'letters'}}">
    <view class="member-head"><text>参与人数</text><view class="counter"><button data-delta="-1" bindtap="changeCount">−</button><text>{{count}}</text><button data-delta="1" bindtap="changeCount">＋</button></view></view>
    <view class="letter-list"><view class="letter" wx:for="{{letters}}" wx:key="*this">{{item}}</view></view>
  </view>
  <view class="card names-card" wx:else>
    <view class="name-row" wx:for="{{names}}" wx:key="index">
      <text class="name-index">{{index + 1}}</text>
      <input value="{{item}}" maxlength="12" placeholder="输入姓名" data-index="{{index}}" bindinput="editName" />
    </view>
    <view class="counter name-counter"><button data-delta="-1" bindtap="changeCount">删除一位</button><text>{{count}} 人</text><button data-delta="1" bindtap="changeCount">添加一位</button></view>
  </view>
  <text class="error" wx:if="{{error}}">{{error}}</text>
  <button class="primary-button submit" bindtap="submit">{{editing ? '保存参与人' : '开始记账'}}</button>
</view>
```

```css
/* pages/start/start.wxss */
.start-page { max-width: 720rpx; margin: 0 auto; }
.draft-card { display: flex; align-items: center; justify-content: space-between; padding: 28rpx; margin-bottom: 48rpx; }
.draft-title, .draft-copy { display: block; }
.draft-title { font-weight: 600; }
.draft-copy, .eyebrow { color: var(--secondary); font-size: 24rpx; }
.continue { margin: 0; color: var(--blue); background: transparent; font-size: 26rpx; }
.headline { margin: 8rpx 0 36rpx; font-size: 54rpx; line-height: 1.16; font-weight: 650; letter-spacing: -1rpx; }
.segment { display: grid; grid-template-columns: 1fr 1fr; padding: 6rpx; margin-bottom: 32rpx; border-radius: 24rpx; background: #e9ebef; }
.segment-item { background: transparent; color: var(--secondary); border-radius: 19rpx; font-size: 26rpx; }
.segment-item.active { background: #fff; color: var(--ink); box-shadow: 0 2rpx 10rpx rgba(22,29,37,.1); }
.members-card, .names-card { padding: 32rpx; }
.member-head, .counter { display: flex; align-items: center; justify-content: space-between; }
.counter { gap: 20rpx; }
.counter button { margin: 0; padding: 0 20rpx; min-width: 64rpx; background: #f0f2f5; color: var(--blue); font-size: 28rpx; }
.letter-list { display: flex; flex-wrap: wrap; gap: 18rpx; padding-top: 28rpx; margin-top: 26rpx; border-top: 1rpx solid var(--line); }
.letter, .name-index { display: flex; align-items: center; justify-content: center; width: 76rpx; height: 76rpx; border-radius: 50%; background: var(--ink); color: #fff; font-weight: 600; }
.name-row { display: grid; grid-template-columns: 58rpx 1fr; gap: 18rpx; align-items: center; padding: 14rpx 0; border-bottom: 1rpx solid var(--line); }
.name-index { width: 54rpx; height: 54rpx; background: #eff1f4; color: var(--ink); font-size: 22rpx; }
.name-row input { padding: 20rpx; border-radius: 20rpx; background: #f4f5f7; }
.name-counter { margin-top: 24rpx; }
.error { display: block; margin-top: 20rpx; color: var(--danger); }
.submit { margin-top: 36rpx; padding: 24rpx; }
```

- [ ] **Step 7: Verify the page manually and commit**

Run: `npm test`

Expected: all tests PASS.

Open the project in微信开发者工具 and verify:

1. Default view shows five letter chips.
2. Counter stops at 2 and 20.
3. Name mode rejects blank and duplicate names.
4. A saved draft exposes the continue card.
5. Editing participants preserves existing IDs and blocks removal of a payer.

```bash
git add domain/participants.js tests/participants.test.js pages/start
git commit -m "feat: add participant setup flow"
```

---

### Task 6: Build expense editing and the single-page ledger

**Files:**
- Create: `components/expense-editor/expense-editor.js`
- Create: `components/expense-editor/expense-editor.wxml`
- Create: `components/expense-editor/expense-editor.wxss`
- Create: `pages/ledger/ledger.js`
- Create: `pages/ledger/ledger.wxml`
- Create: `pages/ledger/ledger.wxss`

- [ ] **Step 1: Implement the expense editor behavior**

```js
// components/expense-editor/expense-editor.js
const { parseYuanToCents } = require('../../utils/money');

Component({
  properties: {
    visible: { type: Boolean, value: false },
    participants: { type: Array, value: [] },
    value: { type: Object, value: null },
  },
  data: {
    amount: '', note: '', payerId: '', splitMode: 'all', selectedIds: [], viewParticipants: [], error: '',
  },
  observers: {
    'visible,value,participants': function sync(visible, value, participants) {
      if (!visible) return;
      const selectedIds = value?.participantIds || participants.map((item) => item.id);
      this.setData({
        amount: value?.amountInput || '',
        note: value?.note || '',
        payerId: value?.payerId || participants[0]?.id || '',
        splitMode: value?.splitMode || 'all',
        selectedIds,
        viewParticipants: participants.map((item) => ({ ...item, selected: selectedIds.includes(item.id) })),
        error: '',
      });
    },
  },
  methods: {
    noop() {},
    close() { this.triggerEvent('close'); },
    inputAmount(event) { this.setData({ amount: event.detail.value, error: '' }); },
    inputNote(event) { this.setData({ note: event.detail.value }); },
    choosePayer(event) { this.setData({ payerId: event.currentTarget.dataset.id, error: '' }); },
    chooseMode(event) {
      const splitMode = event.currentTarget.dataset.mode;
      const selectedIds = splitMode === 'all'
        ? this.data.participants.map((item) => item.id)
        : this.data.selectedIds;
      this.setData({
        splitMode,
        selectedIds,
        viewParticipants: this.data.participants.map((item) => ({ ...item, selected: selectedIds.includes(item.id) })),
        error: '',
      });
    },
    toggleParticipant(event) {
      const id = event.currentTarget.dataset.id;
      const selectedIds = this.data.selectedIds.includes(id)
        ? this.data.selectedIds.filter((item) => item !== id)
        : [...this.data.selectedIds, id];
      this.setData({
        selectedIds,
        viewParticipants: this.data.participants.map((item) => ({ ...item, selected: selectedIds.includes(item.id) })),
        error: '',
      });
    },
    submit() {
      const amountCents = parseYuanToCents(this.data.amount);
      if (!amountCents) return this.setData({ error: '请输入正确金额，最多两位小数' });
      if (!this.data.payerId) return this.setData({ error: '请选择付款人' });
      if (this.data.splitMode === 'selected' && !this.data.selectedIds.length) {
        return this.setData({ error: '至少选择一位承担人' });
      }
      this.triggerEvent('save', {
        id: this.data.value?.id || `e${Date.now()}`,
        amountCents,
        payerId: this.data.payerId,
        splitMode: this.data.splitMode,
        participantIds: this.data.splitMode === 'all' ? [] : this.data.selectedIds,
        note: this.data.note.trim(),
      });
    },
  },
});
```

- [ ] **Step 2: Implement the expense editor view**

```xml
<!-- components/expense-editor/expense-editor.wxml -->
<view class="mask" wx:if="{{visible}}" bindtap="close">
  <view class="sheet" catchtap="noop">
    <view class="handle"></view>
    <view class="sheet-head"><text class="sheet-title">{{value ? '编辑消费' : '记一笔'}}</text><button bindtap="close">取消</button></view>
    <text class="label">金额</text>
    <view class="amount-field"><text>¥</text><input type="digit" focus value="{{amount}}" placeholder="0.00" bindinput="inputAmount" /></view>
    <text class="label">谁付的钱？</text>
    <view class="chips"><button wx:for="{{participants}}" wx:key="id" data-id="{{item.id}}" class="chip {{payerId === item.id ? 'active' : ''}}" bindtap="choosePayer">{{item.displayName}}</button></view>
    <text class="label">谁来承担？</text>
    <view class="segment"><button class="{{splitMode === 'all' ? 'active' : ''}}" data-mode="all" bindtap="chooseMode">全员均摊</button><button class="{{splitMode === 'selected' ? 'active' : ''}}" data-mode="selected" bindtap="chooseMode">指定人员</button></view>
    <view class="chips" wx:if="{{splitMode === 'selected'}}"><button wx:for="{{viewParticipants}}" wx:key="id" data-id="{{item.id}}" class="chip {{item.selected ? 'active' : ''}}" bindtap="toggleParticipant"><text class="participant-name">{{item.displayName}}</text><text class="selected-mark" wx:if="{{item.selected}}">✓</text></button></view>
    <text class="label">备注（可选）</text>
    <input class="note" value="{{note}}" maxlength="30" placeholder="例如：平台套餐、C 的饮料" bindinput="inputNote" />
    <text class="error" wx:if="{{error}}">{{error}}</text>
    <button class="save" bindtap="submit">保存这笔消费</button>
  </view>
</view>
```

```css
/* components/expense-editor/expense-editor.wxss */
.mask { position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-end; background: rgba(0,0,0,.28); }
.sheet { box-sizing: border-box; width: 100%; max-height: 92vh; overflow-y: auto; padding: 16rpx 32rpx calc(36rpx + env(safe-area-inset-bottom)); border-radius: 40rpx 40rpx 0 0; background: #fbfbfc; }
.handle { width: 72rpx; height: 8rpx; margin: 0 auto 24rpx; border-radius: 8rpx; background: #c9cdd3; }
.sheet-head { display: flex; justify-content: space-between; align-items: center; }
.sheet-title { font-size: 38rpx; font-weight: 650; }
.sheet-head button { margin: 0; background: transparent; color: #1476f2; font-size: 26rpx; }
.label { display: block; margin: 30rpx 0 14rpx; color: #747b85; font-size: 24rpx; }
.amount-field { display: flex; align-items: center; padding: 24rpx; border-radius: 26rpx; background: #fff; }
.amount-field text { font-size: 38rpx; }
.amount-field input { flex: 1; margin-left: 12rpx; font-size: 48rpx; font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 14rpx; }
.chip { display: flex; gap: 8rpx; align-items: center; margin: 0; padding: 14rpx 22rpx; background: #eef0f3; color: #17191c; border-radius: 999rpx; font-size: 25rpx; }
.chip.active { background: #17191c; color: #fff; }
.segment { display: grid; grid-template-columns: 1fr 1fr; gap: 6rpx; padding: 6rpx; border-radius: 22rpx; background: #e9ebef; }
.segment button { background: transparent; color: #747b85; font-size: 25rpx; }
.segment button.active { background: #fff; color: #17191c; border-radius: 18rpx; }
.note { padding: 24rpx; border-radius: 24rpx; background: #fff; }
.error { display: block; margin-top: 20rpx; color: #d94a4a; }
.save { margin-top: 32rpx; padding: 24rpx; border-radius: 26rpx; background: #17191c; color: #fff; font-weight: 600; }
```

- [ ] **Step 3: Implement ledger state and persistence**

```js
// pages/ledger/ledger.js
const { formatCents } = require('../../utils/money');
const { calculateSettlement } = require('../../services/settlement');
const { createDraftStore } = require('../../services/draft-store');

const store = createDraftStore(wx);

Page({
  data: {
    bill: null,
    expenses: [],
    total: '0.00',
    collectorName: '',
    collectorInitial: '',
    collectorAmount: '0.00',
    editorVisible: false,
    editingExpense: null,
  },
  onShow() {
    const bill = store.load();
    if (!bill) return wx.reLaunch({ url: '/pages/start/start' });
    this.refresh(bill);
  },
  refresh(bill) {
    const names = new Map(bill.participants.map((item) => [item.id, item.displayName]));
    const result = calculateSettlement(bill, bill.collectorId);
    const expenses = bill.expenses.map((expense) => ({
      ...expense,
      amountInput: formatCents(expense.amountCents),
      amountText: formatCents(expense.amountCents),
      title: expense.note || '未命名消费',
      detail: `${names.get(expense.payerId)} 付款 · ${expense.splitMode === 'all'
        ? '全员均摊'
        : expense.participantIds.map((id) => names.get(id)).join('、') + ' 承担'}`,
    }));
    this.setData({
      bill,
      expenses,
      total: formatCents(result.totalCents),
      collectorName: names.get(result.collectorId) || '',
      collectorInitial: (names.get(result.collectorId) || '').slice(0, 1),
      collectorAmount: formatCents(result.collectorAmountCents),
    });
  },
  openNew() { this.setData({ editorVisible: true, editingExpense: null }); },
  openEdit(event) {
    const expense = this.data.expenses.find((item) => item.id === event.currentTarget.dataset.id);
    this.setData({ editorVisible: true, editingExpense: expense });
  },
  closeEditor() { this.setData({ editorVisible: false, editingExpense: null }); },
  saveExpense(event) {
    const expense = event.detail;
    const exists = this.data.bill.expenses.some((item) => item.id === expense.id);
    const expenses = exists
      ? this.data.bill.expenses.map((item) => item.id === expense.id ? expense : item)
      : [...this.data.bill.expenses, expense];
    const bill = { ...this.data.bill, expenses, updatedAt: Date.now() };
    store.save(bill);
    this.closeEditor();
    this.refresh(bill);
  },
  deleteExpense(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: '删除这笔消费？',
      content: '删除后会立即重新计算。',
      success: ({ confirm }) => {
        if (!confirm) return;
        const bill = { ...this.data.bill, expenses: this.data.bill.expenses.filter((item) => item.id !== id), updatedAt: Date.now() };
        store.save(bill);
        this.refresh(bill);
      },
    });
  },
  editParticipants() { wx.navigateTo({ url: '/pages/start/start?edit=1' }); },
  showResult() {
    if (!this.data.bill.expenses.length) return;
    wx.navigateTo({ url: '/pages/result/result' });
  },
});
```

- [ ] **Step 4: Implement ledger view and styling**

```xml
<!-- pages/ledger/ledger.wxml -->
<view class="page-shell ledger-page" wx:if="{{bill}}">
  <view class="page-head"><view><text class="eyebrow">{{bill.participants.length}} 人</text><view class="headline">今天的账单</view></view><button class="add-link" bindtap="openNew">＋ 记一笔</button></view>
  <view class="summary-card">
    <text class="summary-label">当前总消费</text><view class="summary-line"><text class="summary-money money">¥{{total}}</text><text>{{expenses.length}} 笔</text></view>
  </view>
  <view class="card expense-list" wx:if="{{expenses.length}}">
    <view class="expense" wx:for="{{expenses}}" wx:key="id" data-id="{{item.id}}" bindtap="openEdit">
      <view class="expense-main"><text class="expense-title">{{item.title}}</text><text class="expense-detail">{{item.detail}}</text></view>
      <text class="expense-amount money">¥{{item.amountText}}</text>
      <button class="delete" data-id="{{item.id}}" catchtap="deleteExpense">删除</button>
    </view>
  </view>
  <view class="empty card" wx:else><text>还没有消费记录</text><text class="secondary-text">点击“记一笔”开始</text></view>
  <view class="collector card" wx:if="{{collectorName}}"><view class="avatar">{{collectorInitial}}</view><view><text class="collector-label">预计主收款人</text><text class="collector-name">{{collectorName}}</text></view><text class="collector-amount money">收 ¥{{collectorAmount}}</text></view>
  <button class="participant-link" bindtap="editParticipants">调整参与人</button>
  <button class="primary-button result-button" disabled="{{!expenses.length}}" bindtap="showResult">算一算怎么转账</button>
  <expense-editor visible="{{editorVisible}}" participants="{{bill.participants}}" value="{{editingExpense}}" bind:close="closeEditor" bind:save="saveExpense" />
</view>
```

```css
/* pages/ledger/ledger.wxss */
.ledger-page { max-width: 720rpx; margin: 0 auto; }
.page-head, .summary-line, .expense, .collector { display: flex; align-items: center; justify-content: space-between; }
.eyebrow, .summary-label, .expense-detail, .collector-label { color: var(--secondary); font-size: 24rpx; }
.headline { margin-top: 6rpx; font-size: 46rpx; font-weight: 650; }
.add-link { margin: 0; padding: 18rpx; background: transparent; color: var(--blue); font-size: 26rpx; font-weight: 600; }
.summary-card { margin: 34rpx 0 24rpx; padding: 34rpx; border-radius: 36rpx; background: var(--ink); color: #fff; }
.summary-line { margin-top: 12rpx; }
.summary-money { font-size: 54rpx; font-weight: 650; }
.expense-list { padding: 0 28rpx; }
.expense { min-height: 118rpx; border-bottom: 1rpx solid var(--line); }
.expense:last-child { border-bottom: 0; }
.expense-main { flex: 1; min-width: 0; }
.expense-title, .expense-detail { display: block; }
.expense-title { font-weight: 600; }
.expense-detail { margin-top: 7rpx; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.expense-amount { margin-left: 16rpx; font-weight: 600; }
.delete { margin: 0 0 0 10rpx; padding: 8rpx; background: transparent; color: var(--danger); font-size: 22rpx; }
.empty { display: flex; flex-direction: column; gap: 10rpx; align-items: center; padding: 70rpx 24rpx; }
.collector { gap: 18rpx; margin-top: 24rpx; padding: 28rpx; }
.avatar { display: flex; align-items: center; justify-content: center; width: 66rpx; height: 66rpx; border-radius: 50%; background: var(--ink); color: #fff; font-weight: 650; }
.collector > view:nth-child(2) { flex: 1; }
.collector-label, .collector-name { display: block; }
.collector-name { margin-top: 4rpx; font-weight: 600; }
.collector-amount { color: #087c50; font-size: 24rpx; font-weight: 600; }
.participant-link { margin-top: 16rpx; background: transparent; color: var(--blue); font-size: 24rpx; }
.result-button { margin-top: 24rpx; padding: 24rpx; }
.result-button[disabled] { opacity: .35; }
```

- [ ] **Step 5: Run tests, verify the ledger manually, and commit**

Run: `npm test`

Expected: all tests PASS.

In微信开发者工具, verify adding, editing, deleting, full split, selected split, payer changes, invalid amount messages, and immediate total refresh.

```bash
git add components/expense-editor pages/ledger
git commit -m "feat: add expense ledger and editor"
```

---

### Task 7: Build the settlement result page and collector switching

**Files:**
- Create: `pages/result/result.js`
- Create: `pages/result/result.wxml`
- Create: `pages/result/result.wxss`

- [ ] **Step 1: Implement result-page data mapping**

```js
// pages/result/result.js
const { formatCents } = require('../../utils/money');
const { calculateSettlement } = require('../../services/settlement');
const { buildShareText } = require('../../services/share');
const { createDraftStore } = require('../../services/draft-store');

const store = createDraftStore(wx);

Page({
  data: {
    bill: null,
    total: '0.00',
    collectorName: '',
    collectorInitial: '',
    collectorAmount: '0.00',
    eligibleCollectors: [],
    transfers: [],
    settled: false,
  },
  onShow() {
    const bill = store.load();
    if (!bill || !bill.expenses.length) return wx.reLaunch({ url: '/pages/start/start' });
    this.refresh(bill, bill.collectorId);
  },
  refresh(bill, collectorId) {
    const result = calculateSettlement(bill, collectorId);
    if (result.collectorId !== bill.collectorId) {
      bill = { ...bill, collectorId: result.collectorId, updatedAt: Date.now() };
      store.save(bill);
    }
    const names = new Map(result.members.map((item) => [item.id, item.displayName]));
    const memberById = new Map(result.members.map((item) => [item.id, item]));
    const transfers = result.transfers.map((transfer) => {
      const subjectId = transfer.fromId === result.collectorId ? transfer.toId : transfer.fromId;
      const subject = memberById.get(subjectId);
      const specialNotes = bill.expenses
        .filter((expense) => expense.splitMode === 'selected' && expense.participantIds.includes(subjectId) && expense.note)
        .map((expense) => expense.note)
        .slice(0, 2);
      const detail = specialNotes.length
        ? `含${specialNotes.join('、')}`
        : subject.paidCents > 0
          ? `${subject.displayName} 应承担 ¥${formatCents(subject.owedCents)}，已垫付 ¥${formatCents(subject.paidCents)}`
          : `${subject.displayName} 应承担 ¥${formatCents(subject.owedCents)}`;
      return {
        ...transfer,
        fromName: names.get(transfer.fromId),
        toName: names.get(transfer.toId),
        fromInitial: names.get(transfer.fromId).slice(0, 1),
        amount: formatCents(transfer.amountCents),
        detail,
      };
    });
    this.result = result;
    this.setData({
      bill,
      total: formatCents(result.totalCents),
      collectorName: names.get(result.collectorId) || '',
      collectorInitial: (names.get(result.collectorId) || '').slice(0, 1),
      collectorAmount: formatCents(result.collectorAmountCents),
      eligibleCollectors: result.members.filter((item) => item.netCents > 0).map((item) => ({ id: item.id, displayName: item.displayName })),
      transfers,
      settled: !result.collectorId,
    });
  },
  changeCollector(event) {
    const collectorId = event.currentTarget.dataset.id;
    const bill = { ...this.data.bill, collectorId, updatedAt: Date.now() };
    store.save(bill);
    this.refresh(bill, collectorId);
  },
  copyResult() {
    wx.setClipboardData({
      data: buildShareText(this.result),
      success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'success' }),
    });
  },
  finish() {
    wx.showModal({
      title: '开始一笔新账单？',
      content: '当前账单会从本机清除。',
      confirmText: '开始新的',
      success: ({ confirm }) => {
        if (!confirm) return;
        store.clear();
        wx.reLaunch({ url: '/pages/start/start' });
      },
    });
  },
});
```

- [ ] **Step 2: Implement action-list result view**

```xml
<!-- pages/result/result.wxml -->
<view class="page-shell result-page" wx:if="{{bill}}">
  <view class="result-head"><text class="eyebrow">分账结果</text><button bindtap="finish">完成</button></view>
  <view class="settled card" wx:if="{{settled}}"><text class="settled-title">已经结清</text><text class="secondary-text">所有人都无需再转账</text></view>
  <block wx:else>
    <view class="hero">
      <view class="collector-row"><view class="avatar">{{collectorInitial}}</view><view><text class="hero-label">主收款人</text><text class="hero-name">{{collectorName}} 共需收回</text></view></view>
      <view class="hero-money money">¥{{collectorAmount}}</view>
      <view class="hero-meta"><text>总消费 ¥{{total}}</text><text>{{bill.participants.length}} 人</text></view>
    </view>
    <view class="collector-picker" wx:if="{{eligibleCollectors.length > 1}}"><text>更换主收款人</text><scroll-view scroll-x><button wx:for="{{eligibleCollectors}}" wx:key="id" data-id="{{item.id}}" class="collector-chip {{item.id === bill.collectorId ? 'active' : ''}}" bindtap="changeCollector">{{item.displayName}}</button></scroll-view></view>
    <text class="section-title">请按下面转账</text>
    <view class="card transfer-list">
      <view class="transfer" wx:for="{{transfers}}" wx:key="fromId">
        <view class="transfer-avatar">{{item.fromInitial}}</view>
        <view class="transfer-main"><text class="transfer-route">{{item.fromName}} 转给 {{item.toName}}</text><text class="transfer-detail">{{item.detail}}</text></view>
        <text class="transfer-amount money">¥{{item.amount}}</text>
      </view>
    </view>
  </block>
  <button class="primary-button copy-button" bindtap="copyResult">复制群聊结算文案</button>
</view>
```

```css
/* pages/result/result.wxss */
.result-page { max-width: 720rpx; margin: 0 auto; }
.result-head, .collector-row, .hero-meta, .transfer { display: flex; align-items: center; justify-content: space-between; }
.result-head button { margin: 0; background: transparent; color: var(--blue); font-size: 26rpx; }
.eyebrow, .hero-label, .transfer-detail { color: var(--secondary); font-size: 24rpx; }
.hero { margin-top: 24rpx; padding: 36rpx; border-radius: 40rpx; background: var(--ink); color: #fff; }
.collector-row { justify-content: flex-start; gap: 20rpx; }
.avatar { display: flex; align-items: center; justify-content: center; width: 78rpx; height: 78rpx; border-radius: 50%; background: #fff; color: var(--ink); font-weight: 650; }
.hero-label, .hero-name { display: block; }
.hero-label, .hero-meta { color: #adb2ba; }
.hero-name { margin-top: 4rpx; font-weight: 600; }
.hero-money { margin-top: 32rpx; font-size: 64rpx; font-weight: 650; letter-spacing: -2rpx; }
.hero-meta { margin-top: 12rpx; font-size: 23rpx; }
.collector-picker { margin: 28rpx 0; }
.collector-picker > text { display: block; margin-bottom: 14rpx; color: var(--secondary); font-size: 24rpx; }
.collector-picker scroll-view { white-space: nowrap; }
.collector-chip { display: inline-block; margin: 0 12rpx 0 0; padding: 12rpx 22rpx; border-radius: 999rpx; background: #e9ebef; font-size: 24rpx; }
.collector-chip.active { background: var(--ink); color: #fff; }
.section-title { display: block; margin: 30rpx 4rpx 14rpx; font-weight: 600; }
.transfer-list { padding: 0 28rpx; }
.transfer { min-height: 124rpx; gap: 18rpx; border-bottom: 1rpx solid var(--line); }
.transfer:last-child { border-bottom: 0; }
.transfer-avatar { display: flex; align-items: center; justify-content: center; width: 64rpx; height: 64rpx; border-radius: 50%; background: #eff1f4; font-weight: 650; }
.transfer-main { flex: 1; }
.transfer-route, .transfer-detail { display: block; }
.transfer-route, .transfer-amount { font-weight: 600; }
.transfer-detail { margin-top: 7rpx; }
.settled { display: flex; flex-direction: column; align-items: center; gap: 12rpx; margin-top: 36rpx; padding: 80rpx 24rpx; }
.settled-title { font-size: 44rpx; font-weight: 650; }
.copy-button { margin-top: 32rpx; padding: 24rpx; }
```

- [ ] **Step 3: Verify result interactions**

Run: `npm test`

Expected: all tests PASS.

In微信开发者工具, enter both confirmed examples and verify exact amounts. Then switch between eligible collectors, copy the group message, and confirm “完成” clears the draft only after confirmation.

- [ ] **Step 4: Commit the result experience**

```bash
git add pages/result
git commit -m "feat: add settlement action list"
```

---

### Task 8: Final verification, accessibility, and project handoff

**Files:**
- Create: `README.md`
- Modify: UI files only if verification reveals a concrete defect

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all tests PASS with no failures or warnings.

- [ ] **Step 2: Run repository checks**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only the intended README or verification fixes are uncommitted.

- [ ] **Step 3: Perform the complete manual acceptance matrix**

In微信开发者工具, verify each item and record the result in the commit notes:

1. Letter mode: 2, 5, and 20 participants.
2. Name mode: Chinese, English, mixed names, duplicate names, and 12-character names.
3. Expense validation: blank, zero, negative, one decimal, two decimals, and three decimals.
4. Split scopes: all, one person, three people, and every member manually selected.
5. Confirmed example one: A receives 306.40; transfers are 21.60, 101.60, 91.60, 91.60.
6. Confirmed example two: A receives 283.33; transfers are 46.67, 56.66, 90.00, 90.00.
7. Another creditor exists: collector sends the creditor their positive net amount.
8. Edit/delete expense: totals refresh and persisted draft matches.
9. Edit participants: name change succeeds; removing a payer is blocked; adding a member recalculates all-split expenses.
10. Relaunch: draft resumes; corrupt draft returns safely to start.
11. Result: collector selection, copied text, back navigation, and new-bill confirmation.
12. Layout: narrow phone width, long list, 20 participants, safe-area bottom, and no clipped amounts.

- [ ] **Step 4: Write the runbook**

~~~~markdown
# 吃饭分账小程序

一个完全本地运行、无服务器费用的微信原生小程序。

## 本地验证

```bash
npm test
```

## 微信开发者工具

1. 打开微信开发者工具。
2. 导入本目录。
3. 首次预览可使用 `touristappid`；正式发布前在 `project.config.json` 中替换为已注册的小程序 AppID。
4. 编译后从“开始分账”页面创建账单。

## 数据与隐私

账单只保存在微信本地存储中。项目不使用登录、服务器、云数据库、语音识别或付费 API。
~~~~

- [ ] **Step 5: Re-run tests and commit the verified release candidate**

Run: `npm test && git diff --check`

Expected: all tests PASS and no whitespace errors.

```bash
git add README.md app.js app.json app.wxss project.config.json sitemap.json pages components domain services utils tests package.json
git commit -m "docs: add mini program runbook"
```

---

## Completion criteria

- Every automated test passes.
- Both confirmed arithmetic examples match to the cent.
- All settlement invariants hold for every test fixture.
- The full manual acceptance matrix passes in微信开发者工具.
- No network request, cloud function, paid API, microphone permission, login, or contact permission exists in the codebase.
- The visual hierarchy matches the approved single-page ledger, action-list result, and graphite-minimal direction.
