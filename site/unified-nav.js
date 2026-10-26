// Shared primary navigation is presentation-only. It must never connect a device.
export const PRIMARY_DESTINATIONS = Object.freeze([
  { id: 'devices', label: 'Devices', href: 'hub.html' },
  { id: 'routines', label: 'Routines', href: 'hub.html#automations' },
  { id: 'explore', label: 'Explore', href: 'explore.html' },
  { id: 'saved', label: 'Saved', href: 'projects.html' },
]);

export function currentPrimaryDestination(pathname, hash = '') {
  const page = pathname.split('/').pop() || 'index.html';
  if (page === 'hub.html' && hash === '#automations') return 'routines';
  if (page === 'index.html' && ['#universal', '#toys'].includes(hash)) return 'devices';
  if (['hub.html', 'elmo.html', 'pocket-ir.html', 'companion.html'].includes(page)) {
    return 'devices';
  }
  if (page === 'projects.html') return 'saved';
  return 'explore';
}

export function renderPrimaryNavigation(doc = document, url = window.location) {
  const header = doc.querySelector('header.topbar, header.app-header, header');
  if (!header) return;
  const nav =
    header.querySelector('nav.simple-nav, nav.sasori-primary-nav') || doc.createElement('nav');
  nav.classList.add('sasori-primary-nav');
  nav.setAttribute('aria-label', 'Main navigation');
  const current = currentPrimaryDestination(url.pathname, url.hash);
  nav.replaceChildren();
  for (const item of PRIMARY_DESTINATIONS) {
    const link = doc.createElement('a');
    // Native iOS supports the laboratory's reviewed semantic adapters, not Hub parity.
    link.href =
      item.id === 'devices' && typeof window.SasoriNativeBluetooth !== 'undefined'
        ? 'index.html#universal'
        : item.href;
    link.textContent = item.label;
    if (item.id === current) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
  if (!nav.isConnected) header.append(nav);
}

// Keep the selected destination in sync when a Hub bookmark changes.
if (typeof document !== 'undefined') {
  renderPrimaryNavigation();
  window.addEventListener('hashchange', () => renderPrimaryNavigation());
}
