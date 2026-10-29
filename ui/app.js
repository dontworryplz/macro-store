/* Macro Store — Linux uygulama mağazası arayüzü.
   Framework ya da derleme adımı yok; düşük bellek kullanımı için saf JavaScript. */

const TAURI = window.__TAURI__;
const IS_TAURI = Boolean(TAURI?.core?.invoke);
const invoke = IS_TAURI ? TAURI.core.invoke : mockInvoke;
const listen = IS_TAURI ? TAURI.event.listen : mockListen;

const SETUP_SEEN_KEY = "macro-setup-seen";
const SEARCH_HISTORY_KEY = "macro-search-history";
const SEARCH_HISTORY_LIMIT = 5;
const LAST_REFRESH_KEY = "macro-last-refresh";
const FAVORITES_KEY = "macro-favorites";
const RECENTS_KEY = "macro-recents";
const RECENTS_LIMIT = 5;
const UPDATE_WATCH_INTERVAL = 30 * 60 * 1000;
const ACTIVITY_KEY = "macro-activity";
const ACTIVITY_LIMIT = 25;
const LIBRARY_PREFS_KEY = "macro-library-prefs";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const ACTIONS = {
  install: { busy: "Kuruluyor…", verb: "kuruluyor", done: "Kurulum tamamlandı." },
  update: { busy: "Güncelleniyor…", verb: "güncelleniyor", done: "Güncelleme tamamlandı." },
  remove: { busy: "Kaldırılıyor…", verb: "kaldırılıyor", done: "Kaldırma tamamlandı." },
};
const ACTION_LABELS = {
  install: "Kurulum",
  update: "Güncelleme",
  remove: "Kaldırma",
  prune: "Bakım",
  channel: "Kanal",
  mask: "Güncelleme durdurma",
  unmask: "Güncelleme sürdürme",
  rollback: "Sürüm geri alma",
};
const PROVIDER_NAMES = { flatpak: "Flatpak", snap: "Snap", brew: "Homebrew" };
const PROVIDER_FILTERS = [
  { value: "all", label: "Tümü" },
  { value: "flatpak", label: "Flatpak" },
  { value: "snap", label: "Snap" },
  { value: "brew", label: "Homebrew" },
];
const INSTALLED_PAGE_SIZE = 40;
const INSTALLED_SORTS = [
  { value: "name", label: "A-Z" },
  { value: "updates", label: "Güncelleme önce" },
  { value: "provider", label: "Sağlayıcıya göre" },
];

const FALLBACK_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
    <path d="M24 7 39.5 15.2v17.6L24 41 8.5 32.8V15.2L24 7Z" stroke="#8c8a85" stroke-width="2" stroke-linejoin="round"/>
    <path d="m9.2 15.4 14.8 8.1 14.8-8.1M24 41V23.5" stroke="#8c8a85" stroke-width="2" stroke-linejoin="round"/>
  </svg>`,
)}`;

const ICON = {
  search: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.2" stroke="currentColor" stroke-width="1.6"/><path d="m15.7 15.7 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4 21 20H3L12 4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 9.5v5M12 17.2v.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.4 4.4L19 7.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  box: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3.5 8 4.3v8.4l-8 4.3-8-4.3V7.8l8-4.3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m4.4 7.8 7.6 4.1 7.6-4.1M12 21v-9.1" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 7h15M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7M6.8 7l.8 12h8.8l.8-12M10 10.5v5M14 10.5v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  repo: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3" stroke="currentColor" stroke-width="1.6"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" stroke="currentColor" stroke-width="1.6"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="1.6"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 4.2 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.9l5.4-.8L12 4.2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  starFilled: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 4.2 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.9l5.4-.8L12 4.2Z"/></svg>`,
};

const CATEGORY_LIST = [
  {
    slug: "audiovideo",
    name: "Ses ve Video",
    desc: "Oynatıcılar, düzenleyiciler ve medya araçları",
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M8 6.5v11l9-5.5-9-5.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.5"/></svg>`,
  },
  {
    slug: "development",
    name: "Geliştirme",
    desc: "Kod editörleri, IDE’ler ve geliştirici araçları",
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 5l-3 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    slug: "education",
    name: "Eğitim",
    desc: "Öğrenme, öğretme ve başvuru kaynakları",
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="m3 9 9-4 9 4-9 4-9-4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 11v5.2c2.8 2 7.2 2 10 0V11M21 9v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    slug: "healthfitness",
    name: "Sağlık ve Spor",
    desc: "Egzersiz, sağlık ve yaşam takibi",
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 20s-7.5-4.4-7.5-9.5A4.2 4.2 0 0 1 12 7.7a4.2 4.2 0 0 1 7.5 2.8C19.5 15.6 12 20 12 20Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M5.5 12h3l1.3-2.5L12 15l1.7-4 1.2 2.5h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    slug: "game",
    name: "Oyun",
    desc: "Oyunlar, emülatörler ve oyun araçları",
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M7.5 8h9A4.5 4.5 0 0 1 21 12.5v1A3.5 3.5 0 0 1 17.5 17c-1.1 0-2.1-.5-2.8-1.4L14 15h-4l-.7.6A3.5 3.5 0 0 1 3 13.5v-1A4.5 4.5 0 0 1 7.5 8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.5 10.5v3M6 12h3M15.5 11.4h.1M17.5 13.4h.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  },
  {
    slug: "graphics",
    name: "Grafik ve Tasarım",
    desc: "Fotoğraf, çizim, 3B ve vektör araçları",
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5c-4.7 0-8.5 3.6-8.5 8.1 0 4.4 3.8 8.1 8.5 8.1h1.4c1.4 0 2.3-1.1 2.3-2.3 0-.7-.3-1.2-.7-1.7-.3-.4-.6-.8-.6-1.4 0-1.2 1-2.1 2.2-2.1h1.2c2.7 0 4.7-1.9 4.7-4.3C20.5 6 16.6 3.5 12 3.5Z" stroke="currentColor" stroke-width="1.5"/><circle cx="7.6" cy="11.2" r="1.1" fill="currentColor"/><circle cx="10.3" cy="7.7" r="1.1" fill="currentColor"/><circle cx="15" cy="8.2" r="1.1" fill="currentColor"/></svg>`,
  },
  {
    slug: "network",
    name: "Ağ ve İnternet",
    desc: "Tarayıcılar, sohbet ve dosya paylaşımı",
    icon: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 12h17M12 3.5c2.5 2.4 3.8 5.3 3.8 8.5S14.5 18.1 12 20.5C9.5 18.1 8.2 15.2 8.2 12S9.5 5.9 12 3.5Z" stroke="currentColor" stroke-width="1.4"/></svg>`,
  },
  {
    slug: "office",
    name: "Ofis",
    desc: "Belgeler, tablolar, sunumlar ve takvim",
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M6 3.5h8l4 4v13H6v-17Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    slug: "science",
    name: "Bilim",
    desc: "Araştırma, analiz ve laboratuvar araçları",
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M9 3.5h6M10 3.5v5L5.4 17a2.2 2.2 0 0 0 1.9 3.3h9.4a2.2 2.2 0 0 0 1.9-3.3L14 8.5v-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.6 14.5h8.8" stroke="currentColor" stroke-width="1.5"/></svg>`,
  },
  {
    slug: "system",
    name: "Sistem",
    desc: "Ayarlar, dosya yöneticileri ve terminal",
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="9" cy="7" r="1.8" fill="var(--surface-2)" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="12" r="1.8" fill="var(--surface-2)" stroke="currentColor" stroke-width="1.5"/><circle cx="10.5" cy="17" r="1.8" fill="var(--surface-2)" stroke="currentColor" stroke-width="1.5"/></svg>`,
  },
  {
    slug: "utility",
    name: "Yardımcı Araçlar",
    desc: "Hesaplama, arşivleme ve günlük araçlar",
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.4 2.4-2.5-.5-.5-2.5 2.4-2.4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORY_LIST.map(category => [category.slug, category]));
function appProvider(app) {
  return app?.provider || "flatpak";
}

function providerName(provider) {
  return PROVIDER_NAMES[provider] || String(provider || "Flatpak");
}

function packageTypeName(app) {
  if (appProvider(app) !== "brew" || !app?.packageType) return "";
  const value = String(app.packageType).trim();
  if (!value) return "";
  const normalized = value.toLowerCase();
  if (normalized === "formula") return "Formula";
  if (normalized === "cask") return "Cask";
  return value;
}

function providerLabel(app) {
  const name = providerName(appProvider(app));
  const packageType = packageTypeName(app);
  return packageType ? `${name} · ${packageType}` : name;
}

function providerManagerLabel(app) {
  const provider = appProvider(app);
  if (provider === "flatpak") return "Flatpak · kullanıcı kapsamı";
  if (provider === "snap") return "Snap · sistem kapsamı";
  return providerLabel(app);
}

function providerActionLabel(action, app) {
  const verbs = { install: "kur", update: "güncelle", remove: "kaldır" };
  const provider = appProvider(app);
  const scope = provider === "flatpak" ? " (kullanıcı kapsamı)" : provider === "snap" ? " (sistem kapsamı)" : "";
  return `${providerName(provider)} ile ${verbs[action] || "işlem yap"}${scope}`;
}

function providerInstallInfo(app) {
  const provider = appProvider(app);
  if (provider === "flatpak") return "Flatpak kullanıcı kapsamında kurulur";
  if (provider === "snap") return "Snap sistem kapsamında kurulur; yetkilendirme istenebilir";
  return "Homebrew paket yöneticisiyle yönetilir";
}

function cliCommand(app) {
  const id = String(app?.id || "").trim();
  if (!id) return "";
  const provider = appProvider(app);
  if (provider === "flatpak") return `flatpak install --user flathub ${id}`;
  if (provider === "snap") return `sudo snap install ${id}`;
  if (provider === "brew") {
    const isCask = app.package_type === "cask" || id.startsWith("cask/");
    const token = id.replace(/^(formula|cask)\//, "");
    return isCask ? `brew install --cask ${token}` : `brew install ${token}`;
  }
  return "";
}

function cliCommandsFor(app) {
  const id = String(app?.id || "").trim();
  if (!id) return [];
  const provider = appProvider(app);
  if (provider === "flatpak") {
    return [
      { label: "Kur", command: `flatpak install --user flathub ${id}` },
      { label: "Güncelle", command: `flatpak update --user ${id}` },
      { label: "Kaldır", command: `flatpak uninstall --user ${id}` },
      { label: "Bilgi", command: `flatpak info ${id}` },
    ];
  }
  if (provider === "snap") {
    return [
      { label: "Kur", command: `sudo snap install ${id}` },
      { label: "Güncelle", command: `sudo snap refresh ${id}` },
      { label: "Kaldır", command: `sudo snap remove ${id}` },
      { label: "Bilgi", command: `snap info ${id}` },
    ];
  }
  if (provider === "brew") {
    const isCask = app.package_type === "cask" || id.startsWith("cask/");
    const token = id.replace(/^(formula|cask)\//, "");
    const flag = isCask ? " --cask" : "";
    return [
      { label: "Kur", command: `brew install${flag} ${token}` },
      { label: "Güncelle", command: `brew upgrade${flag} ${token}` },
      { label: "Kaldır", command: `brew uninstall${flag} ${token}` },
      { label: "Bilgi", command: `brew info${flag} ${token}` },
    ];
  }
  return [];
}

function openCliModal(app) {
  const commands = cliCommandsFor(app);
  if (!commands.length) {
    toast("Bu sağlayıcı için CLI komutu yok.", "error");
    return;
  }
  state.cliApp = app;
  state.cliCommands = commands;
  els.cliSubtitle.textContent = `${app.name || app.id} · ${providerLabel(app)}`;
  els.cliBody.innerHTML = commands.map(item => `
    <div class="cli-command">
      <span class="cli-label">${escapeHtml(item.label)}</span>
      <code>${escapeHtml(item.command)}</code>
      <button class="icon-btn" type="button" data-copy-command="${attr(item.command)}" aria-label="${attr(item.label)} komutunu kopyala">
        ${ICON.copy}
      </button>
    </div>`).join("");
  openModal(els.cliModal);
}

function sameApp(app, provider, id) {
  return Boolean(app && app.id === id && appProvider(app) === provider);
}

function findKnownApp(provider, id) {
  if (!id) return null;
  const pools = [
    state.detail?.app,
    ...state.installed,
    ...state.searchResults,
    ...(state.discover?.picks || []),
    ...(state.discover?.popular || []),
    state.discover?.appOfDay,
    ...(state.category?.apps || []),
    ...state.favorites,
    ...state.recents,
  ];
  return pools.find(app => sameApp(app, provider, id)) || null;
}

function appSnapshot(app) {
  return {
    id: app.id,
    provider: appProvider(app),
    packageType: app.packageType || null,
    name: app.name || app.id,
    summary: app.summary || "",
    developer: app.developer || "",
    icon: app.icon || null,
    category: app.category || null,
    version: app.version || "",
    channel: app.channel || null,
    pinned: Boolean(app.pinned),
    installed: Boolean(app.installed),
    updateAvailable: Boolean(app.updateAvailable),
    monthlyInstalls: app.monthlyInstalls ?? null,
  };
}

function readStoredApps(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(item =>
      item && typeof item.id === "string" && item.id.trim() && PROVIDER_NAMES[item.provider],
    );
  } catch {
    return [];
  }
}

function saveStoredApps(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* Depolama kapalıysa liste yalnızca oturum boyunca tutulur. */
  }
}

function storedAppForView(app) {
  const live = findKnownApp(appProvider(app), app.id);
  return live ? { ...app, ...appSnapshot(live) } : app;
}

function isFavorite(app) {
  return state.favorites.some(item => sameApp(item, appProvider(app), app.id));
}

function toggleFavorite(app) {
  const provider = appProvider(app);
  const active = isFavorite(app);
  if (active) {
    state.favorites = state.favorites.filter(item => !sameApp(item, provider, app.id));
  } else {
    state.favorites = [appSnapshot(app), ...state.favorites];
  }
  saveStoredApps(FAVORITES_KEY, state.favorites);
  toast(active ? "Favorilerden çıkarıldı." : "Favorilere eklendi.", "success");
  renderChrome();
  if (state.route.name === "favorites") renderFavorites();
  else if (["search", "installed", "category"].includes(state.route.name)) renderRoute();
  else if (state.route.name === "detail") renderDetail();
  else renderIf("discover", renderDiscover);
  return !active;
}

function rememberRecent(app) {
  if (!app?.id) return;
  const snapshot = appSnapshot(app);
  state.recents = [
    snapshot,
    ...state.recents.filter(item => !sameApp(item, snapshot.provider, snapshot.id)),
  ].slice(0, RECENTS_LIMIT);
  saveStoredApps(RECENTS_KEY, state.recents);
}

function syncStoredApp(app) {
  const provider = appProvider(app);
  let changed = false;
  for (const list of [state.favorites, state.recents]) {
    const item = list.find(entry => sameApp(entry, provider, app.id));
    if (!item) continue;
    item.installed = Boolean(app.installed);
    item.updateAvailable = Boolean(app.updateAvailable);
    if (app.version) item.version = app.version;
    changed = true;
  }
  if (changed) {
    saveStoredApps(FAVORITES_KEY, state.favorites);
    saveStoredApps(RECENTS_KEY, state.recents);
  }
}

function syncStoredFromInstalled() {
  const byKey = new Map(state.installed.map(app => [selectionKey(appProvider(app), app.id), app]));
  let changed = false;
  for (const list of [state.favorites, state.recents]) {
    for (const item of list) {
      const live = byKey.get(selectionKey(appProvider(item), item.id));
      const installed = Boolean(live);
      if (item.installed !== installed) {
        item.installed = installed;
        changed = true;
      }
      if (live && item.version !== live.version) {
        item.version = live.version || "";
        changed = true;
      }
      if (item.updateAvailable !== Boolean(live?.updateAvailable)) {
        item.updateAvailable = Boolean(live?.updateAvailable);
        changed = true;
      }
    }
  }
  if (changed) {
    saveStoredApps(FAVORITES_KEY, state.favorites);
    saveStoredApps(RECENTS_KEY, state.recents);
  }
}

function providerCounts(apps) {
  const counts = { all: 0, flatpak: 0, snap: 0, brew: 0 };
  if (!Array.isArray(apps)) return null;
  for (const app of apps) {
    counts.all += 1;
    const provider = appProvider(app);
    if (provider in counts) counts[provider] += 1;
  }
  return counts;
}

function providerFilterHtml(scope, selected, apps = null) {
  const label = scope === "search"
    ? "Arama sonuçlarını sağlayıcıya göre filtrele"
    : "Yüklü uygulamaları sağlayıcıya göre filtrele";
  const counts = providerCounts(apps);
  return `<div class="provider-filters" role="group" aria-label="${attr(label)}">
    ${PROVIDER_FILTERS.map(option => {
      const count = counts ? counts[option.value] : null;
      const optionLabel = count === null ? option.label : `${option.label}, ${count} sonuç`;
      return `
      <button class="chip" type="button" data-provider-filter="${scope}" data-provider="${option.value}" aria-pressed="${selected === option.value}" aria-label="${attr(optionLabel)}">
        ${option.label}${count === null ? "" : `<span>${count}</span>`}
      </button>`;
    }).join("")}
  </div>`;
}

function sortFilterHtml() {
  return `<div class="provider-filters sort-filter" role="group" aria-label="Yüklü uygulamaları sırala">
    ${INSTALLED_SORTS.map(option => `
      <button class="chip" type="button" data-installed-sort="${option.value}" aria-pressed="${state.installedSort === option.value}">
        ${option.label}
      </button>`).join("")}
  </div>`;
}

const state = {
  route: { name: "discover" },
  stack: [{ name: "discover" }],
  activeNav: "discover",
  query: "",
  searchResults: [],
  searchHistory: [],
  searching: false,
  searchError: "",
  searchProviderErrors: [],
  searchSeq: 0,
  searchProvider: "all",
  discover: null,
  discoverLoading: false,
  discoverError: "",
  discoverSeq: 0,
  installed: [],
  installedLoaded: false,
  installedFromCache: false,
  installedLoading: false,
  installedError: "",
  installedProviderErrors: [],
  installedVisibleCount: INSTALLED_PAGE_SIZE,
  installedSeq: 0,
  updatesOnly: false,
  installedProvider: "all",
  installedSort: "name",
  installedQuery: "",
  selectionMode: false,
  selection: new Set(),
  lastRefreshed: null,
  favorites: [],
  recents: [],
  activityHistory: [],
  libraryUsage: null,
  brewTaps: [],
  brewTapsLoading: false,
  brewTapsError: "",
  cliApp: null,
  cliCommands: [],
  category: null,
  categoryLoading: false,
  categoryError: "",
  categorySeq: 0,
  detail: null,
  detailLoading: false,
  detailError: "",
  detailSeq: 0,
  permissions: null,
  permissionsLoading: false,
  permissionsError: "",
  permissionsSeq: 0,
  commits: [],
  commitsLoading: false,
  commitsError: "",
  commitsSeq: 0,
  remotes: [],
  remotesLoading: false,
  remotesError: "",
  remotesLoaded: false,
  remotesSeq: 0,
  storeInfo: null,
  setup: {
    status: null,
    loading: false,
    running: false,
    error: "",
    phase: "",
    logs: [],
  },
  busy: null,
  batch: null,
  logs: [],
  pendingConfirm: null,
  gallery: null,
};

const els = {
  main: $("#main"),
  searchInput: $("#searchInput"),
  searchClear: $("#searchClear"),
  searchHistory: $("#searchHistory"),
  backButton: $("#backButton"),
  refreshButton: $("#refreshButton"),
  logButton: $("#logButton"),
  shortcutsButton: $("#shortcutsButton"),
  installedCount: $("#installedCount"),
  updatesCount: $("#updatesCount"),
  favoritesCount: $("#favoritesCount"),
  statusDot: $("#statusDot"),
  statusText: $("#statusText"),
  discoverView: $("#discoverView"),
  searchView: $("#searchView"),
  categoriesView: $("#categoriesView"),
  categoryView: $("#categoryView"),
  favoritesView: $("#favoritesView"),
  installedView: $("#installedView"),
  detailView: $("#detailView"),
  settingsView: $("#settingsView"),
  activity: $("#activity"),
  activityText: $("#activityText"),
  activityLog: $("#activityLog"),
  toast: $("#toast"),
  toastText: $("#toastText"),
  setupModal: $("#setupModal"),
  setupTitle: $("#setupTitle"),
  setupSubtitle: $("#setupSubtitle"),
  setupBody: $("#setupBody"),
  setupClose: $("#setupClose"),
  shortcutsModal: $("#shortcutsModal"),
  cliModal: $("#cliModal"),
  cliSubtitle: $("#cliSubtitle"),
  cliBody: $("#cliBody"),
  cliCopyAll: $("#cliCopyAll"),
  logModal: $("#logModal"),
  logOutput: $("#logOutput"),
  logClear: $("#logClear"),
  logCount: $("#logCount"),
  confirmModal: $("#confirmModal"),
  confirmTitle: $("#confirmTitle"),
  confirmText: $("#confirmText"),
  confirmAccept: $("#confirmAccept"),
  lightbox: $("#lightbox"),
  lightboxImage: $("#lightboxImage"),
  lightboxCaption: $("#lightboxCaption"),
};

let searchTimer = null;
let installedSearchTimer = null;
let updateTimer = null;
let activityTimer = null;
let toastTimer = null;
let toastSeq = 0;
let openModalEl = null;

/* ── Yardımcılar ───────────────────────────────────── */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function attr(value) {
  return escapeHtml(value);
}

function errText(err) {
  const text = err && typeof err === "object" ? err.message || String(err) : String(err ?? "");
  return text.replace(/^error:\s*/i, "").trim() || "Beklenmeyen bir hata oluştu.";
}

function imageUrl(value) {
  const url = String(value || "").trim();
  if (/^https:\/\/dl\.flathub\.org\//.test(url)) return escapeHtml(url);
  if (url.startsWith("data:image/")) return escapeHtml(url);
  return "";
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const digits = size >= 100 || index === 0 ? 0 : 1;
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits }).format(size)} ${units[index]}`;
}

function formatCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "—";
  return new Intl.NumberFormat("tr-TR").format(number);
}

function formatDate(unixSeconds) {
  const value = Number(unixSeconds);
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Date(value * 1000).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatClock(value) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return "";
  return time.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function formatISODate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function starsHtml(rating, label = "") {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  const percent = Math.round((value / 5) * 1000) / 10;
  return `<span class="stars" aria-label="${attr(label || `${value.toFixed(1)} / 5 yıldız`)}"><span class="stars-track">★★★★★</span><span class="stars-fill" style="width:${percent}%">★★★★★</span></span>`;
}

function categoryName(slug) {
  return CATEGORY_MAP[slug]?.name || slug;
}

function normalizeCategory(value) {
  const raw = Array.isArray(value) ? value[0] : String(value || "").split(",")[0];
  const slug = String(raw || "").trim().toLowerCase();
  return CATEGORY_MAP[slug] ? slug : null;
}

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function setTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  try { localStorage.setItem("macro-theme", next); } catch { /* yoksay */ }
}

function sanitizeDescription(html) {
  const raw = String(html || "").trim();
  if (!raw) return "";
  if (!/<[a-z][\s\S]*>/i.test(raw)) {
    return raw
      .split(/\n{2,}/)
      .map(part => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  const doc = new DOMParser().parseFromString(`<div id="macro-prose">${raw}</div>`, "text/html");
  const root = doc.getElementById("macro-prose");
  if (!root) return "";
  const allowed = new Set(["P", "BR", "UL", "OL", "LI", "STRONG", "B", "EM", "I", "CODE", "PRE", "BLOCKQUOTE", "H3", "H4", "H5"]);
  const blocked = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "FORM", "INPUT", "BUTTON"]);

  const clean = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        continue;
      }
      const tag = child.tagName;
      if (blocked.has(tag)) {
        child.remove();
        continue;
      }
      clean(child);
      if (!allowed.has(tag)) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attribute of [...child.attributes]) {
        child.removeAttribute(attribute.name);
      }
    }
  };

  clean(root);
  return root.innerHTML;
}
/* ── Ortak görünüm parçaları ───────────────────────── */

function appIconHtml(app, extraClass = "") {
  const source = imageUrl(app?.icon);
  return `<span class="app-icon${extraClass ? ` ${extraClass}` : ""}"><img class="app-img${source ? "" : " is-fallback"}" src="${source || FALLBACK_ICON}" alt="" loading="lazy" decoding="async"${source ? "" : ' data-fallback="1"'} /></span>`;
}

function appTagsHtml(app, context = "") {
  const tags = [];
  if (app.updateAvailable) tags.push('<span class="tag tag-update">Güncelleme</span>');
  if (app.pinned) tags.push('<span class="tag">Sabitlenmiş</span>');
  if (context === "search" && app.installed) tags.push('<span class="tag">Yüklü</span>');
  return tags.join("");
}

function metaParts(app) {
  const parts = [providerManagerLabel(app)];
  if (app.developer) parts.push(app.developer);
  if (app.category) parts.push(categoryName(app.category));
  if (app.installed && app.version) parts.push(`v${app.version}`);
  if (app.channel) parts.push(`Snap ${app.channel}`);
  if (app.monthlyInstalls) parts.push(`${formatCount(app.monthlyInstalls)} aylık kurulum`);
  return parts;
}

function appMetaHtml(app) {
  const parts = metaParts(app);
  if (!parts.length) return "";
  return `<p class="app-meta">${parts.map(escapeHtml).join('<span class="dot">·</span>')}</p>`;
}
function providerMatches(app, selected) {
  return selected === "all" || appProvider(app) === selected;
}

const PROVIDER_SORT_ORDER = { flatpak: 0, snap: 1, brew: 2 };

function selectionKey(provider, id) {
  return `${provider}:${id}`;
}

function isSelected(app) {
  return state.selection.has(selectionKey(appProvider(app), app.id));
}

function selectedInstalledApps() {
  return state.installed.filter(isSelected);
}

function toggleSelection(app) {
  const key = selectionKey(appProvider(app), app.id);
  if (state.selection.has(key)) state.selection.delete(key);
  else state.selection.add(key);
}

function librarySearchMatches(app, needle) {
  if (!needle) return true;
  const haystack = `${app.name || ""} ${app.id || ""} ${app.developer || ""} ${app.summary || ""} ${providerName(appProvider(app))}`
    .toLocaleLowerCase("tr");
  return haystack.includes(needle);
}

function installedScopedApps() {
  const needle = state.installedQuery.trim().toLocaleLowerCase("tr");
  return state.installed.filter(app =>
    providerMatches(app, state.installedProvider)
    && (!state.updatesOnly || app.updateAvailable)
    && librarySearchMatches(app, needle),
  );
}

function sortInstalledApps(apps, sort) {
  const byName = (a, b) => String(a.name || a.id || "").localeCompare(String(b.name || b.id || ""), "tr", { sensitivity: "base" });
  const list = [...apps];
  if (sort === "updates") {
    list.sort((a, b) => Number(Boolean(b.updateAvailable)) - Number(Boolean(a.updateAvailable)) || byName(a, b));
  } else if (sort === "provider") {
    list.sort((a, b) => (PROVIDER_SORT_ORDER[appProvider(a)] ?? 9) - (PROVIDER_SORT_ORDER[appProvider(b)] ?? 9) || byName(a, b));
  } else {
    list.sort(byName);
  }
  return list;
}

function matchesApps(provider, id) {
  return app => sameApp(app, provider, id);
}


function favoriteButtonHtml(app, { large = false } = {}) {
  const active = isFavorite(app);
  const label = active ? "Favorilerden çıkar" : "Favorilere ekle";
  return `<button class="icon-btn fav-btn${active ? " is-favorite" : ""}${large ? " fav-btn-lg" : ""}" type="button" data-favorite data-id="${attr(app.id)}" data-provider="${attr(appProvider(app))}" aria-pressed="${active}" title="${attr(label)}" aria-label="${attr(`${app.name || app.id} · ${label}`)}">${active ? ICON.starFilled : ICON.star}</button>`;
}

function actionButtonsHtml(app, { large = false, hero = false, allowRemove = true } = {}) {
  const size = large ? "btn-lg" : "btn-sm";
  const primary = hero ? `btn btn-hero-primary ${size}` : `btn btn-primary ${size}`;
  const ghost = hero ? `btn btn-hero-ghost ${size}` : `btn btn-ghost ${size}`;
  const id = attr(app.id);
  const provider = appProvider(app);
  const locked = state.busy ? " disabled" : "";
  const actionAttrs = action => `data-action="${action}" data-id="${id}" data-provider="${attr(provider)}" aria-label="${attr(providerActionLabel(action, app))}"`;

  if (state.busy && sameApp(state.busy, provider, app.id)) {
    const label = ACTIONS[state.busy.action]?.busy || "İşleniyor…";
    return `<button class="${primary}" type="button" disabled aria-label="${attr(providerActionLabel(state.busy.action, app))}"><span class="spinner"></span>${label}</button>`;
  }

  if (!app.installed) {
    return `<button class="${primary}" type="button" ${actionAttrs("install")}${locked}>Kur</button>`;
  }

  const buttons = [];
  if (app.updateAvailable) {
    buttons.push(`<button class="${primary}" type="button" ${actionAttrs("update")}${locked}>Güncelle</button>`);
  }
  if (allowRemove) {
    buttons.push(`<button class="${ghost}" type="button" ${actionAttrs("remove")}${locked}>Kaldır</button>`);
  }
  return buttons.join("");
}

function appRowHtml(app, context = "search", { selectable = false, selected = false } = {}) {
  const summary = String(app.summary || "").trim();
  const selectAttrs = selectable
    ? ` data-select-row="${attr(app.id)}" data-select-provider="${attr(appProvider(app))}"`
    : "";
  const role = selectable ? "option" : "link";
  return `
    <article class="app-row${selectable ? " is-selectable" : ""}${selected ? " is-selected" : ""}" data-open-app="${attr(app.id)}" data-provider="${attr(appProvider(app))}"${selectAttrs} tabindex="0" role="${role}" aria-selected="${selected}" aria-label="${attr(app.name || app.id)} (${attr(providerLabel(app))}) ayrıntıları">
      ${selectable ? `<span class="select-check" aria-hidden="true">${selected ? "✓" : ""}</span>` : ""}
      ${appIconHtml(app)}
      <div class="app-body">
        <div class="app-line">
          <h3 class="app-name">${escapeHtml(app.name || app.id)}</h3>
          ${appTagsHtml(app, context)}
        </div>
        ${summary ? `<p class="app-summary">${escapeHtml(summary)}</p>` : ""}
        ${appMetaHtml(app)}
      </div>
      ${selectable ? "" : `<div class="app-actions">${favoriteButtonHtml(app)}${actionButtonsHtml(app)}</div>`}
    </article>`;
}

function appTileHtml(app) {
  const summary = String(app.summary || "").trim();
  const developer = app.developer || (app.category ? categoryName(app.category) : "");
  const stateTag = app.updateAvailable
    ? '<span class="tile-state is-update">Güncelleme</span>'
    : app.installed
      ? '<span class="tile-state">Yüklü</span>'
      : "";
  return `
    <article class="app-tile" data-open-app="${attr(app.id)}" data-provider="${attr(appProvider(app))}" tabindex="0" role="link" aria-label="${attr(app.name || app.id)} (${attr(providerLabel(app))}) ayrıntıları">
      <div class="tile-top">
        ${appIconHtml(app)}
        ${stateTag}
      </div>
      <h3>${escapeHtml(app.name || app.id)}</h3>
      ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
      <div class="tile-foot">
        <span>${escapeHtml(providerManagerLabel(app))}</span>
        ${developer ? '<span class="dot">·</span><span>' + escapeHtml(developer) + "</span>" : ""}
        ${app.monthlyInstalls ? '<span class="dot">·</span><span>' + escapeHtml(`${formatCount(app.monthlyInstalls)} kurulum`) + "</span>" : ""}
      </div>
    </article>`;
}

function pickCardHtml(app) {
  const hero = imageUrl(app.heroImage);
  const detail = [providerManagerLabel(app), app.developer || (app.category ? categoryName(app.category) : "")]
    .filter(Boolean)
    .join(" · ");
  return `
    <article class="pick-card" data-open-app="${attr(app.id)}" data-provider="${attr(appProvider(app))}" tabindex="0" role="link" aria-label="${attr(app.name || app.id)} (${attr(providerLabel(app))}) ayrıntıları">
      <div class="pick-media${hero ? "" : " is-placeholder"}">
        ${hero ? `<img src="${hero}" alt="" loading="lazy" decoding="async" />` : ""}
      </div>
      <div class="pick-body">
        ${appIconHtml(app)}
        <div class="pick-text">
          <h3>${escapeHtml(app.name || app.id)}</h3>
          <p>${escapeHtml(detail)}</p>
        </div>
      </div>
    </article>`;
}

function stateHtml({ title, text = "", retry = "", icon = ICON.search, action = "" }) {
  return `
    <div class="state">
      <span class="state-icon" aria-hidden="true">${icon}</span>
      <h3>${escapeHtml(title)}</h3>
      ${text ? `<p>${escapeHtml(text)}</p>` : ""}
      ${retry ? `<button class="btn btn-ghost" type="button" data-retry="${attr(retry)}">Yeniden dene</button>` : ""}
      ${action}
    </div>`;
}

function skeletonRows(count = 4) {
  return `<div class="app-list" aria-hidden="true">${Array.from({ length: count }, () => `
    <div class="sk-row">
      <span class="sk sk-icon"></span>
      <span class="sk-lines">
        <span class="sk sk-line w-30"></span>
        <span class="sk sk-line w-75"></span>
        <span class="sk sk-line w-50"></span>
      </span>
    </div>`).join("")}</div>`;
}

function skeletonTiles(count = 8) {
  return `<div class="tile-grid" aria-hidden="true">${Array.from({ length: count }, () =>
    '<div class="sk sk-pick" style="height:142px"></div>').join("")}</div>`;
}

function skeletonDiscover() {
  return `
    <header class="view-head">
      <div class="view-title">
        <p class="eyebrow">Flathub</p>
        <h1>Keşfet</h1>
        <p class="view-sub">Öne çıkan uygulamalar yükleniyor…</p>
      </div>
    </header>
    <div class="sk sk-hero"></div>
    <div class="section-head"><h2>Haftanın seçkisi</h2></div>
    <div class="sk-picks">${Array.from({ length: 5 }, () => '<div class="sk sk-pick"></div>').join("")}</div>
    <div class="section-head"><h2>Popüler uygulamalar</h2></div>
    ${skeletonTiles(8)}`;
}

function skeletonDetail() {
  return `
    <div class="detail-top"><span class="sk sk-line w-30" style="width:100px"></span></div>
    <div class="sk sk-hero" style="height:168px"></div>
    <div class="detail-grid">
      <div>
        <div class="section-head"><h2>Ekran görüntüleri</h2></div>
        <div class="shots"><div class="sk sk-pick" style="height:180px"></div><div class="sk sk-pick" style="height:180px"></div></div>
        <div class="section-head"><h2>Açıklama</h2></div>
        ${skeletonRows(3)}
      </div>
      <aside><div class="sk sk-hero" style="height:220px"></div></aside>
    </div>`;
}

function setupIsReady(status = state.setup.status) {
  if (status) return Boolean(status.ready);
  return Boolean(state.storeInfo?.flatpakAvailable && state.storeInfo?.userFlathubAvailable);
}

function syncStoreInfoFromSetup(status) {
  if (!status) return;
  state.storeInfo = {
    ...(state.storeInfo || {}),
    flatpakAvailable: Boolean(status.flatpakAvailable),
    flatpakVersion: status.flatpakVersion || null,
    flathubAvailable: Boolean(status.flathubAvailable),
    userFlathubAvailable: Boolean(status.userFlathubAvailable),
  };
  renderChrome();
}

function storeNoticeHtml() {
  const setup = state.setup.status;
  if (!state.storeInfo && !setup) return "";

  const flatpakAvailable = setup ? Boolean(setup.flatpakAvailable) : Boolean(state.storeInfo?.flatpakAvailable);
  const userFlathub = setup ? Boolean(setup.userFlathubAvailable) : Boolean(state.storeInfo?.userFlathubAvailable);
  if (flatpakAvailable && userFlathub) return "";

  const message = flatpakAvailable
    ? "<strong>Flathub kullanıcı deposu eksik.</strong> Flathub kataloğundaki Flatpak uygulamaları için bu depoyu ekleyin."
    : "<strong>Flatpak bulunamadı.</strong> Flathub kataloğundaki Flatpak uygulamalarını kurmak için Flatpak gerekir.";
  const label = flatpakAvailable ? "Depoyu ekle" : "Flatpak kur";

  return `
    <div class="notice">
      ${ICON.warning}
      <span>${message}</span>
      <button class="btn btn-ghost btn-sm notice-action" type="button" data-open-setup>${label}</button>
    </div>`;
}

/* ── İlk kurulum sihirbazı ─────────────────────────── */

function setupFactHtml(ok, label, value) {
  return `
    <div class="setup-fact ${ok ? "is-ok" : "is-missing"}">
      <span class="setup-fact-icon" aria-hidden="true">${ok ? ICON.check : ICON.warning}</span>
      <span class="setup-fact-text">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </span>
    </div>`;
}
function managerStatusRowHtml(label, available) {
  const known = typeof available === "boolean";
  const status = known ? (available ? "is-ok" : "is-error") : "is-pending";
  const text = known ? (available ? "Algılandı" : "Algılanmadı") : "Durum bilinmiyor";
  return `
    <div class="system-row">
      <span class="status-dot ${status}" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
      <strong>${text}</strong>
    </div>`;
}

function setupFactsHtml(status) {
  if (!status) return "";
  const flatpakValue = status.flatpakAvailable
    ? (status.flatpakVersion || "Kurulu")
    : "Kurulu değil";
  const flathubValue = status.userFlathubAvailable
    ? "Kullanıcı deposu hazır"
    : status.flathubAvailable
      ? "Sistem deposu var · kullanıcı deposu eksik"
      : "Eklenmeli";
  const meta = [
    status.distroName || "Linux",
    status.packageManagerLabel || status.packageManager || "Paket yöneticisi algılanamadı",
  ].filter(Boolean).map(escapeHtml).join('<span class="dot">·</span>');

  return `
    <div class="setup-facts">
      ${setupFactHtml(Boolean(status.flatpakAvailable), "Flatpak", flatpakValue)}
      ${setupFactHtml(Boolean(status.userFlathubAvailable), "Flathub", flathubValue)}
    </div>
    <p class="setup-distro">${meta}</p>`;
}

function setupCommandHtml(label, command) {
  if (!command) return "";
  return `
    <div class="setup-command">
      <div class="setup-command-head">
        <span>${escapeHtml(label)}</span>
        <button class="btn btn-ghost btn-sm" type="button" data-copy-command="${attr(command)}">Kopyala</button>
      </div>
      <code>${escapeHtml(command)}</code>
    </div>`;
}

function setupManualHtml(status, open = false) {
  if (!status) return "";
  const rows = [];
  if (status.manualCommand) {
    rows.push(setupCommandHtml("Flatpak paketini kur", status.manualCommand));
  }
  if (!status.flatpakAvailable) {
    rows.push(setupCommandHtml("Flatpak kurulduktan sonra Flathub’ı ekle", status.flathubCommand));
  } else if (!status.userFlathubAvailable && status.flathubCommand) {
    rows.push(setupCommandHtml("Flathub kullanıcı deposunu ekle", status.flathubCommand));
  }
  if (!rows.length) return "";

  return `
    <details class="setup-manual"${open ? " open" : ""}>
      <summary>Komutları elle çalıştır</summary>
      <div class="setup-command-list">${rows.join("")}</div>
      <p class="setup-note">Komutları bir terminalde çalıştırın. Paket kurulumu için yönetici yetkisi gerekir.</p>
    </details>`;
}

function setupLogEntryHtml(entry) {
  const kind = ["cmd", "stderr", "error", "info", "stdout"].includes(entry.kind) ? entry.kind : "stdout";
  return `
    <div class="log-line log-${kind}">
      <span class="log-time">${escapeHtml(entry.time)}</span>
      <span class="log-text">${escapeHtml(entry.line)}</span>
    </div>`;
}

function setupLogsHtml({ always = false } = {}) {
  const logs = state.setup.logs;
  if (!always && !logs.length) return "";
  return `
    <div class="setup-log-wrap">
      <div class="setup-log-head">
        <span>Kurulum günlüğü</span>
        <span data-setup-log-count>${logs.length} satır</span>
      </div>
      <div id="setupLog" class="setup-log log-output" role="log">${logs.length
        ? logs.map(setupLogEntryHtml).join("")
        : '<div class="log-empty">Kurulum çıktısı bekleniyor…</div>'}</div>
    </div>`;
}

function setupActionsHtml(actions) {
  return `<div class="setup-actions">${actions.join("")}</div>`;
}

function renderSetup() {
  const status = state.setup.status;
  const setup = state.setup;
  const loading = setup.loading && !status;
  let title = "Flatpak denetleniyor";
  let subtitle = "Flatpak ve Flathub durumu kontrol ediliyor.";

  if (setup.running) {
    title = status?.flatpakAvailable ? "Flathub hazırlanıyor" : "Flatpak kuruluyor";
    subtitle = "Kurulum tamamlanana kadar bu pencereyi kapatmayın.";
  } else if (setup.error) {
    title = "Kurulum tamamlanamadı";
    subtitle = "Hatayı inceleyip yeniden deneyebilirsiniz.";
  } else if (status?.rebootRequired) {
    title = "Yeniden başlatma gerekiyor";
    subtitle = "Flatpak katmanı yeniden başlatmadan etkinleşmez.";
  } else if (status?.ready) {
    title = "Her şey hazır";
    subtitle = "Flatpak ve Flathub kullanıma hazır.";
  } else if (status?.flatpakAvailable) {
    title = "Flathub deposu eksik";
    subtitle = "Kullanıcı kapsamına Flathub deposunu ekleyin.";
  } else if (status) {
    title = "Flatpak kurulumu";
    subtitle = "Mağaza için gerekli Flatpak bileşeni hazırlanacak.";
  } else if (loading) {
    title = "Sistem denetleniyor";
    subtitle = "Flatpak ve Flathub durumu kontrol ediliyor.";
  }

  els.setupTitle.textContent = title;
  els.setupSubtitle.textContent = subtitle;
  els.setupClose.hidden = setup.running;

  let body = "";

  if (setup.running) {
    body = `
      <div class="setup-message is-busy">
        <span class="spinner" aria-hidden="true"></span>
        <div>
          <h3>${escapeHtml(setup.phase || "Kurulum sürüyor…")}</h3>
          <p>Yönetici parolası istenirse polkit penceresindeki isteği onaylayın.</p>
        </div>
      </div>
      ${setupFactsHtml(status)}
      ${setupLogsHtml({ always: true })}
      <p class="setup-note">Bu işlem sırasında Macro Store’u kapatmayın.</p>`;
  } else if (loading) {
    body = `
      <div class="setup-loading">
        <span class="spinner" aria-hidden="true"></span>
        <div>
          <h3>Flatpak ve Flathub denetleniyor</h3>
          <p>Sistem bilgileri ve paket yöneticisi algılanıyor…</p>
        </div>
      </div>`;
  } else if (!status) {
    body = `
      <div class="setup-message is-error">
        ${ICON.warning}
        <div>
          <h3>Durum alınamadı</h3>
          <p>${escapeHtml(setup.error || "Sistem bilgileri okunamadı. Yeniden deneyin.")}</p>
        </div>
      </div>
      ${setupActionsHtml([
        '<button class="btn btn-primary" type="button" data-setup-refresh>Yeniden dene</button>',
        '<button class="btn btn-ghost" type="button" data-setup-close>Kapat</button>',
      ])}`;
  } else if (setup.error) {
    body = `
      <div class="setup-message is-error">
        ${ICON.warning}
        <div>
          <h3>Kurulum tamamlanamadı</h3>
          <p>${escapeHtml(setup.error)}</p>
        </div>
      </div>
      ${setupFactsHtml(status)}
      ${setupActionsHtml([
        status.installSupported
          ? '<button class="btn btn-primary" type="button" data-setup-install>Yeniden dene</button>'
          : "",
        '<button class="btn btn-ghost" type="button" data-setup-refresh>Durumu yenile</button>',
        '<button class="btn btn-ghost" type="button" data-setup-close>Kapat</button>',
      ].filter(Boolean))}
      ${setupManualHtml(status, !status.installSupported)}
      ${setupLogsHtml()}`;
  } else if (status.rebootRequired) {
    body = `
      <div class="setup-message is-warning">
        ${ICON.warning}
        <div>
          <h3>Flatpak kuruldu, yeniden başlatma gerekiyor</h3>
          <p>rpm-ostree değişmez sistemlerde yeni katman ancak yeniden başlatmadan sonra kullanılabilir. Bilgisayarı yeniden başlatıp “Yeniden başlattım, denetle” düğmesine basın.</p>
        </div>
      </div>
      ${setupFactsHtml(status)}
      ${setupCommandHtml("Yeniden başlatma", "systemctl reboot")}
      ${setupActionsHtml([
        '<button class="btn btn-primary" type="button" data-setup-refresh>Yeniden başlattım, denetle</button>',
        '<button class="btn btn-ghost" type="button" data-setup-close>Daha sonra</button>',
      ])}
      ${setupLogsHtml()}`;
  } else if (status.ready) {
    body = `
      <div class="setup-message is-success">
        ${ICON.check}
        <div>
          <h3>Macro Store kullanıma hazır</h3>
          <p>Flatpak ${escapeHtml(status.flatpakVersion || "")} ve Flathub kullanıcı deposu hazır. Keşfet’ten uygulama kurabilirsiniz.</p>
        </div>
      </div>
      ${setupFactsHtml(status)}
      ${setupActionsHtml([
        '<button class="btn btn-primary" type="button" data-setup-finish>Mağazayı aç</button>',
        '<button class="btn btn-ghost" type="button" data-setup-close>Kapat</button>',
      ])}
      ${setupLogsHtml()}`;
  } else if (!status.flatpakAvailable) {
    const supported = Boolean(status.installSupported);
    body = `
      <div class="setup-message is-warning">
        ${ICON.warning}
        <div>
          <h3>Flatpak kurulu değil</h3>
          <p>${supported
            ? "Macro Store, Flatpak uygulamalarını kullanıcı kapsamıyla kurar. Dağıtımınıza uygun paket yöneticisiyle Flatpak’ı kurup Flathub deposunu hazırlayabiliriz."
            : "Macro Store, Flatpak uygulamalarını kullanıcı kapsamıyla kurar. Bu dağıtımda otomatik kurulum desteklenmiyor; aşağıdaki komutları terminalde çalıştırabilirsiniz."}</p>
        </div>
      </div>
      ${setupFactsHtml(status)}
      ${supported
        ? `<p class="setup-note">${status.immutable
            ? "Değişmez sistem algılandı. Kurulum rpm-ostree ile yapılır ve yeniden başlatma gerekebilir."
            : "Kurulum sırasında polkit ile yönetici parolanız istenebilir."}</p>`
        : ""}
      ${setupActionsHtml([
        supported
          ? '<button class="btn btn-primary" type="button" data-setup-install>Flatpak’ı kur ve hazırla</button>'
          : "",
        '<button class="btn btn-ghost" type="button" data-setup-refresh>Durumu yenile</button>',
        '<button class="btn btn-ghost" type="button" data-setup-close>Daha sonra</button>',
      ].filter(Boolean))}
      ${!supported && !status.manualCommand
        ? '<p class="setup-note">Dağıtımınızın Flatpak kurulum yönergeleri için <strong>flatpak.org/setup</strong> adresini ziyaret edin.</p>'
        : ""}
      ${setupManualHtml(status, !supported)}
      ${setupLogsHtml()}`;
  } else {
    body = `
      <div class="setup-message is-warning">
        ${ICON.warning}
        <div>
          <h3>Flathub kullanıcı deposu eklenmeli</h3>
          <p>Flatpak kurulu ancak kullanıcı kapsamında Flathub deposu tanımlı değil. Tek tıkla ekleyebilirsiniz.</p>
        </div>
      </div>
      ${setupFactsHtml(status)}
      ${setupActionsHtml([
        '<button class="btn btn-primary" type="button" data-setup-install>Flathub’ı ekle</button>',
        '<button class="btn btn-ghost" type="button" data-setup-refresh>Durumu yenile</button>',
        '<button class="btn btn-ghost" type="button" data-setup-close>Daha sonra</button>',
      ])}
      ${setupManualHtml(status)}
      ${setupLogsHtml()}`;
  }

  els.setupBody.innerHTML = body;

  if (setup.running || setup.logs.length) {
    requestAnimationFrame(() => {
      const output = $("#setupLog");
      if (output) output.scrollTop = output.scrollHeight;
    });
  }
}

function openSetupModal({ refresh = true } = {}) {
  renderSetup();
  openModal(els.setupModal);
  if (refresh && !state.setup.running) refreshSetupStatus();
}

function closeSetupModal() {
  if (state.setup.running) return;
  localStorage.setItem(SETUP_SEEN_KEY, "1");
  closeModal(els.setupModal);
}

function finishSetup() {
  localStorage.setItem(SETUP_SEEN_KEY, "1");
  closeModal(els.setupModal);
  if (state.route.name !== "discover") {
    navigate({ name: "discover" }, { root: true });
  }
  loadDiscover();
}

async function refreshStoreAfterSetup() {
  state.remotesLoaded = false;
  state.installedLoaded = false;
  await loadStoreInfo();
  loadInstalled(true, true);
  loadRemotes(true);
  if (state.route.name === "discover") loadDiscover(true);
  if (state.route.name === "installed") loadInstalled(true);
}

async function refreshSetupStatus() {
  if (state.setup.running) return state.setup.status;
  state.setup.loading = true;
  state.setup.error = "";
  renderSetup();

  try {
    const status = await invoke("get_setup_status");
    state.setup.status = status;
    state.setup.error = "";
    syncStoreInfoFromSetup(status);
  } catch (err) {
    state.setup.error = errText(err);
  } finally {
    state.setup.loading = false;
    renderSetup();
    if (state.route.name === "discover") renderDiscover();
    else if (state.route.name === "installed") renderInstalled();
    else if (state.route.name === "settings") renderSettings();
  }

  return state.setup.status;
}

async function maybeOpenSetup() {
  const status = await refreshSetupStatus();
  const seen = localStorage.getItem(SETUP_SEEN_KEY) === "1";
  if (!status || !status.ready || !seen) {
    localStorage.setItem(SETUP_SEEN_KEY, "1");
    openSetupModal({ refresh: false });
  }
}

function appendSetupLog(payload) {
  const line = String(payload?.line ?? "").trimEnd();
  if (!line) return;

  const entry = {
    line,
    kind: String(payload?.kind || "stdout"),
    time: new Date().toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
  };

  state.setup.logs.push(entry);
  if (state.setup.logs.length > 500) {
    state.setup.logs.splice(0, state.setup.logs.length - 500);
  }

  const output = $("#setupLog");
  if (!output) return;
  const empty = output.querySelector(".log-empty");
  if (empty) empty.remove();
  output.appendChild(logLineNode(entry));
  output.scrollTop = output.scrollHeight;
  const count = document.querySelector("[data-setup-log-count]");
  if (count) count.textContent = `${state.setup.logs.length} satır`;
}

async function copyCommand(value) {
  const text = String(value || "");
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast("Komut kopyalandı.", "success");
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    try {
      document.execCommand("copy");
      toast("Komut kopyalandı.", "success");
    } catch {
      toast("Komut kopyalanamadı.", "error");
    } finally {
      field.remove();
    }
  }
}

async function runSetupInstall() {
  if (state.setup.running) return;
  state.setup.running = true;
  state.setup.error = "";
  state.setup.logs = [];
  state.setup.phase = state.setup.status?.flatpakAvailable
    ? "Flathub deposu ekleniyor…"
    : "Flatpak kuruluyor…";
  renderSetup();

  let status = null;
  try {
    status = await invoke("install_flatpak");
    state.setup.status = status;
    syncStoreInfoFromSetup(status);

    if (status.ready) {
      state.setup.phase = "Sistem hazır";
      localStorage.setItem(SETUP_SEEN_KEY, "1");
      toast("Flatpak ve Flathub hazır.", "success");
    } else if (status.rebootRequired) {
      state.setup.phase = "Yeniden başlatma gerekiyor";
    } else {
      state.setup.error = "Kurulum tamamlandı ancak Flatpak ve Flathub hazır görünmüyor. Durumu yenileyip yeniden deneyin.";
    }
  } catch (err) {
    state.setup.error = errText(err);
    toast(state.setup.error, "error");
  }

  state.setup.running = false;
  renderSetup();

  if (status?.ready) {
    await refreshStoreAfterSetup();
  }
}

/* ── Gezinme ve veri yükleme ───────────────────────── */

function updateStatus() {
  if (!state.storeInfo) {
    els.statusDot.className = "status-dot is-pending";
    els.statusText.textContent = "Flatpak denetleniyor…";
    return;
  }
  if (!state.storeInfo.flatpakAvailable) {
    els.statusDot.className = "status-dot is-error";
    els.statusText.textContent = "Flatpak bulunamadı";
    return;
  }
  const hasFlathub = state.storeInfo.flathubAvailable || state.storeInfo.userFlathubAvailable;
  const version = state.storeInfo.flatpakVersion ? `Flatpak ${state.storeInfo.flatpakVersion}` : "Flatpak";
  els.statusDot.className = `status-dot ${hasFlathub ? "is-ok" : "is-error"}`;
  els.statusText.textContent = hasFlathub ? `Flathub · ${version}` : `Depo yok · ${version}`;
}

function updateInstalledCount() {
  const count = state.installed.length;
  const updates = state.installed.filter(app => app.updateAvailable).length;
  els.installedCount.hidden = !state.installedLoaded || count === 0 || updates > 0;
  els.installedCount.textContent = String(count);
  els.updatesCount.hidden = !state.installedLoaded || updates === 0;
  els.updatesCount.textContent = String(updates);
  els.updatesCount.title = `${updates} güncelleme bekliyor`;
  syncTrayBadge(updates);
}

function syncTrayBadge(updates) {
  invoke("set_tray_updates", { count: updates }).catch(() => {
    /* Tepsi simgesi yoksa güncelleme sayacı yalnızca arayüzde kalır. */
  });
}

function updateFavoritesCount() {
  const count = state.favorites.length;
  els.favoritesCount.hidden = count === 0;
  els.favoritesCount.textContent = String(count);
}

function updatePageTitle() {
  const route = state.route;
  if (route.name === "detail" && state.detail?.app?.name) {
    document.title = `${state.detail.app.name} (${providerName(appProvider(state.detail.app))}) — Macro Store`;
  } else if (route.name === "category" && CATEGORY_MAP[route.slug]) {
    document.title = `${CATEGORY_MAP[route.slug].name} — Macro Store`;
  } else if (route.name === "search" && state.query) {
    document.title = state.query.length >= 2 ? `“${state.query}” — Macro Store` : "Arama — Macro Store";
  } else if (route.name === "favorites") {
    document.title = "Favoriler — Macro Store";
  } else {
    document.title = "Macro Store — Linux Uygulama Mağazası";
  }
}

function renderChrome() {
  $$(".nav-item").forEach(button => {
    button.classList.toggle("is-active", button.dataset.nav === state.activeNav);
  });
  updateInstalledCount();
  updateFavoritesCount();
  updateStatus();
  els.searchClear.hidden = !els.searchInput.value;
  els.backButton.hidden = !(state.stack.length > 1 && ["detail", "category"].includes(state.route.name));
  updatePageTitle();
}

function navForRoute(route) {
  switch (route.name) {
    case "discover":
    case "search":
      return "discover";
    case "categories":
    case "category":
      return "categories";
    case "favorites":
      return "favorites";
    case "installed":
      return "installed";
    case "settings":
      return "settings";
    default:
      return state.activeNav;
  }
}

function openDeepLink(target) {
  if (!target || typeof target !== "object") return;
  if (target.kind === "app" && typeof target.id === "string" && target.id) {
    const provider = target.provider || "flatpak";
    els.main.scrollTop = 0;
    navigate({ name: "detail", id: target.id, provider }, { root: true });
    loadDetail(target.id, provider);
    return;
  }
  if (target.kind === "search" && typeof target.query === "string") {
    const query = target.query.trim();
    if (!query) return;
    els.searchInput.value = query;
    navigate({ name: "search", query }, { root: true });
    runSearch(query);
  }
}

function navigate(route, { root = false, replace = false } = {}) {
  const previous = state.route;
  const same = route.name === previous.name
    && (route.slug || "") === (previous.slug || "")
    && (route.id || "") === (previous.id || "")
    && (route.name !== "detail" || appProvider(route) === appProvider(previous));

  if (root) {
    state.stack = [route];
  } else if (replace) {
    if (state.stack.length) state.stack[state.stack.length - 1] = route;
    else state.stack = [route];
  } else if (!same) {
    state.stack.push(route);
  }

  state.route = route;
  state.activeNav = navForRoute(route);
  els.main.scrollTop = 0;
  renderRoute();
}

function goBack() {
  if (state.stack.length <= 1) {
    navigate({ name: "discover" }, { root: true });
    return;
  }
  state.stack.pop();
  const route = state.stack[state.stack.length - 1];
  state.route = route;
  state.activeNav = navForRoute(route);
  els.main.scrollTop = 0;
  renderRoute();
}

function renderIf(routeName, renderer) {
  if (state.route.name === routeName) renderer();
}

async function loadStoreInfo() {
  try {
    state.storeInfo = await invoke("get_store_info");
  } catch {
    state.storeInfo = null;
  }
  renderChrome();
}

async function loadDiscover(force = false) {
  if (!force && (state.discover || state.discoverLoading)) return;
  const seq = ++state.discoverSeq;
  state.discoverLoading = true;
  state.discoverError = "";
  renderIf("discover", renderDiscover);

  try {
    const data = await invoke("get_discover", { date: todayISO() });
    if (seq !== state.discoverSeq) return;
    state.discover = data || null;
    if (!data) throw new Error("Keşfet verisi alınamadı.");
  } catch (err) {
    if (seq !== state.discoverSeq) return;
    state.discoverError = errText(err);
  } finally {
    if (seq === state.discoverSeq) {
      state.discoverLoading = false;
      renderIf("discover", renderDiscover);
    }
  }
}

async function loadInstalled(force = false, silent = false) {
  if (!force && (state.installedLoaded || state.installedLoading)) {
    updateInstalledCount();
    return;
  }
  if (state.installedLoading) return;

  const seq = ++state.installedSeq;
  state.installedLoading = true;
  if (!silent) state.installedError = "";
  renderIf("installed", renderInstalled);

  try {
    const response = await invoke("list_installed_apps");
    if (seq !== state.installedSeq) return;
    state.installed = Array.isArray(response?.apps)
      ? [...response.apps].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "tr", { sensitivity: "base" }))
      : [];
    state.installedProviderErrors = Array.isArray(response?.providerErrors)
      ? response.providerErrors
      : [];
    state.installedFromCache = Boolean(response?.fromCache);
    state.installedVisibleCount = INSTALLED_PAGE_SIZE;
    state.installedLoaded = true;
    state.installedError = "";
    state.lastRefreshed = Date.now();
    try {
      localStorage.setItem(LAST_REFRESH_KEY, String(state.lastRefreshed));
    } catch {
      /* Depolama kapalıysa saat yalnızca oturum boyunca tutulur. */
    }
    const available = new Set(state.installed.map(app => selectionKey(appProvider(app), app.id)));
    for (const key of state.selection) {
      if (!available.has(key)) state.selection.delete(key);
    }
    if (!state.installedProviderErrors.length) syncStoredFromInstalled();
    invoke("library_usage")
      .then(usage => {
        state.libraryUsage = usage;
        if (state.route.name === "installed") renderInstalled();
      })
      .catch(() => {
        state.libraryUsage = null;
      });
  } catch (err) {
    if (seq !== state.installedSeq) return;
    if (!silent) state.installedError = errText(err);
  } finally {
    if (seq === state.installedSeq) {
      state.installedLoading = false;
      updateInstalledCount();
      renderIf("installed", renderInstalled);
    }
  }
}

function startUpdateWatch() {
  if (updateTimer) return;
  updateTimer = setInterval(() => {
    if (document.hidden) return;
    checkForUpdates();
  }, UPDATE_WATCH_INTERVAL);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkForUpdates();
  });
}

async function checkForUpdates() {
  if (state.installedLoading || state.batch || state.busy) return;
  const before = state.installed.filter(app => app.updateAvailable).length;
  await loadInstalled(true, true);
  const after = state.installed.filter(app => app.updateAvailable).length;
  if (after > before) toast(`${after - before} yeni güncelleme hazır.`, "info");
}

function cancelPendingSearch() {
  clearTimeout(searchTimer);
  searchTimer = null;
}

function resetSearch({ goDiscover = false, focus = false } = {}) {
  cancelPendingSearch();
  state.searchSeq += 1;
  state.query = "";
  state.searchResults = [];
  state.searching = false;
  state.searchError = "";
  state.searchProviderErrors = [];
  els.searchInput.value = "";
  hideSearchHistory();
  if (goDiscover && state.route.name === "search") {
    navigate({ name: "discover" }, { root: true });
  } else {
    renderChrome();
  }
  if (focus) {
    els.searchInput.focus();
    renderSearchHistory();
  }
}

function loadSearchHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]");
    if (!Array.isArray(raw)) return;
    state.searchHistory = raw
      .filter(item => typeof item === "string" && item.trim())
      .slice(0, SEARCH_HISTORY_LIMIT);
  } catch {
    state.searchHistory = [];
  }
}

function loadLastRefresh() {
  try {
    const value = Number(localStorage.getItem(LAST_REFRESH_KEY));
    if (Number.isFinite(value) && value > 0) state.lastRefreshed = value;
  } catch {
    state.lastRefreshed = null;
  }
}

function loadLibraryPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(LIBRARY_PREFS_KEY) || "{}");
    if (!raw || typeof raw !== "object") return;
    if (PROVIDER_FILTERS.some(option => option.value === raw.provider)) {
      state.installedProvider = raw.provider;
    }
    if (INSTALLED_SORTS.some(option => option.value === raw.sort)) {
      state.installedSort = raw.sort;
    }
  } catch {
    /* Tercihler okunamazsa varsayılanlar kullanılır. */
  }
}

function saveLibraryPrefs() {
  try {
    localStorage.setItem(LIBRARY_PREFS_KEY, JSON.stringify({
      provider: state.installedProvider,
      sort: state.installedSort,
    }));
  } catch {
    /* Depolama kapalıysa tercih yalnızca oturum boyunca tutulur. */
  }
}

function loadActivityHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "[]");
    if (!Array.isArray(raw)) return;
    state.activityHistory = raw
      .filter(item => item && typeof item.name === "string" && Number.isFinite(item.time))
      .slice(0, ACTIVITY_LIMIT);
  } catch {
    state.activityHistory = [];
  }
}

function saveActivityHistory() {
  try {
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(state.activityHistory));
  } catch {
    /* Depolama kapalıysa geçmiş yalnızca oturum boyunca tutulur. */
  }
}

function recordActivity({ action, app = null, name = "", ok = true, message = "" }) {
  if (!ACTION_LABELS[action] && !name) return;
  const entry = {
    action: ACTION_LABELS[action] ? action : "batch",
    label: ACTION_LABELS[action] || "Toplu işlem",
    name: name || app?.name || app?.id || "",
    id: app?.id || "",
    provider: app ? appProvider(app) : "",
    ok: Boolean(ok),
    message: String(message || "").slice(0, 180),
    time: Date.now(),
  };
  state.activityHistory = [entry, ...state.activityHistory].slice(0, ACTIVITY_LIMIT);
  saveActivityHistory();
  if (state.route.name === "settings") renderSettings();
}

function activityTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return formatClock(value);
  return formatDate(Math.floor(value / 1000));
}

function saveSearchHistory(list) {
  state.searchHistory = list.slice(0, SEARCH_HISTORY_LIMIT);
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(state.searchHistory));
  } catch {
    /* Depolama kapalıysa geçmiş yalnızca oturum boyunca tutulur. */
  }
  renderSearchHistory();
}

function rememberSearch(rawQuery) {
  const query = String(rawQuery || "").trim();
  if (query.length < 2) return;
  const normalized = query.toLocaleLowerCase("tr");
  const next = [query, ...state.searchHistory.filter(item => item.toLocaleLowerCase("tr") !== normalized)];
  saveSearchHistory(next);
}

function renderSearchHistory() {
  const input = els.searchInput;
  const shouldShow = document.activeElement === input
    && !input.value.trim()
    && state.searchHistory.length > 0;
  if (!shouldShow) {
    hideSearchHistory();
    return;
  }
  els.searchHistory.innerHTML = `
    <p class="search-history-label">Son aramalar</p>
    ${state.searchHistory.map(item => `
      <button type="button" role="option" data-history-query="${attr(item)}">
        ${ICON.search}<span>${escapeHtml(item)}</span>
      </button>`).join("")}`;
  els.searchHistory.hidden = false;
}

function hideSearchHistory() {
  els.searchHistory.hidden = true;
}

async function runSearch(rawQuery, { remember = false } = {}) {
  const query = String(rawQuery ?? "").trim();
  cancelPendingSearch();
  const seq = ++state.searchSeq;

  if (!query) {
    resetSearch({ goDiscover: state.route.name === "search" });
    return;
  }

  if (query.length < 2) {
    state.query = query;
    state.searchResults = [];
    state.searchProviderErrors = [];
    state.searching = false;
    state.searchError = "Arama için en az 2 karakter yazın.";
    els.searchInput.value = query;
    if (state.route.name !== "search") navigate({ name: "search" });
    else renderSearch();
    return;
  }

  state.query = query;
  state.searchResults = [];
  state.searching = true;
  state.searchError = "";
  state.searchProviderErrors = [];
  els.searchInput.value = query;
  if (remember) rememberSearch(query);

  if (state.route.name !== "search") navigate({ name: "search" });
  else renderSearch();

  try {
    const response = await invoke("search_apps", { query });
    if (seq !== state.searchSeq) return;
    state.searchResults = Array.isArray(response?.apps) ? response.apps : [];
    state.searchProviderErrors = Array.isArray(response?.providerErrors)
      ? response.providerErrors
      : [];
  } catch (err) {
    if (seq !== state.searchSeq) return;
    state.searchError = errText(err);
  } finally {
    if (seq === state.searchSeq) {
      state.searching = false;
      renderIf("search", renderSearch);
    }
  }
}

async function loadCategory(slug, page = 1, reset = false) {
  if (!CATEGORY_MAP[slug]) return;
  const seq = ++state.categorySeq;
  const sameCategory = state.category?.slug === slug;

  if (reset || !sameCategory || page === 1) {
    state.category = {
      slug,
      page,
      total: 0,
      totalPages: 1,
      apps: [],
      loading: true,
      error: "",
    };
  } else {
    state.category.loading = true;
    state.category.error = "";
  }
  renderIf("category", renderCategory);

  try {
    const data = await invoke("get_category", { slug, page });
    if (seq !== state.categorySeq) return;
    const previousApps = page > 1 && sameCategory ? state.category.apps : [];
    const seen = new Set(previousApps.map(app => JSON.stringify([appProvider(app), app.id])));
    const merged = [...previousApps];
    for (const app of data?.apps || []) {
      const key = JSON.stringify([appProvider(app), app.id]);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(app);
      }
    }
    state.category = {
      slug,
      page: Number(data?.page) || page,
      total: Number(data?.total) || merged.length,
      totalPages: Number(data?.totalPages) || 1,
      apps: merged,
      loading: false,
      error: "",
    };
  } catch (err) {
    if (seq !== state.categorySeq) return;
    if (state.category) {
      state.category.loading = false;
      state.category.error = errText(err);
    }
  } finally {
    if (seq === state.categorySeq) renderIf("category", renderCategory);
  }
}

async function loadDetail(id, provider = "flatpak", force = false) {
  if (!force && sameApp(state.detail?.app, provider, id)) {
    if (provider === "flatpak" && state.detail?.app?.installed && !state.permissions && !state.permissionsLoading && !state.permissionsError) {
      loadPermissions(id);
    }
    if (provider === "flatpak" && state.detail?.app?.installed && !state.commits.length && !state.commitsLoading && !state.commitsError) {
      loadCommits(id);
    }
    renderIf("detail", renderDetail);
    return;
  }
  const seq = ++state.detailSeq;
  const sameDetail = sameApp(state.detail?.app, provider, id);
  if (!sameDetail) state.detail = null;
  state.detailLoading = true;
  state.detailError = "";
  renderIf("detail", renderDetail);

  try {
    const data = await invoke("get_app_detail", { appId: id, provider });
    if (seq !== state.detailSeq) return;
    state.detail = data;
    rememberRecent(data.app);
    if (provider === "flatpak" && data?.app?.installed) {
      loadPermissions(id);
      loadCommits(id);
    } else {
      state.permissionsSeq += 1;
      state.permissions = null;
      state.permissionsLoading = false;
      state.permissionsError = "";
      state.commitsSeq += 1;
      state.commits = [];
      state.commitsLoading = false;
      state.commitsError = "";
    }
  } catch (err) {
    if (seq !== state.detailSeq) return;
    state.detailError = errText(err);
  } finally {
    if (seq === state.detailSeq) {
      state.detailLoading = false;
      renderIf("detail", renderDetail);
    }
  }
}

async function loadCommits(appId) {
  const seq = ++state.commitsSeq;
  state.commits = [];
  state.commitsLoading = true;
  state.commitsError = "";
  renderIf("detail", renderDetail);

  try {
    const data = await invoke("flatpak_commits", { appId });
    if (seq !== state.commitsSeq) return;
    state.commits = Array.isArray(data) ? data : [];
  } catch (err) {
    if (seq !== state.commitsSeq) return;
    state.commitsError = errText(err);
  } finally {
    if (seq === state.commitsSeq) {
      state.commitsLoading = false;
      renderIf("detail", renderDetail);
    }
  }
}

async function loadPermissions(appId) {
  const seq = ++state.permissionsSeq;
  state.permissions = null;
  state.permissionsLoading = true;
  state.permissionsError = "";
  renderIf("detail", renderDetail);

  try {
    const data = await invoke("get_app_permissions", { appId });
    if (seq !== state.permissionsSeq) return;
    state.permissions = data;
  } catch (err) {
    if (seq !== state.permissionsSeq) return;
    state.permissionsError = errText(err);
  } finally {
    if (seq === state.permissionsSeq) {
      state.permissionsLoading = false;
      renderIf("detail", renderDetail);
    }
  }
}

function mergeRemotes(list) {
  const map = new Map();
  for (const remote of Array.isArray(list) ? list : []) {
    if (!remote?.name) continue;
    const existing = map.get(remote.name);
    if (!existing) {
      map.set(remote.name, {
        ...remote,
        scopes: [remote.scope || "system"],
      });
    } else {
      existing.scopes.push(remote.scope || "system");
      if (!existing.url && remote.url) existing.url = remote.url;
      if (!existing.comment && remote.comment) existing.comment = remote.comment;
    }
  }

  return [...map.values()]
    .map(remote => {
      const scopes = [...new Set(remote.scopes)];
      const user = scopes.includes("user");
      const system = scopes.includes("system");
      return {
        ...remote,
        scopes,
        scopeLabel: user && system ? "Sistem + kullanıcı" : user ? "Kullanıcı" : "Sistem",
        deletable: remote.name !== "flathub" && user,
      };
    })
    .sort((a, b) => {
      if (a.name === "flathub") return -1;
      if (b.name === "flathub") return 1;
      return String(a.title || a.name).localeCompare(String(b.title || b.name), "tr", { sensitivity: "base" });
    });
}

async function loadRemotes(force = false) {
  if (!force && (state.remotesLoaded || state.remotesLoading)) return;
  const seq = ++state.remotesSeq;
  state.remotesLoading = true;
  state.remotesError = "";
  renderIf("settings", renderSettings);

  try {
    const list = await invoke("list_flatpak_remotes");
    if (seq !== state.remotesSeq) return;
    state.remotes = mergeRemotes(list);
    state.remotesLoaded = true;
  } catch (err) {
    if (seq !== state.remotesSeq) return;
    state.remotesError = errText(err);
  } finally {
    if (seq === state.remotesSeq) {
      state.remotesLoading = false;
      renderIf("settings", renderSettings);
    }
  }
}

async function refreshCurrent() {
  if (els.refreshButton.classList.contains("is-spinning")) return;
  els.refreshButton.classList.add("is-spinning");
  try {
    await invoke("refresh_provider_caches");
    const route = state.route;
    if (route.name === "discover") await loadDiscover(true);
    else if (route.name === "search" && state.query) await runSearch(state.query);
    else if (route.name === "installed") await loadInstalled(true);
    else if (route.name === "category") await loadCategory(route.slug, 1, true);
    else if (route.name === "detail") await loadDetail(route.id, appProvider(route), true);
    else if (route.name === "settings") {
      await loadStoreInfo();
      await loadRemotes(true);
    }
    const hasProviderErrors = route.name === "installed" && state.installedProviderErrors.length > 0;
    toast(
      hasProviderErrors ? `${state.installedProviderErrors.length} paket kaynağı yenilenemedi.` : "Yenilendi.",
      hasProviderErrors ? "error" : "info",
    );
  } catch (err) {
    toast(errText(err), "error");
  } finally {
    els.refreshButton.classList.remove("is-spinning");
  }
}
/* ── Görünümler ────────────────────────────────────── */

function renderRoute() {
  const views = {
    discover: els.discoverView,
    search: els.searchView,
    categories: els.categoriesView,
    category: els.categoryView,
    favorites: els.favoritesView,
    installed: els.installedView,
    detail: els.detailView,
    settings: els.settingsView,
  };
  for (const [name, element] of Object.entries(views)) {
    element.hidden = state.route.name !== name;
  }
  renderChrome();

  switch (state.route.name) {
    case "discover":
      renderDiscover();
      break;
    case "search":
      renderSearch();
      break;
    case "categories":
      renderCategories();
      break;
    case "category":
      renderCategory();
      break;
    case "favorites":
      renderFavorites();
      break;
    case "installed":
      renderInstalled();
      break;
    case "detail":
      renderDetail();
      break;
    case "settings":
      renderSettings();
      break;
    default:
      break;
  }
}

function heroHtml(app) {
  const hero = imageUrl(app.heroImage);
  const developer = [app.developer, providerLabel(app)].filter(Boolean).join(" · ");
  const summary = String(app.summary || "").trim();
  const installed = app.installed;
  const secondary = !installed
    ? actionButtonsHtml(app, { hero: true, large: true, allowRemove: false })
    : app.updateAvailable
      ? actionButtonsHtml(app, { hero: true, large: true, allowRemove: false })
      : "";

  return `
    <article class="hero-card" data-open-app="${attr(app.id)}" data-provider="${attr(appProvider(app))}" tabindex="0" role="link" aria-label="${attr(app.name || app.id)} (${attr(providerLabel(app))}) ayrıntıları">
      <div class="hero-media${hero ? "" : " is-placeholder"}">${hero ? `<img src="${hero}" alt="" decoding="async" fetchpriority="high" />` : ""}</div>
      <div class="hero-scrim"></div>
      <div class="hero-content">
        <span class="hero-kicker">Günün uygulaması</span>
        <div class="hero-identity">
          ${appIconHtml(app)}
          <div>
            <h2>${escapeHtml(app.name || app.id)}</h2>
            <p class="hero-developer">${escapeHtml(developer)}</p>
          </div>
        </div>
        ${summary ? `<p class="hero-summary">${escapeHtml(summary)}</p>` : ""}
        <div class="hero-actions">
          <button class="btn btn-hero-primary btn-lg" type="button" data-open-app="${attr(app.id)}" data-provider="${attr(appProvider(app))}">İncele</button>
          ${secondary}
        </div>
      </div>
    </article>`;
}

function renderDiscover() {
  const data = state.discover;
  if (state.discoverLoading && !data) {
    els.discoverView.innerHTML = skeletonDiscover();
    return;
  }
  if (!data) {
    els.discoverView.innerHTML = `
      <header class="view-head">
        <div class="view-title">
          <p class="eyebrow">Flathub</p>
          <h1>Keşfet</h1>
        </div>
      </header>
      ${stateHtml({
        title: "Keşfet yüklenemedi",
        text: state.discoverError || "Flathub’dan öneriler alınamadı.",
        retry: "discover",
        icon: ICON.warning,
      })}`;
    return;
  }

  const picks = Array.isArray(data.picks) ? data.picks : [];
  const popular = Array.isArray(data.popular) ? data.popular : [];
  const recent = Array.isArray(data.recent) ? data.recent : [];
  const hero = data.appOfDay;

  const sections = [];
  const recentApps = state.recents.map(storedAppForView);
  if (recentApps.length) {
    sections.push(`
      <section>
        <div class="section-head">
          <h2>Son görüntülenenler</h2>
          <button class="chip" type="button" data-clear-recents>Temizle</button>
        </div>
        <div class="app-list">${recentApps.map(app => appRowHtml(app, "recent")).join("")}</div>
      </section>`);
  }
  if (picks.length) {
    sections.push(`
      <section>
        <div class="section-head">
          <h2>Haftanın seçkisi</h2>
          <p>${picks.length} uygulama</p>
        </div>
        <div class="pick-grid">${picks.map(pickCardHtml).join("")}</div>
      </section>`);
  }
  if (popular.length) {
    sections.push(`
      <section>
        <div class="section-head">
          <h2>Popüler uygulamalar</h2>
          <p>Flathub’da en çok tercih edilenler</p>
        </div>
        <div class="tile-grid">${popular.map(appTileHtml).join("")}</div>
      </section>`);
  }
  if (recent.length) {
    sections.push(`
      <section>
        <div class="section-head">
          <h2>Yeni eklenenler</h2>
          <p>Kataloğa son katılanlar</p>
        </div>
        <div class="app-list">${recent.map(app => appRowHtml(app, "discover")).join("")}</div>
      </section>`);
  }

  const body = hero || sections.length
    ? `${hero ? heroHtml(hero) : ""}${sections.join("")}`
    : stateHtml({
      title: "Henüz içerik yok",
      text: "Flathub’dan önerilen uygulama alınamadı. Biraz sonra yeniden deneyin.",
      retry: "discover",
      icon: ICON.box,
    });

  els.discoverView.innerHTML = `
    ${storeNoticeHtml()}
    <header class="view-head">
      <div class="view-title">
        <p class="eyebrow">Flathub</p>
        <h1>Keşfet</h1>
        <p class="view-sub">Öne çıkan uygulamalar, haftanın seçkileri ve yeni eklenenler.</p>
      </div>
      <p class="view-note">${escapeHtml(formatISODate(data.date))}</p>
    </header>
    ${body}`;
}

function renderSearch() {
  const query = state.query;
  const visible = state.searchResults.filter(app => providerMatches(app, state.searchProvider));
  const count = visible.length;
  const providerErrors = state.searchProviderErrors.filter(issue =>
    state.searchProvider === "all" || issue.provider === providerName(state.searchProvider),
  );
  const hasResults = state.searchResults.length > 0;
  const tooShort = query.length < 2;
  const meta = tooShort
    ? "En az 2 karakter"
    : state.searching
      ? "Aranıyor…"
      : state.searchError
        ? "Arama tamamlanamadı"
        : `${count} sonuç`;

  let body;
  if (tooShort) {
    body = stateHtml({
      title: "Biraz daha yazın",
      text: "Aramak için en az 2 karakter girin. Örneğin “firefox” ya da “gimp”.",
      icon: ICON.search,
    });
  } else if (state.searching) {
    body = skeletonRows(5);
  } else if (state.searchError) {
    body = stateHtml({
      title: "Arama yapılamadı",
      text: state.searchError,
      retry: "search",
      icon: ICON.warning,
    });
  } else if (!count && providerErrors.length && state.searchProvider !== "all") {
    body = stateHtml({
      title: `${providerName(state.searchProvider)} yanıt vermedi`,
      text: providerErrors.map(issue => issue.message).join(" · "),
      retry: "search",
      icon: ICON.warning,
    });
  } else if (!count) {
    body = stateHtml({
      title: hasResults ? "Bu sağlayıcıda sonuç yok" : "Sonuç bulunamadı",
      text: hasResults
        ? `“${query}” için ${providerName(state.searchProvider)} uygulaması bulunamadı. Farklı bir sağlayıcı deneyin.`
        : `“${query}” için uygulama bulunamadı.\nFarklı bir ad ya da anahtar kelime deneyin.`,
      retry: "search",
      icon: ICON.search,
    });
  } else {
    body = `<div class="app-list">${visible.map(app => appRowHtml(app, "search")).join("")}</div>`;
  }
  const providerNotice = providerErrors.length && (count > 0 || state.searchProvider === "all")
    ? `<div class="notice" role="status" aria-live="polite">
        ${ICON.warning}
        <span><strong>Bazı paket kaynakları yenilenemedi.</strong> ${escapeHtml(providerErrors.map(issue => `${issue.provider}: ${issue.message}`).join(" · "))}</span>
      </div>`
    : "";

  const controls = tooShort
    ? `<p class="view-note">${escapeHtml(meta)}</p>`
    : `<div class="view-tools">
        <p class="view-note">${escapeHtml(meta)}</p>
        ${providerFilterHtml("search", state.searchProvider, state.searchResults)}
      </div>`;

  els.searchView.innerHTML = `
    <header class="view-head">
      <div class="view-title">
        <p class="eyebrow">Arama</p>
        <h1>“${escapeHtml(query)}”</h1>
        <p class="view-sub">Flatpak, Snap ve Homebrew kataloglarında arama.</p>
      </div>
      ${controls}
    </header>
    ${providerNotice}
    ${body}`;
}

function renderCategories() {
  els.categoriesView.innerHTML = `
    <header class="view-head">
      <div class="view-title">
        <p class="eyebrow">Flathub</p>
        <h1>Kategoriler</h1>
        <p class="view-sub">İlgi alanınıza göre uygulamalara göz atın.</p>
      </div>
      <p class="view-note">${CATEGORY_LIST.length} kategori</p>
    </header>
    <div class="category-grid">
      ${CATEGORY_LIST.map(category => `
        <button class="category-card" type="button" data-category="${attr(category.slug)}">
          <span class="cat-icon" aria-hidden="true">${category.icon}</span>
          <span>
            <h3>${escapeHtml(category.name)}</h3>
            <p>${escapeHtml(category.desc)}</p>
          </span>
        </button>`).join("")}
    </div>`;
}

function renderCategory() {
  const slug = state.route.slug;
  const meta = CATEGORY_MAP[slug];
  const data = state.category?.slug === slug ? state.category : null;

  if (!meta) {
    els.categoryView.innerHTML = stateHtml({
      title: "Kategori bulunamadı",
      text: "Bu kategori Flathub kataloğunda yer almıyor.",
      icon: ICON.warning,
    });
    return;
  }

  const apps = data?.apps || [];
  let body;
  if (!data || (data.loading && !apps.length)) {
    body = skeletonTiles(8);
  } else if (data.error && !apps.length) {
    body = stateHtml({
      title: "Kategori yüklenemedi",
      text: data.error,
      retry: "category",
      icon: ICON.warning,
    });
  } else if (!apps.length) {
    body = stateHtml({
      title: "Uygulama bulunamadı",
      text: "Bu kategoride şu anda listelenecek uygulama yok.",
      retry: "category",
      icon: ICON.box,
    });
  } else {
    const more = data.page < data.totalPages
      ? `<div class="load-more">
           <button class="btn btn-ghost" type="button" data-load-more${data.loading ? " disabled" : ""}>
             ${data.loading ? '<span class="spinner"></span>Yükleniyor…' : "Daha fazla göster"}
           </button>
         </div>`
      : "";
    body = `<div class="tile-grid">${apps.map(appTileHtml).join("")}</div>${more}`;
  }

  const countText = data?.total ? `${formatCount(data.total)} uygulama` : "Flathub kataloğu";
  els.categoryView.innerHTML = `
    <div class="category-banner">
      <span class="cat-icon" aria-hidden="true">${meta.icon}</span>
      <div>
        <p class="eyebrow">Kategori</p>
        <h1>${escapeHtml(meta.name)}</h1>
        <p>${escapeHtml(meta.desc)} · ${escapeHtml(countText)}</p>
      </div>
    </div>
    ${body}`;
}

function renderFavorites() {
  const apps = state.favorites.map(storedAppForView);
  const installedCount = apps.filter(app => app.installed).length;
  const summary = apps.length
    ? `${apps.length} uygulama${installedCount ? ` · ${installedCount} yüklü` : ""}`
    : "Kaydettiğiniz uygulamalar burada görünür.";

  const body = apps.length
    ? `<div class="app-list">${apps.map(app => appRowHtml(app, "favorites")).join("")}</div>`
    : stateHtml({
      title: "Henüz favori yok",
      text: "Bir uygulamanın yıldızına dokunarak favorilerinize ekleyin. Liste cihazınızda saklanır.",
      icon: ICON.star,
      action: '<button class="btn btn-ghost" type="button" data-nav="discover">Keşfet’e göz at</button>',
    });

  els.favoritesView.innerHTML = `
    <header class="view-head">
      <div class="view-title">
        <p class="eyebrow">Kitaplık</p>
        <h1>Favoriler</h1>
        <p class="view-sub">${escapeHtml(summary)}</p>
      </div>
      ${apps.length ? `<div class="view-tools">
        <button class="chip" type="button" data-clear-favorites>Favorileri temizle</button>
      </div>` : ""}
    </header>
    ${storeNoticeHtml()}
    ${body}`;
}

function renderInstalled() {
  const updates = state.installed.filter(app => app.updateAvailable).length;
  if (!updates) state.updatesOnly = false;
  const provider = state.installedProvider;
  const providerApps = state.installed.filter(app => providerMatches(app, provider));
  const visible = sortInstalledApps(installedScopedApps(), state.installedSort);
  const searchActive = Boolean(state.installedQuery.trim());
  const pending = providerApps.filter(app => app.updateAvailable).length;
  const countPool = state.updatesOnly
    ? state.installed.filter(app => app.updateAvailable)
    : state.installed;
  const distribution = providerCounts(state.installed);
  const distributionText = distribution
    ? PROVIDER_FILTERS
      .filter(option => option.value !== "all" && distribution[option.value] > 0)
      .map(option => `${distribution[option.value]} ${option.label}`)
      .join(" · ")
    : "";
  const summaryText = [
    `${state.installed.length} uygulama`,
    distributionText ? `(${distributionText})` : "",
    updates ? `${updates} güncelleme` : "",
    state.libraryUsage?.totalBytes ? `${formatBytes(state.libraryUsage.totalBytes)} Flatpak alanı` : "",
    state.installedFromCache ? "önbellekten" : "",
  ].filter(Boolean).join(" · ");
  const refreshedText = state.lastRefreshed ? `Son kontrol: ${formatClock(state.lastRefreshed)}` : "";
  const selectedApps = selectedInstalledApps();
  const providerErrors = state.installedProviderErrors.filter(issue =>
    provider === "all" || issue.provider === provider,
  );

  let body;
  if (state.installedLoading && !state.installed.length) {
    body = skeletonRows(4);
  } else if (state.installedError && !state.installed.length) {
    body = stateHtml({
      title: "Yüklü uygulamalar alınamadı",
      text: state.installedError,
      retry: "installed",
      icon: ICON.warning,
    });
  } else if (!visible.length && providerErrors.length) {
    body = stateHtml({
      title: "Paket kaynağı yanıt vermedi",
      text: providerErrors.map(issue => `${providerName(issue.provider)}: ${issue.message}`).join(" · "),
      retry: "installed",
      icon: ICON.warning,
    });
  } else if (!visible.length && searchActive) {
    body = stateHtml({
      title: "Kitaplıkta sonuç yok",
      text: `“${state.installedQuery.trim()}” için yüklü uygulama bulunamadı. Farklı bir ad ya da sağlayıcı deneyin.`,
      icon: ICON.search,
      action: '<button class="btn btn-ghost" type="button" data-clear-installed-search>Aramayı temizle</button>',
    });
  } else if (!visible.length) {
    const providerNameText = provider === "all" ? "" : providerName(provider);
    body = stateHtml({
      title: state.updatesOnly
        ? providerNameText ? `${providerNameText} için güncelleme yok` : "Güncelleme yok"
        : state.installed.length && providerNameText ? `${providerNameText} uygulaması yok` : "Henüz yüklü uygulama yok",
      text: state.updatesOnly
        ? providerNameText
          ? `${providerNameText} için bekleyen güncelleme görünmüyor.`
          : "Tüm paket yöneticilerinde bekleyen güncelleme görünmüyor."
        : state.installed.length && providerNameText
          ? `${providerNameText} sağlayıcısında yüklü uygulama yok.`
          : "Bir uygulama kurduğunuzda burada görünür.",
      icon: ICON.box,
      action: state.updatesOnly || (state.installed.length && providerNameText)
        ? ""
        : '<button class="btn btn-ghost" type="button" data-nav="discover">Keşfet’e göz at</button>',
    });
  } else {
    const visibleApps = visible.slice(0, state.installedVisibleCount);
    const remaining = visible.length - visibleApps.length;
    const more = remaining > 0
      ? `<div class="load-more"><button class="btn btn-ghost" type="button" data-installed-more>Daha fazla göster (${remaining})</button></div>`
      : "";
    body = `<div class="app-list">${visibleApps.map(app => appRowHtml(app, "installed", {
      selectable: state.selectionMode,
      selected: isSelected(app),
    })).join("")}</div>${more}`;
  }

  const providerNotice = providerErrors.length && visible.length
    ? `<div class="notice" role="status" aria-live="polite">
        ${ICON.warning}
        <span><strong>Bazı paket kaynakları yenilenemedi.</strong> ${escapeHtml(providerErrors.map(issue => `${providerName(issue.provider)}: ${issue.message}`).join(" · "))} Yenile ile tekrar deneyin.</span>
      </div>`
    : "";

  els.installedView.innerHTML = `
    <header class="view-head">
      <div class="view-title">
        <p class="eyebrow">Kitaplık</p>
        <h1>Yüklü Uygulamalar</h1>
        <p class="view-sub">${escapeHtml(summaryText)}${refreshedText ? `<span class="dot">·</span>${escapeHtml(refreshedText)}` : ""}</p>
      </div>
      ${state.installed.length ? `<div class="view-tools">
        <label class="library-search">
          ${ICON.search}
          <input type="search" data-installed-search value="${attr(state.installedQuery)}" placeholder="Kitaplıkta ara" aria-label="Yüklü uygulamalarda ara" autocomplete="off" spellcheck="false" />
        </label>
        ${state.selectionMode ? `<div class="selection-actions">
          <span class="selection-count">${selectedApps.length} seçili</span>
          <button class="btn btn-ghost btn-sm" type="button" data-select-all>Tümünü seç</button>
          <button class="btn btn-ghost btn-sm" type="button" data-copy-selected${selectedApps.length ? "" : " disabled"}>Seçilenleri kopyala</button>
          <button class="btn btn-primary btn-sm" type="button" data-remove-selected${selectedApps.length ? "" : " disabled"}>Seçilenleri kaldır (${selectedApps.length})</button>
        </div>` : ""}
        ${!state.selectionMode && (pending || state.batch) ? `<button class="btn btn-primary btn-sm" type="button" data-update-all${state.busy || state.batch ? " disabled" : ""} aria-label="Bekleyen güncellemeleri sırayla uygula">
          ${state.batch
            ? `<span class="spinner"></span>${state.batch.action === "remove" ? "Kaldırılıyor" : "Güncelleniyor"} ${Math.min(state.batch.done + state.batch.failed + 1, state.batch.total)}/${state.batch.total}`
            : `Tümünü güncelle (${pending})`}
        </button>` : ""}
        ${state.batch ? `<button class="chip" type="button" data-batch-cancel>Vazgeç</button>` : ""}
        ${!state.selectionMode && updates ? `<button class="chip" type="button" data-updates-filter aria-pressed="${state.updatesOnly}">
          Güncellemeler <span>${updates}</span>
        </button>` : ""}
        ${providerFilterHtml("installed", provider, countPool)}
        ${state.selectionMode ? "" : sortFilterHtml()}
        ${!state.selectionMode ? `<button class="chip" type="button" data-copy-installed>Listeyi kopyala</button>` : ""}
        ${!state.selectionMode && pending ? `<button class="chip" type="button" data-copy-updates>Güncelleme komutlarını kopyala</button>` : ""}
        <button class="chip" type="button" data-selection-toggle aria-pressed="${state.selectionMode}">
          ${state.selectionMode ? "Seçimi kapat" : "Seç"}
        </button>
      </div>` : ""}
    </header>
    ${storeNoticeHtml()}
    ${providerNotice}
    ${body}`;
}

function detailActionButtons(app) {
  return actionButtonsHtml(app, { large: true, allowRemove: true });
}

function maskButtonHtml(app, provider) {
  if (provider !== "flatpak" || !app.installed) return "";
  const pinned = Boolean(app.pinned);
  const label = pinned ? "Güncellemeleri sürdür" : "Güncellemeleri durdur";
  return `<button class="btn btn-ghost btn-sm" type="button" data-mask="${pinned ? "off" : "on"}" data-id="${attr(app.id)}" title="${attr(label)}" aria-label="${attr(`${app.name || app.id} · ${label}`)}">${pinned ? "Güncellemeleri sürdür" : "Güncellemeleri durdur"}</button>`;
}

function infoCardHtml(detail) {
  const app = detail.app;
  const rows = [];
  rows.push(["Paket sağlayıcısı", providerLabel(app)]);
  if (app.version) rows.push(["Sürüm", app.version]);
  if (app.channel) rows.push(["Snap kanalı", app.channel]);
  if (app.pinned) rows.push(["Durum", "Sabitlenmiş"]);
  if (app.category) rows.push(["Kategori", categoryName(app.category)]);
  if (detail.license) rows.push(["Lisans", detail.license]);
  if (detail.downloadSize) rows.push(["İndirme boyutu", formatBytes(detail.downloadSize)]);
  if (detail.installedSize) rows.push(["Kurulu boyut", formatBytes(detail.installedSize)]);
  if (detail.installsLastMonth) rows.push(["Aylık kurulum", formatCount(detail.installsLastMonth)]);
  if (detail.homepage) rows.push(["Web sitesi", detail.homepage]);

  return `
    <div class="info-card">
      <h2>Uygulama bilgileri</h2>
      ${rows.length
        ? `<dl class="info-rows">${rows.map(([label, value]) => `
            <div class="info-row">
              <dt>${escapeHtml(label)}</dt>
              <dd>${escapeHtml(value)}</dd>
            </div>`).join("")}</dl>`
        : '<p class="source-note">Ek bilgi sağlanmamış.</p>'}
    </div>`;
}

function ratingCardHtml(rating) {
  if (!rating || !rating.total) return "";
  const average = Number(rating.average) || 0;
  const total = Number(rating.total) || 0;
  const stars = Array.isArray(rating.stars) ? rating.stars : [0, 0, 0, 0, 0];
  const rows = [5, 4, 3, 2, 1].map(star => {
    const count = Number(stars[star - 1]) || 0;
    const percent = total ? Math.round((count / total) * 100) : 0;
    return `
      <div class="rating-row">
        <span>${star} yıldız</span>
        <span class="rating-track"><span class="rating-fill" style="width:${percent}%"></span></span>
        <span>${formatCount(count)}</span>
      </div>`;
  }).join("");

  return `
    <div class="rating-card">
      <h2>Topluluk puanı</h2>
      <div class="rating-head">
        <span class="rating-average">${average.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
        <div class="rating-meta">
          ${starsHtml(average)}
          <p>${formatCount(total)} değerlendirme</p>
        </div>
      </div>
      <div class="rating-bars">${rows}</div>
    </div>`;
}

function reviewsHtml(reviews) {
  if (!Array.isArray(reviews) || !reviews.length) {
    return `<div class="state is-compact">
      <span class="state-icon" aria-hidden="true">${ICON.box}</span>
      <h3>Henüz yorum yok</h3>
      <p>Bu uygulama için ODRS üzerinde yayımlanmış bir topluluk yorumu bulunmuyor.</p>
    </div>`;
  }

  return `<div class="reviews">${reviews.map(review => {
    const initial = String(review.author || "?").trim().charAt(0).toLocaleUpperCase("tr") || "?";
    const meta = [];
    if (review.date) meta.push(formatDate(review.date));
    if (review.version) meta.push(`v${review.version}`);
    if (review.locale) meta.push(review.locale.replace(/\.UTF-8$/i, ""));
    return `
      <article class="review">
        <div class="review-head">
          <span class="review-avatar" aria-hidden="true">${escapeHtml(initial)}</span>
          <div class="review-who">
            <h3>${escapeHtml(review.author || "Anonim")}</h3>
            <p>${meta.map(escapeHtml).join(" · ")}</p>
          </div>
          ${starsHtml(review.rating, `${review.rating} / 5 yıldız`)}
        </div>
        ${review.summary ? `<h4>${escapeHtml(review.summary)}</h4>` : ""}
        ${review.text ? `<p>${escapeHtml(review.text)}</p>` : ""}
      </article>`;
  }).join("")}</div>`;
}

const PERMISSION_GROUPS = {
  Context: "Bağlam",
  "Session Bus Policy": "Oturum veriyolu",
  "System Bus Policy": "Sistem veriyolu",
  Environment: "Ortam değişkenleri",
};

const PERMISSION_LABELS = {
  shared: "Paylaşılan kaynaklar",
  sockets: "Soketler",
  devices: "Aygıtlar",
  filesystems: "Dosya sistemi",
  persistent: "Kalıcı dizinler",
  features: "Özellikler",
};

const PERMISSION_VALUES = {
  network: "Ağ erişimi",
  ipc: "Süreçler arası iletişim",
  x11: "X11 ekran",
  wayland: "Wayland",
  fallback_x11: "X11 yedeği",
  pulseaudio: "Ses",
  "!host": "Ana dizin kapalı",
  host: "Tüm ana dizin",
  "host:ro": "Ana dizin (salt okunur)",
  "home:ro": "Ev dizini (salt okunur)",
};

function parsePermissions(raw) {
  const groups = [];
  let current = null;
  for (const line of String(raw || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      current = { title: trimmed.slice(1, -1), items: [] };
      groups.push(current);
      continue;
    }
    if (!current) {
      current = { title: "Diğer", items: [] };
      groups.push(current);
    }
    const equals = trimmed.indexOf("=");
    current.items.push(equals > 0
      ? { key: trimmed.slice(0, equals), value: trimmed.slice(equals + 1) }
      : { key: "", value: trimmed });
  }
  return groups;
}

function permissionValueLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "—";
  return PERMISSION_VALUES[text] || text;
}

function permissionsHtml() {
  if (state.permissionsLoading) {
    return `<section class="detail-section permissions-section">
      <h2>İzinler</h2>
      <p class="source-note">Flatpak izinleri okunuyor…</p>
    </section>`;
  }
  if (state.permissionsError) {
    return `<section class="detail-section permissions-section">
      <h2>İzinler</h2>
      <p class="permission-note">İzinler okunamadı: ${escapeHtml(state.permissionsError)}</p>
      <button class="btn btn-ghost btn-sm" type="button" data-permissions-retry>Yeniden dene</button>
    </section>`;
  }
  const permissions = state.permissions;
  if (!permissions) return "";
  if (!permissions.available) {
    return `<section class="detail-section permissions-section">
      <h2>İzinler</h2>
      <p class="permission-note">Flatpak bu sistemde bulunamadığı için izinler okunamıyor.</p>
    </section>`;
  }
  if (!permissions.installed) {
    return `<section class="detail-section permissions-section">
      <h2>İzinler</h2>
      <p class="permission-note">İzinler yalnızca uygulama yüklendikten sonra görünür.</p>
    </section>`;
  }
  const groups = parsePermissions(permissions.raw);
  if (!groups.length) {
    return `<section class="detail-section permissions-section">
      <h2>İzinler</h2>
      <p class="permission-note">Uygulama özel izin istemiyor; Flatpak sandbox varsayılanları geçerli.</p>
    </section>`;
  }
  return `<section class="detail-section permissions-section">
    <h2>İzinler <span class="source-note">flatpak info --show-permissions</span></h2>
    <div class="permission-groups">
      ${groups.map(group => `
        <div class="permission-group">
          <h3>${escapeHtml(PERMISSION_GROUPS[group.title] || group.title)}</h3>
          <ul class="permission-list">
            ${group.items.map(item => `
              <li>
                ${item.key ? `<span class="permission-key">${escapeHtml(PERMISSION_LABELS[item.key] || item.key)}</span>` : ""}
                <span class="permission-values">
                  ${String(item.value).split(";").filter(Boolean).map(value =>
                    `<span class="permission-chip">${escapeHtml(permissionValueLabel(value))}</span>`).join("")}
                </span>
              </li>`).join("")}
          </ul>
        </div>`).join("")}
    </div>
  </section>`;
}

function commitsHtml() {
  if (state.commitsLoading && !state.commits.length) {
    return `<section class="detail-section"><h2>Sürüm geri alma</h2>${skeletonRows(2)}</section>`;
  }
  if (state.commitsError) {
    return `<section class="detail-section">
      <h2>Sürüm geri alma</h2>
      <p class="source-note">${escapeHtml(state.commitsError)}</p>
    </section>`;
  }
  if (!state.commits.length) return "";
  const rows = state.commits.map((commit, index) => {
    const label = commit.subject || `Kayıt ${commit.commit.slice(0, 7)}`;
    const dateText = commit.date ? formatDate(commit.date) : "";
    return `
      <li class="commit-row">
        <div class="commit-body">
          <strong>${escapeHtml(label)}</strong>
          <span class="commit-meta">
            ${index === 0 ? '<span class="tag tag-update">Yüklü</span>' : ""}
            ${commit.version ? `<span>${escapeHtml(commit.version)}</span>` : ""}
            ${dateText ? `<span>${escapeHtml(dateText)}</span>` : ""}
            <code class="commit-hash">${escapeHtml(commit.commit.slice(0, 7))}</code>
          </span>
        </div>
        ${index === 0 ? "" : `<button class="btn btn-ghost btn-sm" type="button" data-rollback="${attr(commit.commit)}" data-id="${attr(state.detail?.app?.id || "")}" data-label="${attr(label)}">Bu sürüme dön</button>`}
      </li>`;
  }).join("");
  return `<section class="detail-section">
    <h2>Sürüm geri alma <span class="source-note">${state.commits.length} kayıt</span></h2>
    <ol class="commit-list">${rows}</ol>
    <p class="source-note">Geri dönmek paketi seçilen sürüme sabitler; sonraki güncellemeler duraklar.</p>
  </section>`;
}

function releasesHtml(releases) {
  if (!Array.isArray(releases) || !releases.length) return "";
  return `<section class="detail-section releases-section">
    <h2>Sürüm geçmişi <span class="source-note">${releases.length} sürüm</span></h2>
    <ol class="release-list">
      ${releases.map((release, index) => `
        <li>
          <span class="release-marker" aria-hidden="true"></span>
          <div>
            <strong>${escapeHtml(release.version)}</strong>
            ${release.date ? `<span class="release-date">${escapeHtml(formatDate(release.date))}</span>` : ""}
            ${index === 0 ? '<span class="tag tag-update">Son sürüm</span>' : ""}
          </div>
        </li>`).join("")}
    </ol>
  </section>`;
}

function renderDetail() {
  const detail = state.detail;

  if (!detail) {
    if (state.detailLoading) {
      els.detailView.innerHTML = skeletonDetail();
      return;
    }
    els.detailView.innerHTML = `
      <div class="detail-top">
        <button class="text-back" type="button" data-back>${ICON.arrow}Geri</button>
      </div>
      ${stateHtml({
        title: "Uygulama yüklenemedi",
        text: state.detailError || "Uygulama ayrıntıları alınamadı.",
        retry: "detail",
        icon: ICON.warning,
      })}`;
    return;
  }

  const app = detail.app;
  const provider = appProvider(app);
  const isFlatpak = provider === "flatpak";
  const screenshots = Array.isArray(detail.screenshots) ? detail.screenshots : [];
  const reviews = Array.isArray(detail.reviews) ? detail.reviews : [];
  const categories = Array.isArray(detail.categories) ? detail.categories : [];
  const tags = [];
  if (app.installed) tags.push('<span class="tag">Yüklü</span>');
  if (app.updateAvailable) tags.push('<span class="tag tag-update">Güncelleme</span>');
  for (const slug of categories) {
    if (CATEGORY_MAP[slug]) tags.push(`<span class="tag">${escapeHtml(CATEGORY_MAP[slug].name)}</span>`);
  }

  const shots = screenshots.length
    ? `<section class="detail-section">
        <h2>Ekran görüntüleri <span class="source-note">${screenshots.length} görsel</span></h2>
        <div class="shots${screenshots.length === 1 ? " single" : ""}">
          ${screenshots.map((shot, index) => `
            <figure class="shot" data-shot="${index}" tabindex="0" role="button" aria-label="Görseli büyüt">
              <img class="shot-img" src="${imageUrl(shot.url)}" alt="${attr(shot.caption || `${app.name} ekran görüntüsü`)}" loading="lazy" decoding="async" />
              ${shot.caption ? `<figcaption>${escapeHtml(shot.caption)}</figcaption>` : ""}
            </figure>`).join("")}
        </div>
      </section>`
    : "";

  const description = sanitizeDescription(detail.description);
  const sourceLabel = provider === "flatpak" ? "Flathub · Flatpak" : providerLabel(app);
  const communityContent = isFlatpak
    ? `<section class="detail-section">
        <h2>Topluluk yorumları <span class="source-note">ODRS üzerinden</span></h2>
        ${reviewsHtml(reviews)}
      </section>`
    : "";
  const providerNote = isFlatpak
    ? "Açıklama, ekran görüntüleri ve sürüm bilgileri Flathub’dan; topluluk puanları ve yorumları ODRS’den alınır. Kurulum ve kaldırma işlemleri kullanıcı kapsamında Flatpak ile yapılır."
    : provider === "snap"
      ? "Snap işlemleri sistem kapsamında yönetilir. İşlem sırasında sistem yetkilendirme penceresi açılabilir."
      : "Kurulum, güncelleme ve kaldırma işlemleri Homebrew paket yöneticisiyle yönetilir.";
  const command = cliCommand(app);

  els.detailView.innerHTML = `
    <div class="detail-top">
      <button class="text-back" type="button" data-back>${ICON.arrow}Geri</button>
      <span class="detail-source">${escapeHtml(sourceLabel)}</span>
    </div>

    <section class="detail-hero">
      ${appIconHtml(app)}
      <div class="detail-intro">
        <div class="detail-title-line">
          <h1>${escapeHtml(app.name || app.id)}</h1>
          ${detail.verified ? `<span class="verified-badge">${ICON.check}Doğrulanmış</span>` : ""}
        </div>
        ${app.developer ? `<p class="detail-dev">${escapeHtml(app.developer)}</p>` : ""}
        ${app.summary ? `<p class="detail-summary">${escapeHtml(app.summary)}</p>` : ""}
        ${tags.length ? `<div class="detail-tags">${tags.join("")}</div>` : ""}
        <div class="detail-actions">
          ${detailActionButtons(app)}
          ${favoriteButtonHtml(app, { large: true })}
          ${maskButtonHtml(app, provider)}
          ${command ? `<button class="btn btn-ghost btn-sm" type="button" data-copy-command="${attr(command)}" title="${attr(command)}" aria-label="CLI kurulum komutunu kopyala">${ICON.copy}Komutu kopyala</button>` : ""}
          <button class="btn btn-ghost btn-sm" type="button" data-cli data-id="${attr(app.id)}" data-provider="${attr(provider)}">CLI komutları</button>
          <span class="detail-size">${detail.downloadSize ? `İndirme: ${formatBytes(detail.downloadSize)} · ` : ""}${escapeHtml(providerInstallInfo(app))}</span>
        </div>
      </div>
    </section>

    <div class="detail-grid">
      <div class="detail-main">
        ${shots}
        <section class="detail-section">
          <h2>Açıklama</h2>
          ${description ? `<div class="prose">${description}</div>` : '<p class="prose">Açıklama sağlanmamış.</p>'}
        </section>
        ${isFlatpak && app.installed ? permissionsHtml() : ""}
        ${isFlatpak && app.installed ? commitsHtml() : ""}
        ${snapChannelHtml(app)}
        ${releasesHtml(detail.releases)}
        ${communityContent}
      </div>
      <aside class="detail-side">
        ${isFlatpak ? ratingCardHtml(detail.rating) : ""}
        ${infoCardHtml(detail)}
      </aside>
    </div>

    <p class="detail-footnote">${providerNote}</p>`;
}

async function loadBrewTaps(force = false) {
  if (!state.storeInfo?.brewAvailable) {
    state.brewTaps = [];
    return;
  }
  if (!force && (state.brewTapsLoading || state.brewTaps.length)) return;
  state.brewTapsLoading = true;
  state.brewTapsError = "";
  renderIf("settings", renderSettings);
  try {
    const taps = await invoke("list_brew_taps");
    state.brewTaps = Array.isArray(taps) ? taps : [];
  } catch (err) {
    state.brewTapsError = errText(err);
  } finally {
    state.brewTapsLoading = false;
    renderIf("settings", renderSettings);
  }
}

async function runBrewTap(action, name) {
  const command = action === "add" ? "add_brew_tap" : "remove_brew_tap";
  try {
    const message = await invoke(command, { name });
    toast(message || "Tap güncellendi.", "success");
    await loadBrewTaps(true);
  } catch (err) {
    toast(errText(err), "error");
  }
}

const SNAP_CHANNELS = ["latest/stable", "latest/candidate", "latest/beta", "latest/edge"];

function snapChannelHtml(app) {
  if (appProvider(app) !== "snap" || !app.installed) return "";
  const current = app.channel || "";
  return `<section class="detail-section">
    <h2>Snap kanalı <span class="source-note">${escapeHtml(current || "bilinmiyor")}</span></h2>
    <div class="channel-row">
      ${SNAP_CHANNELS.map(channel => `
        <button class="chip" type="button" data-snap-channel="${attr(channel)}" data-id="${attr(app.id)}" aria-pressed="${channel === current}">
          ${escapeHtml(channel.replace("latest/", ""))}
        </button>`).join("")}
    </div>
    <p class="source-note">Kanal değişikliği Snap paketini yeni sürüm akışına geçirir ve paketi yeniler.</p>
  </section>`;
}

function renderSettings() {
  const theme = currentTheme();
  let repoBody;

  if (state.remotesLoading && !state.remotes.length) {
    repoBody = skeletonRows(2);
  } else if (state.remotesError && !state.remotes.length) {
    repoBody = stateHtml({
      title: "Depolar alınamadı",
      text: state.remotesError,
      retry: "remotes",
      icon: ICON.warning,
    });
  } else if (!state.remotes.length) {
    repoBody = '<div class="repo-empty">Tanımlı Flatpak deposu bulunamadı.</div>';
  } else {
    repoBody = `<div class="repo-list">${state.remotes.map(remote => `
      <div class="repo-row">
        <span class="repo-mark" aria-hidden="true">${ICON.repo}</span>
        <div class="repo-body">
          <div class="repo-title">
            <strong>${escapeHtml(remote.title || remote.name)}</strong>
            <span class="repo-badge${remote.name === "flathub" ? " is-protected" : ""}">${remote.name === "flathub" ? "Korunuyor" : escapeHtml(remote.scopeLabel)}</span>
          </div>
          <p class="repo-url">${escapeHtml(remote.url || "—")}</p>
        </div>
        ${remote.deletable ? `<button class="repo-remove" type="button" data-remove-remote="${attr(remote.name)}" title="Depoyu kaldır" aria-label="${attr(remote.title || remote.name)} deposunu kaldır">${ICON.trash}</button>` : ""}
      </div>`).join("")}</div>`;
  }

  const flatpakVersion = state.storeInfo?.flatpakVersion || "bulunamadı";
  const setup = state.setup.status;
  const flatpakAvailable = setup?.flatpakAvailable ?? state.storeInfo?.flatpakAvailable;
  const flathubAvailable = setup?.userFlathubAvailable ?? state.storeInfo?.userFlathubAvailable;
  const flatpakReady = Boolean(flatpakAvailable);
  const flathubReady = Boolean(flathubAvailable);
  const flatpakDetail = typeof flatpakAvailable !== "boolean"
    ? "Durum bilinmiyor"
    : flatpakReady
      ? (setup?.flatpakVersion || state.storeInfo?.flatpakVersion || "Kurulu")
      : "Kurulu değil";
  const flathubDetail = typeof flathubAvailable !== "boolean"
    ? "Durum bilinmiyor"
    : flathubReady
      ? "Kullanıcı deposu hazır"
      : setup?.flathubAvailable
        ? "Sistem deposu var · kullanıcı deposu eksik"
        : "Eklenmeli";
  const flatpakStatusClass = typeof flatpakAvailable !== "boolean" ? "is-pending" : flatpakReady ? "is-ok" : "is-error";
  const flathubStatusClass = typeof flathubAvailable !== "boolean" ? "is-pending" : flathubReady ? "is-ok" : "is-error";
  const pruneBusy = state.busy?.action === "prune";
  const brewReady = Boolean(state.storeInfo?.brewAvailable);
  let brewBody = "";
  if (brewReady) {
    if (state.brewTapsLoading && !state.brewTaps.length) {
      brewBody = skeletonRows(2);
    } else if (state.brewTapsError) {
      brewBody = stateHtml({
        title: "Tap listesi alınamadı",
        text: state.brewTapsError,
        retry: "brew-taps",
        icon: ICON.warning,
      });
    } else if (!state.brewTaps.length) {
      brewBody = '<div class="repo-empty">Tanımlı Homebrew tap\'i bulunamadı.</div>';
    } else {
      brewBody = `<div class="repo-list">${state.brewTaps.map(name => `
        <div class="repo-row">
          <span class="repo-mark" aria-hidden="true">${ICON.repo}</span>
          <div class="repo-body">
            <div class="repo-title"><strong>${escapeHtml(name)}</strong></div>
            <p class="repo-url">Homebrew tap</p>
          </div>
          <button class="repo-remove" type="button" data-remove-tap="${attr(name)}" title="Tap'i kaldır" aria-label="${attr(name)} tap'ini kaldır">${ICON.trash}</button>
        </div>`).join("")}</div>`;
    }
    brewBody += `
      <form class="tap-form" data-tap-form>
        <input type="text" name="tap" placeholder="kullanici/tap" aria-label="Eklenecek Homebrew tap adı" autocomplete="off" spellcheck="false" pattern="[A-Za-z0-9@+_.-]+/[A-Za-z0-9@+_.-]+(/[A-Za-z0-9@+_.-]+)?" required />
        <button class="btn btn-ghost btn-sm" type="submit">Tap ekle</button>
      </form>`;
  }
  const activityBody = state.activityHistory.length
    ? `<ul class="activity-list">
        ${state.activityHistory.map(entry => `
          <li class="activity-row">
            <span class="status-dot ${entry.ok ? "is-ok" : "is-error"}" aria-hidden="true"></span>
            <div class="activity-copy">
              <div class="activity-title"><strong>${escapeHtml(entry.name || entry.label)}</strong><span>${escapeHtml(entry.label)}</span></div>
              ${entry.message ? `<p>${escapeHtml(entry.message)}</p>` : ""}
            </div>
            <time datetime="${new Date(entry.time).toISOString()}">${escapeHtml(activityTime(entry.time))}</time>
          </li>`).join("")}
      </ul>
      <button class="btn btn-ghost" type="button" data-clear-activity>Geçmişi temizle</button>`
    : '<div class="repo-empty">Henüz işlem geçmişi yok. Kurulum, güncelleme ve kaldırma işlemleri burada listelenir.</div>';

  els.settingsView.innerHTML = `
    <header class="view-head">
      <div class="view-title">
        <p class="eyebrow">Macro Store</p>
        <h1>Seçenekler</h1>
        <p class="view-sub">Görünümü ve uygulama kaynaklarını yönetin.</p>
      </div>
      <p class="view-note">Sürüm 0.3.0</p>
    </header>

    ${storeNoticeHtml()}

    <section class="settings-section">
      <div class="settings-head">
        <h2>Görünüm</h2>
        <p>Göz yormayan açık tonlar ya da koyu mağaza görünümü arasında geçiş yapın.</p>
      </div>
      <div class="theme-grid">
        <button class="theme-card${theme === "light" ? " is-active" : ""}" type="button" data-theme-choice="light" aria-pressed="${theme === "light"}">
          <span class="theme-preview light" aria-hidden="true"></span>
          <span class="theme-label"><strong>Açık tema</strong><span>Yumuşak, aydınlık tonlar</span></span>
        </button>
        <button class="theme-card${theme === "dark" ? " is-active" : ""}" type="button" data-theme-choice="dark" aria-pressed="${theme === "dark"}">
          <span class="theme-preview dark" aria-hidden="true"></span>
          <span class="theme-label"><strong>Koyu tema</strong><span>Düşük ışıkta rahat kullanım</span></span>
        </button>
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-head">
        <h2>Sistem hazırlığı</h2>
        <p>Flatpak kullanıcı kapsamında kurulur. Snap sistem kapsamında yönetilir; Homebrew kendi paket yöneticisini kullanır. Burada yalnızca algılanan kullanılabilirlik gösterilir.</p>
      </div>
      <div class="system-status">
        <div class="system-row">
          <span class="status-dot ${flatpakStatusClass}" aria-hidden="true"></span>
          <span>Flatpak</span>
          <strong>${escapeHtml(flatpakDetail)}</strong>
        </div>
        <div class="system-row">
          <span class="status-dot ${flathubStatusClass}" aria-hidden="true"></span>
          <span>Flathub</span>
          <strong>${escapeHtml(flathubDetail)}</strong>
        </div>
        ${managerStatusRowHtml("Snap", state.storeInfo?.snapAvailable)}
        ${managerStatusRowHtml("Homebrew", state.storeInfo?.brewAvailable)}
      </div>
      ${setup?.distroName ? `<p class="system-meta">${escapeHtml(setup.distroName)}${setup.packageManagerLabel ? ` · ${escapeHtml(setup.packageManagerLabel)}` : ""}</p>` : ""}
      <button class="btn btn-ghost" type="button" data-open-setup>${flatpakReady && flathubReady ? "Kurulum bilgilerini aç" : "Kurulum sihirbazını aç"}</button>
    </section>

    <section class="settings-section">
      <div class="settings-head">
        <h2>Depolar</h2>
        <p>Flathub varsayılan kaynaktır. Kullanıcı kapsamına özel Flatpak depoları ekleyebilirsiniz.</p>
      </div>
      ${repoBody}
      <form id="repoForm" class="repo-form" autocomplete="off">
        <input id="repoName" class="field" type="text" name="name" placeholder="Depo adı" aria-label="Depo adı" maxlength="64" required />
        <input id="repoUrl" class="field" type="url" name="url" placeholder="https://example.com/repo/" aria-label="Depo adresi" maxlength="500" required />
        <button id="repoSubmit" class="btn btn-primary" type="submit">Depo ekle</button>
      </form>
    </section>

    <section class="settings-section">
      <div class="settings-head">
        <h2>İşlem geçmişi</h2>
        <p>Son kurulum, güncelleme ve kaldırma işlemleri yalnızca bu cihazda saklanır.</p>
      </div>
      ${activityBody}
    </section>

    ${brewReady ? `<section class="settings-section">
      <div class="settings-head">
        <h2>Homebrew tap'leri</h2>
        <p>Ek depoları yönetin. Tap eklemek ya da kaldırmak Homebrew aramalarını etkiler.</p>
      </div>
      ${brewBody}
    </section>` : ""}

    <section class="settings-section">
      <div class="settings-head">
        <h2>Bakım</h2>
        <p>Yüklü uygulamaların artık ihtiyaç duymadığı Flatpak çalışma zamanlarını kaldırın.</p>
      </div>
      <div class="settings-actions">
        <button class="btn btn-ghost" type="button" data-prune-runtimes${pruneBusy ? " disabled" : ""}>
          ${pruneBusy ? "Temizleniyor…" : "Kullanılmayan çalışma zamanlarını temizle"}
        </button>
        ${state.libraryUsage?.totalBytes ? `<span class="source-note">${escapeHtml(formatBytes(state.libraryUsage.totalBytes))} Flatpak alanı kullanılıyor</span>` : ""}
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-head">
        <h2>Mağaza bilgileri</h2>
      </div>
      <div class="about-lines">
        <div><strong>Macro Store</strong> 0.3.0 · Linux uygulama mağazası</div>
        <div>Flatpak: <strong>${escapeHtml(flatpakVersion)}</strong> · Kullanıcı kapsamı</div>
        <div>Snap sistem kapsamında yönetilir; Homebrew paketleri kendi yöneticisiyle çalışır.</div>
      </div>
    </section>`;
}
/* ── İşlemler ──────────────────────────────────────── */

function patchApp(app, action, provider, id) {
  if (!sameApp(app, provider, id)) return;
  if (action === "install") {
    app.installed = true;
    app.updateAvailable = false;
  } else if (action === "remove") {
    app.installed = false;
    app.updateAvailable = false;
  } else if (action === "update") {
    app.updateAvailable = false;
  }
  syncStoredApp(app);
}

function applyAction(action, provider, id) {
  const lists = [
    state.searchResults,
    state.installed,
    state.category?.apps || [],
    state.discover?.picks || [],
    state.discover?.popular || [],
    state.discover?.recent || [],
    state.favorites,
    state.recents,
  ];
  for (const list of lists) list.forEach(app => patchApp(app, action, provider, id));
  if (state.discover?.appOfDay) patchApp(state.discover.appOfDay, action, provider, id);
  if (state.detail?.app) patchApp(state.detail.app, action, provider, id);

  if (action === "remove") {
    state.installed = state.installed.filter(app => !sameApp(app, provider, id));
  }
  if (action === "install") {
    const source = state.searchResults.find(matchesApps(provider, id))
      || (sameApp(state.detail?.app, provider, id) ? state.detail.app : null)
      || (sameApp(state.discover?.appOfDay, provider, id) ? state.discover.appOfDay : null)
      || state.discover?.picks?.find(matchesApps(provider, id))
      || state.discover?.popular?.find(matchesApps(provider, id))
      || state.discover?.recent?.find(matchesApps(provider, id))
      || state.category?.apps?.find(matchesApps(provider, id));
    if (source && state.installedLoaded && !state.installed.some(app => sameApp(app, provider, id))) {
      state.installed.push({ ...source, installed: true, updateAvailable: false });
      state.installed.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "tr", { sensitivity: "base" }));
    }
  }
  updateInstalledCount();
}

async function rollbackApp(id, commit, label) {
  if (state.busy) return;
  state.busy = { id, provider: "flatpak", action: "rollback", name: id };
  showActivity(`${id} · “${label}” kaydına dönülüyor…`);
  try {
    const outcome = await invoke("rollback_flatpak_app", { id, commit });
    if (!outcome?.success) throw new Error(outcome?.message || "Sürüm değiştirilemedi.");
    recordActivity({
      action: "rollback",
      app: { id, provider: "flatpak", name: id },
      ok: true,
      message: outcome.message || "",
    });
    toast(outcome.message || "Sürüm değiştirildi.", "success");
    if (state.installedLoaded) await loadInstalled(true, true);
    if (state.detail?.app?.id === id) await loadDetail(id, "flatpak", true);
  } catch (err) {
    recordActivity({
      action: "rollback",
      app: { id, provider: "flatpak", name: id },
      ok: false,
      message: errText(err),
    });
    toast(errText(err), "error");
  } finally {
    state.busy = null;
    hideActivity();
    renderRoute();
  }
}

async function setAppMask(id, masked) {
  if (state.busy) return;
  state.busy = { id, provider: "flatpak", action: masked ? "mask" : "unmask", name: id };
  showActivity(`${id} · ${masked ? "güncellemeler durduruluyor" : "güncellemeler sürdürülüyor"}…`);
  try {
    const outcome = await invoke("set_app_mask", { id, masked });
    if (!outcome?.success) throw new Error(outcome?.message || "İşlem tamamlanamadı.");
    recordActivity({
      action: masked ? "mask" : "unmask",
      app: { id, provider: "flatpak", name: id },
      ok: true,
      message: outcome.message || "",
    });
    toast(outcome.message || "İşlem tamamlandı.", "success");
    if (state.installedLoaded) await loadInstalled(true, true);
    if (state.detail?.app?.id === id) await loadDetail(id, "flatpak", true);
  } catch (err) {
    toast(errText(err), "error");
  } finally {
    state.busy = null;
    hideActivity();
    renderRoute();
  }
}

async function switchSnapChannel(id, channel) {
  if (state.busy) return;
  state.busy = { id, provider: "snap", action: "channel", name: id };
  showActivity(`${id} · ${channel} kanalına geçiriliyor…`);
  try {
    const outcome = await invoke("switch_snap_channel", { id, channel });
    if (!outcome?.success) throw new Error(outcome?.message || "Kanal değiştirilemedi.");
    recordActivity({ action: "channel", app: { id, provider: "snap", name: id }, ok: true, message: outcome.message || "" });
    toast(outcome.message || "Kanal değiştirildi.", "success");
    if (state.detail?.app?.id === id) await loadDetail(id, "snap", true);
    if (state.installedLoaded) await loadInstalled(true, true);
  } catch (err) {
    recordActivity({ action: "channel", app: { id, provider: "snap", name: id }, ok: false, message: errText(err) });
    toast(errText(err), "error");
  } finally {
    state.busy = null;
    hideActivity();
    renderRoute();
  }
}

async function runPruneRuntimes() {
  if (state.busy) return;
  state.busy = { id: "", provider: "flatpak", action: "prune", name: "Çalışma zamanları" };
  showActivity("Kullanılmayan çalışma zamanları temizleniyor…");
  renderSettings();
  try {
    const outcome = await invoke("prune_unused_runtimes");
    if (!outcome?.success) throw new Error(outcome?.message || "Temizlik tamamlanamadı.");
    state.libraryUsage = null;
    recordActivity({ action: "prune", name: "Çalışma zamanları", ok: true, message: outcome.message || "" });
    toast(outcome.message || "Temizlik tamamlandı.", "success");
    if (state.installedLoaded) await loadInstalled(true, true);
  } catch (err) {
    recordActivity({ action: "prune", name: "Çalışma zamanları", ok: false, message: errText(err) });
    toast(errText(err), "error");
  } finally {
    state.busy = null;
    hideActivity();
    if (state.route.name === "settings") renderSettings();
    else renderRoute();
  }
}

async function performAction(action, app) {
  if (!app || state.busy || !ACTIONS[action]) return;
  const provider = appProvider(app);
  state.busy = { id: app.id, provider, action, name: app.name || app.id };
  showActivity(`${app.name || app.id} · ${providerManagerLabel(app)} ${ACTIONS[action].verb}…`);
  renderRoute();

  try {
    const outcome = await invoke(`${action}_app`, { id: app.id, provider });
    if (outcome && outcome.success === false) {
      throw new Error(outcome.message || "İşlem başarısız oldu.");
    }
    applyAction(action, provider, app.id);
    recordActivity({ action, app, ok: true, message: outcome?.message || "" });
    toast(outcome?.message || ACTIONS[action].done, "success");
  } catch (err) {
    recordActivity({ action, app, ok: false, message: errText(err) });
    toast(errText(err), "error");
    openLogModal();
  } finally {
    state.busy = null;
    hideActivity(900);
    renderRoute();
    loadInstalled(true, true);
  }
}

function askUpdateAll() {
  if (state.busy || state.batch) return;
  const provider = state.installedProvider;
  const targets = state.installed.filter(app => app.updateAvailable && providerMatches(app, provider));
  if (!targets.length) return;
  const providerText = provider === "all" ? "tüm sağlayıcılarda" : `${providerName(provider)} sağlayıcısında`;
  const breakdown = providerCounts(targets);
  const breakdownText = breakdown
    ? PROVIDER_FILTERS
      .filter(option => option.value !== "all" && breakdown[option.value] > 0)
      .map(option => `${breakdown[option.value]} ${option.label}`)
      .join(" · ")
    : "";
  askConfirm({
    title: "Tümünü güncelle",
    text: `${providerText} ${targets.length} uygulama sırayla güncellenecek${breakdownText ? ` (${breakdownText})` : ""}. İşlem sırasında uygulamalar yeniden başlatılabilir.`,
    label: "Güncelle",
    onConfirm: () => runBatchAction("update", targets),
  });
}

function askRemoveSelected() {
  if (state.busy || state.batch) return;
  const targets = selectedInstalledApps();
  if (!targets.length) return;
  askConfirm({
    title: "Seçilenleri kaldır",
    text: `${targets.length} uygulama sırayla kaldırılacak. Bu işlem geri alınamaz.`,
    label: "Kaldır",
    onConfirm: () => runBatchAction("remove", targets),
  });
}

async function runBatchAction(action, targets) {
  if (!ACTIONS[action] || state.busy || state.batch || !targets.length) return;
  const batch = { action, total: targets.length, done: 0, failed: 0, cancel: false, canceled: false };
  state.batch = batch;
  renderRoute();

  for (const app of targets) {
    if (batch.cancel) {
      batch.canceled = true;
      break;
    }
    const appProviderName = appProvider(app);
    state.busy = { id: app.id, provider: appProviderName, action, name: app.name || app.id };
    showActivity(`${app.name || app.id} · ${providerManagerLabel(app)} ${ACTIONS[action].verb}… (${batch.done + batch.failed + 1}/${batch.total})`);
    renderRoute();

    try {
      const outcome = await invoke(`${action}_app`, { id: app.id, provider: appProviderName });
      if (outcome && outcome.success === false) {
        throw new Error(outcome.message || "İşlem başarısız oldu.");
      }
      applyAction(action, appProviderName, app.id);
      batch.done += 1;
    } catch (err) {
      batch.failed += 1;
      toast(`${app.name || app.id}: ${errText(err)}`, "error");
    }
  }

  state.busy = null;
  state.batch = null;
  hideActivity(900);

  if (action === "remove") {
    state.selection.clear();
    state.selectionMode = false;
  }

  const noun = action === "remove" ? "kaldırıldı" : "güncellendi";
  const failureNoun = action === "remove" ? "kaldırılamadı" : "güncellenemedi";
  const parts = [];
  if (batch.done) parts.push(`${batch.done} uygulama ${noun}`);
  if (batch.failed) parts.push(`${batch.failed} uygulama ${failureNoun}`);
  if (batch.canceled) parts.push("kalan işlem iptal edildi");
  const message = parts.length ? `${parts.join(", ")}.` : "İşlem tamamlanmadı.";
  recordActivity({ action, name: `${batch.total} uygulama`, ok: batch.failed === 0, message });
  toast(message, batch.failed && !batch.done ? "error" : "success");
  if (batch.failed && !batch.done) openLogModal();

  renderRoute();
  loadInstalled(true, true);
}

function askRemove(app) {
  const provider = appProvider(app);
  const explanation = provider === "flatpak"
    ? "kullanıcı kapsamındaki Flatpak kurulumundan"
    : provider === "snap"
      ? "Snap yöneticisi üzerinden sistem kapsamından"
      : "Homebrew paket yöneticisi üzerinden";
  const authorization = provider === "snap" ? " İşlem sırasında sistem yetkilendirme penceresi açılabilir." : "";
  askConfirm({
    title: "Uygulamayı kaldır",
    text: `${app.name || app.id}, ${explanation} kaldırılacak. Bu işlem geri alınamaz.${authorization}`,
    label: "Kaldır",
    onConfirm: () => performAction("remove", app),
  });
}

/* ── Etkinlik, bildirim ve günlük ─────────────────── */

function showActivity(text) {
  clearTimeout(activityTimer);
  els.activityText.textContent = text;
  els.activity.hidden = false;
}

function updateActivity(text) {
  if (state.busy) els.activityText.textContent = text;
}

function hideActivity(delay = 900) {
  clearTimeout(activityTimer);
  activityTimer = setTimeout(() => {
    if (!state.busy) els.activity.hidden = true;
  }, delay);
}

function toast(message, kind = "info") {
  const seq = ++toastSeq;
  clearTimeout(toastTimer);
  els.toastText.textContent = message;
  els.toast.className = `toast is-${kind}`;
  els.toast.hidden = false;
  requestAnimationFrame(() => {
    if (seq === toastSeq) els.toast.classList.add("is-visible");
  });
  toastTimer = setTimeout(() => {
    if (seq !== toastSeq) return;
    els.toast.classList.remove("is-visible");
    window.setTimeout(() => {
      if (seq === toastSeq) els.toast.hidden = true;
    }, 170);
  }, kind === "error" ? 6000 : 3200);
}

function logLineNode(entry) {
  const row = document.createElement("div");
  const kind = ["cmd", "stderr", "error", "info", "stdout"].includes(entry.kind) ? entry.kind : "stdout";
  row.className = `log-line log-${kind}`;

  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = entry.time;

  const text = document.createElement("span");
  text.className = "log-text";
  text.textContent = entry.line;

  row.append(time, text);
  return row;
}

function scrollLogToEnd() {
  els.logOutput.scrollTop = els.logOutput.scrollHeight;
}

function updateLogCount() {
  els.logCount.textContent = `${state.logs.length} satır`;
}

function renderLog() {
  els.logOutput.innerHTML = "";
  if (!state.logs.length) {
    const empty = document.createElement("div");
    empty.className = "log-empty";
    empty.textContent = "Henüz kayıt yok.";
    els.logOutput.appendChild(empty);
  } else {
    const fragment = document.createDocumentFragment();
    state.logs.forEach(entry => fragment.appendChild(logLineNode(entry)));
    els.logOutput.appendChild(fragment);
  }
  updateLogCount();
}

function appendLog(payload) {
  const line = String(payload?.line ?? "").trimEnd();
  if (!line) return;

  const entry = {
    line,
    kind: String(payload?.kind || "stdout"),
    time: new Date().toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
  };

  state.logs.push(entry);
  if (state.logs.length > 600) state.logs.splice(0, state.logs.length - 600);

  if (openModalEl === els.logModal) {
    const empty = els.logOutput.querySelector(".log-empty");
    if (empty) empty.remove();
    els.logOutput.appendChild(logLineNode(entry));
    scrollLogToEnd();
    updateLogCount();
  }

  if (state.busy) {
    const short = line.length > 90 ? `${line.slice(0, 89)}…` : line;
    if (entry.kind === "stderr" || entry.kind === "error") updateActivity(short);
  }
}

function openLogModal() {
  renderLog();
  openModal(els.logModal);
  requestAnimationFrame(scrollLogToEnd);
}

/* ── Modallar ve görsel görüntüleyici ─────────────── */

function openModal(modal) {
  if (!modal) return;
  if (openModalEl && openModalEl !== modal) closeModal(openModalEl);
  openModalEl = modal;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => modal.classList.add("is-open"));
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove("is-open");
  window.setTimeout(() => {
    if (!modal.classList.contains("is-open")) modal.hidden = true;
  }, 150);
  if (openModalEl === modal) openModalEl = null;
  if (!openModalEl) document.body.classList.remove("modal-open");
}

function askConfirm({ title, text, label = "Devam et", onConfirm }) {
  state.pendingConfirm = typeof onConfirm === "function" ? onConfirm : null;
  els.confirmTitle.textContent = title;
  els.confirmText.textContent = text;
  els.confirmAccept.textContent = label;
  openModal(els.confirmModal);
}

function renderLightbox() {
  const gallery = state.gallery;
  if (!gallery) return;
  const item = gallery.items[gallery.index];
  if (!item) return;
  const source = imageUrl(item.url);
  els.lightboxImage.src = source || FALLBACK_ICON;
  els.lightboxImage.alt = item.caption || "Uygulama ekran görüntüsü";
  els.lightboxCaption.textContent = item.caption || "";
  const multiple = gallery.items.length > 1;
  $("[data-lightbox-prev]").hidden = !multiple;
  $("[data-lightbox-next]").hidden = !multiple;
}

function openLightbox(index) {
  const items = state.detail?.screenshots || [];
  if (!items.length) return;
  state.gallery = { items, index: Math.max(0, Math.min(items.length - 1, index)) };
  els.lightbox.hidden = false;
  renderLightbox();
}

function stepLightbox(delta) {
  if (!state.gallery) return;
  const length = state.gallery.items.length;
  if (length < 2) return;
  state.gallery.index = (state.gallery.index + delta + length) % length;
  renderLightbox();
}

function closeLightbox() {
  els.lightbox.hidden = true;
  state.gallery = null;
  els.lightboxImage.removeAttribute("src");
  els.lightboxCaption.textContent = "";
}

/* ── Olaylar ───────────────────────────────────────── */

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches("input, textarea, select, [contenteditable='true']");
}

async function addRemoteFromForm(form) {
  const name = String($("#repoName")?.value || "").trim();
  const url = String($("#repoUrl")?.value || "").trim();
  const submit = $("#repoSubmit");

  if (!name || !url) {
    toast("Depo adı ve adresi gerekli.", "error");
    return;
  }
  if (state.busy) return;

  state.busy = { id: `remote:${name}`, action: "install", name };
  showActivity(`${name} deposu ekleniyor…`);
  if (submit) {
    submit.disabled = true;
    submit.innerHTML = '<span class="spinner"></span>Ekleniyor…';
  }

  try {
    const message = await invoke("add_flatpak_remote", { name, url });
    form.reset();
    toast(message || "Depo eklendi.", "success");
    await loadRemotes(true);
  } catch (err) {
    toast(errText(err), "error");
  } finally {
    state.busy = null;
    hideActivity(900);
    const currentSubmit = $("#repoSubmit");
    if (currentSubmit) {
      currentSubmit.disabled = false;
      currentSubmit.textContent = "Depo ekle";
    }
  }
}

function bindEvents() {
  els.searchInput.addEventListener("input", () => {
    const value = els.searchInput.value.trim();
    els.searchClear.hidden = !els.searchInput.value;
    cancelPendingSearch();
    state.searchSeq += 1;
    renderSearchHistory();

    if (!value) {
      resetSearch({ goDiscover: state.route.name === "search" });
      return;
    }

    searchTimer = setTimeout(() => runSearch(value), 380);
  });

  els.searchInput.addEventListener("focus", () => renderSearchHistory());
  els.searchInput.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (document.activeElement !== els.searchInput) hideSearchHistory();
    }, 120);
  });

  els.searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      cancelPendingSearch();
      runSearch(els.searchInput.value, { remember: true });
      hideSearchHistory();
    } else if (event.key === "Escape") {
      hideSearchHistory();
    }
  });

  const activateHistoryChip = button => {
    els.searchInput.value = button.dataset.historyQuery || "";
    els.searchClear.hidden = !els.searchInput.value;
    hideSearchHistory();
    runSearch(els.searchInput.value, { remember: true });
  };

  els.searchHistory.addEventListener("mousedown", event => {
    const button = event.target instanceof Element ? event.target.closest("[data-history-query]") : null;
    if (!button) return;
    event.preventDefault();
    activateHistoryChip(button);
  });

  els.searchHistory.addEventListener("click", event => {
    if (event.detail !== 0) return;
    const button = event.target instanceof Element ? event.target.closest("[data-history-query]") : null;
    if (button) activateHistoryChip(button);
  });

  els.searchClear.addEventListener("click", () => resetSearch({ goDiscover: true, focus: true }));

  document.addEventListener("submit", event => {
    const form = event.target instanceof Element ? event.target.closest("[data-tap-form]") : null;
    if (!form) return;
    event.preventDefault();
    const field = form.querySelector("input[name=\"tap\"]");
    const name = String(field?.value || "").trim();
    if (!name) return;
    form.reset();
    runBrewTap("add", name);
  });

  document.addEventListener("input", event => {
    const input = event.target instanceof Element ? event.target.closest("[data-installed-search]") : null;
    if (!input || state.route.name !== "installed") return;
    state.installedQuery = input.value;
    state.installedVisibleCount = INSTALLED_PAGE_SIZE;
    clearTimeout(installedSearchTimer);
    installedSearchTimer = setTimeout(() => {
      renderInstalled();
      const next = $("[data-installed-search]");
      if (next) {
        next.focus();
        next.setSelectionRange(next.value.length, next.value.length);
      }
    }, 120);
  });
  els.backButton.addEventListener("click", goBack);
  els.refreshButton.addEventListener("click", refreshCurrent);
  els.logButton.addEventListener("click", openLogModal);
  els.shortcutsButton.addEventListener("click", () => openModal(els.shortcutsModal));
  els.cliCopyAll.addEventListener("click", () => {
    const all = (state.cliCommands || []).map(item => `${item.label}: ${item.command}`).join("\n");
    copyCommand(all);
  });
  els.activityLog.addEventListener("click", openLogModal);

  els.logClear.addEventListener("click", () => {
    state.logs = [];
    renderLog();
  });

  els.setupClose.addEventListener("click", closeSetupModal);

  els.confirmAccept.addEventListener("click", () => {
    const callback = state.pendingConfirm;
    state.pendingConfirm = null;
    closeModal(els.confirmModal);
    if (callback) callback();
  });

  document.addEventListener("submit", event => {
    if (event.target?.id !== "repoForm") return;
    event.preventDefault();
    addRemoteFromForm(event.target);
  });

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const openSetup = target.closest("[data-open-setup]");
    if (openSetup) {
      openSetupModal();
      return;
    }

    const setupInstall = target.closest("[data-setup-install]");
    if (setupInstall && !setupInstall.disabled) {
      runSetupInstall();
      return;
    }

    const setupRefresh = target.closest("[data-setup-refresh]");
    if (setupRefresh) {
      refreshSetupStatus();
      return;
    }

    const setupFinish = target.closest("[data-setup-finish]");
    if (setupFinish) {
      finishSetup();
      return;
    }

    const setupCloseAction = target.closest("[data-setup-close]");
    if (setupCloseAction) {
      closeSetupModal();
      return;
    }

    const copyTarget = target.closest("[data-copy-command]");
    if (copyTarget) {
      copyCommand(copyTarget.dataset.copyCommand);
      return;
    }

    const favoriteButton = target.closest("[data-favorite]");
    if (favoriteButton) {
      const id = favoriteButton.dataset.id;
      const provider = favoriteButton.dataset.provider || "flatpak";
      const app = findKnownApp(provider, id);
      if (app) toggleFavorite(app);
      return;
    }

    const clearFavorites = target.closest("[data-clear-favorites]");
    if (clearFavorites) {
      askConfirm({
        title: "Favorileri temizle",
        text: "Kaydedilen tüm favori uygulamalar listeden kaldırılacak. Yüklü uygulamalar etkilenmez.",
        label: "Temizle",
        onConfirm: () => {
          state.favorites = [];
          saveStoredApps(FAVORITES_KEY, state.favorites);
          renderChrome();
          renderFavorites();
          toast("Favoriler temizlendi.", "success");
        },
      });
      return;
    }

    const clearRecents = target.closest("[data-clear-recents]");
    if (clearRecents) {
      state.recents = [];
      saveStoredApps(RECENTS_KEY, state.recents);
      renderDiscover();
      toast("Son görüntülenenler temizlendi.", "info");
      return;
    }
    const providerFilter = target.closest("[data-provider-filter]");
    if (providerFilter) {
      const scope = providerFilter.dataset.providerFilter;
      const provider = providerFilter.dataset.provider;
      if (!PROVIDER_FILTERS.some(option => option.value === provider)) return;
      if (scope === "search") {
        state.searchProvider = provider;
        renderSearch();
      } else if (scope === "installed") {
        state.installedProvider = provider;
        state.installedVisibleCount = INSTALLED_PAGE_SIZE;
        saveLibraryPrefs();
        renderInstalled();
      }
      return;
    }

    const selectionToggle = target.closest("[data-selection-toggle]");
    if (selectionToggle) {
      state.selectionMode = !state.selectionMode;
      if (!state.selectionMode) state.selection.clear();
      renderInstalled();
      return;
    }

    const batchCancel = target.closest("[data-batch-cancel]");
    if (batchCancel && state.batch && !state.batch.cancel) {
      state.batch.cancel = true;
      batchCancel.disabled = true;
      batchCancel.textContent = "İptal ediliyor…";
      toast("Mevcut işlem bitince duracak.", "info");
      return;
    }

    const selectAll = target.closest("[data-select-all]");
    if (selectAll) {
      installedScopedApps().forEach(app => state.selection.add(selectionKey(appProvider(app), app.id)));
      renderInstalled();
      return;
    }

    const copySelected = target.closest("[data-copy-selected]");
    if (copySelected && !copySelected.disabled) {
      const lines = selectedInstalledApps().map(app => `${app.name || app.id} (${providerLabel(app)})`);
      copyCommand(lines.join("\n"));
      return;
    }

    const copyInstalled = target.closest("[data-copy-installed]");
    if (copyInstalled) {
      const lines = sortInstalledApps(installedScopedApps(), state.installedSort)
        .map(app => `${app.name || app.id} (${providerLabel(app)})${app.version ? ` · v${app.version}` : ""}`);
      if (!lines.length) {
        toast("Kopyalanacak uygulama yok.", "info");
        return;
      }
      copyCommand(lines.join("\n"));
      return;
    }

    const copyUpdates = target.closest("[data-copy-updates]");
    if (copyUpdates) {
      const lines = state.installed
        .filter(app => app.updateAvailable && providerMatches(app, state.installedProvider))
        .map(app => cliCommandsFor(app).find(item => item.label === "Güncelle")?.command || "")
        .filter(Boolean);
      if (!lines.length) {
        toast("Kopyalanacak güncelleme komutu yok.", "info");
        return;
      }
      copyCommand(lines.join("\n"));
      return;
    }

    const clearInstalledSearch = target.closest("[data-clear-installed-search]");
    if (clearInstalledSearch) {
      state.installedQuery = "";
      state.installedVisibleCount = INSTALLED_PAGE_SIZE;
      renderInstalled();
      const input = $("[data-installed-search]");
      if (input) input.focus();
      return;
    }

    const removeSelected = target.closest("[data-remove-selected]");
    if (removeSelected && !removeSelected.disabled) {
      askRemoveSelected();
      return;
    }

    const updateAll = target.closest("[data-update-all]");
    if (updateAll && !updateAll.disabled) {
      askUpdateAll();
      return;
    }

    const sortFilter = target.closest("[data-installed-sort]");
    if (sortFilter) {
      const sort = sortFilter.dataset.installedSort;
      if (!INSTALLED_SORTS.some(option => option.value === sort)) return;
      state.installedSort = sort;
      saveLibraryPrefs();
      renderInstalled();
      return;
    }


    const cliButton = target.closest("[data-cli]");
    if (cliButton) {
      const id = cliButton.dataset.id;
      const provider = cliButton.dataset.provider || "flatpak";
      const app = findKnownApp(provider, id);
      if (app) openCliModal(app);
      return;
    }

    const actionButton = target.closest("[data-action]");
    if (actionButton && !actionButton.disabled) {
      const id = actionButton.dataset.id;
      const provider = actionButton.dataset.provider || "flatpak";
      const action = actionButton.dataset.action;
      if (!id || !ACTIONS[action]) return;
      const candidates = [
        state.detail?.app,
        ...state.installed,
        ...state.searchResults,
        state.discover?.appOfDay,
        ...(state.discover?.picks || []),
        ...(state.discover?.popular || []),
        ...(state.discover?.recent || []),
        ...(state.category?.apps || []),
      ];
      const app = candidates.find(matchesApps(provider, id));
      if (!app) return;
      if (action === "remove") askRemove(app);
      else performAction(action, app);
      return;
    }

    const rollbackButton = target.closest("[data-rollback]");
    if (rollbackButton) {
      const commit = rollbackButton.dataset.rollback;
      const id = rollbackButton.dataset.id;
      const label = rollbackButton.dataset.label || commit?.slice(0, 7);
      if (!commit || !id) return;
      askConfirm({
        title: "Sürüme geri dön",
        text: `${id} paketi “${label}” kaydına sabitlenecek. Yeni sürümler otomatik gelmez.`,
        label: "Geri dön",
        onConfirm: () => rollbackApp(id, commit, label),
      });
      return;
    }

    const maskButton = target.closest("[data-mask]");
    if (maskButton) {
      const id = maskButton.dataset.id;
      const masked = maskButton.dataset.mask === "on";
      if (!id) return;
      askConfirm({
        title: masked ? "Güncellemeleri durdur" : "Güncellemeleri sürdür",
        text: masked
          ? `${id} için otomatik güncellemeler durdurulacak. Uygulama kullanılmaya devam eder.`
          : `${id} için güncellemeler yeniden etkinleştirilecek.`,
        label: masked ? "Durdur" : "Sürdür",
        onConfirm: () => setAppMask(id, masked),
      });
      return;
    }

    const removeTap = target.closest("[data-remove-tap]");
    if (removeTap) {
      const name = removeTap.dataset.removeTap;
      askConfirm({
        title: "Tap'i kaldır",
        text: `${name} tap'i Homebrew yapılandırmasından çıkarılacak.`,
        label: "Kaldır",
        onConfirm: () => runBrewTap("remove", name),
      });
      return;
    }

    const channelButton = target.closest("[data-snap-channel]");
    if (channelButton) {
      const channel = channelButton.dataset.snapChannel;
      const id = channelButton.dataset.id;
      if (!channel || !id) return;
      askConfirm({
        title: "Snap kanalını değiştir",
        text: `${id} paketi “${channel}” kanalına geçirilecek ve yenilenecek.`,
        label: "Değiştir",
        onConfirm: () => switchSnapChannel(id, channel),
      });
      return;
    }

    const pruneButton = target.closest("[data-prune-runtimes]");
    if (pruneButton && !pruneButton.disabled) {
      askConfirm({
        title: "Çalışma zamanlarını temizle",
        text: "Hiçbir uygulamanın kullanmadığı Flatpak çalışma zamanları kaldırılacak. Yüklü uygulamalar etkilenmez.",
        label: "Temizle",
        onConfirm: () => runPruneRuntimes(),
      });
      return;
    }

    const clearActivity = target.closest("[data-clear-activity]");
    if (clearActivity) {
      state.activityHistory = [];
      saveActivityHistory();
      renderSettings();
      toast("İşlem geçmişi temizlendi.", "info");
      return;
    }

    const themeChoice = target.closest("[data-theme-choice]");
    if (themeChoice) {
      const theme = themeChoice.dataset.themeChoice;
      setTheme(theme);
      if (state.route.name === "settings") renderSettings();
      toast(theme === "light" ? "Açık tema etkin." : "Koyu tema etkin.", "info");
      return;
    }

    const nav = target.closest("[data-nav]");
    if (nav) {
      const page = nav.dataset.nav;
      resetSearch();
      navigate({ name: page }, { root: true });
      if (page === "installed") loadInstalled();
      if (page === "discover") loadDiscover();
      if (page === "settings") {
        loadRemotes();
        loadBrewTaps();
      }
      if (page === "categories") updatePageTitle();
      return;
    }

    const category = target.closest("[data-category]");
    if (category) {
      const slug = category.dataset.category;
      if (!CATEGORY_MAP[slug]) return;
      els.main.scrollTop = 0;
      navigate({ name: "category", slug });
      loadCategory(slug, 1, true);
      return;
    }

    const back = target.closest("[data-back]");
    if (back) {
      goBack();
      return;
    }

    if (state.selectionMode) {
      const selectRow = target.closest("[data-select-row]");
      if (selectRow) {
        const id = selectRow.dataset.selectRow;
        const provider = selectRow.dataset.selectProvider || "flatpak";
        const app = state.installed.find(item => sameApp(item, provider, id));
        if (app) {
          toggleSelection(app);
          renderInstalled();
        }
        return;
      }
    }

    const open = target.closest("[data-open-app]");
    if (open) {
      const id = open.dataset.openApp;
      const provider = open.dataset.provider || "flatpak";
      if (!id) return;
      els.main.scrollTop = 0;
      if (state.route.name !== "detail" || state.route.id !== id || appProvider(state.route) !== provider) {
        navigate({ name: "detail", id, provider });
      }
      loadDetail(id, provider);
      return;
    }

    const permissionsRetry = target.closest("[data-permissions-retry]");
    if (permissionsRetry && state.route.name === "detail") {
      loadPermissions(state.route.id);
      return;
    }

    const retry = target.closest("[data-retry]");
    if (retry) {
      const kind = retry.dataset.retry;
      if (kind === "discover") loadDiscover(true);
      else if (kind === "search") runSearch(state.query);
      else if (kind === "installed") loadInstalled(true);
      else if (kind === "category") loadCategory(state.route.slug, 1, true);
      else if (kind === "detail") loadDetail(state.route.id, appProvider(state.route), true);
      else if (kind === "remotes") loadRemotes(true);
      else if (kind === "brew-taps") loadBrewTaps(true);
      return;
    }

    const more = target.closest("[data-load-more]");
    if (more && !more.disabled) {
      loadCategory(state.route.slug, (state.category?.page || 1) + 1);
      return;
    }
    const installedMore = target.closest("[data-installed-more]");
    if (installedMore) {
      state.installedVisibleCount += INSTALLED_PAGE_SIZE;
      renderInstalled();
      return;
    }

    const filter = target.closest("[data-updates-filter]");
    if (filter) {
      state.updatesOnly = !state.updatesOnly;
      state.installedVisibleCount = INSTALLED_PAGE_SIZE;
      renderInstalled();
      return;
    }

    const removeRemote = target.closest("[data-remove-remote]");
    if (removeRemote) {
      const name = removeRemote.dataset.removeRemote;
      const remote = state.remotes.find(item => item.name === name);
      if (!remote) return;
      askConfirm({
        title: "Depoyu kaldır",
        text: `${remote.title || remote.name} kullanıcı depolarından kaldırılacak. Bu depodan kurulan uygulamalar etkilenmez.`,
        label: "Kaldır",
        onConfirm: async () => {
          try {
            const message = await invoke("remove_flatpak_remote", { name });
            toast(message || "Depo kaldırıldı.", "success");
            await loadRemotes(true);
          } catch (err) {
            toast(errText(err), "error");
          }
        },
      });
      return;
    }

    const shot = target.closest("[data-shot]");
    if (shot) {
      openLightbox(Number(shot.dataset.shot) || 0);
      return;
    }

    if (target.closest("[data-lightbox-close]") || target === els.lightbox) {
      closeLightbox();
      return;
    }
    if (target.closest("[data-lightbox-prev]")) {
      stepLightbox(-1);
      return;
    }
    if (target.closest("[data-lightbox-next]")) {
      stepLightbox(1);
    }
  });

  document.addEventListener("keydown", event => {
    if (state.gallery) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepLightbox(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        stepLightbox(1);
      }
      return;
    }

    if (event.key === "Escape" && openModalEl) {
      event.preventDefault();
      if (openModalEl === els.setupModal && state.setup.running) return;
      if (openModalEl === els.setupModal) closeSetupModal();
      else closeModal(openModalEl);
      return;
    }

    if (event.key === "Escape" && ["detail", "category"].includes(state.route.name)) {
      event.preventDefault();
      goBack();
      return;
    }

    if (event.altKey && event.key === "ArrowLeft" && !isTypingTarget(event.target)) {
      event.preventDefault();
      goBack();
      return;
    }

    if ((event.key === "?" || event.key === "F1") && !isTypingTarget(event.target) && !openModalEl) {
      event.preventDefault();
      openModal(els.shortcutsModal);
      return;
    }

    if (event.key === "/" && !isTypingTarget(event.target)) {
      event.preventDefault();
      els.searchInput.focus();
      els.searchInput.select();
      return;
    }

    const plainKey = !event.metaKey && !event.ctrlKey && !event.altKey;
    if (plainKey && !openModalEl && !isTypingTarget(event.target)) {
      const key = event.key.toLowerCase();
      if (key === "r") {
        event.preventDefault();
        refreshCurrent();
        return;
      }
      if (key === "f" && state.route.name === "detail" && state.detail?.app) {
        event.preventDefault();
        toggleFavorite(state.detail.app);
        return;
      }
    }

    if ((event.key === "Enter" || event.key === " ") && !isTypingTarget(event.target)) {
      const focusTarget = event.target instanceof Element ? event.target : null;
      const openable = focusTarget?.closest("[data-open-app], [data-category], [data-shot]");
      if (openable) {
        event.preventDefault();
        openable.click();
      }
    }
  });

  $$("[data-close-modal]").forEach(button => {
    button.addEventListener("click", () => closeModal($(`#${button.dataset.closeModal}`)));
  });

  $$(".modal").forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target !== modal) return;
      if (modal === els.setupModal) {
        if (state.setup.running) return;
        closeSetupModal();
        return;
      }
      closeModal(modal);
    });
  });

  document.addEventListener("error", event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;

    if (img.classList.contains("app-img")) {
      if (img.dataset.fallback === "1") return;
      img.dataset.fallback = "1";
      img.classList.add("is-fallback");
      img.src = FALLBACK_ICON;
      return;
    }

    if (img.closest(".hero-media, .pick-media")) {
      const parent = img.closest(".hero-media, .pick-media");
      img.remove();
      parent.classList.add("is-placeholder");
      return;
    }

    if (img.classList.contains("shot-img")) {
      const figure = img.closest(".shot");
      if (figure) figure.classList.add("is-broken");
      img.remove();
    }
  }, true);
}

async function init() {
  loadSearchHistory();
  loadLastRefresh();
  state.favorites = readStoredApps(FAVORITES_KEY);
  state.recents = readStoredApps(RECENTS_KEY).slice(0, RECENTS_LIMIT);
  loadActivityHistory();
  loadLibraryPrefs();
  bindEvents();
  startUpdateWatch();
  setTheme(currentTheme());

  try {
    await listen("deep-link-open", event => openDeepLink(event.payload));
    await listen("app-log", event => appendLog(event.payload));
    await listen("setup-log", event => appendSetupLog(event.payload));
    await listen("tray-check-updates", () => {
      checkForUpdates();
    });
    await listen("app-finished", event => {
      if (event.payload && event.payload.success === false && !openModalEl) openLogModal();
    });
  } catch {
    /* Günlük olayları kullanılamıyorsa arayüz çalışmaya devam eder. */
  }

  loadStoreInfo();
  loadInstalled(true, true);
  loadDiscover();
  renderRoute();
  maybeOpenSetup();
  invoke("take_pending_deep_link")
    .then(target => {
      if (target) openDeepLink(target);
    })
    .catch(() => {});
}

/* ── Tarayıcı önizlemesi için sahte arka uç ────────── */
/* Tarayıcı önizlemesi yerel proxy üzerinden çalışır; Tauri içinde bu kod kullanılmaz. */
const PREVIEW_PROXY = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) ? location.origin : "";
const FLATHUB = PREVIEW_PROXY ? `${PREVIEW_PROXY}/flathub` : "https://flathub.org/api/v2";
const ODRS = PREVIEW_PROXY ? `${PREVIEW_PROXY}/odrs` : "https://odrs.gnome.org/1.0/reviews/api";

const MOCK_FALLBACK_APPS = [
  { id: "org.mozilla.firefox", name: "Firefox", developer: "Mozilla", summary: "Hızlı, gizli ve güvenli web tarayıcısı.", category: "network" },
  { id: "org.videolan.VLC", name: "VLC", developer: "VideoLAN", summary: "Çoklu ortam dosyalarını oynatın, yakalayın ve yayınlayın.", category: "audiovideo" },
  { id: "org.gimp.GIMP", name: "GIMP", developer: "GIMP Team", summary: "Görüntü oluşturma, düzenleme ve fotoğraf rötuşlama.", category: "graphics" },
  { id: "org.kde.krita", name: "Krita", developer: "KDE", summary: "Dijital resim ve illüstrasyon stüdyosu.", category: "graphics" },
  { id: "org.inkscape.Inkscape", name: "Inkscape", developer: "Inkscape Project", summary: "Vektör grafik editörü.", category: "graphics" },
  { id: "org.libreoffice.LibreOffice", name: "LibreOffice", developer: "The Document Foundation", summary: "Belgeler, elektronik tablolar ve sunumlar için ofis paketi.", category: "office" },
  { id: "org.gnome.Nautilus", name: "Dosyalar", developer: "GNOME", summary: "GNOME masaüstü için dosya yöneticisi.", category: "system" },
  { id: "org.gnome.Builder", name: "Builder", developer: "GNOME", summary: "GNOME için IDE.", category: "development" },
  { id: "com.visualstudio.code", name: "Visual Studio Code", developer: "Microsoft", summary: "Kod düzenleme ve hata ayıklama.", category: "development" },
  { id: "md.obsidian.Obsidian", name: "Obsidian", developer: "Obsidian", summary: "Yerel Markdown notları ve bilgi tabanı.", category: "office" },
  { id: "org.telegram.desktop", name: "Telegram", developer: "Telegram FZ-LLC", summary: "Hızlı ve güvenli mesajlaşma.", category: "network" },
  { id: "com.spotify.Client", name: "Spotify", developer: "Spotify", summary: "Müzik ve podcast dinleme.", category: "audiovideo" },
  { id: "re.sonny.Tangram", name: "Tangram", developer: "Sonny Piers", summary: "Web uygulamalarını tek yerde toplayın.", category: "network" },
  { id: "org.gnome.Calculator", name: "Hesap Makinesi", developer: "GNOME", summary: "Basit ve gelişmiş hesaplamalar.", category: "utility" },
];

function mockLoad(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function mockSave(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* yoksay */ }
}

const MOCK = {
  installed: new Set(mockLoad("macro-mock-installed", ["org.mozilla.firefox", "org.videolan.VLC"])),
  updates: new Set(mockLoad("macro-mock-updates", ["org.videolan.VLC"])),
  setup: mockLoad("macro-mock-setup", { flatpak: true, flathub: true }),
  remotes: mockLoad("macro-mock-remotes", [
    { name: "flathub", title: "Flathub", url: "https://dl.flathub.org/repo/", scope: "user", comment: "Flathub uygulama deposu", icon: "https://dl.flathub.org/repo/logo.svg", deletable: false },
    { name: "flathub", title: "Flathub", url: "https://dl.flathub.org/repo/", scope: "system", comment: "Flathub uygulama deposu", icon: "https://dl.flathub.org/repo/logo.svg", deletable: false },
  ]),
  appCache: new Map(),
};

if (!Array.isArray(MOCK.remotes)) MOCK.remotes = [];
if (!MOCK.setup || typeof MOCK.setup !== "object") {
  MOCK.setup = { flatpak: true, flathub: true };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function mockFetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function mockFallback(id) {
  const known = MOCK_FALLBACK_APPS.find(app => app.id === id);
  const base = known || { id, name: id, developer: "Flathub", summary: "", category: null };
  return {
    id,
    provider: "flatpak",
    name: base.name,
    summary: base.summary,
    developer: base.developer,
    version: "",
    icon: `https://dl.flathub.org/media/icons/128x128/${id}.png`,
    installed: MOCK.installed.has(id),
    updateAvailable: MOCK.updates.has(id),
    category: base.category,
    monthlyInstalls: null,
    heroImage: null,
  };
}

function mockCategoryFromAppstream(categories) {
  const aliases = {
    audiovideo: "audiovideo", audio: "audiovideo", video: "audiovideo", player: "audiovideo",
    development: "development", ide: "development",
    education: "education",
    healthfitness: "healthfitness",
    game: "game",
    graphics: "graphics", photography: "graphics", "2dgraphics": "graphics", "3dgraphics": "graphics", vectorgraphics: "graphics",
    network: "network", webbrowser: "network", email: "network", chat: "network", filetransfer: "network",
    office: "office", spreadsheet: "office", wordprocessor: "office", presentation: "office",
    science: "science",
    system: "system", settings: "system", filemanager: "system", terminalemulator: "system",
    utility: "utility", archiving: "utility", calculator: "utility", texteditor: "utility",
  };
  for (const value of categories || []) {
    const slug = aliases[String(value).toLowerCase()];
    if (slug) return slug;
  }
  return null;
}

function mockScreenshots(appstream) {
  return (appstream?.screenshots || []).map(screenshot => {
    const sizes = (screenshot.sizes || [])
      .filter(size => String(size.src || "").startsWith("https://dl.flathub.org/"))
      .sort((a, b) => (parseInt(b.width, 10) || 0) - (parseInt(a.width, 10) || 0));
    if (!sizes.length) return null;
    return { url: sizes[0].src, caption: screenshot.caption || null };
  }).filter(Boolean);
}

function mockAppFromAppstream(appstream) {
  const screenshots = mockScreenshots(appstream);
  const version = appstream.releases?.[0]?.version || "";
  const categories = appstream.categories || [];
  return {
    id: appstream.id,
    provider: "flatpak",
    name: appstream.name || appstream.id,
    summary: appstream.summary || "",
    developer: appstream.developer_name || "",
    version,
    icon: appstream.icon || `https://dl.flathub.org/media/icons/128x128/${appstream.id}.png`,
    installed: MOCK.installed.has(appstream.id),
    updateAvailable: MOCK.updates.has(appstream.id),
    category: mockCategoryFromAppstream(categories),
    monthlyInstalls: null,
    heroImage: screenshots[0]?.url || null,
  };
}

function mockReleaseItems(appstream) {
  const releases = Array.isArray(appstream?.releases) ? appstream.releases : [];
  return releases
    .filter(release => String(release?.version || "").trim())
    .slice(0, 8)
    .map(release => {
      const raw = release.timestamp;
      const parsed = typeof raw === "number" ? raw : Number(String(raw || "").trim());
      return {
        version: String(release.version).trim(),
        date: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
      };
    });
}

async function mockAppstream(id) {
  if (MOCK.appCache.has(id)) return MOCK.appCache.get(id);
  const appstream = await mockFetchJson(`${FLATHUB}/appstream/${encodeURIComponent(id)}`);
  const entry = { appstream, app: mockAppFromAppstream(appstream) };
  MOCK.appCache.set(id, entry);
  return entry;
}

function mockApiApp(hit) {
  const id = hit.app_id || hit.id || "";
  return {
    provider: "flatpak",
    id,
    name: hit.name || id,
    summary: hit.summary || "",
    developer: hit.developer_name || "",
    version: hit.version || "",
    icon: hit.icon || `https://dl.flathub.org/media/icons/128x128/${id}.png`,
    installed: MOCK.installed.has(id),
    updateAvailable: MOCK.updates.has(id),
    category: normalizeCategory(hit.main_categories) || mockCategoryFromAppstream(hit.categories),
    monthlyInstalls: hit.installs_last_month || null,
    heroImage: hit.hero_image || null,
  };
}

function mockFallbackList(limit = 14) {
  return MOCK_FALLBACK_APPS.slice(0, limit).map(app => mockFallback(app.id));
}

async function mockDiscover(date) {
  const [day, week, popularData, recentData] = await Promise.all([
    mockFetchJson(`${FLATHUB}/app-picks/app-of-the-day/${date}`).catch(() => null),
    mockFetchJson(`${FLATHUB}/app-picks/apps-of-the-week/${date}`).catch(() => null),
    mockFetchJson(`${FLATHUB}/collection/popular?page=1&per_page=12&locale=tr`).catch(() => null),
    mockFetchJson(`${FLATHUB}/collection/recently-added?page=1&per_page=8&locale=tr`).catch(() => null),
  ]);

  const weekIds = (week?.apps || []).map(item => item.app_id).filter(Boolean);
  const dayId = day?.app_id || "";
  const ids = [...new Set([dayId, ...weekIds].filter(Boolean))];
  const featured = (await Promise.all(ids.map(id => mockAppstream(id).then(entry => entry.app).catch(() => null))))
    .filter(Boolean);

  let popular = (popularData?.hits || []).map(mockApiApp);
  let recent = (recentData?.hits || []).map(mockApiApp);
  if (!popular.length) popular = mockFallbackList(12);
  if (!recent.length) recent = mockFallbackList(8);

  const appOfDay = featured.find(app => app.id === dayId) || featured[0] || popular[0] || null;
  let picks = featured.filter(app => app.id !== appOfDay?.id).slice(0, 5);
  if (!picks.length) picks = popular.slice(0, 5);

  return { date, appOfDay, picks, popular, recent };
}

async function mockSearch(query) {
  const needle = String(query || "").trim().toLocaleLowerCase("tr");
  if (needle.length < 2) {
    throw new Error("Arama için en az 2 karakter yazın.");
  }
  try {
    const data = await mockFetchJson(`${FLATHUB}/search?locale=tr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, hits_per_page: 36, page: 1 }),
    });
    flathubApps = (data.hits || []).map(mockApiApp);
  } catch {
    flathubApps = mockFallbackList().filter(app =>
      `${app.name} ${app.summary} ${app.id}`.toLocaleLowerCase("tr").includes(needle),
    );
  }
  const snapSample = [
    { id: "vlc", provider: "snap", packageType: "snap", name: "VLC", summary: "VLC media player", developer: "VideoLAN", version: "3.0.21", icon: null, installed: false, updateAvailable: false, pinned: false, channel: "latest/stable", category: "audiovideo", monthlyInstalls: null, heroImage: null },
    { id: "firefox", provider: "snap", packageType: "snap", name: "Firefox", summary: "Mozilla Firefox web browser", developer: "Mozilla", version: "132.0", icon: null, installed: false, updateAvailable: false, pinned: false, channel: "latest/stable", category: "network", monthlyInstalls: null, heroImage: null },
    { id: "code", provider: "snap", packageType: "snap", name: "Visual Studio Code", summary: "Code editing. Redefined.", developer: "Microsoft", version: "1.95.0", icon: null, installed: false, updateAvailable: false, pinned: false, channel: "latest/stable", category: "development", monthlyInstalls: null, heroImage: null },
  ].filter(app => `${app.name} ${app.summary} ${app.id}`.toLocaleLowerCase("tr").includes(needle));

  const brewSample = [
    { id: "formula/ripgrep", provider: "brew", packageType: "formula", name: "ripgrep", summary: "Fast regex line-oriented search tool", developer: "BurntSushi", version: "14.1.1", icon: null, installed: false, updateAvailable: false, pinned: false, channel: null, category: "utility", monthlyInstalls: null, heroImage: null },
    { id: "formula/git", provider: "brew", packageType: "formula", name: "git", summary: "Distributed revision control system", developer: "Git Community", version: "2.47.0", icon: null, installed: false, updateAvailable: false, pinned: false, channel: null, category: "development", monthlyInstalls: null, heroImage: null },
    { id: "cask/firefox", provider: "brew", packageType: "cask", name: "firefox", summary: "Web browser", developer: "Mozilla", version: "132.0", icon: null, installed: false, updateAvailable: false, pinned: false, channel: null, category: "network", monthlyInstalls: null, heroImage: null },
  ].filter(app => `${app.name} ${app.summary} ${app.id}`.toLocaleLowerCase("tr").includes(needle));

  return [...flathubApps, ...snapSample, ...brewSample];
}

async function mockCategory(slug, page = 1) {
  try {
    const data = await mockFetchJson(`${FLATHUB}/collection/category/${encodeURIComponent(slug)}?page=${page}&per_page=24&locale=tr`);
    return {
      slug,
      page: Number(data.page) || page,
      total: Number(data.totalHits) || (data.hits || []).length,
      totalPages: Number(data.totalPages) || 1,
      apps: (data.hits || []).map(mockApiApp),
    };
  } catch {
    const apps = mockFallbackList().filter(app => app.category === slug);
    return { slug, page: 1, total: apps.length, totalPages: 1, apps };
  }
}

function mockRatings(id) {
  const seed = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
  const total = 420 + (seed % 1900);
  const weights = [0.07, 0.06, 0.1, 0.22, 0.55];
  const stars = weights.map(weight => Math.max(1, Math.round(total * weight)));
  const sum = stars.reduce((acc, value) => acc + value, 0);
  const weighted = stars.reduce((acc, value, index) => acc + value * (index + 1), 0);
  return {
    average: weighted / sum,
    total: sum,
    stars,
  };
}

function mockReviews(app) {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      author: "Deniz",
      rating: 5,
      date: now - 86400 * 6,
      summary: "Günlük kullanımda çok akıcı",
      text: `${app.name} uzun süredir kullandığım uygulamalardan biri. Arayüzü sade, açılışı hızlı ve Flatpak kurulumu sorunsuz tamamlandı.`,
      locale: "tr_TR.UTF-8",
      version: app.version || "stable",
    },
    {
      author: "Mert",
      rating: 4,
      date: now - 86400 * 19,
      summary: "Beklentimi karşıladı",
      text: "İşimi görüyor. Birkaç küçük eksik olsa da güncellemelerle düzenli olarak iyileşiyor. Yeni başlayanlar için öneririm.",
      locale: "tr_TR",
      version: app.version || "stable",
    },
  ];
}

async function mockDetail(id, provider = "flatpak") {
  if (provider === "snap") {
    const installed = state.installed.find(app => sameApp(app, "snap", id));
    const app = installed || {
      id,
      provider: "snap",
      packageType: "snap",
      name: id,
      summary: "Snap Store paketi.",
      developer: "Snapcraft",
      version: "1.0",
      icon: null,
      installed: false,
      updateAvailable: false,
      pinned: false,
      channel: "latest/stable",
      category: "utilities",
      monthlyInstalls: null,
      heroImage: null,
    };
    return {
      app,
      description: `${app.name}, Snap Store üzerinden dağıtılan ve sistem genelinde izole sandbox ortamında çalışan bir pakettir.`,
      screenshots: [],
      categories: ["utilities"],
      license: "Proprietary / Open Source",
      verified: true,
      homepage: `https://snapcraft.io/${encodeURIComponent(id)}`,
      downloadSize: 45 * 1024 * 1024,
      installedSize: 120 * 1024 * 1024,
      installsLastMonth: null,
      rating: null,
      reviews: [],
      releases: [],
    };
  }

  if (provider === "brew") {
    const installed = state.installed.find(app => sameApp(app, "brew", id));
    const token = id.replace(/^(formula|cask)\//, "");
    const isCask = id.startsWith("cask/");
    const app = installed || {
      id,
      provider: "brew",
      packageType: isCask ? "cask" : "formula",
      name: token,
      summary: `Homebrew ${isCask ? "cask" : "formula"} paketi.`,
      developer: "Homebrew",
      version: "1.0",
      icon: null,
      installed: false,
      updateAvailable: false,
      pinned: false,
      channel: null,
      category: "utilities",
      monthlyInstalls: null,
      heroImage: null,
    };
    return {
      app,
      description: `${app.name}, Linux Homebrew ile kurulan bir ${isCask ? "cask grafik arayüz uygulamasıdır" : "komut satırı veya sistem aracıdır"}.`,
      screenshots: [],
      categories: ["utilities"],
      license: "MIT",
      verified: false,
      homepage: `https://formulae.brew.sh/${encodeURIComponent(id)}`,
      downloadSize: null,
      installedSize: null,
      installsLastMonth: null,
      rating: null,
      reviews: [],
      releases: [],
    };
  }
  const { appstream } = await mockAppstream(id);
  const screenshots = mockScreenshots(appstream);
  const app = mockAppFromAppstream(appstream);
  app.heroImage = screenshots[0]?.url || null;

  const [summary, stats, ratings, rawReviews] = await Promise.all([
    mockFetchJson(`${FLATHUB}/summary/${encodeURIComponent(id)}`).catch(() => null),
    mockFetchJson(`${FLATHUB}/stats/${encodeURIComponent(id)}`).catch(() => null),
    mockFetchJson(`${ODRS}/ratings/${encodeURIComponent(id)}`).catch(() => null),
    mockFetchJson(`${ODRS}/app/${encodeURIComponent(id)}`).catch(() => null),
  ]);

  if (stats?.installs_last_month) app.monthlyInstalls = stats.installs_last_month;

  let rating = null;
  if (ratings && Number(ratings.total) > 0) {
    const stars = [ratings.star1, ratings.star2, ratings.star3, ratings.star4, ratings.star5].map(Number);
    const total = stars.reduce((acc, value) => acc + value, 0);
    const weighted = stars.reduce((acc, value, index) => acc + value * (index + 1), 0);
    if (total) rating = { average: weighted / total, total, stars };
  }
  if (!rating) rating = mockRatings(id);

  let reviews = [];
  if (Array.isArray(rawReviews)) {
    reviews = rawReviews
      .filter(review =>
        String(review.app_id || "").toLowerCase() === id.toLowerCase()
        && Number(review.reported || 0) === 0
        && Number(review.rating || 0) > 0
        && String(review.description || "").trim(),
      )
      .slice(0, 8)
      .map(review => ({
        author: String(review.user_display || "Anonim").trim(),
        rating: Math.max(1, Math.min(5, Math.round(Number(review.rating || 0) / 20))),
        date: Math.round(Number(review.date_created || 0)),
        summary: String(review.summary || "").trim(),
        text: String(review.description || "").trim(),
        locale: String(review.locale || ""),
        version: String(review.version || ""),
      }));
  }
  if (!reviews.length) reviews = mockReviews(app);

  const categories = [];
  if (app.category) categories.push(app.category);
  const mapped = mockCategoryFromAppstream(appstream.categories || []);
  if (mapped && !categories.includes(mapped)) categories.push(mapped);

  return {
    app,
    description: appstream.description || "",
    screenshots,
    categories,
    license: appstream.project_license || "",
    verified: Boolean(appstream.metadata?.["flathub::verification::verified"]),
    homepage: appstream.urls?.homepage || null,
    downloadSize: summary?.download_size || null,
    installedSize: summary?.installed_size || null,
    installsLastMonth: stats?.installs_last_month || null,
    rating,
    reviews,
    releases: mockReleaseItems(appstream),
  };
}

async function mockInstalledApps() {
  const apps = await Promise.all([...MOCK.installed].map(id =>
    mockAppstream(id).then(entry => entry.app).catch(() => mockFallback(id)),
  ));
  return apps
    .map(app => ({
      ...app,
      installed: true,
      updateAvailable: MOCK.updates.has(app.id),
    }))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "tr", { sensitivity: "base" }));
}
function mockAddRemote(name, url) {
  const cleanName = String(name || "").trim();
  const cleanUrl = String(url || "").trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(cleanName) || cleanName.startsWith("-")) {
    throw new Error("Depo adı yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir.");
  }
  let parsed;
  try { parsed = new URL(cleanUrl); } catch { throw new Error("Depo adresi geçerli değil."); }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("Depo adresi geçerli bir http(s) adresi olmalı.");
  }
  if (MOCK.remotes.some(remote => remote.name === cleanName && remote.scope === "user")) {
    throw new Error("Bu adda bir kullanıcı deposu zaten var.");
  }
  MOCK.remotes.push({
    name: cleanName,
    title: cleanName,
    url: cleanUrl,
    scope: "user",
    comment: "Özel Flatpak deposu",
    icon: null,
    deletable: true,
  });
  mockSave("macro-mock-remotes", MOCK.remotes);
  return `${cleanName} deposu eklendi.`;
}

function mockRemoveRemote(name) {
  if (name === "flathub") throw new Error("Flathub deposu kaldırılamaz.");
  const before = MOCK.remotes.length;
  MOCK.remotes = MOCK.remotes.filter(remote => !(remote.name === name && remote.scope === "user"));
  if (MOCK.remotes.length === before) throw new Error("Depo bulunamadı.");
  mockSave("macro-mock-remotes", MOCK.remotes);
  return `${name} deposu kaldırıldı.`;
}

async function mockOperation(action, id, provider = "flatpak") {
  if (provider !== "flatpak") {
    throw new Error("Tarayıcı demosunda bu sağlayıcı için örnek uygulama yok.");
  }
  if (!ACTIONS[action]) throw new Error("Bilinmeyen işlem.");
  if (action !== "install" && !MOCK.installed.has(id)) {
    throw new Error("Bu Flatpak uygulaması kullanıcı kurulumunda yüklü değil.");
  }

  const cached = MOCK.appCache.get(id)?.app;
  const name = cached?.name || MOCK_FALLBACK_APPS.find(app => app.id === id)?.name || id;
  const command = action === "install"
    ? `flatpak install --user -y flathub ${id}`
    : action === "remove"
      ? `flatpak uninstall --user -y ${id}`
      : `flatpak update --user -y ${id}`;

  emitMock("app-log", { line: `Komut: ${command}`, kind: "cmd" });
  await sleep(260);
  emitMock("app-log", { line: action === "install" ? "Flathub deposu denetleniyor…" : "Flatpak işlemi hazırlanıyor…", kind: "info" });
  await sleep(380);
  emitMock("app-log", { line: action === "remove" ? "Uygulama kaldırılıyor…" : "Uygulama indiriliyor…", kind: "stdout" });
  await sleep(520);

  if (action === "install") {
    MOCK.installed.add(id);
    MOCK.updates.delete(id);
  } else if (action === "remove") {
    MOCK.installed.delete(id);
    MOCK.updates.delete(id);
  } else {
    MOCK.updates.delete(id);
  }
  mockSave("macro-mock-installed", [...MOCK.installed]);
  mockSave("macro-mock-updates", [...MOCK.updates]);

  const message = ACTIONS[action].done;
  emitMock("app-log", { line: `✓ ${message}`, kind: "info" });
  const outcome = {
    success: true,
    code: 0,
    message,
    appId: id,
    action,
    manager: "Flatpak",
  };
  emitMock("app-finished", outcome);
  return outcome;
}

const mockListeners = new Map();

function mockListen(event, handler) {
  if (!mockListeners.has(event)) mockListeners.set(event, new Set());
  mockListeners.get(event).add(handler);
  return Promise.resolve(() => mockListeners.get(event)?.delete(handler));
}

function emitMock(event, payload) {
  for (const handler of mockListeners.get(event) || []) {
    try {
      handler({ event, payload });
    } catch {
      /* önizleme */
    }
  }
}

function mockSetupStatus() {
  const flatpak = Boolean(MOCK.setup.flatpak);
  const flathub = Boolean(MOCK.setup.flathub);
  return {
    flatpakAvailable: flatpak,
    flatpakVersion: flatpak ? "1.18.4" : null,
    flathubAvailable: flathub,
    userFlathubAvailable: flathub,
    ready: flatpak && flathub,
    distroId: "fedora",
    distroName: "Fedora Linux 42 (Workstation)",
    packageManager: "dnf",
    packageManagerLabel: "DNF · Fedora/RHEL",
    installSupported: true,
    polkitAvailable: true,
    immutable: false,
    rebootRequired: false,
    manualCommand: flatpak ? "" : "sudo dnf install -y flatpak",
    flathubCommand: "flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo",
  };
}

async function mockInstallFlatpak() {
  if (!MOCK.setup.flatpak) {
    emitMock("setup-log", { line: "Komut: pkexec /usr/bin/dnf install -y flatpak", kind: "cmd" });
    await sleep(280);
    emitMock("setup-log", { line: "Flatpak, DNF · Fedora/RHEL ile kuruluyor…", kind: "info" });
    await sleep(900);
    emitMock("setup-log", { line: "✓ Flatpak paketi kuruldu.", kind: "info" });
    MOCK.setup.flatpak = true;
  }
  if (!MOCK.setup.flathub) {
    emitMock("setup-log", { line: "Komut: flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo", kind: "cmd" });
    await sleep(420);
    emitMock("setup-log", { line: "✓ Flathub kullanıcı deposu hazır.", kind: "info" });
    MOCK.setup.flathub = true;
    if (!MOCK.remotes.some(remote => remote.name === "flathub" && remote.scope === "user")) {
      MOCK.remotes.push({
        name: "flathub",
        title: "Flathub",
        url: "https://dl.flathub.org/repo/",
        scope: "user",
        comment: "Flathub uygulama deposu",
        icon: "https://dl.flathub.org/repo/logo.svg",
        deletable: false,
      });
      mockSave("macro-mock-remotes", MOCK.remotes);
    }
  }
  mockSave("macro-mock-setup", MOCK.setup);
  emitMock("setup-log", { line: "✓ Sistem hazır. Macro Store kullanıma hazır.", kind: "info" });
  return mockSetupStatus();
}

async function mockInvoke(command, args = {}) {
  if (command === "set_tray_updates") {
    return null;
  }

  if (command === "get_setup_status") {
    await sleep(260);
    return mockSetupStatus();
  }

  if (command === "install_flatpak") {
    return mockInstallFlatpak();
  }

  if (command === "get_store_info") {
    await sleep(120);
    return {
      flatpakAvailable: Boolean(MOCK.setup.flatpak),
      flatpakVersion: MOCK.setup.flatpak ? "1.18.4" : null,
      flathubAvailable: Boolean(MOCK.setup.flathub),
      userFlathubAvailable: Boolean(MOCK.setup.flathub),
    };
  }

  if (command === "get_discover") {
    return mockDiscover(args.date || todayISO());
  }

  if (command === "search_apps") {
    return { apps: await mockSearch(args.query), providerErrors: [] };
  }

  if (command === "get_category") {
    return mockCategory(args.slug, args.page || 1);
  }

  if (command === "get_app_detail") {
    return mockDetail(args.appId || args.app_id, args.provider || "flatpak");
  }

  if (command === "get_app_permissions") {
    await sleep(160);
    const id = args.appId || args.app_id || "";
    const installed = MOCK.installed.has(id);
    return {
      installed,
      available: true,
      raw: installed
        ? `[Context]\nshared=network;ipc;\nsockets=x11;wayland;pulseaudio;\nfilesystems=home;host:ro;\n\n[Session Bus Policy]\norg.freedesktop.portal.Desktop=talk`
        : "",
    };
  }

  if (command === "list_installed_apps") {
    await sleep(180);
    return {
      apps: MOCK.setup.flatpak ? await mockInstalledApps() : [],
      providerErrors: [],
    };
  }

  if (command === "library_usage") {
    const apps = MOCK.setup.flatpak ? await mockInstalledApps() : [];
    return {
      totalBytes: apps.length * 120 * 1024 * 1024,
      apps: apps.length,
    };
  }

  if (command === "take_pending_deep_link") {
    return null;
  }

  if (command === "flatpak_commits") {
    await sleep(160);
    const now = Math.floor(Date.now() / 1000);
    return [
      { commit: "3f8f1a9d2b4c5e6f70819a2b3c4d5e6f70819a2b", subject: "Update to 2.10.0", date: now - 86400 * 3, version: "2.10.0" },
      { commit: "7c2b9e0f1a3d5b7c9e1f2a4b6c8d0e2f4a6b8c0d", subject: "Fix crash on start", date: now - 86400 * 21, version: "2.8.2" },
      { commit: "1a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d", subject: "Update to 2.8.0", date: now - 86400 * 48, version: "2.8.0" },
    ];
  }

  if (command === "rollback_flatpak_app") {
    await sleep(420);
    return {
      success: true,
      code: null,
      message: `${args.id} seçilen sürüme sabitlendi.`,
      appId: args.id,
      action: "rollback",
      manager: "Flatpak",
    };
  }

  if (command === "set_app_mask") {
    await sleep(300);
    return {
      success: true,
      code: null,
      message: args.masked
        ? `${args.id} için güncellemeler durduruldu.`
        : `${args.id} için güncellemeler yeniden etkinleştirildi.`,
      appId: args.id,
      action: args.masked ? "mask" : "unmask",
      manager: "Flatpak",
    };
  }

  if (command === "list_brew_taps") {
    await sleep(150);
    return ["homebrew/cask-fonts", "homebrew/cask-versions"];
  }

  if (command === "add_brew_tap" || command === "remove_brew_tap") {
    await sleep(300);
    return command === "add_brew_tap"
      ? `${args.name} tap'i eklendi.`
      : `${args.name} tap'i kaldırıldı.`;
  }

  if (command === "switch_snap_channel") {
    await sleep(400);
    return {
      success: true,
      code: null,
      message: `Snap ${args.id} ${args.channel} kanalına geçirildi.`,
      appId: args.id,
      action: "channel",
      manager: "Snap",
    };
  }

  if (command === "prune_unused_runtimes") {
    await sleep(400);
    return {
      success: true,
      code: null,
      message: "Kullanılmayan çalışma zamanları temizlendi.",
      appId: "",
      action: "prune",
      manager: "Flatpak",
    };
  }

  if (command === "refresh_provider_caches") {
    return;
  }

  if (command === "list_flatpak_remotes") {
    await sleep(90);
    if (!MOCK.setup.flatpak) return [];
    return MOCK.remotes.map(remote => ({ ...remote }));
  }

  if (command === "add_flatpak_remote") {
    await sleep(420);
    return mockAddRemote(args.name, args.url);
  }

  if (command === "remove_flatpak_remote") {
    await sleep(300);
    return mockRemoveRemote(args.name);
  }

  if (["install_app", "remove_app", "update_app"].includes(command)) {
    const action = command.replace("_app", "");
    return mockOperation(action, args.id, args.provider || "flatpak");
  }

  throw new Error(`Bilinmeyen komut: ${command}`);
}

init();
/* __END__ */
