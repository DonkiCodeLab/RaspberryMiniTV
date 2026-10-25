(function () {
  'use strict';
  var C = window.TVCore, root = document.getElementById('app'), api = null;
  var model = { catalog: { movies: [], series: [] }, users: [], user: null, state: { progress: {}, marks: {} }, photos: null, demo: false };
  var route = { type: 'connect' }, history = [], revision = 0, player = null, slideTimer = null, toastTimer, dialog = null;
  var icons = {
    home: '<path d="M3 10l9-7 9 7v10H7V10m3 10v-7h4v7"/>',
    movie: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 4l4 5m3-5l4 5"/>',
    series: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M8 2l4 4 4-4m-6 9l5 3-5 3z"/>',
    photo: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="M3 17l6-6 4 4 3-3 5 5"/>',
    heart: '<path d="M12 20S2 14 2 8a5 5 0 0110-1 5 5 0 0110 1c0 6-10 12-10 12z"/>',
    search: '<circle cx="10" cy="10" r="7"/><path d="M15 15l6 6"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0116 0v3"/>',
    back: '<path d="M10 4l-8 8 8 8M3 12h19"/>',
    play: '<path d="M7 3l14 9-14 9z"/>',
    pause: '<path d="M7 3v18M17 3v18"/>',
    refresh: '<path d="M20 8A9 9 0 104 19M20 2v6h-6"/>',
    check: '<path d="M3 12l6 6L21 5"/>'
  };
  function el(tag, className, text) {
    var node = document.createElement(tag); if (className) node.className = className;
    if (text !== undefined) node.textContent = text; return node;
  }
  function icon(name) { var node = el('span', 'icon'); node.setAttribute('aria-hidden', 'true'); node.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (icons[name] || icons.series) + '</svg>'; return node; }
  function button(label, action, className, symbol, id) {
    var node = el('button', className || 'button'); node.type = 'button';
    if (symbol) node.appendChild(icon(symbol)); node.appendChild(el('span', '', label));
    node.onclick = action; if (id) node.dataset.focus = id; return node;
  }
  function append(parent, children) { children.forEach(function (child) { if (child) parent.appendChild(child); }); return parent; }
  function store(key, value) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (_) { toast('La tele no permite guardar los ajustes.'); } }
  function read(key) { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } }
  function toast(message) {
    var node = document.getElementById('toast'); node.textContent = message; node.className = 'visible';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { node.className = ''; }, 6000);
  }
  function failure(error) {
    if (error.status === -1) return;
    if (error.status === 401) { disconnect(false); toast(error.message); }
    else toast(error.message || 'No se ha podido completar la acción.');
  }
  function focusables() {
    return Array.prototype.slice.call((dialog || root).querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled])')).filter(function (node) { return node.offsetWidth && node.offsetHeight && getComputedStyle(node).visibility !== 'hidden'; });
  }
  function focus(node) {
    if (!node) return; node.focus();
    var main = root.querySelector('.content');
    if (main && main.contains(node)) {
      var box = node.getBoundingClientRect(), area = main.getBoundingClientRect();
      if (box.bottom > area.bottom - 24) main.scrollTop += box.bottom - area.bottom + 36;
      if (box.top < area.top + 24) main.scrollTop -= area.top + 36 - box.top;
    }
  }
  function initialFocus() {
    var target = null;
    if (route.focus) focusables().some(function (node) { if (node.dataset.focus === route.focus) { target = node; return true; } return false; });
    focus(target || root.querySelector('[data-primary]') || focusables()[0]);
    var main = root.querySelector('.content'); if (main && route.scroll) main.scrollTop = route.scroll;
  }
  function remember() { route.focus = document.activeElement && document.activeElement.dataset.focus; var main = root.querySelector('.content'); route.scroll = main ? main.scrollTop : 0; }
  function go(next, replace) {
    if (player) stopPlayer();
    clearInterval(slideTimer); slideTimer = null;
    remember(); if (!replace) history.push(route); route = next; revision++; render();
  }
  function back() {
    if (dialog) return closeDialog();
    if (history.length) { if (player) stopPlayer(); clearInterval(slideTimer); slideTimer = null; route = history.pop(); revision++; render(); }
    else confirmExit();
  }
  function closeDialog() { if (!dialog) return; var previous = dialog.previousFocus; dialog.parentNode.removeChild(dialog); dialog = null; if (previous && document.contains(previous)) focus(previous); }
  function modal(title, copy, actions) {
    if (dialog) closeDialog(); dialog = el('div', 'modal-backdrop'); dialog.previousFocus = document.activeElement;
    var panel = el('div', 'modal'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', title);
    append(panel, [el('h2', '', title), el('p', 'muted', copy)]);
    var row = el('div', 'actions'); actions.forEach(function (action) { row.appendChild(button(action.label, action.run, 'button ' + (action.primary ? 'primary' : ''))); });
    panel.appendChild(row); dialog.appendChild(panel); root.appendChild(dialog); focus(dialog.querySelector('button'));
  }
  function confirmExit() {
    modal('¿Terminamos por hoy?', 'Puedes volver a tu biblioteca desde MiniTV en el inicio de la LG.', [
      { label: 'Seguir viendo', primary: true, run: closeDialog },
      { label: 'Salir', run: function () { closeDialog(); if (player) stopPlayer(); window.close(); toast('Puedes salir con el botón Inicio del mando.'); } }
    ]);
  }
  function brand() { var b = el('div', 'brand'); b.appendChild(icon('series')); b.appendChild(el('span', '', 'mini')); b.appendChild(el('strong', '', 'tv')); return b; }
  function shell(active) {
    var app = el('div', 'shell'), side = el('aside', 'sidebar'); side.appendChild(brand());
    var menu = el('nav', 'navigation'); menu.setAttribute('aria-label', 'Biblioteca');
    [['home', 'Inicio', 'home'], ['movies', 'Películas', 'movie'], ['series', 'Series', 'series'], ['photos', 'Fotos', 'photo'], ['favorites', 'Mi lista', 'heart'], ['search', 'Buscar', 'search']].forEach(function (item) {
      var b = button(item[1], function () { history = []; go({ type: item[0] }, true); }, 'nav-button' + (active === item[0] ? ' active' : ''), item[2], 'nav-' + item[0]);
      if (active === item[0]) b.setAttribute('aria-current', 'page'); menu.appendChild(b);
    });
    side.appendChild(menu); side.appendChild(button('Ajustes', function () { go({ type: 'settings' }); }, 'nav-button bottom' + (active === 'settings' ? ' active' : ''), 'settings', 'settings'));
    var body = el('div', 'body'), header = el('header', 'header');
    append(header, [el('div', 'connection', model.demo ? '●  MODO DEMO' : '●  TU BIBLIOTECA CONECTADA'), el('div', 'header-spacer')]);
    var clock = el('time', 'clock'); clock.textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); header.appendChild(clock);
    header.appendChild(button(model.user ? (model.user.name === 'default' ? 'Casa' : model.user.name) : 'Perfiles', function () { go({ type: 'profiles' }); }, 'profile-button', 'user', 'profile'));
    var content = el('main', 'content'); append(body, [header, content, el('footer', 'footer', 'FLECHAS  Navegar     OK  Seleccionar     ATRÁS  Volver' + (model.demo ? '     ·     Contenido de demostración' : ''))]);
    append(app, [side, body]); root.appendChild(app); return content;
  }
  function render() {
    root.textContent = ''; dialog = null;
    if (route.type === 'connect') connection();
    else if (route.type === 'profiles') profiles();
    else if (route.type === 'detail') detail();
    else if (route.type === 'player') playScreen();
    else if (route.type === 'photo') photoScreen();
    else if (route.type === 'settings') settings();
    else if (route.type === 'photos') photos();
    else browse();
    initialFocus();
  }
  function connection() {
    var page = el('main', 'connect-page'), intro = el('section', 'connect-intro');
    append(intro, [brand(), el('span', 'eyebrow', 'AHORA, EN TU LG'), el('h1', '', 'Pequeña tele.\nGrandes momentos.'), el('p', 'intro-copy', 'Tus películas, tus series y tus recuerdos.\nTodos juntos, en el mejor sitio de casa.')]);
    var artwork = el('div', 'connect-art'); artwork.appendChild(icon('series')); artwork.appendChild(el('span', '', 'Ponte cómodo.')); intro.appendChild(artwork);
    var form = el('form', 'connect-form'); append(form, [el('span', 'eyebrow', '01 / CONECTA TU BIBLIOTECA'), el('h2', '', 'Hola, sofá.'), el('p', 'muted', 'Conecta la tele y la MiniTV a la misma red. Introduce la dirección que usas para abrir la MiniTV y su PIN.')]);
    var address = el('input'); address.type = 'text'; address.id = 'server'; address.placeholder = 'http://192.168.1.50:5050'; address.value = read('minitv-lg-server'); address.autocomplete = 'off'; address.spellcheck = false; address.dataset.primary = 'true';
    var pin = el('input'); pin.type = 'password'; pin.id = 'pin'; pin.inputMode = 'numeric'; pin.maxLength = 4; pin.pattern = '[0-9]{4}'; pin.placeholder = 'PIN de 4 dígitos'; pin.autocomplete = 'off';
    var addressLabel = el('label', '', 'Dirección de la MiniTV'); addressLabel.htmlFor = 'server'; var pinLabel = el('label', '', 'PIN'); pinLabel.htmlFor = 'pin';
    var error = el('p', 'form-error'); error.setAttribute('role', 'alert');
    var submit = button('Conectar con mi MiniTV', connect, 'button primary full', 'play'); submit.type = 'button';
    append(form, [addressLabel, address, pinLabel, pin, error, submit, button('Explorar una demostración', demo, 'button text-button full'), el('p', 'fine', 'Recordamos la dirección. El PIN se conserva solo mientras la app está abierta.')]);
    form.onsubmit = function (event) { event.preventDefault(); connect(); };
    function connect() {
      if (submit.disabled) return;
      var host; try { host = C.serverAddress(address.value); if (!/^\d{4}$/.test(pin.value)) throw new Error('Introduce un PIN de 4 dígitos.'); } catch (e) { error.textContent = e.message; return; }
      submit.disabled = true; error.textContent = 'Conectando con tu biblioteca…';
      api = new window.TVAPI(host, pin.value); var activeAPI = api, version = revision;
      api.request('/web/auth', 'POST', { pin: pin.value }).then(function () {
        return Promise.all([activeAPI.request('/videos?pictures=0'), activeAPI.request('/users'), activeAPI.request('/tmdb/library?language=es-ES').catch(function (e) { if (e.status === 401) throw e; return {}; })]);
      }).then(function (results) {
        if (version !== revision || api !== activeAPI) return;
        if (!Array.isArray(results[0].directories) || !Array.isArray(results[1].users) || !results[1].users.length) throw new Error('Actualiza DeviceApp para utilizar la biblioteca y los perfiles.');
        model.catalog = C.catalog(results[0], results[2]); model.users = results[1].users; model.demo = false; model.photos = null;
        store('minitv-lg-server', host); history = []; go({ type: 'profiles' }, true);
      }).catch(function (e) { if (version !== revision) return; error.textContent = e.message; submit.disabled = false; focus(submit); });
    }
    append(page, [intro, form]); root.appendChild(page);
  }
  function demo() {
    if (api) api.abort(); api = null; model.demo = true;
    var titles = ['Sin blanca Navidad', 'El monorraíl', 'Homer, bateador', 'El cabo del miedo', 'La casa-árbol del terror'];
    var images = ['1x01', '4x12', '3x17', '5x02', '2x03'];
    var episodes = titles.map(function (title, index) { var code = images[index].split('x'); return { id: 'demo-' + index, path: 'demo-' + index, title: title, seriesTitle: 'Los Simpson', type: 'episode', season: Number(code[0]), episode: Number(code[1]), image: 'assets/demo-' + images[index] + '.jpg', demo: true }; });
    model.catalog = { movies: [{ id: 'demo-welcome', path: 'demo-welcome', title: 'Bienvenido a MiniTV', type: 'movie', description: 'Una pequeña muestra para probar el reproductor de tu nueva tele.', image: 'assets/clouds.jpg', demo: true }],
      series: [{ id: 'demo-simpsons', title: 'Los Simpson', type: 'series', episodes: episodes, image: 'assets/demo-4x12.jpg', description: 'Una visita a Springfield. Explora la biblioteca con las flechas del mando.', demo: true }] };
    model.users = [{ id: 'demo', name: 'Casa' }]; model.user = model.users[0]; model.state = { marks: {}, progress: {} }; model.photos = { photos: images.map(function (image, i) { return { id: image, name: 'Recuerdo de Springfield ' + (i + 1), image: 'assets/demo-' + image + '.jpg' }; }), folders: [] };
    history = []; go({ type: 'home' }, true);
  }
  function profiles() {
    var page = el('main', 'profiles'); append(page, [brand(), el('span', 'eyebrow', 'CADA UNO, SU MOMENTO'), el('h1', '', '¿Quién se pone cómodo?'), el('p', 'muted', 'Tu lista y tus historias, justo donde las dejaste.')]);
    var row = el('div', 'profile-grid');
    model.users.forEach(function (user, index) {
      var b = button('', function () { selectUser(user, b); }, 'profile-card', null, 'user-' + user.id);
      var avatar = el('span', 'avatar avatar-' + index % 4); avatar.textContent = (user.name === 'default' ? 'C' : user.name).slice(0, 1).toUpperCase();
      if (/^data:image\/(jpeg|png|webp);base64,/.test(user.avatar || '')) { avatar.textContent = ''; var photo = el('img'); photo.src = user.avatar; photo.alt = ''; avatar.appendChild(photo); }
      append(b, [avatar, el('strong', '', user.name === 'default' ? 'Casa' : user.name)]); if (user.id === read('minitv-lg-profile') || (index === 0 && !read('minitv-lg-profile'))) b.dataset.primary = 'true'; row.appendChild(b);
    });
    append(page, [row, button('Cambiar conexión', function () { disconnect(false); }, 'button text-button', 'settings')]); root.appendChild(page);
  }
  function selectUser(user, b) {
    b.disabled = true; var version = revision;
    var request = model.demo ? Promise.resolve({ marks: {}, progress: {} }) : api.request('/users/' + encodeURIComponent(user.id) + '/state');
    request.then(function (state) { if (version !== revision) return; model.user = user; model.state = state; store('minitv-lg-profile', user.id); history = []; go({ type: 'home' }, true); }).catch(function (e) { b.disabled = false; failure(e); });
  }
  function art(item, full) {
    if (item.image) return item.image;
    if (item.poster && api && /^\/[A-Za-z0-9_.-]+$/.test(item.poster)) return api.media('/tmdb/images/' + item.poster.slice(1), { width: full ? 1280 : 500 });
    if (item.relativePath && api) return api.media('/pictures/content', { relativePath: item.relativePath, render: full ? 'preview' : 'thumb' });
    return '';
  }
  function imageNode(item, className, full) {
    var wrap = el('div', className), url = art(item, full);
    wrap.appendChild(icon(item.type === 'movie' ? 'movie' : item.type === 'series' ? 'series' : 'photo'));
    if (url) { var image = el('img'); image.alt = ''; image.onload = function () { wrap.classList.add('has-art'); }; image.onerror = function () { wrap.classList.remove('has-art'); if (image.parentNode) image.parentNode.removeChild(image); }; wrap.appendChild(image); image.src = url; }
    return wrap;
  }
  function progress(item) { return (model.state.progress || {})[C.key('video', item.path)] || {}; }
  function allPlayable() { var entries = model.catalog.movies.slice(); model.catalog.series.forEach(function (series) { entries = entries.concat(series.episodes); }); return entries; }
  function card(item, wide) {
    var b = button('', function () { go({ type: 'detail', item: item }); }, 'media-card' + (wide ? ' wide-card' : ''), null, 'card-' + item.id);
    var cover = imageNode(item, 'card-art', false); cover.appendChild(el('span', 'card-type', item.type === 'series' ? 'SERIE' : item.type === 'episode' ? 'EPISODIO' : 'PELÍCULA'));
    var p = progress(item); if (p.seconds && !p.completed) { var bar = el('div', 'card-progress'); var fill = el('i'); fill.style.width = Math.min(100, p.duration ? p.seconds / p.duration * 100 : 5) + '%'; bar.appendChild(fill); cover.appendChild(bar); }
    var meta = item.year || (item.type === 'series' ? item.episodes.length + ' episodios' : item.type === 'episode' ? 'T' + item.season + ' · E' + item.episode : 'En tu biblioteca');
    append(b, [cover, el('strong', 'card-title', item.title), el('span', 'card-meta', meta)]); return b;
  }
  function section(main, title, items, wide) {
    var row = el('section', 'catalog-section'); row.appendChild(el('h2', 'section-title', title));
    var grid = el('div', 'card-grid'); items.forEach(function (item) { grid.appendChild(card(item, wide)); }); row.appendChild(grid); main.appendChild(row);
  }
  function empty(main, title, copy) { var block = el('div', 'empty'); append(block, [icon('series'), el('h2', '', title), el('p', 'muted', copy)]); main.appendChild(block); }
  function hero(main) {
    var item = model.catalog.series[0] || model.catalog.movies[0];
    if (!item) return empty(main, 'Tu próxima historia empieza aquí', 'Añade películas o series desde la web de MiniTV y actualiza la biblioteca.');
    var hero = el('section', 'hero' + (item.title.length > 35 ? ' long-title' : '')), backdrop = imageNode(item, 'hero-art', true), copy = el('div', 'hero-copy');
    append(copy, [el('span', 'eyebrow', model.demo ? 'UNA VENTANA A SPRINGFIELD' : 'HOY ES UN BUEN DÍA PARA DESCONECTAR'), el('h1', '', item.title), el('p', 'hero-meta', [item.year, item.genres, item.type === 'series' ? item.episodes.length + ' episodios' : 'De tu biblioteca'].filter(Boolean).join('  ·  ')), el('p', 'hero-description', item.description || 'Tus historias favoritas ya tienen sitio en el sofá. Elige, dale al play y disfruta.')]);
    var action = button(item.type === 'series' ? 'Explorar la serie' : 'Ver película', function () { go({ type: 'detail', item: item }); }, 'button primary', 'play', 'hero'); action.dataset.primary = 'true';
    copy.appendChild(action); append(hero, [backdrop, copy, el('span', 'hero-caption', model.demo ? 'MINITV / DEMOSTRACIÓN' : 'MINITV / EN CASA')]); main.appendChild(hero);
  }
  function browse() {
    var main = shell(route.type), items = [], title = '';
    if (route.type === 'home') {
      hero(main);
      if (model.demo) section(main, 'Un paseo por Springfield', model.catalog.series[0].episodes, true);
      var continuing = allPlayable().filter(function (item) { var p = progress(item); return p.seconds > 5 && !p.completed; }).sort(function (a, b) { return (progress(b).updatedAt || 0) - (progress(a).updatedAt || 0); });
      if (continuing.length) section(main, 'Seguimos donde lo dejamos', continuing.slice(0, 5), true);
      if (model.catalog.series.length && !model.demo) section(main, 'Una serie, otro episodio', model.catalog.series.slice(0, 5), true);
      if (model.catalog.movies.length) section(main, 'Noche de película', model.catalog.movies.slice(0, 5), true);
      return;
    }
    if (route.type === 'movies') { items = model.catalog.movies; title = 'Noche de película'; }
    if (route.type === 'series') { items = model.catalog.series; title = 'Una más y a dormir'; }
    if (route.type === 'favorites') { title = 'Tu próxima sesión'; items = model.catalog.movies.concat(model.catalog.series).filter(function (item) { return (model.state.marks[item.markKey] || {}).favorite; }); }
    append(main, [el('span', 'eyebrow', route.type === 'favorites' ? 'MI LISTA' : 'TU BIBLIOTECA'), el('h1', 'page-title', route.type === 'search' ? '¿Qué te apetece ver?' : title)]);
    if (route.type === 'search') {
      var form = el('form', 'search-form'), input = el('input'); input.type = 'search'; input.placeholder = 'Busca películas, series o episodios'; input.setAttribute('aria-label', 'Buscar en tu biblioteca'); input.value = route.query || ''; input.dataset.primary = 'true';
      var search = button('Buscar', function () { route.query = input.value; route.page = 0; route.focus = 'search-results'; render(); }, 'button primary', 'search');
      form.onsubmit = function (event) { event.preventDefault(); search.click(); }; append(form, [input, search]); main.appendChild(form);
      var q = (route.query || '').trim().toLocaleLowerCase();
      if (!q) { empty(main, 'Encuentra tu siguiente historia', 'Escribe un título con el teclado de la tele.'); return; }
      items = model.catalog.movies.concat(model.catalog.series, allPlayable().filter(function (item) { return item.type === 'episode'; })).filter(function (item) { return (item.title + ' ' + (item.seriesTitle || '')).toLocaleLowerCase().indexOf(q) !== -1; });
    }
    main.appendChild(el('p', 'muted count', items.length + ' títulos en tu biblioteca'));
    if (!items.length) { empty(main, route.type === 'favorites' ? 'Guarda algo para después' : 'No hay títulos aquí todavía', route.type === 'favorites' ? 'Abre una película o serie y pulsa «Añadir a mi lista».' : 'Añade contenido desde la web de MiniTV o prueba otra búsqueda.'); return; }
    pagedCards(main, items, function (item) { return card(item, false); });
  }
  function pagedCards(main, items, makeCard) {
    var page = Math.max(0, Math.min(route.page || 0, Math.ceil(items.length / 25) - 1)), grid = el('div', 'card-grid');
    items.slice(page * 25, (page + 1) * 25).forEach(function (item, index) { var node = makeCard(item); if (index === 0) { node.dataset.primary = 'true'; if (route.type === 'search') node.dataset.focus = 'search-results'; } grid.appendChild(node); }); main.appendChild(grid);
    if (items.length <= 25) return;
    var pager = el('div', 'actions pagination');
    var prev = button('Anterior', function () { route.page = page - 1; route.scroll = 0; route.focus = null; render(); }, 'button', 'back'); prev.disabled = page === 0;
    var next = button('Siguiente', function () { route.page = page + 1; route.scroll = 0; route.focus = null; render(); }, 'button', 'play'); next.disabled = (page + 1) * 25 >= items.length;
    append(pager, [prev, el('span', 'muted', (page + 1) + ' / ' + Math.ceil(items.length / 25)), next]); main.appendChild(pager);
  }
  function savePatch(patch, owner) {
    function merge() {
      Object.keys(patch).forEach(function (category) { Object.keys(patch[category]).forEach(function (key) {
        var old = model.state[category][key] || {}, value = patch[category][key];
        Object.keys(value).forEach(function (field) { if (field === 'episodes') { old.episodes = old.episodes || {}; Object.keys(value.episodes).forEach(function (e) { old.episodes[e] = value.episodes[e]; }); } else old[field] = value[field]; });
        old.updatedAt = Date.now(); model.state[category][key] = old;
      }); });
    }
    if (model.demo) { merge(); return Promise.resolve(); }
    var userId = owner ? owner.userId : model.user.id, connection = owner ? owner.api : api;
    return connection.request('/users/' + encodeURIComponent(userId) + '/state', 'PATCH', patch).then(function () { if (model.user && model.user.id === userId && api === connection) merge(); });
  }
  function favorite(item, b) {
    if (item.demo) { toast('Conecta tu MiniTV para guardar tu lista.'); return; }
    b.disabled = true; var patch = { marks: {} }; patch.marks[item.markKey] = { favorite: !(model.state.marks[item.markKey] || {}).favorite };
    savePatch(patch).then(function () { b.disabled = false; b.querySelector('span:last-child').textContent = patch.marks[item.markKey].favorite ? 'Quitar de mi lista' : 'Añadir a mi lista'; }).catch(function (e) { b.disabled = false; failure(e); });
  }
  function detail() {
    var item = route.item, main = shell(item.type === 'movie' ? 'movies' : 'series');
    main.appendChild(button('Volver', back, 'button text-button', 'back', 'detail-back'));
    var panel = el('div', 'detail-panel'), copy = el('div', 'detail-copy');
    append(copy, [el('span', 'eyebrow', item.type === 'series' ? 'SERIE · EN TU BIBLIOTECA' : item.type === 'episode' ? item.seriesTitle + ' · T' + item.season + ' E' + item.episode : 'PELÍCULA · EN TU BIBLIOTECA'), el('h1', '', item.title), el('p', 'hero-meta', [item.year, item.genres, item.rating ? '★ ' + item.rating.toFixed(1) : ''].filter(Boolean).join('  ·  ')), el('p', 'muted', item.description || 'Disponible en tu biblioteca MiniTV.')]);
    var actions = el('div', 'actions');
    if (item.type !== 'series') {
      var p = progress(item), play = button(p.seconds > 5 && !p.completed ? 'Continuar · ' + C.time(p.seconds) : 'Reproducir', function () { go({ type: 'player', item: item, start: p.completed ? 0 : p.seconds || 0 }); }, 'button primary', 'play', 'play'); play.dataset.primary = 'true'; actions.appendChild(play);
      if (p.seconds > 5 && !p.completed) actions.appendChild(button('Desde el principio', function () { go({ type: 'player', item: item, start: 0 }); }, 'button', null, 'restart'));
    }
    if (item.type !== 'episode') { var fav = button((model.state.marks[item.markKey] || {}).favorite ? 'Quitar de mi lista' : 'Añadir a mi lista', function () { favorite(item, fav); }, 'button', 'heart', 'favorite'); actions.appendChild(fav); }
    copy.appendChild(actions); if (item.demo) copy.appendChild(el('p', 'demo-note', 'DEMO · El reproductor abre el vídeo de bienvenida de Donkicode Lab.'));
    append(panel, [imageNode(item, 'detail-art', true), copy]); main.appendChild(panel);
    if (item.type === 'series') {
      var seasons = []; item.episodes.forEach(function (episode) { if (seasons.indexOf(episode.season) < 0) seasons.push(episode.season); });
      var current = route.season || seasons[0], tabs = el('div', 'season-tabs');
      seasons.forEach(function (s) { tabs.appendChild(button('Temporada ' + s, function () { route.season = s; route.page = 0; route.focus = 'season-' + s; render(); }, 'button ' + (current === s ? 'selected' : ''), null, 'season-' + s)); }); main.appendChild(tabs);
      var episodes = item.episodes.filter(function (episode) { return episode.season === current; });
      pagedCards(main, episodes, function (episode) { return card(episode, true); });
    }
  }
  function settings() {
    var main = shell('settings'); append(main, [el('span', 'eyebrow', 'COMO EN CASA'), el('h1', 'page-title', 'Tu MiniTV'), el('p', 'muted', model.demo ? 'Estás explorando la demostración.' : api.base)]);
    var box = el('section', 'settings-box'); append(box, [el('h2', '', 'Biblioteca'), el('p', 'muted', 'Películas, series, fotos y perfiles de tu MiniTV. Gestiona y añade contenido desde su web.')]);
    var reload = button('Actualizar biblioteca', function () {
      if (model.demo) return toast('La demostración ya está actualizada.');
      reload.disabled = true; var version = revision, connection = api;
      Promise.all([api.request('/videos?pictures=0'), api.request('/tmdb/library?language=es-ES').catch(function (e) { if (e.status === 401) throw e; return {}; })]).then(function (data) {
        if (connection !== api) return; model.catalog = C.catalog(data[0], data[1]); model.photos = null; if (version === revision) reload.disabled = false; toast('Biblioteca actualizada.');
      }).catch(function (e) { reload.disabled = false; failure(e); });
    }, 'button primary', 'refresh'); reload.dataset.primary = 'true';
    append(box, [reload, button('Cambiar de perfil', function () { go({ type: 'profiles' }); }, 'button', 'user')]); main.appendChild(box);
    var connection = el('section', 'settings-box'); append(connection, [el('h2', '', 'Conexión'), el('p', 'muted', 'El PIN se guarda en memoria hasta cerrar la app. El sonido se ajusta con los botones de volumen de la LG.'), button('Cambiar de MiniTV / cerrar sesión', function () { disconnect(false); }, 'button', 'settings'), button('Olvidar esta MiniTV', function () { modal('¿Olvidar esta MiniTV?', 'Borraremos la dirección guardada en esta tele.', [{ label: 'Cancelar', primary: true, run: closeDialog }, { label: 'Olvidar', run: function () { closeDialog(); disconnect(true); } }]); }, 'button')]); main.appendChild(connection);
    main.appendChild(el('p', 'fine', 'MiniTV para LG · 1.0.0 · Diseñada para webOS 4.0 o posterior'));
  }
  function disconnect(forget) {
    if (player) stopPlayer(); if (api) api.abort(); api = null; model.user = null; model.demo = false; model.photos = null; model.state = { marks: {}, progress: {} };
    if (forget) { store('minitv-lg-server', null); store('minitv-lg-profile', null); }
    history = []; go({ type: 'connect' }, true);
  }
  function photos() {
    var main = shell('photos'); append(main, [el('span', 'eyebrow', 'MOMENTOS QUE SE QUEDAN'), el('h1', 'page-title', 'Tus recuerdos, en grande')]);
    if (!model.photos) {
      var status = el('p', 'muted', 'Cargando tus fotos…'); main.appendChild(status); var version = revision;
      api.request('/pictures/library').then(function (data) { if (version !== revision) return; model.photos = data; render(); }).catch(function (e) { if (version !== revision) return; status.textContent = e.message; main.appendChild(button('Reintentar', render, 'button primary', 'refresh')); if (e.status === 401) failure(e); }); return;
    }
    var items = model.photos.photos || [], folders = model.photos.folders || [], filters = el('div', 'season-tabs');
    filters.appendChild(button('Todas las fotos', function () { route.folder = ''; route.page = 0; render(); }, 'button ' + (!route.folder ? 'selected' : '')));
    folders.forEach(function (folder) { filters.appendChild(button(folder.name, function () { route.folder = folder.id; route.page = 0; render(); }, 'button ' + (route.folder === folder.id ? 'selected' : ''))); }); main.appendChild(filters);
    if (route.folder) items = items.filter(function (photo) { return photo.folderId === route.folder || (photo.folderIds || []).indexOf(route.folder) >= 0; });
    if (!items.length) { empty(main, 'Aquí caben todos tus recuerdos', 'Sube fotos desde la web o desde MiniTV Fotos en tu móvil.'); return; }
    var actions = el('div', 'actions'); append(actions, [button('Ver presentación', function () { go({ type: 'photo', items: items, index: 0, slideshow: true }); }, 'button primary', 'play'), button('Actualizar fotos', function () { if (!model.demo) model.photos = null; render(); }, 'button', 'refresh')]); main.appendChild(actions);
    pagedCards(main, items, function (photo) {
      var b = button('', function () { go({ type: 'photo', items: items, index: items.indexOf(photo) }); }, 'media-card wide-card', null, 'photo-' + photo.id);
      append(b, [imageNode(photo, 'card-art'), el('strong', 'card-title', photo.name)]); return b;
    });
  }
  function photoScreen() {
    var page = el('main', 'photo-screen'), photo = route.items[route.index];
    var image = el('img', 'full-photo'); image.src = art(photo, true); image.alt = photo.name || 'Foto'; image.onerror = function () { toast('No se ha podido abrir esta foto. Puedes pasar a la siguiente.'); };
    var controls = el('div', 'photo-controls');
    append(controls, [button('Volver', back, 'button', 'back'), button('Anterior', function () { changePhoto(-1); }, 'button'), el('span', 'photo-caption', (route.index + 1) + ' / ' + route.items.length + ' · ' + (photo.name || '')),
      button(route.slideshow ? 'Pausar' : 'Presentación', function () { route.slideshow = !route.slideshow; render(); }, 'button primary', route.slideshow ? 'pause' : 'play'), button('Siguiente', function () { changePhoto(1); }, 'button')]);
    append(page, [image, controls]); root.appendChild(page); clearInterval(slideTimer); slideTimer = null;
    if (route.slideshow) slideTimer = setInterval(function () { changePhoto(1); }, 6000);
  }
  function changePhoto(delta) { route.index = (route.index + delta + route.items.length) % route.items.length; render(); }
  function playScreen() {
    var item = route.item, page = el('main', 'player'), video = el('video', 'video'); video.preload = 'auto'; video.setAttribute('playsinline', ''); video.setAttribute('crossorigin', 'anonymous');
    var notice = el('div', 'player-notice'), status = el('p', '', 'Preparando tu sesión…'), retry = button('Reintentar', function () { startPreparation(true); }, 'button primary', 'refresh'); retry.hidden = true;
    append(notice, [el('span', 'eyebrow', item.seriesTitle || 'MINITV'), el('h1', '', item.title), status, retry, button('Volver', back, 'button', 'back')]);
    var controls = el('div', 'player-controls'); controls.dataset.visible = 'true';
    var timeline = el('div', 'timeline'), fill = el('div', 'timeline-fill'); timeline.appendChild(fill);
    var time = el('span', 'player-time', '0:00 / 0:00'), title = el('h2', '', item.title), actions = el('div', 'actions');
    var playButton = button('Pausar', togglePlay, 'button primary', 'pause', 'player-toggle');
    var subtitleButton = button('Subtítulos: no', cycleSubtitles, 'button', null, 'subtitles');
    append(actions, [button('Volver', back, 'button', 'back'), button('−30 s', function () { seek(-30); }, 'button'), playButton, button('+30 s', function () { seek(30); }, 'button'), subtitleButton]);
    var next = nextEpisode(item); if (next) actions.appendChild(button('Siguiente episodio', function () { go({ type: 'player', item: next, start: 0 }, true); }, 'button', 'play'));
    append(controls, [title, timeline, time, actions]); append(page, [video, notice, controls]); root.appendChild(page);
    player = { video: video, item: item, page: page, notice: notice, status: status, retry: retry, controls: controls, playButton: playButton,
      subtitles: [], subtitleIndex: -1, subtitleButton: subtitleButton, active: true, ready: false, initialized: false,
      start: route.start || 0, lastSave: 0, timer: null, hideTimer: null, savePromise: null, unsaved: null, warned: false, token: 0,
      userId: model.user.id, api: api };
    var current = player;
    video.addEventListener('loadedmetadata', function () { if (!current.active) return; if (!current.initialized) { current.initialized = true; if (current.start) video.currentTime = Math.min(current.start, isFinite(video.duration) ? Math.max(0, video.duration - 1) : current.start); } });
    video.addEventListener('canplay', function () { if (!current.active || current.started) return; clearTimeout(current.loadTimer); current.started = true; current.ready = true; notice.hidden = true; attemptPlay(); focus(playButton); });
    video.addEventListener('timeupdate', function () { if (!current.active) return; time.textContent = C.time(video.currentTime) + ' / ' + C.time(isFinite(video.duration) ? video.duration : 0); fill.style.width = (video.duration ? Math.min(100, video.currentTime / video.duration * 100) : 0) + '%'; saveProgress(current, false); });
    video.addEventListener('play', function () { if (!current.active) return; playButton.querySelector('span:last-child').textContent = 'Pausar'; revealControls(); });
    video.addEventListener('pause', function () { if (!current.active) return; playButton.querySelector('span:last-child').textContent = 'Reproducir'; revealControls(); saveProgress(current, true); });
    video.addEventListener('ended', function () { if (!current.active) return; saveProgress(current, true); revealControls(); });
    video.addEventListener('seeked', function () { saveProgress(current, true); });
    video.addEventListener('error', function (event) { if (!current.active || event.target !== video || !video.error) return;
      var message = { 1: 'La reproducción se ha interrumpido.', 2: 'Se ha perdido la conexión con el vídeo.', 3: 'La LG no ha podido decodificar este vídeo.', 4: 'Este formato de vídeo no es compatible con la LG.' }[video.error.code];
      current.start = video.currentTime || current.start; playbackError(current, message + ' Reintenta o usa un archivo MP4 con vídeo H.264 y audio AAC.');
    });
    page.addEventListener('mousemove', function () { if (current.ready) revealControls(); });
    startPreparation(false);
  }
  function nextEpisode(item) {
    var found = null; model.catalog.series.some(function (series) { var i = series.episodes.indexOf(item); if (i >= 0) { found = series.episodes[i + 1] || null; return true; } return false; }); return found;
  }
  function playbackError(current, message) {
    if (!current.active) return; clearTimeout(current.loadTimer); current.notice.hidden = false; current.status.textContent = message; current.retry.hidden = false; focus(current.retry); revealControls();
  }
  function startPreparation(retry) {
    var current = player; if (!current) return;
    var token = ++current.token; clearTimeout(current.timer); clearTimeout(current.loadTimer); current.video.pause(); current.started = false; current.ready = false; current.initialized = false;
    current.notice.hidden = false; current.retry.hidden = true; current.status.textContent = 'Comprobando el vídeo y el audio…';
    function alive() { return current.active && current.token === token; }
    function load(url) { if (!alive()) return; current.status.textContent = 'Abriendo el vídeo…'; current.video.src = url; current.video.load(); current.loadTimer = setTimeout(function () { if (alive()) playbackError(current, 'El vídeo tarda demasiado en abrirse. Comprueba la conexión y vuelve a intentarlo.'); }, 45000); }
    if (model.demo) { load('assets/welcome.mp4'); return; }
    function requestJob() { return api.request('/media/playback', 'POST', { relativePath: current.item.path, supportedAudio: C.audioSupport(current.video), retry: !!retry }); }
    function check(job) {
      if (!alive()) return;
      if (!job.id || ['queued', 'checking', 'converting', 'finalizing', 'ready', 'failed'].indexOf(job.state) < 0) throw new Error('Actualiza DeviceApp para preparar este vídeo.');
      if (job.state === 'failed') throw new Error('No se pudo preparar el audio: ' + (job.errorCode || 'error del servidor') + '.');
      if (job.state === 'ready') {
        var params = { relativePath: current.item.path };
        if (job.converted) { if (!/^[a-f0-9]{64}$/.test(job.cacheKey || '')) throw new Error('La copia de vídeo no es válida.'); params.browserCopy = job.cacheKey; }
        load(api.media('/media/stream', params)); loadSubtitles(current); return;
      }
      var labels = { queued: 'Vídeo en cola. La MiniTV preparará el audio.', checking: 'Comprobando el audio…', converting: 'Preparando audio compatible…', finalizing: 'Terminando la copia de reproducción…' };
      current.status.textContent = labels[job.state] + (typeof job.percent === 'number' ? ' ' + Math.round(job.percent) + '%' : '');
      current.timer = setTimeout(function () { if (!alive()) return; api.request('/media/playback?' + C.query({ id: job.id })).catch(function (e) { if (e.status === 404) return requestJob(); throw e; }).then(check).catch(failed); }, 1500);
    }
    function failed(e) { if (!alive()) return; if (e.status === 401) failure(e); else playbackError(current, e.message); }
    requestJob().then(check).catch(failed);
  }
  function loadSubtitles(current) {
    api.request('/media/stream?' + C.query({ relativePath: current.item.path, subtitles: 'list' })).then(function (inventory) { if (!current.active) return; current.subtitles = (inventory.tracks || []).filter(function (track) { return track.available !== false; }); current.subtitleButton.disabled = !current.subtitles.length; }).catch(function () { if (current.active) toast('No se han podido cargar los subtítulos. El vídeo sigue disponible.'); });
  }
  function cycleSubtitles() {
    if (!player || !player.subtitles.length) return toast('Este vídeo no tiene subtítulos externos disponibles.');
    var current = player, video = current.video;
    Array.prototype.slice.call(video.querySelectorAll('track')).forEach(function (track) { video.removeChild(track); });
    current.subtitleIndex = (current.subtitleIndex + 2) % (current.subtitles.length + 1) - 1;
    var sub = current.subtitles[current.subtitleIndex]; current.subtitleButton.querySelector('span:last-child').textContent = 'Subtítulos: ' + (sub ? sub.title || sub.language || (current.subtitleIndex + 1) : 'no');
    if (sub) { var track = el('track'); track.kind = 'subtitles'; track.label = sub.title || sub.language || 'Subtítulos'; track.srclang = sub.language || 'es'; track.default = true;
      track.src = api.media('/media/stream', { relativePath: current.item.path, subtitles: sub.id });
      track.onload = function () { if (current.active) track.track.mode = 'showing'; }; track.onerror = function () { toast('No se puede abrir esta pista de subtítulos.'); }; video.appendChild(track); track.track.mode = 'showing';
    }
    revealControls();
  }
  function attemptPlay() { if (!player) return; var current = player; var promise = current.video.play(); if (promise && promise.catch) promise.catch(function () { if (current.active) { revealControls(); toast('Pulsa Reproducir para empezar.'); } }); }
  function togglePlay() { if (!player || !player.ready) return; if (player.video.paused) attemptPlay(); else player.video.pause(); revealControls(); }
  function seek(seconds) { if (!player || !player.initialized || !isFinite(player.video.duration)) return; player.video.currentTime = Math.max(0, Math.min(player.video.duration - 0.1, player.video.currentTime + seconds)); revealControls(); }
  function revealControls() { if (!player) return; var current = player; current.controls.dataset.visible = 'true'; clearTimeout(current.hideTimer); if (!current.video.paused && current.notice.hidden) current.hideTimer = setTimeout(function () { if (current.active) current.controls.dataset.visible = 'false'; }, 5000); }
  function saveProgress(current, force) {
    if (!current.initialized || current.video.seeking || !isFinite(current.video.currentTime) || !model.user || model.demo) return;
    if (!force && Date.now() - current.lastSave < 10000) return; current.lastSave = Date.now();
    current.unsaved = C.progressPatch(current.item, current.video.currentTime, isFinite(current.video.duration) ? current.video.duration : 0, current.video.ended);
    flushProgress(current);
  }
  function flushProgress(current) {
    if (current.savePromise || !current.unsaved || !api || !model.user) return;
    var patch = current.unsaved; current.unsaved = null;
    current.savePromise = savePatch(patch, current).then(function () { current.savePromise = null; if (current.unsaved) flushProgress(current); }).catch(function (e) {
      current.savePromise = null; if (!current.unsaved) current.unsaved = patch;
      if (!current.warned) { current.warned = true; toast('No se pudo guardar la posición. Se reintentará durante la reproducción.'); }
      if (e.status === 401 && current.active) failure(e);
    });
  }
  function stopPlayer() {
    if (!player) return; var current = player; saveProgress(current, true); current.active = false;
    clearTimeout(current.timer); clearTimeout(current.loadTimer); clearTimeout(current.hideTimer); current.video.pause(); current.video.removeAttribute('src'); current.video.load(); player = null;
  }
  function move(direction) {
    var current = document.activeElement, nodes = focusables(); if (nodes.indexOf(current) < 0) return focus(nodes[0]);
    function rect(node) { var box = node.getBoundingClientRect(); return { node: node, x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width, height: box.height }; }
    var target = C.neighbor(rect(current), nodes.filter(function (node) { return node !== current; }).map(rect), direction); if (target) focus(target.node);
  }
  document.addEventListener('keydown', function (event) {
    var code = event.keyCode, key = event.key, typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (code === 461 || key === 'Escape' || key === 'BrowserBack' || (!typing && key === 'Backspace')) { event.preventDefault(); back(); return; }
    if (dialog && key === 'Tab') { event.preventDefault(); var nodes = focusables(), i = nodes.indexOf(document.activeElement); focus(nodes[(i + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length]); return; }
    if (player && !dialog) {
      if ([415, 19, 10252, 413, 412, 417].indexOf(code) >= 0 || (!typing && key === ' ')) {
        event.preventDefault(); if (code === 413) back(); else if (code === 412) seek(-30); else if (code === 417) seek(30); else if (code === 415) attemptPlay(); else if (code === 19) player.video.pause(); else togglePlay(); return;
      }
      if (player.controls.dataset.visible === 'false' && [13, 37, 38, 39, 40].indexOf(code) >= 0) {
        event.preventDefault(); if (code === 37) seek(-10); else if (code === 39) seek(10); else { revealControls(); focus(player.playButton); if (code === 13) togglePlay(); } return;
      }
      if ([13, 37, 38, 39, 40].indexOf(code) >= 0) revealControls();
    }
    if (route.type === 'photo' && !dialog && [33, 34].indexOf(code) >= 0) { event.preventDefault(); changePhoto(code === 33 ? -1 : 1); return; }
    if (typing && [37, 39].indexOf(code) >= 0) return;
    if ([37, 38, 39, 40].indexOf(code) >= 0) { event.preventDefault(); move({ 37: 'left', 38: 'up', 39: 'right', 40: 'down' }[code]); }
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { if (player) { player.video.pause(); saveProgress(player, true); } clearInterval(slideTimer); } else if (route.type === 'photo' && route.slideshow) render(); });
  window.addEventListener('pagehide', function () { if (player) saveProgress(player, true); });
  // Focusing with the Magic Remote also makes D-pad navigation start at that card.
  root.addEventListener('mouseover', function (event) { var node = event.target; while (node && node !== root && node.tagName !== 'BUTTON') node = node.parentNode; if (node && node.tagName === 'BUTTON' && !node.disabled && (!dialog || dialog.contains(node))) node.focus(); });
  render();
}());
