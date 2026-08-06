# 空账单卡片快捷记账 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让空账单中的整张“还没有消费”卡片与右上角“＋记一笔”打开同一个消费编辑器。

**Architecture:** 复用账单页现有的 `openNewExpense` 方法，只在空状态卡片的 WXML 根节点增加点击绑定、按钮角色和无障碍标签。页面结构测试直接检查模板属性，防止该快捷入口以后再次退化为不可点击文字。

**Tech Stack:** 微信小程序 WXML、JavaScript、Node.js 内置测试运行器 `node:test`

---

### Task 1: 增加空状态入口回归测试并修复模板

**Files:**
- Modify: `tests/ledger-page.test.js`
- Modify: `pages/ledger/ledger.wxml`

- [ ] **Step 1: 写入失败的模板结构测试**

在 `tests/ledger-page.test.js` 中增加：

```js
test('empty state card opens the same new-expense flow as the header button', () => {
  const root = path.resolve(__dirname, '..');
  const ledgerWxml = fs.readFileSync(
    path.join(root, 'pages/ledger/ledger.wxml'),
    'utf8',
  );

  assert.match(
    ledgerWxml,
    /<view\b(?=[^>]*wx:else)(?=[^>]*class="empty-card card")(?=[^>]*bindtap="openNewExpense")(?=[^>]*aria-role="button")(?=[^>]*aria-label="还没有消费，点击记一笔")[^>]*>/,
  );
});
```

- [ ] **Step 2: 运行账单页测试并确认旧模板失败**

Run: `node --test tests/ledger-page.test.js`

Expected: FAIL；空状态卡片缺少 `bindtap="openNewExpense"`、按钮角色或无障碍标签。

- [ ] **Step 3: 做最小模板修改**

将 `pages/ledger/ledger.wxml` 的空状态根节点改为：

```xml
<view
  wx:else
  class="empty-card card"
  bindtap="openNewExpense"
  aria-role="button"
  aria-label="还没有消费，点击记一笔"
>
```

卡片内部的圆形“＋”、标题和说明文字保持不变。

- [ ] **Step 4: 运行账单页测试并确认通过**

Run: `node --test tests/ledger-page.test.js`

Expected: 账单页测试全部 PASS，无失败和警告。

- [ ] **Step 5: 运行完整测试套件**

Run: `npm test`

Expected: 全部测试 PASS，无失败和警告。

- [ ] **Step 6: 提交修复**

```bash
git add tests/ledger-page.test.js pages/ledger/ledger.wxml
git commit -m "fix: make empty ledger card open expense editor"
```

提交中不得包含 `.DS_Store`、`project.config.json` 或 `project.private.config.json`。

### Task 2: 微信开发者工具验收并恢复现有账单

**Files:**
- No repository file changes.

- [ ] **Step 1: 备份当前模拟器账单**

通过微信开发者工具 Console 读取并保留 `meal_split_draft`，确认备份包含总额 ¥261.00、4 笔记录、建议收款人 B 和四条原备注。

- [ ] **Step 2: 创建临时空账单并测试整卡点击**

在本地模拟器中临时创建 5 人空账单，点击圆形“＋”，确认“记一笔”编辑器打开；取消后再点击卡片说明文字区域，确认同一个编辑器再次打开。

- [ ] **Step 3: 恢复并核对原账单**

将备份写回 `meal_split_draft`，重新打开账单页，确认总额 ¥261.00、4 笔记录、备注“套餐 / 单点两道菜 / 三人打车钱 / 额外酒水”，以及建议收款人 B、预计净收 ¥72.07。
