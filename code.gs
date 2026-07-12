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
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

// Helper: Memvalidasi token (handshake key)
function validateToken(token) {
  if (!token) return false;
  const scriptProperties = PropertiesService.getScriptProperties();
  const correctKey = scriptProperties.getProperty("HANDSHAKE_KEY");

  // Inisialisasi otomatis jika belum ada (memudahkan setup awal)
  if (!correctKey) {
    scriptProperties.setProperty("HANDSHAKE_KEY", "default-cyber-secret-1337");
    scriptProperties.setProperty(
      "SYSTEM_CONFIG",
      JSON.stringify({
        vaultName: "Cyber Vault Secure Storage",
        maxFileSizeMB: 15,
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
        ],
      }),
    );
    return token === "default-cyber-secret-1337";
  }
  return token === correctKey;
}

// 1. Secret Storage: Ambil konfigurasi sistem
function getConfigs(requestKey) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const correctKey = scriptProperties.getProperty("HANDSHAKE_KEY");

  if (requestKey === correctKey) {
    const systemConfigStr = scriptProperties.getProperty("SYSTEM_CONFIG");
    const systemConfig = systemConfigStr ? JSON.parse(systemConfigStr) : {};
    return {
      status: "success",
      config: systemConfig,
    };
  } else {
    return {
      status: "error",
      message: "Handshake Key tidak valid!",
    };
  }
}

// 2. HTTP GET Request Handler
function doGet(e) {
  const action = e.parameter.action;
  const token = e.parameter.token;

  // A. Handshake Endpoint
  if (action === "handshake") {
    const key = e.parameter.key;
    const result = getConfigs(key);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
      ContentService.MimeType.JSON,
    );
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
  <title>Downloading \${filename}...</title>
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
    <p style="color: #f1f5f9; font-weight: 600; margin-top: 15px; word-break: break-all;">\${filename}</p>
    <div class="spinner"></div>
  </div>
  
  <script>
    (function() {
      const b64 = "\${base64Data}";
      const filename = "\${filename}";
      const mime = "\${contentType}";
      
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

  // D. List Files & Folders
  const folderId = e.parameter.folderId;
  return listFiles(token, folderId);
}

// Helper: List semua file dan folder dalam folder Cyber Vault
function listFiles(token, folderId) {
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
      fileList.push({
        id: subfolder.getId(),
        name: subfolder.getName(),
        size: 0,
        isFolder: true,
        url: "",
      });
    }

    // 2. Ambil File
    const files = parentFolder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
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

    // A. Aksi Delete File / Folder Tunggal
    if (action === "delete") {
      const fileId = postData.fileId;
      try {
        const file = DriveApp.getFileById(fileId);
        file.setTrashed(true);
      } catch (err) {
        const folder = DriveApp.getFolderById(fileId);
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

    // D. Aksi Bulk Delete (Hapus Banyak File & Folder)
    if (action === "deleteMultiple") {
      const fileIds = postData.fileIds || [];
      const folderIds = postData.folderIds || [];

      fileIds.forEach((id) => {
        try {
          DriveApp.getFileById(id).setTrashed(true);
        } catch (err) {}
      });

      folderIds.forEach((id) => {
        try {
          DriveApp.getFolderById(id).setTrashed(true);
        } catch (err) {}
      });

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Item-item terpilih berhasil dihapus!",
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // E. Default: Aksi Upload File
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
