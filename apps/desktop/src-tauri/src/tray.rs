use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "Open Segmenta", true, None::<&str>)?;
    let pause_all_item = MenuItem::with_id(app, "pause_all", "Pause All", true, None::<&str>)?;
    let resume_all_item = MenuItem::with_id(app, "resume_all", "Resume All", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let tray_menu = Menu::with_items(
        app,
        &[
            &show_item,
            &pause_all_item,
            &resume_all_item,
            &separator,
            &quit_item,
        ],
    )?;

    let icon = app.default_window_icon().unwrap().clone();

    let _tray = TrayIconBuilder::with_id("segmenta-main-tray")
        .tooltip("Segmenta — High-Speed Download Manager")
        .icon(icon)
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            match id {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                "pause_all" => {
                    let _ = app.emit("tray-action", "pause_all");
                }
                "resume_all" => {
                    let _ = app.emit("tray-action", "resume_all");
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}
