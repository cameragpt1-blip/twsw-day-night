export function getAuthRedirectTo(url: URL) {
  return `${url.origin}${url.pathname}`;
}

