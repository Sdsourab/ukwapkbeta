import type { SVGProps } from 'react';

/** Simple 24px stroke icons (inline SVG, no external assets: works offline and under strict CSP). */
const P: Record<string, string> = {
  highlight: 'M12.5 4.5l7 7-7.5 7.5-7-7z M6 13l-2 7 7-2 M14 10l-3 3',
  underline: 'M7 4v7a5 5 0 0 0 10 0V4 M4 21h16',
  strike: 'M4 12h16 M16.5 7C15.6 5.6 14 5 12 5c-2.6 0-4.2 1.2-4.2 3 0 1.4 1 2.2 2.7 2.8 M8 16c.8 1.8 2.4 3 4.5 3 2.6 0 4.2-1.3 4.2-3 0-.5-.1-.9-.4-1.2',
  note: 'M6 3h9l4 4v14H6z M15 3v4h4 M9 12h7 M9 16h5',
  bookmark: 'M6 3h12v18l-6-4.5L6 21z',
  sticky: 'M4 4h16v10l-6 6H4z M14 20v-6h6',
  graph: 'M7 7l9 1.5 M7.5 8.5l3.5 7.5 M17 10.5l-4 5.5 M5 6.5a2 2 0 1 0 .01 0 M18 8a2 2 0 1 0 .01 0 M12 18a2 2 0 1 0 .01 0',
  search: 'M11 4a7 7 0 1 0 .01 0 M20 20l-4.2-4.2',
  library: 'M4 4h5v16H4z M10 6h5v14h-5z M16.2 5.2l4.4 1.2-3.3 13.6-4.3-1.1',
  settings: 'M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 7a2 2 0 1 0 .01 0 M9 17a2 2 0 1 0 .01 0',
  sidebar: 'M4 4h16v16H4z M15 4v16',
  plus: 'M12 5v14 M5 12h14',
  x: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'chevron-left': 'M15 5l-7 7 7 7',
  'chevron-right': 'M9 5l7 7-7 7',
  'chevron-down': 'M5 9l7 7 7-7',
  'chevron-up': 'M5 15l7-7 7 7',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  undo: 'M9 14L4 9l5-5 M4 9h9a6 6 0 0 1 0 12h-2',
  redo: 'M15 14l5-5-5-5 M20 9h-9a6 6 0 0 0 0 12h2',
  download: 'M12 4v11 M7 11l5 5 5-5 M5 20h14',
  upload: 'M12 16V5 M7 9l5-5 5 5 M5 20h14',
  tag: 'M3 12V4h8l10 10-8 8z M7.5 8.5a1 1 0 1 0 .01 0',
  folder: 'M3 6h6l2 2h10v11H3z',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8z',
  archive: 'M3 4h18v4H3z M5 8v12h14V8 M10 12h4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1',
  sun: 'M12 8a4 4 0 1 0 .01 0 M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  command: 'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  copy: 'M9 9h11v11H9z M5 15V4h11',
  layout: 'M4 4h16v16H4z M4 10h16 M10 10v10',
  'zoom-in': 'M11 4a7 7 0 1 0 .01 0 M20 20l-4.2-4.2 M8 11h6 M11 8v6',
  'zoom-out': 'M11 4a7 7 0 1 0 .01 0 M20 20l-4.2-4.2 M8 11h6',
  fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  pin: 'M9 4h6l-1 6 3 3H7l3-3z M12 13v8',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 .01 0',
  sync: 'M20 11a8 8 0 0 0-14-4L4 9 M4 4v5h5 M4 13a8 8 0 0 0 14 4l2-2 M20 20v-5h-5',
  cloud: 'M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9.5 4 4 0 0 1 17 18z',
  alert: 'M12 4l9 16H3z M12 10v4 M12 17h.01',
  info: 'M12 3a9 9 0 1 0 .01 0 M12 11v5 M12 8h.01',
  file: 'M6 3h9l4 4v14H6z M15 3v4h4',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19a2 2 0 0 1 2-2h13',
  flask: 'M9 3h6 M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3',
  task: 'M5 4h14v16H5z M9 12l2 2 4-4',
  home: 'M4 11l8-7 8 7 M6 10v10h12V10',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13 7l4 4',
  group: 'M4 5h16v14H4z M8 9h4v4H8z M14 11h2v4h-2z',
  shapes: 'M4 4h7v7H4z M15 8a4 4 0 1 0 .01 0 M7 15l4 6H3z',
  arrow: 'M4 12h14 M13 6l6 6-6 6',
  scissors: 'M6 7a2 2 0 1 0 .01 0 M6 17a2 2 0 1 0 .01 0 M7.5 8.5L20 18 M7.5 15.5L20 6',
  'undo-all': 'M9 14L4 9l5-5 M4 9h9a6 6 0 0 1 0 12h-2',
  grip: 'M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01',
  smartphone: 'M7 3h10v18H7z M11 18h2',
  keyboard: 'M3 6h18v12H3z M7 10h.01 M11 10h.01 M15 10h.01 M7 14h10',
};

export type IconName = keyof typeof P;
export const ICON_NAMES = Object.keys(P) as IconName[];

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  /** When provided the icon is exposed to assistive tech; otherwise it is decorative. */
  title?: string;
}

export function Icon({ name, size = 20, title, ...rest }: IconProps) {
  const d = P[name];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {d ? <path d={d} /> : null}
    </svg>
  );
}
