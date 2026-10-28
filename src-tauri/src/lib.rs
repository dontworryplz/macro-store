mod brew;
mod snap;
mod tray;

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
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, OnceLock,
};
use std::time::{Duration, Instant};
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

const FLATPAK_CACHE_TTL: Duration = Duration::from_secs(15);
const FLATPAK_VERSION_TTL: Duration = Duration::from_secs(30);
const APPSTREAM_CACHE_TTL: Duration = Duration::from_secs(300);
const APPSTREAM_CACHE_LIMIT: usize = 96;
const JSON_CACHE_TTL: Duration = Duration::from_secs(120);
const JSON_CACHE_LIMIT: usize = 256;
type FlatpakStateCache = Mutex<Option<(Instant, Arc<FlatpakSnapshot>)>>;
type FlatpakVersionCache = Mutex<Option<(Instant, Option<String>)>>;
type AppstreamCache = Mutex<HashMap<String, (Instant, Appstream)>>;
type JsonCache = Mutex<HashMap<String, (Instant, Value)>>;
type IconCache = Mutex<HashMap<String, Option<String>>>;
static FLATPAK_STATE_CACHE: OnceLock<FlatpakStateCache> = OnceLock::new();
static FLATPAK_VERSION_CACHE: OnceLock<FlatpakVersionCache> = OnceLock::new();
static APPSTREAM_CACHE: OnceLock<AppstreamCache> = OnceLock::new();
static JSON_CACHE: OnceLock<JsonCache> = OnceLock::new();
static ICON_CACHE: OnceLock<IconCache> = OnceLock::new();
static OPERATING: AtomicBool = AtomicBool::new(false);
static SETTING_UP: AtomicBool = AtomicBool::new(false);
static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

#[derive(Default)]
struct FlatpakSnapshot {
    installed: HashSet<String>,
    updates: HashSet<String>,
    masked: HashSet<String>,
    apps: Vec<FlatpakInstalled>,
}

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
    brew_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppItem {
    id: String,
    provider: String,
    package_type: Option<String>,
    name: String,
    summary: String,
    developer: String,
    version: String,
    icon: Option<String>,
    installed: bool,
    update_available: bool,
    pinned: bool,
    channel: Option<String>,
    category: Option<String>,
    monthly_installs: Option<u64>,
    hero_image: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderIssue {
    provider: String,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstalledAppsResponse {
    apps: Vec<AppItem>,
    provider_errors: Vec<ProviderIssue>,
    #[serde(default)]
    from_cache: bool,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchAppsResponse {
    apps: Vec<AppItem>,
    provider_errors: Vec<ProviderIssue>,
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
struct ReleaseItem {
    version: String,
    date: Option<i64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct FlatpakCommit {
    commit: String,
    subject: String,
    date: Option<i64>,
    version: Option<String>,
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
    releases: Vec<ReleaseItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppPermissions {
    installed: bool,
    available: bool,
    raw: String,
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
    summary: String,
    version: String,
    installed_size: Option<u64>,
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

#[derive(Debug, Clone, Deserialize)]
struct ApiScreenshotSize {
    #[serde(default)]
    width: String,
    #[serde(default)]
    src: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ApiScreenshot {
    #[serde(default)]
    sizes: Vec<ApiScreenshotSize>,
    #[serde(default)]
    caption: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ApiRelease {
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    timestamp: Option<Value>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct ApiUrls {
    #[serde(default)]
    homepage: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
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

/* ── Süreç yardımcıları ─────────────────────────────── */

fn host_program(name: &str) -> Option<PathBuf> {
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

fn sanitize_std(cmd: &mut Command) {
    cmd.env("LC_ALL", "C")
        .env("LANG", "C")
        .env("LANGUAGE", "C")
        .env("PATH", HOST_PATH);
    for key in SANITIZED_ENV {
        cmd.env_remove(key);
    }
}

fn sanitize_async(cmd: &mut AsyncCommand) {
    cmd.env("LC_ALL", "C")
        .env("LANG", "C")
        .env("LANGUAGE", "C")
        .env("PATH", HOST_PATH);
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
    let Ok(mut cache) = FLATPAK_VERSION_CACHE
        .get_or_init(|| Mutex::new(None))
        .lock()
    else {
        return read_flatpak_version();
    };
    if let Some((checked_at, version)) = cache.as_ref() {
        if checked_at.elapsed() < FLATPAK_VERSION_TTL {
            return version.clone();
        }
    }
    let version = read_flatpak_version();
    *cache = Some((Instant::now(), version.clone()));
    version
}

fn read_flatpak_version() -> Option<String> {
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

fn invalidate_flatpak_cache() {
    if let Ok(mut cache) = FLATPAK_VERSION_CACHE
        .get_or_init(|| Mutex::new(None))
        .lock()
    {
        *cache = None;
    }
    if let Ok(mut cache) = FLATPAK_STATE_CACHE.get_or_init(|| Mutex::new(None)).lock() {
        *cache = None;
    }
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

fn setup_status() -> SetupStatus {
    let os_release = read_os_release();
    let version = flatpak_version();
    let flatpak_available = version.is_some();
    let remotes = list_remotes_sync().unwrap_or_default();
    let flathub_available = remotes.iter().any(|remote| remote.name == "flathub");
    let user_flathub_available = remotes
        .iter()
        .any(|remote| remote.name == "flathub" && remote.scope == "user");
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
    SetupStatus {
        flatpak_available,
        flatpak_version: version,
        flathub_available,
        user_flathub_available,
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

fn read_flatpak_user_list() -> Vec<FlatpakInstalled> {
    let Ok(output) = run_capture(
        "flatpak",
        &[
            "list",
            "--user",
            "--app",
            "--columns=application,name,description,version,size",
        ],
    ) else {
        return Vec::new();
    };
    if !output.success {
        return Vec::new();
    }
    parse_flatpak_user_list(&output.stdout)
}

fn parse_flatpak_size(value: &str) -> Option<u64> {
    let text = value.trim().replace(',', ".");
    let mut parts = text.split_whitespace();
    let amount = parts.next()?.parse::<f64>().ok()?;
    if !amount.is_finite() || amount < 0.0 {
        return None;
    }
    let unit = parts.next().unwrap_or("bytes").to_ascii_lowercase();
    let factor = match unit.as_str() {
        "b" | "byte" | "bytes" => 1.0,
        "kb" | "kib" | "k" => 1024.0,
        "mb" | "mib" | "m" => 1024.0 * 1024.0,
        "gb" | "gib" | "g" => 1024.0 * 1024.0 * 1024.0,
        "tb" | "tib" | "t" => 1024.0 * 1024.0 * 1024.0 * 1024.0,
        _ => return None,
    };
    Some((amount * factor).round() as u64)
}

fn valid_commit_hash(value: &str) -> bool {
    (7..=64).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn parse_flatpak_date(value: &str) -> Option<i64> {
    let mut parts = value.split_whitespace();
    let date = parts.next()?;
    let time = parts.next()?;
    let zone = parts.next().unwrap_or("+0000");

    let mut date_parts = date.split('-');
    let year = date_parts.next()?.parse::<i64>().ok()?;
    let month = date_parts.next()?.parse::<i64>().ok()?;
    let day = date_parts.next()?.parse::<i64>().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let mut time_parts = time.split(':');
    let hour = time_parts.next()?.parse::<i64>().ok()?;
    let minute = time_parts.next()?.parse::<i64>().ok()?;
    let second = time_parts.next().unwrap_or("0").parse::<i64>().ok()?;
    if hour > 23 || minute > 59 || second > 60 {
        return None;
    }

    let offset = if zone.starts_with('+') || zone.starts_with('-') {
        let digits: String = zone[1..].chars().filter(char::is_ascii_digit).collect();
        if digits.len() < 4 {
            return None;
        }
        let hours = digits[..2].parse::<i64>().ok()?;
        let minutes = digits[2..4].parse::<i64>().ok()?;
        let magnitude = hours * 3600 + minutes * 60;
        if zone.starts_with('-') {
            -magnitude
        } else {
            magnitude
        }
    } else {
        0
    };

    Some(days_from_civil(year, month, day) * 86_400 + hour * 3600 + minute * 60 + second - offset)
}

fn parse_remote_info_log(text: &str) -> Vec<FlatpakCommit> {
    let mut commits: Vec<FlatpakCommit> = Vec::new();
    let mut current: Option<FlatpakCommit> = None;
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim().to_ascii_lowercase();
        let value = value.trim();
        match key.as_str() {
            "commit" => {
                if let Some(done) = current.take() {
                    if valid_commit_hash(&done.commit) {
                        commits.push(done);
                    }
                }
                if valid_commit_hash(value) {
                    current = Some(FlatpakCommit {
                        commit: value.to_string(),
                        subject: String::new(),
                        date: None,
                        version: None,
                    });
                }
            }
            "subject" => {
                if let Some(commit) = current.as_mut() {
                    commit.subject = truncate_chars(value, 200);
                }
            }
            "date" => {
                if let Some(commit) = current.as_mut() {
                    commit.date = parse_flatpak_date(value);
                }
            }
            "version" => {
                if let Some(commit) = current.as_mut() {
                    commit.version = Some(truncate_chars(value, 64));
                }
            }
            _ => {}
        }
    }
    if let Some(done) = current.take() {
        if valid_commit_hash(&done.commit) {
            commits.push(done);
        }
    }
    commits.truncate(20);
    commits
}

fn parse_flatpak_user_list(text: &str) -> Vec<FlatpakInstalled> {
    let mut apps = Vec::new();
    for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
        let mut fields = line.split('\t');
        let app_id = fields.next().unwrap_or("").trim();
        if app_id.eq_ignore_ascii_case("application") || !valid_flatpak_id(app_id) {
            continue;
        }
        apps.push(FlatpakInstalled {
            app_id: app_id.to_string(),
            name: fields.next().unwrap_or(app_id).trim().to_string(),
            summary: truncate_chars(fields.next().unwrap_or("").trim(), 500),
            version: fields.next().unwrap_or("").trim().to_string(),
            installed_size: fields.next().and_then(parse_flatpak_size),
        });
    }
    apps.sort_by_key(|app| app.name.to_lowercase());
    apps
}

fn read_flatpak_user_updates() -> HashSet<String> {
    run_capture(
        "flatpak",
        &[
            "remote-ls",
            "--user",
            "--updates",
            "--app",
            "--columns=application",
        ],
    )
    .ok()
    .filter(|output| output.success)
    .map(|output| {
        output
            .stdout
            .lines()
            .map(str::trim)
            .filter(|id| valid_flatpak_id(id))
            .map(str::to_string)
            .collect()
    })
    .unwrap_or_default()
}

fn read_flatpak_user_masks() -> HashSet<String> {
    run_capture("flatpak", &["mask", "--user"])
        .ok()
        .filter(|output| output.success)
        .map(|output| {
            output
                .stdout
                .lines()
                .map(str::trim)
                .filter(|id| valid_flatpak_id(id))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn read_flatpak_snapshot() -> FlatpakSnapshot {
    let (apps, updates, masked) = std::thread::scope(|scope| {
        let apps = scope.spawn(read_flatpak_user_list);
        let updates = scope.spawn(read_flatpak_user_updates);
        let masked = scope.spawn(read_flatpak_user_masks);
        (
            apps.join().unwrap_or_default(),
            updates.join().unwrap_or_default(),
            masked.join().unwrap_or_default(),
        )
    });
    let installed = apps.iter().map(|app| app.app_id.clone()).collect();
    FlatpakSnapshot {
        installed,
        updates,
        masked,
        apps,
    }
}

fn flatpak_snapshot() -> Arc<FlatpakSnapshot> {
    let Ok(mut cache) = FLATPAK_STATE_CACHE.get_or_init(|| Mutex::new(None)).lock() else {
        return Arc::new(read_flatpak_snapshot());
    };
    if let Some((checked_at, snapshot)) = cache.as_ref() {
        if checked_at.elapsed() < FLATPAK_CACHE_TTL {
            return Arc::clone(snapshot);
        }
    }
    let snapshot = Arc::new(read_flatpak_snapshot());
    *cache = Some((Instant::now(), Arc::clone(&snapshot)));
    snapshot
}

async fn flatpak_snapshot_async() -> Result<Arc<FlatpakSnapshot>, String> {
    tokio::task::spawn_blocking(flatpak_snapshot)
        .await
        .map_err(|err| format!("Flatpak durumu arka planda okunamadı: {err}"))
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

fn flatpak_icon_data_url_cached(app_id: &str) -> Option<String> {
    let cache = ICON_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(guard) = cache.lock() {
        if let Some(hit) = guard.get(app_id) {
            return hit.clone();
        }
    }
    let value = flatpak_icon_data_url(app_id);
    if let Ok(mut guard) = cache.lock() {
        if guard.len() >= 512 {
            guard.clear();
        }
        guard.insert(app_id.to_string(), value.clone());
    }
    value
}

fn invalidate_icon_cache() {
    if let Ok(mut cache) = ICON_CACHE.get_or_init(|| Mutex::new(HashMap::new())).lock() {
        cache.clear();
    }
}

fn installed_apps(snapshot: &FlatpakSnapshot) -> Vec<AppItem> {
    snapshot
        .apps
        .iter()
        .map(|installed| {
            let update_available = snapshot.updates.contains(&installed.app_id);
            AppItem {
                id: installed.app_id.clone(),
                provider: "flatpak".to_string(),
                package_type: None,
                name: installed.name.clone(),
                summary: installed.summary.clone(),
                developer: String::new(),
                version: installed.version.clone(),
                icon: flatpak_icon_data_url_cached(&installed.app_id)
                    .or_else(|| Some(flatpak_icon_url(&installed.app_id))),
                installed: true,
                update_available,
                pinned: snapshot.masked.contains(&installed.app_id),
                channel: None,
                category: None,
                monthly_installs: None,
                hero_image: None,
            }
        })
        .collect()
}

fn cache_dir() -> Option<PathBuf> {
    let base = env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".cache")))?;
    Some(base.join("macro-store"))
}

fn installed_cache_path() -> Option<PathBuf> {
    cache_dir().map(|dir| dir.join("installed.json"))
}

fn save_installed_cache(apps: &[AppItem]) {
    let Some(path) = installed_cache_path() else {
        return;
    };
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_string(apps) {
        let _ = fs::write(path, json);
    }
}

fn load_installed_cache() -> Vec<AppItem> {
    installed_cache_path()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<Vec<AppItem>>(&raw).ok())
        .unwrap_or_default()
}

fn installed_apps_response(
    providers: [(&str, Result<Vec<AppItem>, String>); 3],
) -> InstalledAppsResponse {
    let mut response = InstalledAppsResponse {
        apps: Vec::new(),
        provider_errors: Vec::new(),
        from_cache: false,
    };
    for (provider, result) in providers {
        match result {
            Ok(apps) => response.apps.extend(apps),
            Err(message) => response.provider_errors.push(ProviderIssue {
                provider: provider.to_string(),
                message,
            }),
        }
    }
    if response.provider_errors.is_empty() && !response.apps.is_empty() {
        save_installed_cache(&response.apps);
    } else if response.apps.is_empty() {
        let cached = load_installed_cache();
        if !cached.is_empty() {
            response.apps = cached;
            response.from_cache = true;
        }
    }
    response
}
fn search_apps_response(
    providers: [(&str, Result<Vec<AppItem>, String>); 3],
) -> Result<SearchAppsResponse, String> {
    let mut sources = Vec::with_capacity(3);
    let mut response = SearchAppsResponse {
        apps: Vec::with_capacity(SEARCH_LIMIT),
        provider_errors: Vec::new(),
    };
    for (provider, result) in providers {
        match result {
            Ok(apps) => sources.push(apps),
            Err(message) => response.provider_errors.push(ProviderIssue {
                provider: provider.to_string(),
                message,
            }),
        }
    }
    if sources.is_empty() {
        return Err(response
            .provider_errors
            .iter()
            .map(|issue| format!("{}: {}", issue.provider, issue.message))
            .collect::<Vec<_>>()
            .join(" · "));
    }

    let max_source_len = sources.iter().map(Vec::len).max().unwrap_or(0);
    let mut seen = HashSet::with_capacity(SEARCH_LIMIT);
    for index in 0..max_source_len {
        for source in &sources {
            let Some(item) = source.get(index) else {
                continue;
            };
            if seen.insert((item.provider.clone(), item.id.clone())) {
                response.apps.push(item.clone());
                if response.apps.len() == SEARCH_LIMIT {
                    return Ok(response);
                }
            }
        }
    }
    Ok(response)
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
            .user_agent("MacroStore/0.3 (Linux app store)")
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

fn cache_read<T: Clone>(
    cache: &Mutex<HashMap<String, (Instant, T)>>,
    key: &str,
    ttl: Duration,
) -> Option<T> {
    let guard = cache.lock().ok()?;
    let (checked_at, value) = guard.get(key)?;
    if checked_at.elapsed() < ttl {
        Some(value.clone())
    } else {
        None
    }
}

fn cache_write<T>(
    cache: &Mutex<HashMap<String, (Instant, T)>>,
    key: &str,
    value: T,
    ttl: Duration,
    limit: usize,
) {
    let Ok(mut guard) = cache.lock() else {
        return;
    };
    guard.retain(|_, (checked_at, _)| checked_at.elapsed() < ttl);
    if guard.len() >= limit {
        if let Some(oldest) = guard
            .iter()
            .min_by_key(|(_, (checked_at, _))| *checked_at)
            .map(|(key, _)| key.clone())
        {
            guard.remove(&oldest);
        }
    }
    guard.insert(key.to_string(), (Instant::now(), value));
}

async fn get_appstream_cached(app_id: &str) -> Result<Appstream, String> {
    let cache = APPSTREAM_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(appstream) = cache_read(cache, app_id, APPSTREAM_CACHE_TTL) {
        return Ok(appstream);
    }

    let url = format!("{FLATHUB_API}/appstream/{app_id}");
    let appstream = get_json::<Appstream>(&url).await?;

    cache_write(
        cache,
        app_id,
        appstream.clone(),
        APPSTREAM_CACHE_TTL,
        APPSTREAM_CACHE_LIMIT,
    );

    Ok(appstream)
}

fn invalidate_appstream_cache() {
    if let Ok(mut cache) = APPSTREAM_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
    {
        cache.clear();
    }
}

async fn get_cached_json<T: DeserializeOwned>(url: &str) -> Result<T, String> {
    let cache = JSON_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(value) = cache_read(cache, url, JSON_CACHE_TTL) {
        if let Ok(parsed) = serde_json::from_value(value) {
            return Ok(parsed);
        }
    }

    let value = get_json::<Value>(url).await?;

    cache_write(cache, url, value.clone(), JSON_CACHE_TTL, JSON_CACHE_LIMIT);

    serde_json::from_value(value).map_err(|err| format!("Flathub verisi çözümlenemedi: {err}"))
}

async fn get_optional_cached<T: DeserializeOwned>(url: &str) -> Option<T> {
    tokio::time::timeout(Duration::from_secs(5), get_cached_json(url))
        .await
        .ok()?
        .ok()
}

fn invalidate_json_cache() {
    if let Ok(mut cache) = JSON_CACHE.get_or_init(|| Mutex::new(HashMap::new())).lock() {
        cache.clear();
    }
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
        pinned: false,
        channel: None,
        category,
        monthly_installs: app.installs_last_month,
        hero_image: None,
        id,
        provider: "flatpak".to_string(),
        package_type: None,
    })
}

fn app_from_snap(item: snap::ProviderApp) -> AppItem {
    AppItem {
        id: item.id,
        provider: "snap".to_string(),
        package_type: item.package_type,
        name: item.name,
        summary: item.summary,
        developer: item.developer,
        version: item.version,
        icon: item.icon,
        installed: item.installed,
        update_available: item.update_available,
        pinned: false,
        channel: item.channel,
        category: item.category,
        monthly_installs: None,
        hero_image: item.hero_image,
    }
}

fn app_from_brew(item: brew::ProviderApp) -> AppItem {
    AppItem {
        id: item.id,
        provider: "brew".to_string(),
        package_type: item.package_type,
        name: item.name,
        summary: item.summary,
        developer: item.developer,
        version: item.version,
        icon: item.icon,
        installed: item.installed,
        update_available: item.update_available,
        pinned: item.pinned,
        channel: None,
        category: item.category,
        monthly_installs: None,
        hero_image: None,
    }
}

fn fallback_app(id: &str, installed: &HashSet<String>, updates: &HashSet<String>) -> AppItem {
    let is_installed = installed.contains(id);
    AppItem {
        id: id.to_string(),
        provider: "flatpak".to_string(),
        package_type: None,
        name: id.to_string(),
        summary: String::new(),
        developer: String::new(),
        version: String::new(),
        icon: Some(flatpak_icon_url(id)),
        installed: is_installed,
        update_available: is_installed && updates.contains(id),
        pinned: false,
        channel: None,
        category: None,
        monthly_installs: None,
        hero_image: None,
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

fn release_items(releases: &[ApiRelease]) -> Vec<ReleaseItem> {
    releases
        .iter()
        .filter_map(|release| {
            let version = release.version.as_deref()?.trim();
            if version.is_empty() {
                return None;
            }
            Some(ReleaseItem {
                version: version.to_string(),
                date: release.timestamp.as_ref().and_then(|value| {
                    value
                        .as_str()
                        .and_then(|text| text.parse::<i64>().ok())
                        .or_else(|| value.as_i64())
                }),
            })
        })
        .take(8)
        .collect()
}

async fn fetch_appstream_item(
    id: String,
    installed: &HashSet<String>,
    updates: &HashSet<String>,
) -> AppItem {
    match get_appstream_cached(&id).await {
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
                id,
                provider: "flatpak".to_string(),
                package_type: None,
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
                pinned: false,
                channel: None,
                category,
                monthly_installs: None,
                hero_image,
            }
        }
        Err(_) => fallback_app(&id, installed, updates),
    }
}

async fn fetch_collection(
    path: &str,
    per_page: usize,
    installed: &HashSet<String>,
    updates: &HashSet<String>,
) -> Vec<AppItem> {
    let url = format!("{FLATHUB_API}/collection/{path}?page=1&per_page={per_page}&locale=tr");
    let Ok(response) = get_json::<ApiSearchResponse>(&url).await else {
        return Vec::new();
    };
    response
        .hits
        .into_iter()
        .filter_map(|app| app_from_api(app, installed, updates))
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
            id: app_id.to_string(),
            provider: "flatpak".to_string(),
            package_type: None,
            name: name.to_string(),
            summary: truncate_chars(summary, 500),
            developer: String::new(),
            version: version.to_string(),
            icon: Some(flatpak_icon_url(app_id)),
            installed: is_installed,
            update_available: is_installed && updates.contains(app_id),
            pinned: false,
            channel: None,
            category: None,
            monthly_installs: None,
            hero_image: None,
        });
        if apps.len() >= SEARCH_LIMIT {
            break;
        }
    }
    Ok(apps)
}

/* ── Tauri komutları ────────────────────────────────── */

#[tauri::command]
async fn get_setup_status() -> Result<SetupStatus, String> {
    tokio::task::spawn_blocking(setup_status)
        .await
        .map_err(|err| format!("Sistem hazırlığı durumu arka planda okunamadı: {err}"))
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

    let flatpak_installed = tokio::task::spawn_blocking(flatpak_available)
        .await
        .map_err(|err| format!("Flatpak durumu arka planda okunamadı: {err}"))?;
    if !flatpak_installed {
        let status = tokio::task::spawn_blocking(setup_status)
            .await
            .map_err(|err| format!("Sistem hazırlığı durumu arka planda okunamadı: {err}"))?;
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
        invalidate_flatpak_cache();
        result?;

        if plan.needs_reboot
            && !tokio::task::spawn_blocking(flatpak_available)
                .await
                .map_err(|err| format!("Flatpak durumu arka planda okunamadı: {err}"))?
        {
            let message = "Flatpak katmanı rpm-ostree ile hazırlandı. Kullanmak için bilgisayarı yeniden başlatın.";
            emit_setup_log(&app, message, "info");
            let mut next = tokio::task::spawn_blocking(setup_status)
                .await
                .map_err(|err| format!("Sistem hazırlığı durumu arka planda okunamadı: {err}"))?;
            next.reboot_required = true;
            let _ = app.emit("setup-finished", next.clone());
            return Ok(next);
        }

        if !tokio::task::spawn_blocking(flatpak_available)
            .await
            .map_err(|err| format!("Flatpak durumu arka planda okunamadı: {err}"))?
        {
            let message = "Flatpak paketi kuruldu ancak flatpak komutu bulunamadı. Terminalde flatpak --version çalıştırıp yeniden deneyin.".to_string();
            emit_setup_log(&app, format!("✕ {message}"), "error");
            return Err(message);
        }
    }

    if !tokio::task::spawn_blocking(|| flatpak_user_remotes().contains_key("flathub"))
        .await
        .map_err(|err| format!("Flathub durumu arka planda okunamadı: {err}"))?
    {
        emit_setup_log(&app, "Flathub kullanıcı deposu ekleniyor…", "info");
        let output = tokio::task::spawn_blocking(|| {
            run_capture(
                "flatpak",
                &[
                    "remote-add",
                    "--user",
                    "--if-not-exists",
                    "flathub",
                    FLATHUB_REPO,
                ],
            )
        })
        .await
        .map_err(|err| format!("Flathub deposu arka planda eklenemedi: {err}"))??;
        invalidate_flatpak_cache();
        if !output.success {
            let message = failure_message("flatpak remote-add", &output);
            emit_setup_log(&app, format!("✕ {message}"), "error");
            return Err(message);
        }
        emit_setup_log(&app, "✓ Flathub kullanıcı deposu hazır.", "info");
    } else {
        emit_setup_log(&app, "Flathub kullanıcı deposu zaten hazır.", "info");
    }

    let status = tokio::task::spawn_blocking(setup_status)
        .await
        .map_err(|err| format!("Sistem hazırlığı durumu arka planda okunamadı: {err}"))?;
    if !status.ready {
        let message = "Kurulum tamamlandı ancak Flatpak ve Flathub hazır görünmüyor. Durumu yenileyip yeniden deneyin.".to_string();
        emit_setup_log(&app, format!("✕ {message}"), "error");
        return Err(message);
    }

    emit_setup_log(&app, "✓ Sistem hazır. Macro Store kullanıma hazır.", "info");
    let _ = app.emit("setup-finished", status.clone());
    Ok(status)
}

#[tauri::command]
async fn get_store_info() -> Result<StoreInfo, String> {
    tokio::task::spawn_blocking(|| {
        let version = flatpak_version();
        let remotes = list_remotes_sync().unwrap_or_default();
        let flathub_available = remotes.iter().any(|remote| remote.name == "flathub");
        let user_flathub_available = remotes
            .iter()
            .any(|remote| remote.name == "flathub" && remote.scope == "user");
        StoreInfo {
            flatpak_available: version.is_some(),
            flatpak_version: version,
            flathub_available,
            user_flathub_available,
            snap_available: snap::available(),
            brew_available: brew::available(),
        }
    })
    .await
    .map_err(|err| format!("Paket yöneticileri arka planda denetlenemedi: {err}"))
}

#[tauri::command]
async fn get_discover(date: String) -> Result<DiscoverData, String> {
    if !valid_date(&date) {
        return Err("Tarih biçimi geçersiz.".to_string());
    }
    let snapshot = flatpak_snapshot_async().await?;
    let day_url = format!("{FLATHUB_API}/app-picks/app-of-the-day/{date}");
    let week_url = format!("{FLATHUB_API}/app-picks/apps-of-the-week/{date}");
    let (day, week) = tokio::join!(
        get_optional_cached::<ApiAppOfDay>(&day_url),
        get_optional_cached::<ApiPicks>(&week_url),
    );

    let day_id = day
        .as_ref()
        .map(|value| value.app_id.clone())
        .filter(|value| valid_flatpak_id(value));
    let mut ids = Vec::with_capacity(6);
    let mut seen = HashSet::with_capacity(6);
    if let Some(id) = day_id.clone() {
        seen.insert(id.clone());
        ids.push(id);
    }
    if let Some(week) = week {
        for id in week
            .apps
            .into_iter()
            .map(|item| item.app_id)
            .filter(|id| valid_flatpak_id(id))
        {
            if seen.insert(id.clone()) {
                ids.push(id);
                if ids.len() == 6 {
                    break;
                }
            }
        }
    }

    let (collections, fetched) = tokio::join!(
        async {
            tokio::join!(
                fetch_collection("popular", 12, &snapshot.installed, &snapshot.updates),
                fetch_collection("recently-added", 8, &snapshot.installed, &snapshot.updates),
            )
        },
        join_all(
            ids.iter()
                .cloned()
                .map(|id| { fetch_appstream_item(id, &snapshot.installed, &snapshot.updates) })
        ),
    );
    let (popular, recent) = collections;

    let app_of_day = day_id
        .as_ref()
        .and_then(|id| fetched.iter().find(|item| &item.id == id).cloned())
        .or_else(|| fetched.first().cloned())
        .or_else(|| popular.first().cloned());
    let picks = fetched
        .iter()
        .filter(|item| Some(&item.id) != day_id.as_ref())
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

async fn search_flatpak(
    query: String,
    snapshot: Arc<FlatpakSnapshot>,
) -> Result<Vec<AppItem>, String> {
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
                    .filter_map(|app| app_from_api(app, &snapshot.installed, &snapshot.updates))
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
    match result {
        Ok(apps) => Ok(apps),
        Err(api_error) => {
            let installed = snapshot.installed.clone();
            let updates = snapshot.updates.clone();
            let fallback = tokio::task::spawn_blocking(move || {
                flatpak_search_fallback(&query, &installed, &updates)
            })
            .await
            .map_err(|err| format!("Flatpak araması arka planda tamamlanamadı: {err}"))?;
            match fallback {
                Ok(apps) if !apps.is_empty() => Ok(apps),
                _ => Err(api_error),
            }
        }
    }
}

#[tauri::command]
async fn search_apps(query: String) -> Result<SearchAppsResponse, String> {
    let query = valid_query(&query)?;
    let flatpak_query = query.clone();
    let flatpak = async move {
        match flatpak_snapshot_async().await {
            Ok(snapshot) => search_flatpak(flatpak_query, snapshot).await,
            Err(error) => Err(format!("Flatpak envanteri alınamadı: {error}")),
        }
    };
    let snap = snap::search(&query);
    let brew = brew::search(&query);
    let (flatpak, snap, brew) = tokio::join!(flatpak, snap, brew);

    search_apps_response([
        (
            "Flatpak",
            flatpak.map_err(|error| format!("Flathub: {error}")),
        ),
        (
            "Snap",
            snap.map(|apps| apps.into_iter().map(app_from_snap).collect())
                .map_err(|error| format!("Snap: {error}")),
        ),
        (
            "Homebrew",
            brew.map(|apps| apps.into_iter().map(app_from_brew).collect())
                .map_err(|error| format!("Homebrew: {error}")),
        ),
    ])
}

#[tauri::command]
async fn get_category(slug: String, page: Option<u32>) -> Result<CategoryPage, String> {
    if !CATEGORIES.contains(&slug.as_str()) {
        return Err("Kategori bulunamadı.".to_string());
    }
    let page = page.unwrap_or(1).max(1);
    let snapshot = flatpak_snapshot_async().await?;
    let url = format!(
        "{FLATHUB_API}/collection/category/{slug}?page={page}&per_page={CATEGORY_LIMIT}&locale=tr"
    );
    let response = get_json::<ApiSearchResponse>(&url).await?;
    let apps = response
        .hits
        .into_iter()
        .filter_map(|app| app_from_api(app, &snapshot.installed, &snapshot.updates))
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
async fn get_app_detail(app_id: String, provider: String) -> Result<AppDetail, String> {
    match provider.as_str() {
        "flatpak" => get_flatpak_app_detail(app_id).await,
        "snap" => {
            let detail = snap::detail(&app_id).await?;
            let app = app_from_snap(detail.app);
            let categories = app.category.iter().cloned().collect();
            Ok(AppDetail {
                app,
                description: detail.description,
                screenshots: detail
                    .screenshots
                    .into_iter()
                    .map(|url| ScreenshotItem { url, caption: None })
                    .collect(),
                categories,
                license: detail.license,
                verified: detail.verified,
                homepage: detail.homepage,
                download_size: detail.download_size,
                installed_size: None,
                installs_last_month: None,
                rating: None,
                reviews: Vec::new(),
                releases: Vec::new(),
            })
        }
        "brew" => {
            let detail = brew::detail(&app_id).await?;
            let app = app_from_brew(detail.app);
            let categories = app.category.iter().cloned().collect();
            Ok(AppDetail {
                app,
                description: detail.description,
                screenshots: Vec::new(),
                categories,
                license: detail.license,
                verified: false,
                homepage: detail.homepage,
                download_size: None,
                installed_size: None,
                installs_last_month: None,
                rating: None,
                reviews: Vec::new(),
                releases: Vec::new(),
            })
        }
        _ => Err("Paket sağlayıcısı geçersiz.".to_string()),
    }
}

#[tauri::command]
async fn get_app_permissions(app_id: String) -> Result<AppPermissions, String> {
    if !valid_flatpak_id(&app_id) {
        return Err("Uygulama kimliği geçersiz.".to_string());
    }
    let flatpak_available = tokio::task::spawn_blocking(flatpak_available)
        .await
        .map_err(|err| format!("Flatpak durumu arka planda okunamadı: {err}"))?;
    if !flatpak_available {
        return Ok(AppPermissions {
            installed: false,
            available: false,
            raw: String::new(),
        });
    }
    if !flatpak_snapshot_async().await?.installed.contains(&app_id) {
        return Ok(AppPermissions {
            installed: false,
            available: true,
            raw: String::new(),
        });
    }

    let id = app_id.clone();
    let output = tokio::task::spawn_blocking(move || {
        run_capture(
            "flatpak",
            &["info", "--user", "--show-permissions", id.as_str()],
        )
    })
    .await
    .map_err(|err| format!("Flatpak izinleri arka planda okunamadı: {err}"))??;
    if !output.success {
        return Err(failure_message("flatpak info", &output));
    }

    Ok(AppPermissions {
        installed: true,
        available: true,
        raw: truncate_chars(output.stdout.trim(), 12000),
    })
}

async fn get_flatpak_app_detail(app_id: String) -> Result<AppDetail, String> {
    if !valid_flatpak_id(&app_id) {
        return Err("Uygulama kimliği geçersiz.".to_string());
    }
    let snapshot = flatpak_snapshot_async().await?;
    let encoded = app_id.clone();
    let summary_url = format!("{FLATHUB_API}/summary/{encoded}");
    let stats_url = format!("{FLATHUB_API}/stats/{encoded}");
    let ratings_url = format!("{ODRS_API}/ratings/{encoded}");
    let reviews_url = format!("{ODRS_API}/app/{encoded}");

    let (appstream, summary, stats, ratings, reviews) = tokio::join!(
        get_appstream_cached(&app_id),
        get_optional_cached::<ApiSummary>(&summary_url),
        get_optional_cached::<ApiStats>(&stats_url),
        get_optional_cached::<OdrRatings>(&ratings_url),
        get_optional_cached::<Vec<OdrReview>>(&reviews_url),
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
    let releases = release_items(&appstream.releases);
    let is_installed = snapshot.installed.contains(&app_id);
    let monthly_installs = stats.and_then(|value| value.installs_last_month);
    let app = AppItem {
        id: app_id.clone(),
        provider: "flatpak".to_string(),
        package_type: None,
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
        update_available: is_installed && snapshot.updates.contains(&app_id),
        pinned: is_installed && snapshot.masked.contains(&app_id),
        channel: None,
        category: main_category_from_appstream(&appstream.categories),
        monthly_installs,
        hero_image: screenshots.first().map(|item| item.url.clone()),
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
        releases,
    })
}

#[tauri::command]
async fn list_installed_apps() -> InstalledAppsResponse {
    let flatpak = tokio::task::spawn_blocking(|| -> Result<Vec<AppItem>, String> {
        if flatpak_available() {
            Ok(installed_apps(&flatpak_snapshot()))
        } else {
            Ok(Vec::new())
        }
    });
    let snap = tokio::task::spawn_blocking(|| {
        if snap::available() {
            snap::installed()
                .map(|apps| apps.into_iter().map(app_from_snap).collect())
                .map_err(|error| format!("Snap yüklü uygulamaları okunamadı: {error}"))
        } else {
            Ok(Vec::new())
        }
    });
    let brew = tokio::task::spawn_blocking(|| {
        if brew::available() {
            brew::installed()
                .map(|apps| apps.into_iter().map(app_from_brew).collect())
                .map_err(|error| format!("Homebrew yüklü uygulamaları okunamadı: {error}"))
        } else {
            Ok(Vec::new())
        }
    });
    let (flatpak, snap, brew) = tokio::join!(flatpak, snap, brew);
    let flatpak = flatpak
        .map_err(|error| format!("Flatpak envanteri okunamadı: {error}"))
        .and_then(|result| result);
    let snap = snap
        .map_err(|error| format!("Snap envanteri okunamadı: {error}"))
        .and_then(|result| result);
    let brew = brew
        .map_err(|error| format!("Homebrew envanteri okunamadı: {error}"))
        .and_then(|result| result);
    installed_apps_response([("flatpak", flatpak), ("snap", snap), ("brew", brew)])
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryUsage {
    total_bytes: u64,
    apps: usize,
}

#[tauri::command]
async fn library_usage() -> Result<LibraryUsage, String> {
    tokio::task::spawn_blocking(|| {
        let snapshot = flatpak_snapshot();
        LibraryUsage {
            total_bytes: snapshot
                .apps
                .iter()
                .filter_map(|app| app.installed_size)
                .sum(),
            apps: snapshot.apps.len(),
        }
    })
    .await
    .map_err(|error| format!("Kitaplık boyutu okunamadı: {error}"))
}

#[tauri::command]
async fn prune_unused_runtimes(app: AppHandle) -> Result<OperationOutcome, String> {
    if SETTING_UP.load(Ordering::SeqCst) {
        return Err(
            "Sistem hazırlığı sürüyor. Lütfen tamamlandıktan sonra yeniden deneyin.".to_string(),
        );
    }
    if OPERATING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Zaten devam eden bir işlem var.".to_string());
    }
    let _lock = OperationLock;
    let output = tokio::task::spawn_blocking(|| {
        run_capture(
            "flatpak",
            &["uninstall", "--user", "--unused", "--noninteractive"],
        )
    })
    .await
    .map_err(|error| format!("Temizlik arka planda tamamlanamadı: {error}"))??;

    let message = if output.success {
        "Kullanılmayan çalışma zamanları temizlendi.".to_string()
    } else {
        failure_message("flatpak uninstall", &output)
    };
    emit_log(
        &app,
        if output.success {
            format!("✓ {message}")
        } else {
            format!("✕ {message}")
        },
        if output.success { "info" } else { "error" },
    );
    if output.success {
        invalidate_flatpak_cache();
    }
    let outcome = OperationOutcome {
        success: output.success,
        code: None,
        message,
        app_id: String::new(),
        action: "prune".to_string(),
        manager: "Flatpak".to_string(),
    };
    let _ = app.emit("app-finished", outcome.clone());
    Ok(outcome)
}

#[tauri::command]
async fn set_app_mask(
    app: AppHandle,
    id: String,
    masked: bool,
) -> Result<OperationOutcome, String> {
    if !valid_flatpak_id(&id) {
        return Err("Uygulama kimliği geçersiz.".to_string());
    }
    if OPERATING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Zaten devam eden bir işlem var.".to_string());
    }
    let _lock = OperationLock;
    let masked_id = id.clone();
    let output = tokio::task::spawn_blocking(move || {
        let args: Vec<&str> = if masked {
            vec!["mask", "--user", &masked_id]
        } else {
            vec!["mask", "--user", "--remove", &masked_id]
        };
        run_capture("flatpak", &args)
    })
    .await
    .map_err(|error| format!("Maskeleme arka planda tamamlanamadı: {error}"))??;

    let message = if output.success {
        if masked {
            format!("{id} için güncellemeler durduruldu.")
        } else {
            format!("{id} için güncellemeler yeniden etkinleştirildi.")
        }
    } else {
        failure_message("flatpak mask", &output)
    };
    emit_log(
        &app,
        if output.success {
            format!("✓ {message}")
        } else {
            format!("✕ {message}")
        },
        if output.success { "info" } else { "error" },
    );
    if output.success {
        invalidate_flatpak_cache();
    }
    let outcome = OperationOutcome {
        success: output.success,
        code: None,
        message,
        app_id: id,
        action: if masked { "mask" } else { "unmask" }.to_string(),
        manager: "Flatpak".to_string(),
    };
    let _ = app.emit("app-finished", outcome.clone());
    Ok(outcome)
}

#[tauri::command]
async fn list_brew_taps() -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(brew::taps)
        .await
        .map_err(|error| format!("Homebrew tap listesi arka planda okunamadı: {error}"))?
}

#[tauri::command]
async fn add_brew_tap(name: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || brew::add_tap(&name))
        .await
        .map_err(|error| format!("Homebrew tap işlemi arka planda tamamlanamadı: {error}"))?
}

#[tauri::command]
async fn remove_brew_tap(name: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || brew::remove_tap(&name))
        .await
        .map_err(|error| format!("Homebrew tap işlemi arka planda tamamlanamadı: {error}"))?
}

#[tauri::command]
async fn switch_snap_channel(
    app: AppHandle,
    id: String,
    channel: String,
) -> Result<OperationOutcome, String> {
    if SETTING_UP.load(Ordering::SeqCst) {
        return Err(
            "Sistem hazırlığı sürüyor. Lütfen tamamlandıktan sonra yeniden deneyin.".to_string(),
        );
    }
    if OPERATING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Zaten devam eden bir işlem var.".to_string());
    }
    let _lock = OperationLock;
    let message = match snap::switch_channel(&id, &channel).await {
        Ok(message) => message,
        Err(error) => {
            emit_log(&app, format!("✕ {error}"), "error");
            return Err(error);
        }
    };
    emit_log(&app, format!("✓ {message}"), "info");
    let outcome = OperationOutcome {
        success: true,
        code: None,
        message,
        app_id: id,
        action: "channel".to_string(),
        manager: "Snap".to_string(),
    };
    let _ = app.emit("app-finished", outcome.clone());
    Ok(outcome)
}

#[tauri::command]
fn refresh_provider_caches() {
    invalidate_flatpak_cache();
    invalidate_appstream_cache();
    invalidate_json_cache();
    invalidate_icon_cache();
    snap::invalidate_cache();
    brew::invalidate_cache();
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
    invalidate_flatpak_cache();
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
    invalidate_flatpak_cache();
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
) -> Result<(PathBuf, Vec<OsString>, String), String> {
    let flatpak =
        host_program("flatpak").ok_or_else(|| "Flatpak sistemde bulunamadı.".to_string())?;
    let args: Vec<String> = match action {
        ActionKind::Install => vec![
            "install".to_string(),
            "--user".to_string(),
            "-y".to_string(),
            "flathub".to_string(),
            app_id.to_string(),
        ],
        ActionKind::Remove => vec![
            "uninstall".to_string(),
            "--user".to_string(),
            "-y".to_string(),
            app_id.to_string(),
        ],
        ActionKind::Update => vec![
            "update".to_string(),
            "--user".to_string(),
            "-y".to_string(),
            app_id.to_string(),
        ],
    };
    let mut display = flatpak.display().to_string();
    for arg in &args {
        display.push(' ');
        display.push_str(arg);
    }
    Ok((
        flatpak,
        args.into_iter().map(OsString::from).collect(),
        display,
    ))
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
        truncate_chars(&format!("Flatpak kurulumu başarısız: {error}"), 500)
    } else {
        format!(
            "Flatpak kurulumu {} çıkış koduyla sonlandı.",
            code.map(|value| value.to_string())
                .unwrap_or_else(|| "bilinmeyen".to_string())
        )
    };
    emit_setup_log(app, format!("✕ {message}"), "error");
    Err(message)
}

async fn run_app_action(
    app: AppHandle,
    id: String,
    provider: String,
    action: ActionKind,
) -> Result<OperationOutcome, String> {
    match provider.as_str() {
        "flatpak" => run_flatpak_action(app, id, action).await,
        "snap" | "brew" => run_provider_action(app, id, provider, action).await,
        _ => Err("Paket sağlayıcısı geçersiz.".to_string()),
    }
}

async fn run_flatpak_action(
    app: AppHandle,
    id: String,
    action: ActionKind,
) -> Result<OperationOutcome, String> {
    if !valid_flatpak_id(&id) {
        return Err("Uygulama kimliği geçersiz.".to_string());
    }
    if !tokio::task::spawn_blocking(flatpak_available)
        .await
        .map_err(|err| format!("Flatpak durumu arka planda okunamadı: {err}"))?
    {
        return Err("Flatpak sistemde bulunamadı.".to_string());
    }
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
    let _lock = OperationLock;

    if action == ActionKind::Install {
        tokio::task::spawn_blocking(ensure_flathub_user_remote)
            .await
            .map_err(|err| format!("Flathub durumu arka planda okunamadı: {err}"))??;
    } else if !flatpak_snapshot_async().await?.installed.contains(&id) {
        return Err("Bu Flatpak uygulaması kullanıcı kurulumunda yüklü değil.".to_string());
    }

    let (program, args, display) = build_flatpak_command(&id, action)?;
    emit_log(&app, format!("Komut: {display}"), "cmd");
    emit_log(&app, "Flathub işlemi hazırlanıyor…", "info");

    let mut command = AsyncCommand::new(&program);
    command
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    sanitize_async(&mut command);

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(err) => {
            let message = format!("İşlem başlatılamadı: {err}");
            emit_log(&app, &message, "error");
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
                            emit_log(&app, line, "stdout");
                        }
                    }
                    Ok(None) => stdout_done = true,
                    Err(err) => {
                        emit_log(&app, format!("Çıktı okuma hatası: {err}"), "error");
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
                            emit_log(&app, line, "stderr");
                        }
                    }
                    Ok(None) => stderr_done = true,
                    Err(err) => {
                        emit_log(&app, format!("Hata çıktısı okuma hatası: {err}"), "error");
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
    let success = status.success();
    let code = status.code();
    invalidate_flatpak_cache();

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
        &app,
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
        manager: "Flatpak".to_string(),
    };
    let _ = app.emit("app-finished", outcome.clone());
    Ok(outcome)
}

async fn run_provider_action(
    app: AppHandle,
    id: String,
    provider: String,
    action: ActionKind,
) -> Result<OperationOutcome, String> {
    if SETTING_UP.load(Ordering::SeqCst) {
        return Err(
            "Sistem hazırlığı sürüyor. Lütfen tamamlandıktan sonra yeniden deneyin.".to_string(),
        );
    }
    if OPERATING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Zaten devam eden bir işlem var.".to_string());
    }
    let _lock = OperationLock;
    let operation = action.as_str();
    let result = match provider.as_str() {
        "snap" => snap::action(&id, operation).await,
        "brew" => brew::action(&id, operation).await,
        _ => return Err("Paket sağlayıcısı geçersiz.".to_string()),
    };
    let message = match result {
        Ok(message) => message,
        Err(error) => {
            emit_log(&app, format!("✕ {error}"), "error");
            return Err(error);
        }
    };
    emit_log(&app, format!("✓ {message}"), "info");
    let outcome = OperationOutcome {
        success: true,
        code: None,
        message,
        app_id: id,
        action: operation.to_string(),
        manager: if provider == "snap" {
            "Snap"
        } else {
            "Homebrew"
        }
        .to_string(),
    };
    let _ = app.emit("app-finished", outcome.clone());
    Ok(outcome)
}

#[tauri::command]
async fn install_app(
    app: AppHandle,
    id: String,
    provider: String,
) -> Result<OperationOutcome, String> {
    run_app_action(app, id, provider, ActionKind::Install).await
}

#[tauri::command]
async fn remove_app(
    app: AppHandle,
    id: String,
    provider: String,
) -> Result<OperationOutcome, String> {
    run_app_action(app, id, provider, ActionKind::Remove).await
}

fn flatpak_remote_names() -> Vec<String> {
    run_capture("flatpak", &["remotes", "--user", "--columns=name"])
        .ok()
        .filter(|output| output.success)
        .map(|output| {
            output
                .stdout
                .lines()
                .map(str::trim)
                .filter(|name| !name.is_empty() && name.len() <= 64)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn read_flatpak_commits(app_id: &str) -> Result<Vec<FlatpakCommit>, String> {
    if !flatpak_available() {
        return Ok(Vec::new());
    }
    let mut remotes = flatpak_remote_names();
    if !remotes.iter().any(|name| name == "flathub") {
        remotes.insert(0, "flathub".to_string());
    }
    for remote in remotes {
        let Ok(output) = run_capture("flatpak", &["remote-info", "--log", &remote, app_id]) else {
            continue;
        };
        if !output.success {
            continue;
        }
        let commits = parse_remote_info_log(&output.stdout);
        if !commits.is_empty() {
            return Ok(commits);
        }
    }
    Ok(Vec::new())
}

#[tauri::command]
async fn flatpak_commits(app_id: String) -> Result<Vec<FlatpakCommit>, String> {
    if !valid_flatpak_id(&app_id) {
        return Err("Uygulama kimliği geçersiz.".to_string());
    }
    tokio::task::spawn_blocking(move || read_flatpak_commits(&app_id))
        .await
        .map_err(|error| format!("Sürüm geçmişi arka planda okunamadı: {error}"))?
}

#[tauri::command]
async fn rollback_flatpak_app(
    app: AppHandle,
    id: String,
    commit: String,
) -> Result<OperationOutcome, String> {
    if !valid_flatpak_id(&id) {
        return Err("Uygulama kimliği geçersiz.".to_string());
    }
    if !valid_commit_hash(&commit) {
        return Err("Sürüm kimliği geçersiz.".to_string());
    }
    if SETTING_UP.load(Ordering::SeqCst) {
        return Err(
            "Sistem hazırlığı sürüyor. Lütfen tamamlandıktan sonra yeniden deneyin.".to_string(),
        );
    }
    if OPERATING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Zaten devam eden bir işlem var.".to_string());
    }
    let _lock = OperationLock;

    if !flatpak_snapshot_async().await?.installed.contains(&id) {
        return Err("Bu Flatpak uygulaması kullanıcı kurulumunda yüklü değil.".to_string());
    }

    let target = id.clone();
    let flag = format!("--commit={commit}");
    let display = format!("flatpak update --user {flag} {target}");
    emit_log(&app, format!("Komut: {display}"), "cmd");
    let output = tokio::task::spawn_blocking(move || {
        run_capture(
            "flatpak",
            &["update", "--user", "--noninteractive", &flag, &target],
        )
    })
    .await
    .map_err(|error| format!("Sürüm geri alma arka planda tamamlanamadı: {error}"))??;

    let message = if output.success {
        format!("{id} seçilen sürüme sabitlendi.")
    } else {
        failure_message("flatpak update", &output)
    };
    emit_log(
        &app,
        if output.success {
            format!("✓ {message}")
        } else {
            format!("✕ {message}")
        },
        if output.success { "info" } else { "error" },
    );
    if output.success {
        invalidate_flatpak_cache();
    }
    let outcome = OperationOutcome {
        success: output.success,
        code: None,
        message,
        app_id: id,
        action: "rollback".to_string(),
        manager: "Flatpak".to_string(),
    };
    let _ = app.emit("app-finished", outcome.clone());
    Ok(outcome)
}

#[tauri::command]
async fn update_app(
    app: AppHandle,
    id: String,
    provider: String,
) -> Result<OperationOutcome, String> {
    run_app_action(app, id, provider, ActionKind::Update).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            tray::setup(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_setup_status,
            install_flatpak,
            get_store_info,
            get_discover,
            search_apps,
            get_category,
            get_app_detail,
            get_app_permissions,
            list_installed_apps,
            library_usage,
            prune_unused_runtimes,
            switch_snap_channel,
            set_app_mask,
            list_brew_taps,
            add_brew_tap,
            remove_brew_tap,
            refresh_provider_caches,
            list_flatpak_remotes,
            add_flatpak_remote,
            remove_flatpak_remote,
            install_app,
            remove_app,
            update_app,
            flatpak_commits,
            rollback_flatpak_app,
            tray::set_tray_updates
        ])
        .run(tauri::generate_context!())
        .expect("Macro Store başlatılamadı");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flatpak_inventory_parses_columns_and_sorts_by_name() {
        let apps = parse_flatpak_user_list(
            "Application\tName\tDescription\tVersion\norg.example.Zeta\tZeta\tEditor for notes\t2.4\norg.example.Alpha\tAlpha\t\t1.0\n",
        );
        assert_eq!(apps.len(), 2);
        assert_eq!(apps[0].app_id, "org.example.Alpha");
        assert_eq!(apps[0].version, "1.0");
        assert_eq!(apps[1].summary, "Editor for notes");
        assert_eq!(apps[1].version, "2.4");
    }

    #[test]
    fn remote_info_log_parses_commits() {
        let log = "commit: 3f8f1a9d2b4c5e6f70819a2b3c4d5e6f70819a2b\nParent: 1111\nSubject: Update to 2.10.0\nDate: 2024-03-05 10:12:33 +0000\n\ncommit: 7c2b9e0f1a3d5b7c9e1f2a4b6c8d0e2f4a6b8c0d\nSubject: Fix crash on start\nDate: 2024-02-01 00:00:00 +0300\n";
        let commits = parse_remote_info_log(log);
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].subject, "Update to 2.10.0");
        assert_eq!(commits[0].date, Some(1_709_633_553));
        assert_eq!(commits[1].date, Some(1_706_734_800));
        assert!(commits[0].commit.starts_with("3f8f1a9d"));
    }

    #[test]
    fn remote_info_log_skips_invalid_commits() {
        let log = "commit: not-hex\nSubject: nope\n\ncommit: 0123456\nSubject: Short hash ok\n";
        let commits = parse_remote_info_log(log);
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].commit, "0123456");
        assert_eq!(commits[0].date, None);
        assert!(!valid_commit_hash("xyz1234"));
        assert!(!valid_commit_hash("abc"));
        assert!(valid_commit_hash("abcdef1"));
    }

    #[test]
    fn cache_invalidation_clears_entries() {
        let json = JSON_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        json.lock().expect("json cache lock").insert(
            "https://example.test".to_string(),
            (Instant::now(), Value::Null),
        );
        invalidate_json_cache();
        assert!(json.lock().expect("json cache lock").is_empty());

        let icons = ICON_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        icons.lock().expect("icon cache lock").insert(
            "org.example.Alpha".to_string(),
            Some("data:image/png;base64,".to_string()),
        );
        invalidate_icon_cache();
        assert!(icons.lock().expect("icon cache lock").is_empty());
    }

    #[test]
    fn cache_read_respects_ttl() {
        let cache: Mutex<HashMap<String, (Instant, u32)>> = Mutex::new(HashMap::new());
        let ttl = Duration::from_secs(60);

        cache_write(&cache, "fresh", 7, ttl, 4);
        assert_eq!(cache_read(&cache, "fresh", ttl), Some(7));

        let stale = Instant::now()
            .checked_sub(Duration::from_secs(120))
            .expect("stale instant");
        cache
            .lock()
            .expect("cache lock")
            .insert("stale".to_string(), (stale, 9));

        assert_eq!(cache_read(&cache, "stale", ttl), None);
        assert_eq!(cache_read(&cache, "missing", ttl), None);
    }

    #[test]
    fn cache_write_prunes_expired_and_evicts_oldest() {
        let cache: Mutex<HashMap<String, (Instant, u32)>> = Mutex::new(HashMap::new());
        let ttl = Duration::from_secs(60);
        let limit = 2;
        let expired = Instant::now()
            .checked_sub(Duration::from_secs(120))
            .expect("expired instant");
        let older = Instant::now()
            .checked_sub(Duration::from_secs(10))
            .expect("older instant");
        let newer = Instant::now()
            .checked_sub(Duration::from_secs(5))
            .expect("newer instant");

        {
            let mut guard = cache.lock().expect("cache lock");
            guard.insert("expired".to_string(), (expired, 0));
            guard.insert("older".to_string(), (older, 1));
            guard.insert("newer".to_string(), (newer, 2));
        }

        cache_write(&cache, "fresh", 3, ttl, limit);

        let guard = cache.lock().expect("cache lock");
        assert_eq!(guard.len(), limit);
        assert!(!guard.contains_key("expired"));
        assert!(!guard.contains_key("older"));
        assert!(guard.contains_key("newer"));
        assert!(guard.contains_key("fresh"));
    }

    #[test]
    fn flatpak_sizes_parse_units_and_locale_separators() {
        assert_eq!(parse_flatpak_size("1.2 MB"), Some(1_258_291));
        assert_eq!(parse_flatpak_size("1,2 MB"), Some(1_258_291));
        assert_eq!(parse_flatpak_size("512 kB"), Some(524_288));
        assert_eq!(parse_flatpak_size("2 GB"), Some(2_147_483_648));
        assert_eq!(parse_flatpak_size("0 bytes"), Some(0));
        assert_eq!(parse_flatpak_size(""), None);
        assert_eq!(parse_flatpak_size("bilinmiyor"), None);
        assert_eq!(parse_flatpak_size("-1 MB"), None);
    }

    #[test]
    fn installed_rows_carry_sizes_and_default_to_none() {
        let apps = parse_flatpak_user_list(
            "Application	Name	Description	Version	Size
org.example.Alpha	Alpha		1.0	1.2 MB
org.example.Beta	Beta		2.0	
",
        );
        assert_eq!(apps.len(), 2);
        assert_eq!(apps[0].installed_size, Some(1_258_291));
        assert_eq!(apps[1].installed_size, None);
    }

    #[test]
    fn release_items_skip_empty_versions_and_parse_dates() {
        let releases = vec![
            ApiRelease {
                version: Some("1.2".to_string()),
                timestamp: Some(Value::String("1700000000".to_string())),
            },
            ApiRelease {
                version: Some("   ".to_string()),
                timestamp: None,
            },
            ApiRelease {
                version: None,
                timestamp: None,
            },
            ApiRelease {
                version: Some("1.0".to_string()),
                timestamp: Some(Value::from(1600000000)),
            },
        ];
        let items = release_items(&releases);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].version, "1.2");
        assert_eq!(items[0].date, Some(1_700_000_000));
        assert_eq!(items[1].version, "1.0");
        assert_eq!(items[1].date, Some(1_600_000_000));
    }

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

    #[test]
    fn installed_inventory_keeps_successful_providers_when_another_fails() {
        let app = |provider: &str, id: &str| AppItem {
            id: id.to_string(),
            provider: provider.to_string(),
            package_type: None,
            name: id.to_string(),
            summary: String::new(),
            developer: String::new(),
            version: String::new(),
            icon: None,
            installed: true,
            update_available: false,
            pinned: false,
            channel: None,
            category: None,
            monthly_installs: None,
            hero_image: None,
        };
        let response = installed_apps_response([
            ("flatpak", Ok(vec![app("flatpak", "org.example.App")])),
            ("snap", Err("snapd kapalı".to_string())),
            ("brew", Ok(vec![app("brew", "formula/example")])),
        ]);

        assert_eq!(
            response
                .apps
                .iter()
                .map(|item| item.provider.as_str())
                .collect::<Vec<_>>(),
            ["flatpak", "brew"]
        );
        assert_eq!(response.provider_errors.len(), 1);
        assert_eq!(response.provider_errors[0].provider, "snap");
        assert_eq!(response.provider_errors[0].message, "snapd kapalı");
    }
    #[test]
    fn search_results_preserve_successful_hits_and_provider_errors() {
        let app = AppItem {
            id: "formula/example".to_string(),
            provider: "brew".to_string(),
            package_type: Some("formula".to_string()),
            name: "Example".to_string(),
            summary: String::new(),
            developer: String::new(),
            version: "1.0".to_string(),
            icon: None,
            installed: false,
            update_available: false,
            pinned: false,
            channel: None,
            category: None,
            monthly_installs: None,
            hero_image: None,
        };
        let response = search_apps_response([
            ("Flatpak", Err("Flathub timeout".to_string())),
            ("Snap", Ok(Vec::new())),
            ("Homebrew", Ok(vec![app])),
        ])
        .expect("one available provider should preserve the response");

        assert_eq!(response.apps.len(), 1);
        assert_eq!(response.apps[0].provider, "brew");
        assert_eq!(response.provider_errors.len(), 1);
        assert_eq!(response.provider_errors[0].provider, "Flatpak");
    }
}
