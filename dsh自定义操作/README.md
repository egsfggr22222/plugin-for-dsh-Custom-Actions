# 自定义操作（dsh-hotkeys）

一个插件同时管两件事：**DSH 的自定义操作（热键）**，和**完成提醒**。之前分开的「双击回车发送」和「dsh-reminder」都并进来了。

英文名：**Custom Actions**。

- 设置位置：设置 → 左侧「自定义操作」（排在 Our Free Model 下面）。
- 每个动作可以绑 **1～3 个键**：单键（`Enter`）、一个修饰键加主键（`Shift+Enter`）、两个修饰键加主键（`Ctrl+Alt+S`）。
- **单键**绑定可选 **单击 / 双击**：双击时第一下不拦截、交给应用（所以回车第一下仍是换行），第二下才触发动作。
- 同一个页面里还有完成的**声音**与**置顶**两块开关。

## 装法

```
plugin_manager  install_bundle  <这个目录的绝对路径>
```

装完刷新页面。设置面板里会多出「自定义操作」这一页，插件列表里显示 **自定义操作 / Custom Actions**。

旧的两个插件（`dsh-reminder`、`@local/dsh-composer-double-enter`）如果还装着，先移除：

```
plugin_manager  remove_bundle  dsh-reminder
plugin_manager  remove_bundle  @local/dsh-composer-double-enter
```

## 默认绑定

| 动作 | 默认键 |
|---|---|
| 发送消息 | `Enter` ×2（双击） |
| 插入换行 | `Shift + Enter` |

其余动作默认**未设置**——故意不预置，免得顶掉 DSH 自己已有的快捷键。想用哪个就点「录制」按一下。

## 动作清单

| id | 动作 | 实现方式 |
|---|---|---|
| `composer.send` | 发送消息 | 点输入框旁的主按钮（发送 / 排队 / 插话都走它自己的模式） |
| `composer.newline` | 插入换行 | 向编辑器补一个普通 `Enter` |
| `composer.stop` | 停止生成 | 点输入框的停止按钮 |
| `composer.focus` | 聚焦输入框 | 聚焦 `[data-composer-input]` |
| `app.sidebar` | 收起 / 展开侧栏 | `ctx.layout.toggleSidebar()` |
| `app.newSession` | 新建会话 | `ctx.uiWorkspace.startSession()` |
| `app.theme` | 深浅色切换 | `ctx.theme.setTheme()` |
| `reminder.sound` | 提醒：声音开关 | 等于页面里的声音开关 |
| `reminder.raise` | 提醒：置顶开关 | 等于页面里的置顶开关 |
| `reminder.test` | 提醒：试一次 | 立刻按当前开关提醒 |

## 热键引擎

- 一个 `window` 捕获阶段监听，先于 Lexical / React / 应用自己的 keymap。
- 用 `event.code`（物理键位）而不是 `event.key`，所以换输入法/大小写不影响绑定。
- 命中才 `preventDefault + stopImmediatePropagation`；没命中的键**完全不动**。
- 双击绑定：第一下照常交给应用，第二下（350ms 内、同一个键）才拦下来执行动作。
- 录制中（页面上点「录制」后）按键一律被吞掉，`Esc` 取消；同一个组合键只能属于一个动作，录到重复会拒绝并提示是哪个动作占着。
- 设置页顶部的「启用热键」总开关关掉后，引擎只清状态，不碰任何按键。

## 提醒

判定与之前一致：agent 在等你（`pendingInteraction`）立刻提醒；所有会话都安静且连续 8 秒没有新动作才提醒。中途停顿（工具执行、两轮模型请求之间、goal 下一轮未起、排队消息未发）不提醒。

提醒形态由两块开关决定：

| 声音 | 置顶 | 结果 |
|---|---|---|
| 开 | 关 | 四下「叮」+ 右下角蓝白提示卡 |
| 开 | 开 | 四下「叮」+ 窗口拉到最前，不弹卡 |
| 关 | 开 | 只拉窗口，不弹卡 |
| 关 | 关 | 什么都不做 |

## 结构

| 文件 | 作用 |
| --- | --- |
| `index.js` | Host：`/api/dsh-hotkeys/{state,raise,notify}`、状态持久化（`~/.dsh/dsh-hotkeys.json`）、两个脚本调用 |
| `client.js` | 浏览器：热键引擎、动作表、设置页、提醒判定与「叮」 |
| `raise-window.ps1` | Win32 拉窗口 |
| `toast-window.ps1` | WPF 右下角提示卡 |

包名保持 `dsh-hotkeys`、路由保持 `/api/dsh-hotkeys`、状态文件保持 `~/.dsh/dsh-hotkeys.json`——改名只改显示名，已存的绑定和开关不用迁移。

## 已知限制

- 「所有键盘操作」只覆盖动作表里的那些：插件能做的动作才能绑。DSH 内部没有暴露给插件的操作（比如模型选择器的内部行为）绑不了；不过你可以把**已经能点的东西**加进动作表——`ACTIONS` 里加一条 `run()` 就行。
- 绑单键到全局动作有风险：在输入框里打字会触发。建议全局动作用至少带一个修饰键的组合；设置页没有强制拦截。
- 组合键上限是两个修饰键 + 一个主键（= 3 个键）。
- 置顶与提示卡只在 Windows 生效。
- 录制时 `Esc` 固定用来取消，所以 `Esc` 本身不能作为热键。
