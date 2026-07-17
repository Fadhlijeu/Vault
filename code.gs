// code.gs - Google Apps Script Backend for Cyber Vault

// Helper: Membuka atau membuat folder Cyber Vault di Google Drive
function getOrCreateFolder() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const folderId = scriptProperties.getProperty("FOLDER_ID");

  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      console.warn(
        "Folder ID dari Script Properties tidak ditemukan atau tidak valid: " +
          e.toString(),
      );
    }
  }

  const folderName = "Cyber Vault Data Store";
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    const folder = folders.next();
    scriptProperties.setProperty("FOLDER_ID", folder.getId());
    return folder;
  }
  const folder = DriveApp.createFolder(folderName);
  scriptProperties.setProperty("FOLDER_ID", folder.getId());
  return folder;
}

// Jalankan sekali dari editor Apps Script, lalu isi HANDSHAKE_KEY secara manual
// melalui Project Settings > Script properties. Tidak ada passcode bawaan.
function setupVault() {
  const root = getOrCreateFolder();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("SYSTEM_CONFIG")) {
    props.setProperty("SYSTEM_CONFIG", JSON.stringify({
      vaultName: "Cyber Vault Secure Storage",
      maxFileSizeMB: 15,
      allowedExtensions: ["png", "jpg", "jpeg", "gif", "webp", "pdf", "txt", "zip", "mp4"],
    }));
  }
  return "Vault siap. Atur HANDSHAKE_KEY di Script Properties sebelum deploy. Root: " + root.getId();
}

// Authentication secrets are configured in Script Properties, never in source code.
const SESSION_TTL_SECONDS = 1800;
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_SECONDS = 300;

// Helper: memvalidasi session token pendek, bukan passcode utama.
function validateToken(token) {
  if (!token) return false;
  return CacheService.getScriptCache().get("vault-session:" + token) === "valid";
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function getConfigs() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const systemConfigStr = scriptProperties.getProperty("SYSTEM_CONFIG");
  return systemConfigStr ? JSON.parse(systemConfigStr) : {};
}

function authenticate(passcode) {
  const props = PropertiesService.getScriptProperties();
  const correctKey = props.getProperty("HANDSHAKE_KEY");
  if (!correctKey) throw new Error("HANDSHAKE_KEY belum dikonfigurasi di Script Properties.");
  const cache = CacheService.getScriptCache();
  const attemptsKey = "vault-login-attempts";
  const attempts = Number(cache.get(attemptsKey) || 0);
  if (attempts >= LOGIN_LIMIT) return { status: "error", message: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." };
  if (passcode !== correctKey) {
    cache.put(attemptsKey, String(attempts + 1), LOGIN_WINDOW_SECONDS);
    return { status: "error", message: "Kredensial tidak valid." };
  }
  cache.remove(attemptsKey);
  const sessionToken = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, "");
  cache.put("vault-session:" + sessionToken, "valid", SESSION_TTL_SECONDS);
  return { status: "success", sessionToken: sessionToken, config: getConfigs() };
}

function assertVaultFolder(folderId, rootFolder) {
  const root = rootFolder || getOrCreateFolder();
  let folder = DriveApp.getFolderById(folderId);
  for (let depth = 0; depth < 40; depth++) {
    if (folder.getId() === root.getId()) return folder;
    const parents = folder.getParents();
    if (!parents.hasNext()) break;
    folder = parents.next();
  }
  throw new Error("Folder berada di luar Vault.");
}

function assertVaultFile(fileId, rootFolder) {
  const file = DriveApp.getFileById(fileId);
  const parents = file.getParents();
  while (parents.hasNext()) assertVaultFolder(parents.next().getId(), rootFolder);
  // Files with no parent are not valid vault files.
  if (!file.getParents().hasNext()) throw new Error("File berada di luar Vault.");
  return file;
}

// 2. HTTP GET Request Handler
function doGet(e) {
  const action = e.parameter.action;
  const token = e.parameter.token;

  // B. Validasi Token untuk Aksi Lainnya
  if (!validateToken(token)) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: "error",
        message: "Akses Ditolak: Token Tidak Valid!",
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // D. Fixed Proxy Download Folder as ZIP Handler
  if (action === "download_folder") {
    const folderId = e.parameter.folderId;
    if (!folderId) {
      return ContentService.createTextOutput(
        "Error: Parameter folderId dibutuhkan.",
      ).setMimeType(ContentService.MimeType.TEXT);
    }

    try {
      const folder = assertVaultFolder(folderId);
      const zipName = folder.getName() + ".zip";
      const blobs = [];

      collectBlobs(folder, blobs, "");

      if (blobs.length === 0) {
        return ContentService.createTextOutput(
          "Error: Folder ini kosong.",
        ).setMimeType(ContentService.MimeType.TEXT);
      }

      const zipBlob = Utilities.zip(blobs, zipName);
      const base64Data = Utilities.base64Encode(zipBlob.getBytes());
      const contentType = "application/zip";

      if (e.parameter.format === "base64") {
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "success",
            base64: base64Data,
            mimeType: contentType,
            filename: zipName,
          }),
        ).setMimeType(ContentService.MimeType.JSON);
      }

      // Default: HTML stream download
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Downloading ${zipName}...</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: linear-gradient(135deg, #0c1929, #1a2a4a); color: #e2e8f0; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; }
    .card { text-align: center; padding: 2.5rem 2rem; background: rgba(15,23,42,.85); border: 1px solid rgba(56,189,248,.15); border-radius: 20px; box-shadow: 0 25px 50px -12px #00000080; max-width: 420px; width: 90%; }
    .icon-wrap { width: 48px; height: 48px; margin: 0 auto 1rem; border: 2px solid #38bdf8; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .icon-wrap svg { width: 24px; height: 24px; fill: #38bdf8; }
    h3 { font-size: 1rem; font-weight: 600; margin-bottom: .25rem; }
    .sub { font-size: .75rem; color: #64748b; margin-bottom: 1.25rem; }
    .fname { font-size: .8rem; color: #94a3b8; word-break: break-all; margin-bottom: 1.5rem; }
    .bar { height: 4px; background: rgba(56,189,248,.1); border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; width: 0; background: linear-gradient(90deg,#38bdf8,#818cf8); border-radius: 4px; animation: fill 1.5s ease-in-out forwards; }
    @keyframes fill { to { width: 100%; } }
    .status { font-size: .75rem; color: #64748b; margin-top: 1rem; letter-spacing: .02em; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrap"><svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5v2zm7-18L5.33 9h5.67v4h4V9h5.67L12 2z"/></svg></div>
    <h3>Mengunduh Folder</h3>
    <div class="sub">Folder ZIP Archive</div>
    <div class="fname">${zipName}</div>
    <div class="bar"><div class="bar-fill"></div></div>
    <div class="status">Memproses dan mengompresi folder...</div>
  </div>
  <script>
    (function() {
      const bytes = Uint8Array.from(atob("${base64Data}"), c => c.charCodeAt(0));
      const blob = new Blob([bytes], {type: "${contentType}"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "${zipName}";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(window.close, 2000);
    })();
  </script>
</body>
</html>`;

      return HtmlService.createHtmlOutput(html).setTitle(
        "Downloading " + zipName,
      );
    } catch (error) {
      return ContentService.createTextOutput(
        "Error: Gagal memproses folder zip. " + error.toString(),
      ).setMimeType(ContentService.MimeType.TEXT);
    }
  }

  // C. Fixed Proxy Download Handler
  if (action === "download") {
    const fileId = e.parameter.fileId;
    if (!fileId) {
      return ContentService.createTextOutput(
        "Error: Parameter fileId dibutuhkan.",
      ).setMimeType(ContentService.MimeType.TEXT);
    }

    try {
      const file = assertVaultFile(fileId);
      const blob = file.getBlob();
      const filename = file.getName();
      const contentType = blob.getContentType();

      // Jika frontend meminta format JSON Base64 untuk preview aman
      if (e.parameter.format === "base64") {
        const base64Data = Utilities.base64Encode(blob.getBytes());
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "success",
            base64: base64Data,
            mimeType: contentType,
            filename: filename,
          }),
        ).setMimeType(ContentService.MimeType.JSON);
      }

      // Jika CLI meminta format raw Base64 murni tanpa pembungkus HTML
      if (e.parameter.format === "raw_base64") {
        const base64Data = Utilities.base64Encode(blob.getBytes());
        return ContentService.createTextOutput(base64Data).setMimeType(
          ContentService.MimeType.TEXT,
        );
      }

      // Deteksi ekstensi file
      const ext = filename.split(".").pop().toLowerCase();
      const isTextFile = [
        "txt",
        "csv",
        "json",
        "xml",
        "md",
        "html",
        "css",
        "js",
      ].includes(ext);

      if (isTextFile) {
        // Untuk file teks, kita bisa langsung kirim via ContentService dengan header download
        const textContent = blob.getDataAsString();
        return ContentService.createTextOutput(textContent)
          .setMimeType(ContentService.MimeType.TEXT)
          .downloadAsFile(filename);
      } else {
        // Untuk file biner (gambar, pdf, video, zip), kirim via Base64 HTML Stream Download
        const base64Data = Utilities.base64Encode(blob.getBytes());

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Downloading ${filename}...</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: linear-gradient(135deg, #0c1929, #1a2a4a); color: #e2e8f0; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; }
    .card { text-align: center; padding: 2.5rem 2rem; background: rgba(15,23,42,.85); border: 1px solid rgba(56,189,248,.15); border-radius: 20px; box-shadow: 0 25px 50px -12px #00000080; max-width: 420px; width: 90%; }
    .icon-wrap { width: 48px; height: 48px; margin: 0 auto 1rem; border: 2px solid #38bdf8; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .icon-wrap svg { width: 24px; height: 24px; fill: #38bdf8; }
    h3 { font-size: 1rem; font-weight: 600; margin-bottom: .25rem; }
    .sub { font-size: .75rem; color: #64748b; margin-bottom: 1.25rem; }
    .fname { font-size: .8rem; color: #94a3b8; word-break: break-all; margin-bottom: 1.5rem; }
    .bar { height: 4px; background: rgba(56,189,248,.1); border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; width: 0; background: linear-gradient(90deg,#38bdf8,#818cf8); border-radius: 4px; animation: fill 1.5s ease-in-out forwards; }
    @keyframes fill { to { width: 100%; } }
    .status { font-size: .75rem; color: #64748b; margin-top: 1rem; letter-spacing: .02em; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrap"><svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5v2zm7-18L5.33 9h5.67v4h4V9h5.67L12 2z"/></svg></div>
    <h3>Mengunduh Berkas</h3>
    <div class="sub">Single File Download</div>
    <div class="fname">${filename}</div>
    <div class="bar"><div class="bar-fill"></div></div>
    <div class="status">Memproses berkas...</div>
  </div>
  <script>
    (function() {
      const bytes = Uint8Array.from(atob("${base64Data}"), c => c.charCodeAt(0));
      const blob = new Blob([bytes], {type: "${contentType}"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "${filename}";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(window.close, 2000);
    })();
  </script>
</body>
</html>`;

        return HtmlService.createHtmlOutput(html).setTitle(
          "Downloading " + filename,
        );
      }
    } catch (error) {
      return ContentService.createTextOutput(
        "Error: Gagal memproses file. " + error.toString(),
      ).setMimeType(ContentService.MimeType.TEXT);
    }
  }

  // C. Batch Download (multiple files as ZIP)
  if (action === "batch_download") {
    const fileIds = e.parameter.fileIds ? e.parameter.fileIds.split(",") : [];
    if (!fileIds.length) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: "error", message: "Parameter fileIds dibutuhkan." }),
      ).setMimeType(ContentService.MimeType.JSON);
    }
    try {
      const blobs = [];
      for (let i = 0; i < fileIds.length; i++) {
        const file = assertVaultFile(fileIds[i].trim());
        blobs.push(file.getBlob());
      }
      const zipBlob = Utilities.zip(blobs, "download.zip");
      const base64Data = Utilities.base64Encode(zipBlob.getBytes());
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Downloading ${fileIds.length} files...</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: linear-gradient(135deg, #0c1929, #1a2a4a); color: #e2e8f0; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; }
    .card { text-align: center; padding: 2.5rem 2rem; background: rgba(15,23,42,.85); border: 1px solid rgba(56,189,248,.15); border-radius: 20px; box-shadow: 0 25px 50px -12px #00000080; max-width: 420px; width: 90%; }
    .icon-wrap { width: 48px; height: 48px; margin: 0 auto 1rem; border: 2px solid #38bdf8; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .icon-wrap svg { width: 24px; height: 24px; fill: #38bdf8; }
    h3 { font-size: 1rem; font-weight: 600; margin-bottom: .25rem; }
    .sub { font-size: .75rem; color: #64748b; margin-bottom: 1.25rem; }
    .fname { font-size: .8rem; color: #94a3b8; word-break: break-all; margin-bottom: 1.5rem; }
    .bar { height: 4px; background: rgba(56,189,248,.1); border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; width: 0; background: linear-gradient(90deg,#38bdf8,#818cf8); border-radius: 4px; animation: fill 1.5s ease-in-out forwards; }
    @keyframes fill { to { width: 100%; } }
    .status { font-size: .75rem; color: #64748b; margin-top: 1rem; letter-spacing: .02em; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrap"><svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5v2zm7-18L5.33 9h5.67v4h4V9h5.67L12 2z"/></svg></div>
    <h3>Mengunduh ${fileIds.length} Berkas</h3>
    <div class="sub">Batch ZIP Download</div>
    <div class="fname">download.zip</div>
    <div class="bar"><div class="bar-fill"></div></div>
    <div class="status">Menggabungkan ${fileIds.length} berkas ke dalam ZIP...</div>
  </div>
  <script>
    (function() {
      const bytes = Uint8Array.from(atob("${base64Data}"), c => c.charCodeAt(0));
      const blob = new Blob([bytes], {type: "application/zip"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "download.zip";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(window.close, 2000);
    })();
  </script>
</body>
</html>`;
      return HtmlService.createHtmlOutput(html).setTitle("Downloading " + fileIds.length + " files");
    } catch (error) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: "error", message: "Gagal membuat ZIP: " + error.toString() }),
      ).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // D. Recursive Folder Tree
  if (e.parameter.recursive === "true") {
    const folderId = e.parameter.folderId;
    return listFiles(token, folderId, true);
  }

  // D. List Files & Folders
  const folderId = e.parameter.folderId;
  return listFiles(token, folderId);
}

function getFolderContents(folder, token) {
  const apiURL = ScriptApp.getService().getUrl();
  const items = [];

  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    const d = file.getDateCreated();
    const ds =
      ("0" + d.getDate()).slice(-2) + "/" +
      ("0" + (d.getMonth() + 1)).slice(-2) + "/" +
      d.getFullYear() + " " +
      ("0" + d.getHours()).slice(-2) + ":" +
      ("0" + d.getMinutes()).slice(-2);
    items.push({
      id: file.getId(),
      name: file.getName(),
      size: file.getSize(),
      isFolder: false,
      url: apiURL + "?action=download&fileId=" + file.getId() + "&token=" + encodeURIComponent(token),
      dateCreated: ds,
    });
  }

  const subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    const sf = subfolders.next();
    items.push({
      id: sf.getId(),
      name: sf.getName(),
      isFolder: true,
      children: getFolderContents(sf, token),
    });
  }

  return items;
}

// Helper: List semua file dan folder dalam folder Cyber Vault
function listFiles(token, folderId, recursive = false) {
  try {
    const rootFolder = getOrCreateFolder();
    const parentFolder = folderId
      ? assertVaultFolder(folderId, rootFolder)
      : rootFolder;
    const fileList = [];

    // Gunakan URL Web App saat ini sebagai base untuk API
    const apiURL = ScriptApp.getService().getUrl();

    // Cek apakah folder saat ini adalah root folder brankas
    const isRoot = parentFolder.getId() === rootFolder.getId();
    const parentFolderId = isRoot
      ? null
      : parentFolder.getParents().hasNext()
        ? parentFolder.getParents().next().getId()
        : rootFolder.getId();

    // 1. Ambil Subfolder
    const subfolders = parentFolder.getFolders();
    while (subfolders.hasNext()) {
      const subfolder = subfolders.next();

      // Calculate file count and total size for this subfolder (only immediate children to avoid huge latency)
      let fileCount = 0;
      let totalSize = 0;
      const folderFiles = subfolder.getFiles();
      while (folderFiles.hasNext()) {
        fileCount++;
        totalSize += folderFiles.next().getSize();
      }

      const dateCreated = subfolder.getDateCreated();
      // Format tanggal kompatibel dengan Apps Script (tidak menggunakan locale "id-ID" yang tidak didukung)
      const day = ("0" + dateCreated.getDate()).slice(-2);
      const month = ("0" + (dateCreated.getMonth() + 1)).slice(-2);
      const year = dateCreated.getFullYear();
      const hours = ("0" + dateCreated.getHours()).slice(-2);
      const minutes = ("0" + dateCreated.getMinutes()).slice(-2);
      const dateString =
        day + "/" + month + "/" + year + " " + hours + ":" + minutes;

      const folderEntry = {
        id: subfolder.getId(),
        name: subfolder.getName(),
        size: totalSize,
        isFolder: true,
        url:
          apiURL +
          "?action=download_folder&folderId=" +
          subfolder.getId() +
          "&token=" +
          encodeURIComponent(token),
        fileCount: fileCount,
        dateCreated: dateString,
      };
      if (recursive) {
        folderEntry.children = getFolderContents(subfolder, token);
      }
      fileList.push(folderEntry);
    }

    // 2. Ambil File
    const files = parentFolder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      const fileDateCreated = file.getDateCreated();
      const day = ("0" + fileDateCreated.getDate()).slice(-2);
      const month = ("0" + (fileDateCreated.getMonth() + 1)).slice(-2);
      const year = fileDateCreated.getFullYear();
      const hours = ("0" + fileDateCreated.getHours()).slice(-2);
      const minutes = ("0" + fileDateCreated.getMinutes()).slice(-2);
      const fileDateString =
        day + "/" + month + "/" + year + " " + hours + ":" + minutes;

      fileList.push({
        id: file.getId(),
        name: file.getName(),
        size: file.getSize(),
        isFolder: false,
        url:
          apiURL +
          "?action=download&fileId=" +
          file.getId() +
          "&token=" +
          encodeURIComponent(token),
        dateCreated: fileDateString,
      });
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        status: "success",
        data: fileList,
        currentFolderName: parentFolder.getName(),
        currentFolderId: parentFolder.getId(),
        parentFolderId: parentFolderId,
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: "error",
        message: "Gagal mengambil data file: " + error.toString(),
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// 3. HTTP POST Request Handler
function doPost(e) {
  try {
    let token = e.parameter.token;
    let action = e.parameter.action;
    let postData = {};

    if (e.postData && e.postData.contents) {
      try {
        postData = JSON.parse(e.postData.contents);
        if (postData.token) token = postData.token;
        if (postData.action) action = postData.action;
      } catch (jsonErr) {
        // Bukan JSON, data biner murni
      }
    }

    // Login is the only unauthenticated endpoint. It accepts text/plain JSON so
    // GitHub Pages does not need a CORS preflight, and never exposes the secret in a URL.
    if (action === "handshake") {
      return jsonResponse(authenticate(postData.token || token));
    }

    // Validasi token keamanan
    if (!validateToken(token)) {
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "error",
          message: "Akses Ditolak: Token Tidak Valid!",
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const rootFolder = getOrCreateFolder();

    // JIKA upload biner langsung (misal: curl --data-binary)
    if (e.postData && e.postData.bytes && !postData.base64) {
      const bytes = e.postData.bytes;
      const fileName = e.parameter.filename || "project_snapshot.zip";
      const blob = Utilities.newBlob(bytes, "application/zip", fileName);
      const newFile = rootFolder.createFile(blob);

      const apiURL = ScriptApp.getService().getUrl();
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "File ZIP proyek berhasil diunggah ke Google Drive!",
          data: {
            id: newFile.getId(),
            name: newFile.getName(),
            url:
              apiURL +
              "?action=download&fileId=" +
              newFile.getId() +
              "&token=" +
              encodeURIComponent(token),
          },
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // A0-b. Aksi Impor Folder Google Drive Eksternal (importDrive)
    if (action === "importDrive") {
      let sourceFolderId = postData.folderId || postData.url;
      const parentId = postData.parentFolderId;

      if (!sourceFolderId) {
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "error",
            message: "Parameter folderId atau url dibutuhkan!",
          }),
        ).setMimeType(ContentService.MimeType.JSON);
      }

      // Ekstrak folder ID dari URL jika berupa URL lengkap
      if (sourceFolderId.indexOf("drive.google.com") !== -1) {
        const m1 = sourceFolderId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
        const m2 = sourceFolderId.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (m1) {
          sourceFolderId = m1[1];
        } else if (m2) {
          sourceFolderId = m2[1];
        }
      }

      try {
        const sourceFolder = DriveApp.getFolderById(sourceFolderId);
        const parentFolder = parentId
          ? assertVaultFolder(parentId, rootFolder)
          : rootFolder;

        // Buat folder baru di tujuan dengan nama yang sama dengan folder sumber
        const newFolder = parentFolder.createFolder(sourceFolder.getName());

        // Salin isi folder secara rekursif
        copyFolderRecursively(sourceFolder, newFolder);

        return ContentService.createTextOutput(
          JSON.stringify({
            status: "success",
            message:
              "Berhasil mengimpor folder '" +
              sourceFolder.getName() +
              "' beserta seluruh isinya ke vault!",
            data: {
              id: newFolder.getId(),
              name: newFolder.getName(),
            },
          }),
        ).setMimeType(ContentService.MimeType.JSON);
      } catch (e) {
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "error",
            message: "Gagal mengimpor Google Drive: " + e.toString(),
          }),
        ).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // A0. Aksi Impor File dari URL Eksternal (curl-to-vault)
    if (action === "importUrl") {
      const sourceUrl = postData.url;
      const fileName = postData.name;
      const parentId = postData.parentFolderId;
      if (!sourceUrl) {
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "error",
            message: "Parameter url dibutuhkan!",
          }),
        ).setMimeType(ContentService.MimeType.JSON);
      }
      try {
        // Jika URL adalah archive GitHub default branch, coba main lalu master
        let finalUrl = sourceUrl;
        let response = UrlFetchApp.fetch(finalUrl, {
          muteHttpExceptions: true,
        });
        if (
          response.getResponseCode() === 404 &&
          /\/archive\/refs\/heads\/main\.zip$/.test(finalUrl)
        ) {
          finalUrl = finalUrl.replace(
            "/archive/refs/heads/main.zip",
            "/archive/refs/heads/master.zip",
          );
          response = UrlFetchApp.fetch(finalUrl, { muteHttpExceptions: true });
        }
        const code = response.getResponseCode();
        if (code !== 200) {
          return ContentService.createTextOutput(
            JSON.stringify({
              status: "error",
              message: "Gagal mengambil URL (HTTP " + code + ")!",
            }),
          ).setMimeType(ContentService.MimeType.JSON);
        }
        const blob = response.getBlob();
        const finalName =
          fileName ||
          (function () {
            // Coba ambil nama dari Content-Disposition, lalu dari path URL
            const cd = response.getHeaders()["Content-Disposition"];
            if (cd) {
              const m = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
              if (m) return decodeURIComponent(m[1]);
            }
            const path = sourceUrl.split("?")[0].split("#")[0];
            const seg = path.split("/").filter(Boolean).pop();
            return seg || "downloaded_file";
          })();
        blob.setName(finalName);
        const parentFolder = parentId
          ? assertVaultFolder(parentId, rootFolder)
          : rootFolder;
        const newFile = parentFolder.createFile(blob);
        const apiURL = ScriptApp.getService().getUrl();
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "success",
            message: "File berhasil diunduh dari URL ke vault!",
            data: {
              id: newFile.getId(),
              name: newFile.getName(),
              url:
                apiURL +
                "?action=download&fileId=" +
                newFile.getId() +
                "&token=" +
                encodeURIComponent(token),
            },
          }),
        ).setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "error",
            message: "Gagal mengimpor URL: " + err.toString(),
          }),
        ).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // A. Aksi Delete File / Folder Tunggal
    if (action === "delete") {
      const fileId = postData.fileId;
      try {
        const file = assertVaultFile(fileId, rootFolder);
        file.setTrashed(true);
      } catch (err) {
        const folder = assertVaultFolder(fileId, rootFolder);
        if (folder.getId() === rootFolder.getId()) throw new Error("Root Vault tidak dapat dihapus.");
        folder.setTrashed(true);
      }
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Item berhasil dihapus!",
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // B. Aksi Rename File / Folder
    if (action === "rename") {
      const fileId = postData.fileId;
      const newName = postData.newName;
      let item;
      try {
        item = assertVaultFile(fileId, rootFolder);
      } catch (err) {
        item = assertVaultFolder(fileId, rootFolder);
      }
      item.setName(newName);
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Nama item berhasil diubah!",
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // C. Aksi Buat Folder Baru
    if (action === "createFolder") {
      const folderName = postData.folderName;
      const parentId = postData.parentFolderId;
      const parentFolder = parentId
        ? assertVaultFolder(parentId, rootFolder)
        : rootFolder;
      const newFolder = parentFolder.createFolder(folderName);

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Folder berhasil dibuat!",
          data: {
            id: newFolder.getId(),
            name: newFolder.getName(),
          },
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // D. Aksi Bulk Delete (Hapus Banyak File & Folder)
    if (action === "deleteMultiple") {
      const fileIds = postData.fileIds || [];
      const folderIds = postData.folderIds || [];

      fileIds.forEach((id) => {
        try {
          assertVaultFile(id, rootFolder).setTrashed(true);
        } catch (err) {}
      });

      folderIds.forEach((id) => {
        try {
          const folder = assertVaultFolder(id, rootFolder);
          if (folder.getId() !== rootFolder.getId()) folder.setTrashed(true);
        } catch (err) {}
      });

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Item-item terpilih berhasil dihapus!",
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // E. Aksi Pindah File / Folder (Move Item)
    if (action === "move") {
      const targetFolderId = postData.targetFolderId;
      const fileIds = postData.fileIds || [];
      const folderIds = postData.folderIds || [];
      const targetFolder =
        targetFolderId === "root" || !targetFolderId
          ? rootFolder
          : assertVaultFolder(targetFolderId, rootFolder);

      fileIds.forEach((id) => {
        try {
          assertVaultFile(id, rootFolder).moveTo(targetFolder);
        } catch (err) {}
      });

      folderIds.forEach((id) => {
        try {
          const folder = assertVaultFolder(id, rootFolder);
          if (folder.getId() !== rootFolder.getId()) folder.moveTo(targetFolder);
        } catch (err) {}
      });

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Item berhasil dipindahkan!",
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // F. Aksi Simpan / Edit File Teks (Save Text File)
    if (action === "saveTextFile") {
      const fileId = postData.fileId;
      const content = postData.content;
      const fileName = postData.name;
      const parentId = postData.parentFolderId;

      if (fileId) {
        // Update file teks yang sudah ada
        const file = assertVaultFile(fileId, rootFolder);
        file.setContent(content);
        if (fileName) file.setName(fileName);
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "success",
            message: "File teks berhasil disimpan!",
            data: {
              id: file.getId(),
              name: file.getName(),
            },
          }),
        ).setMimeType(ContentService.MimeType.JSON);
      } else {
        // Buat file teks baru
        const parentFolder = parentId
          ? assertVaultFolder(parentId, rootFolder)
          : rootFolder;
        const finalName = fileName || "untitled.txt";
        const file = parentFolder.createFile(finalName, content, "text/plain");
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "success",
            message: "File baru berhasil dibuat!",
            data: {
              id: file.getId(),
              name: file.getName(),
            },
          }),
        ).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // G. Default: Aksi Upload File
    if (postData.base64) {
      const base64Data = postData.base64;
      const fileName = postData.name;
      const fileType = postData.type;
      const parentId = postData.parentFolderId;

      const parentFolder = parentId
        ? assertVaultFolder(parentId, rootFolder)
        : rootFolder;
      const decodedBytes = Utilities.base64Decode(base64Data);
      const blob = Utilities.newBlob(decodedBytes, fileType, fileName);
      const newFile = parentFolder.createFile(blob);

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "File berhasil diunggah!",
          data: {
            id: newFile.getId(),
            name: newFile.getName(),
          },
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        status: "error",
        message: "Aksi tidak dikenal!",
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: "error",
        message: "Server Error: " + error.toString(),
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// Fungsi pembantu untuk memicu dialog otorisasi UrlFetchApp di editor Google Apps Script
function triggerAuthorization() {
  UrlFetchApp.fetch("https://www.google.com");
}

function collectBlobs(folder, blobs, path) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    try {
      const blob = file.getBlob().clone();
      blob.setName(path + file.getName());
      blobs.push(blob);
    } catch (e) {
      // Abaikan file yang bermasalah / terotori
    }
  }
  const subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    const subfolder = subfolders.next();
    collectBlobs(subfolder, blobs, path + subfolder.getName() + "/");
  }
}

function copyFolderRecursively(sourceFolder, targetFolder) {
  // 1. Copy files
  const files = sourceFolder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    try {
      file.makeCopy(file.getName(), targetFolder);
    } catch (e) {
      // Abaikan jika ada file terproteksi
    }
  }

  // 2. Copy subfolders
  const subfolders = sourceFolder.getFolders();
  while (subfolders.hasNext()) {
    const subfolder = subfolders.next();
    try {
      const newSubfolder = targetFolder.createFolder(subfolder.getName());
      copyFolderRecursively(subfolder, newSubfolder);
    } catch (e) {
      // Abaikan kegagalan subfolder
    }
  }
}
