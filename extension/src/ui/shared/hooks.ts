/** React hooks over Eidetic's stores. Every surface (panel, workspace) stays in sync through storage events. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { cachedStatuses, refreshStatuses, type Statuses } from '../../ai/run';
import { getCapture, getImage, listCaptures, onCapturesChanged, type Capture } from '../../store/captures';
import { loadSettings, onSettingsChanged, type Settings } from '../../store/settings';
import { applyTheme } from '../theme';

export function useSettings(): Settings | null {
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    let live = true;
    void loadSettings().then((v) => {
      if (!live) return;
      setS(v);
      applyTheme(v.theme, v.accent);
    });
    const off = onSettingsChanged((v) => {
      setS(v);
      applyTheme(v.theme, v.accent);
    });
    return () => {
      live = false;
      off();
    };
  }, []);
  return s;
}

/** Provider statuses: cached instantly, then re-checked. `refresh` re-checks one provider or all. */
export function useStatuses(s: Settings | null): { statuses: Statuses; checking: boolean; refresh: (only?: Parameters<typeof refreshStatuses>[1]) => Promise<void> } {
  const [statuses, setStatuses] = useState<Statuses>({});
  const [checking, setChecking] = useState(false);
  const sRef = useRef(s);
  sRef.current = s;
  const refresh = useCallback(async (only?: Parameters<typeof refreshStatuses>[1]) => {
    if (!sRef.current) return;
    setChecking(true);
    try {
      setStatuses(await refreshStatuses(sRef.current, only));
    } finally {
      setChecking(false);
    }
  }, []);
  const ready = Boolean(s);
  useEffect(() => {
    void cachedStatuses().then(setStatuses);
    if (ready) void refresh();
  }, [ready, refresh]);
  // Re-check when providers are switched on or off, or their address or key changes.
  const sig = s ? JSON.stringify(Object.entries(s.providers).map(([id, p]) => [id, p.enabled, p.baseUrl, Boolean(p.apiKey)])) : '';
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (sig) void refresh();
  }, [sig, refresh]);
  return { statuses, checking, refresh };
}

export function useCaptures(): { captures: Capture[] | null; reload: () => void } {
  const [captures, setCaptures] = useState<Capture[] | null>(null);
  const reload = useCallback(() => void listCaptures().then(setCaptures).catch(() => setCaptures([])), []);
  useEffect(() => {
    reload();
    return onCapturesChanged(() => reload());
  }, [reload]);
  return { captures, reload };
}

export function useCapture(id: string | null): Capture | null | undefined {
  const [cap, setCap] = useState<Capture | null | undefined>(undefined);
  useEffect(() => {
    if (!id) {
      setCap(null);
      return;
    }
    let live = true;
    const load = () => void getCapture(id).then((c) => live && setCap(c ?? null));
    load();
    const off = onCapturesChanged((changed) => {
      if (!changed || changed === id) load();
    });
    return () => {
      live = false;
      off();
    };
  }, [id]);
  return cap;
}

/** An object URL for a capture's full image, revoked when no longer needed. */
export function useImageUrl(blobId: string | undefined, version?: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blobId) return;
    let made: string | null = null;
    let live = true;
    void getImage(blobId).then((b) => {
      if (!live || !b) return;
      made = URL.createObjectURL(b);
      setUrl(made);
    });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [blobId, version]);
  return url;
}

export function useToast(): { toast: string | null; show: (msg: string) => void } {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  return { toast, show };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export const timeAgo = (t: number, now = Date.now()) => {
  const d = new Date(t);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (sameDay) return hm;
  const y = new Date(now - 86_400_000);
  if (y.toDateString() === d.toDateString()) return `Yesterday ${hm}`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
};
