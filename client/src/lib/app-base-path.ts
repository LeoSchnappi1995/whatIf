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
  const base = getAppBasePath();
  return `${base === '/' ? '' : base}/${url.replace(/^\/+/, '')}`;
}
