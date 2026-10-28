use base64::Engine as _;
use futures::future::join_all;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader as AsyncBufReader};
use tokio::process::Command as AsyncCommand;

const HOST_PATH: &str = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const FLATHUB_REPO: &str = "https://dl.flathub.org/repo/flathub.flatpakrepo";
const FLATHUB_API: &str = "https://flathub.org/api/v2";
const FLATHUB_ICON_ROOT: &str = "https://dl.flathub.org/media/icons/128x128";
const ODRS_API: &str = "https://odrs.gnome.org/1.0/reviews/api";
const SEARCH_LIMIT: usize = 36;
const CATEGORY_LIMIT: usize = 24;
const REVIEW_LIMIT: usize = 8;
const HTTP_TIMEOUT_SECS: u64 = 25;
const FLATHUB_REMOTE_COMMAND: &str =
    "flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo";
const SNAP_API: &str = "https://api.snapcraft.io/v2";
const SNAP_DEVICE_SERIES: &str = "16";
const BREW_API: &str = "https://formulae.brew.sh/api";
const BREW_ANALYTICS: &str = "https://formulae.brew.sh/api/analytics/install-on-request/30d.json";
const HOMEBREW_INSTALL_SCRIPT: &str =
    "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh";
const HOMEBREW_COMMAND: &str =
    "/bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"";

const NATIVE_PACKAGE_MANAGERS: [&str; 8] = [
    "apt-get",
    "dnf",
    "pacman",
    "zypper",
    "apk",
    "xbps-install",
    "eopkg",
    "rpm-ostree",
];

const APT_INSTALL_ARGS: &[&str] = &["install", "-y", "flatpak"];
const DNF_INSTALL_ARGS: &[&str] = &["install", "-y", "flatpak"];
const PACMAN_INSTALL_ARGS: &[&str] = &["-S", "--needed", "--noconfirm", "flatpak"];
const ZYPPER_INSTALL_ARGS: &[&str] = &["--non-interactive", "install", "flatpak"];
const APK_INSTALL_ARGS: &[&str] = &["add", "--no-interactive", "flatpak"];
const XBPS_INSTALL_ARGS: &[&str] = &["-Sy", "flatpak"];
const EOPKG_INSTALL_ARGS: &[&str] = &["install", "-y", "flatpak"];
const RPM_OSTREE_INSTALL_ARGS: &[&str] = &["install", "flatpak"];
const APT_SNAPD_ARGS: &[&str] = &["install", "-y", "snapd"];
const DNF_SNAPD_ARGS: &[&str] = &["install", "-y", "snapd"];
const ZYPPER_SNAPD_ARGS: &[&str] = &["--non-interactive", "install", "snapd"];
const APK_SNAPD_ARGS: &[&str] = &["add", "--no-interactive", "snapd"];
const XBPS_SNAPD_ARGS: &[&str] = &["-Sy", "snapd"];
const EOPKG_SNAPD_ARGS: &[&str] = &["install", "-y", "snapd"];
const RPM_OSTREE_SNAPD_ARGS: &[&str] = &["install", "snapd"];

const SANITIZED_ENV: [&str; 10] = [
    "LD_LIBRARY_PATH",
    "LD_PRELOAD",
    "LD_AUDIT",
    "GIO_MODULE_DIR",
    "GI_TYPELIB_PATH",
    "GDK_PIXBUF_MODULE_FILE",
    "GTK_PATH",
    "PYTHONHOME",
    "PYTHONPATH",
    "PERL5LIB",
];

const CATEGORIES: [&str; 11] = [
    "audiovideo",
    "development",
    "education",
    "healthfitness",
    "game",
    "graphics",
    "network",
    "office",
    "science",
    "system",
    "utility",
];

static OPERATING: AtomicBool = AtomicBool::new(false);
static SETTING_UP: AtomicBool = AtomicBool::new(false);
static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

struct OperationLock;

impl Drop for OperationLock {
    fn drop(&mut self) {
        OPERATING.store(false, Ordering::SeqCst);
    }
}

struct SetupLock;

impl Drop for SetupLock {
    fn drop(&mut self) {
        SETTING_UP.store(false, Ordering::SeqCst);
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoreInfo {
    flatpak_available: bool,
    flatpak_version: Option<String>,
    flathub_available: bool,
    user_flathub_available: bool,
    snap_available: bool,
    snap_version: Option<String>,
    brew_available: bool,
    brew_version: Option<String>,
    appimage_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppItem {
    id: String,
    name: String,
    summary: String,
    developer: String,
    version: String,
    icon: Option<String>,
    installed: bool,
    update_available: bool,
    category: Option<String>,
    monthly_installs: Option<u64>,
    hero_image: Option<String>,
    source: String,
    scope: Option<String>,
    kind: Option<String>,
    classic: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenshotItem {
    url: String,
    caption: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RatingSummary {
    average: f64,
    total: u64,
    stars: Vec<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReviewItem {
    author: String,
    rating: u8,
    date: i64,
    summary: String,
    text: String,
    locale: String,
    version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppDetail {
    app: AppItem,
    description: String,
    screenshots: Vec<ScreenshotItem>,
    categories: Vec<String>,
    license: String,
    verified: bool,
    homepage: Option<String>,
    download_size: Option<u64>,
    installed_size: Option<u64>,
    installs_last_month: Option<u64>,
    rating: Option<RatingSummary>,
    reviews: Vec<ReviewItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscoverData {
    date: String,
    app_of_day: Option<AppItem>,
    picks: Vec<AppItem>,
    popular: Vec<AppItem>,
    recent: Vec<AppItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CategoryPage {
    slug: String,
    page: u32,
    total: u64,
    total_pages: u64,
    apps: Vec<AppItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteInfo {
    name: String,
    title: String,
    url: String,
    scope: String,
    comment: String,
    icon: Option<String>,
    deletable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OperationOutcome {
    success: bool,
    code: Option<i32>,
    message: String,
    app_id: String,
    action: String,
    manager: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OperationLog {
    line: String,
    kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupStatus {
    flatpak_available: bool,
    flatpak_version: Option<String>,
    flathub_available: bool,
    user_flathub_available: bool,
    snap_available: bool,
    snap_version: Option<String>,
    snapd_running: bool,
    snap_install_supported: bool,
    snap_manual_command: String,
    brew_available: bool,
    brew_version: Option<String>,
    brew_prefix: Option<String>,
    brew_install_supported: bool,
    brew_manual_command: String,
    ready: bool,
    distro_id: String,
    distro_name: String,
    package_manager: Option<String>,
    package_manager_label: Option<String>,
    install_supported: bool,
    polkit_available: bool,
    immutable: bool,
    reboot_required: bool,
    manual_command: String,
    flathub_command: String,
}

#[derive(Debug, Clone)]
struct PackagePlan {
    name: &'static str,
    label: &'static str,
    install_args: &'static [&'static str],
    needs_reboot: bool,
}

#[derive(Debug)]
struct CmdOutput {
    success: bool,
    stdout: String,
    stderr: String,
}

#[derive(Debug, Clone)]
struct FlatpakInstalled {
    app_id: String,
    name: String,
    version: String,
    summary: String,
    scope: String,
}

#[derive(Debug, Clone)]
struct SnapInstalled {
    name: String,
    version: String,
    summary: String,
    publisher: String,
    classic: bool,
}

#[derive(Debug, Clone)]
struct BrewInstalled {
    token: String,
    version: String,
    summary: String,
    kind: String,
    outdated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppImageEntry {
    id: String,
    name: String,
    path: String,
    icon_path: Option<String>,
    size: u64,
    imported_at: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ActionKind {
    Install,
    Remove,
    Update,
}

impl ActionKind {
    fn as_str(self) -> &'static str {
        match self {
            ActionKind::Install => "install",
            ActionKind::Remove => "remove",
            ActionKind::Update => "update",
        }
    }

    fn success_message(self) -> &'static str {
        match self {
            ActionKind::Install => "Kurulum tamamlandı.",
            ActionKind::Remove => "Kaldırma tamamlandı.",
            ActionKind::Update => "Güncelleme tamamlandı.",
        }
    }
}

/* ── API veri modelleri ─────────────────────────────── */

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum StringOrVec {
    One(String),
    Many(Vec<String>),
}

impl StringOrVec {
    fn first(&self) -> Option<String> {
        match self {
            StringOrVec::One(value) => {
                let value = value.trim();
                (!value.is_empty()).then(|| value.to_string())
            }
            StringOrVec::Many(values) => values
                .iter()
                .map(|value| value.trim())
                .find(|value| !value.is_empty())
                .map(str::to_string),
        }
    }
}

#[derive(Debug, Deserialize)]
struct ApiApp {
    #[serde(default)]
    app_id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    icon: Option<String>,
    #[serde(default)]
    developer_name: Option<String>,
    #[serde(default)]
    main_categories: Option<StringOrVec>,
    #[serde(default)]
    installs_last_month: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiSearchResponse {
    #[serde(default)]
    hits: Vec<ApiApp>,
    #[serde(default)]
    total_hits: u64,
    #[serde(default)]
    total_pages: u64,
}

#[derive(Debug, Deserialize)]
struct ApiPicks {
    #[serde(default)]
    apps: Vec<ApiPick>,
}

#[derive(Debug, Deserialize)]
struct ApiPick {
    #[serde(default)]
    app_id: String,
}

#[derive(Debug, Deserialize)]
struct ApiAppOfDay {
    #[serde(default)]
    app_id: String,
}

#[derive(Debug, Deserialize)]
struct ApiScreenshotSize {
    #[serde(default)]
    width: String,
    #[serde(default)]
    src: String,
}

#[derive(Debug, Deserialize)]
struct ApiScreenshot {
    #[serde(default)]
    sizes: Vec<ApiScreenshotSize>,
    #[serde(default)]
    caption: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiRelease {
    #[serde(default)]
    version: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct ApiUrls {
    #[serde(default)]
    homepage: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Appstream {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    icon: Option<String>,
    #[serde(default)]
    developer_name: Option<String>,
    #[serde(default)]
    categories: Vec<String>,
    #[serde(default)]
    screenshots: Vec<ApiScreenshot>,
    #[serde(default)]
    releases: Vec<ApiRelease>,
    #[serde(default)]
    urls: ApiUrls,
    #[serde(default)]
    project_license: String,
    #[serde(default)]
    metadata: HashMap<String, Value>,
    #[serde(default)]
    is_eol: bool,
}

#[derive(Debug, Default, Deserialize)]
struct ApiSummary {
    #[serde(default)]
    download_size: Option<u64>,
    #[serde(default)]
    installed_size: Option<u64>,
}

#[derive(Debug, Default, Deserialize)]
struct ApiStats {
    #[serde(default)]
    installs_last_month: Option<u64>,
}

#[derive(Debug, Default, Deserialize)]
struct OdrRatings {
    #[serde(default)]
    star1: u64,
    #[serde(default)]
    star2: u64,
    #[serde(default)]
    star3: u64,
    #[serde(default)]
    star4: u64,
    #[serde(default)]
    star5: u64,
}

#[derive(Debug, Deserialize)]
struct OdrReview {
    #[serde(default)]
    app_id: String,
    #[serde(default)]
    date_created: f64,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    locale: Option<String>,
    #[serde(default)]
    rating: Option<i64>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    user_display: Option<String>,
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    reported: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct RemoteJson {
    #[serde(default)]
    name: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    options: String,
    #[serde(default)]
    comment: String,
    #[serde(default)]
    icon: Option<String>,
}

/* ── Snap ve Homebrew API modelleri ─────────────────── */

#[derive(Debug, Default, Deserialize)]
struct SnapFindResponse {
    #[serde(default)]
    results: Vec<SnapResult>,
}

#[derive(Debug, Default, Deserialize)]
struct SnapResult {
    #[serde(default)]
    name: String,
    #[serde(default)]
    snap: SnapMeta,
    #[serde(default)]
    revision: Option<SnapRevision>,
}

#[derive(Debug, Default, Clone, Deserialize)]
struct SnapMeta {
    #[serde(default)]
    title: String,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    license: String,
    #[serde(default)]
    website: Option<String>,
    #[serde(default, rename = "store-url")]
    store_url: Option<String>,
    #[serde(default)]
    publisher: Option<SnapPublisher>,
    #[serde(default)]
    media: Vec<SnapMedia>,
    #[serde(default)]
    categories: Vec<SnapCategory>,
}

#[derive(Debug, Default, Clone, Deserialize)]
struct SnapPublisher {
    #[serde(default, rename = "display-name")]
    display_name: String,
    #[serde(default)]
    username: String,
    #[serde(default)]
    validation: String,
}

#[derive(Debug, Default, Clone, Deserialize)]
struct SnapMedia {
    #[serde(default, rename = "type")]
    kind: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    width: u64,
}

#[derive(Debug, Default, Clone, Deserialize)]
struct SnapCategory {
    #[serde(default)]
    name: String,
}

#[derive(Debug, Default, Deserialize)]
struct SnapRevision {
    #[serde(default)]
    version: String,
    #[serde(default)]
    confinement: String,
    #[serde(default)]
    download: Option<SnapDownload>,
}

#[derive(Debug, Default, Deserialize)]
struct SnapDownload {
    #[serde(default)]
    size: u64,
}

/* ── Süreç yardımcıları ─────────────────────────────── */

fn host_program(name: &str) -> Option<PathBuf> {
    if name == "brew" {
        if let Some(path) = brew_path() {
            return Some(path);
        }
    }
    for dir in ["/usr/bin", "/usr/sbin", "/bin", "/sbin", "/usr/local/bin"] {
        let candidate = Path::new(dir).join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    if let Some(path) = env::var_os("PATH") {
        for dir in env::split_paths(&path) {
            if dir.as_os_str().is_empty() {
                continue;
            }
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
}

fn data_home() -> PathBuf {
    env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(|| home_dir().map(|home| home.join(".local/share")))
        .unwrap_or_else(|| PathBuf::from("/tmp"))
}

fn appimage_dir() -> PathBuf {
    data_home().join("macro-store/appimages")
}

fn appimage_index_path() -> PathBuf {
    appimage_dir().join("index.json")
}

fn brew_path() -> Option<PathBuf> {
    let system_path = PathBuf::from("/home/linuxbrew/.linuxbrew/bin/brew");
    if system_path.is_file() {
        return Some(system_path);
    }
    if let Some(home) = home_dir() {
        for relative in [".linuxbrew/bin/brew", ".homebrew/bin/brew"] {
            let path = home.join(relative);
            if path.is_file() {
                return Some(path);
            }
        }
    }
    for candidate in ["/opt/homebrew/bin/brew", "/usr/local/Homebrew/bin/brew"] {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

fn app_key(source: &str, native: &str) -> String {
    format!("{source}:{native}")
}

fn split_app_key(value: &str) -> (String, String) {
    if let Some((source, native)) = value.split_once(':') {
        if !native.trim().is_empty()
            && matches!(source, "flatpak" | "snap" | "homebrew" | "appimage")
        {
            return (source.to_string(), native.to_string());
        }
    }
    ("flatpak".to_string(), value.to_string())
}

fn valid_snap_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 80 || name.starts_with('-') {
        return false;
    }
    name.chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
}

fn valid_brew_token(token: &str) -> bool {
    if token.is_empty() || token.len() > 120 || token.starts_with('-') {
        return false;
    }
    token
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '@' | '.' | '_' | '-' | '+'))
}

fn valid_appimage_slug(slug: &str) -> bool {
    !slug.is_empty()
        && slug.len() <= 80
        && !slug.starts_with('-')
        && slug.chars().all(|ch| {
            ch.is_ascii_lowercase() || ch.is_ascii_digit() || matches!(ch, '-' | '.' | '_')
        })
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for ch in value.chars().flat_map(char::to_lowercase) {
        let mapped = if ch.is_ascii_alphanumeric() {
            ch
        } else if ch.is_ascii() || ch.is_whitespace() {
            '-'
        } else {
            continue;
        };
        if mapped == '-' {
            if last_dash || slug.is_empty() {
                continue;
            }
            last_dash = true;
            slug.push('-');
        } else {
            last_dash = false;
            slug.push(mapped);
        }
        if slug.len() >= 64 {
            break;
        }
    }
    slug.trim_matches('-').to_string()
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

fn sanitize_std(cmd: &mut Command) {
    cmd.env("LC_ALL", "C")
        .env("LANG", "C")
        .env("LANGUAGE", "C")
        .env("PATH", HOST_PATH)
        .env("HOMEBREW_NO_AUTO_UPDATE", "1")
        .env("HOMEBREW_NO_ANALYTICS", "1")
        .env("HOMEBREW_NO_ENV_HINTS", "1")
        .env("NONINTERACTIVE", "1");
    for key in SANITIZED_ENV {
        cmd.env_remove(key);
    }
}

fn sanitize_async(cmd: &mut AsyncCommand) {
    cmd.env("LC_ALL", "C")
        .env("LANG", "C")
        .env("LANGUAGE", "C")
        .env("PATH", HOST_PATH)
        .env("HOMEBREW_NO_AUTO_UPDATE", "1")
        .env("HOMEBREW_NO_ANALYTICS", "1")
        .env("HOMEBREW_NO_ENV_HINTS", "1")
        .env("NONINTERACTIVE", "1");
    for key in SANITIZED_ENV {
        cmd.env_remove(key);
    }
}

fn run_capture_os(program: &str, args: &[OsString]) -> Result<CmdOutput, String> {
    let path = host_program(program).ok_or_else(|| format!("{program} sistemde bulunamadı."))?;
    let mut cmd = Command::new(path);
    cmd.args(args);
    sanitize_std(&mut cmd);
    let output = cmd
        .output()
        .map_err(|err| format!("{program} çalıştırılamadı: {err}"))?;
    Ok(CmdOutput {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

fn run_capture(program: &str, args: &[&str]) -> Result<CmdOutput, String> {
    let args: Vec<OsString> = args.iter().map(OsString::from).collect();
    run_capture_os(program, &args)
}

fn failure_message(tool: &str, output: &CmdOutput) -> String {
    let detail = output
        .stderr
        .lines()
        .chain(output.stdout.lines())
        .map(str::trim)
        .rfind(|line| !line.is_empty())
        .unwrap_or("bilinmeyen hata");
    truncate_chars(&format!("{tool}: {detail}"), 500)
}

fn truncate_chars(value: &str, max: usize) -> String {
    if value.chars().count() <= max {
        return value.to_string();
    }
    let mut output: String = value.chars().take(max.saturating_sub(1)).collect();
    output.push('…');
    output
}

fn flatpak_version() -> Option<String> {
    let output = run_capture("flatpak", &["--version"]).ok()?;
    if !output.success {
        return None;
    }
    output
        .stdout
        .lines()
        .next()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
}

fn flatpak_available() -> bool {
    flatpak_version().is_some()
}

fn parse_os_release(text: &str) -> HashMap<String, String> {
    let mut values = HashMap::new();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if key.is_empty() {
            continue;
        }
        let mut value = value.trim();
        if value.len() >= 2 {
            let quoted = (value.starts_with('"') && value.ends_with('"'))
                || (value.starts_with('\'') && value.ends_with('\''));
            if quoted {
                value = &value[1..value.len() - 1];
            }
        }
        values.insert(
            key.to_string(),
            value.replace("\\\"", "\"").replace("\\\\", "\\"),
        );
    }
    values
}

fn read_os_release() -> HashMap<String, String> {
    for path in ["/etc/os-release", "/usr/lib/os-release"] {
        if let Ok(text) = fs::read_to_string(path) {
            return parse_os_release(&text);
        }
    }
    HashMap::new()
}

fn is_ostree_system() -> bool {
    Path::new("/run/ostree-booted").exists()
}

fn detect_package_manager() -> Option<&'static str> {
    if is_ostree_system() {
        return host_program("rpm-ostree").map(|_| "rpm-ostree");
    }
    NATIVE_PACKAGE_MANAGERS
        .iter()
        .copied()
        .find(|manager| host_program(manager).is_some())
}

fn package_plan(manager: &str) -> Option<PackagePlan> {
    let (name, label, install_args, needs_reboot) = match manager {
        "apt-get" => ("apt-get", "APT · Debian/Ubuntu", APT_INSTALL_ARGS, false),
        "dnf" => ("dnf", "DNF · Fedora/RHEL", DNF_INSTALL_ARGS, false),
        "pacman" => ("pacman", "Pacman · Arch Linux", PACMAN_INSTALL_ARGS, false),
        "zypper" => ("zypper", "Zypper · openSUSE", ZYPPER_INSTALL_ARGS, false),
        "apk" => ("apk", "APK · Alpine Linux", APK_INSTALL_ARGS, false),
        "xbps-install" => (
            "xbps-install",
            "XBPS · Void Linux",
            XBPS_INSTALL_ARGS,
            false,
        ),
        "eopkg" => ("eopkg", "eopkg · Solus", EOPKG_INSTALL_ARGS, false),
        "rpm-ostree" => (
            "rpm-ostree",
            "rpm-ostree · Değişmez sistem",
            RPM_OSTREE_INSTALL_ARGS,
            true,
        ),
        _ => return None,
    };
    Some(PackagePlan {
        name,
        label,
        install_args,
        needs_reboot,
    })
}

fn snap_package_plan(manager: &str) -> Option<PackagePlan> {
    let (name, label, install_args, needs_reboot) = match manager {
        "apt-get" => ("apt-get", "APT · Debian/Ubuntu", APT_SNAPD_ARGS, false),
        "dnf" => ("dnf", "DNF · Fedora/RHEL", DNF_SNAPD_ARGS, false),
        "zypper" => ("zypper", "Zypper · openSUSE", ZYPPER_SNAPD_ARGS, false),
        "apk" => ("apk", "APK · Alpine Linux", APK_SNAPD_ARGS, false),
        "xbps-install" => ("xbps-install", "XBPS · Void Linux", XBPS_SNAPD_ARGS, false),
        "eopkg" => ("eopkg", "eopkg · Solus", EOPKG_SNAPD_ARGS, false),
        "rpm-ostree" => (
            "rpm-ostree",
            "rpm-ostree · Değişmez sistem",
            RPM_OSTREE_SNAPD_ARGS,
            true,
        ),
        _ => return None,
    };
    Some(PackagePlan {
        name,
        label,
        install_args,
        needs_reboot,
    })
}

fn snap_version() -> Option<String> {
    let output = run_capture("snap", &["version"]).ok()?;
    if !output.success {
        return None;
    }
    output
        .stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| truncate_chars(line, 120))
}

fn snap_available() -> bool {
    host_program("snap").is_some()
}

fn brew_version() -> Option<String> {
    let output = run_capture("brew", &["--version"]).ok()?;
    if !output.success {
        return None;
    }
    output
        .stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| truncate_chars(line, 120))
}

fn brew_prefix() -> Option<String> {
    let output = run_capture("brew", &["--prefix"]).ok()?;
    if !output.success {
        return None;
    }
    output
        .stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.to_string())
}

fn brew_available() -> bool {
    brew_version().is_some()
}

fn setup_status() -> SetupStatus {
    let version = flatpak_version();
    let flatpak_available = version.is_some();
    let remotes = list_remotes_sync().unwrap_or_default();
    let flathub_available = remotes.iter().any(|remote| remote.name == "flathub");
    let user_flathub_available = flatpak_user_remotes().contains_key("flathub");
    let os_release = read_os_release();
    let distro_id = os_release
        .get("ID")
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    let distro_name = ["PRETTY_NAME", "NAME", "ID"]
        .iter()
        .filter_map(|key| os_release.get(*key))
        .map(|value| value.trim())
        .find(|value| !value.is_empty())
        .unwrap_or("Linux")
        .to_string();
    let package_manager = detect_package_manager();
    let plan = package_manager.and_then(package_plan);
    let snap_plan = package_manager.and_then(snap_package_plan);
    let polkit_available = host_program("pkexec").is_some();
    let install_supported = flatpak_available || (plan.is_some() && polkit_available);
    let immutable = is_ostree_system();
    let manual_command = if flatpak_available {
        String::new()
    } else {
        plan.as_ref()
            .map(|plan| format!("sudo {}", plan.install_args.join(" ")))
            .unwrap_or_default()
    };
    let snap_program = snap_available();
    let snap_ver = if snap_program { snap_version() } else { None };
    let snap_install_supported = snap_program
        || (snap_plan.is_some() && polkit_available && host_program("systemctl").is_some());
    let snap_manual_command = if snap_program {
        String::new()
    } else {
        snap_plan
            .as_ref()
            .map(|plan| format!("sudo {}", plan.install_args.join(" ")))
            .unwrap_or_else(|| {
                "yay -S snapd && sudo systemctl enable --now snapd.socket".to_string()
            })
    };
    let brew_ver = brew_version();
    let brew_program = brew_ver.is_some();
    let brew_install_supported = brew_program
        || (host_program("curl").is_some() && host_program("bash").is_some() && polkit_available);
    SetupStatus {
        flatpak_available,
        flatpak_version: version,
        flathub_available,
        user_flathub_available,
        snap_available: snap_program,
        snap_version: snap_ver.clone(),
        snapd_running: snap_ver.is_some(),
        snap_install_supported,
        snap_manual_command,
        brew_available: brew_program,
        brew_version: brew_ver,
        brew_prefix: brew_prefix(),
        brew_install_supported,
        brew_manual_command: if brew_program {
            String::new()
        } else {
            HOMEBREW_COMMAND.to_string()
        },
        ready: flatpak_available && user_flathub_available,
        distro_id,
        distro_name,
        package_manager: plan.as_ref().map(|plan| plan.name.to_string()),
        package_manager_label: plan.as_ref().map(|plan| plan.label.to_string()),
        install_supported,
        polkit_available,
        immutable,
        reboot_required: false,
        manual_command,
        flathub_command: FLATHUB_REMOTE_COMMAND.to_string(),
    }
}

fn valid_flatpak_id(app_id: &str) -> bool {
    if app_id.is_empty() || app_id.len() > 255 || app_id.starts_with('-') {
        return false;
    }
    app_id
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-' | '+'))
}

fn valid_remote_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 64 || name.starts_with('-') {
        return false;
    }
    name.chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
}

fn valid_remote_url(value: &str) -> bool {
    if value.len() > 500 {
        return false;
    }
    let Ok(url) = reqwest::Url::parse(value) else {
        return false;
    };
    matches!(url.scheme(), "http" | "https")
        && url.host_str().is_some()
        && url.username().is_empty()
        && url.password().is_none()
}

fn valid_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
}

fn valid_query(query: &str) -> Result<String, String> {
    let query = query.trim();
    if query.chars().count() < 2 {
        return Err("Arama için en az 2 karakter yazın.".to_string());
    }
    if query.chars().count() > 120 {
        return Err("Arama ifadesi çok uzun.".to_string());
    }
    if query.starts_with('-') || query.chars().any(char::is_control) {
        return Err("Arama ifadesi geçersiz karakterler içeriyor.".to_string());
    }
    Ok(query.to_string())
}

fn flatpak_user_remotes() -> HashMap<String, String> {
    let mut remotes = HashMap::new();
    if let Ok(output) = run_capture("flatpak", &["remotes", "--user", "--columns=name,url"]) {
        for line in output.stdout.lines() {
            if let Some((name, url)) = line.split_once('\t') {
                remotes.insert(name.trim().to_string(), url.trim().to_string());
            }
        }
    }
    remotes
}

fn ensure_flathub_user_remote() -> Result<(), String> {
    if !flatpak_available() {
        return Err(
            "Flatpak sistemde bulunamadı. Kurmak için: https://flatpak.org/setup/".to_string(),
        );
    }
    if flatpak_user_remotes().contains_key("flathub") {
        return Ok(());
    }
    let output = run_capture(
        "flatpak",
        &[
            "remote-add",
            "--user",
            "--if-not-exists",
            "flathub",
            FLATHUB_REPO,
        ],
    )?;
    if !output.success {
        return Err(failure_message("flatpak remote-add", &output));
    }
    Ok(())
}

fn flatpak_user_installed_ids() -> HashSet<String> {
    flatpak_installed_ids("user")
}

fn flatpak_installed_ids(scope: &str) -> HashSet<String> {
    let mut ids = HashSet::new();
    if let Ok(output) = run_capture(
        "flatpak",
        &["list", scope_flag(scope), "--app", "--columns=application"],
    ) {
        for line in output.stdout.lines() {
            let id = line.trim();
            if !id.is_empty() {
                ids.insert(id.to_string());
            }
        }
    }
    ids
}

fn flatpak_user_updates() -> HashSet<String> {
    flatpak_updates("user")
}

fn flatpak_updates(scope: &str) -> HashSet<String> {
    let mut ids = HashSet::new();
    if let Ok(output) = run_capture(
        "flatpak",
        &[
            "remote-ls",
            scope_flag(scope),
            "--updates",
            "--app",
            "--columns=application",
        ],
    ) {
        for line in output.stdout.lines() {
            let id = line.trim();
            if !id.is_empty() {
                ids.insert(id.to_string());
            }
        }
    }
    ids
}

fn flatpak_all_updates() -> HashSet<String> {
    let mut ids = flatpak_updates("user");
    ids.extend(flatpak_updates("system"));
    ids
}

fn scope_flag(scope: &str) -> &'static str {
    if scope == "system" {
        "--system"
    } else {
        "--user"
    }
}

fn flatpak_installed_scopes(app_id: &str) -> Vec<String> {
    let mut scopes = Vec::new();
    if flatpak_installed_ids("user").contains(app_id) {
        scopes.push("user".to_string());
    }
    if flatpak_installed_ids("system").contains(app_id) {
        scopes.push("system".to_string());
    }
    scopes
}

fn flatpak_list_all() -> Vec<FlatpakInstalled> {
    let mut apps = Vec::new();
    let Ok(output) = run_capture(
        "flatpak",
        &[
            "list",
            "--app",
            "--columns=application,name,version,description,installation",
        ],
    ) else {
        return apps;
    };
    if !output.success {
        return apps;
    }
    for line in output.stdout.lines() {
        let line = line.trim_end();
        if line.is_empty() {
            continue;
        }
        let fields: Vec<&str> = line.split('\t').collect();
        let app_id = fields.first().copied().unwrap_or("").trim();
        if app_id.is_empty() {
            continue;
        }
        let installation = fields.get(4).copied().unwrap_or("").trim().to_lowercase();
        apps.push(FlatpakInstalled {
            app_id: app_id.to_string(),
            name: fields.get(1).copied().unwrap_or(app_id).trim().to_string(),
            version: fields.get(2).copied().unwrap_or("").trim().to_string(),
            summary: fields.get(3).copied().unwrap_or("").trim().to_string(),
            scope: if installation.contains("system") {
                "system".to_string()
            } else {
                "user".to_string()
            },
        });
    }
    apps
}

fn flatpak_icon_url(app_id: &str) -> String {
    format!("{FLATHUB_ICON_ROOT}/{app_id}.png")
}

fn data_url_from_file(path: &Path) -> Option<String> {
    let metadata = fs::metadata(path).ok()?;
    if !metadata.is_file() || metadata.len() > 512 * 1024 {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    let mime = match path.extension().and_then(|value| value.to_str()) {
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        _ => return None,
    };
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

fn flatpak_icon_data_url(app_id: &str) -> Option<String> {
    let mut roots = Vec::new();
    if let Some(home) = env::var_os("HOME") {
        roots.push(PathBuf::from(home).join(".local/share/flatpak/exports/share/icons"));
    }
    roots.push(PathBuf::from("/var/lib/flatpak/exports/share/icons"));
    let themes = ["hicolor", "Adwaita", "breeze", "breeze-dark"];
    let sizes = ["128x128", "256x256", "64x64", "48x48", "scalable"];
    for root in roots {
        for theme in themes {
            for size in sizes {
                for ext in [".png", ".svg"] {
                    let path = root
                        .join(theme)
                        .join(size)
                        .join("apps")
                        .join(format!("{app_id}{ext}"));
                    if let Some(data) = data_url_from_file(&path) {
                        return Some(data);
                    }
                }
            }
        }
    }
    None
}

fn installed_apps() -> Vec<AppItem> {
    let updates = flatpak_all_updates();
    let mut grouped: HashMap<String, (String, String, String, HashSet<String>)> = HashMap::new();
    for installed in flatpak_list_all() {
        let entry = grouped.entry(installed.app_id.clone()).or_insert_with(|| {
            (
                installed.name.clone(),
                installed.version.clone(),
                installed.summary.clone(),
                HashSet::new(),
            )
        });
        if !installed.name.is_empty() {
            entry.0 = installed.name.clone();
        }
        if !installed.version.is_empty() {
            entry.1 = installed.version.clone();
        }
        if !installed.summary.is_empty() {
            entry.2 = installed.summary.clone();
        }
        entry.3.insert(installed.scope);
    }
    let mut apps: Vec<AppItem> = grouped
        .into_iter()
        .map(|(app_id, (name, version, summary, scopes))| {
            let update_available = updates.contains(&app_id);
            let mut scope_list: Vec<&str> = scopes.iter().map(String::as_str).collect();
            scope_list.sort_unstable();
            let scope = if scope_list.len() > 1 {
                "both".to_string()
            } else {
                scope_list.first().copied().unwrap_or("user").to_string()
            };
            AppItem {
                id: app_key("flatpak", &app_id),
                name,
                summary,
                developer: String::new(),
                version,
                icon: flatpak_icon_data_url(&app_id).or_else(|| Some(flatpak_icon_url(&app_id))),
                installed: true,
                update_available,
                category: None,
                monthly_installs: None,
                hero_image: None,
                source: "flatpak".to_string(),
                scope: Some(scope),
                kind: None,
                classic: false,
            }
        })
        .collect();
    apps.sort_by_key(|app| app.name.to_lowercase());
    apps
}

fn is_flatpak_runtime_id(app_id: &str) -> bool {
    let id = app_id.to_lowercase();
    id.starts_with("org.freedesktop.platform")
        || id.starts_with("org.freedesktop.sdk")
        || id.starts_with("org.gnome.platform")
        || id.starts_with("org.gnome.sdk")
        || id.starts_with("org.kde.platform")
        || id.starts_with("org.kde.sdk")
        || id.starts_with("org.gtk.gtk3theme")
        || id.contains(".plugin.")
        || id.ends_with(".locale")
        || id.ends_with(".debug")
        || id.ends_with(".sources")
        || id.contains(".codec.")
}

/* ── Flathub API ────────────────────────────────────── */

fn http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
            .user_agent("MacroStore/0.2 (Flathub istemcisi)")
            .build()
            .expect("HTTP istemcisi oluşturulamadı")
    })
}

async fn get_json<T: DeserializeOwned>(url: &str) -> Result<T, String> {
    let response = http_client()
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|err| format!("Flathub'a ulaşılamadı: {err}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Flathub yanıtı başarısız: HTTP {}",
            response.status().as_u16()
        ));
    }
    response
        .json::<T>()
        .await
        .map_err(|err| format!("Flathub verisi okunamadı: {err}"))
}

async fn get_optional<T: DeserializeOwned>(url: &str) -> Option<T> {
    get_json(url).await.ok()
}

fn safe_icon(value: Option<String>, app_id: &str) -> Option<String> {
    value
        .filter(|url| url.starts_with("https://dl.flathub.org/"))
        .or_else(|| Some(flatpak_icon_url(app_id)))
}

fn category_of(app: &ApiApp) -> Option<String> {
    app.main_categories
        .as_ref()
        .and_then(StringOrVec::first)
        .map(|value| value.to_lowercase())
        .filter(|value| CATEGORIES.contains(&value.as_str()))
}

fn app_from_api(
    app: ApiApp,
    installed: &HashSet<String>,
    updates: &HashSet<String>,
) -> Option<AppItem> {
    let id = app.app_id.trim().to_string();
    if !valid_flatpak_id(&id) || app.name.trim().is_empty() {
        return None;
    }
    let is_installed = installed.contains(&id);
    let category = category_of(&app);
    let update_available = is_installed && updates.contains(&id);
    Some(AppItem {
        name: truncate_chars(app.name.trim(), 120),
        summary: truncate_chars(app.summary.trim(), 500),
        developer: app.developer_name.unwrap_or_default().trim().to_string(),
        version: String::new(),
        icon: safe_icon(app.icon, &id),
        installed: is_installed,
        update_available,
        category,
        monthly_installs: app.installs_last_month,
        hero_image: None,
        id: app_key("flatpak", &id),
        source: "flatpak".to_string(),
        scope: None,
        kind: None,
        classic: false,
    })
}

fn fallback_app(id: &str, installed: &HashSet<String>, updates: &HashSet<String>) -> AppItem {
    let is_installed = installed.contains(id);
    AppItem {
        id: app_key("flatpak", id),
        name: id.to_string(),
        summary: String::new(),
        developer: String::new(),
        version: String::new(),
        icon: Some(flatpak_icon_url(id)),
        installed: is_installed,
        update_available: is_installed && updates.contains(id),
        category: None,
        monthly_installs: None,
        hero_image: None,
        source: "flatpak".to_string(),
        scope: None,
        kind: None,
        classic: false,
    }
}

fn screenshot_url(screenshot: &ApiScreenshot) -> Option<String> {
    screenshot
        .sizes
        .iter()
        .filter(|size| size.src.starts_with("https://dl.flathub.org/"))
        .max_by_key(|size| size.width.parse::<u32>().unwrap_or(0))
        .map(|size| size.src.clone())
}

fn screenshots_of(appstream: &Appstream) -> Vec<ScreenshotItem> {
    appstream
        .screenshots
        .iter()
        .filter_map(|screenshot| {
            Some(ScreenshotItem {
                url: screenshot_url(screenshot)?,
                caption: screenshot
                    .caption
                    .as_ref()
                    .map(|value| truncate_chars(value.trim(), 180))
                    .filter(|value| !value.is_empty()),
            })
        })
        .collect()
}

fn main_category_from_appstream(categories: &[String]) -> Option<String> {
    for category in categories {
        let value = category.to_lowercase();
        let slug = match value.as_str() {
            "audiovideo" | "audio" | "video" | "player" | "recorder" => "audiovideo",
            "development" | "ide" => "development",
            "education" => "education",
            "healthfitness" => "healthfitness",
            "game" => "game",
            "graphics" | "photography" | "2dgraphics" | "3dgraphics" | "vectorgraphics"
            | "rastergraphics" => "graphics",
            "network" | "webbrowser" | "email" | "chat" | "filetransfer" | "remoteaccess" => {
                "network"
            }
            "office" | "spreadsheet" | "wordprocessor" | "presentation" | "calendar"
            | "contactmanagement" => "office",
            "science" => "science",
            "system" | "settings" | "filemanager" | "terminalemulator" | "packagemanager" => {
                "system"
            }
            "utility" | "archiving" | "compression" | "calculator" | "clock" | "texteditor" => {
                "utility"
            }
            _ => continue,
        };
        return Some(slug.to_string());
    }
    None
}

fn verified(appstream: &Appstream) -> bool {
    appstream
        .metadata
        .get("flathub::verification::verified")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

async fn fetch_appstream_item(
    id: String,
    installed: HashSet<String>,
    updates: HashSet<String>,
) -> AppItem {
    let url = format!("{FLATHUB_API}/appstream/{id}");
    match get_json::<Appstream>(&url).await {
        Ok(appstream) => {
            let version = appstream
                .releases
                .first()
                .and_then(|release| release.version.clone())
                .unwrap_or_default();
            let is_installed = installed.contains(&id);
            let icon = safe_icon(appstream.icon.clone(), &id);
            let hero_image = screenshots_of(&appstream)
                .first()
                .map(|item| item.url.clone());
            let category = main_category_from_appstream(&appstream.categories);
            let update_available = is_installed && updates.contains(&id);
            AppItem {
                id: app_key("flatpak", &id),
                name: truncate_chars(
                    if appstream.name.trim().is_empty() {
                        appstream.id.as_str()
                    } else {
                        appstream.name.trim()
                    },
                    120,
                ),
                summary: truncate_chars(appstream.summary.trim(), 500),
                developer: appstream
                    .developer_name
                    .unwrap_or_default()
                    .trim()
                    .to_string(),
                version,
                icon,
                installed: is_installed,
                update_available,
                category,
                monthly_installs: None,
                hero_image,
                source: "flatpak".to_string(),
                scope: None,
                kind: None,
                classic: false,
            }
        }
        Err(_) => fallback_app(&id, &installed, &updates),
    }
}

async fn fetch_collection(
    path: &str,
    per_page: usize,
    installed: HashSet<String>,
    updates: HashSet<String>,
) -> Vec<AppItem> {
    let url = format!("{FLATHUB_API}/collection/{path}?page=1&per_page={per_page}&locale=tr");
    let Ok(response) = get_json::<ApiSearchResponse>(&url).await else {
        return Vec::new();
    };
    response
        .hits
        .into_iter()
        .filter_map(|app| app_from_api(app, &installed, &updates))
        .collect()
}

fn flatpak_search_fallback(
    query: &str,
    installed: &HashSet<String>,
    updates: &HashSet<String>,
) -> Result<Vec<AppItem>, String> {
    if !flatpak_available() {
        return Ok(Vec::new());
    }
    let output = run_capture(
        "flatpak",
        &[
            "search",
            "--user",
            "--columns=application,name,description,version,branch",
            query,
        ],
    )?;
    if !output.success && output.stdout.trim().is_empty() {
        return Err(failure_message("flatpak search", &output));
    }
    let mut seen = HashSet::new();
    let mut apps = Vec::new();
    for line in output.stdout.lines() {
        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() < 5 {
            continue;
        }
        let app_id = fields[0].trim();
        let name = fields[1].trim();
        let summary = fields[2].trim();
        let version = fields[3].trim();
        let branch = fields[4].trim();
        if app_id.is_empty()
            || name.is_empty()
            || branch != "stable"
            || !valid_flatpak_id(app_id)
            || is_flatpak_runtime_id(app_id)
            || !seen.insert(app_id.to_string())
        {
            continue;
        }
        let is_installed = installed.contains(app_id);
        apps.push(AppItem {
            id: app_key("flatpak", app_id),
            name: name.to_string(),
            summary: truncate_chars(summary, 500),
            developer: String::new(),
            version: version.to_string(),
            icon: Some(flatpak_icon_url(app_id)),
            installed: is_installed,
            update_available: is_installed && updates.contains(app_id),
            category: None,
            monthly_installs: None,
            hero_image: None,
            source: "flatpak".to_string(),
            scope: None,
            kind: None,
            classic: false,
        });
        if apps.len() >= SEARCH_LIMIT {
            break;
        }
    }
    Ok(apps)
}

/* ── Snap arka ucu ─────────────────────────────────── */

const SNAP_FIELDS: &str = "title,summary,description,license,contact,website,publisher,media,categories,store-url,revision,channel,confinement";

async fn get_snap_json<T: DeserializeOwned>(url: &str) -> Result<T, String> {
    let response = http_client()
        .get(url)
        .header("Accept", "application/json")
        .header("Snap-Device-Series", SNAP_DEVICE_SERIES)
        .send()
        .await
        .map_err(|err| format!("Snap Store’a ulaşılamadı: {err}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Snap Store yanıtı başarısız: HTTP {}",
            response.status().as_u16()
        ));
    }
    response
        .json::<T>()
        .await
        .map_err(|err| format!("Snap Store verisi okunamadı: {err}"))
}

fn snap_find_url(params: &[(&str, &str)]) -> String {
    let Ok(mut url) = reqwest::Url::parse(&format!("{SNAP_API}/snaps/find")) else {
        return format!("{SNAP_API}/snaps/find");
    };
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("fields", SNAP_FIELDS);
        for (key, value) in params {
            query.append_pair(key, value);
        }
    }
    url.to_string()
}

fn snap_list_installed() -> Vec<SnapInstalled> {
    let mut snaps = Vec::new();
    let Ok(output) = run_capture("snap", &["list"]) else {
        return snaps;
    };
    if !output.success {
        return snaps;
    }
    for raw in output.stdout.lines() {
        let line = raw.trim();
        if line.is_empty()
            || line.starts_with("Name ")
            || line.starts_with("No snaps")
            || line.starts_with("error:")
        {
            continue;
        }
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() < 5 {
            continue;
        }
        let name = fields[0];
        if !valid_snap_name(name) {
            continue;
        }
        let notes = fields.get(5).copied().unwrap_or("");
        let summary = fields
            .get(6..)
            .map(|parts| parts.join(" "))
            .unwrap_or_default();
        snaps.push(SnapInstalled {
            name: name.to_string(),
            version: fields.get(1).copied().unwrap_or("").to_string(),
            summary,
            publisher: fields.get(4).copied().unwrap_or("").to_string(),
            classic: notes.contains("classic"),
        });
    }
    snaps.sort_by_key(|snap| snap.name.to_lowercase());
    snaps
}

fn snap_info_summary(name: &str) -> Option<String> {
    let output = run_capture("snap", &["info", name]).ok()?;
    if !output.success {
        return None;
    }
    for line in output.stdout.lines() {
        if let Some(value) = line.strip_prefix("summary:") {
            let value = value.trim();
            if !value.is_empty() {
                return Some(truncate_chars(value, 500));
            }
        }
    }
    None
}

fn snap_updates() -> HashSet<String> {
    let mut updates = HashSet::new();
    let Ok(output) = run_capture("snap", &["refresh", "--list"]) else {
        return updates;
    };
    if !output.success {
        return updates;
    }
    for raw in output.stdout.lines() {
        let line = raw.trim();
        if line.is_empty()
            || line.starts_with("Name ")
            || line.starts_with("All snaps")
            || line.starts_with("No updates")
            || line.starts_with("error:")
        {
            continue;
        }
        if let Some(name) = line.split_whitespace().next() {
            if valid_snap_name(name) {
                updates.insert(name.to_string());
            }
        }
    }
    updates
}

fn find_icon_in_dir(root: &Path, name: &str, depth: usize) -> Option<PathBuf> {
    if depth == 0 {
        return None;
    }
    let entries = fs::read_dir(root).ok()?;
    let mut nested = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            nested.push(path);
            continue;
        }
        let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !(file_name.ends_with(".png")
            || file_name.ends_with(".svg")
            || file_name.ends_with(".webp"))
        {
            continue;
        }
        if file_name == format!("{name}.png")
            || file_name == format!("{name}.svg")
            || file_name.starts_with(&format!("{name}_"))
            || file_name.starts_with(&format!("{name}-"))
            || file_name.starts_with(&format!("{name}."))
        {
            return Some(path);
        }
    }
    for path in nested {
        if let Some(found) = find_icon_in_dir(&path, name, depth - 1) {
            return Some(found);
        }
    }
    None
}

fn snap_icon_data_url(name: &str) -> Option<String> {
    let mut roots = vec![PathBuf::from("/var/lib/snapd/desktop/icons")];
    if let Some(home) = home_dir() {
        roots.push(home.join(".local/share/icons"));
    }
    for root in roots {
        if let Some(path) = find_icon_in_dir(&root, name, 5) {
            if let Some(data) = data_url_from_file(&path) {
                return Some(data);
            }
        }
    }
    for path in [
        format!("/snap/{name}/current/meta/gui/icon.png"),
        format!("/snap/{name}/current/meta/gui/icon.svg"),
    ] {
        if let Some(data) = data_url_from_file(Path::new(&path)) {
            return Some(data);
        }
    }
    None
}

fn snap_installed_apps() -> Vec<AppItem> {
    let updates = snap_updates();
    let mut apps = Vec::new();
    for (index, snap) in snap_list_installed().into_iter().enumerate() {
        let summary = if snap.summary.is_empty() && index < 30 {
            snap_info_summary(&snap.name).unwrap_or_default()
        } else {
            snap.summary
        };
        let update_available = updates.contains(&snap.name);
        apps.push(AppItem {
            id: app_key("snap", &snap.name),
            name: snap.name.clone(),
            summary,
            developer: snap.publisher,
            version: snap.version,
            icon: snap_icon_data_url(&snap.name),
            installed: true,
            update_available,
            category: None,
            monthly_installs: None,
            hero_image: None,
            source: "snap".to_string(),
            scope: Some("system".to_string()),
            kind: None,
            classic: snap.classic,
        });
    }
    apps
}

fn safe_remote_image(value: &str) -> Option<String> {
    let url = reqwest::Url::parse(value).ok()?;
    (url.scheme() == "https"
        && url.host_str().is_some()
        && url.username().is_empty()
        && url.password().is_none())
    .then(|| value.to_string())
}

fn snap_media_icon(meta: &SnapMeta) -> Option<String> {
    meta.media
        .iter()
        .filter(|media| media.kind == "icon")
        .max_by_key(|media| media.width)
        .and_then(|media| safe_remote_image(&media.url))
}

fn snap_media_screenshots(meta: &SnapMeta) -> Vec<ScreenshotItem> {
    meta.media
        .iter()
        .filter(|media| media.kind == "screenshot")
        .filter_map(|media| {
            Some(ScreenshotItem {
                url: safe_remote_image(&media.url)?,
                caption: Some(meta.title.clone()).filter(|value| !value.is_empty()),
            })
        })
        .take(6)
        .collect()
}

fn snap_category(meta: &SnapMeta) -> Option<String> {
    for category in &meta.categories {
        let slug = match category.name.as_str() {
            "games" => "game",
            "photo-and-video" | "music-and-audio" => "audiovideo",
            "development" => "development",
            "education" => "education",
            "health-and-fitness" => "healthfitness",
            "productivity" | "finance" => "office",
            "science" => "science",
            "security" | "server-and-cloud" | "devices-and-iot" => "system",
            "social" | "news-and-weather" => "network",
            "art-and-design" => "graphics",
            "utilities" | "personalisation" | "books-and-reference" | "entertainment" => "utility",
            _ => continue,
        };
        return Some(slug.to_string());
    }
    None
}

fn snap_app_item(
    result: SnapResult,
    installed: &HashSet<String>,
    updates: &HashSet<String>,
) -> Option<AppItem> {
    let name = result.name.trim().to_string();
    if !valid_snap_name(&name) {
        return None;
    }
    let meta = result.snap;
    let revision = result.revision.unwrap_or_default();
    let is_installed = installed.contains(&name);
    let summary = if meta.summary.trim().is_empty() {
        meta.description.trim()
    } else {
        meta.summary.trim()
    };
    Some(AppItem {
        id: app_key("snap", &name),
        name: truncate_chars(
            if meta.title.trim().is_empty() {
                name.as_str()
            } else {
                meta.title.trim()
            },
            120,
        ),
        summary: truncate_chars(summary, 500),
        developer: meta
            .publisher
            .as_ref()
            .map(|publisher| {
                if publisher.display_name.trim().is_empty() {
                    publisher.username.trim()
                } else {
                    publisher.display_name.trim()
                }
            })
            .unwrap_or("")
            .to_string(),
        version: revision.version,
        icon: snap_media_icon(&meta),
        installed: is_installed,
        update_available: is_installed && updates.contains(&name),
        category: snap_category(&meta),
        monthly_installs: None,
        hero_image: snap_media_screenshots(&meta)
            .first()
            .map(|item| item.url.clone()),
        source: "snap".to_string(),
        scope: is_installed.then(|| "system".to_string()),
        kind: None,
        classic: revision.confinement == "classic",
    })
}

fn snap_search_fallback(
    query: &str,
    installed: &HashSet<String>,
    updates: &HashSet<String>,
) -> Vec<AppItem> {
    let Ok(output) = run_capture("snap", &["find", query]) else {
        return Vec::new();
    };
    if !output.success {
        return Vec::new();
    }
    let mut apps = Vec::new();
    for raw in output.stdout.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with("Name ") || line.starts_with("No matching") {
            continue;
        }
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() < 2 || !valid_snap_name(fields[0]) {
            continue;
        }
        let name = fields[0];
        let is_installed = installed.contains(name);
        let summary = fields
            .get(4..)
            .map(|parts| parts.join(" "))
            .unwrap_or_default();
        apps.push(AppItem {
            id: app_key("snap", name),
            name: name.to_string(),
            summary: truncate_chars(&summary, 500),
            developer: fields.get(2).copied().unwrap_or("").to_string(),
            version: fields.get(1).copied().unwrap_or("").to_string(),
            icon: snap_icon_data_url(name),
            installed: is_installed,
            update_available: is_installed && updates.contains(name),
            category: None,
            monthly_installs: None,
            hero_image: None,
            source: "snap".to_string(),
            scope: is_installed.then(|| "system".to_string()),
            kind: None,
            classic: fields.get(3).is_some_and(|notes| notes.contains("classic")),
        });
        if apps.len() >= SEARCH_LIMIT {
            break;
        }
    }
    apps
}

async fn snap_search(query: &str) -> Vec<AppItem> {
    if !snap_available() {
        return Vec::new();
    }
    let installed = snap_list_installed()
        .into_iter()
        .map(|snap| snap.name)
        .collect::<HashSet<_>>();
    let updates = snap_updates();
    let url = snap_find_url(&[("q", query)]);
    match get_snap_json::<SnapFindResponse>(&url).await {
        Ok(response) => response
            .results
            .into_iter()
            .filter_map(|result| snap_app_item(result, &installed, &updates))
            .take(SEARCH_LIMIT)
            .collect(),
        Err(_) => snap_search_fallback(query, &installed, &updates),
    }
}

async fn snap_discover() -> Vec<AppItem> {
    if !snap_available() {
        return Vec::new();
    }
    let installed = snap_list_installed()
        .into_iter()
        .map(|snap| snap.name)
        .collect::<HashSet<_>>();
    let updates = snap_updates();
    let url = snap_find_url(&[("category", "featured")]);
    match get_snap_json::<SnapFindResponse>(&url).await {
        Ok(response) => response
            .results
            .into_iter()
            .filter_map(|result| snap_app_item(result, &installed, &updates))
            .take(12)
            .collect(),
        Err(_) => Vec::new(),
    }
}

async fn snap_detail(name: &str) -> Result<AppDetail, String> {
    if !valid_snap_name(name) {
        return Err("Snap adı geçersiz.".to_string());
    }
    let query_url = snap_find_url(&[("q", name)]);
    let search = get_snap_json::<SnapFindResponse>(&query_url).await.ok();
    let result = search.and_then(|response| {
        response
            .results
            .into_iter()
            .find(|result| result.name.eq_ignore_ascii_case(name))
    });
    let result = result.ok_or_else(|| {
        "Snap Store’da bu uygulama bulunamadı veya ayrıntılar yüklenemedi.".to_string()
    })?;
    let meta = result.snap.clone();
    let download_size = result
        .revision
        .as_ref()
        .and_then(|revision| revision.download.as_ref())
        .map(|download| download.size)
        .filter(|size| *size > 0);
    let installed = snap_list_installed()
        .into_iter()
        .map(|snap| snap.name)
        .collect::<HashSet<_>>();
    let updates = snap_updates();
    let app = snap_app_item(result, &installed, &updates)
        .ok_or_else(|| "Snap bilgileri okunamadı.".to_string())?;
    let screenshots = snap_media_screenshots(&meta);
    let categories = app.category.clone().into_iter().collect::<Vec<_>>();
    let description = if meta.description.trim().is_empty() {
        meta.summary.clone()
    } else {
        meta.description.clone()
    };

    Ok(AppDetail {
        app,
        description: truncate_chars(&description, 8000),
        screenshots,
        categories,
        license: meta.license,
        verified: meta
            .publisher
            .as_ref()
            .is_some_and(|publisher| publisher.validation == "verified"),
        homepage: meta.website.or(meta.store_url),
        download_size,
        installed_size: None,
        installs_last_month: None,
        rating: None,
        reviews: Vec::new(),
    })
}

/* ── Homebrew arka ucu ─────────────────────────────── */

fn brew_env_capture(args: &[&str]) -> Result<CmdOutput, String> {
    run_capture("brew", args)
}

fn brew_installed_list() -> Vec<BrewInstalled> {
    let mut packages = Vec::new();
    if let Ok(output) = brew_env_capture(&["info", "--json=v2", "--installed"]) {
        if output.success {
            if let Ok(value) = serde_json::from_str::<Value>(&output.stdout) {
                if let Some(formulae) = value.get("formulae").and_then(Value::as_array) {
                    for formula in formulae {
                        let Some(token) = formula.get("name").and_then(Value::as_str) else {
                            continue;
                        };
                        if !valid_brew_token(token) {
                            continue;
                        }
                        let version = formula
                            .get("installed")
                            .and_then(Value::as_array)
                            .and_then(|installed| installed.first())
                            .and_then(|installed| installed.get("version"))
                            .and_then(Value::as_str)
                            .or_else(|| formula.pointer("/versions/stable").and_then(Value::as_str))
                            .unwrap_or("")
                            .to_string();
                        packages.push(BrewInstalled {
                            token: token.to_string(),
                            version,
                            summary: formula
                                .get("desc")
                                .and_then(Value::as_str)
                                .unwrap_or("")
                                .to_string(),
                            kind: "formula".to_string(),
                            outdated: formula
                                .get("outdated")
                                .and_then(Value::as_bool)
                                .unwrap_or(false),
                        });
                    }
                }
                if let Some(casks) = value.get("casks").and_then(Value::as_array) {
                    for cask in casks {
                        let Some(token) = cask.get("token").and_then(Value::as_str) else {
                            continue;
                        };
                        if !valid_brew_token(token) {
                            continue;
                        }
                        let version = cask
                            .get("installed")
                            .and_then(Value::as_str)
                            .or_else(|| cask.get("version").and_then(Value::as_str))
                            .unwrap_or("")
                            .to_string();
                        packages.push(BrewInstalled {
                            token: token.to_string(),
                            version,
                            summary: cask
                                .get("desc")
                                .and_then(Value::as_str)
                                .unwrap_or("")
                                .to_string(),
                            kind: "cask".to_string(),
                            outdated: cask
                                .get("outdated")
                                .and_then(Value::as_bool)
                                .unwrap_or(false),
                        });
                    }
                }
            }
        }
    }
    if packages.is_empty() {
        for (kind, flag) in [("formula", "--formula"), ("cask", "--cask")] {
            let Ok(output) = brew_env_capture(&["list", flag, "--versions"]) else {
                continue;
            };
            if !output.success {
                continue;
            }
            for line in output.stdout.lines() {
                let fields: Vec<&str> = line.split_whitespace().collect();
                if let Some(token) = fields.first() {
                    if !valid_brew_token(token) {
                        continue;
                    }
                    packages.push(BrewInstalled {
                        token: token.to_string(),
                        version: fields.last().copied().unwrap_or("").to_string(),
                        summary: String::new(),
                        kind: kind.to_string(),
                        outdated: false,
                    });
                }
            }
        }
    }
    packages.sort_by_key(|package| package.token.to_lowercase());
    packages
}

fn brew_installed_apps() -> Vec<AppItem> {
    brew_installed_list()
        .into_iter()
        .map(|package| AppItem {
            id: app_key("homebrew", &package.token),
            name: package.token.clone(),
            summary: truncate_chars(&package.summary, 500),
            developer: "Homebrew".to_string(),
            version: package.version,
            icon: None,
            installed: true,
            update_available: package.outdated,
            category: None,
            monthly_installs: None,
            hero_image: None,
            source: "homebrew".to_string(),
            scope: Some("user".to_string()),
            kind: Some(package.kind),
            classic: false,
        })
        .collect()
}

fn brew_keys(installed: &[AppItem]) -> HashSet<String> {
    installed.iter().map(|app| app.id.clone()).collect()
}

fn brew_update_keys(installed: &[AppItem]) -> HashSet<String> {
    installed
        .iter()
        .filter(|app| app.update_available)
        .map(|app| app.id.clone())
        .collect()
}

async fn brew_formula_item(
    token: String,
    installed: HashSet<String>,
    updates: HashSet<String>,
    monthly: Option<u64>,
) -> Option<AppItem> {
    if !valid_brew_token(&token) {
        return None;
    }
    let url = format!("{BREW_API}/formula/{token}.json");
    let value = get_json::<Value>(&url).await.ok()?;
    let is_installed = installed.contains(&app_key("homebrew", &token));
    Some(AppItem {
        id: app_key("homebrew", &token),
        name: value
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(&token)
            .to_string(),
        summary: value
            .get("desc")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        developer: value
            .get("tap")
            .and_then(Value::as_str)
            .unwrap_or("Homebrew")
            .to_string(),
        version: value
            .pointer("/versions/stable")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        icon: None,
        installed: is_installed,
        update_available: is_installed && updates.contains(&app_key("homebrew", &token)),
        category: None,
        monthly_installs: monthly,
        hero_image: None,
        source: "homebrew".to_string(),
        scope: is_installed.then(|| "user".to_string()),
        kind: Some("formula".to_string()),
        classic: false,
    })
}

async fn brew_cask_item(
    token: String,
    installed: HashSet<String>,
    updates: HashSet<String>,
) -> Option<AppItem> {
    if !valid_brew_token(&token) {
        return None;
    }
    let url = format!("{BREW_API}/cask/{token}.json");
    let value = get_json::<Value>(&url).await.ok()?;
    let is_installed = installed.contains(&app_key("homebrew", &token));
    let name = value
        .get("name")
        .and_then(Value::as_array)
        .and_then(|names| names.first())
        .and_then(Value::as_str)
        .unwrap_or(&token)
        .to_string();
    Some(AppItem {
        id: app_key("homebrew", &token),
        name,
        summary: value
            .get("desc")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        developer: "Homebrew Cask".to_string(),
        version: value
            .get("version")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        icon: None,
        installed: is_installed,
        update_available: is_installed && updates.contains(&app_key("homebrew", &token)),
        category: None,
        monthly_installs: None,
        hero_image: None,
        source: "homebrew".to_string(),
        scope: is_installed.then(|| "user".to_string()),
        kind: Some("cask".to_string()),
        classic: false,
    })
}

fn brew_search_tokens(query: &str, kind: &str) -> Vec<String> {
    let flag = if kind == "cask" {
        "--cask"
    } else {
        "--formula"
    };
    let Ok(output) = brew_env_capture(&["search", flag, query]) else {
        return Vec::new();
    };
    if !output.success {
        return Vec::new();
    }
    let mut tokens = Vec::new();
    for raw in output.stdout.lines() {
        let line = raw.trim();
        if line.is_empty()
            || line.starts_with("==>")
            || line.starts_with("Error")
            || line.contains(' ')
        {
            continue;
        }
        if valid_brew_token(line) && !tokens.iter().any(|token| token == line) {
            tokens.push(line.to_string());
        }
        if tokens.len() >= 10 {
            break;
        }
    }
    tokens
}

async fn brew_search(query: &str) -> Vec<AppItem> {
    if !brew_available() {
        return Vec::new();
    }
    let installed_apps = brew_installed_apps();
    let installed = brew_keys(&installed_apps);
    let updates = brew_update_keys(&installed_apps);
    let mut tokens: Vec<(String, String)> = brew_search_tokens(query, "formula")
        .into_iter()
        .map(|token| (token, "formula".to_string()))
        .collect();
    for token in brew_search_tokens(query, "cask") {
        if !tokens.iter().any(|(existing, _)| existing == &token) {
            tokens.push((token, "cask".to_string()));
        }
    }
    if tokens.len() > SEARCH_LIMIT {
        tokens.truncate(SEARCH_LIMIT);
    }
    let mut apps = Vec::new();
    for (token, kind) in tokens {
        let item = if kind == "cask" {
            brew_cask_item(token, installed.clone(), updates.clone()).await
        } else {
            brew_formula_item(token, installed.clone(), updates.clone(), None).await
        };
        if let Some(item) = item {
            apps.push(item);
        }
    }
    apps
}

async fn brew_discover() -> Vec<AppItem> {
    if !brew_available() {
        return Vec::new();
    }
    let installed_apps = brew_installed_apps();
    let installed = brew_keys(&installed_apps);
    let updates = brew_update_keys(&installed_apps);
    let mut top: Vec<(String, Option<u64>)> = Vec::new();
    if let Ok(value) = get_json::<Value>(BREW_ANALYTICS).await {
        if let Some(items) = value.get("items").and_then(Value::as_array) {
            for item in items {
                let Some(token) = item.get("formula").and_then(Value::as_str) else {
                    continue;
                };
                if !valid_brew_token(token) {
                    continue;
                }
                let count = item
                    .get("count")
                    .and_then(Value::as_str)
                    .and_then(|value| value.replace(',', "").parse::<u64>().ok());
                top.push((token.to_string(), count));
                if top.len() >= 12 {
                    break;
                }
            }
        }
    }
    if top.is_empty() {
        top = [
            "git", "wget", "htop", "neovim", "ripgrep", "fd", "jq", "fzf", "bat", "btop",
        ]
        .into_iter()
        .map(|token| (token.to_string(), None))
        .collect();
    }
    let mut apps = Vec::new();
    for (token, monthly) in top {
        if let Some(item) =
            brew_formula_item(token, installed.clone(), updates.clone(), monthly).await
        {
            apps.push(item);
        }
    }
    apps
}

async fn brew_detail(token: &str, kind_hint: Option<&str>) -> Result<AppDetail, String> {
    if !valid_brew_token(token) {
        return Err("Homebrew paket adı geçersiz.".to_string());
    }
    let installed_apps = brew_installed_apps();
    let installed_entry = installed_apps
        .iter()
        .find(|app| app.id.eq_ignore_ascii_case(&app_key("homebrew", token)));
    let installed = brew_keys(&installed_apps);
    let updates = brew_update_keys(&installed_apps);
    let kind = kind_hint
        .map(str::to_string)
        .or_else(|| installed_entry.and_then(|app| app.kind.clone()));
    let (app, value) = match kind.as_deref() {
        Some("cask") => {
            let value = get_json::<Value>(&format!("{BREW_API}/cask/{token}.json"))
                .await
                .ok();
            let item = brew_cask_item(token.to_string(), installed.clone(), updates.clone()).await;
            (item, value)
        }
        Some("formula") => {
            let value = get_json::<Value>(&format!("{BREW_API}/formula/{token}.json"))
                .await
                .ok();
            let item =
                brew_formula_item(token.to_string(), installed.clone(), updates.clone(), None)
                    .await;
            (item, value)
        }
        _ => {
            let formula_url = format!("{BREW_API}/formula/{token}.json");
            let cask_url = format!("{BREW_API}/cask/{token}.json");
            let (formula_value, cask_value) = tokio::join!(
                get_json::<Value>(&formula_url),
                get_json::<Value>(&cask_url),
            );
            if formula_value.is_ok() {
                let item =
                    brew_formula_item(token.to_string(), installed.clone(), updates.clone(), None)
                        .await;
                (item, formula_value.ok())
            } else {
                let item =
                    brew_cask_item(token.to_string(), installed.clone(), updates.clone()).await;
                (item, cask_value.ok())
            }
        }
    };
    let app = app.ok_or_else(|| "Homebrew paketinde bulunamadı.".to_string())?;
    let value = value.unwrap_or_else(|| json!({}));
    let homepage = value
        .get("homepage")
        .and_then(Value::as_str)
        .map(str::to_string);
    let license = value
        .get("license")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let description = app.summary.clone();
    Ok(AppDetail {
        app,
        description: if description.is_empty() {
            "Homebrew paketi.".to_string()
        } else {
            description
        },
        screenshots: Vec::new(),
        categories: Vec::new(),
        license,
        verified: false,
        homepage,
        download_size: None,
        installed_size: None,
        installs_last_month: None,
        rating: None,
        reviews: Vec::new(),
    })
}

/* ── AppImage arka ucu ─────────────────────────────── */

fn load_appimage_index() -> Vec<AppImageEntry> {
    let Ok(text) = fs::read_to_string(appimage_index_path()) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<AppImageEntry>>(&text).unwrap_or_default()
}

fn save_appimage_index(entries: &[AppImageEntry]) -> Result<(), String> {
    fs::create_dir_all(appimage_dir())
        .map_err(|err| format!("AppImage dizini oluşturulamadı: {err}"))?;
    let text = serde_json::to_string_pretty(entries)
        .map_err(|err| format!("AppImage dizini yazılamadı: {err}"))?;
    fs::write(appimage_index_path(), text)
        .map_err(|err| format!("AppImage dizini yazılamadı: {err}"))
}

fn appimage_item(entry: &AppImageEntry) -> AppItem {
    AppItem {
        id: app_key("appimage", &entry.id),
        name: entry.name.clone(),
        summary: "Macro Store üzerinden içe aktarılan AppImage".to_string(),
        developer: "Yerel AppImage".to_string(),
        version: "Yerel".to_string(),
        icon: entry
            .icon_path
            .as_deref()
            .and_then(|path| data_url_from_file(Path::new(path))),
        installed: true,
        update_available: false,
        category: None,
        monthly_installs: None,
        hero_image: None,
        source: "appimage".to_string(),
        scope: Some("user".to_string()),
        kind: None,
        classic: false,
    }
}

fn appimage_installed_apps() -> Vec<AppItem> {
    let mut items: Vec<AppItem> = load_appimage_index()
        .iter()
        .filter(|entry| Path::new(&entry.path).is_file())
        .map(appimage_item)
        .collect();
    items.sort_by_key(|app| app.name.to_lowercase());
    items
}

fn appimage_desktop_path(slug: &str) -> Option<PathBuf> {
    home_dir().map(|home| {
        home.join(".local/share/applications")
            .join(format!("macro-store-{slug}.desktop"))
    })
}

fn appimage_icon_dir(extension: &str) -> PathBuf {
    let size = if extension == "svg" {
        "scalable"
    } else {
        "256x256"
    };
    data_home().join(format!("icons/hicolor/{size}/apps"))
}

fn detect_image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("png");
    }
    if bytes.starts_with(b"\xff\xd8\xff") {
        return Some("jpg");
    }
    if bytes.starts_with(b"RIFF") && bytes.len() > 12 && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(512)]);
    if head.trim_start().starts_with("<svg") || head.contains("<svg") {
        return Some("svg");
    }
    None
}

fn extract_appimage_icon(appimage: &Path, slug: &str) -> Option<PathBuf> {
    let temp = env::temp_dir().join(format!(
        "macro-store-appimage-{}-{}",
        std::process::id(),
        unix_timestamp()
    ));
    fs::create_dir_all(&temp).ok()?;
    let mut command = Command::new(appimage);
    command
        .arg("--appimage-extract")
        .arg(".DirIcon")
        .current_dir(&temp)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command
        .env_remove("LD_PRELOAD")
        .env_remove("LD_LIBRARY_PATH");
    let status = command.status().ok();
    let root = temp.join("squashfs-root");
    let dir_icon = root.join(".DirIcon");
    let resolved = if dir_icon.is_symlink() {
        fs::read_link(&dir_icon)
            .ok()
            .map(|target| {
                if target.is_absolute() {
                    target
                } else {
                    root.join(target)
                }
            })
            .unwrap_or(dir_icon.clone())
    } else {
        dir_icon.clone()
    };
    let bytes = fs::read(&resolved).ok();
    let extension = bytes.as_deref().and_then(detect_image_extension);
    let result = match (status, bytes, extension) {
        (Some(status), Some(bytes), Some(extension))
            if status.success() && bytes.len() <= 1024 * 1024 =>
        {
            let icon_dir = appimage_icon_dir(extension);
            fs::create_dir_all(&icon_dir).ok()?;
            let icon_path = icon_dir.join(format!("macro-store-{slug}.{extension}"));
            fs::write(&icon_path, bytes).ok()?;
            Some(icon_path)
        }
        _ => None,
    };
    let _ = fs::remove_dir_all(&temp);
    result
}

fn write_appimage_desktop(entry: &AppImageEntry) -> Option<PathBuf> {
    let path = appimage_desktop_path(&entry.id)?;
    let parent = path.parent()?;
    fs::create_dir_all(parent).ok()?;
    let icon = entry
        .icon_path
        .clone()
        .unwrap_or_else(|| "application-x-executable".to_string());
    let name = entry.name.replace(['\n', '\r'], " ").replace('"', "'");
    let exec = entry.path.replace('"', "\\\"");
    let body = format!(
        "[Desktop Entry]\nType=Application\nName={name}\nComment=Macro Store üzerinden kurulan AppImage\nExec=\"{exec}\" %U\nIcon={icon}\nTerminal=false\nCategories=Utility;\nStartupNotify=true\nX-Macro-Store-AppImage=true\n"
    );
    fs::write(&path, body).ok()?;
    if let Some(update) = host_program("update-desktop-database") {
        let mut command = Command::new(update);
        command
            .arg(parent)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        sanitize_std(&mut command);
        let _ = command.status();
    }
    Some(path)
}

fn import_appimage(path: &str, name: Option<String>) -> Result<AppItem, String> {
    let source = PathBuf::from(path.trim());
    if !source.is_file() {
        return Err("AppImage dosyası bulunamadı.".to_string());
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if extension != "appimage" {
        return Err("Yalnızca .AppImage veya .appimage dosyaları kurulabilir.".to_string());
    }
    let metadata =
        fs::metadata(&source).map_err(|err| format!("AppImage dosyası okunamadı: {err}"))?;
    if metadata.len() == 0 || metadata.len() > 8 * 1024 * 1024 * 1024 {
        return Err("AppImage dosya boyutu desteklenmiyor.".to_string());
    }
    let mut entries = load_appimage_index();
    let base_name = name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            source
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("appimage")
                .to_string()
        });
    let base_slug = {
        let slug = slugify(&base_name);
        if slug.is_empty() {
            "appimage".to_string()
        } else {
            slug
        }
    };
    let mut slug = base_slug.clone();
    let mut suffix = 2;
    while entries.iter().any(|entry| entry.id == slug)
        || appimage_dir().join(format!("{slug}.AppImage")).exists()
    {
        slug = format!("{base_slug}-{suffix}");
        suffix += 1;
    }
    let destination = appimage_dir().join(format!("{slug}.AppImage"));
    fs::create_dir_all(appimage_dir())
        .map_err(|err| format!("AppImage dizini oluşturulamadı: {err}"))?;
    let same_file = fs::canonicalize(&source).ok() == fs::canonicalize(&destination).ok();
    if !same_file {
        fs::copy(&source, &destination).map_err(|err| format!("AppImage kopyalanamadı: {err}"))?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&destination, fs::Permissions::from_mode(0o755));
    }
    let icon_path =
        extract_appimage_icon(&destination, &slug).map(|path| path.display().to_string());
    let display_name = truncate_chars(&base_name, 120);
    let entry = AppImageEntry {
        id: slug,
        name: display_name,
        path: destination.display().to_string(),
        icon_path,
        size: metadata.len(),
        imported_at: unix_timestamp(),
    };
    let desktop = write_appimage_desktop(&entry);
    if desktop.is_none() {
        // Masaüstü kısayolu oluşturulamasa bile AppImage mağaza içinden çalıştırılabilir.
    }
    entries.push(entry.clone());
    save_appimage_index(&entries)?;
    Ok(appimage_item(&entry))
}

fn remove_appimage(slug: &str) -> Result<String, String> {
    if !valid_appimage_slug(slug) {
        return Err("AppImage kimliği geçersiz.".to_string());
    }
    let mut entries = load_appimage_index();
    let Some(index) = entries.iter().position(|entry| entry.id == slug) else {
        return Err("AppImage kaydı bulunamadı.".to_string());
    };
    let entry = entries.remove(index);
    let _ = fs::remove_file(&entry.path);
    if let Some(icon) = &entry.icon_path {
        let _ = fs::remove_file(icon);
    }
    if let Some(desktop) = appimage_desktop_path(&entry.id) {
        let _ = fs::remove_file(desktop);
    }
    save_appimage_index(&entries)?;
    Ok("AppImage kaldırıldı.".to_string())
}

fn launch_appimage(slug: &str) -> Result<(), String> {
    if !valid_appimage_slug(slug) {
        return Err("AppImage kimliği geçersiz.".to_string());
    }
    let entry = load_appimage_index()
        .into_iter()
        .find(|entry| entry.id == slug)
        .ok_or_else(|| "AppImage kaydı bulunamadı.".to_string())?;
    let path = PathBuf::from(&entry.path);
    if !path.is_file() {
        return Err("AppImage dosyası bulunamadı.".to_string());
    }
    let mut command = Command::new(&path);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .env_remove("LD_PRELOAD")
        .env_remove("LD_LIBRARY_PATH");
    command
        .spawn()
        .map_err(|err| format!("AppImage başlatılamadı: {err}"))?;
    Ok(())
}

fn pick_appimage() -> Result<Option<String>, String> {
    if host_program("zenity").is_some() {
        let output = run_capture(
            "zenity",
            &[
                "--file-selection",
                "--title=AppImage seç",
                "--file-filter=AppImage | *.AppImage *.appimage",
            ],
        )?;
        if output.success {
            let path = output.stdout.trim();
            if !path.is_empty() {
                return Ok(Some(path.to_string()));
            }
        }
        return Ok(None);
    }
    if host_program("kdialog").is_some() {
        let home = home_dir().unwrap_or_default();
        let output = run_capture(
            "kdialog",
            &[
                "--getopenfilename",
                home.to_string_lossy().as_ref(),
                "AppImage (*.AppImage *.appimage)",
            ],
        )?;
        if output.success {
            let path = output.stdout.trim();
            if !path.is_empty() {
                return Ok(Some(path.to_string()));
            }
        }
        return Ok(None);
    }
    Err("Dosya seçici bulunamadı. AppImage yolunu elle yazabilirsiniz.".to_string())
}

fn appimage_detail(slug: &str) -> Result<AppDetail, String> {
    if !valid_appimage_slug(slug) {
        return Err("AppImage kimliği geçersiz.".to_string());
    }
    let entry = load_appimage_index()
        .into_iter()
        .find(|entry| entry.id == slug)
        .ok_or_else(|| "AppImage kaydı bulunamadı.".to_string())?;
    let app = appimage_item(&entry);
    Ok(AppDetail {
        app,
        description: format!(
            "Bu AppImage Macro Store üzerinden içe aktarıldı. Dosya konumu: {}. Uygulama, sistemdeki diğer AppImage’lar gibi bağımsız çalışır; mağaza üzerinden kaldırılabilir veya yeniden başlatılabilir.",
            entry.path
        ),
        screenshots: Vec::new(),
        categories: Vec::new(),
        license: String::new(),
        verified: false,
        homepage: None,
        download_size: Some(entry.size),
        installed_size: Some(entry.size),
        installs_last_month: None,
        rating: None,
        reviews: Vec::new(),
    })
}

#[tauri::command]
fn get_setup_status() -> SetupStatus {
    setup_status()
}

#[tauri::command]
async fn install_flatpak(app: AppHandle) -> Result<SetupStatus, String> {
    if OPERATING.load(Ordering::SeqCst) {
        return Err(
            "Bir Flatpak işlemi sürüyor. Lütfen işlem tamamlandıktan sonra yeniden deneyin."
                .to_string(),
        );
    }
    if SETTING_UP
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Sistem hazırlığı zaten sürüyor.".to_string());
    }
    let _lock = SetupLock;

    emit_setup_log(&app, "Sistem hazırlığı başlatıldı.", "info");

    if !flatpak_available() {
        let status = setup_status();
        emit_setup_log(
            &app,
            format!("Dağıtım algılandı: {}", status.distro_name),
            "info",
        );

        let Some(manager) = status.package_manager.as_deref() else {
            let message = "Bu dağıtım için otomatik Flatpak kurulumu desteklenmiyor. flatpak.org/setup adresindeki yönergeleri izleyin.".to_string();
            emit_setup_log(&app, format!("✕ {message}"), "error");
            return Err(message);
        };
        let Some(plan) = package_plan(manager) else {
            let message = "Paket yöneticisi için kurulum planı bulunamadı.".to_string();
            emit_setup_log(&app, format!("✕ {message}"), "error");
            return Err(message);
        };
        if !status.polkit_available {
            let message = if status.manual_command.is_empty() {
                "Polkit (pkexec) bulunamadı. Flatpak’ı terminalden kurup yeniden deneyin."
                    .to_string()
            } else {
                format!(
                    "Polkit (pkexec) bulunamadı. Terminalde şu komutu çalıştırın: {}",
                    status.manual_command
                )
            };
            emit_setup_log(&app, format!("✕ {message}"), "error");
            return Err(message);
        }

        let pkexec =
            host_program("pkexec").ok_or_else(|| "Polkit (pkexec) bulunamadı.".to_string())?;
        let manager_path = host_program(plan.name)
            .ok_or_else(|| format!("{} paket yöneticisi bulunamadı.", plan.name))?;
        emit_setup_log(
            &app,
            format!("Flatpak, {} ile kuruluyor…", plan.label),
            "info",
        );

        let mut args: Vec<OsString> = vec![manager_path.clone().into_os_string()];
        args.extend(plan.install_args.iter().map(OsString::from));
        let mut result = run_setup_step(&app, &pkexec, &args, "Flatpak paketi kuruldu.").await;

        if let Err(error) = &result {
            let apt_needs_update = plan.name == "apt-get"
                && (error.contains("Unable to locate package")
                    || error.contains("installation candidate")
                    || error.contains("Unable to locate"));
            if apt_needs_update {
                emit_setup_log(
                    &app,
                    "Paket listeleri güncelleniyor ve kurulum yeniden denenecek…",
                    "info",
                );
                let update_args = vec![
                    manager_path.clone().into_os_string(),
                    OsString::from("update"),
                ];
                if run_setup_step(&app, &pkexec, &update_args, "Paket listeleri güncellendi.")
                    .await
                    .is_ok()
                {
                    let mut retry_args: Vec<OsString> = vec![manager_path.clone().into_os_string()];
                    retry_args.extend(plan.install_args.iter().map(OsString::from));
                    result =
                        run_setup_step(&app, &pkexec, &retry_args, "Flatpak paketi kuruldu.").await;
                }
            }
        }
        result?;

        if plan.needs_reboot && !flatpak_available() {
            let message = "Flatpak katmanı rpm-ostree ile hazırlandı. Kullanmak için bilgisayarı yeniden başlatın.";
            emit_setup_log(&app, message, "info");
            let mut next = setup_status();
            next.reboot_required = true;
            let _ = app.emit("setup-finished", next.clone());
            return Ok(next);
        }

        if !flatpak_available() {
            let message = "Flatpak paketi kuruldu ancak flatpak komutu bulunamadı. Terminalde flatpak --version çalıştırıp yeniden deneyin.".to_string();
            emit_setup_log(&app, format!("✕ {message}"), "error");
            return Err(message);
        }
    }

    if !flatpak_user_remotes().contains_key("flathub") {
        emit_setup_log(&app, "Flathub kullanıcı deposu ekleniyor…", "info");
        let output = run_capture(
            "flatpak",
            &[
                "remote-add",
                "--user",
                "--if-not-exists",
                "flathub",
                FLATHUB_REPO,
            ],
        )?;
        if !output.success {
            let message = failure_message("flatpak remote-add", &output);
            emit_setup_log(&app, format!("✕ {message}"), "error");
            return Err(message);
        }
        emit_setup_log(&app, "✓ Flathub kullanıcı deposu hazır.", "info");
    } else {
        emit_setup_log(&app, "Flathub kullanıcı deposu zaten hazır.", "info");
    }

    let status = setup_status();
    if !status.ready {
        let message = "Kurulum tamamlandı ancak Flatpak ve Flathub hazır görünmüyor. Durumu yenileyip yeniden deneyin.".to_string();
        emit_setup_log(&app, format!("✕ {message}"), "error");
        return Err(message);
    }

    emit_setup_log(&app, "✓ Sistem hazır. Macro Store kullanıma hazır.", "info");
    let _ = app.emit("setup-finished", status.clone());
    Ok(status)
}

fn setup_guard() -> Result<SetupLock, String> {
    if OPERATING.load(Ordering::SeqCst) {
        return Err(
            "Bir uygulama işlemi sürüyor. Lütfen işlem tamamlandıktan sonra yeniden deneyin."
                .to_string(),
        );
    }
    if SETTING_UP
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Sistem hazırlığı zaten sürüyor.".to_string());
    }
    Ok(SetupLock)
}

#[tauri::command]
async fn install_snap(app: AppHandle) -> Result<SetupStatus, String> {
    let _lock = setup_guard()?;
    emit_setup_log(&app, "Snap hazırlığı başlatıldı.", "info");

    let status = setup_status();
    if !status.snap_available {
        let Some(manager) = status.package_manager.as_deref() else {
            let message = format!(
                "Bu dağıtım için otomatik snapd kurulumu desteklenmiyor. Terminalde şu komutu çalıştırın: {}",
                status.snap_manual_command
            );
            emit_setup_log(&app, format!("✕ {message}"), "error");
            return Err(message);
        };
        let Some(plan) = snap_package_plan(manager) else {
            let message = format!(
                "{} için snapd otomatik kurulumu yok. Terminalde şu komutu çalıştırın: {}",
                status.distro_name, status.snap_manual_command
            );
            emit_setup_log(&app, format!("✕ {message}"), "error");
            return Err(message);
        };
        if !status.polkit_available {
            let message = format!(
                "Polkit (pkexec) bulunamadı. Terminalde şu komutu çalıştırın: {}",
                status.snap_manual_command
            );
            emit_setup_log(&app, format!("✕ {message}"), "error");
            return Err(message);
        }

        let pkexec =
            host_program("pkexec").ok_or_else(|| "Polkit (pkexec) bulunamadı.".to_string())?;
        let manager_path = host_program(plan.name)
            .ok_or_else(|| format!("{} paket yöneticisi bulunamadı.", plan.name))?;
        emit_setup_log(
            &app,
            format!("snapd, {} ile kuruluyor…", plan.label),
            "info",
        );
        let mut args: Vec<OsString> = vec![manager_path.clone().into_os_string()];
        args.extend(plan.install_args.iter().map(OsString::from));
        let mut result = run_setup_step(&app, &pkexec, &args, "snapd paketi kuruldu.").await;

        if let Err(error) = &result {
            let apt_needs_update = plan.name == "apt-get"
                && (error.contains("Unable to locate package")
                    || error.contains("installation candidate")
                    || error.contains("Unable to locate"));
            if apt_needs_update {
                emit_setup_log(
                    &app,
                    "Paket listeleri güncelleniyor ve snapd kurulumu yeniden denenecek…",
                    "info",
                );
                let update_args = vec![
                    manager_path.clone().into_os_string(),
                    OsString::from("update"),
                ];
                if run_setup_step(&app, &pkexec, &update_args, "Paket listeleri güncellendi.")
                    .await
                    .is_ok()
                {
                    let mut retry_args: Vec<OsString> = vec![manager_path.clone().into_os_string()];
                    retry_args.extend(plan.install_args.iter().map(OsString::from));
                    result =
                        run_setup_step(&app, &pkexec, &retry_args, "snapd paketi kuruldu.").await;
                }
            }
        }
        result?;

        if plan.needs_reboot && !snap_available() {
            let message = "snapd katmanı rpm-ostree ile hazırlandı. Kullanmak için bilgisayarı yeniden başlatın.";
            emit_setup_log(&app, message, "info");
            let mut next = setup_status();
            next.reboot_required = true;
            let _ = app.emit("setup-finished", next.clone());
            return Ok(next);
        }
    }

    if let Some(systemctl) = host_program("systemctl") {
        let enable_args = vec![
            OsString::from("enable"),
            OsString::from("--now"),
            OsString::from("snapd.socket"),
        ];
        let result = if let Some(pkexec) = host_program("pkexec") {
            let mut full = vec![systemctl.clone().into_os_string()];
            full.extend(enable_args.clone());
            run_setup_step(&app, &pkexec, &full, "snapd hizmeti etkinleştirildi.").await
        } else {
            run_setup_step(
                &app,
                &systemctl,
                &enable_args,
                "snapd hizmeti etkinleştirildi.",
            )
            .await
        };
        if let Err(error) = result {
            emit_setup_log(
                &app,
                format!("snapd hizmeti etkinleştirilemedi: {error}"),
                "error",
            );
        }
    }

    if !snap_available() {
        let message = format!(
            "snapd kuruldu ancak snap komutu bulunamadı. Terminalde şu komutu çalıştırıp yeniden deneyin: {}",
            setup_status().snap_manual_command
        );
        emit_setup_log(&app, format!("✕ {message}"), "error");
        return Err(message);
    }

    let next = setup_status();
    emit_setup_log(&app, "✓ Snap kullanıma hazır.", "info");
    let _ = app.emit("setup-finished", next.clone());
    Ok(next)
}

#[tauri::command]
async fn install_homebrew(app: AppHandle) -> Result<SetupStatus, String> {
    let _lock = setup_guard()?;
    emit_setup_log(&app, "Homebrew hazırlığı başlatıldı.", "info");

    if !brew_available() {
        let Some(bash) = host_program("bash") else {
            let message = "bash bulunamadı. Homebrew’u terminalden kurun.".to_string();
            emit_setup_log(&app, format!("✕ {message}"), "error");
            return Err(message);
        };
        if host_program("curl").is_none() {
            let message = "curl bulunamadı. Homebrew’u terminalden kurun.".to_string();
            emit_setup_log(&app, format!("✕ {message}"), "error");
            return Err(message);
        }

        emit_setup_log(&app, "Homebrew resmi kurulum betiği indiriliyor…", "info");
        let script = format!(
            "set -o pipefail; NONINTERACTIVE=1 /bin/bash -c \"$(curl -fsSL {HOMEBREW_INSTALL_SCRIPT})\""
        );
        let args = vec![OsString::from("-c"), OsString::from(script)];
        let mut result = run_setup_step(&app, &bash, &args, "Homebrew kuruldu.").await;

        if result.is_err() || !brew_available() {
            emit_setup_log(
                &app,
                "Resmi kurulum tamamlanamadı; kullanıcı dizinine taşınabilir kurulum denenecek.",
                "info",
            );
            if let Some(git) = host_program("git") {
                if let Some(home) = home_dir() {
                    let prefix = home.join(".homebrew");
                    if !prefix.is_dir() {
                        let clone_args = vec![
                            OsString::from("clone"),
                            OsString::from("--depth=1"),
                            OsString::from("https://github.com/Homebrew/brew"),
                            prefix.clone().into_os_string(),
                        ];
                        result = run_setup_step(
                            &app,
                            &git,
                            &clone_args,
                            "Homebrew deposu kullanıcı dizinine indirildi.",
                        )
                        .await;
                    } else {
                        result = Ok(());
                    }
                }
            }
        }
        result?;
    }

    let next = setup_status();
    if !next.brew_available {
        let message = format!(
            "Homebrew kuruldu ancak brew komutu bulunamadı. Terminalde şu komutu çalıştırın: {}",
            next.brew_manual_command
        );
        emit_setup_log(&app, format!("✕ {message}"), "error");
        return Err(message);
    }

    emit_setup_log(&app, "✓ Homebrew kullanıma hazır.", "info");
    let _ = app.emit("setup-finished", next.clone());
    Ok(next)
}

#[tauri::command]
fn get_store_info() -> StoreInfo {
    let version = flatpak_version();
    let remotes = list_remotes_sync().unwrap_or_default();
    let flathub_available = remotes.iter().any(|remote| remote.name == "flathub");
    let user_flathub_available = flatpak_user_remotes().contains_key("flathub");
    StoreInfo {
        flatpak_available: version.is_some(),
        flatpak_version: version,
        flathub_available,
        user_flathub_available,
        snap_available: snap_available(),
        snap_version: snap_version(),
        brew_available: brew_available(),
        brew_version: brew_version(),
        appimage_count: load_appimage_index()
            .iter()
            .filter(|entry| Path::new(&entry.path).is_file())
            .count(),
    }
}

#[tauri::command]
async fn get_discover(date: String) -> Result<DiscoverData, String> {
    if !valid_date(&date) {
        return Err("Tarih biçimi geçersiz.".to_string());
    }
    let installed = flatpak_user_installed_ids();
    let updates = flatpak_user_updates();

    let day_url = format!("{FLATHUB_API}/app-picks/app-of-the-day/{date}");
    let week_url = format!("{FLATHUB_API}/app-picks/apps-of-the-week/{date}");
    let (day, week, popular, recent) = tokio::join!(
        get_optional::<ApiAppOfDay>(&day_url),
        get_optional::<ApiPicks>(&week_url),
        fetch_collection("popular", 12, installed.clone(), updates.clone()),
        fetch_collection("recently-added", 8, installed.clone(), updates.clone()),
    );

    let day_id = day
        .as_ref()
        .map(|value| value.app_id.clone())
        .filter(|value| valid_flatpak_id(value));
    let mut picks_ids: Vec<String> = week
        .map(|value| {
            value
                .apps
                .into_iter()
                .map(|item| item.app_id)
                .filter(|id| valid_flatpak_id(id))
                .collect()
        })
        .unwrap_or_default();
    picks_ids.dedup();

    let mut ids = Vec::new();
    if let Some(id) = day_id.clone() {
        ids.push(id);
    }
    for id in picks_ids {
        if !ids.contains(&id) {
            ids.push(id);
        }
    }

    let fetched = join_all(
        ids.iter()
            .cloned()
            .map(|id| fetch_appstream_item(id, installed.clone(), updates.clone())),
    )
    .await;

    let app_of_day = day_id
        .as_ref()
        .and_then(|id| {
            let key = app_key("flatpak", id);
            fetched.iter().find(|item| item.id == key).cloned()
        })
        .or_else(|| fetched.first().cloned())
        .or_else(|| popular.first().cloned());

    let picks = fetched
        .iter()
        .filter(|item| match day_id.as_ref() {
            Some(id) => item.id != app_key("flatpak", id),
            None => true,
        })
        .take(5)
        .cloned()
        .collect();

    Ok(DiscoverData {
        date,
        app_of_day,
        picks,
        popular,
        recent,
    })
}

#[tauri::command]
async fn search_apps(query: String) -> Result<Vec<AppItem>, String> {
    let query = valid_query(&query)?;
    let installed = flatpak_user_installed_ids();
    let updates = flatpak_user_updates();

    let (snap_apps, brew_apps) = tokio::join!(snap_search(&query), brew_search(&query));

    let response = http_client()
        .post(format!("{FLATHUB_API}/search?locale=tr"))
        .header("Accept", "application/json")
        .json(&json!({
            "query": query,
            "hits_per_page": SEARCH_LIMIT,
            "page": 1
        }))
        .send()
        .await;

    let result = match response {
        Ok(response) if response.status().is_success() => {
            match response.json::<ApiSearchResponse>().await {
                Ok(payload) => Ok(payload
                    .hits
                    .into_iter()
                    .filter_map(|app| app_from_api(app, &installed, &updates))
                    .collect::<Vec<_>>()),
                Err(err) => Err(format!("Flathub arama verisi okunamadı: {err}")),
            }
        }
        Ok(response) => Err(format!(
            "Flathub araması başarısız: HTTP {}",
            response.status().as_u16()
        )),
        Err(err) => Err(format!("Flathub'a ulaşılamadı: {err}")),
    };

    let mut apps = match result {
        Ok(apps) => apps,
        Err(api_error) => match flatpak_search_fallback(&query, &installed, &updates) {
            Ok(apps) if !apps.is_empty() => apps,
            _ => {
                if snap_apps.is_empty() && brew_apps.is_empty() {
                    return Err(api_error);
                }
                Vec::new()
            }
        },
    };
    apps.extend(snap_apps);
    apps.extend(brew_apps);
    Ok(apps)
}

#[tauri::command]
async fn get_category(slug: String, page: Option<u32>) -> Result<CategoryPage, String> {
    if !CATEGORIES.contains(&slug.as_str()) {
        return Err("Kategori bulunamadı.".to_string());
    }
    let page = page.unwrap_or(1).max(1);
    let installed = flatpak_user_installed_ids();
    let updates = flatpak_user_updates();
    let url = format!(
        "{FLATHUB_API}/collection/category/{slug}?page={page}&per_page={CATEGORY_LIMIT}&locale=tr"
    );
    let response = get_json::<ApiSearchResponse>(&url).await?;
    let apps = response
        .hits
        .into_iter()
        .filter_map(|app| app_from_api(app, &installed, &updates))
        .collect();
    Ok(CategoryPage {
        slug,
        page,
        total: response.total_hits,
        total_pages: response.total_pages.max(1),
        apps,
    })
}

#[tauri::command]
async fn get_flatpak_detail(app_id: String) -> Result<AppDetail, String> {
    if !valid_flatpak_id(&app_id) {
        return Err("Uygulama kimliği geçersiz.".to_string());
    }
    let installed = flatpak_user_installed_ids();
    let updates = flatpak_user_updates();
    let encoded = app_id.clone();
    let appstream_url = format!("{FLATHUB_API}/appstream/{encoded}");
    let summary_url = format!("{FLATHUB_API}/summary/{encoded}");
    let stats_url = format!("{FLATHUB_API}/stats/{encoded}");
    let ratings_url = format!("{ODRS_API}/ratings/{encoded}");
    let reviews_url = format!("{ODRS_API}/app/{encoded}");

    let (appstream, summary, stats, ratings, reviews) = tokio::join!(
        get_json::<Appstream>(&appstream_url),
        get_optional::<ApiSummary>(&summary_url),
        get_optional::<ApiStats>(&stats_url),
        get_optional::<OdrRatings>(&ratings_url),
        get_optional::<Vec<OdrReview>>(&reviews_url),
    );

    let appstream = appstream.map_err(|_| {
        "Uygulama Flathub kataloğunda bulunamadı veya ayrıntılar yüklenemedi.".to_string()
    })?;

    if appstream.is_eol {
        return Err("Bu uygulama artık Flathub tarafından desteklenmiyor.".to_string());
    }

    let screenshots = screenshots_of(&appstream);
    let version = appstream
        .releases
        .first()
        .and_then(|release| release.version.clone())
        .unwrap_or_default();
    let is_installed = installed.contains(&app_id);
    let monthly_installs = stats.and_then(|value| value.installs_last_month);
    let app = AppItem {
        id: app_key("flatpak", &app_id),
        name: truncate_chars(
            if appstream.name.trim().is_empty() {
                appstream.id.as_str()
            } else {
                appstream.name.trim()
            },
            120,
        ),
        summary: truncate_chars(appstream.summary.trim(), 500),
        developer: appstream
            .developer_name
            .clone()
            .unwrap_or_default()
            .trim()
            .to_string(),
        version,
        icon: safe_icon(appstream.icon.clone(), &app_id),
        installed: is_installed,
        update_available: is_installed && updates.contains(&app_id),
        category: main_category_from_appstream(&appstream.categories),
        monthly_installs,
        hero_image: screenshots.first().map(|item| item.url.clone()),
        source: "flatpak".to_string(),
        scope: None,
        kind: None,
        classic: false,
    };

    let rating = ratings.and_then(|value| {
        let stars = vec![
            value.star1,
            value.star2,
            value.star3,
            value.star4,
            value.star5,
        ];
        let total: u64 = stars.iter().sum();
        if total == 0 {
            return None;
        }
        let weighted: u64 = stars
            .iter()
            .enumerate()
            .map(|(index, count)| (index as u64 + 1) * count)
            .sum();
        Some(RatingSummary {
            average: weighted as f64 / total as f64,
            total,
            stars,
        })
    });

    let review_items = reviews
        .unwrap_or_default()
        .into_iter()
        .filter(|review| {
            let matches_id = review.app_id.eq_ignore_ascii_case(&app_id)
                || review
                    .app_id
                    .eq_ignore_ascii_case(&format!("{app_id}.desktop"));
            matches_id
                && review.reported.unwrap_or(0) == 0
                && review.rating.unwrap_or(0) > 0
                && review
                    .description
                    .as_deref()
                    .map(str::trim)
                    .is_some_and(|text| !text.is_empty())
        })
        .take(REVIEW_LIMIT)
        .map(|review| ReviewItem {
            author: review
                .user_display
                .unwrap_or_else(|| "Anonim".to_string())
                .trim()
                .to_string(),
            rating: ((review.rating.unwrap_or(0) as f64 / 20.0).round() as u8).clamp(1, 5),
            date: review.date_created.round() as i64,
            summary: truncate_chars(review.summary.unwrap_or_default().trim(), 140),
            text: truncate_chars(review.description.unwrap_or_default().trim(), 1000),
            locale: review.locale.unwrap_or_default(),
            version: review.version.unwrap_or_default(),
        })
        .collect();

    let mut categories: Vec<String> = Vec::new();
    if let Some(category) = &app.category {
        categories.push(category.clone());
    }
    for category in &appstream.categories {
        if let Some(slug) = main_category_from_appstream(std::slice::from_ref(category)) {
            if !categories.contains(&slug) {
                categories.push(slug);
            }
        }
    }

    let is_verified = verified(&appstream);
    let homepage = appstream.urls.homepage.clone();
    let description = appstream.description;
    let license = appstream.project_license;

    Ok(AppDetail {
        app,
        description,
        screenshots,
        categories,
        license,
        verified: is_verified,
        homepage,
        download_size: summary.as_ref().and_then(|value| value.download_size),
        installed_size: summary.as_ref().and_then(|value| value.installed_size),
        installs_last_month: monthly_installs,
        rating,
        reviews: review_items,
    })
}

#[tauri::command]
async fn get_app_detail(id: String) -> Result<AppDetail, String> {
    let (source, native) = split_app_key(&id);
    match source.as_str() {
        "snap" => snap_detail(&native).await,
        "homebrew" => brew_detail(&native, None).await,
        "appimage" => appimage_detail(&native),
        _ => get_flatpak_detail(native).await,
    }
}

#[tauri::command]
async fn get_source_discover(source: String) -> Result<Vec<AppItem>, String> {
    match source.as_str() {
        "snap" => Ok(snap_discover().await),
        "homebrew" => Ok(brew_discover().await),
        "appimage" => Ok(appimage_installed_apps()),
        _ => Err("Bilinmeyen kaynak.".to_string()),
    }
}

#[tauri::command]
fn list_installed_apps() -> Result<Vec<AppItem>, String> {
    let mut apps = Vec::new();
    if flatpak_available() {
        apps.extend(installed_apps());
    }
    if snap_available() {
        apps.extend(snap_installed_apps());
    }
    if brew_available() {
        apps.extend(brew_installed_apps());
    }
    apps.extend(appimage_installed_apps());
    apps.sort_by_key(|app| app.name.to_lowercase());
    Ok(apps)
}

#[tauri::command]
fn list_appimages() -> Result<Vec<AppItem>, String> {
    Ok(appimage_installed_apps())
}

#[tauri::command]
fn pick_appimage_file() -> Result<Option<String>, String> {
    pick_appimage()
}

#[tauri::command]
fn import_appimage_file(path: String, name: Option<String>) -> Result<AppItem, String> {
    import_appimage(&path, name)
}

#[tauri::command]
fn remove_appimage_file(id: String) -> Result<String, String> {
    let (_, slug) = split_app_key(&id);
    remove_appimage(&slug)
}

#[tauri::command]
fn launch_appimage_file(id: String) -> Result<(), String> {
    let (_, slug) = split_app_key(&id);
    launch_appimage(&slug)
}

#[tauri::command]
fn list_flatpak_remotes() -> Result<Vec<RemoteInfo>, String> {
    list_remotes_sync()
}

fn list_remotes_sync() -> Result<Vec<RemoteInfo>, String> {
    if !flatpak_available() {
        return Ok(Vec::new());
    }
    let output = run_capture("flatpak", &["remotes", "-d", "--json"])?;
    if !output.success {
        return Err(failure_message("flatpak remotes", &output));
    }
    let remotes: Vec<RemoteJson> = serde_json::from_str(&output.stdout)
        .map_err(|err| format!("Flatpak depoları okunamadı: {err}"))?;
    Ok(remotes
        .into_iter()
        .filter(|remote| !remote.name.trim().is_empty())
        .map(|remote| {
            let scope = if remote.options.contains("user") {
                "user"
            } else {
                "system"
            };
            let name = remote.name.trim().to_string();
            RemoteInfo {
                title: if remote.title.trim().is_empty() {
                    name.clone()
                } else {
                    remote.title.trim().to_string()
                },
                deletable: scope == "user" && name != "flathub",
                name,
                url: remote.url.trim().to_string(),
                scope: scope.to_string(),
                comment: remote.comment.trim().to_string(),
                icon: remote
                    .icon
                    .filter(|url| url.starts_with("https://dl.flathub.org/")),
            }
        })
        .collect())
}

#[tauri::command]
async fn add_flatpak_remote(name: String, url: String) -> Result<String, String> {
    if !valid_remote_name(&name) {
        return Err(
            "Depo adı yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir.".to_string(),
        );
    }
    if !valid_remote_url(&url) {
        return Err("Depo adresi geçerli bir http(s) adresi olmalı.".to_string());
    }
    if !flatpak_available() {
        return Err("Flatpak sistemde bulunamadı.".to_string());
    }
    let output = run_capture(
        "flatpak",
        &["remote-add", "--user", "--if-not-exists", &name, &url],
    )?;
    if !output.success {
        return Err(failure_message("flatpak remote-add", &output));
    }
    Ok(format!("{name} deposu eklendi."))
}

#[tauri::command]
async fn remove_flatpak_remote(name: String) -> Result<String, String> {
    if !valid_remote_name(&name) {
        return Err("Depo adı geçersiz.".to_string());
    }
    if name == "flathub" {
        return Err("Flathub deposu kaldırılamaz.".to_string());
    }
    let remotes = list_remotes_sync()?;
    let user_remote = remotes
        .iter()
        .any(|remote| remote.name == name && remote.scope == "user");
    if !user_remote {
        if remotes.iter().any(|remote| remote.name == name) {
            return Err("Yalnızca kullanıcı kapsamındaki depolar kaldırılabilir.".to_string());
        }
        return Err("Depo bulunamadı.".to_string());
    }
    let output = run_capture("flatpak", &["remote-delete", "--user", &name])?;
    if !output.success {
        return Err(failure_message("flatpak remote-delete", &output));
    }
    Ok(format!("{name} deposu kaldırıldı."))
}

/* ── Kurulum, kaldırma, güncelleme ──────────────────── */

fn emit_log(app: &AppHandle, line: impl Into<String>, kind: &str) {
    let _ = app.emit(
        "app-log",
        OperationLog {
            line: line.into(),
            kind: kind.to_string(),
        },
    );
}

fn build_flatpak_command(
    app_id: &str,
    action: ActionKind,
    scope: &str,
) -> Result<(PathBuf, Vec<OsString>, String), String> {
    let flatpak =
        host_program("flatpak").ok_or_else(|| "Flatpak sistemde bulunamadı.".to_string())?;
    let flag = scope_flag(scope).to_string();
    let args: Vec<String> = match action {
        ActionKind::Install => vec![
            "install".to_string(),
            flag,
            "-y".to_string(),
            "flathub".to_string(),
            app_id.to_string(),
        ],
        ActionKind::Remove => vec![
            "uninstall".to_string(),
            flag,
            "-y".to_string(),
            app_id.to_string(),
        ],
        ActionKind::Update => vec![
            "update".to_string(),
            flag,
            "-y".to_string(),
            app_id.to_string(),
        ],
    };
    let args: Vec<OsString> = args.into_iter().map(OsString::from).collect();
    let (program, mut full_args) = if scope == "system" {
        let pkexec = host_program("pkexec").ok_or_else(|| {
            "Sistem kapsamındaki Flatpak işlemi için polkit (pkexec) bulunamadı.".to_string()
        })?;
        let mut inner = vec![flatpak.clone().into_os_string()];
        inner.extend(args);
        (pkexec, inner)
    } else {
        (flatpak, args)
    };
    let display = command_display(&program, &full_args);
    full_args.shrink_to_fit();
    Ok((program, full_args, display))
}

fn command_display(program: &Path, args: &[OsString]) -> String {
    let mut display = program.display().to_string();
    for arg in args {
        display.push(' ');
        let text = arg.to_string_lossy();
        if text.contains(' ') {
            display.push('"');
            display.push_str(&text);
            display.push('"');
        } else {
            display.push_str(&text);
        }
    }
    display
}

fn operation_guard() -> Result<OperationLock, String> {
    if SETTING_UP.load(Ordering::SeqCst) {
        return Err(
            "Sistem hazırlığı sürüyor. Lütfen kurulum tamamlandıktan sonra yeniden deneyin."
                .to_string(),
        );
    }
    if OPERATING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Zaten devam eden bir işlem var.".to_string());
    }
    Ok(OperationLock)
}

async fn run_streaming_command(
    app: &AppHandle,
    program: &Path,
    args: &[OsString],
    display: &str,
) -> Result<(bool, Option<i32>, Option<String>), String> {
    emit_log(app, format!("Komut: {display}"), "cmd");

    let mut command = AsyncCommand::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    sanitize_async(&mut command);

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(err) => {
            let message = format!("İşlem başlatılamadı: {err}");
            emit_log(app, &message, "error");
            return Err(message);
        }
    };

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "İşlem çıktısı okunamadı.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "İşlem hata çıktısı okunamadı.".to_string())?;

    let mut stdout_lines = AsyncBufReader::new(stdout).lines();
    let mut stderr_lines = AsyncBufReader::new(stderr).lines();
    let mut stdout_done = false;
    let mut stderr_done = false;
    let mut last_error: Option<String> = None;

    while !(stdout_done && stderr_done) {
        tokio::select! {
            result = stdout_lines.next_line(), if !stdout_done => {
                match result {
                    Ok(Some(line)) => {
                        let line = line.trim_end_matches('\r');
                        if !line.is_empty() {
                            emit_log(app, line, "stdout");
                        }
                    }
                    Ok(None) => stdout_done = true,
                    Err(err) => {
                        emit_log(app, format!("Çıktı okuma hatası: {err}"), "error");
                        stdout_done = true;
                    }
                }
            }
            result = stderr_lines.next_line(), if !stderr_done => {
                match result {
                    Ok(Some(line)) => {
                        let line = line.trim_end_matches('\r');
                        if !line.trim().is_empty() {
                            last_error = Some(truncate_chars(line.trim(), 280));
                            emit_log(app, line, "stderr");
                        }
                    }
                    Ok(None) => stderr_done = true,
                    Err(err) => {
                        emit_log(app, format!("Hata çıktısı okuma hatası: {err}"), "error");
                        stderr_done = true;
                    }
                }
            }
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|err| format!("İşlem durumu alınamadı: {err}"))?;
    Ok((status.success(), status.code(), last_error))
}

fn action_outcome(
    app: &AppHandle,
    id: String,
    action: ActionKind,
    manager: &str,
    success: bool,
    code: Option<i32>,
    last_error: Option<String>,
) -> OperationOutcome {
    let message = if success {
        action.success_message().to_string()
    } else if let Some(error) = last_error {
        format!("İşlem başarısız oldu: {error}")
    } else {
        format!(
            "İşlem {} çıkış koduyla sonlandı.",
            code.map(|value| value.to_string())
                .unwrap_or_else(|| "bilinmeyen".to_string())
        )
    };

    emit_log(
        app,
        if success {
            format!("✓ {message}")
        } else {
            format!("✕ {message}")
        },
        if success { "info" } else { "error" },
    );

    let outcome = OperationOutcome {
        success,
        code,
        message,
        app_id: id,
        action: action.as_str().to_string(),
        manager: manager.to_string(),
    };
    let _ = app.emit("app-finished", outcome.clone());
    outcome
}

async fn run_flatpak_action(
    app: AppHandle,
    id: String,
    app_id: String,
    action: ActionKind,
) -> Result<OperationOutcome, String> {
    if !valid_flatpak_id(&app_id) {
        return Err("Uygulama kimliği geçersiz.".to_string());
    }
    if !flatpak_available() {
        return Err("Flatpak sistemde bulunamadı.".to_string());
    }
    let _lock = operation_guard()?;

    let scopes = flatpak_installed_scopes(&app_id);
    let targets: Vec<String> = match action {
        ActionKind::Install => {
            ensure_flathub_user_remote()?;
            vec!["user".to_string()]
        }
        ActionKind::Remove | ActionKind::Update => {
            if scopes.is_empty() {
                return Err("Bu Flatpak uygulaması sistemde yüklü değil.".to_string());
            }
            scopes
        }
    };

    let mut success = true;
    let mut code = None;
    let mut last_error = None;
    for scope in &targets {
        let (program, args, display) = build_flatpak_command(&app_id, action, scope)?;
        emit_log(
            &app,
            if scope == "system" {
                "Sistem kapsamındaki işlem için yönetici yetkisi isteniyor…"
            } else {
                "Flatpak işlemi hazırlanıyor…"
            },
            "info",
        );
        let (ok, exit, error) = run_streaming_command(&app, &program, &args, &display).await?;
        code = exit;
        last_error = error;
        success = ok;
        if !ok {
            break;
        }
    }

    Ok(action_outcome(
        &app, id, action, "Flatpak", success, code, last_error,
    ))
}

async fn run_snap_action(
    app: AppHandle,
    id: String,
    name: String,
    action: ActionKind,
) -> Result<OperationOutcome, String> {
    if !valid_snap_name(&name) {
        return Err("Snap adı geçersiz.".to_string());
    }
    if !snap_available() {
        return Err(
            "Snap sistemde bulunamadı. Seçenekler bölümünden Snap’i kurabilirsiniz.".to_string(),
        );
    }
    let _lock = operation_guard()?;
    let snap = host_program("snap").ok_or_else(|| "Snap komutu bulunamadı.".to_string())?;
    let pkexec = host_program("pkexec")
        .ok_or_else(|| "Snap işlemleri için polkit (pkexec) bulunamadı.".to_string())?;

    let base_args: Vec<String> = match action {
        ActionKind::Install => vec!["install".to_string(), name.clone()],
        ActionKind::Remove => vec!["remove".to_string(), name.clone()],
        ActionKind::Update => vec!["refresh".to_string(), name.clone()],
    };
    let mut inner: Vec<OsString> = vec![snap.into_os_string()];
    inner.extend(base_args.into_iter().map(OsString::from));
    let display = command_display(&pkexec, &inner);
    emit_log(&app, "Snap işlemi için yönetici yetkisi isteniyor…", "info");
    let (mut ok, mut code, mut error) =
        run_streaming_command(&app, &pkexec, &inner, &display).await?;

    if !ok && action == ActionKind::Install {
        let classic_hint = error
            .as_deref()
            .is_some_and(|text| text.to_lowercase().contains("classic"));
        if classic_hint {
            let mut retry: Vec<OsString> = vec![
                host_program("snap")
                    .ok_or_else(|| "Snap komutu bulunamadı.".to_string())?
                    .into_os_string(),
                OsString::from("install"),
                OsString::from("--classic"),
                OsString::from(&name),
            ];
            let retry_display = command_display(&pkexec, &retry);
            emit_log(
                &app,
                "Snap klasik kısıtlama gerektiriyor; --classic ile yeniden denenecek.",
                "info",
            );
            let result = run_streaming_command(&app, &pkexec, &retry, &retry_display).await?;
            ok = result.0;
            code = result.1;
            error = result.2;
            retry.clear();
        }
    }

    Ok(action_outcome(&app, id, action, "Snap", ok, code, error))
}

async fn run_brew_action(
    app: AppHandle,
    id: String,
    token: String,
    action: ActionKind,
) -> Result<OperationOutcome, String> {
    if !valid_brew_token(&token) {
        return Err("Homebrew paket adı geçersiz.".to_string());
    }
    if !brew_available() {
        return Err(
            "Homebrew sistemde bulunamadı. Seçenekler bölümünden Homebrew’u kurabilirsiniz."
                .to_string(),
        );
    }
    let _lock = operation_guard()?;
    let brew = host_program("brew").ok_or_else(|| "Homebrew komutu bulunamadı.".to_string())?;

    let kind = brew_installed_list()
        .into_iter()
        .find(|package| package.token == token)
        .map(|package| package.kind);
    let is_cask = kind.as_deref() == Some("cask");

    let build = |brew: &Path, cask: bool| -> Vec<OsString> {
        let mut args: Vec<OsString> = vec![brew.as_os_str().to_os_string()];
        match action {
            ActionKind::Install => {
                args.push(OsString::from("install"));
                if cask {
                    args.push(OsString::from("--cask"));
                }
            }
            ActionKind::Remove => {
                args.push(OsString::from("uninstall"));
                if cask {
                    args.push(OsString::from("--cask"));
                }
            }
            ActionKind::Update => {
                args.push(OsString::from("upgrade"));
                if cask {
                    args.push(OsString::from("--cask"));
                }
            }
        }
        args.push(OsString::from(&token));
        args
    };

    let args = build(&brew, is_cask);
    let display = command_display(&brew, &args);
    let (mut ok, mut code, mut error) = run_streaming_command(&app, &brew, &args, &display).await?;

    if !ok && action == ActionKind::Install && !is_cask {
        let missing_formula = error.as_deref().is_some_and(|text| {
            let lowered = text.to_lowercase();
            lowered.contains("no available formula")
                || lowered.contains("no formula with the name")
                || lowered.contains("cask") && lowered.contains("not found")
        });
        if missing_formula {
            emit_log(
                &app,
                "Formül bulunamadı; cask olarak yeniden denenecek.",
                "info",
            );
            let retry = build(&brew, true);
            let retry_display = command_display(&brew, &retry);
            let result = run_streaming_command(&app, &brew, &retry, &retry_display).await?;
            ok = result.0;
            code = result.1;
            error = result.2;
        }
    }

    Ok(action_outcome(
        &app, id, action, "Homebrew", ok, code, error,
    ))
}

async fn run_appimage_action(
    app: AppHandle,
    id: String,
    slug: String,
    action: ActionKind,
) -> Result<OperationOutcome, String> {
    match action {
        ActionKind::Remove => {
            let _lock = operation_guard()?;
            let result = remove_appimage(&slug)?;
            emit_log(&app, format!("✓ {result}"), "info");
            Ok(action_outcome(
                &app,
                id,
                action,
                "AppImage",
                true,
                Some(0),
                None,
            ))
        }
        ActionKind::Install => Err(
            "AppImage kurulumu için “AppImage içe aktar” akışını kullanın.".to_string(),
        ),
        ActionKind::Update => Err(
            "AppImage dosyaları kendi güncelleme yöntemleriyle yenilenir; mağaza üzerinden güncellenemez."
                .to_string(),
        ),
    }
}

async fn run_app_action(
    app: AppHandle,
    id: String,
    action: ActionKind,
) -> Result<OperationOutcome, String> {
    let (source, native) = split_app_key(&id);
    match source.as_str() {
        "snap" => run_snap_action(app, id, native, action).await,
        "homebrew" => run_brew_action(app, id, native, action).await,
        "appimage" => run_appimage_action(app, id, native, action).await,
        _ => run_flatpak_action(app, id, native, action).await,
    }
}

fn emit_setup_log(app: &AppHandle, line: impl Into<String>, kind: &str) {
    let _ = app.emit(
        "setup-log",
        OperationLog {
            line: line.into(),
            kind: kind.to_string(),
        },
    );
}

async fn run_setup_step(
    app: &AppHandle,
    program: &Path,
    args: &[OsString],
    success_note: &str,
) -> Result<(), String> {
    let mut display = program.display().to_string();
    for arg in args {
        display.push(' ');
        display.push_str(&arg.to_string_lossy());
    }
    emit_setup_log(app, format!("Komut: {display}"), "cmd");

    let mut command = AsyncCommand::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    sanitize_async(&mut command);

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(err) => {
            let message = format!("İşlem başlatılamadı: {err}");
            emit_setup_log(app, &message, "error");
            return Err(message);
        }
    };

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "İşlem çıktısı okunamadı.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "İşlem hata çıktısı okunamadı.".to_string())?;

    let mut stdout_lines = AsyncBufReader::new(stdout).lines();
    let mut stderr_lines = AsyncBufReader::new(stderr).lines();
    let mut stdout_done = false;
    let mut stderr_done = false;
    let mut last_error: Option<String> = None;

    while !(stdout_done && stderr_done) {
        tokio::select! {
            result = stdout_lines.next_line(), if !stdout_done => {
                match result {
                    Ok(Some(line)) => {
                        let line = line.trim_end_matches('\r');
                        if !line.is_empty() {
                            emit_setup_log(app, line, "stdout");
                        }
                    }
                    Ok(None) => stdout_done = true,
                    Err(err) => {
                        emit_setup_log(app, format!("Çıktı okuma hatası: {err}"), "error");
                        stdout_done = true;
                    }
                }
            }
            result = stderr_lines.next_line(), if !stderr_done => {
                match result {
                    Ok(Some(line)) => {
                        let line = line.trim_end_matches('\r');
                        if !line.trim().is_empty() {
                            last_error = Some(truncate_chars(line.trim(), 280));
                            emit_setup_log(app, line, "stderr");
                        }
                    }
                    Ok(None) => stderr_done = true,
                    Err(err) => {
                        emit_setup_log(app, format!("Hata çıktısı okuma hatası: {err}"), "error");
                        stderr_done = true;
                    }
                }
            }
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|err| format!("İşlem durumu alınamadı: {err}"))?;
    if status.success() {
        emit_setup_log(app, format!("✓ {success_note}"), "info");
        return Ok(());
    }

    let code = status.code();
    let message = if matches!(code, Some(126) | Some(127)) {
        "Yetkilendirme tamamlanmadı. Yönetici parolası isteğini onaylayıp yeniden deneyin."
            .to_string()
    } else if let Some(error) = last_error {
        truncate_chars(&format!("Kurulum başarısız: {error}"), 500)
    } else {
        format!(
            "Kurulum {} çıkış koduyla sonlandı.",
            code.map(|value| value.to_string())
                .unwrap_or_else(|| "bilinmeyen".to_string())
        )
    };
    emit_setup_log(app, format!("✕ {message}"), "error");
    Err(message)
}

#[tauri::command]
async fn install_app(app: AppHandle, id: String) -> Result<OperationOutcome, String> {
    run_app_action(app, id, ActionKind::Install).await
}

#[tauri::command]
async fn remove_app(app: AppHandle, id: String) -> Result<OperationOutcome, String> {
    run_app_action(app, id, ActionKind::Remove).await
}

#[tauri::command]
async fn update_app(app: AppHandle, id: String) -> Result<OperationOutcome, String> {
    run_app_action(app, id, ActionKind::Update).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_setup_status,
            install_flatpak,
            install_snap,
            install_homebrew,
            get_store_info,
            get_discover,
            get_source_discover,
            search_apps,
            get_category,
            get_app_detail,
            list_installed_apps,
            list_flatpak_remotes,
            add_flatpak_remote,
            remove_flatpak_remote,
            list_appimages,
            pick_appimage_file,
            import_appimage_file,
            remove_appimage_file,
            launch_appimage_file,
            install_app,
            remove_app,
            update_app
        ])
        .run(tauri::generate_context!())
        .expect("Macro Store başlatılamadı");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flatpak_ids_reject_options_and_paths() {
        for id in [
            "org.mozilla.firefox",
            "com.agateau.nanonote",
            "io.github.a_b.C-1",
        ] {
            assert!(valid_flatpak_id(id), "{id} geçerli olmalıydı");
        }
        for id in ["-x", "foo/bar", "foo bar", "$(id)", "", "foo\nbar"] {
            assert!(!valid_flatpak_id(id), "{id} reddedilmeliydi");
        }
    }

    #[test]
    fn remote_names_are_restricted() {
        for name in ["flathub", "my-repo", "repo.example_1"] {
            assert!(valid_remote_name(name), "{name} geçerli olmalıydı");
        }
        for name in ["-x", "foo bar", "foo/bar", "ümlaut", "", "foo\nbar"] {
            assert!(!valid_remote_name(name), "{name} reddedilmeliydi");
        }
    }

    #[test]
    fn remote_urls_must_be_http_or_https() {
        assert!(valid_remote_url("https://example.com/repo"));
        assert!(valid_remote_url("http://localhost:8080/repo"));
        for url in [
            "file:///tmp/repo",
            "https://user:pass@example.com/repo",
            "not a url",
            "",
        ] {
            assert!(!valid_remote_url(url), "{url} reddedilmeliydi");
        }
    }

    #[test]
    fn query_validation_blocks_control_characters() {
        assert!(valid_query("firefox").is_ok());
        assert!(valid_query("görüntü düzenleyici").is_ok());
        assert!(valid_query("-Syu").is_err());
        assert!(valid_query("a\nb").is_err());
        assert!(valid_query("a").is_err());
    }

    #[test]
    fn date_validation_accepts_iso_dates() {
        assert!(valid_date("2026-10-27"));
        assert!(!valid_date("27.10.2026"));
        assert!(!valid_date("2026-1-27"));
        assert!(!valid_date("../2026-10"));
    }

    #[test]
    fn appstream_categories_map_to_main_categories() {
        assert_eq!(
            main_category_from_appstream(&["Graphics".to_string()]),
            Some("graphics".to_string())
        );
        assert_eq!(
            main_category_from_appstream(&["Network".to_string(), "WebBrowser".to_string()]),
            Some("network".to_string())
        );
        assert_eq!(main_category_from_appstream(&["Unknown".to_string()]), None);
    }

    #[test]
    fn os_release_parser_handles_quotes_and_comments() {
        let parsed = parse_os_release(
            "# yorum\nNAME=\"Fedora Linux\"\nID=fedora\nPRETTY_NAME=\"Fedora Linux 42 (Workstation)\"\nEMPTY=\n",
        );
        assert_eq!(parsed.get("NAME").map(String::as_str), Some("Fedora Linux"));
        assert_eq!(parsed.get("ID").map(String::as_str), Some("fedora"));
        assert_eq!(
            parsed.get("PRETTY_NAME").map(String::as_str),
            Some("Fedora Linux 42 (Workstation)")
        );
        assert_eq!(parsed.get("EMPTY").map(String::as_str), Some(""));
        assert!(!parsed.contains_key("# yorum"));
    }

    #[test]
    fn package_plans_cover_supported_managers() {
        let apt = package_plan("apt-get").expect("APT planı olmalı");
        assert_eq!(apt.install_args, APT_INSTALL_ARGS);
        assert!(!apt.needs_reboot);
        assert_eq!(apt.label, "APT · Debian/Ubuntu");

        let ostree = package_plan("rpm-ostree").expect("rpm-ostree planı olmalı");
        assert_eq!(ostree.install_args, RPM_OSTREE_INSTALL_ARGS);
        assert!(ostree.needs_reboot);

        for manager in NATIVE_PACKAGE_MANAGERS {
            assert!(
                package_plan(manager).is_some(),
                "{manager} için kurulum planı olmalıydı"
            );
        }
        assert!(package_plan("unknown-manager").is_none());
    }
}
