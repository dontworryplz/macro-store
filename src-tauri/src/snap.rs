#[cfg(test)]
use serde_json::json;
use serde_json::Value;
use std::collections::HashSet;
use std::io::Read;
use std::path::Path;
use std::process::{Command, ExitStatus, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

const SNAP_FIND_URL: &str = "https://api.snapcraft.io/v2/snaps/find";
const SNAP_INFO_URL: &str = "https://api.snapcraft.io/v2/snaps/info/";
const SNAP_USER_AGENT: &str = "Macro-Store/1.0";
const SNAP_PATH: &str = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin";
const SEARCH_LIMIT: usize = 36;
const MAX_QUERY_CHARS: usize = 100;
const MAX_API_BODY_BYTES: usize = 2 * 1024 * 1024;
const MAX_STDOUT_BYTES: usize = 1024 * 1024;
const MAX_STDERR_BYTES: usize = 64 * 1024;
const MAX_INSTALLED_SNAPS: usize = 2048;
const INSTALLED_CACHE_TTL: Duration = Duration::from_secs(15);
const SEARCH_TIMEOUT: Duration = Duration::from_secs(20);
const VERSION_TIMEOUT: Duration = Duration::from_secs(5);
const LIST_TIMEOUT: Duration = Duration::from_secs(20);
const ACTION_TIMEOUT: Duration = Duration::from_secs(600);

static HTTP_CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
type SnapshotCache = Mutex<Option<(Instant, Arc<SnapSnapshot>)>>;
static SNAPSHOT_CACHE: OnceLock<SnapshotCache> = OnceLock::new();

#[derive(Clone, Debug)]
pub struct ProviderApp {
    pub id: String,
    pub name: String,
    pub summary: String,
    pub developer: String,
    pub version: String,
    pub icon: Option<String>,
    pub installed: bool,
    pub update_available: bool,
    pub category: Option<String>,
    pub package_type: Option<String>,
}

#[derive(Clone, Debug)]
pub struct ProviderDetail {
    pub app: ProviderApp,
    pub description: String,
    pub homepage: Option<String>,
    pub license: String,
}

struct SnapSnapshot {
    apps: Vec<ProviderApp>,
    installed: HashSet<String>,
    updates: HashSet<String>,
}

struct CapturedStream {
    bytes: Vec<u8>,
    truncated: bool,
}

struct CommandOutput {
    status: ExitStatus,
    stdout: String,
    stderr: String,
}

fn http_client() -> Result<&'static reqwest::Client, String> {
    HTTP_CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .timeout(SEARCH_TIMEOUT)
                .user_agent(SNAP_USER_AGENT)
                .build()
                .map_err(|error| format!("Snap Store istemcisi oluşturulamadı: {error}"))
        })
        .as_ref()
        .map_err(Clone::clone)
}

#[cfg(target_os = "linux")]
fn find_snap_command() -> Option<&'static Path> {
    [
        "/usr/bin/snap",
        "/usr/sbin/snap",
        "/bin/snap",
        "/sbin/snap",
        "/usr/local/bin/snap",
        "/snap/bin/snap",
    ]
    .iter()
    .map(|path| Path::new(*path))
    .find(|path| path.is_file())
}

#[cfg(target_os = "linux")]
fn find_pkexec_command() -> Option<&'static Path> {
    ["/usr/bin/pkexec", "/bin/pkexec", "/usr/local/bin/pkexec"]
        .iter()
        .map(|path| Path::new(*path))
        .find(|path| path.is_file())
}

#[cfg(not(target_os = "linux"))]
fn find_pkexec_command() -> Option<&'static Path> {
    None
}

#[cfg(not(target_os = "linux"))]
fn find_snap_command() -> Option<&'static Path> {
    None
}

fn capture_stream<R: Read>(mut reader: R, limit: usize) -> CapturedStream {
    let mut bytes = Vec::with_capacity(limit.min(16 * 1024));
    let mut buffer = [0_u8; 8192];
    let mut truncated = false;

    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => {
                let remaining = limit.saturating_sub(bytes.len());
                let kept = count.min(remaining);
                bytes.extend_from_slice(&buffer[..kept]);
                truncated |= kept < count;
            }
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => break,
        }
    }

    CapturedStream { bytes, truncated }
}

fn join_capture(handle: thread::JoinHandle<CapturedStream>) -> Result<CapturedStream, String> {
    handle
        .join()
        .map_err(|_| "Snap komut çıktısı beklenmedik şekilde kesildi.".to_string())
}

fn run_snap(
    args: &[&str],
    timeout: Duration,
    stable_locale: bool,
    requires_polkit: bool,
) -> Result<CommandOutput, String> {
    let program = find_snap_command()
        .ok_or_else(|| "Snap kullanılamıyor: snap komutu bulunamadı.".to_string())?;
    let mut command = if requires_polkit {
        let pkexec = find_pkexec_command()
            .ok_or_else(|| "Snap işlemleri için Polkit (pkexec) bulunamadı.".to_string())?;
        let mut command = Command::new(pkexec);
        command.arg(program);
        command
    } else {
        Command::new(program)
    };
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env_clear()
        .env("PATH", SNAP_PATH);
    if requires_polkit {
        for key in [
            "HOME",
            "DBUS_SESSION_BUS_ADDRESS",
            "XDG_RUNTIME_DIR",
            "DISPLAY",
            "WAYLAND_DISPLAY",
            "XAUTHORITY",
        ] {
            if let Some(value) = std::env::var_os(key) {
                command.env(key, value);
            }
        }
    }
    if stable_locale {
        command
            .env("LC_ALL", "C")
            .env("LANG", "C")
            .env("LANGUAGE", "C");
    } else {
        for key in ["LANG", "LC_MESSAGES"] {
            if let Some(value) = std::env::var_os(key) {
                command.env(key, value);
            }
        }
        if let Some(value) = std::env::var_os("LC_ALL") {
            command.env("LC_MESSAGES", value);
        }
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("Snap komutu başlatılamadı: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Snap komut çıktısı yakalanamadı.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Snap komut hata çıktısı yakalanamadı.".to_string())?;
    let stdout_reader = thread::spawn(move || capture_stream(stdout, MAX_STDOUT_BYTES));
    let stderr_reader = thread::spawn(move || capture_stream(stderr, MAX_STDERR_BYTES));

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() < timeout => {
                thread::sleep(Duration::from_millis(25));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = join_capture(stdout_reader);
                let _ = join_capture(stderr_reader);
                return Err(format!(
                    "Snap komutu {} saniyede tamamlanmadı.",
                    timeout.as_secs()
                ));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = join_capture(stdout_reader);
                let _ = join_capture(stderr_reader);
                return Err(format!("Snap komutu beklenirken hata oluştu: {error}"));
            }
        }
    };

    let stdout = join_capture(stdout_reader)?;
    let stderr = join_capture(stderr_reader)?;
    if stdout.truncated || stderr.truncated {
        return Err("Snap komut çıktısı boyut sınırını aştı.".to_string());
    }

    Ok(CommandOutput {
        status,
        stdout: String::from_utf8_lossy(&stdout.bytes).into_owned(),
        stderr: String::from_utf8_lossy(&stderr.bytes).into_owned(),
    })
}

fn last_output_line(output: &CommandOutput) -> Option<&str> {
    output
        .stderr
        .lines()
        .chain(output.stdout.lines())
        .map(str::trim)
        .rev()
        .find(|line| !line.is_empty())
}

fn command_failure(context: &str, output: &CommandOutput) -> String {
    let detail = last_output_line(output).unwrap_or("bilinmeyen hata");
    format!(
        "{context} komutu başarısız oldu: {}",
        truncate_text(detail, 400)
    )
}

fn truncate_text(value: &str, max_chars: usize) -> String {
    if max_chars == 0 {
        return String::new();
    }
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut chars = normalized.chars();
    let excerpt: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_none() {
        return normalized;
    }

    let keep = max_chars.saturating_sub(1);
    let mut excerpt: String = excerpt.chars().take(keep).collect();
    if let Some(boundary) = excerpt.rfind(' ') {
        if boundary >= keep.saturating_mul(3) / 4 {
            excerpt.truncate(boundary);
        }
    }
    excerpt.push('…');
    excerpt
}

fn valid_snap_token(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.as_bytes()[0].is_ascii_alphanumeric()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'+' | b'-'))
}

fn clean_field(value: Option<&Value>, max_chars: usize) -> String {
    value
        .and_then(Value::as_str)
        .map(|value| truncate_text(value.trim(), max_chars))
        .unwrap_or_default()
}

fn publisher_name(snap: &Value) -> String {
    let Some(publisher) = snap.get("publisher") else {
        return String::new();
    };
    if let Some(name) = publisher.as_str() {
        return truncate_text(name.trim(), 120);
    }
    clean_field(
        publisher
            .get("display-name")
            .or_else(|| publisher.get("username")),
        120,
    )
}

fn safe_https_host(url: &str, allow_default_port: bool) -> Option<&str> {
    if url
        .chars()
        .any(|character| character.is_control() || character.is_whitespace() || character == '\\')
    {
        return None;
    }
    let authority = url
        .strip_prefix("https://")?
        .split(['/', '?', '#'])
        .next()?;
    if authority.is_empty() || authority.contains('@') {
        return None;
    }

    let host = match authority.rsplit_once(':') {
        Some((host, "443")) if allow_default_port => host,
        Some(_) => return None,
        None => authority,
    };
    if host.is_empty()
        || host.starts_with('.')
        || host.ends_with('.')
        || !host
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-'))
    {
        return None;
    }
    Some(host)
}

fn safe_icon_url(value: Option<&Value>) -> Option<String> {
    let raw = value?.as_str()?.trim();
    if raw.len() > 4096 {
        return None;
    }
    let host = safe_https_host(raw, false)?;
    (host.eq_ignore_ascii_case("snapcraft.io")
        || (host.len() > ".snapcraft.io".len()
            && host[host.len() - ".snapcraft.io".len()..].eq_ignore_ascii_case(".snapcraft.io")))
    .then(|| raw.to_string())
}

fn snap_icon(snap: &Value) -> Option<String> {
    if let Some(media) = snap.get("media").and_then(Value::as_array) {
        for entry in media {
            if entry
                .get("type")
                .and_then(Value::as_str)
                .is_some_and(|kind| kind.eq_ignore_ascii_case("icon"))
            {
                if let Some(icon) = safe_icon_url(entry.get("url")) {
                    return Some(icon);
                }
            }
        }
    }
    safe_icon_url(snap.get("icon"))
}

fn category_name(snap: &Value) -> Option<String> {
    snap.get("categories")
        .and_then(Value::as_array)?
        .iter()
        .find_map(|category| {
            let name = category
                .as_str()
                .or_else(|| category.get("name").and_then(Value::as_str))?;
            let name = truncate_text(name.trim(), 80);
            (!name.is_empty()).then_some(name)
        })
}

fn find_snap(value: &Value) -> Option<&Value> {
    let root = value.get("snap").or_else(|| value.get("result"))?;
    root.get("snap").or_else(|| root.as_object().map(|_| root))
}

fn search_app(snap: &Value, state: &SnapSnapshot) -> Option<ProviderApp> {
    let id = snap
        .get("name")
        .and_then(Value::as_str)
        .or_else(|| snap.get("snap-id").and_then(Value::as_str))?
        .trim();
    if !valid_snap_token(id) {
        return None;
    }
    if snap
        .get("confinement")
        .and_then(Value::as_str)
        .is_some_and(|confinement| !confinement.eq_ignore_ascii_case("strict"))
    {
        return None;
    }

    let name = snap
        .get("title")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .or_else(|| snap.get("name").and_then(Value::as_str))
        .unwrap_or(id);
    let summary = snap
        .get("summary")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .or_else(|| snap.get("description").and_then(Value::as_str));
    let installed = state.installed.contains(id);

    Some(ProviderApp {
        id: id.to_string(),
        name: truncate_text(name.trim(), 120),
        summary: summary
            .map(|value| truncate_text(value.trim(), 280))
            .unwrap_or_default(),
        developer: publisher_name(snap),
        version: clean_field(snap.get("version"), 100),
        icon: snap_icon(snap),
        installed,
        update_available: installed && state.updates.contains(id),
        category: category_name(snap),
        package_type: Some("snap".to_string()),
    })
}

fn parse_revision(value: &str, allow_local: bool) -> bool {
    value.bytes().all(|byte| byte.is_ascii_digit())
        || (allow_local
            && value.strip_prefix('x').is_some_and(|revision| {
                !revision.is_empty() && revision.bytes().all(|b| b.is_ascii_digit())
            }))
}

fn parse_installed_rows(output: &str) -> Result<Vec<ProviderApp>, String> {
    let mut apps = Vec::new();
    let mut seen = HashSet::new();
    let mut header_seen = false;
    for line in output.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() >= 4
            && fields[0].eq_ignore_ascii_case("name")
            && fields[1].eq_ignore_ascii_case("version")
            && fields[2].eq_ignore_ascii_case("rev")
            && fields[3].eq_ignore_ascii_case("tracking")
        {
            header_seen = true;
            continue;
        }
        if !header_seen || fields.len() < 4 {
            continue;
        }
        let id = fields[0];
        if !valid_snap_token(id)
            || !parse_revision(fields[2], true)
            || fields[1].chars().any(char::is_control)
        {
            continue;
        }
        if !seen.insert(id.to_string()) {
            continue;
        }
        if apps.len() == MAX_INSTALLED_SNAPS {
            return Err("Yüklü Snap sayısı sonuç sınırını aştı.".to_string());
        }

        apps.push(ProviderApp {
            id: id.to_string(),
            name: id.to_string(),
            summary: String::new(),
            developer: fields
                .get(4)
                .map(|value| truncate_text(value, 120))
                .unwrap_or_default(),
            version: truncate_text(fields[1], 100),
            icon: None,
            installed: true,
            update_available: false,
            category: None,
            package_type: Some("snap".to_string()),
        });
    }
    if !header_seen
        && !output
            .lines()
            .any(|line| line.trim().starts_with("No snaps are installed yet"))
    {
        return Err("snap list çıktısı beklenen tablo biçiminde değil.".to_string());
    }
    Ok(apps)
}

fn valid_snap_size(size: &str) -> bool {
    if size == "-" {
        return true;
    }
    let bytes = size.as_bytes();
    if bytes.last() != Some(&b'B') {
        return false;
    }

    let mut number_end = bytes.len() - 1;
    if number_end > 0
        && matches!(
            bytes[number_end - 1],
            b'k' | b'K' | b'M' | b'G' | b'T' | b'P'
        )
    {
        number_end -= 1;
    }
    if number_end == 0 {
        return false;
    }
    let mut decimal_point = false;
    bytes[..number_end].iter().all(|byte| {
        if *byte == b'.' && !decimal_point {
            decimal_point = true;
            true
        } else {
            byte.is_ascii_digit()
        }
    })
}

fn parse_update_rows(output: &str) -> Result<HashSet<String>, String> {
    let mut updates = HashSet::new();
    let mut header_seen = false;
    for line in output.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() >= 4
            && fields[0].eq_ignore_ascii_case("name")
            && fields[1].eq_ignore_ascii_case("version")
            && fields[2].eq_ignore_ascii_case("rev")
            && fields[3].eq_ignore_ascii_case("size")
        {
            header_seen = true;
            continue;
        }
        if !header_seen || fields.len() < 4 {
            continue;
        }
        let id = fields[0];
        let valid_size = valid_snap_size(fields[3]);
        if valid_snap_token(id) && parse_revision(fields[2], false) && valid_size {
            updates.insert(id.to_string());
            if updates.len() > MAX_INSTALLED_SNAPS {
                return Err("Snap güncelleme listesi sonuç sınırını aştı.".to_string());
            }
        }
    }
    let no_updates = output.lines().any(|line| {
        matches!(
            line.trim(),
            "All snaps up to date." | "All snaps are up to date."
        )
    });
    if !header_seen && !no_updates {
        return Err("snap refresh --list çıktısı beklenen tablo biçiminde değil.".to_string());
    }
    Ok(updates)
}

fn read_snapshot() -> Result<SnapSnapshot, String> {
    let installed_output = run_snap(&["list"], LIST_TIMEOUT, true, false)?;
    if !installed_output.status.success() {
        return Err(format!(
            "Yüklü Snap paketleri okunamadı; snapd çalışmıyor olabilir. {}",
            command_failure("snap list", &installed_output)
        ));
    }
    let mut apps = parse_installed_rows(&installed_output.stdout)?;

    let update_output = run_snap(&["refresh", "--list"], LIST_TIMEOUT, true, false)?;
    if !update_output.status.success() {
        return Err(format!(
            "Snap güncelleme durumu okunamadı. {}",
            command_failure("snap refresh --list", &update_output)
        ));
    }
    let updates = parse_update_rows(&update_output.stdout)?;
    let installed: HashSet<String> = apps.iter().map(|app| app.id.clone()).collect();
    for app in &mut apps {
        app.update_available = updates.contains(&app.id);
    }

    Ok(SnapSnapshot {
        apps,
        installed,
        updates,
    })
}

fn empty_snapshot() -> SnapSnapshot {
    SnapSnapshot {
        apps: Vec::new(),
        installed: HashSet::new(),
        updates: HashSet::new(),
    }
}

fn snapshot() -> Result<Arc<SnapSnapshot>, String> {
    let cache = SNAPSHOT_CACHE.get_or_init(|| Mutex::new(None));
    let mut cache = cache
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some((cached_at, cached)) = cache.as_ref() {
        if cached_at.elapsed() < INSTALLED_CACHE_TTL {
            return Ok(Arc::clone(cached));
        }
    }

    let refreshed = Arc::new(read_snapshot()?);
    *cache = Some((Instant::now(), Arc::clone(&refreshed)));
    Ok(refreshed)
}

fn invalidate_snapshot() {
    if let Some(cache) = SNAPSHOT_CACHE.get() {
        let mut cache = cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *cache = None;
    }
}

async fn response_json(response: reqwest::Response, context: &str) -> Result<Value, String> {
    if !response.status().is_success() {
        return Err(format!(
            "{context} HTTP {} hatası verdi.",
            response.status().as_u16()
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_API_BODY_BYTES as u64)
    {
        return Err(format!("{context} yanıtı boyut sınırını aştı."));
    }
    let mut response = response;
    let mut body = Vec::new();
    loop {
        let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("{context} yanıtı okunamadı: {error}"))?
        else {
            break;
        };
        if body.len().saturating_add(chunk.len()) > MAX_API_BODY_BYTES {
            return Err(format!("{context} yanıtı boyut sınırını aştı."));
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body)
        .map_err(|error| format!("{context} yanıtı çözümlenemedi: {error}"))
}

fn api_request(client: &reqwest::Client, url: &str) -> reqwest::RequestBuilder {
    client
        .get(url)
        .header("Accept", "application/json")
        .header("Snap-Device-Series", "16")
        .header("Snap-Device-Store", "ubuntu")
}

pub async fn search(query: &str) -> Result<Vec<ProviderApp>, String> {
    if query.chars().take(MAX_QUERY_CHARS + 1).count() > MAX_QUERY_CHARS {
        return Err("Snap arama sorgusu en fazla 100 karakter olabilir.".to_string());
    }
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let state = tokio::task::spawn_blocking(snapshot)
        .await
        .map_err(|error| format!("Snap envanteri okunamadı: {error}"))?
        .unwrap_or_else(|_| Arc::new(empty_snapshot()));
    let response = api_request(http_client()?, SNAP_FIND_URL)
        .query(&[("q", query), ("scope", "wide"), ("confinement", "strict")])
        .timeout(SEARCH_TIMEOUT)
        .send()
        .await
        .map_err(|error| format!("Snap Store'a ulaşılamadı: {error}"))?;
    let payload = response_json(response, "Snap Store araması").await?;
    let results = payload
        .get("result")
        .and_then(Value::as_array)
        .ok_or_else(|| "Snap Store yanıtında arama sonucu bulunamadı.".to_string())?;

    Ok(results
        .iter()
        .filter_map(|entry| entry.get("snap"))
        .filter_map(|snap| search_app(snap, &state))
        .take(SEARCH_LIMIT)
        .collect())
}

pub fn installed() -> Result<Vec<ProviderApp>, String> {
    Ok(snapshot()?.apps.clone())
}

fn safe_homepage(value: Option<&Value>) -> Option<String> {
    let raw = value?.as_str()?.trim();
    if raw.len() > 2048 {
        return None;
    }
    let host = safe_https_host(raw, true)?;
    (!host.is_empty()).then(|| raw.to_string())
}

fn license_text(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(license)) => truncate_text(license.trim(), 200),
        Some(Value::Array(licenses)) => {
            let joined = licenses
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|license| !license.is_empty())
                .collect::<Vec<_>>()
                .join(", ");
            truncate_text(&joined, 200)
        }
        _ => String::new(),
    }
}

async fn with_snap_info<T>(
    id: &str,
    context: &str,
    inspect: impl FnOnce(&Value) -> Result<T, String>,
) -> Result<T, String> {
    let url = format!("{SNAP_INFO_URL}{id}");
    let response = api_request(http_client()?, &url)
        .send()
        .await
        .map_err(|error| format!("Snap Store uygulama bilgilerine ulaşılamadı: {error}"))?;
    let payload = response_json(response, context).await?;
    let snap = find_snap(&payload)
        .ok_or_else(|| "Snap Store yanıtında uygulama bilgisi bulunamadı.".to_string())?;
    inspect(snap)
}

pub async fn detail(id: &str) -> Result<ProviderDetail, String> {
    if !valid_snap_token(id) {
        return Err("Snap adı veya kimliği geçersiz.".to_string());
    }
    let state = tokio::task::spawn_blocking(snapshot)
        .await
        .map_err(|error| format!("Snap envanteri okunamadı: {error}"))?
        .unwrap_or_else(|_| Arc::new(empty_snapshot()));
    with_snap_info(id, "Snap Store uygulama ayrıntıları", |snap| {
        let app = search_app(snap, &state)
            .ok_or_else(|| "Snap Store uygulama kimliği geçersiz.".to_string())?;
        Ok(ProviderDetail {
            app,
            description: clean_field(snap.get("description"), 20_000),
            homepage: safe_homepage(snap.get("website")),
            license: license_text(snap.get("license")),
        })
    })
    .await
}

fn require_strict_confinement(snap: &Value) -> Result<(), String> {
    match snap.get("confinement").and_then(Value::as_str) {
        Some(confinement) if confinement.eq_ignore_ascii_case("strict") => Ok(()),
        Some(confinement) => Err(format!(
            "Snap strict confinement kullanmıyor ({confinement}); açık kullanıcı onayı olmadığı için işlem engellendi."
        )),
        None => Err(
            "Snap confinement bilgisi doğrulanamadı; işlem güvenlik nedeniyle engellendi."
                .to_string(),
        ),
    }
}

pub async fn action(id: &str, action: &str) -> Result<String, String> {
    if !valid_snap_token(id) {
        return Err("Snap adı veya kimliği geçersiz.".to_string());
    }
    let (verb, success) = match action {
        "install" => ("install", "kuruldu"),
        "remove" => ("remove", "kaldırıldı"),
        "update" => ("refresh", "güncellendi"),
        _ => return Err("Desteklenmeyen Snap işlemi.".to_string()),
    };
    if action == "install" || action == "update" {
        with_snap_info(
            id,
            "Snap Store güvenlik bilgisi",
            require_strict_confinement,
        )
        .await?;
    }

    let id = id.to_string();
    tokio::task::spawn_blocking(move || {
        let result = run_snap(&[verb, &id], ACTION_TIMEOUT, false, true);
        invalidate_snapshot();
        let output = result?;
        if !output.status.success() {
            return Err(command_failure(&format!("snap {verb} {id}"), &output));
        }
        Ok(format!("Snap {id} başarıyla {success}."))
    })
    .await
    .map_err(|error| format!("Snap işlemi başlatılamadı: {error}"))?
}

fn usable_version_output(output: &str) -> bool {
    let mut snap_version = false;
    let mut daemon_version = false;
    for line in output.lines() {
        let mut fields = line.split_whitespace();
        match (fields.next(), fields.next()) {
            (Some("snap"), Some(version))
                if version
                    .as_bytes()
                    .first()
                    .is_some_and(|byte| byte.is_ascii_digit()) =>
            {
                snap_version = true;
            }
            (Some("snapd"), Some(version))
                if version
                    .as_bytes()
                    .first()
                    .is_some_and(|byte| byte.is_ascii_digit()) =>
            {
                daemon_version = true;
            }
            _ => {}
        }
    }
    snap_version && daemon_version
}

pub fn available() -> bool {
    run_snap(&["version"], VERSION_TIMEOUT, true, false)
        .map(|output| output.status.success() && usable_version_output(&output.stdout))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snap_tokens_reject_options_paths_and_controls() {
        for name in ["firefox", "hello-world", "org.example.App"] {
            assert!(valid_snap_token(name));
        }
        for name in ["-danger", "snap/name", "hello world", "hello\nworld", ""] {
            assert!(!valid_snap_token(name));
        }
    }

    #[test]
    fn installed_rows_require_the_expected_table_and_map_versions() {
        let apps = parse_installed_rows(
            "Name Version Rev Tracking Publisher Notes\nfirefox 128.0 5432 latest/stable mozilla✓ -\n",
        )
        .expect("Snap table should parse");
        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].id, "firefox");
        assert_eq!(apps[0].version, "128.0");
        assert!(apps[0].installed);
        assert!(parse_installed_rows("unexpected output").is_err());
    }

    #[test]
    fn snap_changes_require_verified_strict_confinement() {
        assert!(require_strict_confinement(&json!({"confinement": "strict"})).is_ok());
        assert!(require_strict_confinement(&json!({"confinement": "classic"})).is_err());
        assert!(require_strict_confinement(&json!({})).is_err());
    }

    #[test]
    fn snap_icons_accept_only_snapcraft_https_urls() {
        let trusted = json!("https://dashboard.snapcraft.io/site_media/appmedia/icon.png");
        let untrusted = json!("https://example.invalid/icon.png");
        assert!(safe_icon_url(Some(&trusted)).is_some());
        assert!(safe_icon_url(Some(&untrusted)).is_none());
        assert!(safe_icon_url(Some(&json!("http://snapcraft.io/icon.png"))).is_none());
    }
}
