/* Minimal i18n layer: Turkish is the source language, English is a translation. */
(function () {
  const LANG_KEY = "macro-lang";
  const SUPPORTED = ["tr", "en"];

  const DICT = {
    tr: {
      "doc.title": "Macro Store — Linux Uygulama Mağazası",
      "app.subtitle": "Linux uygulama mağazası",

      "nav.mainLabel": "Ana gezinme",
      "nav.bottomLabel": "Kitaplık ve seçenekler",
      "nav.discover": "Keşfet",
      "nav.categories": "Kategoriler",
      "nav.favorites": "Favoriler",
      "nav.installed": "Yüklü Uygulamalar",
      "nav.settings": "Seçenekler",

      "status.checking": "Flatpak denetleniyor…",
      "status.ready": "Mağaza hazır",
      "status.partial": "Bazı kaynaklar kullanılamıyor",

      "search.placeholder": "Uygulama ara",
      "search.label": "Uygulama ara",
      "search.clear": "Aramayı temizle",
      "search.history": "Son aramalar",
      "search.filters.label": "Arama sonuçlarını filtrele",
      "search.verified": "Doğrulanmış",
      "search.freeLicense": "Özgür lisans",

      "topbar.back": "Geri",
      "topbar.shortcuts": "Klavye kısayolları",
      "topbar.refresh": "Yenile",
      "topbar.log": "İşlem günlüğü",

      "activity.busy": "İşlem sürüyor…",
      "activity.log": "Günlük",

      "setup.eyebrow": "Sistem hazırlığı",
      "setup.title": "Flatpak denetleniyor",
      "setup.subtitle": "Mağaza için gerekli bileşenler kontrol ediliyor.",
      "setup.close": "Kurulum penceresini kapat",

      "log.title": "İşlem günlüğü",
      "log.subtitle": "Flatpak çıktısı",
      "log.clear": "Temizle",
      "log.close": "Kapat",
      "log.esc": "Kapatmak için Esc",
      "log.lines": "{count} satır",

      "confirm.eyebrow": "Onay",
      "confirm.title": "Emin misiniz?",
      "confirm.cancel": "Vazgeç",
      "confirm.accept": "Devam et",

      "shortcuts.title": "Klavye kısayolları",
      "shortcuts.subtitle": "Mağazayı klavyeyle kullanın",
      "shortcuts.focusSearch": "Aramaya odaklan",
      "shortcuts.back": "Geri dön veya pencereyi kapat",
      "shortcuts.prev": "Önceki ekrana dön",
      "shortcuts.open": "Seçili kartı aç",
      "shortcuts.refresh": "Geçerli ekranı yenile",
      "shortcuts.favorite": "Ayrıntı ekranında favorilere ekle / çıkar",
      "shortcuts.help": "Bu yardım penceresini aç",
      "shortcuts.tip": "İpucu: Arama kutusundayken Esc aramayı temizler.",

      "cli.title": "CLI komutları",
      "cli.subtitle": "Terminalden yönet",
      "cli.foot": "Komutları kopyalayıp terminalinize yapıştırın.",
      "cli.copyAll": "Tümünü kopyala",

      "lightbox.close": "Kapat",
      "lightbox.prev": "Önceki görüntü",
      "lightbox.next": "Sonraki görüntü",

      "view.discover.sub": "Öne çıkan uygulamalar, haftanın seçkileri ve yeni eklenenler.",
      "view.categories.sub": "İlgi alanınıza göre uygulamalara göz atın.",
      "view.categories.count": "{count} kategori",
      "view.search.eyebrow": "Arama",
      "view.search.sub": "Flatpak, Snap ve Homebrew kataloglarında arama.",
      "view.favorites.eyebrow": "Kitaplık",
      "view.favorites.title": "Favoriler",
      "view.installed.sub": "Yüklü uygulamalarınız ve bekleyen güncellemeler.",
      "view.settings.sub": "Görünümü ve uygulama kaynaklarını yönetin.",
      "view.settings.version": "Sürüm {version}",

      "action.install": "Kur",
      "action.update": "Güncelle",
      "action.remove": "Kaldır",
      "action.open": "Aç",
      "action.busy": "İşleniyor…",
      "action.installRunning": "Kuruluyor…",
      "action.updateRunning": "Güncelleniyor…",
      "action.removeRunning": "Kaldırılıyor…",
      "action.prune": "Bakım",
      "action.channel": "Kanal",
      "action.mask": "Güncelleme durdurma",
      "action.unmask": "Güncelleme sürdürme",
      "action.rollback": "Sürüm geri alma",
      "action.batch": "Toplu işlem",

      "settings.appearance": "Görünüm",
      "settings.appearanceDesc": "Göz yormayan açık tonlar ya da koyu mağaza görünümü arasında geçiş yapın.",
      "settings.themeLight": "Açık tema",
      "settings.themeLightDesc": "Yumuşak, aydınlık tonlar",
      "settings.themeDark": "Koyu tema",
      "settings.themeDarkDesc": "Düşük ışıkta rahat kullanım",
      "settings.language": "Dil",
      "settings.languageDesc": "Mağaza arayüzünde kullanılacak dili seçin.",
      "settings.language.tr": "Türkçe",
      "settings.language.en": "English",
      "settings.setup": "Sistem hazırlığı",
      "settings.setupDesc": "Flatpak kullanıcı kapsamında kurulur. Snap sistem kapsamında yönetilir; Homebrew kendi paket yöneticisini kullanır. Burada yalnızca algılanan kullanılabilirlik gösterilir.",
      "settings.remotes": "Depolar",
      "settings.remotesDesc": "Flathub varsayılan kaynaktır. Kullanıcı kapsamına özel Flatpak depoları ekleyebilirsiniz.",
      "settings.activity": "İşlem geçmişi",
      "settings.activityDesc": "Son kurulum, güncelleme ve kaldırma işlemleri yalnızca bu cihazda saklanır.",
      "settings.taps": "Homebrew tap'leri",
      "settings.tapsDesc": "Ek depoları yönetin. Tap eklemek ya da kaldırmak Homebrew aramalarını etkiler.",
      "settings.maintenance": "Bakım",
      "settings.maintenanceDesc": "Yüklü uygulamaların artık ihtiyaç duymadığı Flatpak çalışma zamanlarını kaldırın.",
      "settings.store": "Mağaza bilgileri",
      "settings.prune": "Kullanılmayan çalışma zamanlarını temizle",
      "settings.pruning": "Temizleniyor…",
      "settings.pruneConfirmTitle": "Çalışma zamanlarını temizle",
      "settings.pruneConfirmText": "Hiçbir uygulamanın kullanmadığı Flatpak çalışma zamanları kaldırılacak. Yüklü uygulamalar etkilenmez.",
      "settings.pruneConfirm": "Temizle",
      "settings.clearActivity": "Geçmişi temizle",
      "settings.activityEmpty": "Henüz işlem geçmişi yok. Kurulum, güncelleme ve kaldırma işlemleri burada listelenir.",
      "settings.accent": "Vurgu rengi",
      "settings.accentUpdated": "Vurgu rengi güncellendi.",
      "settings.accent.default": "Varsayılan",
      "settings.accent.red": "Kırmızı",
      "settings.accent.blue": "Mavi",
      "settings.accent.green": "Yeşil",
      "settings.accent.yellow": "Sarı",
      "settings.accent.purple": "Mor",
      "settings.performance": "Performans",
      "settings.performanceDesc": "Düşük güç modu animasyonları, gölgeleri ve bulanıklığı azaltarak kaynak tüketimini düşürür.",
      "settings.lowPower": "Düşük güç modu",
      "settings.lowPowerDesc": "Her sistemde çalışır. Etkinleştirildiğinde geçişler anında tamamlanır ve görsel efektler sadeleşir.",
      "settings.lowPowerOn": "Düşük güç modu etkin.",
      "settings.lowPowerOff": "Düşük güç modu kapatıldı.",
      "settings.appimageCount": "{count} dosya",
      "settings.appimageReady": "Hazır",

      "appimage.add": "AppImage ekle",
      "appimage.title": "AppImage içe aktar",
      "appimage.subtitle": "Dışarıdan edindiğiniz AppImage dosyasını mağazaya ekleyin.",
      "appimage.path": "AppImage dosyası",
      "appimage.pathPlaceholder": "/home/kullanıcı/İndirilenler/Uygulama.AppImage",
      "appimage.pick": "Göz at",
      "appimage.name": "Görünen ad",
      "appimage.nameHint": "(isteğe bağlı)",
      "appimage.namePlaceholder": "Boş bırakılırsa dosya adı kullanılır",
      "appimage.hint": "Dosya kopyalanır, çalıştırılabilir yapılır ve uygulama menüsüne eklenir. Özgün dosya yerinde kalır.",
      "appimage.import": "İçe aktar",
      "appimage.importing": "İçe aktarılıyor…",
      "appimage.chooseError": "Bir AppImage dosyası seçin.",
      "appimage.imported": "{name} içe aktarıldı.",
      "appimage.close": "AppImage penceresini kapat",

      "common.cancel": "Vazgeç",
      "common.retry": "Yeniden dene",
      "common.close": "Kapat",
    },
    en: {
      "doc.title": "Macro Store — Linux App Store",
      "app.subtitle": "Linux app store",

      "nav.mainLabel": "Main navigation",
      "nav.bottomLabel": "Library and options",
      "nav.discover": "Discover",
      "nav.categories": "Categories",
      "nav.favorites": "Favorites",
      "nav.installed": "Installed Apps",
      "nav.settings": "Options",

      "status.checking": "Checking Flatpak…",
      "status.ready": "Store ready",
      "status.partial": "Some sources unavailable",

      "search.placeholder": "Search apps",
      "search.label": "Search apps",
      "search.clear": "Clear search",
      "search.history": "Recent searches",
      "search.filters.label": "Filter search results",
      "search.verified": "Verified",
      "search.freeLicense": "Free license",

      "topbar.back": "Back",
      "topbar.shortcuts": "Keyboard shortcuts",
      "topbar.refresh": "Refresh",
      "topbar.log": "Activity log",

      "activity.busy": "Working…",
      "activity.log": "Log",

      "setup.eyebrow": "System setup",
      "setup.title": "Checking Flatpak",
      "setup.subtitle": "Verifying the components the store needs.",
      "setup.close": "Close setup dialog",

      "log.title": "Activity log",
      "log.subtitle": "Flatpak output",
      "log.clear": "Clear",
      "log.close": "Close",
      "log.esc": "Press Esc to close",
      "log.lines": "{count} lines",

      "confirm.eyebrow": "Confirm",
      "confirm.title": "Are you sure?",
      "confirm.cancel": "Cancel",
      "confirm.accept": "Continue",

      "shortcuts.title": "Keyboard shortcuts",
      "shortcuts.subtitle": "Drive the store from the keyboard",
      "shortcuts.focusSearch": "Focus search",
      "shortcuts.back": "Go back or close the dialog",
      "shortcuts.prev": "Go to the previous screen",
      "shortcuts.open": "Open the selected card",
      "shortcuts.refresh": "Refresh the current screen",
      "shortcuts.favorite": "Add or remove a favorite on the detail screen",
      "shortcuts.help": "Open this help dialog",
      "shortcuts.tip": "Tip: pressing Esc in the search field clears the query.",

      "cli.title": "CLI commands",
      "cli.subtitle": "Manage from the terminal",
      "cli.foot": "Copy a command and paste it into your terminal.",
      "cli.copyAll": "Copy all",

      "lightbox.close": "Close",
      "lightbox.prev": "Previous image",
      "lightbox.next": "Next image",

      "view.discover.sub": "Featured apps, weekly picks, and recent additions.",
      "view.categories.sub": "Browse apps by interest.",
      "view.categories.count": "{count} categories",
      "view.search.eyebrow": "Search",
      "view.search.sub": "Search the Flatpak, Snap, and Homebrew catalogs.",
      "view.favorites.eyebrow": "Library",
      "view.favorites.title": "Favorites",
      "view.installed.sub": "Your installed apps and available updates.",
      "view.settings.sub": "Manage appearance and app sources.",
      "view.settings.version": "Version {version}",

      "action.install": "Install",
      "action.update": "Update",
      "action.remove": "Remove",
      "action.open": "Open",
      "action.busy": "Working…",
      "action.installRunning": "Installing…",
      "action.updateRunning": "Updating…",
      "action.removeRunning": "Removing…",
      "action.prune": "Maintenance",
      "action.channel": "Channel",
      "action.mask": "Pause updates",
      "action.unmask": "Resume updates",
      "action.rollback": "Version rollback",
      "action.batch": "Batch action",

      "settings.appearance": "Appearance",
      "settings.appearanceDesc": "Switch between soft light tones and a dark store.",
      "settings.themeLight": "Light theme",
      "settings.themeLightDesc": "Soft, bright tones",
      "settings.themeDark": "Dark theme",
      "settings.themeDarkDesc": "Comfortable in low light",
      "settings.language": "Language",
      "settings.languageDesc": "Choose the language used across the store interface.",
      "settings.language.tr": "Türkçe",
      "settings.language.en": "English",
      "settings.setup": "System setup",
      "settings.setupDesc": "Flatpak is installed per user. Snap is managed system-wide and Homebrew uses its own package manager. Only detected availability is shown here.",
      "settings.remotes": "Remotes",
      "settings.remotesDesc": "Flathub is the default source. You can add user-scoped Flatpak remotes.",
      "settings.activity": "Activity history",
      "settings.activityDesc": "Recent install, update, and remove operations are stored only on this device.",
      "settings.taps": "Homebrew taps",
      "settings.tapsDesc": "Manage extra repositories. Adding or removing a tap affects Homebrew searches.",
      "settings.maintenance": "Maintenance",
      "settings.maintenanceDesc": "Remove Flatpak runtimes that installed apps no longer need.",
      "settings.store": "Store information",
      "settings.prune": "Clean unused runtimes",
      "settings.pruning": "Cleaning…",
      "settings.pruneConfirmTitle": "Clean runtimes",
      "settings.pruneConfirmText": "Flatpak runtimes that no app uses will be removed. Installed apps are not affected.",
      "settings.pruneConfirm": "Clean",
      "settings.clearActivity": "Clear history",
      "settings.activityEmpty": "No activity yet. Installs, updates, and removals show up here.",
      "settings.accent": "Accent color",
      "settings.accentUpdated": "Accent color updated.",
      "settings.accent.default": "Default",
      "settings.accent.red": "Red",
      "settings.accent.blue": "Blue",
      "settings.accent.green": "Green",
      "settings.accent.yellow": "Yellow",
      "settings.accent.purple": "Purple",
      "settings.performance": "Performance",
      "settings.performanceDesc": "Low power mode reduces resource use by cutting animations, shadows, and blur.",
      "settings.lowPower": "Low power mode",
      "settings.lowPowerDesc": "Works on every system. When enabled, transitions finish instantly and visual effects are simplified.",
      "settings.lowPowerOn": "Low power mode enabled.",
      "settings.lowPowerOff": "Low power mode disabled.",
      "settings.appimageCount": "{count} files",
      "settings.appimageReady": "Ready",

      "appimage.add": "Add AppImage",
      "appimage.title": "Import AppImage",
      "appimage.subtitle": "Add an AppImage file you obtained elsewhere to the store.",
      "appimage.path": "AppImage file",
      "appimage.pathPlaceholder": "/home/user/Downloads/Application.AppImage",
      "appimage.pick": "Browse",
      "appimage.name": "Display name",
      "appimage.nameHint": "(optional)",
      "appimage.namePlaceholder": "Leave empty to use the file name",
      "appimage.hint": "The file is copied, made executable, and added to the app menu. The original file stays in place.",
      "appimage.import": "Import",
      "appimage.importing": "Importing…",
      "appimage.chooseError": "Select an AppImage file.",
      "appimage.imported": "{name} imported.",
      "appimage.close": "Close AppImage dialog",

      "common.cancel": "Cancel",
      "common.retry": "Try again",
      "common.close": "Close",
    },
  };

  let lang = "tr";

  function normalize(value) {
    return SUPPORTED.includes(value) ? value : "tr";
  }

  function detect() {
    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (stored) return normalize(stored);
    } catch {
      /* storage may be unavailable */
    }
    const browser = String(navigator.language || "").slice(0, 2).toLowerCase();
    return normalize(browser);
  }

  function t(key, vars) {
    const table = DICT[lang] || {};
    let value = table[key];
    if (value === undefined) value = DICT.tr[key];
    if (value === undefined) return key;
    if (!vars) return value;
    return value.replace(/\{(\w+)\}/g, (match, name) => (vars[name] ?? match));
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach(element => {
      element.textContent = t(element.dataset.i18n);
    });
    scope.querySelectorAll("[data-i18n-title]").forEach(element => {
      element.title = t(element.dataset.i18nTitle);
    });
    scope.querySelectorAll("[data-i18n-aria]").forEach(element => {
      element.setAttribute("aria-label", t(element.dataset.i18nAria));
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach(element => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });
    const title = document.querySelector("title[data-i18n]");
    if (title) title.textContent = t(title.dataset.i18n);
    document.documentElement.lang = lang;
  }

  function setLang(next) {
    lang = normalize(next);
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* storage may be unavailable */
    }
    apply();
    document.dispatchEvent(new CustomEvent("macro-lang-change", { detail: { lang } }));
  }

  lang = detect();

  window.MacroI18n = {
    t,
    apply,
    setLang,
    detect,
    SUPPORTED,
    get lang() {
      return lang;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => apply());
  } else {
    apply();
  }
})();
