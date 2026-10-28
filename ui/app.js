/* Macro Store — Flatpak, Snap, Homebrew ve AppImage kaynaklarını yöneten mağaza arayüzü.
   Framework ya da derleme adımı yok; düşük bellek kullanımı için saf JavaScript. */

const TAURI = window.__TAURI__;
const IS_TAURI = Boolean(TAURI?.core?.invoke);
const invoke = IS_TAURI ? TAURI.core.invoke : mockInvoke;
const listen = IS_TAURI ? TAURI.event.listen : mockListen;

const SETUP_SEEN_KEY = "macro-setup-seen";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const ACTIONS = {
  install: { busy: "Kuruluyor…", verb: "kuruluyor", done: "Kurulum tamamlandı." },
  update: { busy: "Güncelleniyor…", verb: "güncelleniyor", done: "Güncelleme tamamlandı." },
  remove: { busy: "Kaldırılıyor…", verb: "kaldırılıyor", done: "Kaldırma tamamlandı." },
  launch: { busy: "Açılıyor…", verb: "açılıyor", done: "Uygulama açıldı." },
};

const SOURCES = {
  flatpak: { label: "Flatpak", tagClass: "is-flatpak" },
  snap: { label: "Snap", tagClass: "is-snap" },
  homebrew: { label: "Homebrew", tagClass: "is-homebrew" },
  appimage: { label: "AppImage", tagClass: "is-appimage" },
};

const ACCENTS = [
  { id: "default", label: "Varsayılan" },
  { id: "red", label: "Kırmızı" },
  { id: "blue", label: "Mavi" },
  { id: "green", label: "Yeşil" },
  { id: "yellow", label: "Sarı" },
  { id: "purple", label: "Mor" },
];

const APP_VERSION = "0.4.0";

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

const state = {
  route: { name: "discover" },
  stack: [{ name: "discover" }],
  activeNav: "discover",
  query: "",
  searchResults: [],
  searching: false,
  searchError: "",
  searchSeq: 0,
  discover: null,
  discoverLoading: false,
  discoverError: "",
  discoverSeq: 0,
  installed: [],
  installedLoaded: false,
  installedLoading: false,
  installedError: "",
  installedSeq: 0,
  updatesOnly: false,
  sourceFilter: "all",
  sourceDiscover: {
    snap: { apps: [], loading: false, error: "", loaded: false, seq: 0 },
    homebrew: { apps: [], loading: false, error: "", loaded: false, seq: 0 },
  },
  appimage: { picking: false, importing: false },
  category: null,
  categoryLoading: false,
  categoryError: "",
  categorySeq: 0,
  detail: null,
  detailLoading: false,
  detailError: "",
  detailSeq: 0,
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
  logs: [],
  pendingConfirm: null,
  gallery: null,
};

const els = {
  main: $("#main"),
  searchInput: $("#searchInput"),
  searchClear: $("#searchClear"),
  backButton: $("#backButton"),
  refreshButton: $("#refreshButton"),
  logButton: $("#logButton"),
  installedCount: $("#installedCount"),
  statusDot: $("#statusDot"),
  statusText: $("#statusText"),
  discoverView: $("#discoverView"),
  searchView: $("#searchView"),
  categoriesView: $("#categoriesView"),
  categoryView: $("#categoryView"),
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
  logModal: $("#logModal"),
  logOutput: $("#logOutput"),
  logClear: $("#logClear"),
  logCount: $("#logCount"),
  confirmModal: $("#confirmModal"),
  confirmTitle: $("#confirmTitle"),
  confirmText: $("#confirmText"),
  confirmAccept: $("#confirmAccept"),
  appimageModal: $("#appimageModal"),
  appimagePath: $("#appimagePath"),
  appimageName: $("#appimageName"),
  appimageError: $("#appimageError"),
  appimagePick: $("#appimagePick"),
  appimageImport: $("#appimageImport"),
  lightbox: $("#lightbox"),
  lightboxImage: $("#lightboxImage"),
  lightboxCaption: $("#lightboxCaption"),
};

let searchTimer = null;
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

function currentAccent() {
  const value = document.documentElement.dataset.accent;
  return ACCENTS.some(accent => accent.id === value) ? value : "default";
}

function setAccent(accent) {
  const next = ACCENTS.some(item => item.id === accent) ? accent : "default";
  document.documentElement.dataset.accent = next;
  try { localStorage.setItem("macro-accent", next); } catch { /* yoksay */ }
}

function lowPowerEnabled() {
  return document.documentElement.dataset.lowPower === "1";
}

function setLowPower(enabled) {
  if (enabled) document.documentElement.dataset.lowPower = "1";
  else delete document.documentElement.dataset.lowPower;
  try { localStorage.setItem("macro-low-power", enabled ? "1" : "0"); } catch { /* yoksay */ }
}

function appSource(app) {
  const source = String(app?.source || "").toLowerCase();
  if (SOURCES[source]) return source;
  const id = String(app?.id || "");
  const prefix = id.includes(":") ? id.split(":")[0] : "";
  return SOURCES[prefix] ? prefix : "flatpak";
}

function scopeLabel(scope) {
  const value = String(scope || "").toLowerCase();
  if (value === "both") return "Kullanıcı + sistem";
  if (value === "system") return "Sistem";
  if (value === "user") return "Kullanıcı";
  return "";
}

function findAppById(id) {
  if (!id) return null;
  if (state.detail?.app?.id === id) return state.detail.app;
  return state.installed.find(item => item.id === id)
    || state.searchResults.find(item => item.id === id)
    || (state.discover?.appOfDay?.id === id ? state.discover.appOfDay : null)
    || state.discover?.picks?.find(item => item.id === id)
    || state.discover?.popular?.find(item => item.id === id)
    || state.discover?.recent?.find(item => item.id === id)
    || state.sourceDiscover.snap.apps.find(item => item.id === id)
    || state.sourceDiscover.homebrew.apps.find(item => item.id === id)
    || state.category?.apps?.find(item => item.id === id)
    || null;
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
  return `<span class="app-icon${extraClass ? ` ${extraClass}` : ""}"><img class="app-img${source ? "" : " is-fallback"}" src="${source || FALLBACK_ICON}" alt="" loading="lazy"${source ? "" : ' data-fallback="1"'} /></span>`;
}

function appTagsHtml(app, context = "") {
  const tags = [];
  const source = appSource(app);
  tags.push(`<span class="tag tag-source ${SOURCES[source].tagClass}">${SOURCES[source].label}</span>`);
  if (app.scope && (source === "flatpak" || source === "appimage")) {
    const scope = scopeLabel(app.scope);
    if (scope && context === "installed") tags.push(`<span class="tag tag-scope">${escapeHtml(scope)}</span>`);
  }
  if (source === "snap" && app.classic) tags.push('<span class="tag tag-scope">Klasik</span>');
  if (source === "homebrew" && app.kind === "cask") tags.push('<span class="tag tag-scope">Cask</span>');
  if (app.updateAvailable) tags.push('<span class="tag tag-update">Güncelleme</span>');
  if (context === "search" && app.installed) tags.push('<span class="tag">Yüklü</span>');
  return tags.join("");
}

function metaParts(app) {
  const parts = [];
  if (app.developer) parts.push(app.developer);
  if (app.category) parts.push(categoryName(app.category));
  if (app.installed && app.version) parts.push(`v${app.version}`);
  if (app.monthlyInstalls) parts.push(`${formatCount(app.monthlyInstalls)} aylık kurulum`);
  return parts;
}

function appMetaHtml(app) {
  const parts = metaParts(app);
  if (!parts.length) return "";
  return `<p class="app-meta">${parts.map(escapeHtml).join('<span class="dot">·</span>')}</p>`;
}

function actionButtonsHtml(app, { large = false, hero = false, allowRemove = true } = {}) {
  const size = large ? "btn-lg" : "btn-sm";
  const primary = hero ? `btn btn-hero-primary ${size}` : `btn btn-primary ${size}`;
  const ghost = hero ? `btn btn-hero-ghost ${size}` : `btn btn-ghost ${size}`;
  const id = attr(app.id);
  const locked = state.busy ? " disabled" : "";
  const source = appSource(app);

  if (state.busy && state.busy.id === app.id) {
    const label = ACTIONS[state.busy.action]?.busy || "İşleniyor…";
    return `<button class="${primary}" type="button" disabled><span class="spinner"></span>${label}</button>`;
  }

  if (!app.installed) {
    return `<button class="${primary}" type="button" data-action="install" data-id="${id}"${locked}>Kur</button>`;
  }

  const buttons = [];
  if (source === "appimage") {
    buttons.push(`<button class="${primary}" type="button" data-action="launch" data-id="${id}"${locked}>Aç</button>`);
  } else if (app.updateAvailable) {
    buttons.push(`<button class="${primary}" type="button" data-action="update" data-id="${id}"${locked}>Güncelle</button>`);
  }
  if (allowRemove) {
    buttons.push(`<button class="${ghost}" type="button" data-action="remove" data-id="${id}"${locked}>Kaldır</button>`);
  }
  return buttons.join("");
}

function appRowHtml(app, context = "search") {
  const summary = String(app.summary || "").trim();
  return `
    <article class="app-row" data-open-app="${attr(app.id)}" tabindex="0" role="link" aria-label="${attr(app.name || app.id)} ayrıntıları">
      ${appIconHtml(app)}
      <div class="app-body">
        <div class="app-line">
          <h3 class="app-name">${escapeHtml(app.name || app.id)}</h3>
          ${appTagsHtml(app, context)}
        </div>
        ${summary ? `<p class="app-summary">${escapeHtml(summary)}</p>` : ""}
        ${appMetaHtml(app)}
      </div>
      <div class="app-actions">${actionButtonsHtml(app)}</div>
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
    <article class="app-tile" data-open-app="${attr(app.id)}" tabindex="0" role="link" aria-label="${attr(app.name || app.id)} ayrıntıları">
      <div class="tile-top">
        ${appIconHtml(app)}
        ${stateTag}
      </div>
      <h3>${escapeHtml(app.name || app.id)}</h3>
      ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
      <div class="tile-foot">
        <span>${escapeHtml(developer || SOURCES[appSource(app)].label)}</span>
        ${app.monthlyInstalls ? '<span class="dot">·</span><span>' + escapeHtml(`${formatCount(app.monthlyInstalls)} kurulum`) + "</span>" : ""}
      </div>
    </article>`;
}

function pickCardHtml(app) {
  const hero = imageUrl(app.heroImage);
  return `
    <article class="pick-card" data-open-app="${attr(app.id)}" tabindex="0" role="link" aria-label="${attr(app.name || app.id)} ayrıntıları">
      <div class="pick-media${hero ? "" : " is-placeholder"}">
        ${hero ? `<img src="${hero}" alt="" loading="lazy" />` : ""}
      </div>
      <div class="pick-body">
        ${appIconHtml(app)}
        <div class="pick-text">
          <h3>${escapeHtml(app.name || app.id)}</h3>
          <p>${escapeHtml(app.developer || SOURCES[appSource(app)].label)}</p>
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
    flatpakAvailable: Boolean(status.flatpakAvailable),
    flatpakVersion: status.flatpakVersion || null,
    flathubAvailable: Boolean(status.flathubAvailable),
    userFlathubAvailable: Boolean(status.userFlathubAvailable),
    snapAvailable: Boolean(status.snapAvailable),
    snapVersion: status.snapVersion || null,
    brewAvailable: Boolean(status.brewAvailable),
    brewVersion: status.brewVersion || null,
    appimageCount: Number(state.storeInfo?.appimageCount) || 0,
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
    ? "<strong>Flathub kullanıcı deposu eksik.</strong> Uygulama kurulumu için Flathub deposunu ekleyin."
    : "<strong>Flatpak bulunamadı.</strong> Macro Store uygulamaları Flatpak ile kurar. Kurulum sihirbazı dağıtımınıza uygun paketi hazırlayabilir.";
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
  const snapValue = status.snapAvailable
    ? (status.snapVersion || "Kurulu")
    : status.snapInstallSupported
      ? "Kurulabilir"
      : "Kurulu değil";
  const brewValue = status.brewAvailable
    ? (status.brewVersion || "Kurulu")
    : status.brewInstallSupported
      ? "Kurulabilir"
      : "Kurulu değil";
  const meta = [
    status.distroName || "Linux",
    status.packageManagerLabel || status.packageManager || "Paket yöneticisi algılanamadı",
  ].filter(Boolean).map(escapeHtml).join('<span class="dot">·</span>');

  return `
    <div class="setup-facts">
      ${setupFactHtml(Boolean(status.flatpakAvailable), "Flatpak", flatpakValue)}
      ${setupFactHtml(Boolean(status.userFlathubAvailable), "Flathub", flathubValue)}
      ${setupFactHtml(Boolean(status.snapAvailable), "Snap", snapValue)}
      ${setupFactHtml(Boolean(status.brewAvailable), "Homebrew", brewValue)}
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
  if (!status.snapAvailable && status.snapManualCommand) {
    rows.push(setupCommandHtml("Snap’i kur", status.snapManualCommand));
  }
  if (!status.brewAvailable && status.brewManualCommand) {
    rows.push(setupCommandHtml("Homebrew’u kur", status.brewManualCommand));
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
  let title = "Sistem denetleniyor";
  let subtitle = "Flatpak, Snap ve Homebrew durumu kontrol ediliyor.";

  if (setup.running) {
    title = setup.phase || (status?.flatpakAvailable ? "Flathub hazırlanıyor" : "Kurulum sürüyor");
    subtitle = "Kurulum tamamlanana kadar bu pencereyi kapatmayın.";
  } else if (setup.error) {
    title = "Kurulum tamamlanamadı";
    subtitle = "Hatayı inceleyip yeniden deneyebilirsiniz.";
  } else if (status?.rebootRequired) {
    title = "Yeniden başlatma gerekiyor";
    subtitle = "Flatpak katmanı yeniden başlatmadan etkinleşmez.";
  } else if (status?.ready) {
    title = "Flatpak akışı hazır";
    subtitle = "Flathub hazır. Snap ve Homebrew’u dilediğiniz zaman ekleyebilirsiniz.";
  } else if (status?.flatpakAvailable) {
    title = "Flathub deposu eksik";
    subtitle = "Kullanıcı kapsamına Flathub deposunu ekleyin.";
  } else if (status) {
    title = "Flatpak kurulumu";
    subtitle = "Mağaza için gerekli Flatpak bileşeni hazırlanacak.";
  } else if (loading) {
    title = "Sistem denetleniyor";
    subtitle = "Flatpak, Snap ve Homebrew durumu kontrol ediliyor.";
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
          <h3>Sistem kaynakları denetleniyor</h3>
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
          <h3>Flatpak ve Flathub hazır</h3>
          <p>Flatpak ${escapeHtml(status.flatpakVersion || "")} ve Flathub kullanıcı deposu hazır. Snap ve Homebrew’u buradan kurabilir, AppImage dosyalarını Yüklü Uygulamalar ekranından içe aktarabilirsiniz.</p>
        </div>
      </div>
      ${setupFactsHtml(status)}
      ${setupActionsHtml([
        '<button class="btn btn-primary" type="button" data-setup-finish>Mağazayı aç</button>',
        !status.snapAvailable && status.snapInstallSupported
          ? '<button class="btn btn-ghost" type="button" data-install-source="snap">Snap’i kur</button>'
          : "",
        !status.brewAvailable && status.brewInstallSupported
          ? '<button class="btn btn-ghost" type="button" data-install-source="homebrew">Homebrew’u kur</button>'
          : "",
        '<button class="btn btn-ghost" type="button" data-setup-close>Kapat</button>',
      ].filter(Boolean))}
      ${setupLogsHtml()}`;
  } else if (!status.flatpakAvailable) {
    const supported = Boolean(status.installSupported);
    const hasAlternative = Boolean(status.snapAvailable || status.brewAvailable);
    body = `
      <div class="setup-message is-warning">
        ${ICON.warning}
        <div>
          <h3>Flatpak kurulu değil</h3>
          <p>${supported
            ? "Flathub uygulamaları için Flatpak gerekir. Dağıtımınıza uygun paket yöneticisiyle Flatpak’ı kurup Flathub deposunu hazırlayabiliriz."
            : "Flathub uygulamaları için Flatpak gerekir. Bu dağıtımda otomatik kurulum desteklenmiyor; aşağıdaki komutları terminalde çalıştırabilirsiniz."}${hasAlternative ? " Snap ve Homebrew kaynakları kullanılabilir." : ""}</p>
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
        hasAlternative
          ? '<button class="btn btn-ghost" type="button" data-setup-finish>Mağazayı aç</button>'
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
  for (const entry of Object.values(state.sourceDiscover)) {
    entry.loaded = false;
    entry.seq += 1;
  }
  await loadStoreInfo();
  loadInstalled(true, true);
  loadRemotes(true);
  if (state.route.name === "discover") {
    loadDiscover(true);
  }
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

async function installSource(source) {
  if (state.setup.running) return;
  const label = source === "snap" ? "Snap" : source === "homebrew" ? "Homebrew" : "Kaynak";
  if (source !== "snap" && source !== "homebrew") return;

  state.setup.running = true;
  state.setup.error = "";
  state.setup.logs = [];
  state.setup.phase = `${label} kuruluyor…`;
  renderSetup();
  openSetupModal({ refresh: false });

  let status = null;
  try {
    status = await invoke(source === "snap" ? "install_snap" : "install_homebrew");
    state.setup.status = status;
    syncStoreInfoFromSetup(status);
    state.setup.phase = `${label} hazır`;
    localStorage.setItem(SETUP_SEEN_KEY, "1");
    toast(`${label} kullanıma hazır.`, "success");
  } catch (err) {
    state.setup.error = errText(err);
    toast(state.setup.error, "error");
  } finally {
    state.setup.running = false;
    renderSetup();
    if (status) {
      await refreshStoreAfterSetup();
      if (state.route.name === "settings") renderSettings();
    }
  }
}

/* ── Gezinme ve veri yükleme ───────────────────────── */

function updateStatus() {
  const info = state.storeInfo;
  if (!info) {
    els.statusDot.className = "status-dot is-pending";
    els.statusText.textContent = "Sistem denetleniyor…";
    return;
  }
  const parts = [];
  let degraded = false;
  if (info.flatpakAvailable) {
    const hasFlathub = Boolean(info.flathubAvailable || info.userFlathubAvailable);
    parts.push("Flatpak");
    if (!hasFlathub) degraded = true;
  }
  if (info.snapAvailable) parts.push("Snap");
  if (info.brewAvailable) parts.push("Homebrew");
  if (!parts.length) {
    els.statusDot.className = "status-dot is-error";
    els.statusText.textContent = "Paket kaynağı bulunamadı";
    return;
  }
  const appimages = Number(info.appimageCount) || 0;
  if (appimages > 0) parts.push(`${appimages} AppImage`);
  els.statusDot.className = `status-dot ${degraded ? "is-error" : "is-ok"}`;
  els.statusText.textContent = degraded
    ? `${parts.join(" · ")} · Flathub deposu yok`
    : parts.join(" · ");
}

function updateInstalledCount() {
  const count = state.installed.length;
  els.installedCount.hidden = !state.installedLoaded || count === 0;
  els.installedCount.textContent = String(count);
}

function updatePageTitle() {
  const route = state.route;
  if (route.name === "detail" && state.detail?.app?.name) {
    document.title = `${state.detail.app.name} — Macro Store`;
  } else if (route.name === "category" && CATEGORY_MAP[route.slug]) {
    document.title = `${CATEGORY_MAP[route.slug].name} — Macro Store`;
  } else if (route.name === "search" && state.query) {
    document.title = state.query.length >= 2 ? `“${state.query}” — Macro Store` : "Arama — Macro Store";
  } else {
    document.title = "Macro Store — Linux Uygulama Mağazası";
  }
}

function renderChrome() {
  $$(".nav-item").forEach(button => {
    button.classList.toggle("is-active", button.dataset.nav === state.activeNav);
  });
  updateInstalledCount();
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
    case "installed":
      return "installed";
    case "settings":
      return "settings";
    default:
      return state.activeNav;
  }
}

function navigate(route, { root = false, replace = false } = {}) {
  const previous = state.route;
  const same = route.name === previous.name
    && (route.slug || "") === (previous.slug || "")
    && (route.id || "") === (previous.id || "");

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
  if (state.route.name === "discover") renderDiscover();
  if (state.route.name === "settings") renderSettings();
}

function discoverSources() {
  const info = state.storeInfo;
  const setup = state.setup.status;
  const snapReady = setup ? Boolean(setup.snapAvailable) : Boolean(info?.snapAvailable);
  const brewReady = setup ? Boolean(setup.brewAvailable) : Boolean(info?.brewAvailable);
  const sources = [];
  if (snapReady) sources.push("snap");
  if (brewReady) sources.push("homebrew");
  return sources;
}

async function loadSourceDiscover(source, force = false) {
  const entry = state.sourceDiscover[source];
  if (!entry) return;
  if (!force && (entry.loaded || entry.loading)) return;
  if (entry.loading && !force) return;

  const seq = ++entry.seq;
  entry.loading = true;
  entry.error = "";
  renderIf("discover", renderDiscover);

  try {
    const apps = await invoke("get_source_discover", { source });
    if (seq !== entry.seq) return;
    entry.apps = Array.isArray(apps) ? apps : [];
    entry.loaded = true;
  } catch (err) {
    if (seq !== entry.seq) return;
    entry.error = errText(err);
  } finally {
    if (seq === entry.seq) {
      entry.loading = false;
      renderIf("discover", renderDiscover);
    }
  }
}

let sourceObserver = null;

function observeSourceSections() {
  const nodes = $$("#discoverView [data-source-lazy]");
  if (!nodes.length) {
    if (sourceObserver) sourceObserver.disconnect();
    return;
  }
  if (typeof IntersectionObserver !== "function") {
    for (const node of nodes) loadSourceDiscover(node.dataset.sourceLazy);
    return;
  }
  if (!sourceObserver) {
    sourceObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const source = entry.target.dataset.sourceLazy;
        sourceObserver.unobserve(entry.target);
        if (source) loadSourceDiscover(source);
      }
    }, { rootMargin: "240px 0px" });
  }
  sourceObserver.disconnect();
  for (const node of nodes) sourceObserver.observe(node);
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
    const list = await invoke("list_installed_apps");
    if (seq !== state.installedSeq) return;
    state.installed = Array.isArray(list)
      ? [...list].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "tr", { sensitivity: "base" }))
      : [];
    state.installedLoaded = true;
    state.installedError = "";
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
  els.searchInput.value = "";
  if (goDiscover && state.route.name === "search") {
    navigate({ name: "discover" }, { root: true });
  } else {
    renderChrome();
  }
  if (focus) els.searchInput.focus();
}

async function runSearch(rawQuery) {
  const query = String(rawQuery ?? "").trim();
  cancelPendingSearch();

  if (!query) {
    resetSearch({ goDiscover: state.route.name === "search" });
    return;
  }

  if (query.length < 2) {
    state.query = query;
    state.searchResults = [];
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
  els.searchInput.value = query;
  const seq = ++state.searchSeq;

  if (state.route.name !== "search") navigate({ name: "search" });
  else renderSearch();

  try {
    const results = await invoke("search_apps", { query });
    if (seq !== state.searchSeq) return;
    state.searchResults = Array.isArray(results) ? results : [];
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
    const seen = new Set(previousApps.map(app => app.id));
    const merged = [...previousApps];
    for (const app of data?.apps || []) {
      if (!seen.has(app.id)) {
        seen.add(app.id);
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

async function loadDetail(id, force = false) {
  if (!force && state.detail?.app?.id === id) {
    renderIf("detail", renderDetail);
    return;
  }
  const seq = ++state.detailSeq;
  const sameApp = state.detail?.app?.id === id;
  if (!sameApp) state.detail = null;
  state.detailLoading = true;
  state.detailError = "";
  renderIf("detail", renderDetail);

  try {
    const data = await invoke("get_app_detail", { id });
    if (seq !== state.detailSeq) return;
    state.detail = data;
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
    const route = state.route;
    if (route.name === "discover") await loadDiscover(true);
    else if (route.name === "search" && state.query) await runSearch(state.query);
    else if (route.name === "installed") await loadInstalled(true);
    else if (route.name === "category") await loadCategory(route.slug, 1, true);
    else if (route.name === "detail") await loadDetail(route.id, true);
    else if (route.name === "settings") {
      await loadStoreInfo();
      await loadRemotes(true);
    }
    toast("Yenilendi.", "info");
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
  const developer = app.developer ? escapeHtml(app.developer) : "Flathub topluluğu";
  const summary = String(app.summary || "").trim();
  const installed = app.installed;
  const secondary = !installed
    ? actionButtonsHtml(app, { hero: true, large: true, allowRemove: false })
    : app.updateAvailable
      ? actionButtonsHtml(app, { hero: true, large: true, allowRemove: false })
      : "";

  return `
    <article class="hero-card" data-open-app="${attr(app.id)}" tabindex="0" role="link" aria-label="${attr(app.name || app.id)} ayrıntıları">
      <div class="hero-media${hero ? "" : " is-placeholder"}">${hero ? `<img src="${hero}" alt="" />` : ""}</div>
      <div class="hero-scrim"></div>
      <div class="hero-content">
        <span class="hero-kicker">Günün uygulaması</span>
        <div class="hero-identity">
          ${appIconHtml(app)}
          <div>
            <h2>${escapeHtml(app.name || app.id)}</h2>
            <p class="hero-developer">${developer}</p>
          </div>
        </div>
        ${summary ? `<p class="hero-summary">${escapeHtml(summary)}</p>` : ""}
        <div class="hero-actions">
          <button class="btn btn-hero-primary btn-lg" type="button" data-open-app="${attr(app.id)}">İncele</button>
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
  const sources = discoverSources();

  const sections = [];
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

  for (const source of sources) {
    const entry = state.sourceDiscover[source];
    if (!entry) continue;
    let content = "";
    if (entry.apps.length) {
      content = `<div class="app-list">${entry.apps.map(app => appRowHtml(app, "discover")).join("")}</div>`;
    } else if (entry.loading) {
      content = skeletonRows(2);
    } else if (entry.error) {
      content = `<div class="source-lazy is-error">
        <span>Vitrin yüklenemedi: ${escapeHtml(entry.error)}</span>
        <button class="btn btn-ghost btn-sm" type="button" data-source-retry="${source}">Yeniden dene</button>
      </div>`;
    } else {
      content = `<div class="source-lazy" data-source-lazy="${source}">
        <span class="spinner" aria-hidden="true"></span>
        <span>Vitrin yükleniyor…</span>
      </div>`;
    }
    sections.push(`
      <section>
        <div class="section-head">
          <h2>${source === "snap" ? "Snap vitrini" : "Homebrew vitrini"}</h2>
          <p>${source === "snap" ? "Snap Store’dan öne çıkanlar" : "Popüler formüller ve casks"}</p>
        </div>
        ${content}
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
        <p class="view-sub">${sources.length
          ? "Flathub, Snap ve Homebrew kaynaklarından öne çıkanlar."
          : "Öne çıkan uygulamalar, haftanın seçkileri ve yeni eklenenler."}</p>
      </div>
      <p class="view-note">${escapeHtml(formatISODate(data.date))}</p>
    </header>
    ${body}`;

  observeSourceSections();
}

function renderSearch() {
  const query = state.query;
  const count = state.searchResults.length;
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
  } else if (!count) {
    body = stateHtml({
      title: "Sonuç bulunamadı",
      text: `“${query}” için uygulama bulunamadı.\nFarklı bir ad ya da anahtar kelime deneyin.`,
      retry: "search",
      icon: ICON.search,
    });
  } else {
    body = `<div class="app-list">${state.searchResults.map(app => appRowHtml(app, "search")).join("")}</div>`;
  }

  els.searchView.innerHTML = `
    <header class="view-head">
      <div class="view-title">
        <p class="eyebrow">Arama</p>
        <h1>“${escapeHtml(query)}”</h1>
        <p class="view-sub">${discoverSources().length ? "Flatpak, Snap ve Homebrew kaynaklarında arama" : "Flathub kataloğunda arama"}</p>
      </div>
      <p class="view-note">${escapeHtml(meta)}</p>
    </header>
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

function sourceCounts() {
  const counts = { all: state.installed.length, flatpak: 0, snap: 0, homebrew: 0, appimage: 0 };
  for (const app of state.installed) {
    const source = appSource(app);
    counts[source] = (counts[source] || 0) + 1;
  }
  return counts;
}

function renderInstalled() {
  const counts = sourceCounts();
  const updates = state.installed.filter(app => app.updateAvailable).length;
  if (!updates) state.updatesOnly = false;
  if (state.sourceFilter !== "all" && !counts[state.sourceFilter]) state.sourceFilter = "all";

  let visible = state.installed;
  if (state.sourceFilter !== "all") {
    visible = visible.filter(app => appSource(app) === state.sourceFilter);
  }
  if (state.updatesOnly) visible = visible.filter(app => app.updateAvailable);

  const filters = [
    `<button class="chip" type="button" data-source-filter="all" aria-pressed="${state.sourceFilter === "all"}">Tümü <span>${counts.all}</span></button>`,
    ...Object.keys(SOURCES)
      .filter(source => counts[source] > 0)
      .map(source => `<button class="chip" type="button" data-source-filter="${source}" aria-pressed="${state.sourceFilter === source}">${SOURCES[source].label} <span>${counts[source]}</span></button>`),
  ];

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
  } else if (!visible.length) {
    body = stateHtml({
      title: state.updatesOnly
        ? "Güncelleme yok"
        : state.sourceFilter !== "all"
          ? `${SOURCES[state.sourceFilter].label} uygulaması yok`
          : "Henüz yüklü uygulama yok",
      text: state.updatesOnly
        ? "Tüm uygulamalar güncel görünüyor."
        : state.sourceFilter !== "all"
          ? "Bu kaynaktan yüklü bir uygulama bulunmuyor. Farklı bir kaynak filtresi seçin."
          : "Flatpak, Snap ve Homebrew kaynaklarından kurduğunuz uygulamalar burada görünür. AppImage dosyalarını da içe aktarabilirsiniz.",
      icon: ICON.box,
      action: state.updatesOnly
        ? ""
        : state.sourceFilter !== "all"
          ? '<button class="btn btn-ghost" type="button" data-source-filter="all">Tümünü göster</button>'
          : '<button class="btn btn-ghost" type="button" data-nav="discover">Keşfet’e göz at</button>',
    });
  } else {
    body = `<div class="app-list">${visible.map(app => appRowHtml(app, "installed")).join("")}</div>`;
  }

  els.installedView.innerHTML = `
    <header class="view-head">
      <div class="view-title">
        <p class="eyebrow">Kitaplık</p>
        <h1>Yüklü Uygulamalar</h1>
        <p class="view-sub">${state.installed.length} uygulama${updates ? ` · ${updates} güncelleme` : ""}</p>
      </div>
      <div class="view-head-actions">
        ${updates ? `<button class="chip" type="button" data-updates-filter aria-pressed="${state.updatesOnly}">
          Güncellemeler <span>${updates}</span>
        </button>` : ""}
        <button class="btn btn-ghost btn-sm" type="button" data-appimage-open>AppImage ekle</button>
      </div>
    </header>
    ${storeNoticeHtml()}
    ${state.installed.length ? `<div class="filter-row">${filters.join("")}</div>` : ""}
    ${body}`;
}

function detailActionButtons(app) {
  return actionButtonsHtml(app, { large: true, allowRemove: true });
}

function infoCardHtml(detail) {
  const app = detail.app;
  const source = appSource(app);
  const rows = [];
  rows.push(["Kaynak", SOURCES[source].label]);
  if (app.version) rows.push(["Sürüm", app.version]);
  if (source === "homebrew" && app.kind) rows.push(["Tür", app.kind === "cask" ? "Cask" : "Formül"]);
  if (app.scope) {
    const scope = scopeLabel(app.scope);
    if (scope) rows.push(["Kapsam", scope]);
  }
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
        text: state.detailError || "Flathub’dan uygulama ayrıntıları alınamadı.",
        retry: "detail",
        icon: ICON.warning,
      })}`;
    return;
  }

  const app = detail.app;
  const source = appSource(app);
  const sourceMeta = SOURCES[source];
  const screenshots = Array.isArray(detail.screenshots) ? detail.screenshots : [];
  const reviews = Array.isArray(detail.reviews) ? detail.reviews : [];
  const categories = Array.isArray(detail.categories) ? detail.categories : [];
  const detailSource = source === "flatpak"
    ? "Flathub · Flatpak"
    : source === "snap"
      ? "Snap Store · Snap"
      : source === "homebrew"
        ? `Homebrew · ${app.kind === "cask" ? "Cask" : "Formül"}`
        : "Yerel · AppImage";
  const tags = [];
  tags.push(`<span class="tag tag-source ${sourceMeta.tagClass}">${sourceMeta.label}</span>`);
  if (app.scope) {
    const scope = scopeLabel(app.scope);
    if (scope) tags.push(`<span class="tag tag-scope">${escapeHtml(scope)}</span>`);
  }
  if (app.classic) tags.push('<span class="tag tag-scope">Klasik kısıtlama</span>');
  if (source === "homebrew" && app.kind === "cask") tags.push('<span class="tag tag-scope">Cask</span>');
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
              <img class="shot-img" src="${imageUrl(shot.url)}" alt="${attr(shot.caption || `${app.name} ekran görüntüsü`)}" loading="lazy" />
              ${shot.caption ? `<figcaption>${escapeHtml(shot.caption)}</figcaption>` : ""}
            </figure>`).join("")}
        </div>
      </section>`
    : "";

  const description = sanitizeDescription(detail.description);
  const developer = app.developer
    || (source === "flatpak" ? "Flathub topluluğu" : source === "snap" ? "Snap Store" : source === "homebrew" ? "Homebrew" : "Yerel AppImage");
  const sizeNote = detail.downloadSize
    ? `İndirme: ${formatBytes(detail.downloadSize)}`
    : source === "appimage"
      ? "Yerel dosya"
      : source === "snap"
        ? "Snap Store’dan kurulur"
        : source === "homebrew"
          ? "Homebrew ile kurulur"
          : "Flathub’dan kurulur";
  const footnote = source === "flatpak"
    ? "Açıklama, ekran görüntüleri ve sürüm bilgileri Flathub’dan; topluluk puanları ve yorumları ODRS’den alınır. Kurulum ve kaldırma işlemleri Flatpak ile yapılır."
    : source === "snap"
      ? "Açıklama ve görseller Snap Store’dan alınır. Kurulum, güncelleme ve kaldırma işlemleri sistem genelinde Snap ile yapılır."
      : source === "homebrew"
        ? "Formül bilgileri Homebrew API’sinden alınır. Kurulum, güncelleme ve kaldırma işlemleri kullanıcı kapsamında Homebrew ile yapılır."
        : "Bu uygulama yerel bir AppImage dosyasıdır. Dosya Macro Store veri dizininde saklanır; güncellemek için yeni sürümü yeniden içe aktarın.";
  const reviewsSection = source === "flatpak" || reviews.length
    ? `<section class="detail-section">
          <h2>Topluluk yorumları <span class="source-note">ODRS üzerinden</span></h2>
          ${reviewsHtml(reviews)}
        </section>`
    : "";

  els.detailView.innerHTML = `
    <div class="detail-top">
      <button class="text-back" type="button" data-back>${ICON.arrow}Geri</button>
      <span class="detail-source">${escapeHtml(detailSource)}</span>
    </div>

    <section class="detail-hero">
      ${appIconHtml(app)}
      <div class="detail-intro">
        <div class="detail-title-line">
          <h1>${escapeHtml(app.name || app.id)}</h1>
          ${detail.verified ? `<span class="verified-badge">${ICON.check}Doğrulanmış</span>` : ""}
        </div>
        <p class="detail-dev">${escapeHtml(developer)}</p>
        ${app.summary ? `<p class="detail-summary">${escapeHtml(app.summary)}</p>` : ""}
        ${tags.length ? `<div class="detail-tags">${tags.join("")}</div>` : ""}
        <div class="detail-actions">
          ${detailActionButtons(app)}
          <span class="detail-size">${escapeHtml(sizeNote)}</span>
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
        ${reviewsSection}
      </div>
      <aside class="detail-side">
        ${ratingCardHtml(detail.rating)}
        ${infoCardHtml(detail)}
      </aside>
    </div>

    <p class="detail-footnote">${escapeHtml(footnote)}</p>`;
}

function renderSettings() {
  const theme = currentTheme();
  const accent = currentAccent();
  const lowPower = lowPowerEnabled();
  const info = state.storeInfo || {};
  const setup = state.setup.status;
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

  const flatpakReady = setup ? Boolean(setup.flatpakAvailable) : Boolean(info.flatpakAvailable);
  const flathubReady = setup ? Boolean(setup.userFlathubAvailable) : Boolean(info.userFlathubAvailable);
  const snapReady = setup ? Boolean(setup.snapAvailable) : Boolean(info.snapAvailable);
  const brewReady = setup ? Boolean(setup.brewAvailable) : Boolean(info.brewAvailable);
  const flatpakDetail = flatpakReady
    ? (setup?.flatpakVersion || info.flatpakVersion || "Kurulu")
    : "Kurulu değil";
  const flathubDetail = flathubReady
    ? "Kullanıcı deposu hazır"
    : setup?.flathubAvailable
      ? "Sistem deposu var · kullanıcı deposu eksik"
      : "Eklenmeli";
  const snapDetail = snapReady
    ? (setup?.snapVersion || info.snapVersion || "Kurulu")
    : "Kurulu değil";
  const brewDetail = brewReady
    ? (setup?.brewVersion || info.brewVersion || "Kurulu")
    : "Kurulu değil";
  const appimageCount = Math.max(
    state.installed.filter(app => appSource(app) === "appimage").length,
    Number(info.appimageCount) || 0,
  );
  const snapSupported = setup ? Boolean(setup.snapInstallSupported) : false;
  const brewSupported = setup ? Boolean(setup.brewInstallSupported) : false;

  const sourceCard = (source, { ready, detail = "", desc, action = "" }) => `
    <div class="source-card">
      <span class="repo-mark" aria-hidden="true">${ICON.box}</span>
      <div class="source-card-body">
        <h3>${SOURCES[source].label}</h3>
        <p>${escapeHtml(desc)}</p>
      </div>
      ${ready
        ? `<span class="source-state is-ok">${escapeHtml(detail)}</span>`
        : action}
    </div>`;

  const snapAction = snapSupported
    ? '<button class="btn btn-ghost btn-sm" type="button" data-install-source="snap">Kur</button>'
    : '<button class="btn btn-ghost btn-sm" type="button" data-open-setup>Kurulum</button>';
  const brewAction = brewSupported
    ? '<button class="btn btn-ghost btn-sm" type="button" data-install-source="homebrew">Kur</button>'
    : '<button class="btn btn-ghost btn-sm" type="button" data-open-setup>Kurulum</button>';

  els.settingsView.innerHTML = `
    <header class="view-head">
      <div class="view-title">
        <p class="eyebrow">Macro Store</p>
        <h1>Seçenekler</h1>
        <p class="view-sub">Görünümü, performansı ve uygulama kaynaklarını yönetin.</p>
      </div>
      <p class="view-note">Sürüm ${APP_VERSION}</p>
    </header>

    <section class="settings-section">
      <div class="settings-head">
        <h2>Görünüm</h2>
        <p>Açık ya da koyu tema seçin; vurgu rengini mağaza genelinde değiştirin.</p>
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
      <div class="accent-row">
        <span class="accent-label">Vurgu rengi</span>
        ${ACCENTS.map(item => `<button class="accent-dot${accent === item.id ? " is-active" : ""}" type="button" data-accent-choice="${item.id}" aria-pressed="${accent === item.id}" title="${item.label}" aria-label="${item.label} vurgu rengi"></button>`).join("")}
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-head">
        <h2>Performans</h2>
        <p>Düşük güç modu animasyonları, gölgeleri ve bulanıklığı azaltarak kaynak tüketimini düşürür.</p>
      </div>
      <div class="toggle-row">
        <div class="toggle-text">
          <h3>Düşük güç modu</h3>
          <p>Her sistemde çalışır. Etkinleştirildiğinde geçişler anında tamamlanır ve görsel efektler sadeleşir.</p>
        </div>
        <button class="switch" type="button" role="switch" aria-checked="${lowPower}" data-low-power-toggle aria-label="Düşük güç modu"></button>
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-head">
        <h2>Kaynaklar</h2>
        <p>Flatpak ana kaynaktır. Snap, Homebrew ve AppImage desteği isteğe bağlıdır; kurulu kaynaklar mağazada birlikte listelenir.</p>
      </div>
      <div class="source-grid">
        ${sourceCard("flatpak", {
          ready: flatpakReady,
          detail: flatpakDetail,
          desc: flathubReady ? "Flathub kullanıcı deposu hazır" : "Flathub kullanıcı deposu eklenmeli",
          action: '<button class="btn btn-ghost btn-sm" type="button" data-open-setup>Kurulum</button>',
        })}
        ${sourceCard("snap", {
          ready: snapReady,
          detail: snapDetail,
          desc: "Snap Store uygulamaları sistem genelinde kurulur",
          action: snapAction,
        })}
        ${sourceCard("homebrew", {
          ready: brewReady,
          detail: brewDetail,
          desc: "Formüller ve casks kullanıcı kapsamında kurulur",
          action: brewAction,
        })}
        ${sourceCard("appimage", {
          ready: false,
          desc: appimageCount > 0 ? `${appimageCount} AppImage içe aktarıldı` : "Dışarıdan edinilen .AppImage dosyalarını içe aktarın",
          action: '<button class="btn btn-ghost btn-sm" type="button" data-appimage-open>Ekle</button>',
        })}
      </div>
      <div class="section-actions">
        <button class="btn btn-ghost" type="button" data-open-setup>Kurulum sihirbazını aç</button>
      </div>
      ${setup?.distroName ? `<p class="system-meta">${escapeHtml(setup.distroName)}${setup.packageManagerLabel ? ` · ${escapeHtml(setup.packageManagerLabel)}` : ""}</p>` : ""}
    </section>

    <section class="settings-section">
      <div class="settings-head">
        <h2>Depolar</h2>
        <p>Flatpak depoları. Flathub varsayılan kaynaktır; kullanıcı kapsamına özel depolar ekleyebilirsiniz.</p>
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
        <h2>Mağaza bilgileri</h2>
      </div>
      <div class="about-lines">
        <div><strong>Macro Store</strong> ${APP_VERSION} · GPLv3 · Linux uygulama mağazası</div>
        <div>Flatpak: <strong>${escapeHtml(flatpakDetail)}</strong> · Snap: <strong>${escapeHtml(snapDetail)}</strong> · Homebrew: <strong>${escapeHtml(brewDetail)}</strong></div>
        <div>Uygulama verileri Flathub, Snap Store ve Homebrew API’lerinden; topluluk yorumları ODRS’den alınır.</div>
      </div>
    </section>`;
}
/* ── İşlemler ──────────────────────────────────────── */

function patchApp(app, action, id) {
  if (!app || app.id !== id) return;
  if (action === "install") {
    app.installed = true;
    app.updateAvailable = false;
  } else if (action === "remove") {
    app.installed = false;
    app.updateAvailable = false;
  } else if (action === "update") {
    app.updateAvailable = false;
  }
}

function applyAction(action, id) {
  const lists = [
    state.searchResults,
    state.installed,
    state.category?.apps || [],
    state.discover?.picks || [],
    state.discover?.popular || [],
    state.discover?.recent || [],
    state.sourceDiscover.snap.apps,
    state.sourceDiscover.homebrew.apps,
  ];
  for (const list of lists) list.forEach(app => patchApp(app, action, id));
  if (state.discover?.appOfDay) patchApp(state.discover.appOfDay, action, id);
  if (state.detail?.app) patchApp(state.detail.app, action, id);

  if (action === "remove") {
    state.installed = state.installed.filter(app => app.id !== id);
  }
  if (action === "install") {
    const source = findAppById(id);
    if (source && state.installedLoaded && !state.installed.some(app => app.id === id)) {
      state.installed.push({ ...source, installed: true, updateAvailable: false });
      state.installed.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "tr", { sensitivity: "base" }));
    }
  }
}

async function performAction(action, app) {
  if (!app || state.busy || !ACTIONS[action]) return;
  if (action === "launch") return performLaunch(app);
  state.busy = { id: app.id, action, name: app.name || app.id };
  showActivity(`${app.name || app.id} ${ACTIONS[action].verb}…`);
  renderRoute();

  try {
    const outcome = await invoke(`${action}_app`, { id: app.id });
    if (outcome && outcome.success === false) {
      throw new Error(outcome.message || "İşlem başarısız oldu.");
    }
    applyAction(action, app.id);
    toast(outcome?.message || ACTIONS[action].done, "success");
  } catch (err) {
    toast(errText(err), "error");
    openLogModal();
  } finally {
    state.busy = null;
    hideActivity(900);
    renderRoute();
    loadInstalled(true, true);
    if (action === "install" || action === "remove") loadStoreInfo();
  }
}

async function performLaunch(app) {
  if (!app || state.busy) return;
  if (appSource(app) !== "appimage") {
    toast("Bu uygulama mağaza üzerinden başlatılamıyor.", "error");
    return;
  }
  state.busy = { id: app.id, action: "launch", name: app.name || app.id };
  showActivity(`${app.name || app.id} açılıyor…`);
  renderRoute();

  try {
    await invoke("launch_appimage_file", { id: app.id });
    toast(`${app.name || "AppImage"} başlatıldı.`, "success");
  } catch (err) {
    toast(errText(err), "error");
  } finally {
    state.busy = null;
    hideActivity(600);
    renderRoute();
  }
}

function askRemove(app) {
  const source = appSource(app);
  const name = app.name || app.id;
  const text = source === "appimage"
    ? `${name} mağaza kayıtlarından ve uygulama menüsünden kaldırılacak. İçe aktarılan dosya silinir. Bu işlem geri alınamaz.`
    : source === "snap"
      ? `${name} sistem genelindeki Snap kurulumundan kaldırılacak. Bu işlem geri alınamaz.`
      : source === "homebrew"
        ? `${name} Homebrew kullanıcı kurulumundan kaldırılacak. Bu işlem geri alınamaz.`
        : `${name} ${app.scope === "system" ? "sistem" : "kullanıcı"} Flatpak kurulumundan kaldırılacak. Bu işlem geri alınamaz.`;
  askConfirm({
    title: "Uygulamayı kaldır",
    text,
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

/* ── AppImage içe aktarma ─────────────────────────── */

function setAppImageError(message) {
  if (!els.appimageError) return;
  els.appimageError.textContent = message || "";
  els.appimageError.hidden = !message;
}

function openAppImageModal() {
  setAppImageError("");
  if (els.appimagePath) els.appimagePath.value = "";
  if (els.appimageName) els.appimageName.value = "";
  openModal(els.appimageModal);
  requestAnimationFrame(() => els.appimagePath?.focus());
}

async function pickAppImage() {
  if (state.appimage.picking) return;
  state.appimage.picking = true;
  if (els.appimagePick) els.appimagePick.disabled = true;
  try {
    const path = await invoke("pick_appimage_file");
    if (path) {
      els.appimagePath.value = path;
      const base = String(path).split(/[\\/]/).pop().replace(/\.appimage$/i, "");
      if (els.appimageName && !els.appimageName.value.trim()) els.appimageName.value = base;
      setAppImageError("");
    }
  } catch (err) {
    setAppImageError(errText(err));
  } finally {
    state.appimage.picking = false;
    if (els.appimagePick) els.appimagePick.disabled = false;
  }
}

async function importAppImage() {
  if (state.appimage.importing) return;
  const path = String(els.appimagePath?.value || "").trim();
  const name = String(els.appimageName?.value || "").trim();
  if (!path) {
    setAppImageError("Bir AppImage dosyası seçin.");
    els.appimagePath?.focus();
    return;
  }

  state.appimage.importing = true;
  setAppImageError("");
  const button = els.appimageImport;
  if (button) {
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span>İçe aktarılıyor…';
  }
  showActivity("AppImage içe aktarılıyor…");

  try {
    const app = await invoke("import_appimage_file", { path, name: name || null });
    toast(`${app?.name || "AppImage"} içe aktarıldı.`, "success");
    closeModal(els.appimageModal);
    state.installedLoaded = false;
    await loadInstalled(true);
    await loadStoreInfo();
    if (app?.id && state.detail?.app?.id === app.id) loadDetail(app.id, true);
    if (state.route.name === "installed") renderInstalled();
  } catch (err) {
    const message = errText(err);
    setAppImageError(message);
    toast(message, "error");
  } finally {
    state.appimage.importing = false;
    hideActivity(700);
    if (button) {
      button.disabled = false;
      button.textContent = "İçe aktar";
    }
  }
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

    if (!value) {
      resetSearch({ goDiscover: state.route.name === "search" });
      return;
    }

    searchTimer = setTimeout(() => runSearch(value), 380);
  });

  els.searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      cancelPendingSearch();
      runSearch(els.searchInput.value);
    }
  });

  els.searchClear.addEventListener("click", () => resetSearch({ goDiscover: true, focus: true }));
  els.backButton.addEventListener("click", goBack);
  els.refreshButton.addEventListener("click", refreshCurrent);
  els.logButton.addEventListener("click", openLogModal);
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

    const actionButton = target.closest("[data-action]");
    if (actionButton && !actionButton.disabled) {
      const id = actionButton.dataset.id;
      const action = actionButton.dataset.action;
      if (!id || !ACTIONS[action]) return;
      const app = findAppById(id);
      if (!app) return;
      if (action === "remove") askRemove(app);
      else if (action === "launch") performLaunch(app);
      else performAction(action, app);
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

    const accentChoice = target.closest("[data-accent-choice]");
    if (accentChoice) {
      setAccent(accentChoice.dataset.accentChoice);
      if (state.route.name === "settings") renderSettings();
      toast("Vurgu rengi güncellendi.", "info");
      return;
    }

    const lowPowerToggle = target.closest("[data-low-power-toggle]");
    if (lowPowerToggle) {
      const next = !lowPowerEnabled();
      setLowPower(next);
      if (state.route.name === "settings") renderSettings();
      toast(next ? "Düşük güç modu etkin." : "Düşük güç modu kapatıldı.", "info");
      return;
    }

    const sourceFilter = target.closest("[data-source-filter]");
    if (sourceFilter) {
      state.sourceFilter = sourceFilter.dataset.sourceFilter || "all";
      renderInstalled();
      return;
    }

    const appimageOpen = target.closest("[data-appimage-open]");
    if (appimageOpen) {
      openAppImageModal();
      return;
    }

    const appimagePick = target.closest("[data-appimage-pick]");
    if (appimagePick) {
      pickAppImage();
      return;
    }

    const appimageImport = target.closest("[data-appimage-import]");
    if (appimageImport) {
      importAppImage();
      return;
    }

    const sourceInstall = target.closest("[data-install-source]");
    if (sourceInstall) {
      installSource(sourceInstall.dataset.installSource);
      return;
    }

    const sourceRetry = target.closest("[data-source-retry]");
    if (sourceRetry) {
      loadSourceDiscover(sourceRetry.dataset.sourceRetry, true);
      return;
    }

    const nav = target.closest("[data-nav]");
    if (nav) {
      const page = nav.dataset.nav;
      resetSearch();
      navigate({ name: page }, { root: true });
      if (page === "installed") loadInstalled();
      if (page === "discover") loadDiscover();
      if (page === "settings") loadRemotes();
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

    const open = target.closest("[data-open-app]");
    if (open) {
      const id = open.dataset.openApp;
      if (!id) return;
      els.main.scrollTop = 0;
      if (state.route.name !== "detail" || state.route.id !== id) {
        navigate({ name: "detail", id });
      }
      loadDetail(id);
      return;
    }

    const retry = target.closest("[data-retry]");
    if (retry) {
      const kind = retry.dataset.retry;
      if (kind === "discover") loadDiscover(true);
      else if (kind === "search") runSearch(state.query);
      else if (kind === "installed") loadInstalled(true);
      else if (kind === "category") loadCategory(state.route.slug, 1, true);
      else if (kind === "detail") loadDetail(state.route.id, true);
      else if (kind === "remotes") loadRemotes(true);
      return;
    }

    const more = target.closest("[data-load-more]");
    if (more && !more.disabled) {
      loadCategory(state.route.slug, (state.category?.page || 1) + 1);
      return;
    }

    const filter = target.closest("[data-updates-filter]");
    if (filter) {
      state.updatesOnly = !state.updatesOnly;
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

    if (event.key === "Escape" && state.route.name === "detail") {
      event.preventDefault();
      goBack();
      return;
    }

    if (event.key === "/" && !isTypingTarget(event.target)) {
      event.preventDefault();
      els.searchInput.focus();
      els.searchInput.select();
      return;
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
  bindEvents();
  setTheme(currentTheme());
  setAccent(currentAccent());
  try {
    if (localStorage.getItem("macro-low-power") === "1") setLowPower(true);
  } catch { /* yoksay */ }

  try {
    await listen("app-log", event => appendLog(event.payload));
    await listen("setup-log", event => appendSetupLog(event.payload));
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

const MOCK_SNAP_APPS = [
  { name: "firefox", title: "Firefox", publisher: "Mozilla", version: "141.0.2", summary: "Hızlı, gizli ve güvenli web tarayıcısı.", icon: "https://dl.flathub.org/media/icons/128x128/org.mozilla.firefox.png", classic: false },
  { name: "code", title: "Visual Studio Code", publisher: "Microsoft", version: "1.104.0", summary: "Kod düzenleme, hata ayıklama ve Git desteği.", icon: "https://dl.flathub.org/media/icons/128x128/com.visualstudio.code.png", classic: true },
  { name: "vlc", title: "VLC", publisher: "VideoLAN", version: "3.0.21", summary: "Çoklu ortam dosyalarını oynatın ve yayınlayın.", icon: "https://dl.flathub.org/media/icons/128x128/org.videolan.VLC.png", classic: false },
  { name: "spotify", title: "Spotify", publisher: "Spotify AB", version: "1.2.63", summary: "Müzik ve podcast dinleme uygulaması.", icon: "https://dl.flathub.org/media/icons/128x128/com.spotify.Client.png", classic: false },
  { name: "obsidian", title: "Obsidian", publisher: "Obsidian", version: "1.9.12", summary: "Yerel Markdown notları ve bilgi tabanı.", icon: "https://dl.flathub.org/media/icons/128x128/md.obsidian.Obsidian.png", classic: false },
  { name: "telegram-desktop", title: "Telegram", publisher: "Telegram FZ-LLC", version: "6.2.0", summary: "Hızlı ve güvenli mesajlaşma.", icon: "https://dl.flathub.org/media/icons/128x128/org.telegram.desktop.png", classic: false },
];

const MOCK_BREW_APPS = [
  { token: "wget", version: "1.25.0", summary: "İnternetten dosya indirme aracı", kind: "formula" },
  { token: "htop", version: "3.4.1", summary: "Etkileşimli süreç görüntüleyici", kind: "formula" },
  { token: "neovim", version: "0.11.4", summary: "Modern Vim tabanlı metin düzenleyici", kind: "formula" },
  { token: "ripgrep", version: "14.1.1", summary: "Hızlı metin arama aracı", kind: "formula" },
  { token: "jq", version: "1.8.1", summary: "JSON işleme ve sorgulama aracı", kind: "formula" },
  { token: "visual-studio-code", version: "1.104.0", summary: "Kod düzenleyici", kind: "cask" },
];

function mockSnapItem(app) {
  const id = `snap:${app.name}`;
  return {
    id,
    name: app.title || app.name,
    summary: app.summary || "",
    developer: app.publisher || "Snap Store",
    version: app.version || "",
    icon: app.icon || null,
    installed: MOCK.installed.has(id),
    updateAvailable: MOCK.updates.has(id),
    category: null,
    monthlyInstalls: null,
    heroImage: null,
    source: "snap",
    scope: "system",
    kind: null,
    classic: Boolean(app.classic),
  };
}

function mockBrewItem(app) {
  const id = `homebrew:${app.token}`;
  return {
    id,
    name: app.token,
    summary: app.summary || "",
    developer: "Homebrew",
    version: app.version || "",
    icon: null,
    installed: MOCK.installed.has(id),
    updateAvailable: MOCK.updates.has(id),
    category: null,
    monthlyInstalls: null,
    heroImage: null,
    source: "homebrew",
    scope: "user",
    kind: app.kind || "formula",
    classic: false,
  };
}

function mockAppImageItem(entry) {
  return {
    id: entry.id,
    name: entry.name,
    summary: "Macro Store üzerinden içe aktarılan AppImage",
    developer: "Yerel AppImage",
    version: "Yerel",
    icon: null,
    installed: MOCK.installed.has(entry.id),
    updateAvailable: false,
    category: null,
    monthlyInstalls: null,
    heroImage: null,
    source: "appimage",
    scope: "user",
    kind: null,
    classic: false,
  };
}

function mockAppImageSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "appimage";
}

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
  installed: new Set(mockLoad("macro-mock-installed", [
    "org.mozilla.firefox",
    "org.videolan.VLC",
    "snap:spotify",
    "homebrew:htop",
  ])),
  updates: new Set(mockLoad("macro-mock-updates", ["org.videolan.VLC", "homebrew:htop"])),
  setup: mockLoad("macro-mock-setup", { flatpak: true, flathub: true, snap: true, brew: true }),
  appimages: mockLoad("macro-mock-appimages", []),
  remotes: mockLoad("macro-mock-remotes", [
    { name: "flathub", title: "Flathub", url: "https://dl.flathub.org/repo/", scope: "user", comment: "Flathub uygulama deposu", icon: "https://dl.flathub.org/repo/logo.svg", deletable: false },
    { name: "flathub", title: "Flathub", url: "https://dl.flathub.org/repo/", scope: "system", comment: "Flathub uygulama deposu", icon: "https://dl.flathub.org/repo/logo.svg", deletable: false },
  ]),
  appCache: new Map(),
};

if (!Array.isArray(MOCK.remotes)) MOCK.remotes = [];
if (!Array.isArray(MOCK.appimages)) MOCK.appimages = [];
if (!MOCK.setup || typeof MOCK.setup !== "object") {
  MOCK.setup = { flatpak: true, flathub: true, snap: true, brew: true };
}
if (MOCK.setup.snap === undefined) MOCK.setup.snap = true;
if (MOCK.setup.brew === undefined) MOCK.setup.brew = true;

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
    source: "flatpak",
    scope: "user",
    kind: null,
    classic: false,
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
    source: "flatpak",
    scope: "user",
    kind: null,
    classic: false,
  };
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
    source: "flatpak",
    scope: "user",
    kind: null,
    classic: false,
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
  if (String(query || "").trim().length < 2) {
    throw new Error("Arama için en az 2 karakter yazın.");
  }
  const needle = String(query).toLocaleLowerCase("tr");
  const extras = [
    ...MOCK_SNAP_APPS.map(mockSnapItem),
    ...MOCK_BREW_APPS.map(mockBrewItem),
  ].filter(app => `${app.name} ${app.summary} ${app.id}`.toLocaleLowerCase("tr").includes(needle));

  let flatpak = [];
  try {
    const data = await mockFetchJson(`${FLATHUB}/search?locale=tr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, hits_per_page: 36, page: 1 }),
    });
    flatpak = (data.hits || []).map(mockApiApp);
  } catch {
    flatpak = mockFallbackList().filter(app =>
      `${app.name} ${app.summary} ${app.id}`.toLocaleLowerCase("tr").includes(needle),
    );
  }
  const seen = new Set(flatpak.map(app => app.id));
  return [...flatpak, ...extras.filter(app => !seen.has(app.id))];
}

function mockSourceItem(id) {
  const source = id.includes(":") ? id.split(":")[0] : "";
  const native = id.includes(":") ? id.split(":").slice(1).join(":") : id;
  if (source === "snap") {
    const app = MOCK_SNAP_APPS.find(item => item.name === native);
    return app ? mockSnapItem(app) : null;
  }
  if (source === "homebrew") {
    const app = MOCK_BREW_APPS.find(item => item.token === native);
    return app ? mockBrewItem(app) : null;
  }
  if (source === "appimage") {
    const entry = MOCK.appimages.find(item => item.id === id);
    return entry ? mockAppImageItem(entry) : null;
  }
  return null;
}

function mockSourceDiscover(source) {
  if (source === "snap") return MOCK_SNAP_APPS.slice(0, 4).map(mockSnapItem);
  if (source === "homebrew") return MOCK_BREW_APPS.slice(0, 5).map(mockBrewItem);
  if (source === "appimage") return MOCK.appimages.map(mockAppImageItem);
  return [];
}

function mockSourceDetail(id) {
  const app = mockSourceItem(id);
  if (!app) throw new Error("Uygulama bulunamadı.");
  const source = appSource(app);
  const description = source === "snap"
    ? `${app.name}, Snap Store üzerinden sistem genelinde kurulur. Snap paketleri kendi çalışma zamanlarını taşır ve otomatik güncellenir.`
    : source === "homebrew"
      ? `${app.name}, Homebrew ${app.kind === "cask" ? "cask" : "formülü"} olarak kullanıcı kapsamında kurulur. Paket bilgileri Homebrew API’sinden alınır.`
      : "Bu uygulama yerel bir AppImage dosyasıdır. Dosya Macro Store veri dizininde saklanır ve uygulama menüsüne eklenir.";
  return {
    app,
    description,
    screenshots: [],
    categories: [],
    license: source === "snap" ? "Snap Store" : source === "homebrew" ? "Homebrew" : "Yerel dosya",
    verified: false,
    homepage: null,
    downloadSize: null,
    installedSize: null,
    installsLastMonth: null,
    rating: null,
    reviews: [],
  };
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

async function mockDetail(id) {
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
  };
}

async function mockInstalledApps() {
  const flatpakIds = [...MOCK.installed].filter(id => !id.includes(":"));
  const flatpak = await Promise.all(flatpakIds.map(id =>
    mockAppstream(id).then(entry => entry.app).catch(() => mockFallback(id)),
  ));
  const extras = [...MOCK.installed]
    .filter(id => id.includes(":"))
    .map(mockSourceItem)
    .filter(Boolean);
  return [...flatpak, ...extras]
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

async function mockOperation(action, id) {
  if (!ACTIONS[action]) throw new Error("Bilinmeyen işlem.");
  if (action !== "install" && !MOCK.installed.has(id)) {
    throw new Error("Bu uygulama yüklü değil.");
  }

  const source = id.includes(":") ? id.split(":")[0] : "flatpak";
  const native = id.includes(":") ? id.slice(source.length + 1) : id;
  const manager = source === "snap"
    ? "Snap"
    : source === "homebrew"
      ? "Homebrew"
      : source === "appimage"
        ? "AppImage"
        : "Flatpak";
  const cached = MOCK.appCache.get(id)?.app;
  const name = mockSourceItem(id)?.name
    || cached?.name
    || MOCK_FALLBACK_APPS.find(app => app.id === id)?.name
    || id;
  const command = source === "snap"
    ? `pkexec snap ${action === "update" ? "refresh" : action} ${native}`
    : source === "homebrew"
      ? `brew ${action === "update" ? "upgrade" : action} ${native}`
      : source === "appimage"
        ? `rm ${MOCK.appimages.find(entry => entry.id === id)?.path || native}`
        : action === "install"
          ? `flatpak install --user -y flathub ${native}`
          : action === "remove"
            ? `flatpak uninstall --user -y ${native}`
            : `flatpak update --user -y ${native}`;

  emitMock("app-log", { line: `Komut: ${command}`, kind: "cmd" });
  await sleep(260);
  emitMock("app-log", { line: `${manager} işlemi hazırlanıyor…`, kind: "info" });
  await sleep(380);
  emitMock("app-log", { line: action === "remove" ? "Uygulama kaldırılıyor…" : action === "update" ? "Güncelleme indiriliyor…" : "Uygulama indiriliyor…", kind: "stdout" });
  await sleep(520);

  if (action === "install") {
    MOCK.installed.add(id);
    MOCK.updates.delete(id);
  } else if (action === "remove") {
    MOCK.installed.delete(id);
    MOCK.updates.delete(id);
    if (source === "appimage") {
      MOCK.appimages = MOCK.appimages.filter(entry => entry.id !== id);
      mockSave("macro-mock-appimages", MOCK.appimages);
    }
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
    manager,
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
  const snap = Boolean(MOCK.setup.snap);
  const brew = Boolean(MOCK.setup.brew);
  return {
    flatpakAvailable: flatpak,
    flatpakVersion: flatpak ? "1.18.4" : null,
    flathubAvailable: flathub,
    userFlathubAvailable: flathub,
    snapAvailable: snap,
    snapVersion: snap ? "2.68.3" : null,
    snapdRunning: snap,
    snapInstallSupported: true,
    snapManualCommand: "sudo pacman -S snapd && sudo systemctl enable --now snapd.socket",
    brewAvailable: brew,
    brewVersion: brew ? "4.6.4" : null,
    brewPrefix: brew ? "/home/linuxbrew/.linuxbrew" : null,
    brewInstallSupported: true,
    brewManualCommand: "/bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"",
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

async function mockInstallSnap() {
  if (!MOCK.setup.snap) {
    emitMock("setup-log", { line: "Komut: pkexec /usr/bin/dnf install -y snapd", kind: "cmd" });
    await sleep(300);
    emitMock("setup-log", { line: "snapd, DNF · Fedora/RHEL ile kuruluyor…", kind: "info" });
    await sleep(900);
    emitMock("setup-log", { line: "snapd hizmeti etkinleştirildi.", kind: "info" });
    MOCK.setup.snap = true;
  }
  mockSave("macro-mock-setup", MOCK.setup);
  await sleep(350);
  emitMock("setup-log", { line: "✓ Snap kullanıma hazır.", kind: "info" });
  const status = mockSetupStatus();
  emitMock("setup-finished", status);
  return status;
}

async function mockInstallHomebrew() {
  if (!MOCK.setup.brew) {
    emitMock("setup-log", { line: "Komut: NONINTERACTIVE=1 /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"", kind: "cmd" });
    await sleep(300);
    emitMock("setup-log", { line: "Homebrew resmi kurulum betiği çalıştırılıyor…", kind: "info" });
    await sleep(1000);
    emitMock("setup-log", { line: "✓ Homebrew kullanıcı dizinine kuruldu.", kind: "info" });
    MOCK.setup.brew = true;
  }
  mockSave("macro-mock-setup", MOCK.setup);
  await sleep(350);
  emitMock("setup-log", { line: "✓ Homebrew kullanıma hazır.", kind: "info" });
  const status = mockSetupStatus();
  emitMock("setup-finished", status);
  return status;
}

function mockPickAppImage() {
  return "/home/kullanıcı/İndirilenler/MacroOrnek.AppImage";
}

function mockImportAppImage(path, name) {
  const clean = String(path || "").trim();
  if (!/\.appimage$/i.test(clean)) {
    throw new Error("Seçilen dosya bir .AppImage değil.");
  }
  const base = clean.split(/[\\/]/).pop() || "Uygulama.AppImage";
  const display = String(name || "").trim() || base.replace(/\.appimage$/i, "");
  const id = `appimage:${mockAppImageSlug(display)}`;
  const entry = {
    id,
    name: display,
    path: clean,
    iconPath: null,
    size: 84_000_000,
    importedAt: Date.now(),
  };
  MOCK.appimages = MOCK.appimages.filter(item => item.id !== id);
  MOCK.appimages.push(entry);
  MOCK.installed.add(id);
  mockSave("macro-mock-appimages", MOCK.appimages);
  mockSave("macro-mock-installed", [...MOCK.installed]);
  emitMock("app-log", { line: `✓ ${display} AppImage olarak içe aktarıldı.`, kind: "info" });
  return mockAppImageItem(entry);
}

function mockRemoveAppImage(id) {
  const before = MOCK.appimages.length;
  MOCK.appimages = MOCK.appimages.filter(entry => entry.id !== id);
  if (MOCK.appimages.length === before) throw new Error("AppImage bulunamadı.");
  MOCK.installed.delete(id);
  mockSave("macro-mock-appimages", MOCK.appimages);
  mockSave("macro-mock-installed", [...MOCK.installed]);
  return "AppImage mağazadan kaldırıldı.";
}

function mockLaunchAppImage(id) {
  const entry = MOCK.appimages.find(item => item.id === id);
  if (!entry) throw new Error("AppImage bulunamadı.");
  emitMock("app-log", { line: `Uygulama başlatıldı: ${entry.path}`, kind: "info" });
  return null;
}

async function mockInvoke(command, args = {}) {
  if (command === "get_setup_status") {
    await sleep(260);
    return mockSetupStatus();
  }

  if (command === "install_flatpak") {
    return mockInstallFlatpak();
  }

  if (command === "install_snap") {
    return mockInstallSnap();
  }

  if (command === "install_homebrew") {
    return mockInstallHomebrew();
  }

  if (command === "get_store_info") {
    await sleep(120);
    return {
      flatpakAvailable: Boolean(MOCK.setup.flatpak),
      flatpakVersion: MOCK.setup.flatpak ? "1.18.4" : null,
      flathubAvailable: Boolean(MOCK.setup.flathub),
      userFlathubAvailable: Boolean(MOCK.setup.flathub),
      snapAvailable: Boolean(MOCK.setup.snap),
      snapVersion: MOCK.setup.snap ? "2.68.3" : null,
      brewAvailable: Boolean(MOCK.setup.brew),
      brewVersion: MOCK.setup.brew ? "4.6.4" : null,
      appimageCount: MOCK.appimages.length,
    };
  }

  if (command === "get_discover") {
    return mockDiscover(args.date || todayISO());
  }

  if (command === "search_apps") {
    return mockSearch(args.query);
  }

  if (command === "get_category") {
    return mockCategory(args.slug, args.page || 1);
  }

  if (command === "get_app_detail") {
    const id = args.id || args.appId || args.app_id;
    if (id && String(id).includes(":")) return mockSourceDetail(id);
    return mockDetail(id);
  }

  if (command === "get_source_discover") {
    await sleep(180);
    return mockSourceDiscover(args.source);
  }

  if (command === "list_installed_apps") {
    await sleep(180);
    return mockInstalledApps();
  }

  if (command === "list_appimages") {
    await sleep(90);
    return MOCK.appimages.map(mockAppImageItem);
  }

  if (command === "pick_appimage_file") {
    await sleep(120);
    return mockPickAppImage();
  }

  if (command === "import_appimage_file") {
    await sleep(420);
    return mockImportAppImage(args.path, args.name);
  }

  if (command === "remove_appimage_file") {
    await sleep(220);
    return mockRemoveAppImage(args.id);
  }

  if (command === "launch_appimage_file") {
    await sleep(80);
    return mockLaunchAppImage(args.id);
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
    return mockOperation(action, args.id);
  }

  throw new Error(`Bilinmeyen komut: ${command}`);
}

init();
/* __END__ */
