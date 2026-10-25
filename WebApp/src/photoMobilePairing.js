export function mobileServerAddress(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || (url.pathname !== '/' && url.pathname !== '') || !url.hostname
      || ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(url.hostname)) {
    throw new Error('invalid-address');
  }
  return url.origin;
}

export function suggestedMobileAddress(apiBase, localAddress) {
  try { return mobileServerAddress(apiBase); }
  catch { return localAddress || ''; }
}

export function mobilePairingURL(server, code) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code || '')) throw new Error('invalid-code');
  const url = new URL('minitvphotos://pair');
  url.searchParams.set('v', '1');
  url.searchParams.set('server', mobileServerAddress(server));
  url.searchParams.set('code', code);
  return url.href;
}
