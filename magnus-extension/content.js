let sidebarInjected = false;

function injectSidebar() {
  if (sidebarInjected) return;
  if (!window.location.href.includes('/i/chat') && 
      !window.location.href.includes('/messages')) return;

  sidebarInjected = true;

  const sidebar = document.createElement('div');
  sidebar.id = 'magnus-sidebar';

  fetch(chrome.runtime.getURL('sidebar.html'))
    .then(r => r.text())
    .then(html => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      sidebar.innerHTML = doc.body.innerHTML;
      document.body.appendChild(sidebar);

      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('sidebar.js');
      document.body.appendChild(script);

      nudgeLayout();
    });
}

function nudgeLayout() {
  const main = document.querySelector('main') ||
                document.querySelector('[data-testid="primaryColumn"]');
  if (main) {
    main.style.marginRight = '340px';
    main.style.transition = 'margin-right 0.3s ease';
  }
}

const observer = new MutationObserver(() => {
  if (window.location.href.includes('/i/chat') || 
      window.location.href.includes('/messages')) {
    injectSidebar();
  } else {
    const existing = document.getElementById('magnus-sidebar');
    if (existing) {
      existing.remove();
      sidebarInjected = false;
    }
  }
});

console.log('[Magnus] content script loaded, URL:', window.location.href);
observer.observe(document.body, { childList: true, subtree: true });
injectSidebar();