#[cfg(test)]
use serde_json::json;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::env;
use std::io::Read;
#[cfg(target_os = "linux")]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tokio::task;

const SEARCH_TIMEOUT: Duration = Duration::from_secs(40);
const INFO_TIMEOUT: Duration = Duration::from_secs(45);
const ACTION_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const SEARCH_OUTPUT_LIMIT: usize = 512 * 1024;
const JSON_OUTPUT_LIMIT: usize = 4 * 1024 * 1024;
const ACTION_OUTPUT_LIMIT: usize = 512 * 1024;
const MAX_QUERY_CHARS: usize = 200;
const MAX_SEARCH_PER_KIND: usize = 25;
const MAX_SEARCH_RESULTS: usize = 50;
const MAX_INSTALLED_PER_KIND: usize = 500;
const MAX_INSTALLED_RESULTS: usize = 1_000;

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
    pub pinned: bool,
    pub category: Option<String>,
    pub package_type: Option<String>,
}

type InstalledCache = Mutex<Option<(Instant, Arc<Vec<ProviderApp>>)>>;
static INSTALLED_CACHE: OnceLock<InstalledCache> = OnceLock::new();
const INVENTORY_CACHE_TTL: Duration = Duration::from_secs(15);

pub struct ProviderDetail {
    pub app: ProviderApp,
    pub description: String,
    pub homepage: Option<String>,
    pub license: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PackageKind {
    Formula,
    Cask,
}

impl PackageKind {
    fn id_prefix(self) -> &'static str {
        match self {
            Self::Formula => "formula/",
            Self::Cask => "cask/",
        }
    }

    fn type_name(self) -> &'static str {
        match self {
            Self::Formula => "formula",
            Self::Cask => "cask",
        }
    }

    fn search_flag(self) -> &'static str {
        match self {
            Self::Formula => "--formula",
            Self::Cask => "--cask",
        }
    }

    fn info_flag(self) -> &'static str {
        self.search_flag()
    }

    fn json_key(self) -> &'static str {
        match self {
            Self::Formula => "formulae",
            Self::Cask => "casks",
        }
    }
}

struct CapturedStream {
    bytes: Vec<u8>,
    truncated: bool,
}

struct CommandOutput {
    success: bool,
    timed_out: bool,
    stdout: String,
    stderr: String,
    output_truncated: bool,
}

fn linuxbrew_prefixes() -> Vec<PathBuf> {
    let mut prefixes = vec![
        PathBuf::from("/home/linuxbrew/.linuxbrew"),
        PathBuf::from("/linuxbrew"),
        PathBuf::from("/usr/local"),
    ];
    if let Some(home) = env::var_os("HOME") {
        prefixes.push(PathBuf::from(home).join(".linuxbrew"));
    }
    prefixes
}

fn is_executable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(target_os = "linux")]
    {
        path.metadata()
            .map(|metadata| metadata.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

fn brew_path() -> Option<PathBuf> {
    if !cfg!(target_os = "linux") {
        return None;
    }

    if let Some(path) = env::var_os("PATH") {
        for directory in env::split_paths(&path).filter(|item| !item.as_os_str().is_empty()) {
            let candidate = directory.join("brew");
            if is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }

    for prefix in linuxbrew_prefixes() {
        for directory in ["bin", "sbin"] {
            let candidate = prefix.join(directory).join("brew");
            if is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

fn subprocess_path(brew: &Path) -> Result<std::ffi::OsString, String> {
    let mut prefixes = linuxbrew_prefixes();
    if let Some(bin_dir) = brew.parent() {
        if matches!(
            bin_dir.file_name().and_then(|name| name.to_str()),
            Some("bin" | "sbin")
        ) {
            if let Some(prefix) = bin_dir.parent() {
                prefixes.insert(0, prefix.to_path_buf());
            }
        }
    }

    let mut directories = Vec::new();
    let mut seen = HashSet::new();
    for prefix in prefixes {
        for directory in ["bin", "sbin"] {
            let path = prefix.join(directory);
            if seen.insert(path.clone()) {
                directories.push(path);
            }
        }
    }
    if let Some(path) = env::var_os("PATH") {
        for directory in env::split_paths(&path).filter(|item| !item.as_os_str().is_empty()) {
            if seen.insert(directory.clone()) {
                directories.push(directory);
            }
        }
    }
    env::join_paths(directories).map_err(|_| "Homebrew için PATH oluşturulamadı.".to_string())
}

fn capture_stream<R: Read>(mut stream: R, limit: usize) -> CapturedStream {
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 8 * 1024];
    let mut truncated = false;
    loop {
        match stream.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(read) => {
                let remaining = limit.saturating_sub(bytes.len());
                let keep = remaining.min(read);
                bytes.extend_from_slice(&buffer[..keep]);
                truncated |= keep < read;
            }
        }
    }
    CapturedStream { bytes, truncated }
}

fn run_brew(
    args: &[String],
    timeout: Duration,
    output_limit: usize,
) -> Result<CommandOutput, String> {
    let brew = brew_path().ok_or_else(|| {
        "Homebrew komutu bulunamadı; PATH'i ve Linuxbrew öneklerini kontrol edin.".to_string()
    })?;
    let path = subprocess_path(&brew)?;
    let mut command = Command::new(&brew);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PATH", path)
        .env("LC_ALL", "C")
        .env("LANG", "C")
        .env("LANGUAGE", "C")
        .env("HOMEBREW_NO_AUTO_UPDATE", "1");
    for name in super::SANITIZED_ENV {
        command.env_remove(name);
    }
    for (key, _) in env::vars_os() {
        if key.to_str().is_some_and(|name| name.starts_with("LD_")) {
            command.env_remove(key);
        }
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("Homebrew başlatılamadı: {error}"))?;
    let stdout = child.stdout.take().ok_or_else(|| {
        let _ = child.kill();
        let _ = child.wait();
        "Homebrew standart çıktısı açılamadı.".to_string()
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        let _ = child.kill();
        let _ = child.wait();
        "Homebrew hata çıktısı açılamadı.".to_string()
    })?;
    let stdout_reader = thread::spawn(move || capture_stream(stdout, output_limit));
    let stderr_reader = thread::spawn(move || capture_stream(stderr, output_limit));

    let started = Instant::now();
    let mut timed_out = false;
    let mut wait_error = None;
    let success = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.success(),
            Ok(None) if started.elapsed() < timeout => thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                timed_out = true;
                let _ = child.kill();
                let _ = child.wait();
                break false;
            }
            Err(error) => {
                wait_error = Some(error.to_string());
                let _ = child.kill();
                let _ = child.wait();
                break false;
            }
        }
    };

    let stdout = stdout_reader
        .join()
        .map_err(|_| "Homebrew standart çıktısı okunamadı.".to_string())?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| "Homebrew hata çıktısı okunamadı.".to_string())?;
    if let Some(error) = wait_error {
        return Err(format!("Homebrew işlemi izlenemedi: {error}"));
    }

    Ok(CommandOutput {
        success,
        timed_out,
        output_truncated: stdout.truncated || stderr.truncated,
        stdout: String::from_utf8_lossy(&stdout.bytes).into_owned(),
        stderr: String::from_utf8_lossy(&stderr.bytes).into_owned(),
    })
}

fn command_failure(label: &str, output: &CommandOutput) -> String {
    if output.timed_out {
        return format!("Homebrew {label} komutu zaman aşımına uğradı.");
    }
    let detail = output
        .stdout
        .lines()
        .chain(output.stderr.lines())
        .map(str::trim)
        .rfind(|line| !line.is_empty())
        .unwrap_or("ayrıntı verilmedi");
    format!("Homebrew {label} başarısız oldu: {}", truncate(detail, 400))
}

fn json_output(label: &str, output: &CommandOutput) -> Result<Value, String> {
    if output.timed_out {
        return Err(command_failure(label, output));
    }
    if !output.success {
        return Err(command_failure(label, output));
    }
    if output.output_truncated {
        return Err(format!("Homebrew {label} çıktısı boyut sınırını aştı."));
    }
    serde_json::from_str(&output.stdout)
        .map_err(|error| format!("Homebrew {label} JSON çıktısı okunamadı: {error}"))
}

fn truncate(text: &str, max_chars: usize) -> String {
    let mut chars = text.chars();
    let prefix: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{prefix}…")
    } else {
        prefix
    }
}

fn valid_package_token(token: &str) -> bool {
    if token.is_empty() || token.len() > 255 || token.starts_with('-') || token.starts_with('/') {
        return false;
    }
    token.split('/').all(|part| {
        !part.is_empty()
            && !part.starts_with('-')
            && part != "."
            && part != ".."
            && part
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"@+_.-".contains(&byte))
    })
}

fn parse_id(id: &str) -> Result<(PackageKind, &str), String> {
    let (kind, token) = if let Some(token) = id.strip_prefix("formula/") {
        (PackageKind::Formula, token)
    } else if let Some(token) = id.strip_prefix("cask/") {
        (PackageKind::Cask, token)
    } else {
        return Err("Homebrew paket kimliği geçersiz.".to_string());
    };
    if !valid_package_token(token) {
        return Err("Homebrew paket kimliği geçersiz.".to_string());
    }
    Ok((kind, token))
}

fn search_fallback_term(query: &str) -> String {
    if !query.starts_with('-') {
        return query.to_string();
    }
    let mut escaped = String::with_capacity(query.len() + 2);
    for character in query.chars() {
        if "\\.^$|?*+()[]{}".contains(character) || character == '/' {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    format!("/{escaped}/")
}

fn is_search_syntax_error(output: &CommandOutput) -> bool {
    let message = format!("{}\n{}", output.stderr, output.stdout).to_ascii_lowercase();
    [
        "unknown option",
        "unrecognized option",
        "invalid option",
        "unknown flag",
        "no such option",
        "usage:",
    ]
    .iter()
    .any(|needle| message.contains(needle))
}

fn search_names(query: &str, kind: PackageKind) -> Result<Vec<String>, String> {
    let label = format!("search {}", kind.type_name());
    let args = vec![
        "search".to_string(),
        kind.search_flag().to_string(),
        "--".to_string(),
        query.to_string(),
    ];
    let output = run_brew(&args, SEARCH_TIMEOUT, SEARCH_OUTPUT_LIMIT)?;
    if output.success {
        return Ok(parse_search_output(&output.stdout));
    }
    if !is_search_syntax_error(&output) {
        return Err(command_failure(&label, &output));
    }

    let args = vec![
        "search".to_string(),
        kind.search_flag().to_string(),
        search_fallback_term(query),
    ];
    let output = run_brew(&args, SEARCH_TIMEOUT, SEARCH_OUTPUT_LIMIT)?;
    if output.success {
        Ok(parse_search_output(&output.stdout))
    } else {
        Err(command_failure(&label, &output))
    }
}

fn parse_search_output(text: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut seen = HashSet::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty()
            || line.starts_with("==>")
            || line.starts_with("Warning:")
            || line.starts_with("Error:")
            || line.starts_with("No formula")
            || line.starts_with("No cask")
        {
            continue;
        }
        for token in line.split_whitespace() {
            if valid_package_token(token) && seen.insert(token.to_string()) {
                names.push(token.to_string());
                if names.len() == MAX_SEARCH_PER_KIND {
                    return names;
                }
            }
        }
    }
    names
}

fn info_records(value: &Value, kind: PackageKind) -> Vec<&Value> {
    value
        .get(kind.json_key())
        .and_then(Value::as_array)
        .map(|records| records.iter().collect())
        .or_else(|| value.as_array().map(|records| records.iter().collect()))
        .unwrap_or_default()
}

fn record_matches(record: &Value, requested_name: &str) -> bool {
    for key in ["name", "full_name", "token"] {
        if record.get(key).and_then(Value::as_str) == Some(requested_name) {
            return true;
        }
    }
    ["aliases", "oldnames"].iter().any(|key| {
        record
            .get(key)
            .and_then(Value::as_array)
            .is_some_and(|names| {
                names
                    .iter()
                    .any(|name| name.as_str() == Some(requested_name))
            })
    })
}

fn find_record<'a>(records: &[&'a Value], requested_name: &str) -> Option<&'a Value> {
    records
        .iter()
        .copied()
        .find(|record| record_matches(record, requested_name))
}

fn field_string<'a>(record: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| record.get(*key).and_then(Value::as_str))
        .filter(|value| !value.trim().is_empty())
}

fn has_installed_version(record: &Value) -> Option<bool> {
    let installed = record
        .get("installed")
        .or_else(|| record.get("installed_versions"))?;
    Some(match installed {
        Value::Array(values) => !values.is_empty(),
        Value::String(value) => !value.trim().is_empty(),
        Value::Bool(value) => *value,
        Value::Object(values) => !values.is_empty(),
        Value::Number(value) => value.as_u64().unwrap_or(0) > 0,
        Value::Null => false,
    })
}

fn installed_version(record: &Value) -> Option<String> {
    let installed = record
        .get("installed")
        .or_else(|| record.get("installed_versions"));
    match installed {
        Some(Value::Array(values)) => values
            .iter()
            .find_map(|value| field_string(value, &["version"]))
            .map(str::to_string),
        Some(Value::String(value)) if !value.trim().is_empty() => Some(value.trim().to_string()),
        Some(Value::Object(value)) => value
            .get("version")
            .and_then(Value::as_str)
            .map(str::to_string),
        _ => None,
    }
}

fn package_version(record: &Value, kind: PackageKind, use_installed: bool) -> String {
    if use_installed {
        if let Some(version) = installed_version(record) {
            return truncate(&version, 100);
        }
    }
    let version = if kind == PackageKind::Formula {
        record
            .get("versions")
            .and_then(|versions| versions.get("stable"))
            .and_then(Value::as_str)
            .or_else(|| field_string(record, &["version"]))
    } else {
        field_string(record, &["version"])
    };
    version
        .map(|value| truncate(value, 100))
        .unwrap_or_default()
}

fn package_name(record: Option<&Value>, fallback: &str) -> String {
    record
        .and_then(|value| field_string(value, &["name", "token", "full_name"]))
        .map(|name| truncate(name, 200))
        .unwrap_or_else(|| truncate(fallback, 200))
}

fn build_app(
    record: Option<&Value>,
    kind: PackageKind,
    token: &str,
    assume_installed: bool,
    update_available: bool,
) -> ProviderApp {
    let installed = record
        .and_then(has_installed_version)
        .unwrap_or(assume_installed);
    let summary = record
        .and_then(|value| field_string(value, &["desc", "description"]))
        .map(|text| truncate(text, 500))
        .unwrap_or_default();
    ProviderApp {
        id: format!("{}{token}", kind.id_prefix()),
        name: record.map_or_else(
            || truncate(token, 200),
            |value| package_name(Some(value), token),
        ),
        summary,
        developer: String::new(),
        version: record
            .map(|value| package_version(value, kind, assume_installed))
            .unwrap_or_default(),
        icon: None,
        installed,
        pinned: record
            .and_then(|value| value.get("pinned"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        update_available: installed && update_available,
        category: None,
        package_type: Some(kind.type_name().to_string()),
    }
}

fn named_info(names: &[String], kind: PackageKind) -> Result<Value, String> {
    if names.is_empty() {
        return Ok(Value::Null);
    }
    let mut args = vec![
        "info".to_string(),
        "--json=v2".to_string(),
        kind.info_flag().to_string(),
        "--".to_string(),
    ];
    args.extend(names.iter().cloned());
    let output = run_brew(&args, INFO_TIMEOUT, JSON_OUTPUT_LIMIT)?;
    json_output(&format!("info {}", kind.type_name()), &output)
}

fn search_sync(query: &str) -> Result<Vec<ProviderApp>, String> {
    let formulas = search_names(query, PackageKind::Formula);
    let casks = search_names(query, PackageKind::Cask);
    let (formulas, casks) = match (formulas, casks) {
        (Ok(formulas), Ok(casks)) => (formulas, casks),
        (Ok(formulas), Err(_)) => (formulas, Vec::new()),
        (Err(_), Ok(casks)) => (Vec::new(), casks),
        (Err(formula_error), Err(cask_error)) => {
            return Err(format!("{formula_error}; {cask_error}"));
        }
    };

    let formulas: Vec<String> = formulas.into_iter().take(MAX_SEARCH_PER_KIND).collect();
    let casks: Vec<String> = casks.into_iter().take(MAX_SEARCH_PER_KIND).collect();
    let formula_info = named_info(&formulas, PackageKind::Formula).ok();
    let cask_info = named_info(&casks, PackageKind::Cask).ok();
    let formula_records = formula_info
        .as_ref()
        .map(|value| info_records(value, PackageKind::Formula))
        .unwrap_or_default();
    let cask_records = cask_info
        .as_ref()
        .map(|value| info_records(value, PackageKind::Cask))
        .unwrap_or_default();

    let mut apps = Vec::with_capacity(MAX_SEARCH_RESULTS);
    for token in formulas {
        let record = find_record(&formula_records, &token);
        apps.push(build_app(
            record,
            PackageKind::Formula,
            &token,
            false,
            false,
        ));
        if apps.len() == MAX_SEARCH_RESULTS {
            break;
        }
    }
    for token in casks {
        let Some(record) = find_record(&cask_records, &token) else {
            continue;
        };
        if !linux_cask_supported(record) {
            continue;
        }
        apps.push(build_app(
            Some(record),
            PackageKind::Cask,
            &token,
            false,
            false,
        ));
        if apps.len() == MAX_SEARCH_RESULTS {
            break;
        }
    }
    if let Ok(installed) = installed_cached() {
        apply_installed_status(&mut apps, &installed);
    }
    Ok(apps)
}

fn is_enabled(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        _ => true,
    }
}

fn has_linux_artifact(value: &Value) -> bool {
    match value {
        Value::Object(fields) => fields.iter().any(|(key, value)| {
            let key_lower = key.to_ascii_lowercase();
            ((key_lower == "linux" || key_lower.contains("linux_artifact")) && is_enabled(value))
                || (matches!(key_lower.as_str(), "platform" | "os" | "target" | "type")
                    && value
                        .as_str()
                        .is_some_and(|platform| platform.eq_ignore_ascii_case("linux")))
                || has_linux_artifact(value)
        }),
        Value::Array(values) => values.iter().any(has_linux_artifact),
        Value::String(value) => value.eq_ignore_ascii_case("linux"),
        _ => false,
    }
}

fn linux_cask_supported(record: &Value) -> bool {
    let linux_dependency = record
        .get("depends_on")
        .and_then(Value::as_object)
        .and_then(|dependencies| dependencies.get("linux"))
        .is_some_and(is_enabled);
    let linux_artifact = record.get("artifacts").is_some_and(has_linux_artifact);
    linux_dependency || linux_artifact
}

fn record_names(record: &Value) -> impl Iterator<Item = &str> {
    ["name", "full_name", "token"]
        .into_iter()
        .filter_map(|key| record.get(key).and_then(Value::as_str))
        .chain(
            ["aliases", "oldnames"]
                .into_iter()
                .filter_map(|key| record.get(key).and_then(Value::as_array))
                .flat_map(|names| names.iter().filter_map(Value::as_str)),
        )
}

fn outdated_names(value: &Value, kind: PackageKind) -> HashSet<String> {
    let mut names = HashSet::new();
    if let Some(records) = value.get(kind.json_key()).and_then(Value::as_array) {
        for record in records {
            if let Some(name) = record.as_str() {
                names.insert(name.to_string());
            } else {
                names.extend(record_names(record).map(str::to_string));
            }
        }
    }
    names
}

fn installed_sync() -> Result<Vec<ProviderApp>, String> {
    if !available() {
        return Err(
            "Homebrew komutu bulunamadı; PATH'i ve Linuxbrew öneklerini kontrol edin.".to_string(),
        );
    }

    let info_args = vec![
        "info".to_string(),
        "--json=v2".to_string(),
        "--installed".to_string(),
    ];
    let info_output = run_brew(&info_args, INFO_TIMEOUT, JSON_OUTPUT_LIMIT)?;
    let info = json_output("installed info", &info_output)?;

    let outdated_args = vec!["outdated".to_string(), "--json=v2".to_string()];
    let outdated_output = run_brew(&outdated_args, INFO_TIMEOUT, JSON_OUTPUT_LIMIT)?;
    let outdated = json_output("outdated", &outdated_output)?;
    let outdated_formulae = outdated_names(&outdated, PackageKind::Formula);
    let outdated_casks = outdated_names(&outdated, PackageKind::Cask);

    let mut apps = Vec::with_capacity(64);
    let mut seen = HashSet::new();
    let mut formula_count = 0;
    let mut cask_count = 0;
    for kind in [PackageKind::Formula, PackageKind::Cask] {
        let updates = if kind == PackageKind::Formula {
            &outdated_formulae
        } else {
            &outdated_casks
        };
        for record in info_records(&info, kind) {
            if has_installed_version(record) == Some(false) {
                continue;
            }
            if kind == PackageKind::Cask && !linux_cask_supported(record) {
                continue;
            }
            let Some(token) = field_string(record, &["name", "token", "full_name"]) else {
                continue;
            };
            if !valid_package_token(token) {
                continue;
            }
            let id = format!("{}{token}", kind.id_prefix());
            if !seen.insert(id) {
                continue;
            }
            let update_available = record_names(record).any(|name| updates.contains(name));
            apps.push(build_app(Some(record), kind, token, true, update_available));
            let kind_limit_reached = match kind {
                PackageKind::Formula => {
                    formula_count += 1;
                    formula_count >= MAX_INSTALLED_PER_KIND
                }
                PackageKind::Cask => {
                    cask_count += 1;
                    cask_count >= MAX_INSTALLED_PER_KIND
                }
            };
            if kind_limit_reached || apps.len() >= MAX_INSTALLED_RESULTS {
                break;
            }
        }
        if apps.len() >= MAX_INSTALLED_RESULTS {
            break;
        }
    }
    Ok(apps)
}
fn installed_cached() -> Result<Arc<Vec<ProviderApp>>, String> {
    let cache = INSTALLED_CACHE.get_or_init(|| Mutex::new(None));
    let mut cache = cache
        .lock()
        .map_err(|_| "Homebrew envanter önbelleği kilitlenemedi.".to_string())?;
    if let Some((cached_at, apps)) = cache.as_ref() {
        if cached_at.elapsed() < INVENTORY_CACHE_TTL {
            return Ok(Arc::clone(apps));
        }
    }

    let apps = Arc::new(installed_sync()?);
    *cache = Some((Instant::now(), Arc::clone(&apps)));
    Ok(apps)
}

pub fn invalidate_cache() {
    if let Some(cache) = INSTALLED_CACHE.get() {
        if let Ok(mut cache) = cache.lock() {
            *cache = None;
        }
    }
}

fn apply_installed_status(apps: &mut [ProviderApp], installed: &[ProviderApp]) {
    let installed: HashMap<&str, &ProviderApp> =
        installed.iter().map(|app| (app.id.as_str(), app)).collect();
    for app in apps {
        if let Some(current) = installed.get(app.id.as_str()) {
            app.installed = true;
            app.pinned = current.pinned;
            app.update_available = current.update_available;
            if !current.version.is_empty() {
                app.version.clone_from(&current.version);
            }
        }
    }
}

fn detail_sync(kind: PackageKind, token: &str) -> Result<ProviderDetail, String> {
    let names = vec![token.to_string()];
    let info = named_info(&names, kind)?;
    let records = info_records(&info, kind);
    let record = find_record(&records, token)
        .ok_or_else(|| "Homebrew paket bilgisi bulunamadı.".to_string())?;
    if kind == PackageKind::Cask && !linux_cask_supported(record) {
        return Err("Bu cask Homebrew üstverisine göre Linux desteği bildirmiyor.".to_string());
    }
    let description = field_string(record, &["desc", "description"])
        .map(|value| truncate(value, 4_000))
        .unwrap_or_default();
    let homepage = field_string(record, &["homepage"]).map(|value| truncate(value, 2_000));
    let license = match record.get("license") {
        Some(Value::String(value)) => truncate(value, 300),
        Some(Value::Array(values)) => truncate(
            &values
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(", "),
            300,
        ),
        Some(Value::Object(values)) => values
            .get("type")
            .and_then(Value::as_str)
            .map(|value| truncate(value, 300))
            .unwrap_or_default(),
        _ => String::new(),
    };
    let mut app = build_app(Some(record), kind, token, false, false);
    if let Ok(installed) = installed_cached() {
        apply_installed_status(std::slice::from_mut(&mut app), &installed);
    }
    Ok(ProviderDetail {
        app,
        description,
        homepage,
        license,
    })
}

fn running_as_root() -> Result<bool, String> {
    #[cfg(target_os = "linux")]
    {
        let status = std::fs::read_to_string("/proc/self/status")
            .map_err(|error| format!("İşlem kimliği doğrulanamadı: {error}"))?;
        let effective_uid = status
            .lines()
            .find_map(|line| {
                let mut values = line.strip_prefix("Uid:")?.split_whitespace();
                values.nth(1)?.parse::<u32>().ok()
            })
            .ok_or_else(|| "İşlem kimliği doğrulanamadı.".to_string())?;
        Ok(effective_uid == 0)
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(false)
    }
}

fn action_sync(kind: PackageKind, token: &str, action: &str) -> Result<String, String> {
    if running_as_root()? {
        return Err("Homebrew işlemleri root olarak çalıştırılamaz.".to_string());
    }
    if !available() {
        return Err(
            "Homebrew komutu bulunamadı; PATH'i ve Linuxbrew öneklerini kontrol edin.".to_string(),
        );
    }
    if kind == PackageKind::Cask {
        let info = named_info(&[token.to_string()], kind)?;
        let records = info_records(&info, kind);
        let record = find_record(&records, token)
            .ok_or_else(|| "Homebrew cask bilgisi bulunamadı.".to_string())?;
        if !linux_cask_supported(record) {
            return Err("Bu cask Homebrew üstverisine göre Linux desteği bildirmiyor.".to_string());
        }
    }

    let command = match action {
        "install" => "install",
        "remove" => "uninstall",
        "update" => "upgrade",
        _ => return Err("Homebrew işlemi desteklenmiyor.".to_string()),
    };
    let mut args = vec![command.to_string()];
    if kind == PackageKind::Cask {
        args.push("--cask".to_string());
    }
    args.push(token.to_string());

    let output = run_brew(&args, ACTION_TIMEOUT, ACTION_OUTPUT_LIMIT)?;
    if !output.success {
        return Err(command_failure(command, &output));
    }
    let result = match action {
        "install" => "yüklendi",
        "remove" => "kaldırıldı",
        "update" => "güncellendi",
        _ => unreachable!(),
    };
    Ok(format!("{token} {result}."))
}

pub async fn search(query: &str) -> Result<Vec<ProviderApp>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    if query.chars().count() > MAX_QUERY_CHARS || query.chars().any(char::is_control) {
        return Err("Arama terimi geçersiz.".to_string());
    }
    let query = query.to_string();
    task::spawn_blocking(move || search_sync(&query))
        .await
        .map_err(|error| format!("Homebrew araması tamamlanamadı: {error}"))?
}

pub fn installed() -> Result<Vec<ProviderApp>, String> {
    Ok((*installed_cached()?).clone())
}

pub async fn detail(id: &str) -> Result<ProviderDetail, String> {
    let (kind, token) = parse_id(id)?;
    let token = token.to_string();
    task::spawn_blocking(move || detail_sync(kind, &token))
        .await
        .map_err(|error| format!("Homebrew paket bilgisi alınamadı: {error}"))?
}

pub async fn action(id: &str, action: &str) -> Result<String, String> {
    let (kind, token) = parse_id(id)?;
    let action = match action {
        "install" | "remove" | "update" => action,
        _ => return Err("Homebrew işlemi desteklenmiyor.".to_string()),
    };
    let token = token.to_string();
    let action = action.to_string();
    let result = task::spawn_blocking(move || action_sync(kind, &token, &action))
        .await
        .map_err(|error| format!("Homebrew işlemi tamamlanamadı: {error}"))?;
    invalidate_cache();
    result
}

pub fn available() -> bool {
    brew_path().is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(id: &str, installed: bool, update_available: bool, version: &str) -> ProviderApp {
        ProviderApp {
            id: id.to_string(),
            name: id.to_string(),
            summary: String::new(),
            developer: String::new(),
            version: version.to_string(),
            icon: None,
            installed,
            update_available,
            pinned: false,
            category: None,
            package_type: None,
        }
    }

    #[test]
    fn package_ids_keep_formula_and_cask_namespaces_separate() {
        assert_eq!(parse_id("formula/hello").unwrap().0, PackageKind::Formula);
        assert_eq!(parse_id("cask/hello").unwrap().0, PackageKind::Cask);
        for id in ["hello", "formula/-option", "cask/../escape", "formula/a//b"] {
            assert!(parse_id(id).is_err(), "{id}");
        }
    }

    #[test]
    fn search_results_inherit_installed_version_and_update_state_by_full_id() {
        let mut search = vec![
            app("formula/hello", false, false, "2.0"),
            app("cask/hello", false, false, "2.0"),
            app("formula/new", false, false, "1.0"),
        ];
        let mut installed = vec![
            app("formula/hello", true, true, "1.0"),
            app("cask/hello", true, false, "2.0"),
        ];
        installed[0].pinned = true;
        apply_installed_status(&mut search, &installed);
        assert!(search[0].installed && search[0].update_available);
        assert_eq!(search[0].version, "1.0");
        assert!(search[1].installed && !search[1].update_available);
        assert!(search[0].pinned);
        assert!(!search[2].installed);
    }

    #[test]
    fn casks_require_explicit_linux_support_metadata() {
        assert!(linux_cask_supported(
            &json!({"depends_on": {"linux": true}})
        ));
        assert!(linux_cask_supported(
            &json!({"artifacts": [{"linux": ["bin/tool"]}]})
        ));
        assert!(!linux_cask_supported(
            &json!({"depends_on": {"macos": ">= 12"}})
        ));
        assert!(!linux_cask_supported(
            &json!({"artifacts": [{"app": ["Example.app"]}]})
        ));
    }
    #[test]
    fn installed_formula_preserves_pinned_state() {
        let record = json!({
            "name": "example",
            "installed": [{"version": "1.0"}],
            "pinned": true
        });
        let app = build_app(Some(&record), PackageKind::Formula, "example", true, false);
        assert!(app.installed);
        assert!(app.pinned);

        let unpinned = build_app(
            Some(&json!({"name": "other", "installed": [{"version": "1.0"}]})),
            PackageKind::Formula,
            "other",
            true,
            false,
        );
        assert!(!unpinned.pinned);
    }
}
