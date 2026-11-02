// Inline-SVG icon set in the Lucide / Material-Symbols idiom. 24x24 viewBox,
// strokes use currentColor so icons inherit button text color automatically.
// Imported once by app.js; `icon('play')` returns an SVGElement ready to insert.
window.MBIcons = (() => {
  const svgNS = 'http://www.w3.org/2000/svg';
  const DEFS = {
    play:     'M8 5v14l11-7z',
    pause:    'M6 4h4v16H6zM14 4h4v16h-4z',
    close:    'M6 6l12 12M18 6L6 18',
    search:   'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM21 21l-4.3-4.3',
    heart:    'M12 21s-7-4.5-9.5-9A5 5 0 0 1 12 7a5 5 0 0 1 9.5 5c-2.5 4.5-9.5 9-9.5 9z',
    trash:    'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    refresh:  'M3 12a9 9 0 0 1 15.5-6.3L21 3M21 3v6h-6M21 12a9 9 0 0 1-15.5 6.3L3 21M3 21v-6h6',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    logout:   'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    upload:   'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
    plus:     'M12 5v14M5 12h14',
    dice:     'M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4M21 7v10l-9 4M12 7v4',
    bell:     'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9zM10 21a2 2 0 0 0 4 0',
    list:     'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    check:    'M20 6L9 17l-5-5',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    chevronLeft: 'M15 18l-6-6 6-6',
    chevronRight: 'M9 18l6-6-6-6',
    chevronDown: 'M6 9l6 6 6-6',
    bookmark: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
    film:     'M3 3h18v18H3zM7 3v18M17 3v18M3 7h18M3 12h18M3 17h18',
    tv:       'M4 4h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 21h8',
    sparkles: 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75L19 14zM5 14l.75 2.25L8 17l-2.25.75L5 20l-.75-2.25L2 17l2.25-.75L5 14z',
    loader:   'M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.2 16.2l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.2 7.8l2.8-2.8',
    user:     'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    alert:    'M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  };

  const FILLED = new Set(['play', 'pause']);

  function icon(name, { size = 18, strokeWidth = 2, className = '' } = {}) {
    const d = DEFS[name];
    if (!d) { console.warn('unknown icon', name); return document.createTextNode(''); }
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    if (className) svg.setAttribute('class', className);
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', d);
    if (FILLED.has(name)) {
      path.setAttribute('fill', 'currentColor');
      path.setAttribute('stroke', 'none');
    } else {
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', String(strokeWidth));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
    }
    svg.appendChild(path);
    return svg;
  }

  function iconHtml(name, opts) {
    const wrap = document.createElement('span');
    wrap.appendChild(icon(name, opts));
    return wrap.innerHTML;
  }

  return { icon, iconHtml };
})();
