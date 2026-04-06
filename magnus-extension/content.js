const SIDEBAR_WIDTH = 340
const HOOK_ID = 'magnus-page-hook'

let sidebarInjected = false
let iframeEl = null
let peekEl = null
let collapsed = false
let skipBackendAnalyze = true
let lastExtractedMessages = []
let analyzeTimer = null
let analyzeInFlight = false

function getAnalyzeUrl(callback) {
  chrome.storage.sync.get({ magnusApiBase: 'http://localhost:3000' }, (r) => {
    const base = String(r.magnusApiBase || 'http://localhost:3000').replace(/\/$/, '')
    callback(`${base}/api/analyze`)
  })
}

function injectPageHook() {
  if (document.getElementById(HOOK_ID)) return
  const s = document.createElement('script')
  s.id = HOOK_ID
  s.src = chrome.runtime.getURL('inject-hook.js')
  s.onload = () => s.remove()
  ;(document.head || document.documentElement).appendChild(s)
}

function extractMessageTexts(data) {
  const seen = new Set()
  const out = []

  function pushText(t) {
    if (typeof t !== 'string') return
    const trimmed = t.trim()
    if (trimmed.length < 1 || trimmed.length > 8000) return
    if (seen.has(trimmed)) return
    seen.add(trimmed)
    out.push(trimmed)
  }

  function walk(node, depth) {
    if (depth > 40 || out.length > 400) return
    if (node == null) return
    if (typeof node === 'string') {
      return
    }
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, depth + 1))
      return
    }
    if (typeof node !== 'object') return

    if (node.message_data && typeof node.message_data === 'object') {
      const md = node.message_data
      if (typeof md.text === 'string') pushText(md.text)
    }
    if (typeof node.text === 'string' && node.id_str) {
      pushText(node.text)
    }
    if (typeof node.full_text === 'string') pushText(node.full_text)

    for (const k of Object.keys(node)) {
      if (k === 'urls' || k === 'user_id' || k === 'entities') continue
      walk(node[k], depth + 1)
    }
  }

  walk(data, 0)
  return out
}

function mergeMessages(batch) {
  const set = new Set(lastExtractedMessages)
  batch.forEach((t) => set.add(t))
  lastExtractedMessages = Array.from(set).slice(0, 500)
}

function postToIframe(message) {
  if (!iframeEl || !iframeEl.contentWindow) return
  try {
    iframeEl.contentWindow.postMessage(message, '*')
  } catch (_) {}
}

function scheduleAnalyze() {
  if (skipBackendAnalyze) return
  clearTimeout(analyzeTimer)
  analyzeTimer = setTimeout(() => runAnalyze(), 900)
}

function runAnalyze() {
  if (skipBackendAnalyze || analyzeInFlight) return
  const messages = lastExtractedMessages
  if (messages.length === 0) {
    postToIframe({
      type: 'MAGNUS_DATA',
      payload: {
        clusters: [],
        inboxHealthScore: 0,
        inboxHealthReason: 'No DM text captured yet — scroll your inbox or open a thread.',
        staledThreads: []
      },
      source: 'live'
    })
    return
  }

  analyzeInFlight = true
  postToIframe({ type: 'MAGNUS_LOADING' })

  getAnalyzeUrl((url) => {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((payload) => {
        postToIframe({ type: 'MAGNUS_DATA', payload, source: 'live' })
      })
      .catch((err) => {
        console.warn('[Magnus] analyze failed', err)
        postToIframe({
          type: 'MAGNUS_ERROR',
          message: err.message || 'Network error',
          retryable: true
        })
      })
      .finally(() => {
        analyzeInFlight = false
      })
  })
}

function onDmPayload(data) {
  const texts = extractMessageTexts(data)
  if (texts.length === 0) return
  mergeMessages(texts)
  scheduleAnalyze()
}

function nudgeLayout(px) {
  const main =
    document.querySelector('main') || document.querySelector('[data-testid="primaryColumn"]')
  if (main) {
    main.style.marginRight = `${px}px`
    main.style.transition = 'margin-right 0.3s ease'
  }
}

function ensurePeek() {
  if (peekEl) return peekEl
  peekEl = document.createElement('button')
  peekEl.id = 'magnus-peek'
  peekEl.type = 'button'
  peekEl.textContent = '⚡'
  peekEl.title = 'Open Magnus (⌃M / ⌘M)'
  peekEl.setAttribute('aria-label', 'Open Magnus sidebar')
  peekEl.addEventListener('click', () => setCollapsed(false))
  document.body.appendChild(peekEl)
  return peekEl
}

function setCollapsed(next) {
  collapsed = !!next
  const iframe = document.getElementById('magnus-sidebar')
  if (iframe) {
    iframe.classList.toggle('magnus-collapsed', collapsed)
    iframe.setAttribute('aria-hidden', collapsed ? 'true' : 'false')
  }
  if (peekEl) {
    peekEl.classList.toggle('magnus-peek-visible', collapsed)
  }
  nudgeLayout(collapsed ? 0 : SIDEBAR_WIDTH)
}

function toggleCollapsed() {
  setCollapsed(!collapsed)
}

function injectDmText(text) {
  const textarea = document.querySelector('[data-testid="dmComposerTextInput"]')
  if (!textarea) {
    console.warn('[Magnus] DM composer not found')
    return false
  }
  const proto = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
  if (proto && proto.set) {
    proto.set.call(textarea, text)
  } else {
    textarea.value = text
  }
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.focus()
  return true
}

function injectSidebar() {
  if (sidebarInjected) return
  if (!window.location.href.includes('/i/chat') && !window.location.href.includes('/messages')) {
    return
  }

  sidebarInjected = true
  injectPageHook()

  const iframe = document.createElement('iframe')
  iframe.id = 'magnus-sidebar'
  iframe.src = chrome.runtime.getURL('sidebar.html')
  iframe.setAttribute('title', 'Magnus')
  iframe.setAttribute('referrerpolicy', 'no-referrer')
  iframe.style.cssText = [
    'position:fixed',
    'top:0',
    'right:0',
    `width:${SIDEBAR_WIDTH}px`,
    'height:100vh',
    'border:none',
    'z-index:99999',
    'box-shadow:-8px 0 32px rgba(0,0,0,0.4)',
    'transition:transform 0.3s cubic-bezier(0.22,1,0.36,1)',
    'background:#0a0a0b'
  ].join(';')
  document.body.appendChild(iframe)
  iframeEl = iframe
  ensurePeek()
  nudgeLayout(collapsed ? 0 : SIDEBAR_WIDTH)
}

function removeSidebar() {
  const existing = document.getElementById('magnus-sidebar')
  if (existing) {
    existing.remove()
  }
  if (peekEl) {
    peekEl.remove()
    peekEl = null
  }
  iframeEl = null
  sidebarInjected = false
  nudgeLayout(0)
}

function onHookDetail(d) {
  if (!d || d.source !== 'magnus-hook' || d.data == null) return
  onDmPayload(d.data)
}

document.addEventListener(
  'magnus-dm',
  (e) => {
    onHookDetail(e.detail)
  },
  true
)

window.addEventListener('message', (e) => {
  if (!iframeEl || e.source !== iframeEl.contentWindow) return
  const t = e.data
  if (!t || typeof t.type !== 'string') return

  if (t.type === 'MAGNUS_INIT') {
    skipBackendAnalyze = !!t.demoMode
    if (!skipBackendAnalyze) {
      scheduleAnalyze()
    }
    return
  }

  if (t.type === 'MAGNUS_DEMO_MODE') {
    skipBackendAnalyze = !!t.demoMode
    if (!skipBackendAnalyze) {
      scheduleAnalyze()
    }
    return
  }

  if (t.type === 'MAGNUS_INJECT' && typeof t.text === 'string') {
    injectDmText(t.text)
    return
  }

  if (t.type === 'MAGNUS_RETRY') {
    if (!skipBackendAnalyze) {
      runAnalyze()
    }
    return
  }

  if (t.type === 'MAGNUS_TOGGLE_COLLAPSE') {
    toggleCollapsed()
    return
  }
})

document.addEventListener(
  'keydown',
  (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'm') return
    const el = e.target
    if (
      el &&
      (el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        (el.isContentEditable === true && el.getAttribute('role') !== 'switch'))
    ) {
      return
    }
    e.preventDefault()
    toggleCollapsed()
  },
  true
)

const observer = new MutationObserver(() => {
  if (window.location.href.includes('/i/chat') || window.location.href.includes('/messages')) {
    injectSidebar()
  } else {
    removeSidebar()
  }
})

console.log('[Magnus] content script loaded', window.location.href)
observer.observe(document.body, { childList: true, subtree: true })
injectSidebar()
