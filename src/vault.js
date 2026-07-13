import { getApiUrl, checkToken } from './auth.js';

// 1. Ambil Daftar File dan Folder (List)
export async function fetchFiles(folderId = null) {
    const token = checkToken();
    const apiUrl = getApiUrl();
    try {
        let url = `${apiUrl}?token=${encodeURIComponent(token)}`;
        if (folderId) {
            url += `&folderId=${encodeURIComponent(folderId)}`;
        }
        const response = await fetch(url);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error("Gagal memuat berkas:", error);
        return { status: "error", message: "Koneksi terputus/CORS" };
    }
}

// 2. Unggah File Baru (Add)
export function uploadFile(file, parentFolderId, onProgress, onComplete) {
    const token = checkToken();
    const apiUrl = getApiUrl();
    const reader = new FileReader();
    
    onProgress("Mengonversi file ke format aman...");
    
    reader.onload = async function(e) {
        const base64Data = e.target.result.split(',')[1];
        
        // Proteksi limit payload Google Script (~15MB biar aman)
        if (base64Data.length * 0.75 > 15 * 1024 * 1024) {
            onComplete({ status: "error", message: "Ukuran file terlalu besar! Maksimal 15MB." });
            return;
        }

        onProgress(`Mengirim ${file.name} ke cloud...`);
        try {
            const response = await fetch(apiUrl, {
                method: "POST",
                body: JSON.stringify({
                    token: token,
                    base64: base64Data,
                    name: file.name,
                    type: file.type,
                    parentFolderId: parentFolderId
                })
            });
            const data = await response.json();
            onComplete(data);
        } catch (err) {
            onComplete({ status: "error", message: "Gagal mengunggah file." });
        }
    };
    reader.readAsDataURL(file);
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
