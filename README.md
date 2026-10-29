# Macro Store

Macro Store, **Flathub** kataloğunu sade ve göz yormayan bir arayüzle sunan
hafif bir Linux yazılım mağazasıdır. Uygulamaları keşfeder, arar, ayrıntılarını
ve topluluk yorumlarını inceler; Flatpak, Snap ve Linux Homebrew paketlerini
tek ekrandan bulur ve yönetir. Dışarıdan indirilen **AppImage** dosyalarını da
mağazaya ekleyebilirsiniz.

Flathub kataloğu Flatpak için ana mağaza deneyimini sağlar. Snap Store ve
Homebrew desteklenen sistemlerde ayrı sağlayıcılar olarak aranabilir ve
yönetilebilir; sistem paket yöneticisi yalnızca ilk kurulumda eksik Flatpak'ı
kurmak için çağrılır.

## Özellikler

- Tauri 2 + Rust arka uç, saf HTML/CSS/JS ön yüz (npm/bundler yok)
- Dört kaynak: Flatpak/Flathub, Snap Store, Homebrew formülleri ve casks, AppImage
- Flathub'dan günün uygulaması, haftanın seçkisi, popüler ve yeni eklenenler
- Kategoriler, arama ve uygulama ayrıntı ekranı
- Flathub açıklaması, sürüm bilgisi, ekran görüntüleri ve bağlantılar
- ODRS üzerinden topluluk puanları ve yorumları
- Kullanıcı kapsamında Flatpak kurulum, kaldırma ve güncelleme
- Snap Store araması ve Snap paket işlemleri (sistem kapsamında; Polkit gerekebilir)
- Linux Homebrew formula ve Linux desteği bildiren cask paketleri
- Dışarıdan AppImage içe aktarma; dosya kopyalama, çalıştırma izni ve menü kaydı
- Yüklü uygulamalar listesi ve sağlayıcı/güncelleme filtreleri
- Yüklü uygulamalar listesi 40'arlı parçalar halinde açılır; sağlayıcı hataları
  başarılı kaynakların sonuçlarını gizlemez.
- Bekleyen güncellemeler tek tıkla sırayla uygulanır; ilerleme ve başarısız
  paketler ayrı ayrı bildirilir.
- Sağlayıcı filtrelerinde sonuç sayacı; yüklü uygulamalar ad, güncelleme ve
  sağlayıcıya göre sıralanabilir.
- Uygulama ayrıntılarında Flatpak, Snap ve Homebrew için kurulum komutu
  kopyalanabilir; CLI komutları penceresinde kurulum, güncelleme, kaldırma ve
  bilgi komutları topluca görüntülenir.
- Kitaplıkta seçim modu ile birden çok uygulama seçilip sırayla kaldırılabilir;
  toplu işlemler onay ister ve iptal edilebilir.
- Kitaplık başlığında sağlayıcı dağılımı ve son kontrol saati gösterilir.
- Arama geçmişi yerel olarak saklanır; son aramalar arama kutusunda önerilir.
- Favoriler ve son görüntülenen uygulamalar cihazda saklanır; Keşfet ekranından
  ve kenar çubuğundan erişilebilir.
- Kitaplıkta ada, kimliğe, geliştiriciye ve sağlayıcıya göre hızlı arama;
  görünen liste ya da seçilen uygulamalar panoya kopyalanabilir.
- Seçenekler ekranında son kurulum, güncelleme ve kaldırma işlemlerinin
  cihazda tutulan geçmişi listelenir.
- Flatpak uygulama izinleri ve son sürüm geçmişi ayrıntı ekranında gösterilir.
- `?` / `F1` ile klavye kısayolları penceresi açılır.
- Snap izleme kanalı ve Homebrew sabitlenmiş formula durumu uygulama
  ayrıntılarında gösterilir.
- **Yenile** sağlayıcı önbelleklerini temizler; normal listeleme 15 saniyelik
  kısa bir önbellek kullanır.
- Sürüm geri alma: Flatpak uzak günlüğünden son sürümler listelenir ve seçilen
  commit'e dönülebilir.
- Flatpak uygulama güncellemeleri maskelenebilir; maskeli uygulamalar kitaplıkta
  ayrı işaretlenir.
- Sistem tepsisi simgesi bekleyen güncelleme sayısını gösterir; tepsi menüsünden
  mağaza açılabilir ya da güncellemeler denetlenebilir.
- Çevrimdışıyken son yüklü uygulama listesi önbellekten gösterilir.
- Açık ve koyu tema; Kırmızı, Mavi, Yeşil, Sarı ve Mor vurgu renkleri
- Etkinleştirilebilir **Düşük Güç Modu** (animasyon, gölge ve bulanıklığı azaltır)
- Türkçe ve İngilizce arayüz; dil seçimi yerel olarak saklanır
- `macro-store://` derin bağlantıları: uygulama ayrıntısı ve arama
- Depo yönetimi: Flathub korunur, özel Flatpak kullanıcı depoları eklenebilir
- Adwaita Sans fontu uygulamaya gömülüdür; harici font isteği yapılmaz
- GPLv3 lisansı

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

## Snap

Snap Store kataloğu Snap Store API'sinden aranır. Yerel işlemler için `snapd`
kurulu ve çalışır olmalıdır; Macro Store Snap'i kendisi kurmaz.

- Arama sonuçlarında yalnızca `strict` confinement paketleri kurulum için sunulur.
- Kurulum, kaldırma ve yenileme `snap` komutuyla sistem kapsamında yapılır;
  açık kullanıcı eyleminde Polkit (`pkexec`) yetkilendirme penceresi açılabilir.
- Snap işlemleri Flatpak'ın `--user` kapsamından farklıdır. Macro Store'u root
  olarak çalıştırmayın.
- Snap Store ayrıntılarında topluluk puanı/yorum, ekran görüntüsü ve indirme
  istatistikleri sunulmaz.

## Homebrew (Linuxbrew)

Linux'ta mevcut Homebrew kurulumu kullanılır; Macro Store Homebrew kurulumunu
veya ortamı otomatik değiştirmez. `brew` komutu `PATH` veya yaygın Linuxbrew
öneklerinde bulunmalıdır. Paket işlemleri root olarak çalıştırılmaz.

- Formula'lar ve Homebrew üstverisinde Linux desteği açıkça belirtilen cask'ler
  aranır.
- Arayüzde formula/cask kimlikleri ayrıdır; aynı adlı paketler çakışmaz.
- Arama sırasında otomatik `brew update` çalıştırılmaz.
- Homebrew katalog araması/ayrıntıları için Linux Homebrew kurulumunun hazır
  olması gerekir.

## AppImage

Dışarıdan edinilen `.AppImage` dosyaları **Yüklü Uygulamalar → AppImage ekle**
düğmesiyle içe aktarılır:

- Dosya `~/.local/share/macro-store/appimages` altına kopyalanır ve çalıştırma
  izni verilir; özgün dosya yerinde kalır.
- Uygulama menüsü için `~/.local/share/applications/macro-store-<ad>.desktop`
  kaydı üretilir.
- AppImage içinden simge çıkarılabiliyorsa `hicolor` simge dizinine yazılır.
- Dosya seçimi `zenity` veya `kdialog` ile yapılır.
- AppImage kayıtları mağaza üzerinden açılabilir, kaldırılabilir ve dosya
  konumu görüntülenebilir. Güncelleme için yeni sürümü yeniden içe aktarın.

## Gereksinimler

- Flatpak 1.12 veya üzeri (ilk açılışta kurulabilir)
- Çalışma zamanında GTK 3 ve WebKitGTK 4.1
- Derleme için Rust 1.90 veya üzeri, Tauri 2 CLI ve geliştirme paketleri

Paketler, Tauri'nin ürettiği bağımlılık listesiyle birlikte gelir. `.deb` ve
`.rpm` kurulumları sistemdeki WebKitGTK 4.1 ve GTK 3 kütüphanelerini kullanır.

## Hazır paketler

Proje kökünde çalışmaya hazır iki paket bulunur:

```bash
# Debian / Ubuntu
sudo apt install ./MacroStore_0.4.0_amd64.deb

# Fedora / RHEL / openSUSE
sudo dnf install ./MacroStore-0.4.0-1.x86_64.rpm
# veya
sudo zypper install ./MacroStore-0.4.0-1.x86_64.rpm
```

Kurulumdan sonra uygulamayı uygulama menüsünden veya terminalden açın:

```bash
macro-store
```

Paket bütünlüğünü doğrulamak için:

```bash
sha256sum -c MacroStore_0.4.0.sha256
```

## Hazır AppImage

Proje kökündeki taşınabilir AppImage sürümü:

```bash
chmod +x MacroStore_0.4.0_amd64.AppImage
./MacroStore_0.4.0_amd64.AppImage
```

AppImage; GTK 3 ve WebKitGTK 4.1 kütüphanelerini kendi içinde taşır. Sistemde
FUSE yoksa:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./MacroStore_0.4.0_amd64.AppImage
```

## Geliştirme

```bash
# Tauri CLI (bir kez)
cargo install tauri-cli --version "^2" --locked

# Geliştirme derlemesi
cd src-tauri
cargo tauri dev

# Yalnızca arka uç denetimleri
cargo check --locked --all-targets
cargo test --locked --all-targets
cargo clippy --locked --all-targets -- -D warnings
```

Arayüz, Tauri olmadan da tarayıcıda açılabilir. `ui/index.html` dosyasını yerel
bir HTTP sunucusundan açtığınızda demo verisiyle çalışır. Tarayıcı önizlemesi
Flathub/ODRS isteklerini yerel bir proxy üzerinden yapar; gerçek uygulamada bu
yol kullanılmaz.

## CI ve sürüm yayınları

`.github/workflows/ci.yml`, pull request'lerde ve `main` dalına push'larda JS
sözdizimini, Rust biçimlendirme/derleme/test/Clippy adımlarını ve Linux `.deb`,
`.rpm`, AppImage üretimini denetler. `.github/workflows/release.yml`, `vX.Y.Z`
etiketinin Cargo ve Tauri sürümleriyle eşleşmesini doğrular; denetimleri ve
paket üretimini tekrar çalıştırıp üç paketi SHA-256 toplamlarıyla GitHub
Release'e yükler. Her CI çalışması üretilen `.deb`, `.rpm` ve AppImage dosyalarını
14 gün süreyle Actions artifacts bölümünde indirilebilir tutar. Tauri CLI
`2.12.4` sürümüne sabitlenir ve Cargo cache'iyle birlikte önbelleğe alınır.

Yayın tetikleyicisi için etiket sürümü `src-tauri/Cargo.toml` ve
`src-tauri/tauri.conf.json` içindeki sürümle aynı olmalıdır.

`RELEASE_GPG_PRIVATE_KEY` (ve isteğe bağlı `RELEASE_GPG_PASSPHRASE`) deposu
sırrı tanımlıysa `SHA256SUMS` dosyası imzalanır ve `SHA256SUMS.asc` ile
`RELEASE-KEY.asc` yayına eklenir. İndirilen paketler şöyle doğrulanır:

```bash
gpg --import RELEASE-KEY.asc
gpg --verify SHA256SUMS.asc SHA256SUMS
sha256sum -c SHA256SUMS
```

## Derin bağlantılar

Mağaza `macro-store://` şemasını kaydeder. Linux ve Windows'ta şema ilk
çalıştırmada kullanıcı kapsamında kaydedilir (`.desktop` dosyası / kayıt
defteri); macOS'ta kayıt uygulama paketindeki `Info.plist` ile yapılır. Bu
yüzden macOS'ta bağlantılar `tauri dev` yerine `tauri build` çıktısıyla
denenmelidir.

```bash
macro-store://app/org.mozilla.firefox
macro-store://app/org.mozilla.firefox?provider=snap
macro-store://search?q=video%20editor
```

Geçersiz uygulama kimlikleri yok sayılır. Bağlantı mağaza kapalıyken açılırsa
hedef ilk açılışta işlenir.

## Paket üretme

```bash
cd src-tauri
cargo tauri build --bundles deb,rpm
```

Release profili çalışma hızı için `opt-level=3`, `thin LTO` ve tek codegen
birimi kullanır; en küçük ikili dosya boyutu yerine çalıştırma performansını
önceler.

Çıktılar:

```
src-tauri/target/release/bundle/deb/Macro Store_0.4.0_amd64.deb
src-tauri/target/release/bundle/rpm/Macro Store-0.4.0-1.x86_64.rpm
```

AppImage isteğe bağlı olarak ayrıca üretilebilir:

```bash
cargo tauri build --bundles appimage
```

Çıktı:

```
src-tauri/target/release/bundle/appimage/Macro Store_0.4.0_amd64.AppImage
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
  src/lib.rs              Sağlayıcı entegrasyonu, Flathub API/ODRS ve Flatpak
  src/snap.rs             Snap Store araması, snapd envanteri ve işlemleri
  src/brew.rs             Linux Homebrew araması, formula/cask ve işlemler
  src/appimage.rs         Yerel AppImage içe aktarma, listeleme ve kaldırma
  tauri.conf.json         Pencere, CSP ve deb/rpm/AppImage paketleme ayarları
  capabilities/           Tauri yetkileri
  icons/                  Uygulama simgeleri
.github/workflows/
  ci.yml                  Linux denetimleri ve paket doğrulaması
  release.yml             Sürüm etiketi doğrulama ve GitHub Release
README.md
LICENSE
```

## Güvenlik notları

- Paket kimlikleri ve depo adları katı kurallarla doğrulanır.
- Hiçbir komut `sh -c` ile çalıştırılmaz; argümanlar ayrı ayrı geçirilir.
- Arama ifadeleri seçenek enjeksiyonuna ve kontrol karakterlerine karşı denetlenir.
- Flatpak uygulama işlemleri kullanıcı kapsamıyla sınırlıdır; mağaza root olarak
  çalışmaz.
- İlk Flatpak kurulumu için sistem paket yöneticisi yalnızca `pkexec` ile çağrılır.
- Snap işlemleri sistem kapsamındadır; `pkexec snap` yalnızca açık kullanıcı
  eyleminde çalışır ve Flatpak'ın `--user` sınırlarıyla karıştırılmaz.
- Homebrew işlemleri root olarak çalıştırılmaz.
- Yalnızca kullanıcı kapsamındaki özel Flatpak depoları kaldırılabilir; Flathub korunur.
- AppImage ortam değişkenleri (`LD_LIBRARY_PATH`, `LD_PRELOAD` vb.) sistem
  araçları çağrılırken temizlenir.
- Aynı anda tüm sağlayıcılar arasında tek paket işlemi yürütülür.

## Bilinen sınırlar

- Öne çıkanlar, kategoriler ve topluluk yorumları Flathub/ODRS kataloğuna dayanır;
  Snap ve Homebrew ayrı arama sağlayıcılarıdır.
- Snap işlemleri için `snapd`, Homebrew işlemleri için Linuxbrew kurulu olmalıdır;
  bu bağımlılıklar otomatik kurulmaz.
- Snap Store ayrıntılarında ODRS puanı/yorumu yoktur; Snap listesi sistem
  kapsamındaki paketleri gösterir.
- Homebrew yalnızca Linux desteğini üstverisinde açıkça bildiren cask'leri sunar.
- İlk Flatpak kurulumu yalnızca desteklenen dağıtım ailelerinde otomatiktir;
  diğer sistemlerde manuel komut gösterilir.
- Özel Flatpak depoları yalnızca kullanıcı kapsamında yönetilebilir.
- Açıklama, sürüm ve ekran görüntüsü dilleri ilgili kataloğun sağladığıyla
  sınırlıdır; her sağlayıcı her ayrıntıyı sağlamaz.

## Lisans

GNU General Public License v3.0 (GPL-3.0-or-later) altında sunulmuştur.
Gömülü Adwaita Sans fontu SIL Open Font License 1.1 (OFL-1.1) ile
lisanslanmıştır.
