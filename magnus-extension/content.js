const SIDEBAR_WIDTH = 340

let sidebarInjected = false
let iframeEl = null
let peekEl = null
let collapsed = false
let skipBackendAnalyze = true
let lastExtractedMessages = []
/** Last messages from a dm/conversation.json response — best for composer context */
let lastThreadMessages = []
let analyzeTimer = null
let analyzeInFlight = false
let domPollInterval = null
let domScrapeObserver = null
let domScrapeDebounce = null

/** Composer: don't auto-fill after the user types; reset when box cleared or thread changes */
let userTypedInComposer = false
let magnusProgrammaticSet = false
let composerSuggestTimer = null
let composerSuggestInFlight = false
let lastPathForComposer = ''

const DEMO_COMPOSER_REPLY =
  "Hey — thanks for reaching out! I'd love to help. What are you hoping to get out of this — quick call or async? Happy to suggest a time this week."

function getAnalyzeUrl(callback) {
  chrome.storage.sync.get({ magnusApiBase: 'http://localhost:3000' }, (r) => {
    const base = String(r.magnusApiBase || 'http://localhost:3000').replace(/\/$/, '')
    callback(`${base}/api/analyze`)
  })
}

function getSuggestUrl(callback) {
  chrome.storage.sync.get({ magnusApiBase: 'http://localhost:3000' }, (r) => {
    const base = String(r.magnusApiBase || 'http://localhost:3000').replace(/\/$/, '')
    callback(`${base}/api/suggest-reply`)
  })
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
    if (depth > 45 || out.length > 400) return
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
    if (typeof node.text === 'string' && node.text.length > 0) {
      const hasId =
        node.id_str ||
        node.rest_id ||
        typeof node.id === 'string' ||
        typeof node.id === 'number' ||
        node.message_data ||
        node.conversation_id ||
        node.dm_conversation_id ||
        node.conversationId ||
        node.dmConversationId ||
        node.sender_id_str ||
        node.recipient_id_str
      if (hasId) pushText(node.text)
    }
    if (node.legacy && typeof node.legacy.full_text === 'string') {
      pushText(node.legacy.full_text)
    }
    if (typeof node.full_text === 'string') pushText(node.full_text)
    if (typeof node.snippet === 'string' && node.snippet.trim().length > 1) {
      pushText(node.snippet)
    }
    for (const k of ['preview', 'previewText', 'lastMessageText', 'subtitle', 'sortPreview']) {
      if (typeof node[k] === 'string' && node[k].trim().length > 1) pushText(node[k])
    }

    for (const k of Object.keys(node)) {
      if (k === 'urls' || k === 'user_id' || k === 'entities') continue
      walk(node[k], depth + 1)
    }
  }

  /** GraphQL DM objects often use __typename + text without id_str */
  function walkGraphqlMessages(node, depth) {
    if (depth > 45 || out.length > 400) return
    if (node == null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach((item) => walkGraphqlMessages(item, depth + 1))
      return
    }
    const tn = node.__typename
    if (typeof tn === 'string') {
      const isLikelyMessage =
        /(^|_)(Message|DirectMessage|DmMessage|ConversationMessage)/i.test(tn) || /^Dm/i.test(tn)
      if (isLikelyMessage) {
        if (typeof node.text === 'string' && node.text.length > 0) pushText(node.text)
        if (node.legacy && typeof node.legacy.full_text === 'string') pushText(node.legacy.full_text)
      }
    }
    for (const k of Object.keys(node)) {
      if (k === 'urls' || k === 'user_id' || k === 'entities') continue
      walkGraphqlMessages(node[k], depth + 1)
    }
  }

  walk(data, 0)
  walkGraphqlMessages(data, 0)
  return out
}

/**
 * Scrape visible DM text from the page. On /i/chat with no thread open, message bubbles don't
 * exist — only the inbox list with conversation previews. We use multiple strategies:
 * 1. Specific data-testid selectors for known X elements
 * 2. Broad sweep of user-generated text (dir="auto" elements, common patterns)
 */
function scrapeMessagesFromDom() {
  const seen = new Set()
  const out = []
  const UI_NOISE = /^(you:|start conversation|new chat|search|chat|all|messages|settings|compose|home|explore|notifications|lists|bookmarks|communities|premium|profile|more|grok)$/i

  function add(raw) {
    if (typeof raw !== 'string') return
    const trimmed = raw.trim()
    if (trimmed.length < 5 || trimmed.length > 8000) return
    if (/^\d{1,2}[mhds]$/.test(trimmed)) return
    if (UI_NOISE.test(trimmed)) return
    if (seen.has(trimmed)) return
    seen.add(trimmed)
    out.push(trimmed)
  }

  function safeQsa(root, sel) {
    try {
      return root.querySelectorAll(sel)
    } catch (_) {
      return []
    }
  }

  const specificSelectors = [
    '[data-testid="messageText"]',
    '[data-testid="tweetText"]',
    '[data-testid="conversation"]',
    '[data-testid="UserCell"]',
    '[data-testid="cellInnerDiv"]',
    '[data-testid="DMInboxItem"]',
    '[data-testid="DmListItem"]'
  ]

  for (const sel of specificSelectors) {
    safeQsa(document, sel).forEach((el) => add(el.textContent))
  }

  if (out.length === 0) {
    const root = document.querySelector('main') || document.body
    safeQsa(root, '[dir="auto"]').forEach((el) => {
      const txt = (el.textContent || '').trim()
      if (txt.length >= 8 && txt.length <= 4000) add(txt)
    })
  }

  if (out.length === 0) {
    const root = document.querySelector('main') || document.body
    safeQsa(root, '[role="listitem"], [role="option"], [role="link"]').forEach((el) => {
      const txt = (el.textContent || '').trim()
      if (txt.length >= 8 && txt.length <= 4000) add(txt)
    })
  }

  return out
}

function tryDomScrapeMerge() {
  if (skipBackendAnalyze) return
  const path = window.location.pathname || ''
  const href = window.location.href || ''
  if (
    !path.includes('/messages') &&
    !path.includes('/i/chat') &&
    !href.includes('/messages') &&
    !href.includes('/i/chat')
  ) {
    return
  }
  const texts = scrapeMessagesFromDom()
  if (texts.length === 0) return
  mergeMessages(texts)
  if (document.querySelector('[data-testid="dmComposerTextInput"]')) {
    lastThreadMessages = texts.slice(0, 120)
  }
  scheduleAnalyze()
}

function startDomScrapePoll() {
  if (domPollInterval != null) return
  domPollInterval = window.setInterval(() => tryDomScrapeMerge(), 2500)
}

function stopDomScrapePoll() {
  if (domPollInterval != null) {
    window.clearInterval(domPollInterval)
    domPollInterval = null
  }
}

function setupDomScrapeObserver() {
  if (domScrapeObserver) return
  domScrapeObserver = new MutationObserver(() => {
    if (skipBackendAnalyze) return
    clearTimeout(domScrapeDebounce)
    domScrapeDebounce = setTimeout(() => tryDomScrapeMerge(), 450)
  })
  const target = document.querySelector('main') || document.body
  domScrapeObserver.observe(target, { childList: true, subtree: true })
}

function teardownDomScrapeObserver() {
  if (domScrapeObserver) {
    domScrapeObserver.disconnect()
    domScrapeObserver = null
  }
  if (domScrapeDebounce != null) {
    clearTimeout(domScrapeDebounce)
    domScrapeDebounce = null
  }
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

function onHookDetail(d) {
  if (!d || d.source !== 'magnus-hook' || d.data == null) return
  const url = String(d.url || '')
  const texts = extractMessageTexts(d.data)
  if (texts.length === 0) return
  mergeMessages(texts)
  if (
    url.includes('conversation') ||
    /\/i\/chat\//i.test(url) ||
    /graphql.*(conversation|dm|directmessage|message)/i.test(url)
  ) {
    lastThreadMessages = texts.slice(0, 120)
  }
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
  magnusProgrammaticSet = true
  if (proto && proto.set) {
    proto.set.call(textarea, text)
  } else {
    textarea.value = text
  }
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.focus()
  queueMicrotask(() => {
    magnusProgrammaticSet = false
  })
  return true
}

function maybeResetComposerForNavigation() {
  const p = window.location.pathname || ''
  if (lastPathForComposer === '') {
    lastPathForComposer = p
    return
  }
  if (p !== lastPathForComposer) {
    lastPathForComposer = p
    userTypedInComposer = false
  }
}

function isDmComposer(el) {
  return el && el.getAttribute && el.getAttribute('data-testid') === 'dmComposerTextInput'
}

function scheduleComposerSuggest() {
  clearTimeout(composerSuggestTimer)
  composerSuggestTimer = setTimeout(() => {
    tryComposerSuggest()
  }, 380)
}

function tryComposerSuggest() {
  maybeResetComposerForNavigation()
  const ta = document.querySelector('[data-testid="dmComposerTextInput"]')
  if (!ta || !isDmComposer(ta)) return
  if (userTypedInComposer) return
  if (composerSuggestInFlight) return
  requestComposerSuggestion()
}

function requestComposerSuggestion() {
  const msgs =
    lastThreadMessages.length > 0
      ? lastThreadMessages
      : lastExtractedMessages.slice(0, 50)
  if (msgs.length === 0) {
    return
  }

  if (skipBackendAnalyze) {
    injectDmText(DEMO_COMPOSER_REPLY)
    return
  }

  composerSuggestInFlight = true
  getSuggestUrl((url) => {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs })
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        const text = typeof data.text === 'string' ? data.text.trim() : ''
        if (text) injectDmText(text)
      })
      .catch((err) => {
        console.warn('[Magnus] suggest-reply failed', err)
      })
      .finally(() => {
        composerSuggestInFlight = false
      })
  })
}

document.addEventListener(
  'focusin',
  (e) => {
    if (!isDmComposer(e.target)) return
    maybeResetComposerForNavigation()
    scheduleComposerSuggest()
  },
  true
)

document.addEventListener(
  'click',
  (e) => {
    if (!isDmComposer(e.target)) return
    scheduleComposerSuggest()
  },
  true
)

document.addEventListener(
  'input',
  (e) => {
    if (!isDmComposer(e.target)) return
    if (magnusProgrammaticSet) return
    const v = (e.target.value || '').trim()
    if (v.length === 0) {
      userTypedInComposer = false
    } else {
      userTypedInComposer = true
    }
  },
  true
)

function injectSidebar() {
  if (sidebarInjected) return
  if (!window.location.href.includes('/i/chat') && !window.location.href.includes('/messages')) {
    return
  }

  sidebarInjected = true

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
  startDomScrapePoll()
  setupDomScrapeObserver()
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
  stopDomScrapePoll()
  teardownDomScrapeObserver()
  nudgeLayout(0)
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
      tryDomScrapeMerge()
      scheduleAnalyze()
    }
    return
  }

  if (t.type === 'MAGNUS_DEMO_MODE') {
    skipBackendAnalyze = !!t.demoMode
    if (!skipBackendAnalyze) {
      tryDomScrapeMerge()
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
