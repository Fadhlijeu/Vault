import { getApiUrl, checkToken } from './auth.js';

const API_URL = getApiUrl();

// 1. Ambil Daftar File (List)
export async function fetchFiles() {
    const token = checkToken();
    try {
        // Kita pastikan token terkirim lewat URL parameter (?token=...)
        const response = await fetch(`${API_URL}?token=${encodeURIComponent(token)}`);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error("Gagal memuat berkas:", error);
        return { status: "error", message: "Koneksi terputus/CORS" };
    }
}

// 2. Unggah File Baru (Add)
export function uploadFile(file, onProgress, onComplete) {
    const token = checkToken();
    const reader = new FileReader();
    
    onProgress("Mengonversi file ke format aman...");
    
    reader.onload = async function(e) {
        const base64Data = e.target.result.split(',')[1];
        
        // Proteksi limit payload Google Script (~15MB biar aman)
        if (base64Data.length * 0.75 > 15 * 1024 * 1024) {
            onComplete({ status: "error", message: "Ukuran file terlalu besar! Maksimal 15MB." });
            return;
        }

        onProgress("Mengirim data ke Google Drive...");
        try {
            const response = await fetch(API_URL, {
                method: "POST",
                body: JSON.stringify({
                    token: token,
                    base64: base64Data,
                    name: file.name,
                    type: file.type
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

// 3. Hapus File (Delete)
export async function deleteFile(fileId) {
    const token = checkToken();
    try {
        const response = await fetch(API_URL, {
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
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({ token: token, action: "rename", fileId: fileId, newName: newName })
        });
        return await response.json();
    } catch (error) {
        return { status: "error", message: "Gagal mengganti nama file." };
    }
}