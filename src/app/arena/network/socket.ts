function toWsProtocol(protocol: string): string {
  return protocol === 'https:' ? 'wss:' : 'ws:';
}

function toHttpProtocol(protocol: string): string {
  return protocol === 'https:' ? 'https:' : 'http:';
}

function configuredBaseUrl() {
  const configured = (import.meta.env.VITE_LOBBY_WS_URL as string | undefined)?.trim();
  if (!configured) return null;

  const httpUrl = configured.replace(/^wss?:/i, (match) => (match.toLowerCase() === 'wss:' ? 'https:' : 'http:'));
  const url = new URL(httpUrl);
  url.search = '';
  return url;
}

function buildSocketUrlFromPath(path: string): string {
  const configured = configuredBaseUrl();

  if (configured) {
    const url = new URL(configured.toString());
    url.pathname = path;
    url.search = '';
    return url.toString().replace(/^https?:/i, (match) => (match.toLowerCase() === 'https:' ? 'wss:' : 'ws:'));
  }

  if (typeof window !== 'undefined') {
    return `${toWsProtocol(window.location.protocol)}//${window.location.host}${path}`;
  }

  return `ws://127.0.0.1:8787${path}`;
}

function legacySocketPath(path: string): string | null {
  if (path === '/ws/lobby') return '/lobby';
  if (path.startsWith('/ws/room/')) return path.replace('/ws/room/', '/room/');
  return null;
}

export function buildArenaSocketUrlCandidates(path: string): string[] {
  const urls = [buildSocketUrlFromPath(path)];
  const legacyPath = legacySocketPath(path);
  if (legacyPath) {
    urls.push(buildSocketUrlFromPath(legacyPath));
  }
  return [...new Set(urls)];
}

export function buildArenaSocketUrl(path: string): string {
  return buildArenaSocketUrlCandidates(path)[0];
}

export function buildArenaHttpUrl(path: string): string {
  const configured = configuredBaseUrl();
  if (configured) {
    const url = new URL(configured.toString());
    url.pathname = path;
    url.search = '';
    return url.toString();
  }

  if (typeof window !== 'undefined') {
    return `${toHttpProtocol(window.location.protocol)}//${window.location.host}${path}`;
  }

  return `http://127.0.0.1:8787${path}`;
}
