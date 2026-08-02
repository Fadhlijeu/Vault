// code.gs - Google Apps Script Backend for Cyber Vault

// Helper: Membuka atau membuat folder Cyber Vault di Google Drive
function getOrCreateTrashFolder() {
  var sp = PropertiesService.getScriptProperties();
  var tid = sp.getProperty("TRASH_FOLDER_ID");
  if (tid) { try { return DriveApp.getFolderById(tid); } catch(e) {} }
  var root = getOrCreateFolder();
  var folders = root.getFoldersByName("_vault_trash");
  if (folders.hasNext()) { var t = folders.next(); sp.setProperty("TRASH_FOLDER_ID", t.getId()); return t; }
  var t = root.createFolder("_vault_trash");
  sp.setProperty("TRASH_FOLDER_ID", t.getId());
  return t;
}

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
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

// Original backend token validation (including first-run setup).
function validateToken(token) {
  if (!token) return false;
  const scriptProperties = PropertiesService.getScriptProperties();
  const correctKey = scriptProperties.getProperty("HANDSHAKE_KEY");
  if (!correctKey) {
    scriptProperties.setProperty("HANDSHAKE_KEY", "default-cyber-secret-1337");
    scriptProperties.setProperty(
      "SYSTEM_CONFIG",
      JSON.stringify({
        vaultName: "Cyber Vault Secure Storage",
        maxFileSizeMB: 0,
        allowedExtensions: [
          "png",
          "jpg",
          "jpeg",
          "gif",
          "webp",
          "pdf",
          "txt",
          "zip",
          "mp4",
          "*",
        ],
      }),
    );
    return token === "default-cyber-secret-1337";
  }
  return token === correctKey;
}

function getConfigs(requestKey) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const correctKey = scriptProperties.getProperty("HANDSHAKE_KEY");
  const config = scriptProperties.getProperty("SYSTEM_CONFIG");
  if (requestKey !== correctKey)
    return { status: "error", message: "Handshake Key tidak valid!" };
  return { status: "success", config: config ? JSON.parse(config) : {} };
}

// 2. HTTP GET Request Handler
function doGet(e) {
  const action = e.parameter.action;
  const token = e.parameter.token;

  if (action === "handshake") {
    return ContentService.createTextOutput(
      JSON.stringify(getConfigs(e.parameter.key)),
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // B. Validasi Token untuk Aksi Lainnya
  if (!validateToken(token)) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: "error",
        message: "Akses Ditolak: Token Tidak Valid!",
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "search") {
    return searchVault(e.parameter.q || "");
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
      const folder = DriveApp.getFolderById(folderId);
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
    body {
      background-color: #0f172a;
      color: #38bdf8;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      text-align: center;
      padding: 30px;
      border: 1px solid rgba(56, 189, 248, 0.2);
      background: rgba(30, 41, 59, 0.7);
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(12px);
      max-width: 400px;
      width: 90%;
    }
    h2 {
      margin: 0 0 10px 0;
      letter-spacing: 0.1em;
      font-size: 1.5rem;
    }
    p {
      color: #94a3b8;
      font-size: 0.9rem;
      margin: 5px 0;
    }
    .spinner {
      border: 3px solid rgba(56, 189, 248, 0.1);
      border-top: 3px solid #38bdf8;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      animation: spin 1s linear infinite;
      margin: 20px auto 0 auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>CYBER VAULT</h2>
    <p>Proxy Stream Folder ZIP Download</p>
    <p style="color: #f1f5f9; font-weight: 600; margin-top: 15px; word-break: break-all;">${zipName}</p>
    <div class="spinner"></div>
  </div>

  <script>
    (function() {
      const b64 = "${base64Data}";
      const filename = "${zipName}";
      const mime = "${contentType}";

      const byteCharacters = atob(b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {type: mime});

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => { window.close(); }, 2000);
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
      const file = DriveApp.getFileById(fileId);
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
    body {
      background-color: #0f172a;
      color: #38bdf8;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      text-align: center;
      padding: 30px;
      border: 1px solid rgba(56, 189, 248, 0.2);
      background: rgba(30, 41, 59, 0.7);
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(12px);
      max-width: 400px;
      width: 90%;
    }
    h2 {
      margin: 0 0 10px 0;
      letter-spacing: 0.1em;
      font-size: 1.5rem;
    }
    p {
      color: #94a3b8;
      font-size: 0.9rem;
      margin: 5px 0;
    }
    .spinner {
      border: 3px solid rgba(56, 189, 248, 0.1);
      border-top: 3px solid #38bdf8;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      animation: spin 1s linear infinite;
      margin: 20px auto 0 auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>CYBER VAULT</h2>
    <p>Proxy Stream Download</p>
    <p style="color: #f1f5f9; font-weight: 600; margin-top: 15px; word-break: break-all;">${filename}</p>
    <div class="spinner"></div>
  </div>

  <script>
    (function() {
      const b64 = "${base64Data}";
      const filename = "${filename}";
      const mime = "${contentType}";

      const byteCharacters = atob(b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {type: mime});

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Tutup tab setelah download dimulai
      setTimeout(() => { window.close(); }, 2000);
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

  // C. Recursive Folder Tree
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
      ("0" + d.getDate()).slice(-2) +
      "/" +
      ("0" + (d.getMonth() + 1)).slice(-2) +
      "/" +
      d.getFullYear() +
      " " +
      ("0" + d.getHours()).slice(-2) +
      ":" +
      ("0" + d.getMinutes()).slice(-2);
    items.push({
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
      ? DriveApp.getFolderById(folderId)
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
          ? DriveApp.getFolderById(parentId)
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
        // Normalisasi URL GitHub: repo page / .git → archive .zip
        var finalUrl = sourceUrl;
        var ghMatch = finalUrl.match(/^https?:\/\/(?:www\.)?github\.com\/([^\/]+)\/([^\/\?#]+?)(?:\.git)?(?:\/tree\/([^\/\?#]+))?(?:\/?\?.*)?$/);
        if (ghMatch) {
          var ghUser = ghMatch[1], ghRepo = ghMatch[2].replace(/\.git$/, ''), ghBranch = ghMatch[3] || 'main';
          finalUrl = 'https://github.com/' + ghUser + '/' + ghRepo + '/archive/refs/heads/' + ghBranch + '.zip';
        }
        // Jika URL adalah archive GitHub default branch, coba main lalu master
        var fetchOptions = {
          muteHttpExceptions: true,
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
        };
        let response = UrlFetchApp.fetch(finalUrl, fetchOptions);
        if (
          response.getResponseCode() === 404 &&
          /\/archive\/refs\/heads\/main\.zip$/.test(finalUrl)
        ) {
          finalUrl = finalUrl.replace(
            "/archive/refs/heads/main.zip",
            "/archive/refs/heads/master.zip",
          );
          response = UrlFetchApp.fetch(finalUrl, fetchOptions);
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
        var allHeaders = response.getHeaders();
        var contentType = allHeaders["Content-Type"] || allHeaders["content-type"] || "";
        if (contentType.indexOf("text/html") !== -1) {
          return ContentService.createTextOutput(
            JSON.stringify({
              status: "error",
              message: "URL mengembalikan halaman HTML, bukan file sebenarnya. Kemungkinan GitHub rate-limit atau URL tidak valid.",
            }),
          ).setMimeType(ContentService.MimeType.JSON);
        }
        const blob = response.getBlob();
        const finalName =
          fileName ||
          (function () {
            // Coba ambil nama dari Content-Disposition, lalu dari path URL
            var respHeaders = response.getHeaders();
            var cd = respHeaders["Content-Disposition"] || respHeaders["content-disposition"];
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
          ? DriveApp.getFolderById(parentId)
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

    // A. Aksi Delete File / Folder Tunggal (pindah ke Trash)
    if (action === "delete") {
      const fileId = postData.fileId;
      try {
        var trashFolder = getOrCreateTrashFolder();
        var file = DriveApp.getFileById(fileId);
        file.setDescription(JSON.stringify({ originalParent: file.getParents().hasNext() ? file.getParents().next().getId() : "" }));
        file.moveTo(trashFolder);
      } catch (err) {
        try {
          var trashFolder = getOrCreateTrashFolder();
          var folder = DriveApp.getFolderById(fileId);
          folder.setDescription(JSON.stringify({ originalParent: folder.getParents().hasNext() ? folder.getParents().next().getId() : "" }));
          folder.moveTo(trashFolder);
        } catch(e2) {
          return ContentService.createTextOutput(
            JSON.stringify({ status: "error", message: "Gagal memindahkan ke Trash: " + e2.toString() }),
          ).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Item dipindahkan ke Trash!",
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // A2. Aksi List Trash
    if (action === "listTrash") {
      try {
        var trashFolder = getOrCreateTrashFolder();
        var files = trashFolder.getFiles();
        var folders = trashFolder.getFolders();
        var items = [];
        while (files.hasNext()) { var f = files.next(); items.push({ id: f.getId(), name: f.getName(), isFolder: false, size: f.getSize(), date: f.getLastUpdated() }); }
        while (folders.hasNext()) { var f = folders.next(); items.push({ id: f.getId(), name: f.getName(), isFolder: true, size: 0, date: f.getLastUpdated() }); }
        return ContentService.createTextOutput(JSON.stringify({ status: "success", data: items })).setMimeType(ContentService.MimeType.JSON);
      } catch(err) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Gagal mengambil Trash: " + err.toString() })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // A3. Aksi Restore dari Trash
    if (action === "restoreFromTrash") {
      var itemId = postData.itemId;
      try {
        var item;
        try { item = DriveApp.getFileById(itemId); } catch(e) { item = DriveApp.getFolderById(itemId); }
        var desc = item.getDescription();
        var originalParent = "";
        try { var parsed = JSON.parse(desc); originalParent = parsed.originalParent || ""; } catch(e) {}
        var target = originalParent ? DriveApp.getFolderById(originalParent) : getOrCreateFolder();
        item.moveTo(target);
        item.setDescription("");
        return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Item dikembalikan dari Trash!" })).setMimeType(ContentService.MimeType.JSON);
      } catch(err) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Gagal restore: " + err.toString() })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // A4. Aksi Empty Trash (hapus permanen semua item di trash)
    if (action === "emptyTrash") {
      try {
        var trashFolder = getOrCreateTrashFolder();
        var files = trashFolder.getFiles();
        while (files.hasNext()) files.next().setTrashed(true);
        var folders = trashFolder.getFolders();
        while (folders.hasNext()) folders.next().setTrashed(true);
        return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Trash dikosongkan!" })).setMimeType(ContentService.MimeType.JSON);
      } catch(err) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Gagal empty trash: " + err.toString() })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // B. Aksi Rename File / Folder
    if (action === "rename") {
      const fileId = postData.fileId;
      const newName = postData.newName;
      let item;
      try {
        item = DriveApp.getFileById(fileId);
      } catch (err) {
        item = DriveApp.getFolderById(fileId);
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
        ? DriveApp.getFolderById(parentId)
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

    // D. Aksi Bulk Delete (Pindah ke Trash)
    if (action === "deleteMultiple") {
      const fileIds = postData.fileIds || [];
      const folderIds = postData.folderIds || [];
      var trashFolder = getOrCreateTrashFolder();

      fileIds.forEach((id) => {
        try {
          var f = DriveApp.getFileById(id);
          f.setDescription(JSON.stringify({ originalParent: f.getParents().hasNext() ? f.getParents().next().getId() : "" }));
          f.moveTo(trashFolder);
        } catch (err) {}
      });

      folderIds.forEach((id) => {
        try {
          var f = DriveApp.getFolderById(id);
          f.setDescription(JSON.stringify({ originalParent: f.getParents().hasNext() ? f.getParents().next().getId() : "" }));
          f.moveTo(trashFolder);
        } catch (err) {}
      });

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Item-item dipindahkan ke Trash!",
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
          : DriveApp.getFolderById(targetFolderId);

      fileIds.forEach((id) => {
        try {
          DriveApp.getFileById(id).moveTo(targetFolder);
        } catch (err) {}
      });

      folderIds.forEach((id) => {
        try {
          DriveApp.getFolderById(id).moveTo(targetFolder);
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
        const file = DriveApp.getFileById(fileId);
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
          ? DriveApp.getFolderById(parentId)
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

    // F2. Aksi Inisialisasi Resumable Upload Google Drive (Untuk File Sangat Besar > 10MB - Ratusan GB)
    if (action === "initResumableUpload") {
      const fileName = postData.name || "unnamed_file";
      const fileType = postData.type || "application/octet-stream";
      const fileSize = postData.size;
      const parentId = postData.parentFolderId;
      const parentFolder = parentId ? DriveApp.getFolderById(parentId) : rootFolder;

      try {
        const driveApiUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
        const headers = {
          "Authorization": "Bearer " + ScriptApp.getOAuthToken(),
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": fileType
        };
        if (fileSize) {
          headers["X-Upload-Content-Length"] = fileSize.toString();
        }
        const metadata = {
          name: fileName,
          parents: [parentFolder.getId()]
        };

        const response = UrlFetchApp.fetch(driveApiUrl, {
          method: "post",
          headers: headers,
          payload: JSON.stringify(metadata),
          muteHttpExceptions: true
        });

        if (response.getResponseCode() === 200) {
          const respHeaders = response.getHeaders();
          const uploadUrl = respHeaders["Location"] || respHeaders["location"];
          if (uploadUrl) {
            return ContentService.createTextOutput(
              JSON.stringify({
                status: "success",
                message: "Sesi resumable upload berhasil dibuat!",
                uploadUrl: uploadUrl
              })
            ).setMimeType(ContentService.MimeType.JSON);
          }
        }
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "error",
            message: "Gagal membuat sesi resumable upload (HTTP " + response.getResponseCode() + ")"
          })
        ).setMimeType(ContentService.MimeType.JSON);
      } catch (errResumable) {
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "error",
            message: "Gagal inisialisasi upload Drive: " + errResumable.toString()
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // F3. Aksi Upload Chunk (Fallback Chunking via Apps Script)
    if (action === "uploadChunk") {
      const uploadId = postData.uploadId;
      const chunkIndex = postData.chunkIndex;
      const totalChunks = postData.totalChunks;
      const chunkBase64 = postData.chunkBase64;
      const fileName = postData.name;
      const fileType = postData.type || "application/octet-stream";
      const parentId = postData.parentFolderId;

      if (!uploadId || chunkIndex === undefined || !chunkBase64) {
        return ContentService.createTextOutput(
          JSON.stringify({ status: "error", message: "Parameter chunk tidak lengkap!" })
        ).setMimeType(ContentService.MimeType.JSON);
      }

      try {
        const chunkFolder = getOrCreateChunkFolder(uploadId);
        const chunkBytes = Utilities.base64Decode(chunkBase64);
        const chunkBlob = Utilities.newBlob(chunkBytes, "application/octet-stream", "chunk_" + String(chunkIndex).padStart(6, '0'));
        chunkFolder.createFile(chunkBlob);

        return ContentService.createTextOutput(
          JSON.stringify({
            status: "success",
            message: "Chunk " + (chunkIndex + 1) + "/" + totalChunks + " terunggah!",
            uploadId: uploadId,
            chunkIndex: chunkIndex
          })
        ).setMimeType(ContentService.MimeType.JSON);
      } catch (errChunk) {
        return ContentService.createTextOutput(
          JSON.stringify({ status: "error", message: "Gagal mengunggah chunk " + chunkIndex + ": " + errChunk.toString() })
        ).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // F4. Aksi Gabung Chunk (Finish Chunked Upload)
    if (action === "finishChunkedUpload") {
      const uploadId = postData.uploadId;
      const fileName = postData.name;
      const fileType = postData.type || "application/octet-stream";
      const parentId = postData.parentFolderId;
      const parentFolder = parentId ? DriveApp.getFolderById(parentId) : rootFolder;

      try {
        const chunkFolder = getOrCreateChunkFolder(uploadId);
        const filesIter = chunkFolder.getFiles();
        const chunkFiles = [];
        while (filesIter.hasNext()) {
          chunkFiles.push(filesIter.next());
        }
        chunkFiles.sort(function(a, b) {
          return a.getName().localeCompare(b.getName());
        });

        let totalLength = 0;
        const blobsData = [];
        for (let i = 0; i < chunkFiles.length; i++) {
          const bytes = chunkFiles[i].getBlob().getBytes();
          blobsData.push(bytes);
          totalLength += bytes.length;
        }

        const combinedBytes = new Uint8Array(totalLength);
        let offset = 0;
        for (let i = 0; i < blobsData.length; i++) {
          combinedBytes.set(blobsData[i], offset);
          offset += blobsData[i].length;
        }

        const finalBlob = Utilities.newBlob(Array.from(combinedBytes), fileType, fileName);
        const newFile = parentFolder.createFile(finalBlob);

        // Hapus folder chunk sementara
        try { chunkFolder.setTrashed(true); } catch(eClean) {}

        return ContentService.createTextOutput(
          JSON.stringify({
            status: "success",
            message: "File " + fileName + " berhasil digabungkan!",
            data: { id: newFile.getId(), name: newFile.getName() }
          })
        ).setMimeType(ContentService.MimeType.JSON);
      } catch (errFinish) {
        return ContentService.createTextOutput(
          JSON.stringify({ status: "error", message: "Gagal menggabungkan chunk: " + errFinish.toString() })
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
        ? DriveApp.getFolderById(parentId)
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

// Searches the complete vault tree in one Apps Script request.
function searchVault(query) {
  const needle = String(query || "").toLowerCase();
  const results = [];
  function visit(folder) {
    const folders = folder.getFolders();
    while (folders.hasNext()) {
      const child = folders.next();
      const entry = {
        id: child.getId(),
        name: child.getName(),
        isFolder: true,
        size: 0,
        fileCount: 0,
        folderCount: 0,
        dateCreated: Utilities.formatDate(
          child.getDateCreated(),
          Session.getScriptTimeZone(),
          "dd/MM/yyyy HH:mm",
        ),
      };
      const files = child.getFiles();
      while (files.hasNext()) {
        entry.fileCount++;
        entry.size += files.next().getSize();
      }
      if (entry.name.toLowerCase().indexOf(needle) !== -1) results.push(entry);
      visit(child);
    }
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      if (file.getName().toLowerCase().indexOf(needle) !== -1) {
        results.push({
          id: file.getId(),
          name: file.getName(),
          isFolder: false,
          size: file.getSize(),
          dateCreated: Utilities.formatDate(
            file.getDateCreated(),
            Session.getScriptTimeZone(),
            "dd/MM/yyyy HH:mm",
          ),
        });
      }
    }
  }
  try {
    visit(getOrCreateFolder());
    return ContentService.createTextOutput(
      JSON.stringify({ status: "success", data: results }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: "error",
        message: "Pencarian gagal: " + error.toString(),
      }),
    ).setMimeType(ContentService.MimeType.JSON);
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

function getOrCreateChunkFolder(uploadId) {
  const root = getOrCreateFolder();
  let tempRoot;
  const tempFolders = root.getFoldersByName("_vault_temp_chunks");
  if (tempFolders.hasNext()) {
    tempRoot = tempFolders.next();
  } else {
    tempRoot = root.createFolder("_vault_temp_chunks");
  }
  const chunkFolders = tempRoot.getFoldersByName(uploadId);
  if (chunkFolders.hasNext()) {
    return chunkFolders.next();
  }
  return tempRoot.createFolder(uploadId);
}
