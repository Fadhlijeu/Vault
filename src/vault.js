import { getApiUrl, checkToken } from './auth.js';

// 1. Ambil Daftar File dan Folder (List)
export async function fetchFiles(folderId = null, recursive = false) {
    const token = checkToken();
    const apiUrl = getApiUrl();
    try {
        let url = `${apiUrl}?token=${encodeURIComponent(token)}`;
        if (folderId) {
            url += `&folderId=${encodeURIComponent(folderId)}`;
        }
        if (recursive) {
            url += `&recursive=true`;
        }
        const response = await fetch(url);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error("Gagal memuat berkas:", error);
        return { status: "error", message: "Koneksi terputus/CORS" };
    }
}

// Server-side recursive search avoids one browser request per sub-folder.
export async function searchFiles(query) {
    const token = checkToken();
    const apiUrl = getApiUrl();
    try {
        const response = await fetch(`${apiUrl}?action=search&token=${encodeURIComponent(token)}&q=${encodeURIComponent(query)}`);
        return await response.json();
    } catch (error) {
        console.error('Gagal mencari berkas:', error);
        return { status: 'error', message: 'Pencarian tidak dapat terhubung.' };
    }
}

// 2. Unggah File Baru (Add) - Supercharged High-Speed Uploader
export async function uploadFile(file, parentFolderId, onProgress = () => {}, onComplete = () => {}) {
    const token = checkToken();
    const apiUrl = getApiUrl();

    if (!file) {
        onComplete({ status: "error", message: "File tidak boleh kosong!" });
        return;
    }

    const SINGLE_POST_MAX_BYTES = 20 * 1024 * 1024; // 20MB limit untuk direct single Base64 POST (Super Cepat!)
    const CHUNK_SIZE = 12 * 1024 * 1024; // 12MB per chunk untuk file sangat besar (>20MB)

    // Tier 1: Direct Single Base64 POST untuk file (<= 20MB) -> Super Cepat (Instant!)
    if (file.size <= SINGLE_POST_MAX_BYTES) {
        onProgress(`Membaca ${file.name}...`, 15, 0, file.size);
        const reader = new FileReader();
        reader.onload = async function(e) {
            const base64Data = e.target.result.split(',')[1];
            onProgress(`Mengirim ${file.name} ke cloud...`, 50, Math.round(file.size * 0.5), file.size);
            try {
                const response = await fetch(apiUrl, {
                    method: "POST",
                    body: JSON.stringify({
                        token: token,
                        base64: base64Data,
                        name: file.name,
                        type: file.type || "application/octet-stream",
                        parentFolderId: parentFolderId
                    })
                });
                const data = await response.json();
                if (data.status === "success") {
                    onProgress(`Selesai mengunggah ${file.name}`, 100, file.size, file.size);
                }
                onComplete(data);
            } catch (err) {
                onComplete({ status: "error", message: "Gagal mengunggah file: " + (err.message || "Koneksi terputus") });
            }
        };
        reader.onerror = function() {
            onComplete({ status: "error", message: "Gagal membaca berkas lokal." });
        };
        reader.readAsDataURL(file);
        return;
    }

    // Tier 2: Chunked Upload High-Speed Pipeline (File > 20MB - Ratusan GB)
    const uploadId = "up_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    onProgress(`Memulai chunked upload (Chunk 12MB, Total ${totalChunks} bagian)...`, 5, 0, file.size);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);

        const chunkBase64 = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result.split(',')[1]);
            r.onerror = () => rej(new Error("Gagal membaca chunk."));
            r.readAsDataURL(chunkBlob);
        });

        const pct = 5 + Math.round((chunkIndex / totalChunks) * 85);
        onProgress(`Mengirim Bagian [${chunkIndex + 1}/${totalChunks}] ${file.name}...`, pct, start, file.size);

        try {
            const cResp = await fetch(apiUrl, {
                method: "POST",
                body: JSON.stringify({
                    token: token,
                    action: "uploadChunk",
                    uploadId: uploadId,
                    chunkIndex: chunkIndex,
                    totalChunks: totalChunks,
                    chunkBase64: chunkBase64,
                    name: file.name,
                    type: file.type || "application/octet-stream",
                    parentFolderId: parentFolderId
                })
            });
            const cData = await cResp.json();
            if (cData.status !== "success") {
                onComplete({ status: "error", message: `Gagal pada chunk ${chunkIndex + 1}: ${cData.message}` });
                return;
            }
        } catch (errChunk) {
            onComplete({ status: "error", message: `Koneksi terputus saat mengunggah chunk ${chunkIndex + 1}/${totalChunks}.` });
            return;
        }
    }

    // Selesaikan & Gabungkan Chunk di Apps Script
    onProgress(`Menyambungkan seluruh berkas ${file.name}...`, 95, file.size, file.size);
    try {
        const fResp = await fetch(apiUrl, {
            method: "POST",
            body: JSON.stringify({
                token: token,
                action: "finishChunkedUpload",
                uploadId: uploadId,
                name: file.name,
                type: file.type || "application/octet-stream",
                parentFolderId: parentFolderId
            })
        });
        const fData = await fResp.json();
        onProgress(`Selesai mengunggah ${file.name}!`, 100, file.size, file.size);
        onComplete(fData);
    } catch (errFinish) {
        onComplete({ status: "error", message: "Gagal menyatukan chunk file di cloud." });
    }
}

// 3. Hapus File Tunggal (Delete)
export async function deleteFile(fileId) {
    const token = checkToken();
    const apiUrl = getApiUrl();
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            body: JSON.stringify({ token: token, action: "delete", fileId: fileId })
        });
        return await response.json();
    } catch (error) {
        return { status: "error", message: "Gagal menghapus file." };
    }
}

// 4. Ganti Nama File (Edit/Rename)
export async function renameFile(fileId, newName) {
    const token = checkToken();
    const apiUrl = getApiUrl();
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            body: JSON.stringify({ token: token, action: "rename", fileId: fileId, newName: newName })
        });
        return await response.json();
    } catch (error) {
        return { status: "error", message: "Gagal mengganti nama file." };
    }
}

// 5. Ambil data Blob file untuk pratinjau (Preview) biner secara aman
export async function fetchFileBlob(fileId) {
    const token = checkToken();
    const apiUrl = getApiUrl();
    try {
        const response = await fetch(`${apiUrl}?token=${encodeURIComponent(token)}&action=download&fileId=${fileId}&format=base64`);
        const result = await response.json();
        
        if (result.status === "success") {
            const byteCharacters = atob(result.base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            return new Blob([byteArray], { type: result.mimeType });
        } else {
            throw new Error(result.message || "Gagal mengambil file data.");
        }
    } catch (error) {
        console.error("Error fetching file blob:", error);
        return null;
    }
}

// 6. Buat Folder Baru
export async function createFolder(folderName, parentFolderId = null) {
    const token = checkToken();
    const apiUrl = getApiUrl();
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            body: JSON.stringify({
                token: token,
                action: "createFolder",
                folderName: folderName,
                parentFolderId: parentFolderId
            })
        });
        return await response.json();
    } catch (error) {
        return { status: "error", message: "Gagal membuat folder." };
    }
}

// 7. Hapus Banyak Item (Bulk Delete)
export async function deleteMultiple(fileIds = [], folderIds = []) {
    const token = checkToken();
    const apiUrl = getApiUrl();
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            body: JSON.stringify({
                token: token,
                action: "deleteMultiple",
                fileIds: fileIds,
                folderIds: folderIds
            })
        });
        return await response.json();
    } catch (error) {
        return { status: "error", message: "Gagal menghapus item terpilih." };
    }
}

// 8. Impor File dari URL Eksternal langsung ke vault (curl-to-vault)
export async function importFromUrl(url, name = null, parentFolderId = null) {
    const token = checkToken();
    const apiUrl = getApiUrl();
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            body: JSON.stringify({
                token: token,
                action: "importUrl",
                url: url,
                name: name,
                parentFolderId: parentFolderId
            })
        });
        return await response.json();
    } catch (error) {
        return { status: "error", message: "Gagal mengimpor file dari URL." };
    }
}

// 9. Pindahkan Item (Move File/Folder)
export async function moveItems(fileIds = [], folderIds = [], targetFolderId = null) {
    const token = checkToken();
    const apiUrl = getApiUrl();
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            body: JSON.stringify({
                token: token,
                action: "move",
                fileIds: fileIds,
                folderIds: folderIds,
                targetFolderId: targetFolderId
            })
        });
        return await response.json();
    } catch (error) {
        return { status: "error", message: "Gagal memindahkan item." };
    }
}

// 10. Simpan / Edit File Teks (Save Text File)
export async function saveTextFile(fileName, content, fileId = null, parentFolderId = null) {
    const token = checkToken();
    const apiUrl = getApiUrl();
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            body: JSON.stringify({
                token: token,
                action: "saveTextFile",
                fileId: fileId,
                content: content,
                name: fileName,
                parentFolderId: parentFolderId
            })
        });
        return await response.json();
    } catch (error) {
        return { status: "error", message: "Gagal menyimpan file teks." };
    }
}

// 11. Impor Google Drive Folder (Drive-to-Drive)
export async function importFromDrive(folderIdOrUrl, parentFolderId = null) {
    const token = checkToken();
    const apiUrl = getApiUrl();
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            body: JSON.stringify({
                token: token,
                action: "importDrive",
                url: folderIdOrUrl,
                parentFolderId: parentFolderId
            })
        });
        return await response.json();
    } catch (error) {
        return { status: "error", message: "Gagal mengimpor Google Drive." };
    }
}

// 12. Trash: List item di trash
export async function listTrash() {
    const token = checkToken();
    const apiUrl = getApiUrl();
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            body: JSON.stringify({ token, action: "listTrash" })
        });
        return await response.json();
    } catch (error) {
        return { status: "error", message: "Gagal mengambil Trash." };
    }
}

// 13. Trash: Restore item dari trash
export async function restoreFromTrash(itemId) {
    const token = checkToken();
    const apiUrl = getApiUrl();
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            body: JSON.stringify({ token, action: "restoreFromTrash", itemId })
        });
        return await response.json();
    } catch (error) {
        return { status: "error", message: "Gagal restore item." };
    }
}

// 14. Trash: Empty trash (hapus permanen)
export async function emptyTrash() {
    const token = checkToken();
    const apiUrl = getApiUrl();
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            body: JSON.stringify({ token, action: "emptyTrash" })
        });
        return await response.json();
    } catch (error) {
        return { status: "error", message: "Gagal mengosongkan Trash." };
    }
}
