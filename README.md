# Macro Store

Macro Store, **Flathub** kataloğunu sade ve göz yormayan bir arayüzle sunan
hafif bir Linux yazılım mağazasıdır. Uygulamaları keşfeder, arar, ayrıntılarını
ve topluluk yorumlarını inceler; Flatpak uygulamalarını kullanıcı kapsamında
kurar, kaldırır ve günceller.

Mağaza yalnızca Flatpak ve Flathub ekosistemine odaklanır. Yerel paket
yöneticileri mağaza özelliği olarak kullanılmaz; sistem paket yöneticisi yalnızca
ilk kurulumda eksik Flatpak'ı kurmak için çağrılır.

## Özellikler

- Tauri 2 + Rust arka uç, saf HTML/CSS/JS ön yüz (npm/bundler yok)
- Flathub'dan günün uygulaması, haftanın seçkisi, popüler ve yeni eklenenler
- Kategoriler, arama ve uygulama ayrıntı ekranı
- Flathub açıklaması, sürüm bilgisi, ekran görüntüleri ve bağlantılar
- ODRS üzerinden topluluk puanları ve yorumları
- Kullanıcı kapsamında kurulum, kaldırma ve güncelleme
- Yüklü uygulamalar listesi ve güncelleme filtresi
- Açık ve koyu tema; seçim yerel olarak saklanır
- Depo yönetimi: Flathub korunur, özel Flatpak kullanıcı depoları eklenebilir
- Homebrew benzeri ek kaynaklar için "Yakında" görünümü
- Adwaita Sans fontu uygulamaya gömülüdür; harici font isteği yapılmaz

## İlk açılış ve sistem hazırlığı

Macro Store açıldığında host sistemde Flatpak ve kullanıcı kapsamında Flathub
deposu olup olmadığını denetler. Eksik varsa bir hazırlık penceresi açılır:

1. Flatpak sürümü ve Flathub deposu denetlenir.
2. Flatpak yoksa dağıtımın paket yöneticisiyle kurulur.
3. `flathub` kullanıcı deposu eklenir.
4. Durum yeniden denetlenir; hazır olduğunda mağaza kullanılabilir.

Flatpak kurulumu sistem genelinde bir işlem olduğu için polkit (`pkexec`)
üzerinden yetki isteyebilir. Desteklenen paket yöneticileri:

| Dağıtım ailesi | Komut |
| --- | --- |
| Debian / Ubuntu | `apt-get` |
| Fedora / RHEL | `dnf` |
| Arch Linux | `pacman` |
| openSUSE | `zypper` |
| Alpine | `apk` |
| Void Linux | `xbps-install` |
| Solus | `eopkg` |
| Fedora Silverblue / ostree | `rpm-ostree` |

`rpm-ostree` sistemlerinde paket katmanı eklendikten sonra yeniden başlatma
gerekebilir; pencere bunu ayrıca bildirir. Desteklenmeyen bir sistemde manuel
kurulum komutu gösterilir ve kopyalanabilir.

Hazırlık durumu `localStorage` içinde saklanır. Flatpak veya Flathub sonradan
eksilirse pencere sonraki açılışlarda yeniden gösterilir. Pencereye Keşfet ve
Yüklü Uygulamalar ekranlarındaki uyarılardan ya da **Seçenekler → Sistem
hazırlığı** bölümünden yeniden erişilebilir.

## Flatpak / Flathub

Flatpak uygulama işlemleri **kullanıcı kapsamında** (`--user`) yürütülür ve
normal kullanımda yönetici parolası gerektirmez.

- Kurulum: `flatpak install --user -y`
- Kaldırma: `flatpak uninstall --user -y`
- Güncelleme: `flatpak update --user -y`
- Yüklü uygulamalar: `flatpak list --user --app`
- Depolar: `flatpak remotes --user`
- İlk kurulumdaki Flathub deposu:
  `flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo`

Sistem kapsamındaki depolar yalnızca görüntülenir; mağaza üzerinden
kaldırılamaz.

Flathub API'si arama, öneriler, kategoriler ve uygulama ayrıntıları için;
ODRS ise topluluk puanları ve yorumları için kullanılır. HTTP istekleri Rust
tarafında `reqwest` ile yapılır.

## Gereksinimler

- Flatpak 1.12 veya üzeri (ilk açılışta kurulabilir)
- Çalışma zamanında GTK 3 ve WebKitGTK 4.1
- Derleme için Rust, Tauri 2 CLI ve ilgili geliştirme paketleri

Paketler, Tauri'nin ürettiği bağımlılık listesiyle birlikte gelir. `.deb` ve
`.rpm` kurulumları sistemdeki WebKitGTK 4.1 ve GTK 3 kütüphanelerini kullanır.

## Hazır paketler

Proje kökünde çalışmaya hazır iki paket bulunur:

```bash
# Debian / Ubuntu
sudo apt install ./MacroStore_0.3.0_amd64.deb

# Fedora / RHEL / openSUSE
sudo dnf install ./MacroStore-0.3.0-1.x86_64.rpm
# veya
sudo zypper install ./MacroStore-0.3.0-1.x86_64.rpm
```

Kurulumdan sonra uygulamayı uygulama menüsünden veya terminalden açın:

```bash
macro-store
```

Paket bütünlüğünü doğrulamak için:

```bash
sha256sum -c MacroStore_0.3.0.sha256
```

## Hazır AppImage

Proje kökündeki taşınabilir AppImage sürümü:

```bash
chmod +x MacroStore_0.3.0_amd64.AppImage
./MacroStore_0.3.0_amd64.AppImage
```

AppImage; GTK 3 ve WebKitGTK 4.1 kütüphanelerini kendi içinde taşır. Sistemde
FUSE yoksa:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./MacroStore_0.3.0_amd64.AppImage
```

## Geliştirme

```bash
# Tauri CLI (bir kez)
cargo install tauri-cli --version "^2" --locked

# Geliştirme derlemesi
cd src-tauri
cargo tauri dev

# Yalnızca arka uç denetimleri
cargo check --all-targets
cargo test
cargo clippy --all-targets -- -D warnings
```

Arayüz, Tauri olmadan da tarayıcıda açılabilir. `ui/index.html` dosyasını yerel
bir HTTP sunucusundan açtığınızda demo verisiyle çalışır. Tarayıcı önizlemesi
Flathub/ODRS isteklerini yerel bir proxy üzerinden yapar; gerçek uygulamada bu
yol kullanılmaz.

## Paket üretme

```bash
cd src-tauri
cargo tauri build --bundles deb,rpm
```

Çıktılar:

```
src-tauri/target/release/bundle/deb/Macro Store_0.3.0_amd64.deb
src-tauri/target/release/bundle/rpm/Macro Store-0.3.0-1.x86_64.rpm
```

AppImage isteğe bağlı olarak ayrıca üretilebilir:

```bash
cargo tauri build --bundles appimage
```

Çıktı:

```
src-tauri/target/release/bundle/appimage/Macro Store_0.3.0_amd64.AppImage
```

## Proje yapısı

```
ui/                       Saf HTML/CSS/JS arayüz
  index.html
  styles.css
  app.js                  Tauri yoksa demo verisiyle de çalışır
  theme-init.js           İlk boyamadan önce temayı uygular
  fonts/                  Gömülü Adwaita Sans fontu
src-tauri/
  src/lib.rs              Flathub API, ODRS, Flatpak ve ilk kurulum komutları
  tauri.conf.json         Pencere, CSP ve deb/rpm/AppImage paketleme ayarları
  capabilities/           Tauri yetkileri
  icons/                  Uygulama simgeleri
README.md
LICENSE
```

## Güvenlik notları

- Uygulama kimlikleri ve depo adları katı kurallarla doğrulanır.
- Hiçbir komut `sh -c` ile çalıştırılmaz; argümanlar ayrı ayrı geçirilir.
- Arama ifadeleri baştaki `-` ve kontrol karakterlerine karşı denetlenir.
- Flatpak uygulama komutları kullanıcı kapsamıyla sınırlıdır; mağaza root olarak
  çalışmaz.
- Sistem paket yöneticisi yalnızca ilk kurulumda eksik Flatpak'ı kurmak için
  `pkexec` ile çağrılır; Flatpak uygulamaları yine kullanıcı kapsamında kurulur.
- Yalnızca kullanıcı kapsamındaki özel depolar kaldırılabilir; Flathub korunur.
- AppImage ortam değişkenleri (`LD_LIBRARY_PATH`, `LD_PRELOAD` vb.) sistem
  araçları çağrılırken temizlenir.
- Aynı anda tek Flatpak işlemine izin verilir.

## Bilinen sınırlar

- Mağaza yalnızca Flathub kataloğunu kullanır; Snap, AUR veya yerel paket
  yöneticileri mağaza özelliği olarak desteklenmez.
- İlk kurulum yalnızca desteklenen paket yöneticilerinde otomatiktir; diğer
  sistemlerde manuel komut gösterilir.
- Özel Flatpak depoları yalnızca kullanıcı kapsamında yönetilebilir.
- Homebrew ve benzeri ek kaynaklar henüz uygulanmadı.
- Uygulama açıklamaları ve ekran görüntüleri Flathub'un sağladığı dille
  sınırlıdır; bazı uygulamalarda Türkçe çeviri bulunmayabilir.
- Topluluk yorumları ODRS'ye bağlıdır; her uygulama için yorum bulunmayabilir.

## Lisans

MIT lisansı altında sunulmuştur. Gömülü Adwaita Sans fontu SIL Open Font
License 1.1 (OFL-1.1) ile lisanslanmıştır.
