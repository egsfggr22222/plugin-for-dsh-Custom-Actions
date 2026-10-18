/**
 * dsh-hotkeys — browser half.
 *
 * One settings page ("热键") over one keymap engine, plus the reminder it shares
 * this plugin with:
 *
 *   - every action in the catalog takes a chord of one, two, or three keys
 *     (up to two modifiers plus a physical key), recorded by pressing it;
 *   - a single-key binding can be set to fire on one tap or on two taps — a
 *     tap-tap binding keeps the first tap a line break and fires on the second,
 *     so `Enter` twice means "break the line, then send" whatever gesture this
 *     shell build assigns to plain Enter;
 *   - the reminder (chime + card-or-window) keeps its detection here and its
 *     two switches on the same page.
 *
 * Hand-written ModuleLoader bundle: no build step, no dependency beyond the
 * `react` the shell already provides, and every colour comes from a theme token.
 */
window.__ModuleLoader__.load({
  id: 'dsh-hotkeys',
  factory(require) {
    const React = require('react')
    const { createElement: h, useEffect, useState } = React

    /** Locale namespace these strings register under. */
    const NS = 'settings.dshHotkeys'
    /** Route prefix the Host half serves. */
    const ROUTE = (() => {
      try {
        return new URL('api/dsh-hotkeys', document.baseURI).pathname
      } catch {
        return '/api/dsh-hotkeys'
      }
    })()
    /** How quickly a tap-tap binding needs its second tap. */
    const DOUBLE_MS = 150
    /** How long "everything idle" has to last before it means finished. */
    const SETTLE_MS = 8000
    /** Two reminders closer than this are one event. */
    const ALERT_GAP_MS = 2500
    /** Marks the keystrokes this module re-issues, so they are never handled twice. */
    const SYNTHETIC = Symbol('dsh-hotkeys:synthetic')
    /** The composer's Send arrow; the Stop face renders a `<rect>` instead. */
    const SEND_ICON_PREFIX = 'M8.3125 0.980183'
    /** Which codes are modifiers rather than the key of a chord. */
    const MODIFIER_CODES = new Set([
      'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
      'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock',
    ])

    const DICT = {
      zh: {
        'meta.title': '自定义操作',
        'meta.description': '把 DSH 的操作绑成 1～3 个键的组合，单键可设单击或双击，并带完成提醒的声音与置顶开关。',
        nav: '自定义操作',
        'page.title': '自定义操作',
        'page.description': '点「录制」，按下想用的组合键即可。组合键最多两个修饰键加一个主键；单键绑定可以选单击或双击（双击时第一下不拦截，第二下才触发）。',
        'master.title': '启用热键',
        'master.hint': '关掉后只保留系统原有的按键行为，下面的绑定全部失效。',
        'section.actions': '动作',
        'section.reminder': '完成提醒',
        'binding.unset': '未设置',
        'binding.recording': '按下按键…',
        'binding.record': '录制',
        'binding.clear': '清除',
        'binding.single': '单击',
        'binding.double': '双击',
        'key.ctrl': 'Ctrl',
        'key.alt': 'Alt',
        'key.shift': 'Shift',
        'key.meta': 'Meta',
        'action.composer.send.title': '发送消息',
        'action.composer.send.hint': '在输入框里把草稿发出去（走当前模式：发送 / 排队 / 插话）。',
        'action.composer.newline.title': '插入换行',
        'action.composer.newline.hint': '在输入框里换一行，不发送。',
        'action.composer.stop.title': '停止生成',
        'action.composer.stop.hint': '停止正在跑的这一轮，等同点输入框旁的停止按钮。',
        'action.composer.focus.title': '聚焦输入框',
        'action.composer.focus.hint': '把光标送回聊天输入框。',
        'action.app.sidebar.title': '收起 / 展开侧栏',
        'action.app.sidebar.hint': '切换左侧栏，和侧栏按钮一致。',
        'action.app.newSession.title': '新建会话',
        'action.app.newSession.hint': '按当前工作区开一个新会话。',
        'action.app.theme.title': '深浅色切换',
        'action.app.theme.hint': '在浅色和深色之间切换。',
        'action.reminder.sound.title': '提醒：声音开关',
        'action.reminder.sound.hint': '等于设置里那块声音滑动开关。',
        'action.reminder.raise.title': '提醒：置顶开关',
        'action.reminder.raise.hint': '等于设置里那块置顶滑动开关。',
        'action.reminder.test.title': '提醒：试一次',
        'action.reminder.test.hint': '立刻按当前开关提醒一次（叮 + 提示卡或置顶）。',
        'sound.title': '声音',
        'sound.hint': '需要你的时候、或全部任务结束时连响四下「叮」；没开置顶时还会弹右下角提示卡。',
        'raise.title': '窗口置顶',
        'raise.hint': '同样的时机把 DSH 窗口拉到最前；开了这个就不再弹提示卡。',
        'reminder.test': '试一下',
        'page.reset': '恢复默认',
        'page.saved': '改动自动保存',
        'page.offline': '未连上插件后端：绑定和开关都存不下来，暂时按默认值工作。',
        'page.duplicate': '这个组合键已经给「{name}」用了，先清掉那边再录。',
      },
      en: {
        'meta.title': 'Custom Actions',
        'meta.description': 'Bind DSH actions to 1-3 key chords, single or double tap for a single key, with the finish reminder\'s sound and raise switches on the same page.',
        nav: 'Custom Actions',
        'page.title': 'Custom Actions',
        'page.description': 'Press 录制 and then the chord you want. A chord is at most two modifiers plus a key; a single-key binding can fire on one tap or two (on two, the first tap passes through and the second fires).',
        'master.title': 'Enable hotkeys',
        'master.hint': 'With this off the app keeps only its own key handling and every binding below is ignored.',
        'section.actions': 'Actions',
        'section.reminder': 'Finish reminder',
        'binding.unset': 'Unset',
        'binding.recording': 'Press keys…',
        'binding.record': 'Record',
        'binding.clear': 'Clear',
        'binding.single': 'One tap',
        'binding.double': 'Two taps',
        'key.ctrl': 'Ctrl',
        'key.alt': 'Alt',
        'key.shift': 'Shift',
        'key.meta': 'Meta',
        'action.composer.send.title': 'Send message',
        'action.composer.send.hint': 'Send the draft from the composer, using the current mode (send / queue / steer).',
        'action.composer.newline.title': 'Insert line break',
        'action.composer.newline.hint': 'Break the line in the composer without sending.',
        'action.composer.stop.title': 'Stop generating',
        'action.composer.stop.hint': 'Stop the running turn, same as the composer stop button.',
        'action.composer.focus.title': 'Focus the composer',
        'action.composer.focus.hint': 'Put the caret back in the chat composer.',
        'action.app.sidebar.title': 'Toggle sidebar',
        'action.app.sidebar.hint': 'Same as the sidebar toggle.',
        'action.app.newSession.title': 'New session',
        'action.app.newSession.hint': 'Start a new session in the current workspace.',
        'action.app.theme.title': 'Light / dark',
        'action.app.theme.hint': 'Switch between the light and the dark theme.',
        'action.reminder.sound.title': 'Reminder: sound',
        'action.reminder.sound.hint': 'Same as the sound switch below.',
        'action.reminder.raise.title': 'Reminder: raise window',
        'action.reminder.raise.hint': 'Same as the raise switch below.',
        'action.reminder.test.title': 'Reminder: try it',
        'action.reminder.test.hint': 'Remind once now with the current switches (chime plus card or raise).',
        'sound.title': 'Sound',
        'sound.hint': 'Four chimes when you are needed or every task has finished; without the raise a bottom-right card also appears.',
        'raise.title': 'Bring window to front',
        'raise.hint': 'At the same moment, raise the DSH window — with this on there is no card.',
        'reminder.test': 'Try it',
        'page.reset': 'Restore defaults',
        'page.saved': 'Changes save automatically',
        'page.offline': 'Plugin backend unreachable: bindings and switches cannot be saved and the defaults apply.',
        'page.duplicate': 'That chord is already used by “{name}”; clear it there first.',
      },
    }

    /** Fallback translator for a section rendered without the shell's own `t`. */
    let boundT = (key) => key
    /** The Client context, for the actions that drive the shell. */
    let appCtx = null

    // ── host-backed state ───────────────────────────────────────────────────
    const store = {
      state: {
        enabled: true,
        bindings: {},
        reminder: { sound: true, raise: true },
      },
      status: 'loading',
      error: '',
      /** The action id waiting for a chord, or null. */
      recording: null,
      /** Transient note above the footer. */
      note: '',
    }
    const listeners = new Set()
    /** signature → { action, binding }, rebuilt when the bindings change. */
    let bindingIndex = new Map()

    function publish(next) {
      Object.assign(store, next)
      for (const listener of [...listeners]) {
        try {
          listener()
        } catch {
          // A broken subscriber must not stop the others or the keymap.
        }
      }
    }

    /** One JSON round trip to the Host half. */
    async function request(path, options) {
      const { timeout = 8000, ...rest } = options ?? {}
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)
      try {
        const response = await fetch(`${ROUTE}${path}`, { redirect: 'error', ...rest, signal: controller.signal })
        const text = await response.text()
        const payload = text === '' ? {} : JSON.parse(text)
        if (!response.ok) throw new Error(String(payload?.error ?? `HTTP ${response.status}`))
        return payload
      } finally {
        clearTimeout(timer)
      }
    }

    /** Adopt the Host's document (bindings, master switch, reminder switches). */
    function adopt(payload) {
      const bindings = {}
      if (payload?.bindings !== null && typeof payload?.bindings === 'object') {
        for (const [id, binding] of Object.entries(payload.bindings)) {
          const clean = sanitizeBinding(binding)
          if (clean !== null) bindings[id] = clean
        }
      }
      publish({
        state: {
          enabled: payload?.enabled !== false,
          bindings,
          reminder: {
            sound: payload?.reminder?.sound !== false,
            raise: payload?.reminder?.raise !== false,
          },
        },
        status: 'ready',
        error: '',
      })
      rebuildIndex()
    }

    async function loadState() {
      try {
        adopt(await request('/state'))
      } catch (error) {
        publish({ status: 'error', error: String(error?.message ?? error) })
        rebuildIndex()
      }
    }

    /** Patch the Host document; the local view stays optimistic until it answers. */
    async function saveState(patch) {
      const before = JSON.parse(JSON.stringify(store.state))
      const next = {
        enabled: patch.enabled ?? store.state.enabled,
        bindings: { ...store.state.bindings, ...(patch.bindings ?? {}) },
        reminder: { ...store.state.reminder, ...(patch.reminder ?? {}) },
      }
      for (const [id, value] of Object.entries(patch.bindings ?? {})) if (value === null) delete next.bindings[id]
      publish({ state: next, status: 'saving' })
      rebuildIndex()
      try {
        adopt(await request('/state', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        }))
      } catch (error) {
        publish({ state: before, status: 'error', error: String(error?.message ?? error) })
        rebuildIndex()
      }
    }

    // ── bindings ────────────────────────────────────────────────────────────
    function sanitizeBinding(value) {
      if (value === null || typeof value !== 'object') return null
      const code = typeof value.code === 'string' ? value.code : ''
      if (!/^[A-Za-z][A-Za-z0-9]{0,31}$/u.test(code)) return null
      const modifiers = Array.isArray(value.modifiers)
        ? [...new Set(value.modifiers.filter((m) => m === 'ctrl' || m === 'alt' || m === 'shift' || m === 'meta'))].sort()
        : []
      if (modifiers.length > 2) return null
      return { code, modifiers, double: modifiers.length === 0 && value.double === true }
    }

    function signature(binding) {
      return `${binding.modifiers.join('+')}|${binding.code}`
    }

    function chordOf(event) {
      const modifiers = []
      if (event.ctrlKey === true) modifiers.push('ctrl')
      if (event.altKey === true) modifiers.push('alt')
      if (event.shiftKey === true) modifiers.push('shift')
      if (event.metaKey === true) modifiers.push('meta')
      return { code: typeof event.code === 'string' ? event.code : '', modifiers: modifiers.sort() }
    }

    /** Human keycap for one `event.code`. */
    function codeLabel(code) {
      if (code.startsWith('Key') && code.length === 4) return code.slice(3)
      if (code.startsWith('Digit') && code.length === 6) return code.slice(5)
      if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`
      const names = {
        Enter: 'Enter', Escape: 'Esc', Space: 'Space', Tab: 'Tab', Backspace: 'Backspace',
        Delete: 'Del', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
        Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Backquote: '`',
        BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=',
      }
      return names[code] ?? code
    }

    function bindingLabel(binding, t) {
      if (binding === null || binding === undefined) return t('binding.unset')
      const parts = binding.modifiers.map((modifier) => t(`key.${modifier}`))
      parts.push(codeLabel(binding.code))
      const text = parts.join(' + ')
      return binding.double ? `${text} ×2` : text
    }

    /** Rebuild the signature index the keydown path reads. */
    function rebuildIndex() {
      bindingIndex = new Map()
      for (const action of ACTIONS) {
        const binding = store.state.bindings[action.id]
        if (binding === null || binding === undefined) continue
        const key = signature(binding)
        if (bindingIndex.has(key)) continue
        bindingIndex.set(key, { action, binding })
      }
    }

    // ── composer plumbing ───────────────────────────────────────────────────
    function composerEditor() {
      return document.querySelector('[data-composer-input]')
    }

    function composerSeat() {
      const editor = composerEditor()
      return editor === null ? null : editor.closest('[data-composer-seat]')
    }

    /** The primary action button while it shows the Send arrow (send / queue / steer). */
    function sendButton() {
      const seat = composerSeat()
      if (seat === null) return null
      const buttons = seat.querySelectorAll('button')
      for (let index = buttons.length - 1; index >= 0; index -= 1) {
        const button = buttons[index]
        if (button.disabled) continue
        const icon = button.querySelector('svg path')
        if (icon === null) continue
        if ((icon.getAttribute('d') || '').startsWith(SEND_ICON_PREFIX)) return button
      }
      return null
    }

    /** The Stop face of that same seat: a `<rect>` glyph and no path. */
    function stopButton() {
      const seat = composerSeat()
      if (seat === null) return null
      const buttons = seat.querySelectorAll('button')
      for (let index = buttons.length - 1; index >= 0; index -= 1) {
        const button = buttons[index]
        if (button.disabled) continue
        const icon = button.querySelector('svg')
        if (icon === null) continue
        if (icon.querySelector('rect') !== null && icon.querySelector('path') === null) return button
      }
      return null
    }

    /**
     * This build's shortcut registry, once the shell has published it.
     *
     * Older shell builds sent on `Shift+Enter` and left `Enter` to the editor;
     * current ones send on `Enter` and break the line on `Shift+Enter`. The
     * registry names the owner of each chord, so the plugin mirrors whichever
     * face this build assigns instead of assuming one of them.
     */
    let shortcutsOf = () => undefined

    /** Whether plain Enter is the send gesture in this build. */
    function plainEnterSends() {
      try {
        const described = shortcutsOf()?.describeBinding?.({ code: 'Enter', modifiers: [] })
        const owners = described?.conflicts
        if (Array.isArray(owners)) {
          if (owners.includes('fixed.send')) return true
          if (owners.includes('fixed.newline')) return false
        }
      } catch {
        // A registry that cannot answer keeps the current build's answer.
      }
      return true
    }

    /**
     * Re-issue the composer's own line-break gesture.
     *
     * Only the *other* face of Enter breaks the line, so a synthetic keydown
     * carrying it takes the keymap's line-break path instead of its submit one.
     */
    function pressNewline(editor) {
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        shiftKey: plainEnterSends(),
        bubbles: true,
        cancelable: true,
      })
      event[SYNTHETIC] = true
      editor.dispatchEvent(event)
    }

    /**
     * Whether this build performs the action's gesture natively.
     *
     * Only the line break qualifies: whichever face of `Enter` does not send is
     * the composer's own break, so a binding on that face can pass straight
     * through instead of being intercepted and re-issued.
     */
    function appAlreadyHandles(action, chord) {
      if (action.id !== 'composer.newline' || chord.code !== 'Enter') return false
      const shift = chord.modifiers.length === 1 && chord.modifiers[0] === 'shift'
      return plainEnterSends() ? shift : chord.modifiers.length === 0
    }

    // ── reminder: chime, card, raise ────────────────────────────────────────
    let audio = null

    function audioContext() {
      if (audio !== null) return audio
      try {
        const Ctor = window.AudioContext || window.webkitAudioContext
        audio = typeof Ctor === 'function' ? new Ctor() : null
      } catch {
        audio = null
      }
      return audio
    }

    function armAudio() {
      const context = audioContext()
      if (context !== null && context.state === 'suspended') void context.resume().catch(() => {})
    }

    /** Four soft C6 bells, 0.34s apart, each ringing for 0.9s. */
    function ding() {
      const context = audioContext()
      if (context === null) return
      const ring = () => {
        const start = context.currentTime + 0.01
        for (let strike = 0; strike < 4; strike += 1) {
          const at = start + strike * 0.34
          for (const [frequency, peak, decay] of [
            [1046.5, 0.18, 0.9],
            [1568, 0.08, 0.74],
            [2093, 0.045, 0.56],
            [3136, 0.022, 0.38],
          ]) {
            const oscillator = context.createOscillator()
            const gain = context.createGain()
            oscillator.type = 'sine'
            oscillator.frequency.setValueAtTime(frequency, at)
            gain.gain.setValueAtTime(0.0001, at)
            gain.gain.exponentialRampToValueAtTime(peak, at + 0.006)
            gain.gain.exponentialRampToValueAtTime(0.0001, at + decay)
            oscillator.connect(gain)
            gain.connect(context.destination)
            oscillator.start(at)
            oscillator.stop(at + decay + 0.02)
          }
        }
      }
      if (context.state === 'suspended') void context.resume().then(ring).catch(() => {})
      else ring()
    }

    /**
     * One reminder: the chime belongs to the sound switch, the window raise to
     * the raise switch, and only "sound on, raise off" leaves the user
     * otherwise unannounced — which is the one case that draws the card.
     */
    function alertOnce(kind) {
      const { sound, raise } = store.state.reminder
      if (sound) ding()
      if (raise) {
        void request('/raise', { method: 'POST' }).catch(() => {})
        return
      }
      if (!sound) return
      void request('/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind }),
      }).catch(() => {})
    }

    /**
     * Remind when an agent waits for an answer, or when every session has been
     * quiet for the settle window — never on a pause inside a running task.
     */
    function watchSessions(scope) {
      const source = scope?.uiSession?.sessionStatus
      if (source === undefined
        || typeof source.getSnapshot !== 'function'
        || typeof source.subscribe !== 'function') return () => {}

      let previous = new Map(source.getSnapshot())
      let settle = 0
      let busy = false
      let lastAt = 0

      const cancelSettle = () => {
        if (settle === 0) return
        clearTimeout(settle)
        settle = 0
      }

      const remind = (kind) => {
        const now = Date.now()
        if (now - lastAt < ALERT_GAP_MS) return
        lastAt = now
        alertOnce(kind)
      }

      const armSettle = () => {
        if (settle !== 0) return
        settle = setTimeout(() => {
          settle = 0
          // Re-read instead of trusting the state that armed the timer: anything
          // that resumed during the wait cancels the reminder.
          for (const entry of source.getSnapshot().values()) {
            if (entry?.running === true) return
            if (entry?.pendingInteraction !== undefined && entry?.pendingInteraction !== null) return
          }
          if (!busy) return
          busy = false
          remind('done')
        }, SETTLE_MS)
      }

      const unsubscribe = source.subscribe(() => {
        const next = source.getSnapshot()
        let running = false
        let waiting = false
        const waitingNow = new Set()
        for (const [sessionId, entry] of next) {
          if (entry?.running === true) running = true
          if (entry?.pendingInteraction !== undefined && entry?.pendingInteraction !== null) {
            waiting = true
            waitingNow.add(sessionId)
          }
        }
        // A question or an approval blocks on the user, so it is never mistaken
        // for a pause — but only the arrival of one reminds, not every re-render.
        let arrived = false
        for (const sessionId of waitingNow) {
          const before = previous.get(sessionId)
          if (before === undefined
            || before.pendingInteraction === undefined
            || before.pendingInteraction === null) {
            arrived = true
          }
        }
        previous = new Map(next)

        if (running || waiting) {
          busy = true
          cancelSettle()
        }
        if (arrived) remind('question')
        if (!running && !waiting) armSettle()
      })

      return () => {
        unsubscribe()
        cancelSettle()
      }
    }

    // ── actions ─────────────────────────────────────────────────────────────
    /** Every bindable operation. `scope: 'composer'` only fires in the editor. */
    const ACTIONS = [
      {
        id: 'composer.send',
        scope: 'composer',
        run: () => {
          const button = sendButton()
          if (button !== null) button.click()
        },
      },
      {
        id: 'composer.newline',
        scope: 'composer',
        run: () => {
          const editor = composerEditor()
          if (editor !== null) pressNewline(editor)
        },
      },
      {
        id: 'composer.stop',
        scope: 'composer',
        run: () => {
          const button = stopButton()
          if (button !== null) button.click()
        },
      },
      {
        id: 'composer.focus',
        scope: 'global',
        run: () => {
          const editor = composerEditor()
          if (editor !== null) editor.focus()
        },
      },
      {
        id: 'app.sidebar',
        scope: 'global',
        run: () => {
          try {
            appCtx?.layout?.toggleSidebar()
          } catch {
            // The layout service owns its own guard; a refusal is not an error.
          }
        },
      },
      {
        id: 'app.newSession',
        scope: 'global',
        run: () => {
          try {
            appCtx?.uiWorkspace?.startSession()
          } catch {
            // No workspace to start in: the action simply does nothing.
          }
        },
      },
      {
        id: 'app.theme',
        scope: 'global',
        run: () => {
          try {
            const theme = appCtx?.theme?.getTheme?.()
            appCtx?.theme?.setTheme(theme?.id === 'dark' ? 'light' : 'dark')
          } catch {
            // A theme registry refusal leaves the current theme alone.
          }
        },
      },
      {
        id: 'reminder.sound',
        scope: 'global',
        run: () => {
          void saveState({ reminder: { sound: !store.state.reminder.sound } })
        },
      },
      {
        id: 'reminder.raise',
        scope: 'global',
        run: () => {
          void saveState({ reminder: { raise: !store.state.reminder.raise } })
        },
      },
      {
        id: 'reminder.test',
        scope: 'global',
        run: () => alertOnce('done'),
      },
    ]

    const ACTION_BY_ID = new Map(ACTIONS.map((action) => [action.id, action]))

    function runAction(action) {
      try {
        action.run()
      } catch (error) {
        publish({ note: String(error?.message ?? error) })
      }
    }

    function inComposer(node) {
      return node instanceof Element && node.closest('[data-composer-input]') !== null
    }

    // ── the keymap engine ───────────────────────────────────────────────────
    let pending = null

    function onKeyDown(event) {
      if (event[SYNTHETIC] === true) return
      if (store.recording !== null) {
        captureBinding(event)
        return
      }
      if (store.state.enabled !== true) {
        pending = null
        return
      }
      if (event.isComposing === true || event.keyCode === 229) {
        pending = null
        return
      }
      if (MODIFIER_CODES.has(event.code)) return

      const chord = chordOf(event)
      if (chord.code === '') return
      const match = bindingIndex.get(signature(chord))
      if (match === undefined) {
        pending = null
        return
      }
      if (match.action.scope === 'composer' && !inComposer(event.target)) {
        pending = null
        return
      }

      const now = performance.now()
      if (match.binding.double === true) {
        const sameTap = pending !== null
          && pending.id === match.action.id
          && now - pending.at <= DOUBLE_MS
        if (sameTap) {
          pending = null
          event.preventDefault()
          event.stopImmediatePropagation()
          runAction(match.action)
          return
        }
        pending = { id: match.action.id, at: now }
        // A composer double-tap keeps its first tap a line break. It cannot be
        // handed to the app any more: current builds submit on plain Enter, so
        // the message would already be gone before the second tap arrives.
        if (match.action.scope === 'composer') {
          event.preventDefault()
          event.stopImmediatePropagation()
          const editor = composerEditor()
          if (editor !== null) pressNewline(editor)
        }
        return
      }

      pending = null
      if (appAlreadyHandles(match.action, chord)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      runAction(match.action)
    }

    function captureBinding(event) {
      event.preventDefault()
      event.stopImmediatePropagation()
      // Esc always leaves recording: a chord that cancels is worth more than a
      // chord that binds Esc.
      if (event.key === 'Escape') {
        publish({ recording: null, note: '' })
        return
      }
      if (MODIFIER_CODES.has(event.code)) return
      const chord = chordOf(event)
      if (chord.code === '') return
      const id = store.recording
      const binding = { code: chord.code, modifiers: chord.modifiers, double: false }
      // One chord, one action: the row being recorded takes it from any other.
      const taken = [...Object.entries(store.state.bindings)]
        .find(([otherId, other]) => otherId !== id && other !== null && signature(other) === signature(binding))
      if (taken !== undefined) {
        const action = ACTION_BY_ID.get(taken[0])
        publish({ recording: null, note: `duplicate:${taken[0]}` })
        void action
        return
      }
      publish({ recording: null, note: '' })
      void saveState({ bindings: { [id]: binding } })
    }

    // ── page ────────────────────────────────────────────────────────────────
    function Switch(props) {
      return h('button', {
        type: 'button',
        className: 'dhk_switch',
        role: 'switch',
        'aria-checked': props.checked === true ? 'true' : 'false',
        'aria-label': props.label,
        disabled: props.disabled === true,
        onClick: props.onChange,
      }, h('i'))
    }

    function ReminderRow(props) {
      return h('div', { className: 'dhk_row' },
        h('div', { className: 'dhk_rowText' },
          h('div', { className: 'dhk_rowTitle' }, props.title),
          h('div', { className: 'dhk_rowHint' }, props.hint)),
        h(Switch, {
          checked: props.checked,
          disabled: props.busy === true,
          label: props.title,
          onChange: props.onChange,
        }))
    }

    function ActionRow(props) {
      const { t, action, binding, recording, busy, onRecord, onClear, onToggleTap } = props
      const title = t(`action.${action.id}.title`)
      const single = binding !== null && binding.modifiers.length === 0
      return h('div', { className: 'dhk_row dhk_action' },
        h('div', { className: 'dhk_rowText' },
          h('div', { className: 'dhk_rowTitle' }, title),
          h('div', { className: 'dhk_rowHint' }, t(`action.${action.id}.hint`))),
        h('div', { className: 'dhk_controls' },
          h('span', {
            className: 'dhk_keys' + (binding === null ? ' dhk_keys_unset' : ''),
            'aria-live': 'polite',
          }, recording ? t('binding.recording') : bindingLabel(binding, t)),
          single
            ? h('button', {
              type: 'button',
              className: 'dhk_tap' + (binding.double ? ' dhk_tap_on' : ''),
              title: binding.double ? t('binding.double') : t('binding.single'),
              disabled: busy,
              onClick: onToggleTap,
            }, binding.double ? t('binding.double') : t('binding.single'))
            : null,
          h('button', {
            type: 'button',
            className: 'dhk_mini' + (recording ? ' dhk_mini_on' : ''),
            disabled: busy,
            onClick: onRecord,
          }, recording ? t('binding.recording') : t('binding.record')),
          h('button', {
            type: 'button',
            className: 'dhk_mini',
            disabled: busy || binding === null,
            onClick: onClear,
          }, t('binding.clear'))))
    }

    function SettingsPage(props) {
      const t = typeof props.t === 'function' ? props.t : boundT
      const [snapshot, setSnapshot] = useState(() => ({ ...store, state: store.state }))

      useEffect(() => {
        const listener = () => setSnapshot({ ...store })
        listeners.add(listener)
        listener()
        return () => {
          listeners.delete(listener)
        }
      }, [])

      // Re-read on every visit: another window may have moved the bindings.
      useEffect(() => {
        void loadState()
      }, [])

      const busy = snapshot.status === 'saving'
      const note = snapshot.note === ''
        ? ''
        : snapshot.note.startsWith('duplicate:')
          ? t('page.duplicate').replace('{name}', t(`action.${snapshot.note.slice('duplicate:'.length)}.title`))
          : snapshot.note

      return h('div', { className: 'dhk_root' },
        h('header', { className: 'dhk_head' },
          h('h2', { className: 'dhk_title' }, t('page.title')),
          h('p', { className: 'dhk_desc' }, t('page.description'))),
        h('div', { className: 'dhk_master' },
          h('div', { className: 'dhk_rowText' },
            h('div', { className: 'dhk_rowTitle' }, t('master.title')),
            h('div', { className: 'dhk_rowHint' }, t('master.hint'))),
          h(Switch, {
            checked: snapshot.state.enabled,
            disabled: busy,
            label: t('master.title'),
            onChange: () => void saveState({ enabled: !snapshot.state.enabled }),
          })),
        h('div', { className: 'dhk_section' }, t('section.actions')),
        ...ACTIONS.map((action) => {
          const binding = snapshot.state.bindings[action.id] ?? null
          return h(ActionRow, {
            key: action.id,
            t,
            action,
            binding,
            busy,
            recording: snapshot.recording === action.id,
            onRecord: () => publish({
              recording: snapshot.recording === action.id ? null : action.id,
              note: '',
            }),
            onToggleTap: () => void saveState({
              bindings: { [action.id]: { ...binding, double: !binding.double } },
            }),
            onClear: () => void saveState({ bindings: { [action.id]: null } }),
          })
        }),
        h('div', { className: 'dhk_section' }, t('section.reminder')),
        h(ReminderRow, {
          title: t('sound.title'),
          hint: t('sound.hint'),
          checked: snapshot.state.reminder.sound,
          busy,
          onChange: () => void saveState({ reminder: { sound: !snapshot.state.reminder.sound } }),
        }),
        h(ReminderRow, {
          title: t('raise.title'),
          hint: t('raise.hint'),
          checked: snapshot.state.reminder.raise,
          busy,
          onChange: () => void saveState({ reminder: { raise: !snapshot.state.reminder.raise } }),
        }),
        h('footer', { className: 'dhk_footer' },
          h('button', {
            type: 'button',
            className: 'dhk_action_btn',
            disabled: busy,
            onClick: () => alertOnce('done'),
          }, t('reminder.test')),
          h('button', {
            type: 'button',
            className: 'dhk_action_btn',
            disabled: busy,
            onClick: () => {
              const bindings = {}
              for (const action of ACTIONS) bindings[action.id] = null
              bindings['composer.send'] = { code: 'Enter', modifiers: [], double: true }
              bindings['composer.newline'] = { code: 'Enter', modifiers: ['shift'], double: false }
              void saveState({ enabled: true, bindings })
            },
          }, t('page.reset')),
          snapshot.status === 'error'
            ? h('span', { className: 'dhk_note dhk_note_error' }, t('page.offline'))
            : note !== ''
              ? h('span', { className: 'dhk_note dhk_note_error' }, note)
              : h('span', { className: 'dhk_note' }, t('page.saved'))))
    }

    // ── styles ──────────────────────────────────────────────────────────────
    const CSS = `
.dhk_root{display:flex;flex-direction:column;color:var(--dsw-alias-label-primary)}
.dhk_head{padding:2px 0 14px}
.dhk_title{margin:0 0 6px;font-size:16px;font-weight:600;line-height:24px;letter-spacing:-.1px}
.dhk_desc{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.dhk_master{display:flex;align-items:center;gap:24px;padding:14px 0;border-top:1px solid var(--dsw-alias-border-l1)}
.dhk_section{padding:18px 0 6px;font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-tertiary)}
.dhk_row{display:flex;align-items:center;gap:24px;padding:12px 0;border-top:1px solid var(--dsw-alias-border-l1)}
.dhk_rowText{flex:1;min-width:0}
.dhk_rowTitle{font-size:14px;font-weight:500;line-height:22px}
.dhk_rowHint{margin-top:2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dhk_controls{display:flex;align-items:center;gap:8px;flex:none}
.dhk_keys{min-width:104px;text-align:right;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dhk_keys_unset{color:var(--dsw-alias-label-tertiary);opacity:.75}
.dhk_tap,.dhk_mini{font:inherit;font-size:11.5px;line-height:18px;padding:3px 9px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;transition:filter .16s ease,color .16s ease,border-color .16s ease}
.dhk_mini:hover:not(:disabled),.dhk_tap:hover:not(:disabled){filter:brightness(1.07);color:var(--dsw-alias-label-primary)}
.dhk_mini:disabled,.dhk_tap:disabled{opacity:.45;cursor:default}
.dhk_mini_on,.dhk_tap_on{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent);color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent)}
.dhk_footer{display:flex;align-items:center;gap:10px;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}
.dhk_action_btn{font:inherit;font-size:12px;line-height:18px;padding:6px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer}
.dhk_action_btn:hover:not(:disabled){filter:brightness(1.06)}
.dhk_action_btn:disabled{opacity:.45;cursor:default}
.dhk_note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dhk_note_error{color:var(--dsw-alias-state-error-primary)}
.dhk_switch{display:inline-flex;align-items:center;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;background:0 0;border:0;padding:0;flex:none}
.dhk_switch i{width:36px;height:20px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);box-shadow:inset 0 1px 3px rgb(0 0 0 / 8%);position:relative;transition:background .2s ease,border-color .2s ease,box-shadow .2s ease;flex:none}
.dhk_switch i::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-secondary);box-shadow:0 1px 3px rgb(0 0 0 / 22%);transition:transform .26s cubic-bezier(.34,1.3,.64,1),background .2s ease,width .16s ease}
.dhk_switch:active i::after{width:17px}
.dhk_switch[aria-checked="true"] i{background:var(--dsw-alias-state-business-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 85%,#000);box-shadow:inset 0 1px 3px rgb(0 0 0 / 12%)}
.dhk_switch[aria-checked="true"] i::after{transform:translateX(16px);background:#fff}
.dhk_switch:focus-visible i{box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-business-primary) 22%,transparent)}
.dhk_switch:disabled{opacity:.5;cursor:default}
`

    // ── registration ────────────────────────────────────────────────────────
    /**
     * Apply this plugin's Client rows.
     * @param ctx - the Client root context of this plugin.
     */
    function apply(ctx) {
      appCtx = ctx
      const t = ctx.locale.bind(NS)
      boundT = t
      ctx.effect(() => ctx.locale.register(NS, { zh: DICT.zh, en: DICT.en }), 'dsh-hotkeys: dictionaries')

      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-plugin', 'dsh-hotkeys')
        style.textContent = CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'dsh-hotkeys: styles')

      ctx.effect(() => {
        const arm = () => armAudio()
        window.addEventListener('pointerdown', arm, { capture: true, once: true })
        window.addEventListener('keydown', arm, { capture: true, once: true })
        return () => {
          window.removeEventListener('pointerdown', arm, { capture: true })
          window.removeEventListener('keydown', arm, { capture: true })
        }
      }, 'dsh-hotkeys: audio arming')

      ctx.effect(() => {
        const clearPending = () => {
          pending = null
        }
        // Recording itself swallows keys, so it must be installed before any
        // other listener can act on them.
        window.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('pointerdown', clearPending, true)
        window.addEventListener('compositionstart', clearPending, true)
        return () => {
          window.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('pointerdown', clearPending, true)
          window.removeEventListener('compositionstart', clearPending, true)
          pending = null
        }
      }, 'dsh-hotkeys: keymap')

      void loadState()

      // The registry is published after the plugins load, so the send gesture is
      // resolved per keypress from the live service instead of being frozen here.
      ctx.inject(['shortcuts'], (scope) => {
        shortcutsOf = () => scope.shortcuts
      })

      ctx.inject(['uiSession'], (scoped) => {
        scoped.effect(() => watchSessions(scoped), 'dsh-hotkeys: reminder watcher')
      })

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'dsh-hotkeys',
        // After the shipped sections and the plugin section it should follow.
        order: 40,
        label: () => t('nav'),
        locale: NS,
      }, (props) => h(SettingsPage, { ...props, t: typeof props?.t === 'function' ? props.t : t })))
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
