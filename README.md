# Macro Store

Macro Store, Linux'ta uygulama edinmeyi tek bir sade arayüzde toplayan hafif bir
yazılım mağazasıdır. **Flatpak**, **Snap** ve **Homebrew** kaynaklarını aynı
listede yönetir; dışarıdan indirilen **AppImage** dosyalarını da mağazaya
ekleyebilirsiniz.

Mağaza, sistemde zaten kurulu olan Flatpak, Snap ve Homebrew paketlerini algılar
ve mağaza üzerinden kurulanlarla birlikte gösterir. Yerel dağıtım paketleri
(`.deb`, `.rpm`, `.pkg.tar.zst`) bir mağaza kaynağı olarak kullanılmaz; sistem
paket yöneticisi yalnızca gerekli bileşenlerin (Flatpak, snapd) ilk kurulumunda
devreye girer.

## Özellikler

- Tauri 2 + Rust arka uç, saf HTML/CSS/JS ön yüz (npm/bundler yok)
- Dört kaynak: Flatpak/Flathub, Snap Store, Homebrew formülleri ve casks, AppImage
- Host'ta kurulu tüm paketleri tek listede toplama ve kaynağa göre filtreleme
- Flathub'dan günün uygulaması, haftanın seçkisi, popüler ve yeni eklenenler
- Snap ve Homebrew vitrinleri; kaynaklar yalnızca kuruluysa aramaya katılır
- Ortak arama: Flatpak, Snap ve Homebrew sonuçları tek akışta
- Flatpak için kullanıcı ve sistem kapsamını birleştiren tek kayıt
- Uygulama ayrıntısı, ekran görüntüleri, sürüm, lisans ve kaynak bilgisi
- ODRS üzerinden topluluk puanları ve yorumları
- Kurulum, kaldırma ve güncelleme; işlem günlüğü ve canlı çıktı
- Dışarıdan AppImage içe aktarma; dosya kopyalama, çalıştırma izni ve menü kaydı
- Açık/koyu tema ve Kırmızı, Mavi, Yeşil, Sarı, Mor vurgu renkleri
- Etkinleştirilebilir **Düşük Güç Modu** (animasyon, gölge ve bulanıklığı azaltır)
- Adwaita Sans fontu uygulamaya gömülüdür; harici font isteği yapılmaz
- GPLv3 lisansı

## İlk açılış ve sistem hazırlığı

Macro Store açıldığında host sistemde Flatpak, Snap ve Homebrew durumunu
denetler. Flatpak ve kullanıcı kapsamındaki Flathub deposu eksikse hazırlık
penceresi açılır:

1. Flatpak sürümü ve Flathub deposu denetlenir.
2. Flatpak yoksa dağıtımın paket yöneticisiyle kurulur.
3. `flathub` kullanıcı deposu eklenir.
4. Snap ve Homebrew isteğe bağlıdır; aynı pencereden veya **Seçenekler →
   Kaynaklar** bölümünden kurulabilir.

Flatpak ve snapd sistem genelinde kurulduğu için polkit (`pkexec`) üzerinden
yetki istenebilir. Homebrew kullanıcı kapsamında, yönetici yetkisi olmadan
kurulur. Desteklenen paket yöneticileri:

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
kurulum komutu gösterilir ve kopyalanabilir. Arch Linux'ta snapd resmî depolarda
bulunmadığından manuel kurulum komutu (AUR) gösterilir.

Hazırlık durumu `localStorage` içinde saklanır. Flatpak veya Flathub sonradan
eksilirse pencere sonraki açılışlarda yeniden gösterilir. Pencereye Keşfet ve
Yüklü Uygulamalar ekranlarındaki uyarılardan ya da **Seçenekler → Kaynaklar**
bölümünden yeniden erişilebilir.

## Kaynaklar ve kapsamlar

| Kaynak | Kimlik biçimi | Kapsam | İşlem komutu |
| --- | --- | --- | --- |
| Flatpak | `flatpak:org.gnome.Builder` | Kullanıcı + sistem | `flatpak install/uninstall/update` |
| Snap | `snap:firefox` | Sistem | `pkexec snap install/remove/refresh` |
| Homebrew | `homebrew:wget` | Kullanıcı | `brew install/uninstall/upgrade` |
| AppImage | `appimage:uygulama` | Kullanıcı | Yerel dosya işlemleri |

- Flathub varsayılan ve korunan depodur. Özel Flatpak depoları yalnızca kullanıcı
  kapsamında eklenip kaldırılabilir.
- Snap işlemleri sistem genelinde yürütülür. Klasik kısıtlama gerektiren
  paketlerde ilk deneme başarısız olursa işlem `--classic` ile yeniden denenir.
- Homebrew formülleri ve casks kullanıcı kapsamında kurulur; `brew` doğrudan
  çağrılır. Kurulum resmî betikle yapılır, başarısız olursa `git clone` yedeği
  kullanılır.
- Snap ve Homebrew yalnızca kuruluysa arama ve keşfet sonuçlarına katılır.
- Flatpak, Snap ve Homebrew komutları `sh -c` olmadan, argümanlar ayrı ayrı
  geçirilerek çalıştırılır.

### Flatpak / Flathub

Flatpak uygulama işlemleri önce kullanıcı kapsamında denenir; sistem kapsamında
kurulu bir uygulama için `pkexec` ile sistem işlemi yapılır. Yüklü uygulamalar
`flatpak list --app` çıktısından, depolar `flatpak remotes` çıktısından okunur.
Flathub API'si arama, öneriler, kategoriler ve uygulama ayrıntıları için; ODRS
ise topluluk puanları ve yorumları için kullanılır.

### Snap

Snap araması ve vitrini Snap Store API'sinden alınır. Kurulu snap'ler
`snap list` ile algılanır. snapd; APT, DNF, Zypper, APK, XBPS, eopkg ve
rpm-ostree sistemlerinde otomatik kurulabilir.

### Homebrew

Aramada Homebrew formül ve cask API'leri kullanılır; kurulu paketler
`brew list --formula` ve `brew list --cask` çıktılarından okunur. Homebrew
API'si uygulama simgesi sağlamadığından bu kayıtlarda yerleşik yedek simge
gösterilir.

### AppImage

Dışarıdan edinilen `.AppImage` dosyaları **Yüklü Uygulamalar → AppImage ekle**
düğmesiyle içe aktarılır:

- Dosya `~/.local/share/macro-store/appimages` altına kopyalanır ve çalıştırma
  izni verilir; özgün dosya yerinde kalır.
- Uygulama menüsü için `~/.local/share/applications/macro-store-<ad>.desktop`
  kaydı üretilir.
- AppImage içinden simge çıkarılabiliyorsa `hicolor` simge dizinine yazılır.
- Dosya seçimi `zenity` veya `kdialog` ile yapılır.
- AppImage kayıtları `~/.local/share/macro-store/appimages/index.json` içinde
  tutulur; mağazadan kaldırma dosyayı ve menü kaydını siler.

## Gereksinimler

- Flatpak 1.12 veya üzeri (ilk açılışta kurulabilir)
- Çalışma zamanında GTK 3 ve WebKitGTK 4.1
- İsteğe bağlı: snapd, Homebrew
- Derleme için Rust, Tauri 2 CLI ve ilgili geliştirme paketleri

Paketler, Tauri'nin ürettiği bağımlılık listesiyle birlikte gelir. `.deb` ve
`.rpm` kurulumları sistemdeki WebKitGTK 4.1 ve GTK 3 kütüphanelerini kullanır.

## Hazır paketler (0.4.0)

Proje kökünde dört paket biçimi bulunur:

```bash
# Debian / Ubuntu
sudo apt install ./MacroStore_0.4.0_amd64.deb

# Fedora / RHEL / openSUSE
sudo dnf install ./MacroStore-0.4.0-1.x86_64.rpm
# veya
sudo zypper install ./MacroStore-0.4.0-1.x86_64.rpm

# Arch Linux
sudo pacman -U ./macro-store-0.4.0-1-x86_64.pkg.tar.zst

# Taşınabilir AppImage
chmod +x MacroStore_0.4.0_amd64.AppImage
./MacroStore_0.4.0_amd64.AppImage
```

Kurulumdan sonra uygulamayı menüden veya terminalden açın:

```bash
macro-store
```

Paket bütünlüğünü doğrulamak için:

```bash
sha256sum -c MacroStore_0.4.0.sha256
```

AppImage 100 MB sınırını aştığı için GitHub deposuna değil, GitHub Releases
sayfasına yüklenir.

> Not: `MacroStore_0.4.0_amd64.AppImage` yerel olarak üretilen taşınabilir
> pakettir. AppImage; GTK 3 ve WebKitGTK 4.1 kütüphanelerini kendi içinde taşır.
> Sistemde FUSE yoksa `APPIMAGE_EXTRACT_AND_RUN=1 ./MacroStore_0.4.0_amd64.AppImage`
> komutunu kullanın.

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

# Debian ve RPM
cargo tauri build --bundles deb,rpm

# AppImage
cargo tauri build --bundles appimage
```

Çıktılar:

```
src-tauri/target/release/bundle/deb/Macro Store_0.4.0_amd64.deb
src-tauri/target/release/bundle/rpm/Macro Store-0.4.0-1.x86_64.rpm
src-tauri/target/release/bundle/appimage/Macro Store_0.4.0_amd64.AppImage
```

Arch Linux paketi `packaging/arch/PKGBUILD` ile üretilir:

```bash
cd packaging/arch
makepkg -sf
```

Çıktı: `macro-store-0.4.0-1-x86_64.pkg.tar.zst`.

## Proje yapısı

```
ui/                       Saf HTML/CSS/JS arayüz
  index.html
  styles.css
  app.js                  Tauri yoksa demo verisiyle de çalışır
  theme-init.js           İlk boyamadan önce tema/vurgu/düşük güç modunu uygular
  fonts/                  Gömülü Adwaita Sans fontu
src-tauri/
  src/lib.rs              Flatpak, Snap, Homebrew, AppImage ve kurulum komutları
  tauri.conf.json         Pencere, CSP ve deb/rpm/AppImage paketleme ayarları
  capabilities/           Tauri yetkileri
  icons/                  Uygulama simgeleri
packaging/arch/PKGBUILD   Arch Linux paket tanımı
README.md
LICENSE                   GNU GPLv3
```

## Güvenlik notları

- Uygulama kimlikleri, snap adları, Homebrew token'ları ve depo adları katı
  kurallarla doğrulanır.
- Hiçbir komut `sh -c` ile çalıştırılmaz; argümanlar ayrı ayrı geçirilir.
- Arama ifadeleri baştaki `-` ve kontrol karakterlerine karşı denetlenir.
- Flatpak uygulama komutları kullanıcı kapsamıyla sınırlıdır; sistem kapsamı
  yalnızca gerekli olduğunda `pkexec` ile yönetilir ve mağaza root olarak
  çalışmaz.
- Sistem paket yöneticisi yalnızca gerekli bileşenlerin (Flatpak, snapd) ilk
  kurulumunda `pkexec` ile çağrılır.
- Yalnızca kullanıcı kapsamındaki özel depolar kaldırılabilir; Flathub korunur.
- AppImage ortam değişkenleri (`LD_LIBRARY_PATH`, `LD_PRELOAD` vb.) sistem
  araçları çağrılırken temizlenir.
- Aynı anda tek paket işlemine izin verilir.

## Bilinen sınırlar

- Yerel dağıtım paketleri (`.deb`, `.rpm`, `.pkg.tar.zst`, AUR) mağaza kaynağı
  olarak kullanılmaz; bunlar yalnızca Macro Store'un kendisini kurar.
- Snap ve Homebrew yalnızca sistemde kuruluysa mağazada görünür.
- Homebrew API'si simge sağlamadığından bu kayıtta yedek simge kullanılır.
- Özel Flatpak depoları yalnızca kullanıcı kapsamında yönetilebilir.
- Uygulama açıklamaları ve ekran görüntüleri ilgili kaynağın sağladığı dille
  sınırlıdır; bazı uygulamalarda Türkçe çeviri bulunmayabilir.
- Topluluk yorumları ODRS'ye bağlıdır; her uygulama için yorum bulunmayabilir.
- AppImage dosyaları otomatik güncellenmez; yeni sürümü yeniden içe aktarın.

## Lisans

Telif hakkı © 2026 Macro Store katkıda bulunanları.

Bu program, GNU Genel Kamu Lisansı'nın (GNU General Public License) 3. sürümü
veya daha sonraki bir sürümü koşulları altında özgür yazılım olarak
dağıtılmaktadır. Ayrıntılar için `LICENSE` dosyasına bakın:
<https://www.gnu.org/licenses/gpl-3.0.html>.

Gömülü Adwaita Sans fontu SIL Open Font License 1.1 (OFL-1.1) ile
lisanslanmıştır.
