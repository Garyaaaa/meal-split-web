# 微信确认弹窗文案兼容修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让已有账单的“开始记账”和结果页“完成”都能正常打开微信原生确认弹窗。

**Architecture:** 保留现有 `wx.showModal`、请求防重复、本地草稿保护与导航流程，只把两个超过微信限制的确认按钮文案统一为 4 个汉字的“清除账单”。页面测试直接检查实际传给 `wx.showModal` 的参数，防止以后再次使用过长文案。

**Tech Stack:** 微信小程序 JavaScript、`wx.showModal`、Node.js 内置测试运行器 `node:test`

---

### Task 1: 增加弹窗文案回归测试并修复

**Files:**
- Modify: `tests/start-page.test.js`
- Modify: `tests/result-page.test.js`
- Modify: `pages/start/start.js`
- Modify: `pages/result/result.js`

- [ ] **Step 1: 先把开始页测试改为期望兼容文案**

在 `existing draft requires confirmation before a new bill can replace it` 中使用以下断言：

```js
assert.equal(calls.showModal[0].confirmText, '清除账单');
assert.ok(Array.from(calls.showModal[0].confirmText).length <= 4);
```

- [ ] **Step 2: 先把结果页测试改为期望兼容文案**

在 `finish cancellation does not clear or navigate and allows retry` 中使用以下断言：

```js
assert.equal(calls.showModal[0].confirmText, '清除账单');
assert.ok(Array.from(calls.showModal[0].confirmText).length <= 4);
```

- [ ] **Step 3: 运行两个页面测试并确认旧代码失败**

Run: `node --test tests/start-page.test.js tests/result-page.test.js`

Expected: FAIL；开始页实际得到“替换并开始”，结果页实际得到“清除并开始”。

- [ ] **Step 4: 做最小实现修改**

在 `pages/start/start.js` 和 `pages/result/result.js` 的相关 `wx.showModal` 配置中统一使用：

```js
confirmText: '清除账单',
```

- [ ] **Step 5: 运行定向测试并确认通过**

Run: `node --test tests/start-page.test.js tests/result-page.test.js`

Expected: 两个测试文件全部 PASS，无失败和警告。

- [ ] **Step 6: 运行完整测试套件**

Run: `npm test`

Expected: 全部测试 PASS，无失败和警告。

- [ ] **Step 7: 提交兼容修复**

```bash
git add tests/start-page.test.js tests/result-page.test.js pages/start/start.js pages/result/result.js
git commit -m "fix: keep modal confirmation labels compatible"
```

提交中不得包含 `.DS_Store`、`project.config.json` 或 `project.private.config.json`。

### Task 2: 微信开发者工具实机验收并恢复原账单

**Files:**
- No repository file changes.

- [ ] **Step 1: 验证清除弹窗**

在开始页点击“开始记账”，确认原生弹窗正常出现、确认按钮显示“清除账单”，再确认清除。

- [ ] **Step 2: 验证案例一**

录入 A ¥398 全员、B ¥60 全员、B ¥10 仅 C，确认总额 ¥468.00，A 应收 ¥306.40，付款路线为 B→A ¥21.60、C→A ¥101.60、D→A ¥91.60、E→A ¥91.60。

- [ ] **Step 3: 验证案例二**

清除案例一后录入 A ¥390 全员、B ¥60 全员、C ¥50 仅 A/B/C，确认总额 ¥500.00，A 应收 ¥283.33，付款路线为 B→A ¥46.67、C→A ¥56.66、D→A ¥90.00、E→A ¥90.00。

- [ ] **Step 4: 恢复并核对原账单**

清除案例二，恢复 B ¥130 全员“套餐”、C ¥68 全员“单点两道菜”、A ¥43 仅 A/B/C“三人打车钱”、A ¥20 全员“额外酒水”。确认总额 ¥261.00、4 笔记录、默认收款人 B、B 最终应收 ¥72.07。
