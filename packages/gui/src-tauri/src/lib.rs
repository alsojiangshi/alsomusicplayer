use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// HTTP 请求选项
#[derive(Deserialize)]
struct FetchOptions {
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
}

/// HTTP 响应结果
#[derive(Serialize)]
struct FetchResult {
    status: u16,
    body: Vec<u8>,
    headers: HashMap<String, String>,
}

// ─── 文件 I/O 命令 ──────────────────────────────────────

#[tauri::command]
fn read_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("read_file: {}", e))
}

#[tauri::command]
fn write_file(path: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("write_file mkdir: {}", e))?;
    }
    std::fs::write(&path, &data).map_err(|e| format!("write_file: {}", e))
}

#[tauri::command]
fn file_exists(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("read_text_file: {}", e))
}

#[tauri::command]
fn write_text_file(path: String, data: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("write_text_file mkdir: {}", e))?;
    }
    std::fs::write(&path, &data).map_err(|e| format!("write_text_file: {}", e))
}

// ─── 平台路径 ───────────────────────────────────────────

#[tauri::command]
fn get_data_dir() -> Result<String, String> {
    let base = if cfg!(target_os = "windows") {
        std::env::var("APPDATA")
            .unwrap_or_else(|_| std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string()))
    } else {
        std::env::var("XDG_DATA_HOME").unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
            format!("{}/.local/share", home)
        })
    };
    Ok(format!("{}/music-player", base))
}

#[tauri::command]
fn list_files_recursively(path: String) -> Result<Vec<String>, String> {
    let root = PathBuf::from(path);
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    collect_files(&root, &mut files).map_err(|e| format!("list_files_recursively: {}", e))?;
    Ok(files)
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    if !target.exists() {
        return Ok(());
    }

    if !target.is_file() {
        return Err("delete_file: target is not a file".to_string());
    }

    std::fs::remove_file(&target).map_err(|e| format!("delete_file: {}", e))
}

// ─── 文件导入 ───────────────────────────────────────────

#[tauri::command]
fn copy_file_to_library(src: String, filename: String) -> Result<String, String> {
    let base = if cfg!(target_os = "windows") {
        std::env::var("APPDATA")
            .unwrap_or_else(|_| std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string()))
    } else {
        std::env::var("XDG_DATA_HOME").unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
            format!("{}/.local/share", home)
        })
    };
    let lib_dir = format!("{}/music-player/library", base);
    std::fs::create_dir_all(&lib_dir).map_err(|e| format!("mkdir library: {}", e))?;
    let dest = format!("{}/{}", lib_dir, filename);
    std::fs::copy(&src, &dest).map_err(|e| format!("copy file: {}", e))?;
    Ok(dest)
}

fn collect_files(path: &Path, files: &mut Vec<String>) -> std::io::Result<()> {
    if path.is_file() {
        files.push(path.to_string_lossy().to_string());
        return Ok(());
    }

    if path.is_dir() {
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            collect_files(&entry.path(), files)?;
        }
    }

    Ok(())
}

// ─── HTTP 代理（绕过浏览器 CORS）────────────────────────

#[tauri::command]
async fn http_fetch(url: String, options: Option<FetchOptions>) -> Result<FetchResult, String> {
    let client = reqwest::Client::new();
    let method = options
        .as_ref()
        .and_then(|o| o.method.as_deref())
        .unwrap_or("GET");

    let mut req = match method {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => client.get(&url),
    };

    if let Some(opts) = &options {
        if let Some(headers) = &opts.headers {
            for (k, v) in headers {
                req = req.header(k.as_str(), v.as_str());
            }
        }
        if let Some(body) = &opts.body {
            req = req.body(body.clone());
        }
    }

    let resp = req.send().await.map_err(|e| format!("http_fetch: {}", e))?;

    let status = resp.status().as_u16();

    let resp_headers: HashMap<String, String> = resp
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or_default().to_string()))
        .collect();

    let body = resp
        .bytes()
        .await
        .map_err(|e| format!("http_fetch body: {}", e))?
        .to_vec();

    Ok(FetchResult {
        status,
        body,
        headers: resp_headers,
    })
}

// ─── Tauri 入口 ─────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            file_exists,
            read_text_file,
            write_text_file,
            get_data_dir,
            list_files_recursively,
            delete_file,
            copy_file_to_library,
            http_fetch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
