/** Eidetic's icon set: 24-unit stroke icons, drawn to match the crop-mark logo. Decorative unless given a label. */
import type { ReactNode, SVGProps } from 'react';

type P = { size?: number; label?: string } & Omit<SVGProps<SVGSVGElement>, 'children'>;

function make(paths: ReactNode, opts: { fill?: boolean; width?: number } = {}) {
  return function Icon({ size = 18, label, ...rest }: P) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={opts.fill ? 'currentColor' : 'none'}
        stroke={opts.fill ? 'none' : 'currentColor'}
        strokeWidth={opts.width ?? 1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 8V4.5A1.5 1.5 0 0 1 4.5 3H8M16 3h3.5A1.5 1.5 0 0 1 21 4.5V8M21 16v3.5a1.5 1.5 0 0 1-1.5 1.5H16M8 21H4.5A1.5 1.5 0 0 1 3 19.5V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="14.5" cy="9.5" r="2.6" style={{ fill: 'var(--accent)' }} />
    </svg>
  );
}

export const IconCapture = make(<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />, { width: 1.8 });
export const IconLibrary = make(<><rect x="4" y="4" width="16" height="6" rx="1.5" /><path d="M4 14h16M4 18h11" /></>);
export const IconAsk = make(<path d="M5 5h14v10H10l-5 4z" />);
export const IconExpand = make(<path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />);
export const IconSettings = make(<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>);
export const IconBack = make(<path d="M15 5l-7 7 7 7" />, { width: 1.8 });
export const IconChevron = make(<path d="M6 9l6 6 6-6" />, { width: 2 });
export const IconPin = make(<path d="M9 4h6l-1 6 3 3H7l3-3-1-6zM12 16v5" />);
export const IconMore = make(<><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>, { fill: true });
export const IconLock = make(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
export const IconCheck = make(<path d="M5 12l4 4 10-10" />, { width: 2 });
export const IconCopy = make(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>);
export const IconSend = make(<path d="M5 12h14M13 6l6 6-6 6" />, { width: 2 });
export const IconSearch = make(<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>, { width: 1.8 });
export const IconClose = make(<path d="M6 6l12 12M18 6L6 18" />, { width: 2 });
export const IconFix = make(<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z" />, { width: 1.8 });
export const IconPlay = make(<path d="M8 5v14l11-7z" />, { fill: true });
export const IconDownload = make(<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />);
export const IconExternal = make(<path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5" />);
export const IconCalendar = make(<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>);
export const IconImage = make(<><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M20 16l-5-5-8 8" /></>);
export const IconPaste = make(<><rect x="6" y="5" width="12" height="16" rx="2" /><path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /></>);
export const IconFile = make(<><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /></>);
export const IconFull = make(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 9V8h2M17 9V8h-2M7 15v1h2M17 15v1h-2" /></>);
export const IconTrash = make(<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />);
export const IconNote = make(<path d="M5 19h4L19 9l-4-4L5 15zM13 7l4 4" />);
export const IconShield = make(<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />);
export const IconSpeaker = make(<path d="M5 9h3l5-4v14l-5-4H5zM17 9a4 4 0 0 1 0 6" />);
export const IconRefresh = make(<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />);
export const IconAlert = make(<><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.5" /></>);
export const IconInfo = make(<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.5" /></>);
export const IconKeep = make(<path d="M7 4h10v16l-5-4-5 4z" />);
export const IconVideo = make(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9.5v5l4.5-2.5z" fill="currentColor" /></>);
export const IconLink = make(<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />);
export const IconEye = make(<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
export const IconCrop = make(<path d="M6 2v16h16M2 6h16v16" />);
