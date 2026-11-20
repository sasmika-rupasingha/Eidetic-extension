/** Shared UI pieces built on the design system: thumbnails with crop marks, library rows, menus, dialogs, toasts. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { formatTime } from '../../capture/capture';
import { CATEGORY_LABEL } from '../../detect/classify';
import { formatNumber, type Capture } from '../../store/captures';
import { IconPin, IconPlay } from '../design/icons';
import { timeAgo } from './hooks';

export function CropMarks({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`crop ${className}`} style={style}>
      {children}
      <span className="cm tl" />
      <span className="cm tr" />
      <span className="cm bl" />
      <span className="cm br" />
    </div>
  );
}

export function Thumb({ capture, size = 64 }: { capture: Capture; size?: number }) {
  const h = Math.round(size * 0.75);
  return (
    <div className="thumb" style={{ width: size, height: h }}>
      {capture.image.thumb ? <img src={capture.image.thumb} alt="" /> : null}
      {capture.video ? (
        <span className="thumb-time">
          <IconPlay size={9} />
          {formatTime(capture.video.time)}
        </span>
      ) : null}
    </div>
  );
}

/** The title of a capture: AI description (when refined) or the rules description, else a fallback. */
export function titleOf(c: Capture): string {
  if (c.ai.description) return c.ai.description;
  if (c.detection) return c.detection.description;
  if (c.processing === 'error') return 'Couldn’t read this capture';
  if (c.needsCrop) return 'Waiting for you to choose an area';
  return 'Reading…';
}

export function kindOf(c: Capture): string {
  return c.detection ? CATEGORY_LABEL[c.detection.category] : c.video ? 'Video' : 'Capture';
}

export function CaptureRow({ capture, onOpen, extra, selected, onSelect }: { capture: Capture; onOpen: () => void; extra?: ReactNode; selected?: boolean; onSelect?: (on: boolean) => void }) {
  const c = capture;
  return (
    <article className={`entry${selected ? ' selected' : ''}`}>
      {onSelect ? (
        <label className="entry-check">
          <input type="checkbox" checked={Boolean(selected)} onChange={(e) => onSelect(e.target.checked)} />
          <span className="sr-only">Select {titleOf(c)}</span>
        </label>
      ) : null}
      <Thumb capture={c} />
      <div className="entry-body">
        <h3 className="serif entry-title">
          <button type="button" className="linkish" onClick={onOpen}>
            {titleOf(c)}
          </button>
        </h3>
        <div className="meta entry-meta">
          {c.pinned ? <IconPin size={12} label="Pinned" style={{ color: 'var(--accent)' }} /> : null}
          <span>
            {kindOf(c)}
            {c.source.site ? ` · ${c.source.site}` : ''} · {timeAgo(c.createdAt)}
          </span>
          {c.status === 'kept' ? <span className="accent-text">Kept</span> : null}
        </div>
        {extra}
      </div>
    </article>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}

export function Dialog({ title, children, actions, onClose }: { title: string; children: ReactNode; actions: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <h2 id={id}>{title}</h2>
        {children}
        <div className="actions">{actions}</div>
      </div>
    </div>
  );
}

/** A small dropdown menu anchored to its trigger. Closes on outside click, Escape, or choosing an item. */
export interface TriggerProps {
  onClick: () => void;
  'aria-expanded': boolean;
  'aria-haspopup': 'menu';
}

export function Menu({ trigger, children, align = 'right' }: { trigger: (p: TriggerProps) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = Array.from(box.current?.querySelectorAll<HTMLElement>('.menu > button:not(:disabled), .menu > a') ?? []);
        const i = items.indexOf(document.activeElement as HTMLElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
        e.preventDefault();
      }
    };
    addEventListener('mousedown', onDown);
    addEventListener('keydown', onKey);
    box.current?.querySelector<HTMLElement>('.menu > button, .menu > a')?.focus();
    return () => {
      removeEventListener('mousedown', onDown);
      removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="menu-anchor" ref={box}>
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      {open ? (
        <div className="menu" role="menu" style={align === 'right' ? { right: 0 } : { left: 0 }}>
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="serif">{title}</div>
      {children ? <div className="small">{children}</div> : null}
      {action}
    </div>
  );
}

export const numberLabel = formatNumber;
