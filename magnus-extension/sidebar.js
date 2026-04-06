const DEMO_DATA = {
  clusters: [
    {
      clusterTitle: 'Partnership Pitch — B2B Payments',
      oneLiner: 'Funded founder seeking revenue-share collab, sent 3 follow-ups',
      intentType: 'collab_pitch',
      senderType: 'founder',
      opportunityScore: 80,
      opportunityReason:
        'Persistent outreach from a founder with a clear ask — high signal',
      urgency: 'high',
      urgencyTrigger: '3 follow-ups with no reply',
      actionType: 'reply_needed',
      representativeMessages: [
        "Hey! I'm building a B2B payments tool and think there's a sick collab opp here. Would love to chat",
        'Following up on my message from last week!',
        "One more bump — let me know if you're interested 🙏"
      ],
      unreadCount: 3,
      daysSinceLastReply: 7,
      suggestedReply: {
        warm:
          "Hey! Really sorry for the slow reply — been heads down building. Would love to hear more about what you're working on. Can you share a quick overview?",
        professional:
          "Thanks for reaching out and for the follow-ups. I'd be open to a brief call to understand the collaboration opportunity better. What does your availability look like?",
        brief: "Hey! Interested — send me more details and let's find a time this week."
      },
      followUpSuggestion: 'If no reply in 3 days, offer a specific 15-min slot',
      confidence: 0.9
    },
    {
      clusterTitle: 'Investor Sniff — AI Tooling',
      oneLiner: 'Seed fund partner exploring the AI tooling space after your tweet',
      intentType: 'investor_sniff',
      senderType: 'investor',
      opportunityScore: 90,
      opportunityReason:
        'Named fund, specific trigger (your tweet), and direct interest signal',
      urgency: 'medium',
      urgencyTrigger: null,
      actionType: 'reply_needed',
      representativeMessages: [
        "Hi, saw your tweet about AI tooling. I'm a partner at a seed fund and we're actively looking at this space"
      ],
      unreadCount: 1,
      daysSinceLastReply: null,
      suggestedReply: {
        warm:
          "Hey! Always great to connect with people exploring this space. What specifically caught your eye — happy to share what we're seeing too.",
        professional:
          "Thanks for reaching out. We'd be happy to share our perspective on the AI tooling landscape. Would a 20-min call work?",
        brief: "Hey! Happy to connect — what's your fund's thesis in this space?"
      },
      followUpSuggestion: 'Schedule a call within 48 hours while interest is fresh',
      confidence: 0.95
    },
    {
      clusterTitle: 'Intro Request — Vercel Team',
      oneLiner: 'Asking for a warm intro with no context provided',
      intentType: 'intro_request',
      senderType: 'unknown',
      opportunityScore: 20,
      opportunityReason: 'No mutual benefit or context — qualify before forwarding',
      urgency: 'low',
      urgencyTrigger: null,
      actionType: 'needs_intro',
      representativeMessages: ['Hey can you intro me to the Vercel team?'],
      unreadCount: 1,
      daysSinceLastReply: null,
      suggestedReply: {
        warm:
          "Hey! Before I make the intro, can you share a bit about what you're building and why Vercel specifically? Want to make sure it's a good fit for both sides.",
        professional:
          "Happy to facilitate introductions where there's clear mutual value. Could you share more context on your project and what you're hoping to explore with Vercel?",
        brief: 'Sure — but what is the context? What are you building?'
      },
      followUpSuggestion: null,
      confidence: 0.8
    },
    {
      clusterTitle: 'Recruiter Spam',
      oneLiner: 'Duplicate recruiting message — safe to ignore',
      intentType: 'recruiting',
      senderType: 'recruiter',
      opportunityScore: 10,
      opportunityReason: 'Copy-paste outreach, sent twice, no personalization',
      urgency: 'low',
      urgencyTrigger: null,
      actionType: 'safe_to_ignore',
      representativeMessages: [
        "We're hiring senior engineers, think you'd be a great fit",
        "We're hiring senior engineers, think you'd be a great fit"
      ],
      unreadCount: 2,
      daysSinceLastReply: null,
      suggestedReply: {
        warm: "Thanks for thinking of me! Not looking right now but I'll keep you in mind.",
        professional:
          "Appreciate the outreach. I'm not actively seeking new opportunities at this time.",
        brief: 'Not looking — thanks though.'
      },
      followUpSuggestion: null,
      confidence: 0.85
    }
  ],
  inboxHealthScore: 70,
  inboxHealthReason: '2 hot leads need replies — investor and collab pitch going cold',
  staledThreads: [
    {
      name: 'Priya @ Stripe',
      daysSince: 9,
      lastMessage: "Let me know if you're down to connect! No rush :)",
      revivalDraft:
        "Hey Priya! So sorry for going quiet — things got hectic. Would still love to connect, are you around this week?"
    },
    {
      name: 'dev_marco',
      daysSince: 14,
      lastMessage: 'Thought you might find this interesting — lmk what you think',
      revivalDraft:
        "Hey Marco! Just circling back — I actually did read what you sent and thought it was really interesting. Would love to chat more about it."
    }
  ]
}

const EMPTY_DATA = {
  clusters: [],
  inboxHealthScore: 0,
  inboxHealthReason: '',
  staledThreads: []
}

let activeLiveData = null
let demoMode = localStorage.getItem('magnus_demo_mode') !== 'false'
let currentTab = 'priority'
let expandedCard = null
let currentTones = {}
let healthAnimToken = 0

function getData() {
  if (demoMode) return DEMO_DATA
  return activeLiveData || EMPTY_DATA
}

function senderIcon(type) {
  const map = {
    founder: '🟢',
    investor: '🔵',
    recruiter: '🟡',
    spam: '🔴',
    unknown: '⚪',
    friend: '🟣'
  }
  return map[type] || '⚪'
}

function senderPillClass(type) {
  const map = {
    founder: 'pill-founder',
    investor: 'pill-investor',
    recruiter: 'pill-recruiter'
  }
  return map[type] || 'pill-type'
}

function scoreClass(score) {
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

function intentLabel(type) {
  const map = {
    collab_pitch: 'Collab Pitch',
    investor_sniff: 'Investor',
    intro_request: 'Intro Req',
    recruiting: 'Recruiting',
    fan_message: 'Fan',
    friend_checkin: 'Friend',
    spam: 'Spam',
    customer: 'Customer'
  }
  return map[type] || type
}

function renderClusterCard(cluster, index) {
  const sc = scoreClass(cluster.opportunityScore)
  const tone = currentTones[index] || 'warm'
  const reply = cluster.suggestedReply[tone]
  const isExpanded = expandedCard === index

  return `
      <div class="cluster-card urgency-${cluster.urgency} ${isExpanded ? 'expanded' : ''}"
           id="card-${index}"
           onclick="toggleCard(${index}, event)">
        <div class="card-header">
          <div class="card-icon ${cluster.senderType}">${senderIcon(cluster.senderType)}</div>
          <div class="card-main">
            <div class="card-title">${cluster.clusterTitle}</div>
            <div class="card-oneliner">${cluster.oneLiner}</div>
            <div class="card-meta">
              <span class="pill pill-score ${sc}">⚡ ${cluster.opportunityScore}</span>
              <span class="pill ${senderPillClass(cluster.senderType)}">${cluster.senderType}</span>
              <span class="pill pill-type">${intentLabel(cluster.intentType)}</span>
              ${cluster.unreadCount > 1 ? `<span class="pill pill-type">${cluster.unreadCount} msgs</span>` : ''}
            </div>
          </div>
          <div class="score-number ${sc}">${cluster.opportunityScore}</div>
        </div>
        <div class="card-body" onclick="event.stopPropagation()">
          <div class="card-body-inner">
            <div class="messages-preview">
              ${cluster.representativeMessages
                .slice(0, 2)
                .map((m) => `<div class="message-bubble">"${m}"</div>`)
                .join('')}
            </div>
            <div class="opportunity-reason">${cluster.opportunityReason}</div>
            <div class="reply-section">
              <div class="reply-label">Suggested reply</div>
              <div class="tone-tabs">
                <button class="tone-btn ${tone === 'warm' ? 'active' : ''}" onclick="setTone(${index}, 'warm', event)">Warm</button>
                <button class="tone-btn ${tone === 'professional' ? 'active' : ''}" onclick="setTone(${index}, 'professional', event)">Pro</button>
                <button class="tone-btn ${tone === 'brief' ? 'active' : ''}" onclick="setTone(${index}, 'brief', event)">Brief</button>
              </div>
              <div class="reply-text" id="reply-${index}">${reply}</div>
              <div class="action-row">
                <button class="btn btn-primary" onclick="injectReply(${index}, event)">Inject into DM</button>
                <button class="btn btn-ghost" onclick="dismissCard(${index}, event)">Dismiss</button>
              </div>
              ${
                cluster.followUpSuggestion
                  ? `
                <div class="followup-hint">
                  <div class="followup-hint-icon">💡</div>
                  <div class="followup-hint-text">${cluster.followUpSuggestion}</div>
                </div>`
                  : ''
              }
            </div>
          </div>
        </div>
      </div>`
}

function renderStaleCard(thread, index) {
  return `
      <div class="stale-card">
        <div class="stale-row">
          <div class="stale-name">${thread.name}</div>
          <div class="stale-days">${thread.daysSince}d ago</div>
        </div>
        <div class="stale-msg">"${thread.lastMessage}"</div>
        <button class="btn-revive" onclick="reviveThread(${index}, event)">↩ Revive conversation</button>
      </div>`
}

function renderPriorityView(data) {
  const high = data.clusters.filter((c) => c.urgency === 'high')
  const medium = data.clusters.filter((c) => c.urgency === 'medium')
  const low = data.clusters.filter((c) => c.urgency === 'low')
  let html = ''
  if (high.length) {
    html += `<div class="section-label"><div class="section-label-dot" style="background:var(--red)"></div><div class="section-label-text" style="color:var(--red)">Hot</div><div class="section-label-line"></div></div>`
    html += high.map((c) => renderClusterCard(c, data.clusters.indexOf(c))).join('')
  }
  if (medium.length) {
    html += `<div class="section-label"><div class="section-label-dot" style="background:var(--amber)"></div><div class="section-label-text" style="color:var(--amber)">Warm</div><div class="section-label-line"></div></div>`
    html += medium.map((c) => renderClusterCard(c, data.clusters.indexOf(c))).join('')
  }
  if (low.length) {
    html += `<div class="section-label"><div class="section-label-dot" style="background:var(--muted2)"></div><div class="section-label-text" style="color:var(--muted)">Low signal</div><div class="section-label-line"></div></div>`
    html += low.map((c) => renderClusterCard(c, data.clusters.indexOf(c))).join('')
  }
  return html
}

function renderStaleView(data) {
  if (!data.staledThreads || data.staledThreads.length === 0) {
    return `<div class="empty-state"><div class="empty-icon">✨</div><div class="empty-title">All caught up</div><div class="empty-sub">No stale threads — you're on top of your DMs.</div></div>`
  }
  return data.staledThreads.map((t, i) => renderStaleCard(t, i)).join('')
}

function renderAllView(data) {
  return data.clusters.map((c, i) => renderClusterCard(c, i)).join('')
}

function render(data) {
  const area = document.getElementById('scrollArea')
  if (!area) return
  let html = ''
  if (currentTab === 'priority') html = renderPriorityView(data)
  else if (currentTab === 'stale') html = renderStaleView(data)
  else html = renderAllView(data)

  if (!html.trim() && currentTab === 'priority') {
    html = `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No priority clusters</div><div class="empty-sub">Nothing urgent right now — check All or Stale.</div></div>`
  }
  if (!html.trim() && currentTab === 'all') {
    html = `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No clusters yet</div><div class="empty-sub">Open threads or wait for inbox data to load.</div></div>`
  }

  area.innerHTML = html
}

function setBadges(data) {
  const priorityBadgeEl = document.getElementById('priorityBadge')
  const staleBadgeEl = document.getElementById('staleBadge')
  if (priorityBadgeEl) {
    priorityBadgeEl.textContent = data.clusters.filter((c) => c.urgency !== 'low').length
  }
  if (staleBadgeEl) {
    staleBadgeEl.textContent = data.staledThreads ? data.staledThreads.length : 0
  }
}

function animateHealthScore(target, reasonText) {
  const scoreEl = document.getElementById('healthScore')
  const reasonEl = document.getElementById('healthReason')
  const fillEl = document.getElementById('healthFill')
  if (!scoreEl || !fillEl) return

  healthAnimToken += 1
  const token = healthAnimToken
  const duration = 1100
  const start = performance.now()
  const from = 0
  const ease = (t) => 1 - Math.pow(1 - t, 3)

  function frame(now) {
    if (token !== healthAnimToken) return
    const u = Math.min(1, (now - start) / duration)
    const val = Math.round(from + (target - from) * ease(u))
    scoreEl.innerHTML = `${val}<span>/100</span>`
    fillEl.style.width = `${val}%`
    if (reasonEl && u > 0.25) reasonEl.textContent = reasonText || ''
    if (u < 1) requestAnimationFrame(frame)
    else {
      scoreEl.innerHTML = `${target}<span>/100</span>`
      fillEl.style.width = `${target}%`
      if (reasonEl) reasonEl.textContent = reasonText || ''
    }
  }
  requestAnimationFrame(frame)
}

function hideError() {
  const b = document.getElementById('errorBanner')
  if (b) b.hidden = true
}

function showError(msg) {
  const b = document.getElementById('errorBanner')
  const m = document.getElementById('errorBannerMsg')
  if (m) m.textContent = msg || 'Could not reach the analyze API.'
  if (b) b.hidden = false
}

function showLoadingSkeletonInScroll() {
  const area = document.getElementById('scrollArea')
  if (!area) return
  area.innerHTML = `
    <div class="loading-state" id="loadingStateLive">
      <div class="skeleton" style="height:80px">
        <div class="skeleton-line long" style="margin-top:16px"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line short"></div>
      </div>
      <div class="skeleton" style="height:72px">
        <div class="skeleton-line medium" style="margin-top:16px"></div>
        <div class="skeleton-line long"></div>
        <div class="skeleton-line short"></div>
      </div>
    </div>`
}

function applyDataAndFinishUi(data) {
  hideError()
  const analyzingEl = document.getElementById('analyzingBar')
  document.getElementById('loadingState')?.remove()
  document.getElementById('loadingStateLive')?.remove()
  if (analyzingEl) analyzingEl.style.display = 'none'

  setBadges(data)
  animateHealthScore(data.inboxHealthScore || 0, data.inboxHealthReason || '')
  render(data)
}

function bootDemo() {
  setTimeout(() => {
    applyDataAndFinishUi(DEMO_DATA)
  }, 1800)
}

function showLiveWaitingShell() {
  const analyzingEl = document.getElementById('analyzingBar')
  if (analyzingEl) analyzingEl.style.display = 'flex'
  const scoreEl = document.getElementById('healthScore')
  const reasonEl = document.getElementById('healthReason')
  const fillEl = document.getElementById('healthFill')
  if (scoreEl) scoreEl.innerHTML = `—<span>/100</span>`
  if (reasonEl) reasonEl.textContent = 'Listening for X DM traffic…'
  if (fillEl) fillEl.style.width = '0%'
  showLoadingSkeletonInScroll()
  setBadges(EMPTY_DATA)
}

function toggleCard(index, e) {
  if (e && e.target && e.target.closest && e.target.closest('button')) return
  expandedCard = expandedCard === index ? null : index
  render(getData())
}

function setTone(index, tone, e) {
  e.stopPropagation()
  const data = getData()
  currentTones[index] = tone
  const replyEl = document.getElementById(`reply-${index}`)
  if (replyEl && data.clusters[index]) {
    replyEl.style.opacity = '0.4'
    setTimeout(() => {
      replyEl.textContent = data.clusters[index].suggestedReply[tone]
      replyEl.style.opacity = '1'
      replyEl.style.transition = 'opacity 0.2s'
    }, 120)
  }
  const card = document.getElementById(`card-${index}`)
  if (card) {
    card.querySelectorAll('.tone-btn').forEach((btn) => btn.classList.remove('active'))
    e.target.classList.add('active')
  }
}

function injectReply(index, e) {
  e.stopPropagation()
  const data = getData()
  const tone = currentTones[index] || 'warm'
  const reply = data.clusters[index].suggestedReply[tone]
  const btn = e.target
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'MAGNUS_INJECT', text: reply }, '*')
  }
  btn.textContent = '✓ Injected!'
  btn.style.background = 'var(--green)'
  btn.style.color = '#000'
  setTimeout(() => {
    btn.textContent = 'Inject into DM'
    btn.style.background = ''
    btn.style.color = ''
  }, 2000)
}

function dismissCard(index, e) {
  e.stopPropagation()
  const card = document.getElementById(`card-${index}`)
  if (card) {
    card.style.opacity = '0'
    card.style.transform = 'translateX(20px)'
    card.style.transition = 'all 0.2s ease'
    setTimeout(() => card.remove(), 200)
  }
}

function reviveThread(index, e) {
  const data = getData()
  const thread = data.staledThreads[index]
  if (!thread) return
  const btn = e && e.target ? e.target : null
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'MAGNUS_INJECT', text: thread.revivalDraft }, '*')
  }
  if (btn) {
    btn.textContent = '✓ Injected!'
    btn.style.background = 'rgba(61,255,160,0.2)'
    setTimeout(() => {
      btn.textContent = '↩ Revive conversation'
      btn.style.background = ''
    }, 2000)
  }
}

function switchTab(tab, el) {
  currentTab = tab
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'))
  el.classList.add('active')
  expandedCard = null
  render(getData())
}

window.addEventListener('message', (e) => {
  const t = e.data
  if (!t || typeof t.type !== 'string') return

  if (t.type === 'MAGNUS_LOADING' && !demoMode) {
    showLoadingSkeletonInScroll()
    return
  }

  if (t.type === 'MAGNUS_DATA') {
    if (demoMode) return
    activeLiveData = t.payload || EMPTY_DATA
    applyDataAndFinishUi(activeLiveData)
    return
  }

  if (t.type === 'MAGNUS_ERROR') {
    if (demoMode) return
    showError(t.message)
    const analyzingEl = document.getElementById('analyzingBar')
    if (analyzingEl) analyzingEl.style.display = 'none'
    document.getElementById('loadingState')?.remove()
    document.getElementById('loadingStateLive')?.remove()
    return
  }
})

function postParent(msg) {
  if (window.parent !== window) window.parent.postMessage(msg, '*')
}

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('demoModeToggle')
  if (toggle) toggle.checked = demoMode

  document.getElementById('collapseBtn')?.addEventListener('click', () => {
    postParent({ type: 'MAGNUS_TOGGLE_COLLAPSE' })
  })

  document.getElementById('errorRetryBtn')?.addEventListener('click', () => {
    hideError()
    postParent({ type: 'MAGNUS_RETRY' })
    if (!demoMode) {
      showLoadingSkeletonInScroll()
      const analyzingEl = document.getElementById('analyzingBar')
      if (analyzingEl) analyzingEl.style.display = 'flex'
    }
  })

  toggle?.addEventListener('change', () => {
    demoMode = !!toggle.checked
    localStorage.setItem('magnus_demo_mode', demoMode ? 'true' : 'false')
    expandedCard = null
    currentTones = {}
    postParent({ type: 'MAGNUS_DEMO_MODE', demoMode })
    if (demoMode) {
      activeLiveData = null
      hideError()
      const analyzingEl = document.getElementById('analyzingBar')
      if (analyzingEl) analyzingEl.style.display = 'flex'
      const scoreEl = document.getElementById('healthScore')
      const reasonEl = document.getElementById('healthReason')
      const fillEl = document.getElementById('healthFill')
      if (scoreEl) scoreEl.innerHTML = `—<span>/100</span>`
      if (reasonEl) reasonEl.textContent = 'Analyzing your DMs...'
      if (fillEl) fillEl.style.width = '0%'
      const area = document.getElementById('scrollArea')
      if (area) {
        area.innerHTML = `
    <div class="loading-state" id="loadingState">
      <div class="skeleton" style="height:80px">
        <div class="skeleton-line long" style="margin-top:16px"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line short"></div>
      </div>
      <div class="skeleton" style="height:72px">
        <div class="skeleton-line medium" style="margin-top:16px"></div>
        <div class="skeleton-line long"></div>
        <div class="skeleton-line short"></div>
      </div>
      <div class="skeleton" style="height:68px">
        <div class="skeleton-line long" style="margin-top:16px"></div>
        <div class="skeleton-line short"></div>
      </div>
    </div>`
      }
      bootDemo()
    } else {
      showLiveWaitingShell()
    }
  })

  postParent({ type: 'MAGNUS_INIT', demoMode })

  if (demoMode) {
    bootDemo()
  } else {
    showLiveWaitingShell()
  }
})
