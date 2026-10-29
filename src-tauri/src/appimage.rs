//! Yerel AppImage dosyalarını içe aktarma, listeleme ve kaldırma.

use super::{
    data_url_from_file, host_program, run_capture, sanitize_std, truncate_chars, AppDetail,
    AppItem, ScreenshotItem,
};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

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

fn load_index() -> Vec<AppImageEntry> {
    let Ok(text) = fs::read_to_string(appimage_index_path()) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<AppImageEntry>>(&text).unwrap_or_default()
}

fn save_index(entries: &[AppImageEntry]) -> Result<(), String> {
    fs::create_dir_all(appimage_dir())
        .map_err(|err| format!("AppImage dizini oluşturulamadı: {err}"))?;
    let text = serde_json::to_string_pretty(entries)
        .map_err(|err| format!("AppImage dizini yazılamadı: {err}"))?;
    fs::write(appimage_index_path(), text)
        .map_err(|err| format!("AppImage dizini yazılamadı: {err}"))
}

fn appimage_item(entry: &AppImageEntry) -> AppItem {
    AppItem {
        id: entry.id.clone(),
        provider: "appimage".to_string(),
        package_type: None,
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
        pinned: false,
        channel: None,
        category: None,
        monthly_installs: None,
        hero_image: None,
        verified: false,
        license: None,
        free_license: false,
    }
}

pub(crate) fn installed() -> Vec<AppItem> {
    let mut items: Vec<AppItem> = load_index()
        .iter()
        .filter(|entry| Path::new(&entry.path).is_file())
        .map(appimage_item)
        .collect();
    items.sort_by_key(|app| app.name.to_lowercase());
    items
}

pub(crate) fn count() -> usize {
    load_index()
        .iter()
        .filter(|entry| Path::new(&entry.path).is_file())
        .count()
}

fn desktop_path(slug: &str) -> Option<PathBuf> {
    home_dir().map(|home| {
        home.join(".local/share/applications")
            .join(format!("macro-store-{slug}.desktop"))
    })
}

fn icon_dir(extension: &str) -> PathBuf {
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

fn extract_icon(appimage: &Path, slug: &str) -> Option<PathBuf> {
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
            let target_dir = icon_dir(extension);
            fs::create_dir_all(&target_dir).ok()?;
            let icon_path = target_dir.join(format!("macro-store-{slug}.{extension}"));
            fs::write(&icon_path, bytes).ok()?;
            Some(icon_path)
        }
        _ => None,
    };
    let _ = fs::remove_dir_all(&temp);
    result
}

fn write_desktop(entry: &AppImageEntry) -> Option<PathBuf> {
    let path = desktop_path(&entry.id)?;
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

pub(crate) fn import(path: &str, name: Option<String>) -> Result<AppItem, String> {
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
    let mut entries = load_index();
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
    let icon_path = extract_icon(&destination, &slug).map(|path| path.display().to_string());
    let display_name = truncate_chars(&base_name, 120);
    let entry = AppImageEntry {
        id: slug,
        name: display_name,
        path: destination.display().to_string(),
        icon_path,
        size: metadata.len(),
        imported_at: unix_timestamp(),
    };
    let _ = write_desktop(&entry);
    entries.push(entry.clone());
    save_index(&entries)?;
    Ok(appimage_item(&entry))
}

pub(crate) fn remove(slug: &str) -> Result<String, String> {
    if !valid_appimage_slug(slug) {
        return Err("AppImage kimliği geçersiz.".to_string());
    }
    let mut entries = load_index();
    let Some(index) = entries.iter().position(|entry| entry.id == slug) else {
        return Err("AppImage kaydı bulunamadı.".to_string());
    };
    let entry = entries.remove(index);
    let _ = fs::remove_file(&entry.path);
    if let Some(icon) = &entry.icon_path {
        let _ = fs::remove_file(icon);
    }
    if let Some(desktop) = desktop_path(&entry.id) {
        let _ = fs::remove_file(desktop);
    }
    save_index(&entries)?;
    Ok("AppImage kaldırıldı.".to_string())
}

pub(crate) fn launch(slug: &str) -> Result<(), String> {
    if !valid_appimage_slug(slug) {
        return Err("AppImage kimliği geçersiz.".to_string());
    }
    let entry = load_index()
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

pub(crate) fn pick() -> Result<Option<String>, String> {
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

pub(crate) fn detail(slug: &str) -> Result<AppDetail, String> {
    if !valid_appimage_slug(slug) {
        return Err("AppImage kimliği geçersiz.".to_string());
    }
    let entry = load_index()
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
        screenshots: Vec::<ScreenshotItem>::new(),
        categories: Vec::new(),
        license: String::new(),
        verified: false,
        homepage: None,
        download_size: Some(entry.size),
        installed_size: Some(entry.size),
        installs_last_month: None,
        rating: None,
        reviews: Vec::new(),
        releases: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs_are_restricted() {
        for slug in ["my-app", "app_1", "a.b"] {
            assert!(valid_appimage_slug(slug), "{slug} geçerli olmalıydı");
        }
        for slug in ["", "-x", "My-App", "app/1", "app name"] {
            assert!(!valid_appimage_slug(slug), "{slug} reddedilmeliydi");
        }
    }

    #[test]
    fn slugify_keeps_ascii_names_readable() {
        assert_eq!(slugify("My App 2.0"), "my-app-2-0");
        assert_eq!(slugify("  --Über--  "), "ber");
    }
}
