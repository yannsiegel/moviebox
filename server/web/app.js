// MovieBox web player — plain JS, no framework, no build step.
// State lives in a few top-level objects; views are rebuilt on navigation.

(() => {
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'onClick') node.addEventListener('click', v);
      else if (k === 'html') node.innerHTML = v;
      else if (v !== null && v !== undefined) node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return node;
  };

  const State = {
    token: sessionStorage.getItem('mb_token') || '',
    view: 'home',
  };

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (State.token) headers.Authorization = 'Bearer ' + State.token;
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const r = await fetch('/api' + path, { ...options, headers });
    if (r.status === 401) { State.token = ''; sessionStorage.removeItem('mb_token'); renderLogin(); throw new Error('Nicht angemeldet'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  }

  function streamUrl(id) { return `/api/media/${id}/stream?token=${encodeURIComponent(State.token)}`; }

  // ---------- login ----------
  function renderLogin() {
    $('#topbar').hidden = true;
    $('#view').hidden = true;
    $('#login').hidden = false;
    $('#login-form').onsubmit = async (e) => {
      e.preventDefault();
      $('#login-err').textContent = '';
      try {
        const data = await api('/login', { method: 'POST', body: { username: $('#u').value, password: $('#p').value, device: 'Web-Player' } });
        State.token = data.token;
        sessionStorage.setItem('mb_token', State.token);
        openApp();
      } catch (err) {
        $('#login-err').textContent = err.message;
      }
    };
  }

  function openApp() {
    $('#login').hidden = true;
    $('#topbar').hidden = false;
    $('#view').hidden = false;
    nav('home');
  }

  // ---------- navigation ----------
  async function nav(view, arg) {
    State.view = view;
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.view === view);
    const container = $('#view');
    container.innerHTML = '';
    container.appendChild(el('div', { class: 'loading empty' }, 'Laden …'));
    try {
      if (view === 'home') await renderHome(container);
      else if (view === 'movies') await renderMovies(container);
      else if (view === 'shows') await renderShows(container);
      else if (view === 'movie') await renderMovieDetail(container, arg);
      else if (view === 'show') await renderShowDetail(container, arg);
    } catch (err) {
      container.innerHTML = '';
      container.appendChild(el('div', { class: 'empty' }, 'Fehler: ' + err.message));
    }
  }

  // ---------- home ----------
  function cardMovie(m) {
    const card = el('button', { class: 'card', onClick: () => nav('movie', m.id) });
    const poster = el('div', { class: 'poster' });
    if (m.poster) poster.appendChild(el('img', { src: m.poster, loading: 'lazy', alt: m.title }));
    else poster.appendChild(el('div', { class: 'fallback' }, m.title));
    card.appendChild(poster);
    card.appendChild(el('div', { class: 'title' }, m.title));
    if (m.year) card.appendChild(el('div', { class: 'sub' }, String(m.year)));
    if (m.positionSec && m.runtimeSec) {
      const bar = el('div', { class: 'progress' });
      bar.appendChild(el('div', { style: `width:${Math.min(100, (m.positionSec / m.runtimeSec) * 100).toFixed(1)}%` }));
      card.appendChild(bar);
    }
    return card;
  }
  function cardEpisode(e) {
    const card = el('button', { class: 'card', onClick: () => playEpisode(e) });
    const poster = el('div', { class: 'poster' });
    if (e.still) poster.appendChild(el('img', { src: e.still, loading: 'lazy', alt: e.title }));
    else poster.appendChild(el('div', { class: 'fallback' }, `S${e.season}E${e.episode}`));
    card.appendChild(poster);
    card.appendChild(el('div', { class: 'title' }, e.title || `Folge ${e.episode}`));
    card.appendChild(el('div', { class: 'sub' }, `${e.showTitle} · S${e.season}E${String(e.episode).padStart(2, '0')}`));
    if (e.positionSec && e.runtimeSec) {
      const bar = el('div', { class: 'progress' });
      bar.appendChild(el('div', { style: `width:${Math.min(100, (e.positionSec / e.runtimeSec) * 100).toFixed(1)}%` }));
      card.appendChild(bar);
    }
    return card;
  }

  async function renderHome(container) {
    const data = await api('/home');
    container.innerHTML = '';
    if (data.continue?.length) {
      container.appendChild(el('h2', {}, 'Weiter schauen'));
      const g = el('div', { class: 'grid' });
      for (const item of data.continue) g.appendChild(item.kind === 'episode' ? cardEpisode(item) : cardMovie(item));
      container.appendChild(g);
    }
    if (data.recentMovies?.length) {
      container.appendChild(el('h2', {}, 'Neue Filme'));
      const g = el('div', { class: 'grid' });
      for (const m of data.recentMovies) g.appendChild(cardMovie(m));
      container.appendChild(g);
    }
    if (data.recentEpisodes?.length) {
      container.appendChild(el('h2', {}, 'Neue Folgen'));
      const g = el('div', { class: 'grid' });
      for (const e of data.recentEpisodes) g.appendChild(cardEpisode(e));
      container.appendChild(g);
    }
    if (!data.continue?.length && !data.recentMovies?.length && !data.recentEpisodes?.length) {
      container.appendChild(el('div', { class: 'empty' }, 'Noch keine Inhalte. Lege Videodateien in den Medienordner und drücke oben rechts auf ↻.'));
    }
  }

  async function renderMovies(container) {
    const { movies } = await api('/movies?sort=title');
    container.innerHTML = '';
    container.appendChild(el('h2', {}, `Filme (${movies.length})`));
    if (!movies.length) { container.appendChild(el('div', { class: 'empty' }, 'Keine Filme gefunden.')); return; }
    const g = el('div', { class: 'grid' });
    for (const m of movies) g.appendChild(cardMovie(m));
    container.appendChild(g);
  }

  async function renderShows(container) {
    const { shows } = await api('/shows');
    container.innerHTML = '';
    container.appendChild(el('h2', {}, `Serien (${shows.length})`));
    if (!shows.length) { container.appendChild(el('div', { class: 'empty' }, 'Keine Serien gefunden.')); return; }
    const g = el('div', { class: 'grid' });
    for (const s of shows) {
      const card = el('button', { class: 'card', onClick: () => nav('show', s.id) });
      const poster = el('div', { class: 'poster' });
      if (s.poster) poster.appendChild(el('img', { src: s.poster, loading: 'lazy', alt: s.title }));
      else poster.appendChild(el('div', { class: 'fallback' }, s.title));
      card.appendChild(poster);
      card.appendChild(el('div', { class: 'title' }, s.title));
      if (s.year) card.appendChild(el('div', { class: 'sub' }, String(s.year)));
      g.appendChild(card);
    }
    container.appendChild(g);
  }

  async function renderMovieDetail(container, id) {
    const { movie } = await api(`/movies/${id}`);
    const { positionSec } = await api(`/media/${id}/resume`);
    container.innerHTML = '';
    const wrap = el('div', { class: 'detail' });
    const poster = el('div', { class: 'poster' });
    if (movie.poster) poster.appendChild(el('img', { src: movie.poster, alt: movie.title }));
    wrap.appendChild(poster);
    const info = el('div');
    info.appendChild(el('h2', {}, movie.title));
    const subBits = [];
    if (movie.year) subBits.push(movie.year);
    if (movie.runtimeSec) subBits.push(`${Math.round(movie.runtimeSec / 60)} min`);
    if (movie.genres?.length) subBits.push(movie.genres.join(', '));
    info.appendChild(el('div', { class: 'sub' }, subBits.join(' · ')));
    const playLabel = positionSec > 15 ? `Fortsetzen bei ${formatTime(positionSec)}` : 'Abspielen';
    info.appendChild(el('button', { class: 'play', onClick: () => play({ id, title: movie.title, positionSec }) }, '▶  ' + playLabel));
    if (movie.overview) info.appendChild(el('p', { class: 'overview' }, movie.overview));
    wrap.appendChild(info);
    container.appendChild(wrap);
  }

  async function renderShowDetail(container, id) {
    const { show, seasons } = await api(`/shows/${id}`);
    container.innerHTML = '';
    const wrap = el('div', { class: 'detail' });
    const poster = el('div', { class: 'poster' });
    if (show.poster) poster.appendChild(el('img', { src: show.poster, alt: show.title }));
    wrap.appendChild(poster);
    const info = el('div');
    info.appendChild(el('h2', {}, show.title));
    if (show.year) info.appendChild(el('div', { class: 'sub' }, String(show.year)));
    if (show.overview) info.appendChild(el('p', { class: 'overview' }, show.overview));
    wrap.appendChild(info);
    container.appendChild(wrap);
    for (const [season, eps] of Object.entries(seasons).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      container.appendChild(el('h2', {}, `Staffel ${season}`));
      const g = el('div', { class: 'ep-grid' });
      for (const ep of eps) {
        const card = el('button', { class: 'ep-card', onClick: () => playEpisode(ep) });
        const still = el('div', { class: 'still' });
        if (ep.still) still.appendChild(el('img', { src: ep.still, alt: ep.title }));
        else still.appendChild(el('div', { class: 'fallback' }, `S${ep.season}E${ep.episode}`));
        card.appendChild(still);
        const meta = el('div', { class: 'meta' });
        meta.appendChild(el('div', { class: 'num' }, `S${ep.season}E${String(ep.episode).padStart(2, '0')}`));
        meta.appendChild(el('div', { class: 'title' }, ep.title || `Folge ${ep.episode}`));
        card.appendChild(meta);
        g.appendChild(card);
      }
      container.appendChild(g);
    }
  }

  // ---------- playback ----------
  async function playEpisode(e) {
    const { positionSec } = await api(`/media/${e.id}/resume`).catch(() => ({ positionSec: 0 }));
    play({ id: e.id, title: `${e.showTitle} · S${e.season}E${String(e.episode).padStart(2, '0')}${e.title ? ' · ' + e.title : ''}`, positionSec });
  }

  function play({ id, title, positionSec }) {
    const video = $('#video');
    video.src = streamUrl(id);
    $('#player-title').textContent = title;
    $('#player').hidden = false;
    const onLoaded = () => {
      if (positionSec > 15) video.currentTime = positionSec;
      video.removeEventListener('loadedmetadata', onLoaded);
    };
    video.addEventListener('loadedmetadata', onLoaded);
    const reportResume = () => {
      api(`/media/${id}/resume`, { method: 'POST', body: { positionSec: Math.floor(video.currentTime), durationSec: Math.floor(video.duration) || 0 } }).catch(() => {});
    };
    const interval = setInterval(reportResume, 10_000);
    const cleanup = () => { clearInterval(interval); reportResume(); video.pause(); video.removeAttribute('src'); video.load(); };
    $('#player-close').onclick = () => { cleanup(); $('#player').hidden = true; };
    video.addEventListener('ended', () => { cleanup(); $('#player').hidden = true; });
  }

  function formatTime(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  // ---------- wire-up ----------
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-view]');
    if (tab) nav(tab.dataset.view);
  });
  $('#scan-btn').addEventListener('click', async () => {
    try { await api('/admin/scan', { method: 'POST' }); setTimeout(() => nav(State.view), 2000); }
    catch (err) { alert(err.message); }
  });
  $('#logout-btn').addEventListener('click', async () => {
    try { await api('/logout', { method: 'POST' }); } catch { /* ignore */ }
    State.token = ''; sessionStorage.removeItem('mb_token'); renderLogin();
  });

  if (State.token) openApp();
  else renderLogin();
})();
