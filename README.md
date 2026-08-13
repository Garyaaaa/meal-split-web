# Meal Split

> A small, bilingual, browser-only tool for splitting shared expenses.

一个可以直接在浏览器中使用的多人分账工具，支持中文和 English。适合聚餐、旅行、合租和临时活动。

## Try it online / 在线试用

[Open the live app](https://garyaaaa.github.io/meal-split-web/)

[在线打开](https://garyaaaa.github.io/meal-split-web/)

## Features / 功能

- Chinese and English UI with automatic browser-language detection / 中文与 English 双语界面，并根据浏览器语言自动选择
- Works on phones and desktop browsers / 支持手机和桌面浏览器
- 2–20 participants, letter labels or custom names / 支持 2–20 人，可用字母或自定义姓名
- Add, edit, and delete expenses / 新增、编辑和删除消费
- Split each expense among everyone or selected participants / 每笔消费可全员均摊或指定承担人
- Exact cent-based arithmetic with conserved totals / 以分为单位计算，金额严格守恒
- Clear settlement routes and a changeable main collector / 生成清晰的转账路线，并可更换主收款人
- `$` amount display with no currency conversion / 使用 `$` 显示金额，不做货币选择或汇率换算
- Local browser drafts and clipboard sharing / 浏览器本地保存草稿，支持复制结算文案
- No account, server, analytics, ads, or third-party API / 无账号、服务器、统计、广告或第三方 API

The `$` sign is only a display convention. This app does not identify currencies or convert exchange rates.

`$` 只是界面显示符号。本项目不会识别货币，也不会进行汇率换算。

## How to use / 使用方法

1. Choose the number of participants, then use letters or enter names.
2. Add each expense, choose who paid, and choose who shares it.
3. Open the settlement page, review the routes, and copy the summary if useful.
4. Finish the bill when you no longer need the local draft.

1. 选择参与人数，然后使用字母或输入姓名。
2. 逐笔添加消费，选择付款人和承担人。
3. 打开结算页，检查转账路线，需要时复制结算文案。
4. 不再需要当前草稿时，可以完成并清除账单。

## Run locally / 本地运行

You only need a modern browser and Node.js with built-in `node:test` support.

只需要现代浏览器，以及支持内置 `node:test` 的 Node.js。

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173/>. The app has no build step and no third-party dependencies.

然后打开 <http://localhost:4173/>。项目不需要构建步骤，也没有第三方依赖。

Run the automated tests:

```bash
npm test
```

## Privacy / 隐私

All participants, expenses, and settlement choices stay in this browser's `localStorage`. Nothing is uploaded. Clipboard access happens only after the user asks to copy the summary. If automatic clipboard access is unavailable, the app shows text for manual copying.

参与人、消费和结算选择只保存在当前浏览器的 `localStorage` 中，不会上传。只有用户主动点击复制时才会尝试写入剪贴板；如果浏览器不允许自动复制，页面会显示可手动复制的文字。

Clearing a finished bill removes the local draft and cannot be undone by the app.

完成并清除账单会删除本地草稿，应用本身无法恢复。

## Project structure / 项目结构

```text
index.html                 Static Web entry point / Web 入口
web/app.js                 UI state and event handling / 页面状态与交互
web/i18n.js                Chinese and English messages / 双语文案
web/storage.js             Browser storage adapter / 浏览器存储适配
web/clipboard.js           Clipboard fallback / 剪贴板降级方案
web/styles.css             Responsive accessible styles / 响应式与可访问样式
domain/                    Participant domain rules / 参与人领域逻辑
services/settlement.js     Settlement calculation / 分账计算
services/share.js          Share summary text / 结算文案
utils/money.js             Cent-based money helpers / 金额处理
tests/                     Node.js regression tests / 自动化回归测试
```

This public version is a standalone Web app. It is not a WeChat mini-program and does not require WeChat.

这个公开版本是独立 Web 应用，不是微信小程序，也不需要微信。

## Feedback and contributions / 反馈与贡献

Please open a GitHub issue with:

- what you were trying to do;
- what you expected;
- what happened instead;
- browser and screen size, if the issue is visual.

欢迎通过 GitHub Issue 提交建议，并尽量说明：

- 你想完成什么；
- 预期结果是什么；
- 实际发生了什么；
- 如果是界面问题，请附浏览器和屏幕尺寸。

Small pull requests are welcome. Please keep the app dependency-free and preserve the cent-based settlement invariants.

欢迎小型 Pull Request。请尽量保持项目无第三方依赖，并保留以分为单位、总额守恒的分账规则。

## License / 许可证

Released under the [MIT License](LICENSE).

本项目采用 [MIT License](LICENSE) 开源。
