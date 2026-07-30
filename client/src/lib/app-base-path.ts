function pathnameAppBase(pathname: string) {
  return pathname.match(/^\/app\/[^/]+/)?.[0];
}

export function getAppBasePath() {
  if (typeof window !== 'undefined') {
    const pathnameBase = pathnameAppBase(window.location.pathname);
    if (pathnameBase) return pathnameBase;

    const injectedBase = (window as Window & { __BASENAME__?: string }).__BASENAME__;
    if (injectedBase && injectedBase !== '/app/') return injectedBase.replace(/\/$/, '');
  }

  return '/';
}

export function resolveAppAssetUrl(url: string) {
  if (/^(https?:|data:|blob:)/.test(url)) return url;

  // Miaoda serves the production bundle and public assets from the same
  // versioned CDN `/client/` root. Application routes such as
  // `/app/<app-id>/...` return the HTML shell, so they cannot be used as the
  // base URL for images shipped in `client/public`.
  const moduleUrl = import.meta.url;
  const clientAssetMarker = '/client/assets/';
  const markerIndex = moduleUrl.indexOf(clientAssetMarker);
  if (markerIndex >= 0) {
    const clientBase = `${moduleUrl.slice(0, markerIndex)}/client/`;
    return new URL(url.replace(/^\/+/, ''), clientBase).toString();
  }

  const base = getAppBasePath();
  return `${base === '/' ? '' : base}/${url.replace(/^\/+/, '')}`;
}
