export function getAppBasePath() {
  if (typeof window !== 'undefined') {
    const injectedBase = (window as Window & { BASE_PATH?: string; __BASENAME__?: string }).BASE_PATH
      || (window as Window & { __BASENAME__?: string }).__BASENAME__;
    if (injectedBase && injectedBase !== '/app/') return injectedBase.replace(/\/+$/, '');
  }
  return '/';
}

export function resolveAppAssetUrl(url: string) {
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  const base = getAppBasePath();
  return `${base === '/' ? '' : base}/${url.replace(/^\/+/, '')}`;
}
