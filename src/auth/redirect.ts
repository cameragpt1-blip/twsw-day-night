export function getAuthRedirectTo(url: URL, hashPath?: string) {
  const base = `${url.origin}${url.pathname}`;
  if (!hashPath) {
    return base;
  }
  const normalized = hashPath.startsWith("/") ? hashPath : `/${hashPath}`;
  return `${base}#${normalized}`;
}
