/**
 * Icon data for the design system: one stroke set on a 24px grid (1.75
 * stroke, round caps), plus the heavier club-category glyphs and the
 * continuous-corner (squircle) tile path. Transcribed from the Culturals
 * design system's component bundle.
 */
type El = readonly [tag: 'path' | 'circle' | 'rect' | 'ellipse', attrs: Record<string, string>];

const FILLED = { fill: 'currentColor', stroke: 'none' };

export const ICONS = {
  home: [
    ['path', { d: 'M3.5 10.5 12 3.5l8.5 7' }],
    ['path', { d: 'M5.5 9v11h5v-6h3v6h5V9' }],
  ],
  clubs: [
    ['circle', { cx: '9', cy: '8', r: '3.5' }],
    ['path', { d: 'M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5' }],
    ['circle', { cx: '17', cy: '9', r: '2.5' }],
    ['path', { d: 'M16.6 14.5c2.5.2 4.3 1.9 4.9 5.5' }],
  ],
  calendar: [
    ['rect', { x: '3.5', y: '5', width: '17', height: '15.5', rx: '3' }],
    ['path', { d: 'M3.5 10h17M8 3v4M16 3v4' }],
  ],
  wallet: [
    [
      'path',
      {
        d: 'M19 7V6a2 2 0 0 0-2-2H6a2.5 2.5 0 0 0 0 5h13a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 20H6a2.5 2.5 0 0 1-2.5-2.5v-11',
      },
    ],
    ['path', { d: 'M16 14.5h1.5' }],
  ],
  sheet: [
    ['rect', { x: '3.5', y: '4', width: '17', height: '16', rx: '2.5' }],
    ['path', { d: 'M3.5 9.5h17M3.5 14.8h17M9.5 9.5V20' }],
  ],
  approval: [
    ['rect', { x: '5', y: '4.5', width: '14', height: '16', rx: '2.5' }],
    ['path', { d: 'M9 4.5V3h6v1.5' }],
    ['path', { d: 'm9 13 2 2 4-4.2' }],
  ],
  certificate: [
    ['circle', { cx: '12', cy: '9', r: '5.5' }],
    ['path', { d: 'M8.6 13.3 7 21l5-2.6 5 2.6-1.6-7.7' }],
  ],
  edit: [
    ['path', { d: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z' }],
    ['path', { d: 'm13.5 6.5 4 4' }],
  ],
  history: [
    ['path', { d: 'M3.6 13a8.5 8.5 0 1 0 2.2-7' }],
    ['path', { d: 'M3.5 4v4h4' }],
    ['path', { d: 'M12 8v4.5l3 2' }],
  ],
  admin: [
    ['path', { d: 'M12 3 5 6v5.5c0 4.3 3 8 7 9.5 4-1.5 7-5.2 7-9.5V6l-7-3z' }],
    ['circle', { cx: '12', cy: '10.5', r: '2' }],
    ['path', { d: 'M12 12.5V16' }],
  ],
  management: [
    ['rect', { x: '3.5', y: '7', width: '17', height: '13', rx: '2.5' }],
    ['path', { d: 'M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7' }],
    ['path', { d: 'M3.5 12.5h17' }],
  ],
  upload: [
    ['path', { d: 'M12 15V4M7.5 8.5 12 4l4.5 4.5' }],
    ['path', { d: 'M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3' }],
  ],
  download: [
    ['path', { d: 'M12 4v11M7.5 10.5 12 15l4.5-4.5' }],
    ['path', { d: 'M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3' }],
  ],
  search: [
    ['circle', { cx: '11', cy: '11', r: '6.5' }],
    ['path', { d: 'm16 16 4.5 4.5' }],
  ],
  filter: [['path', { d: 'M4 5h16l-6 7.5V19l-4 1.5v-8L4 5z' }]],
  bell: [
    ['path', { d: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z' }],
    ['path', { d: 'M10 20.5a2 2 0 0 0 4 0' }],
  ],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  rupee: [
    ['path', { d: 'M7 4.5h10M7 9h10' }],
    ['path', { d: 'M7 4.5h3.5a4.5 4.5 0 0 1 0 9H7l7.5 7' }],
  ],
  alert: [
    ['path', { d: 'M12 4 2.8 19.5h18.4L12 4z' }],
    ['path', { d: 'M12 10v4.2M12 17v.01' }],
  ],
  check: [['path', { d: 'm5 12.5 4.5 4.5L19 7.5' }]],
  x: [['path', { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }]],
  clock: [
    ['circle', { cx: '12', cy: '12', r: '8.5' }],
    ['path', { d: 'M12 7.5V12l3 2' }],
  ],
  eye: [
    ['path', { d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z' }],
    ['circle', { cx: '12', cy: '12', r: '3' }],
  ],
  draft: [
    ['path', { d: 'M6 3.5h8l4 4v13H6z' }],
    ['path', { d: 'M14 3.5v4h4M9 12.5h6M9 16h4' }],
  ],
  comment: [
    ['path', { d: 'M4 5.5h16v11H9.5L4 20.5v-15z' }],
    ['path', { d: 'M8 9.5h8M8 12.5h5' }],
  ],
  settings: [
    ['path', { d: 'M4 7h10M18 7h2M4 17h4M12 17h8' }],
    ['circle', { cx: '16', cy: '7', r: '2' }],
    ['circle', { cx: '10', cy: '17', r: '2' }],
  ],
  undo: [
    ['path', { d: 'M9 14 4 9l5-5' }],
    ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11' }],
  ],
  'chevron-left': [['path', { d: 'm15 6-6 6 6 6' }]],
  'chevron-right': [['path', { d: 'm9 6 6 6-6 6' }]],
  'chevron-down': [['path', { d: 'm6 9 6 6 6-6' }]],
  flash: [['path', { d: 'M13 3 5.5 13.5H12L11 21l7.5-10.5H12z' }]],
  more: [
    ['circle', { cx: '6', cy: '12', r: '1.5', ...FILLED }],
    ['circle', { cx: '12', cy: '12', r: '1.5', ...FILLED }],
    ['circle', { cx: '18', cy: '12', r: '1.5', ...FILLED }],
  ],
  qr: [
    ['rect', { x: '3.5', y: '3.5', width: '6.5', height: '6.5', rx: '1.5' }],
    ['rect', { x: '14', y: '3.5', width: '6.5', height: '6.5', rx: '1.5' }],
    ['rect', { x: '3.5', y: '14', width: '6.5', height: '6.5', rx: '1.5' }],
    ['path', { d: 'M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 20.5h2.5' }],
  ],
  ticket: [
    [
      'path',
      {
        d: 'M3.5 7.5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1V10a2 2 0 0 0 0 4v2.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V14a2 2 0 0 0 0-4z',
      },
    ],
    ['path', { d: 'M15 6.5v1.75M15 11.1v1.8M15 15.75v1.75' }],
  ],
  user: [
    ['circle', { cx: '12', cy: '8', r: '3.75' }],
    ['path', { d: 'M4.5 20c.8-3.6 3.8-5.8 7.5-5.8s6.7 2.2 7.5 5.8' }],
  ],
  heart: [
    [
      'path',
      { d: 'M12 19.5S4 15 4 9.4A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 8 2.4C20 15 12 19.5 12 19.5z' },
    ],
  ],
  share: [
    ['path', { d: 'M12 3.5v11M8 7.5l4-4 4 4' }],
    ['path', { d: 'M7 11H6a2 2 0 0 0-2 2v5.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V13a2 2 0 0 0-2-2h-1' }],
  ],
  bookmark: [['path', { d: 'M6.5 4.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1V20l-5.5-3.5L6.5 20z' }]],
  pin: [
    ['path', { d: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z' }],
    ['circle', { cx: '12', cy: '10', r: '2.25' }],
  ],
  logout: [
    ['path', { d: 'M14.5 4.5H18a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-3.5' }],
    ['path', { d: 'M10 8l-4 4 4 4M6 12h9.5' }],
  ],
} satisfies Record<string, readonly El[]>;

export type IconName = keyof typeof ICONS;

/** Club category glyphs, drawn heavier (2px) for small coloured tiles. */
export const GLYPHS = {
  music: [
    ['path', { d: 'M9 17.5V6.5l10-2.5v11' }],
    ['path', { d: 'M9 9.5l10-2.5' }],
    ['ellipse', { cx: '6.5', cy: '17.5', rx: '2.75', ry: '2.25', ...FILLED }],
    ['ellipse', { cx: '16.5', cy: '15', rx: '2.75', ry: '2.25', ...FILLED }],
  ],
  dance: [
    ['circle', { cx: '14.5', cy: '4.25', r: '2', ...FILLED }],
    ['path', { d: 'M4.5 9.5c2.6.9 5.2.6 7.6-.9l1.9-1.2c1.6-1 3.4-1 5 .1' }],
    ['path', { d: 'M13.6 8.2 11.5 14l4.5 2.5L15 21' }],
    ['path', { d: 'M11.5 14 7 20' }],
  ],
  literary: [
    [
      'path',
      {
        d: 'M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z',
      },
    ],
    ['path', { d: 'M12 6.5V20' }],
  ],
  photography: [
    [
      'path',
      {
        d: 'M3.5 9a2 2 0 0 1 2-2h2.3l1.6-2.5h5.2L16.2 7h2.3a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
      },
    ],
    ['circle', { cx: '12', cy: '13', r: '3.5' }],
  ],
  theatre: [
    ['path', { d: 'M5 4h14v7a7 7 0 0 1-14 0z' }],
    ['path', { d: 'M8.25 8.5h2.25M13.5 8.5h2.25' }],
    ['path', { d: 'M8.75 12.75c1.8 1.9 4.7 1.9 6.5 0' }],
  ],
  art: [
    [
      'path',
      {
        d: 'M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.9-.8 1.9-1.8 0-1.4-1.3-1.7-1.3-2.9 0-1 .8-1.8 1.8-1.8h2.1c2.2 0 4-1.8 4-4 0-3.6-3.8-6.5-8.5-6.5z',
      },
    ],
    ['circle', { cx: '7.75', cy: '11', r: '1.25', ...FILLED }],
    ['circle', { cx: '10.5', cy: '7.25', r: '1.25', ...FILLED }],
    ['circle', { cx: '15', cy: '7.5', r: '1.25', ...FILLED }],
  ],
  tech: [
    ['path', { d: 'm8 7.5-4.5 4.5L8 16.5' }],
    ['path', { d: 'm16 7.5 4.5 4.5-4.5 4.5' }],
    ['path', { d: 'm13.5 5.5-3 13' }],
  ],
  sports: [
    ['circle', { cx: '12', cy: '12', r: '8.5' }],
    ['path', { d: 'M5.3 6.8c2.3 1.4 3.7 3.4 3.7 5.2s-1.4 3.8-3.7 5.2' }],
    ['path', { d: 'M18.7 6.8c-2.3 1.4-3.7 3.4-3.7 5.2s1.4 3.8 3.7 5.2' }],
  ],
  service: [
    [
      'path',
      { d: 'M12 19.5S4 15 4 9.4A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 8 2.4C20 15 12 19.5 12 19.5z' },
    ],
  ],
  general: [
    ['path', { d: 'M6.5 21V3.5' }],
    ['path', { d: 'M6.5 4.5h11.5l-3 4.25 3 4.25H6.5z', ...FILLED }],
  ],
} satisfies Record<string, readonly El[]>;

export type ClubCategory = keyof typeof GLYPHS;

/** Apple app-icon continuous-corner tile, on a 100×100 box. */
export const SQUIRCLE =
  'M100 50L99.92 68.84L99.69 74.82L99.31 79.12L98.77 82.55L98.07 85.43L97.2 87.89L96.17 90.03L94.94 91.9L93.53 93.53L91.9 94.94L90.03 96.17L87.89 97.2L85.43 98.07L82.55 98.77L79.12 99.31L74.82 99.69L68.84 99.92L50 100L31.16 99.92L25.18 99.69L20.88 99.31L17.45 98.77L14.57 98.07L12.11 97.2L9.97 96.17L8.1 94.94L6.47 93.53L5.06 91.9L3.83 90.03L2.8 87.89L1.93 85.43L1.23 82.55L0.69 79.12L0.31 74.82L0.08 68.84L0 50L0.08 31.16L0.31 25.18L0.69 20.88L1.23 17.45L1.93 14.57L2.8 12.11L3.83 9.97L5.06 8.1L6.47 6.47L8.1 5.06L9.97 3.83L12.11 2.8L14.57 1.93L17.45 1.23L20.88 0.69L25.18 0.31L31.16 0.08L50 0L68.84 0.08L74.82 0.31L79.12 0.69L82.55 1.23L85.43 1.93L87.89 2.8L90.03 3.83L91.9 5.06L93.53 6.47L94.94 8.1L96.17 9.97L97.2 12.11L98.07 14.57L98.77 17.45L99.31 20.88L99.69 25.18L99.92 31.16Z';
