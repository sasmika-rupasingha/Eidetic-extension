/** Each AI provider's host is requested only when the user adds that provider (from a click). */
import { PROVIDER_INFO, type ProviderConfig, type ProviderId } from '../store/settings';

export function originPattern(baseUrl: string): string | null {
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `${u.protocol}//${u.hostname}/*`; // match patterns ignore ports
  } catch {
    return null;
  }
}

export async function hasProviderPermission(id: ProviderId, cfg: ProviderConfig): Promise<boolean> {
  if (id === 'builtin') return true;
  const o = originPattern(cfg.baseUrl);
  return o ? chrome.permissions.contains({ origins: [o] }) : false;
}

/** Must be called from a click. Firefox also asks the user to agree that captured content may go to this provider. */
export async function requestProviderPermission(id: ProviderId, cfg: ProviderConfig): Promise<boolean> {
  if (id === 'builtin') return true;
  const o = originPattern(cfg.baseUrl);
  if (!o) return false;
  const req: chrome.permissions.Permissions & { data_collection?: string[] } = { origins: [o] };
  const isFirefox = navigator.userAgent.includes('Firefox');
  if (isFirefox && !PROVIDER_INFO[id].local) req.data_collection = ['websiteContent'];
  try {
    return await chrome.permissions.request(req);
  } catch {
    return chrome.permissions.request({ origins: [o] });
  }
}
