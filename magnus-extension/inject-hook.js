/**
 * Runs in the page main world via manifest world:"MAIN" at document_start.
 * Hooks fetch + XHR so DM API JSON reaches the content script via CustomEvent.
 */
;(function magnusInjectHook() {
  if (window.__magnusHookInstalled) return
  window.__magnusHookInstalled = true
  const TAG = 'magnus-hook'

  function emit(kind, url, data) {
    try {
      document.dispatchEvent(
        new CustomEvent('magnus-dm', {
          detail: { source: TAG, kind, url: String(url || ''), data },
          bubbles: true
        })
      )
    } catch (_) {}
  }

  function isDmSurface() {
    try {
      const p = (window.location.pathname || '').toLowerCase()
      return p.includes('/messages') || p.includes('/i/chat') || p.includes('/dm')
    } catch (_) {
      return false
    }
  }

  /**
   * X serves DMs via GraphQL under /i/api/graphql/<hash>/<OpName>. Op names change; some URLs are
   * hash-only in practice. On DM routes, capture all GraphQL JSON so we never miss timelines.
   */
  function maybeHandleUrl(url) {
    const u = String(url || '')
    const l = u.toLowerCase()
    if (
      l.includes('/dm/') ||
      l.includes('dm/inbox') ||
      l.includes('dm/conversation') ||
      l.includes('inbox_timeline') ||
      l.includes('conversation_timeline')
    ) {
      return true
    }
    if (l.includes('/i/api/') && (l.includes('/dm') || l.includes('dm_'))) {
      return true
    }
    if (l.includes('/i/api/graphql/')) {
      if (isDmSurface()) return true
      return /dm|directmessage|conversation|inbox|message|chat|slice|timeline|notification|typing|entry/i.test(
        u
      )
    }
    return false
  }

  const origFetch = window.fetch
  window.fetch = async function (...args) {
    const response = await origFetch.apply(this, args)
    try {
      let url = ''
      if (typeof args[0] === 'string') url = args[0]
      else if (args[0] && typeof args[0] === 'object' && 'url' in args[0]) url = args[0].url
      if (!maybeHandleUrl(url)) return response
      const clone = response.clone()
      clone
        .json()
        .then((data) => emit('fetch', url, data))
        .catch(() => {})
    } catch (_) {}
    return response
  }

  const XHR = XMLHttpRequest.prototype
  const origOpen = XHR.open
  const origSend = XHR.send

  XHR.open = function (method, url, ...rest) {
    this._magnusUrl = url
    return origOpen.apply(this, [method, url, ...rest])
  }

  XHR.send = function (...sendArgs) {
    this.addEventListener('load', function () {
      try {
        const url = this._magnusUrl || ''
        if (!maybeHandleUrl(url)) return
        const text = this.responseText
        if (!text || text.length > 12e6) return
        const data = JSON.parse(text)
        emit('xhr', url, data)
      } catch (_) {}
    })
    return origSend.apply(this, sendArgs)
  }
})()
