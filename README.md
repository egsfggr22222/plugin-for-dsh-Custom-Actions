# Custom Actions for DSH

A DSH plugin that turns the things you do over and over into keys you can press. It puts two capabilities on one settings page:

- **Custom actions** — bind any catalogued DSH action to a chord of one, two, or three keys. A single-key binding can fire on **one tap** or on **two taps**.
- **Finish reminders** — when a turn really finishes, or an agent waits for your answer, you get a bell, and either a bottom-right card or the window brought to the front.

[中文 readme](https://github.com/egsfggr22222/plugin-for-dsh-Custom-Actions/blob/main/dsh%E8%87%AA%E5%AE%9A%E4%B9%89%E6%93%8D%E4%BD%9C/README.md)

## Highlights

- **One, two, or three keys.** `Enter`, `Shift + Enter`, or `Ctrl + Alt + S` — up to two modifiers plus a main key.
- **Single tap or double tap.** A double-tap binding lets the first press through to the app and acts on the second, so `Enter` twice means "break the line, then send" — exactly the composer behaviour DSH always had.
- **Record, don't type.** Click **Record**, press the chord you want, done. `Esc` cancels; a chord already taken is refused and the owning action is named.
- **Only hunts for matches.** Unbound keys are left completely alone — the engine only intercepts a keystroke once it matches a binding.
- **Know when it's done.** Four soft chimes, a blue-white card in the bottom-right corner, or the window raised to the front — whichever fits your switches.

## Install

Install the package directory as a local bundle from inside DSH:

```
plugin_manager  install_bundle  <absolute path to this directory>
```

Then refresh the web page. The settings panel gains a page named **自定义操作 / Custom Actions**, and the plugin row appears in the installed plugin list.

If the older split plugins are still installed, remove them first — this package replaces both:

```
plugin_manager  remove_bundle  dsh-reminder
plugin_manager  remove_bundle  @local/dsh-composer-double-enter
```

## Default bindings

| Action | Default |
|---|---|
| Send message | `Enter` ×2 (double tap) |
| Insert line break | `Shift + Enter` |

Every other action starts **unbound** on purpose, so installing the plugin never shadows a shortcut DSH already owns. Pick the ones you want and record them.

## Actions

| id | Action | How it runs |
|---|---|---|
| `composer.send` | Send message | Clicks the composer's primary button (send / queue / steer, whichever mode is current) |
| `composer.newline` | Insert line break | Re-issues a plain `Enter` into the editor |
| `composer.stop` | Stop generating | Clicks the composer's stop button |
| `composer.focus` | Focus the composer | Focuses `[data-composer-input]` |
| `app.sidebar` | Toggle sidebar | `ctx.layout.toggleSidebar()` |
| `app.newSession` | New session | `ctx.uiWorkspace.startSession()` |
| `app.theme` | Light / dark theme | `ctx.theme.setTheme()` |
| `reminder.sound` | Reminder: sound switch | Same as the sound switch on the page |
| `reminder.raise` | Reminder: raise switch | Same as the raise switch on the page |
| `reminder.test` | Reminder: try it now | Alerts once with the current switches |

## How the keymap works

- One capture-phase `keydown` listener on `window`, ahead of Lexical, React, and the app's own keymaps.
- Bindings use `event.code` — the physical key — so input methods and letter case never affect a binding.
- A match is the only thing that gets `preventDefault()` and `stopImmediatePropagation()`; everything else passes through untouched.
- **Double tap:** the first press is handed to the app; the second press of the same key, within 350 ms, is intercepted and runs the action.
- **Recording** swallows every keystroke while it runs; `Esc` cancels. One chord belongs to one action only.
- The **Enable hotkeys** switch at the top of the page turns the engine off entirely — it then clears its state and touches no keys.

## Reminders

The watcher subscribes to DSH's own session status source (`uiSession.sessionStatus`) and reminds in exactly two situations:

- **An agent needs you** — a session starts waiting for an answer, an approval, or a plan confirmation.
- **Everything finished** — no session is running and nothing is waiting on you, and that state lasts a continuous **8 seconds**.

A pause in the middle of a task never reminds: the gap between two model requests, a tool still running, a goal round not yet started, or a queued message not yet delivered all resume well inside the window. Opening the app while idle does not chime, and a system that has never been busy stays silent.

The reminder's shape is decided by the two switches:

| Sound | Raise | Result |
|---|---|---|
| On | Off | Four chimes + the blue-white card, bottom-right |
| On | On | Four chimes + the window brought to the front (no card) |
| Off | On | Window brought to the front only (no card) |
| Off | Off | Nothing |

## Files

| File | Role |
|---|---|
| `index.js` | Host half: `/api/dsh-hotkeys/{state,raise,notify}`, state persistence, the two window helpers |
| `client.js` | Browser half: keymap engine, action catalog, settings page, reminder detection and the chime |
| `raise-window.ps1` | Win32 window raise (restore, then front) |
| `toast-window.ps1` | WPF bottom-right card |
| `cordis.patch.yml` | Inserts the Host row |
| `locale/*.json` | Plugin-list title and description (zh / en) |

State lives in `~/.dsh/dsh-hotkeys.json` (or `$DSH_HOME/dsh-hotkeys.json`). The package name, route prefix, and state file deliberately keep the `dsh-hotkeys` identifiers, so renaming the display name never migrates or loses a binding.

## Limitations

- **The catalog is what can be bound.** Only actions a plugin can actually perform are in it. DSH internals that are not exposed to plugins cannot be bound — but anything clickable is cheap to add: append one `{ id, scope, run }` entry to `ACTIONS` in `client.js`.
- **A single key bound to a global action fires while typing.** The page does not prevent it; prefer at least one modifier for global actions.
- **Three keys is the ceiling** — two modifiers plus one main key.
- **Window raise and the reminder card are Windows-only.** Other platforms keep the switches but the routes answer `unsupported-platform`.
- **`Esc` cannot be a hotkey**, because recording reserves it for cancel.
- The chime is synthesized with Web Audio, so the page needs one real interaction (a click or a keypress) before the browser allows sound — normal DSH use always satisfies this.

## License

MIT.
