/**
 * dsh-hotkeys — Host half.
 *
 * One place owns everything the browser cannot do for this plugin:
 *
 *   - persist the keymap, the master switch, and the two reminder switches;
 *   - raise the application window;
 *   - draw the bottom-right reminder card.
 *
 * The harness Host runs as a plain Node child of the Electron main process (see
 * the desktop runtime's `spawn(..., { stdio: [..., 'ipc'] })`), so `BrowserWindow`
 * is not reachable from here: the raise goes through `raise-window.ps1` and the
 * card through `toast-window.ps1` (WPF).
 *
 * Transport: the same same-origin JSON routes the other third-party bundles use
 * (`/api/<package>/...`), registered on the harness web server. Those routes
 * outrank the kernel's `/api` in longest-prefix dispatch, so every request runs
 * the trust fence below first instead of answering any loopback caller.
 *
 * @module dsh-hotkeys
 */

import { spawn } from 'node:child_process'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Route prefix this plugin owns. */
const ROUTE = '/api/dsh-hotkeys'
/** This package's own directory, used to find the window scripts. */
const HERE = dirname(fileURLToPath(import.meta.url))
/** The Win32 helper that raises the application window. */
const RAISE_SCRIPT = join(HERE, 'raise-window.ps1')
/** The WPF helper that draws the bottom-right card. */
const TOAST_SCRIPT = join(HERE, 'toast-window.ps1')
/** Process name of the desktop application whose window is raised. */
const WINDOW_PROCESS = 'DeepSeek Harness'
/** Longest a raise may take before the helper is killed. */
const RAISE_TIMEOUT_MS = 15000
/** State is a small object; anything larger is not this client. */
const MAX_BODY_BYTES = 65536
/** The logical modifiers a binding may carry. */
const MODIFIERS = new Set(['ctrl', 'alt', 'shift', 'meta'])
/** Defaults: only the composer pair is bound, so install changes nothing else. */
const DEFAULTS = Object.freeze({
  enabled: true,
  bindings: {
    'composer.send': { code: 'Enter', modifiers: [], double: true },
    'composer.newline': { code: 'Enter', modifiers: ['shift'], double: false },
  },
  reminder: { sound: true, raise: true },
})
/** Hostnames a same-machine caller can legitimately use. */
const LOOPBACK_NAMES = new Set(['127.0.0.1', '[::1]', '::1', 'localhost'])

/** Live state, mirrored to `dsh-hotkeys.json` in DSH_HOME. */
let state = structuredClone(DEFAULTS)
/** File holding the state, resolved once so DSH_HOME is read late enough. */
let stateFile = ''
/** Settles once the persisted state is in memory; every route waits for it. */
let ready = Promise.resolve()
/** Serializes writes so two switches flipped together cannot interleave. */
let writing = Promise.resolve()
/** One raise at a time: a burst of stops must not spawn a stack of helpers. */
let raising = false
/**
 * Late-bound `connection` lookup. The composition publishes that service after
 * plugins load, so the fence reads it per request instead of freezing absent.
 */
let connectionOf = () => undefined

/**
 * Apply this plugin's rows.
 * @param ctx - the Cordis context of the inserted row.
 */
export function apply(ctx) {
  connectionOf = () => (typeof ctx.get === 'function' ? ctx.get('connection') : undefined)
  stateFile = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-hotkeys.json')
  // The read is async; routes wait on it instead of racing a first write
  // against the file they are about to overwrite.
  ready = loadState()

  // `webServer` is published after plugins load, so the routes are registered
  // from the moment the service exists rather than from a snapshot read here.
  ctx.inject(['webServer'], (scoped) => {
    scoped.effect(
      () => scoped.webServer.register({ kind: 'prefix', path: ROUTE, handler: route }),
      'dsh-hotkeys: hotkey routes',
    )
    ctx.logger?.info?.(`dsh-hotkeys: state API mounted at ${ROUTE}`)
  })

  ctx.effect(() => () => {
    state = structuredClone(DEFAULTS)
  }, 'dsh-hotkeys: state')
}

/** Read the persisted state, falling back to the defaults. */
async function loadState() {
  try {
    state = sanitizeState(JSON.parse(await readFile(stateFile, 'utf8')))
  } catch {
    // First run, or a file that no longer parses: the defaults are the truth.
    state = structuredClone(DEFAULTS)
  }
}

/** Persist the current state through a temp file, so a crash cannot truncate it. */
function saveState() {
  const body = JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2) + '\n'
  const file = stateFile
  writing = writing
    .then(async () => {
      await mkdir(dirname(file), { recursive: true })
      const temp = `${file}.${process.pid}.tmp`
      await writeFile(temp, body, 'utf8')
      await rename(temp, file)
    })
    .catch(() => {})
  return writing
}

/** One binding, or null: physical key code, at most two modifiers, tap mode. */
function sanitizeBinding(value) {
  if (value === null || typeof value !== 'object') return null
  const code = typeof value.code === 'string' ? value.code : ''
  // `event.code` spellings only: KeyS, Digit1, Enter, Escape, F2, Comma, ...
  if (!/^[A-Za-z][A-Za-z0-9]{0,31}$/u.test(code)) return null
  const modifiers = Array.isArray(value.modifiers)
    ? [...new Set(value.modifiers.filter((modifier) => MODIFIERS.has(modifier)))].sort()
    : []
  if (modifiers.length > 2) return null
  return {
    code,
    modifiers,
    // Tap mode only means something without modifiers; anything else is a chord.
    double: modifiers.length === 0 && value.double === true,
  }
}

/** A whole state document, with unknown rows dropped and defaults filled in. */
function sanitizeState(value) {
  const source = value !== null && typeof value === 'object' ? value : {}
  const bindings = {}
  if (source.bindings !== null && typeof source.bindings === 'object') {
    for (const [id, binding] of Object.entries(source.bindings)) {
      if (!/^[A-Za-z][A-Za-z0-9.]{0,63}$/u.test(id)) continue
      const clean = sanitizeBinding(binding)
      if (clean !== null) bindings[id] = clean
    }
  }
  const reminder = source.reminder !== null && typeof source.reminder === 'object' ? source.reminder : {}
  return {
    enabled: source.enabled !== false,
    bindings,
    reminder: {
      sound: typeof reminder.sound === 'boolean' ? reminder.sound : DEFAULTS.reminder.sound,
      raise: typeof reminder.raise === 'boolean' ? reminder.raise : DEFAULTS.reminder.raise,
    },
  }
}

/**
 * Bring the application window to the front.
 * @returns {{ raised: boolean, reason: string }} the helper's verdict.
 */
async function raiseWindow() {
  if (process.platform !== 'win32') return { raised: false, reason: 'unsupported-platform' }
  if (raising) return { raised: false, reason: 'busy' }
  raising = true
  try {
    return await new Promise((resolve) => {
      let settled = false
      const finish = (value) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      let child
      try {
        child = spawn('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-WindowStyle',
          'Hidden',
          '-File',
          RAISE_SCRIPT,
          '-ProcessName',
          WINDOW_PROCESS,
        ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (error) {
        finish({ raised: false, reason: String(error?.message ?? error) })
        return
      }
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          // Already gone; the timeout is the answer either way.
        }
        finish({ raised: false, reason: 'timeout' })
      }, RAISE_TIMEOUT_MS)
      child.stdout?.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr?.on('data', (chunk) => {
        stderr += chunk
      })
      child.once('error', (error) => {
        clearTimeout(timer)
        finish({ raised: false, reason: String(error?.message ?? error) })
      })
      child.once('close', (code) => {
        clearTimeout(timer)
        const raised = code === 0 && stdout.includes('RAISED')
        const detail = (stdout.trim() || stderr.trim() || `exit ${String(code)}`).slice(0, 200)
        finish({ raised, reason: detail })
      })
    })
  } finally {
    raising = false
  }
}

/**
 * Draw the bottom-right card, fire-and-forget: it closes itself, and the Host
 * must not hold a request open for a window the user is about to dismiss.
 * @param kind - `done` or `question`, which picks the card's text.
 * @returns {{ shown: boolean, reason: string }} whether a card was started.
 */
function showNotice(kind) {
  if (process.platform !== 'win32') return { shown: false, reason: 'unsupported-platform' }
  try {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-File',
      TOAST_SCRIPT,
      '-Kind',
      kind,
      '-TimeoutMs',
      '6000',
    ], { windowsHide: true, stdio: 'ignore' })
    // The card is its own process; never let it keep this one alive or surface
    // as an unhandled 'error' event when PowerShell is missing.
    child.once('error', () => {})
    child.unref()
    return { shown: true, reason: 'started' }
  } catch (error) {
    return { shown: false, reason: String(error?.message ?? error) }
  }
}

/** One JSON response, never cached: every read must see the live state. */
function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** Read a small JSON body. */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('body too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  const parsed = JSON.parse(text)
  return parsed !== null && typeof parsed === 'object' ? parsed : {}
}

/** The plugin routes. */
async function route(req, res) {
  await ready
  const rejection = rejectionFor(req)
  if (rejection !== undefined) {
    return send(res, rejection, { error: rejection === 403 ? 'forbidden' : 'unauthorized' })
  }

  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname.slice(ROUTE.length).replace(/\/+$/u, '') || '/'
  const method = String(req.method ?? 'GET').toUpperCase()

  try {
    if (method === 'GET' && path === '/state') {
      return send(res, 200, { ...state, platform: process.platform })
    }
    if (method === 'POST' && path === '/state') {
      const body = await readJsonBody(req)
      const next = sanitizeState({
        enabled: typeof body.enabled === 'boolean' ? body.enabled : state.enabled,
        // A patch replaces only the rows it carries: dropping every other
        // binding on a single switch would be a silent keymap wipe.
        bindings: body.bindings !== null && typeof body.bindings === 'object'
          ? { ...state.bindings, ...body.bindings }
          : state.bindings,
        reminder: body.reminder !== null && typeof body.reminder === 'object'
          ? { ...state.reminder, ...body.reminder }
          : state.reminder,
      })
      // An explicit null clears a row; sanitizeState drops it, so apply the
      // deletions the patch asked for instead of resurrecting the old binding.
      if (body.bindings !== null && typeof body.bindings === 'object') {
        for (const [id, value] of Object.entries(body.bindings)) {
          if (value === null) delete next.bindings[id]
        }
      }
      const changed = JSON.stringify(next) !== JSON.stringify(state)
      state = next
      if (changed) await saveState()
      return send(res, 200, { ...state, platform: process.platform })
    }
    if (method === 'POST' && path === '/raise') {
      if (!state.reminder.raise) return send(res, 200, { raised: false, reason: 'disabled' })
      return send(res, 200, await raiseWindow())
    }
    if (method === 'POST' && path === '/notify') {
      // The card is the fallback for *not* raising the window: with the raise on
      // it would only repeat what the user already sees, and with the sound off
      // there is nothing to stand in for. Enforced here so the rule holds even if
      // a stale page asks.
      if (state.reminder.raise || !state.reminder.sound) {
        return send(res, 200, { shown: false, reason: 'policy' })
      }
      const body = await readJsonBody(req)
      const kind = body?.kind === 'question' ? 'question' : 'done'
      return send(res, 200, { kind, ...showNotice(kind) })
    }
    return send(res, 404, { error: 'not found' })
  } catch (error) {
    return send(res, 400, { error: String(error?.message ?? error).slice(0, 200) })
  }
}

/**
 * The trust fence for this plugin's routes.
 *
 * The kernel's `connection` service makes the same decision for `/api`; when the
 * composition mounts it, that decision wins. Otherwise the structural checks
 * below answer: loopback Host only, no cross-site fetches, and an
 * `Origin`/`Referer` that matches the Host authority whenever it is present.
 *
 * @param req - the incoming request.
 * @returns the HTTP status to reject with, or undefined to continue.
 */
function rejectionFor(req) {
  const connection = connectionOf()
  const admit = connection?.admit
  if (typeof admit === 'function') {
    try {
      const admission = admit.call(connection, req)
      const status = admission && typeof admission === 'object' ? admission.rejection : undefined
      if (status !== undefined) return status
      return undefined
    } catch {
      // Never bypass the browser's own authentication when the service fails.
      return 503
    }
  }
  return structuralReason(req) === undefined ? undefined : 403
}

/** Structural replica of the kernel's loopback/cross-site checks. */
function structuralReason(req) {
  const host = authorityOf(req?.headers?.host, 'http')
  if (host === null || !LOOPBACK_NAMES.has(host.hostname)) return 'host-not-loopback'
  if (String(req?.headers?.['sec-fetch-site'] ?? '').toLowerCase() === 'cross-site') return 'cross-site'
  for (const header of ['origin', 'referer']) {
    const raw = req?.headers?.[header]
    if (typeof raw !== 'string' || raw.trim() === '') continue
    const authority = authorityOf(raw.trim())
    if (authority === null) return `${header}-invalid`
    if (authority.scheme !== host.scheme || authority.hostname !== host.hostname || authority.port !== host.port) {
      return `${header}-mismatch`
    }
  }
  return undefined
}

/** Split a Host/Origin/Referer value into its scheme, host, and effective port. */
function authorityOf(value, defaultScheme) {
  if (typeof value !== 'string' || value.trim() === '') return null
  let url
  try {
    url = new URL(value.includes('://') ? value.trim() : `${defaultScheme ?? 'http'}://${value.trim()}`)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const port = url.port === '' ? (url.protocol === 'https:' ? '443' : '80') : url.port
  return { scheme: url.protocol.replace(':', ''), hostname: url.hostname.toLowerCase(), port }
}
