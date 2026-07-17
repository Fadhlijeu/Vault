// src/auth.js

// Mendapatkan API URL dari localStorage secara sinkron untuk modul-modul lain
export function getApiUrl() {
    return localStorage.getItem('vault_api_url');
}

// Melakukan Handshake ke API awal (GATEWAY_URL) untuk mengambil konfigurasi
export async function login(token) {
    if (!token) return { status: "error", message: "Token tidak boleh kosong!" };
    
    // URL diambil dari localStorage (hasil input lokal via tombol Setup ⚙️)
    const gatewayUrl = getApiUrl();
    
    if (!gatewayUrl) {
        return { 
            status: "error", 
            message: "URL Google Apps Script belum disetel! Silakan klik tombol Setup (⚙️) di sudut kanan atas untuk memasukkan URL backend Anda." 
        };
    }
    
    try {
        // Keep the passcode out of URLs/history and exchange it for a short-lived session token.
        const response = await fetch(gatewayUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'handshake', token })
        });
        const data = await response.json();
        
        if (data.status === "success") {
            // Never retain the passcode in browser storage.
            localStorage.setItem('vault_token', data.sessionToken);
            localStorage.setItem('vault_config', JSON.stringify(data.config));
            return { status: "success" };
        } else {
            return { status: "error", message: data.message || "Token handshake salah/tidak sah!" };
        }
    } catch (error) {
        console.error("Handshake Error:", error);
        return { 
            status: "error", 
            message: "Gagal Handshake. Pastikan URL Apps Script yang Anda simpan di menu Setup (⚙️) sudah benar dan dideploy sebagai Web App dengan akses 'Anyone'." 
        };
    }
}

export function checkToken() {
    return localStorage.getItem('vault_token');
}

export function checkAuth() {
    if (!checkToken()) {
        window.location.href = 'index.html';
    }
}

export function logout() {
    localStorage.removeItem('vault_token');
    localStorage.removeItem('vault_api_url');
    localStorage.removeItem('vault_config');
    window.location.href = 'index.html';
}
