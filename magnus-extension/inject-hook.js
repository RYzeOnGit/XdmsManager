/**
 * Runs in the page main world (injected via <script src="chrome-extension://.../inject-hook.js">).
 * Hooks fetch + XHR so DM API JSON reaches the extension content script via postMessage.
 */
;(function magnusInjectHook() {
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

  function maybeHandleUrl(url) {
    const u = String(url || '')
    return u.includes('/dm/inbox') || u.includes('/dm/conversation') || u.includes('dm/inbox_timeline') || u.includes('dm/conversation')
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
