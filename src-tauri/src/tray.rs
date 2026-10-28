use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

const TRAY_ID: &str = "macro-store-tray";

fn tooltip_for(count: usize) -> String {
    if count == 0 {
        "Macro Store — güncel".to_string()
    } else if count == 1 {
        "Macro Store — 1 güncelleme bekliyor".to_string()
    } else {
        format!("Macro Store — {count} güncelleme bekliyor")
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Mağazayı aç", true, None::<&str>)?;
    let check = MenuItem::with_id(app, "check", "Güncellemeleri denetle", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Çık", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &check, &separator, &quit])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(tooltip_for(0))
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "check" => {
                show_main_window(app);
                let _ = app.emit("tray-check-updates", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

#[tauri::command]
pub fn set_tray_updates(app: AppHandle, count: usize) -> Result<(), String> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };
    tray.set_tooltip(Some(tooltip_for(count)))
        .map_err(|err| err.to_string())?;
    let title = (count > 0).then(|| count.to_string());
    let _ = tray.set_title(title.as_deref());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::tooltip_for;

    #[test]
    fn tooltip_reflects_pending_update_count() {
        assert_eq!(tooltip_for(0), "Macro Store — güncel");
        assert_eq!(tooltip_for(1), "Macro Store — 1 güncelleme bekliyor");
        assert_eq!(tooltip_for(5), "Macro Store — 5 güncelleme bekliyor");
    }
}
