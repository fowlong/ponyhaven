/** Keep the renderer on the bundled entry page while allowing its own reloads. */
export function isAppPage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'ponyhaven:' && url.host === 'app' &&
      !url.username && !url.password && !url.search &&
      (url.pathname === '/' || url.pathname === '/index.html');
  } catch {
    return false;
  }
}

export function guardNavigation(event, destination) {
  // Electron supplies the URL on the event; retain the legacy second argument.
  if (!isAppPage(event.url ?? destination)) event.preventDefault();
}
