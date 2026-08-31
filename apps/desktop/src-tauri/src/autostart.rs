use std::env;

#[cfg(target_os = "windows")]
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
#[cfg(target_os = "windows")]
use winreg::RegKey;

const REG_KEY_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const APP_REG_NAME: &str = "Segmenta";

pub fn set_launch_on_startup(enable: bool, start_minimized: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu
            .create_subkey(REG_KEY_PATH)
            .map_err(|e| format!("Failed to open Run registry key: {}", e))?;

        if enable {
            let current_exe = env::current_exe().map_err(|e| e.to_string())?;
            let exe_str = current_exe.to_string_lossy().to_string();
            let command = if start_minimized {
                format!("\"{}\" --minimized", exe_str)
            } else {
                format!("\"{}\"", exe_str)
            };

            key.set_value(APP_REG_NAME, &command)
                .map_err(|e| format!("Failed to set registry value: {}", e))?;
        } else {
            let _ = key.delete_value(APP_REG_NAME);
        }
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = enable;
        let _ = start_minimized;
        Ok(())
    }
}

pub fn is_launch_on_startup_enabled() -> bool {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey_with_flags(REG_KEY_PATH, KEY_READ) {
            let val: Result<String, _> = key.get_value(APP_REG_NAME);
            return val.is_ok();
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}
