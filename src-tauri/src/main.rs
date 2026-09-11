#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::process::Command;
use std::time::Duration;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime};

/// Local OpenCode telemetry endpoint (never remote by default).
const SERVE_PORT: u16 = 4096;

fn serve_running() -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{SERVE_PORT}").parse().unwrap(),
        Duration::from_millis(600),
    )
    .is_ok()
}

/// Ensure `opencode serve` is up, spawning it detached when missing.
/// Uses the `opencode` on PATH (installed alongside OpenCode itself).
fn ensure_serve() {
    if serve_running() {
        return;
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = Command::new("opencode")
            .args(["serve", "--port", &SERVE_PORT.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("opencode")
            .args(["serve", "--port", &SERVE_PORT.to_string()])
            .spawn();
    }
}

fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = tauri::menu::MenuBuilder::new(app)
        .text("show", "Open Mission Control")
        .text("agents", "Show Active Agents")
        .separator()
        .text("quit", "Quit")
        .build()?;
    let _tray = TrayIconBuilder::with_id("mc-tray")
        .tooltip("OpenCode Mission Control")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "agents" => {
                show_main(app);
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.eval("window.__mcAlert && window.__mcAlert('agents')");
                }
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
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            ensure_serve();
            if let Err(e) = build_tray(app.handle()) {
                eprintln!("[mc] tray unavailable: {e}");
            }
            Ok(())
        })
        .on_window_event(|w, event| {
            // Minimize-to-tray keeps monitoring alive while out of the way.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = w.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("mission control failed to start");
}
