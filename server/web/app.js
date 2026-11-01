// MovieBox web player. Plain JS, no framework, no build step.
// Views: home, movies, shows, discover (TMDB browse), search, movie/show detail, player.
// Overlays: upload (drag&drop + file picker), admin (users + status), modal, toast.

(() => {
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'onClick') node.addEventListener('click', v);
      else if (k === 'onInput') node.addEventListener('input', v);
      else if (k === 'html') node.innerHTML = v;
      else if (v !== null && v !== undefined) node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c !== null && c !== undefined) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return node;
  };

  const State = {
    token: sessionStorage.getItem('mb_token') || '',
    view: 'home',
    isAdmin: false,
  };

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (State.token) headers.Authorization = 'Bearer ' + State.token;
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData) && !(options.body instanceof Blob) && !(options.body instanceof ArrayBuffer)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const r = await fetch('/api' + path, { ...options, headers });
    if (r.status === 401) { State.token = ''; sessionStorage.removeItem('mb_token'); renderLogin(); throw new Error('Nicht angemeldet'); }
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await r.json().catch(() => ({})) : {};
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  }

  function streamUrl(id) { return `/api/media/${id}/stream?token=${encodeURIComponent(State.token)}`; }

  function toast(message, kind = 'ok', ms = 3000) {
    const t = $('#toast');
    t.className = kind;
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { t.hidden = true; }, ms);
  }

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
        State.isAdmin = data.user.role === 'admin';
        sessionStorage.setItem('mb_token', State.token);
        openApp();
      } catch (err) {
        $('#login-err').textContent = err.message;
      }
    };
  }

  async function openApp() {
    $('#login').hidden = true;
    $('#topbar').hidden = false;
    $('#view').hidden = false;
    try {
      const me = await api('/me');
      State.isAdmin = me.user.role === 'admin';
    } catch { /* token stale, renderLogin already handled by api() */ return; }
    $('#admin-btn').style.display = State.isAdmin ? '' : 'none';
    nav('home');
  }

  // ---------- navigation ----------
  async function nav(view, arg) {
    State.view = view;
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.view === view);
    const container = $('#view');
    container.innerHTML = '';
    container.appendChild(el('div', { class: 'empty' }, 'Laden …'));
    try {
      if (view === 'home') await renderHome(container);
      else if (view === 'movies') await renderMovies(container);
      else if (view === 'shows') await renderShows(container);
      else if (view === 'discover') await renderDiscover(container);
      else if (view === 'search') await renderSearch(container, arg);
      else if (view === 'favorites') await renderFavorites(container);
      else if (view === 'movie') await renderMovieDetail(container, arg);
      else if (view === 'show') await renderShowDetail(container, arg);
    } catch (err) {
      container.innerHTML = '';
      container.appendChild(el('div', { class: 'empty' }, 'Fehler: ' + err.message));
    }
  }

  // ---------- cards ----------
  function cardMovie(m) {
    const card = el('button', { class: 'card', onClick: () => nav('movie', m.id) });
    const poster = el('div', { class: 'poster' });
    if (m.poster) poster.appendChild(el('img', { src: m.poster, loading: 'lazy', alt: m.title }));
    else poster.appendChild(el('div', { class: 'fallback' }, m.title));
    if (m.preview) poster.appendChild(el('div', { class: 'badge' }, 'PREVIEW'));
    if (m.liked) poster.appendChild(el('div', { class: 'badge heart' }, '❤'));
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
    if (e.preview) poster.appendChild(el('div', { class: 'badge' }, 'PREVIEW'));
    if (e.liked) poster.appendChild(el('div', { class: 'badge heart' }, '❤'));
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
  function cardShow(s) {
    const card = el('button', { class: 'card', onClick: () => nav('show', s.id) });
    const poster = el('div', { class: 'poster' });
    if (s.poster) poster.appendChild(el('img', { src: s.poster, loading: 'lazy', alt: s.title }));
    else poster.appendChild(el('div', { class: 'fallback' }, s.title));
    card.appendChild(poster);
    card.appendChild(el('div', { class: 'title' }, s.title));
    if (s.year) card.appendChild(el('div', { class: 'sub' }, String(s.year)));
    return card;
  }
  function cardDiscover(r) {
    const card = el('div', { class: 'card disc-card', onClick: () => openSourcesForTmdb(r) });
    const poster = el('div', { class: 'poster' });
    if (r.poster) poster.appendChild(el('img', { src: r.poster, loading: 'lazy', alt: r.title }));
    else poster.appendChild(el('div', { class: 'fallback' }, r.title));
    poster.appendChild(el('div', { class: 'kind-badge' }, r.kind === 'movie' ? 'Film' : 'Serie'));
    if (r.rating) poster.appendChild(el('div', { class: 'rating' }, '★ ' + r.rating.toFixed(1)));
    card.appendChild(poster);
    card.appendChild(el('div', { class: 'title' }, r.title));
    const sub = [];
    if (r.year) sub.push(r.year);
    card.appendChild(el('div', { class: 'sub' }, sub.join(' · ')));
    return card;
  }

  // ---------- "Quellen finden" dialog ----------
  async function openSourcesForTmdb(tmdbItem) {
    openModal(async (body) => {
      body.appendChild(el('h2', {}, 'Quellen für „' + tmdbItem.title + '"'));
      body.appendChild(el('p', { style: 'color:var(--muted);font-size:13px;margin:0 0 12px' },
        'Alle backends werden gleichzeitig abgefragt. Torrents brauchen `webtorrent` auf dem server; archive.org läuft immer.'));

      const spinner = el('div', { class: 'empty' }, 'Suche …');
      body.appendChild(spinner);

      const params = new URLSearchParams();
      params.set('tmdbId', tmdbItem.tmdbId);
      params.set('kind', tmdbItem.kind);
      params.set('title', tmdbItem.title);
      if (tmdbItem.year) params.set('year', tmdbItem.year);

      let data;
      try { data = await api('/discover/sources?' + params.toString()); }
      catch (err) {
        spinner.remove();
        body.appendChild(el('div', { class: 'empty' }, 'Fehler: ' + err.message));
        return;
      }
      spinner.remove();
      if (!data.capabilities.torrent) {
        body.appendChild(el('div', { class: 'empty', style: 'padding:12px;margin-bottom:12px' },
          '⚠ Torrent-Backend nicht verfügbar (webtorrent nicht installiert). Nur Direkt-URLs und archive.org funktionieren.'));
      }
      if (!data.sources.length) {
        body.appendChild(el('div', { class: 'empty' }, 'Keine Quellen gefunden.'));
        return;
      }
      for (const src of data.sources) body.appendChild(sourceRow(src));
    });
  }

  function sourceRow(src) {
    const row = el('div', { class: 'row' });
    const name = el('div', { class: 'name' });
    const titleBits = [];
    titleBits.push(src.title);
    name.appendChild(el('div', { style: 'font-weight:500' }, src.title));
    const sub = [];
    sub.push(src.backend);
    if (src.quality) sub.push(src.quality);
    if (src.sizeBytes) sub.push((src.sizeBytes / 1_073_741_824).toFixed(2) + ' GB');
    if (src.seeders !== null && src.seeders !== undefined) sub.push(src.seeders + ' seeders');
    if (src.language) sub.push(src.language);
    if (src.provider) sub.push(src.provider);
    name.appendChild(el('div', { style: 'color:var(--muted);font-size:12px' }, sub.join(' · ')));
    row.appendChild(name);
    row.appendChild(el('button', { onClick: () => addSource(src, 'preview') }, 'Preview'));
    row.appendChild(el('button', { class: 'primary', onClick: () => addSource(src, 'keep') }, 'Behalten'));
    return row;
  }

  async function addSource(src, mode) {
    const url = src.magnet || src.url;
    if (!url) { toast('Keine URL für diese Quelle', 'err'); return; }
    try {
      await api('/sources/add', { method: 'POST', body: { url, mode } });
      toast(mode === 'preview' ? '✓ Preview-Download läuft …' : '✓ Download läuft …', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  // ---------- empty state ----------
  function emptyLibrary(parentContainer) {
    const empty = el('div', { class: 'empty' });
    empty.appendChild(el('h3', {}, 'Noch keine Inhalte'));
    empty.appendChild(el('p', {}, 'Lade Videos per Drag&Drop in dieses Fenster, über die Upload-Taste oben, hol sie von einer URL (YouTube, Vimeo, Archive.org, …), oder lege sie direkt in /srv/moviebox/media/.'));
    empty.appendChild(el('p', {}, 'Dateinamen helfen beim Zuordnen: „Film (Jahr).mkv" oder „Serie/Season 1/Serie.S01E01.mkv".'));
    const cta = el('div', { class: 'cta' });
    cta.appendChild(el('button', { onClick: openUrlSource }, '+ Von URL holen'));
    cta.appendChild(el('button', { class: 'ghost', onClick: () => $('#file-picker').click() }, 'Datei auswählen'));
    cta.appendChild(el('button', { class: 'ghost', onClick: () => nav('discover') }, 'Entdecken (TMDB)'));
    cta.appendChild(el('button', { class: 'ghost', onClick: triggerScan }, 'Jetzt scannen'));
    empty.appendChild(cta);
    parentContainer.appendChild(empty);
  }

  // ---------- home ----------
  async function renderHome(container) {
    const data = await api('/home');
    container.innerHTML = '';
    if (!data.continue?.length && !data.recentMovies?.length && !data.recentEpisodes?.length) {
      emptyLibrary(container);
      return;
    }
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
  }

  async function renderMovies(container) {
    const { movies } = await api('/movies?sort=title');
    container.innerHTML = '';
    container.appendChild(el('h2', {}, `Filme (${movies.length})`));
    if (!movies.length) { emptyLibrary(container); return; }
    const g = el('div', { class: 'grid' });
    for (const m of movies) g.appendChild(cardMovie(m));
    container.appendChild(g);
  }

  async function renderShows(container) {
    const { shows } = await api('/shows');
    container.innerHTML = '';
    container.appendChild(el('h2', {}, `Serien (${shows.length})`));
    if (!shows.length) { emptyLibrary(container); return; }
    const g = el('div', { class: 'grid' });
    for (const s of shows) g.appendChild(cardShow(s));
    container.appendChild(g);
  }

  async function renderDiscover(container) {
    container.innerHTML = '';
    container.appendChild(el('h2', {}, 'Entdecken – was gibt es?'));
    const info = el('p', { class: 'sub', style: 'color:var(--muted);margin:-8px 0 18px' },
      'Suche in TMDB nach Titeln, um zu sehen, was es gibt. Herunterladen klappt daraus (noch) nicht – die Datei legst du selbst in den Medienordner, Posters und Beschreibungen holt sich MovieBox dann automatisch.');
    container.appendChild(info);

    const search = el('input', { type: 'search', placeholder: 'Film oder Serie suchen …', style: 'width:100%;max-width:420px;padding:10px 14px;background:var(--bg-elev-2);border:1px solid var(--border);border-radius:8px;margin-bottom:20px' });
    container.appendChild(search);

    const results = el('div', { class: 'disc-grid' });
    container.appendChild(results);

    let timer = null;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      const q = search.value.trim();
      timer = setTimeout(() => doSearch(q), 300);
    });

    async function doSearch(q) {
      results.innerHTML = '';
      if (!q) { showTrending(); return; }
      try {
        const data = await api('/discover/search?q=' + encodeURIComponent(q));
        if (!data.results.length) { results.appendChild(el('div', { class: 'empty' }, 'Keine Treffer auf TMDB.')); return; }
        for (const r of data.results) results.appendChild(cardDiscover(r));
      } catch (err) {
        results.appendChild(el('div', { class: 'empty' }, err.message));
      }
    }

    async function showTrending() {
      try {
        const data = await api('/discover/trending');
        if (!data.results.length) return;
        container.insertBefore(el('h2', {}, 'Aktuell beliebt'), results);
        for (const r of data.results) results.appendChild(cardDiscover(r));
      } catch (err) {
        // TMDB not configured — just leave the search box
        results.appendChild(el('div', { class: 'empty' }, err.message));
      }
    }

    showTrending();
  }

  async function renderSearch(container, q) {
    container.innerHTML = '';
    container.appendChild(el('h2', {}, `Suche: „${q}"`));
    if (!q || q.length < 1) {
      container.appendChild(el('div', { class: 'empty' }, 'Gib oben etwas ein, um in deiner Bibliothek zu suchen.'));
      return;
    }
    const data = await api('/search?q=' + encodeURIComponent(q));
    const total = data.movies.length + data.shows.length + data.episodes.length;
    if (!total) {
      const empty = el('div', { class: 'empty' });
      empty.appendChild(el('h3', {}, 'Nichts gefunden'));
      empty.appendChild(el('p', {}, 'Nichts in deiner Bibliothek passt. Vielleicht in TMDB suchen?'));
      const cta = el('div', { class: 'cta' });
      cta.appendChild(el('button', { onClick: () => nav('discover') }, 'Entdecken (TMDB)'));
      empty.appendChild(cta);
      container.appendChild(empty);
      return;
    }
    if (data.movies.length) {
      container.appendChild(el('h2', {}, `Filme (${data.movies.length})`));
      const g = el('div', { class: 'grid' });
      for (const m of data.movies) g.appendChild(cardMovie(m));
      container.appendChild(g);
    }
    if (data.shows.length) {
      container.appendChild(el('h2', {}, `Serien (${data.shows.length})`));
      const g = el('div', { class: 'grid' });
      for (const s of data.shows) g.appendChild(cardShow(s));
      container.appendChild(g);
    }
    if (data.episodes.length) {
      container.appendChild(el('h2', {}, `Folgen (${data.episodes.length})`));
      const g = el('div', { class: 'grid' });
      for (const e of data.episodes) g.appendChild(cardEpisode(e));
      container.appendChild(g);
    }
  }

  async function renderFavorites(container) {
    const { movies, episodes } = await api('/favorites');
    container.innerHTML = '';
    container.appendChild(el('h2', {}, 'Lieblinge'));
    if (!movies.length && !episodes.length) {
      container.appendChild(el('div', { class: 'empty' }, 'Noch keine Favoriten. Tippe im Detail-view eines Films oder einer Folge auf ❤.'));
      return;
    }
    if (movies.length) {
      container.appendChild(el('h2', {}, `Filme (${movies.length})`));
      const g = el('div', { class: 'grid' });
      for (const m of movies) g.appendChild(cardMovie(m));
      container.appendChild(g);
    }
    if (episodes.length) {
      container.appendChild(el('h2', {}, `Folgen (${episodes.length})`));
      const g = el('div', { class: 'grid' });
      for (const e of episodes) g.appendChild(cardEpisode(e));
      container.appendChild(g);
    }
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

    const buttons = el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center' });
    const playLabel = positionSec > 15 ? `Fortsetzen bei ${formatTime(positionSec)}` : 'Abspielen';
    buttons.appendChild(el('button', { class: 'play', onClick: () => play({ id, title: movie.title, positionSec }) }, '▶  ' + playLabel));
    buttons.appendChild(likeButton(id, movie.liked));
    buttons.appendChild(deleteButton(id, movie.title, () => nav('movies')));
    info.appendChild(buttons);

    if (movie.overview) info.appendChild(el('p', { class: 'overview' }, movie.overview));
    wrap.appendChild(info);
    container.appendChild(wrap);
  }

  function likeButton(mediaId, initialLiked) {
    const btn = el('button', { class: 'icon-btn', style: 'padding:12px 16px;border-radius:10px;background:transparent;color:var(--text);border:1px solid var(--border);cursor:pointer;font-size:16px' });
    const render = (liked) => {
      btn.textContent = liked ? '❤  Favorit' : '♡  Favorit';
      btn.style.borderColor = liked ? 'var(--accent)' : 'var(--border)';
      btn.style.color = liked ? 'var(--accent)' : 'var(--text)';
      btn.dataset.liked = String(liked);
    };
    render(Boolean(initialLiked));
    btn.addEventListener('click', async () => {
      const next = btn.dataset.liked !== 'true';
      try {
        await api(`/media/${mediaId}/like`, { method: next ? 'POST' : 'DELETE' });
        render(next);
      } catch (err) { toast(err.message, 'err'); }
    });
    return btn;
  }

  function deleteButton(mediaId, label, onDone) {
    const btn = el('button', { style: 'padding:12px 16px;border-radius:10px;background:transparent;color:var(--err);border:1px solid var(--err);cursor:pointer;font-size:16px' }, '🗑  Löschen');
    btn.addEventListener('click', async () => {
      if (!confirm(`"${label}" wirklich löschen? Die Datei im Medienordner wird mitgelöscht.`)) return;
      try {
        await api(`/media/${mediaId}`, { method: 'DELETE' });
        toast('Gelöscht', 'ok');
        onDone?.();
      } catch (err) { toast(err.message, 'err'); }
    });
    return btn;
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

  // ---------- upload ----------
  async function uploadFile(file) {
    toast(`Hochladen: ${file.name} …`, 'ok', 8000);
    const t = $('#toast');
    const progress = el('div', { class: 'progress' });
    const bar = el('div', { style: 'width:0%' });
    progress.appendChild(bar);
    t.appendChild(progress);

    try {
      // use XHR for progress — fetch streams uploads don't widely work yet
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');
        xhr.setRequestHeader('Authorization', 'Bearer ' + State.token);
        xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) bar.style.width = ((ev.loaded / ev.total) * 100).toFixed(1) + '%';
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else { try { reject(new Error(JSON.parse(xhr.responseText).error || `HTTP ${xhr.status}`)); } catch { reject(new Error(`HTTP ${xhr.status}`)); } }
        };
        xhr.onerror = () => reject(new Error('Netzwerkfehler'));
        xhr.send(file);
      });
      toast(`✓ ${file.name} hochgeladen – Scan läuft`, 'ok', 4000);
      // give the metadata worker a moment
      setTimeout(() => { if (State.view === 'home' || State.view === 'movies' || State.view === 'shows') nav(State.view); }, 2500);
    } catch (err) {
      toast(`✘ ${file.name}: ${err.message}`, 'err', 6000);
    }
  }

  async function uploadFiles(files) {
    for (const f of files) {
      // sequential: one at a time keeps the server CPU/IO sane for big files
      await uploadFile(f);
    }
  }

  // drag & drop whole-window
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!State.token) return;
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    dragDepth++;
    $('#drop-overlay').hidden = false;
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) $('#drop-overlay').hidden = true;
  });
  window.addEventListener('dragover', (e) => { if (State.token) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    $('#drop-overlay').hidden = true;
    if (!State.token) return;
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) uploadFiles(files);
  });

  $('#file-picker').addEventListener('change', (e) => {
    const files = [...e.target.files];
    if (files.length) uploadFiles(files);
    e.target.value = '';
  });

  // ---------- modal: admin, settings ----------
  function openModal(renderer) {
    const body = $('#modal .modal-body');
    body.innerHTML = '';
    $('#modal').hidden = false;
    renderer(body).catch((err) => { body.innerHTML = ''; body.appendChild(el('div', { class: 'empty' }, 'Fehler: ' + err.message)); });
  }
  function closeModal() {
    $('#modal').hidden = true;
    document.dispatchEvent(new CustomEvent('mb-modal-close'));
  }
  $('#modal .modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  // ---------- URL source dialog ----------
  async function openUrlSource() {
    openModal(async (body) => {
      body.appendChild(el('h2', {}, 'Video per URL hinzufügen'));
      body.appendChild(el('p', { style: 'color:var(--muted);font-size:13px;margin:0 0 12px' },
        'YouTube, Vimeo, Archive.org, direkte .mp4/.mkv-Links – alles, was yt-dlp kennt.'));

      const urlIn = el('input', { type: 'url', placeholder: 'https://…', style: 'width:100%' });
      body.appendChild(urlIn);

      const info = el('div', { style: 'min-height:1.4em;margin:10px 0;color:var(--muted);font-size:13px' });
      body.appendChild(info);

      // Mode choice
      const modeWrap = el('div', { style: 'display:flex;gap:12px;margin:12px 0 4px' });
      const keepId = 'mode-keep', prevId = 'mode-preview';
      modeWrap.appendChild(el('label', { style: 'display:flex;align-items:center;gap:6px;cursor:pointer' }, [
        el('input', { type: 'radio', name: 'mode', value: 'keep', id: keepId, checked: 'checked' }),
        'Behalten',
      ]));
      modeWrap.appendChild(el('label', { style: 'display:flex;align-items:center;gap:6px;cursor:pointer' }, [
        el('input', { type: 'radio', name: 'mode', value: 'preview', id: prevId }),
        'Nur einmal schauen (nach 48 h weg)',
      ]));
      body.appendChild(modeWrap);

      const row = el('div', { class: 'form-row' });
      const probeBtn = el('button', { onClick: async () => {
        info.textContent = 'Prüfe …';
        try {
          const data = await api('/sources/resolve', { method: 'POST', body: { url: urlIn.value.trim() } });
          const bits = [data.info.title || '(ohne Titel)'];
          if (data.info.durationSec) bits.push(`${Math.round(data.info.durationSec / 60)} min`);
          if (data.info.sizeBytes) bits.push(`${(data.info.sizeBytes / 1_073_741_824).toFixed(2)} GB`);
          if (data.info.extractor) bits.push(data.info.extractor);
          info.style.color = 'var(--text)';
          info.textContent = bits.join(' · ');
        } catch (err) {
          info.style.color = 'var(--err)';
          info.textContent = err.message;
        }
      } }, 'Prüfen');
      const addBtn = el('button', { class: 'primary', onClick: async () => {
        const mode = document.querySelector('input[name=mode]:checked')?.value || 'keep';
        try {
          await api('/sources/add', { method: 'POST', body: { url: urlIn.value.trim(), mode } });
          toast(mode === 'preview' ? '✓ Preview-Download läuft …' : '✓ Download läuft …', 'ok');
          renderJobs();
        } catch (err) { toast(err.message, 'err'); }
      } }, 'Hinzufügen');
      row.appendChild(probeBtn);
      row.appendChild(addBtn);
      body.appendChild(row);

      // ---- active + recent jobs
      body.appendChild(el('h3', { style: 'margin-top:24px;font-size:14px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px' }, 'Laufende & letzte Downloads'));
      const jobsHost = el('div');
      body.appendChild(jobsHost);
      let intervalId = null;
      async function renderJobs() {
        try {
          const { jobs } = await api('/sources/jobs');
          jobsHost.innerHTML = '';
          if (!jobs.length) { jobsHost.appendChild(el('div', { class: 'empty', style: 'padding:14px' }, 'Noch nichts.')); return; }
          for (const j of jobs) jobsHost.appendChild(jobRow(j));
        } catch { /* modal might be closed */ }
      }
      function jobRow(j) {
        const row = el('div', { class: 'row' });
        const left = el('div', { class: 'name' });
        left.appendChild(el('div', { style: 'font-weight:500' }, j.payload?.url || '(ohne URL)'));
        const sub = [];
        sub.push(j.status);
        if (j.payload?.mode === 'preview') sub.push('preview');
        if (j.progress?.pct !== undefined) sub.push(`${j.progress.pct.toFixed(1)} %`);
        if (j.progress?.speed) sub.push(j.progress.speed);
        if (j.progress?.eta) sub.push('ETA ' + j.progress.eta);
        if (j.error) sub.push(j.error);
        left.appendChild(el('div', { style: 'color:var(--muted);font-size:12px' }, sub.join(' · ')));
        if (j.progress?.pct !== undefined && j.status !== 'done') {
          const bar = el('div', { style: 'height:3px;background:var(--border);border-radius:2px;margin-top:6px;overflow:hidden' });
          bar.appendChild(el('div', { style: `width:${j.progress.pct}%;height:100%;background:var(--accent)` }));
          left.appendChild(bar);
        }
        row.appendChild(left);
        row.appendChild(el('button', { class: 'danger', onClick: async () => {
          try { await api('/sources/jobs/' + j.id, { method: 'DELETE' }); renderJobs(); }
          catch (err) { toast(err.message, 'err'); }
        } }, '×'));
        return row;
      }

      renderJobs();
      intervalId = setInterval(renderJobs, 2000);
      // stop polling when the modal closes
      const stopPoll = () => { clearInterval(intervalId); document.removeEventListener('mb-modal-close', stopPoll); };
      document.addEventListener('mb-modal-close', stopPoll);
    });
  }

  async function openAdmin() {
    openModal(async (body) => {
      body.appendChild(el('h2', {}, 'Admin'));

      // ---- Status
      body.appendChild(el('h3', { style: 'margin-top:0;font-size:14px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px' }, 'Status'));
      const status = await api('/admin/status');
      const stats = el('div', { class: 'stats' });
      const summary = await api('/library/summary');
      stats.appendChild(statTile('Filme', summary.movies));
      stats.appendChild(statTile('Serien', summary.shows));
      stats.appendChild(statTile('Folgen', summary.episodes));
      stats.appendChild(statTile('RAM', status.memoryMb + ' MB'));
      stats.appendChild(statTile('Uptime', formatDuration(status.uptimeSeconds)));
      stats.appendChild(statTile('Version', status.version));
      for (const [k, v] of Object.entries(status.jobs || {})) stats.appendChild(statTile(`Jobs: ${k}`, v));
      body.appendChild(stats);

      const scanBtn = el('button', { class: 'primary', style: 'margin-top:14px', onClick: async () => {
        try { await api('/admin/scan', { method: 'POST' }); toast('Scan gestartet', 'ok'); } catch (e) { toast(e.message, 'err'); }
      } }, 'Jetzt scannen');
      body.appendChild(scanBtn);

      // ---- Users
      body.appendChild(el('h3', { style: 'margin-top:24px;font-size:14px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px' }, 'Konten'));
      const users = (await api('/admin/users')).users;
      for (const u of users) {
        const row = el('div', { class: 'row' });
        row.appendChild(el('div', { class: 'name' }, [u.displayName, el('div', { style: 'color:var(--muted);font-size:12px' }, u.username)]));
        row.appendChild(el('span', { class: 'badge' }, u.role));
        if (u.role !== 'admin') {
          row.appendChild(el('button', { class: 'danger', onClick: async () => {
            if (!confirm(`Konto ${u.username} wirklich löschen? (inkl. Bibliothek)`)) return;
            try { await api('/admin/users/' + u.id, { method: 'DELETE' }); toast('Konto gelöscht'); openAdmin(); }
            catch (err) { toast(err.message, 'err'); }
          } }, 'Löschen'));
        }
        body.appendChild(row);
      }
      // create new
      const form = el('div', { class: 'form-row' });
      const nameIn = el('input', { placeholder: 'Benutzername' });
      const pwIn = el('input', { placeholder: 'Passwort (mind. 8)', type: 'password' });
      form.appendChild(nameIn);
      form.appendChild(pwIn);
      form.appendChild(el('button', { class: 'primary', onClick: async () => {
        try {
          await api('/admin/users', { method: 'POST', body: { username: nameIn.value, password: pwIn.value } });
          toast('Konto angelegt');
          openAdmin();
        } catch (err) { toast(err.message, 'err'); }
      } }, 'Anlegen'));
      body.appendChild(form);

      // ---- Server token
      body.appendChild(el('h3', { style: 'margin-top:24px;font-size:14px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px' }, 'Server-Token'));
      body.appendChild(el('p', { style: 'color:var(--muted);font-size:13px;margin:0 0 10px' }, 'Löst den API_TOKEN in der .env durch einen neuen ab. Alte Clients mit nur diesem Token müssen neu konfiguriert werden.'));
      body.appendChild(el('button', { class: 'danger', onClick: async () => {
        if (!confirm('Server-Token rotieren? Alles, was den alten Token nutzt, muss neu eingerichtet werden.')) return;
        try {
          const r = await api('/admin/server-token/rotate', { method: 'POST' });
          prompt('Neuer API_TOKEN (bitte sofort speichern):', r.token);
        } catch (err) { toast(err.message, 'err'); }
      } }, 'Token neu generieren'));
    });
  }

  function statTile(key, value) {
    const t = el('div', { class: 'stat' });
    t.appendChild(el('div', { class: 'k' }, key));
    t.appendChild(el('div', { class: 'v' }, String(value)));
    return t;
  }

  function formatDuration(sec) {
    if (sec < 60) return sec + ' s';
    if (sec < 3600) return Math.round(sec / 60) + ' min';
    if (sec < 86400) return Math.round(sec / 3600) + ' h';
    return Math.round(sec / 86400) + ' d';
  }

  function formatTime(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  async function triggerScan() {
    try { await api('/admin/scan', { method: 'POST' }); toast('Scan gestartet', 'ok'); setTimeout(() => nav(State.view), 2500); }
    catch (err) { toast(err.message, 'err'); }
  }

  // ---------- wire-up ----------
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-view]');
    if (tab) nav(tab.dataset.view);
  });

  $('#search-input').addEventListener('input', (e) => {
    const q = e.target.value.trim();
    clearTimeout($('#search-input')._timer);
    $('#search-input')._timer = setTimeout(() => {
      if (q) nav('search', q);
    }, 300);
  });
  $('#search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.target.value = ''; nav('home'); }
  });

  $('#random-btn').addEventListener('click', async () => {
    try {
      const data = await api('/random');
      if (data.item.kind === 'episode') playEpisode(data.item);
      else nav('movie', data.item.id);
    } catch (err) { toast(err.message, 'err'); }
  });
  $('#favorites-btn').addEventListener('click', () => nav('favorites'));
  $('#url-btn').addEventListener('click', openUrlSource);
  $('#upload-btn').addEventListener('click', () => $('#file-picker').click());
  $('#scan-btn').addEventListener('click', triggerScan);
  $('#admin-btn').addEventListener('click', openAdmin);
  $('#logout-btn').addEventListener('click', async () => {
    try { await api('/logout', { method: 'POST' }); } catch { /* ignore */ }
    State.token = ''; sessionStorage.removeItem('mb_token'); renderLogin();
  });

  if (State.token) openApp();
  else renderLogin();
})();
