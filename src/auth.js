// URL script Google Drive lu.
const API_URL = "https://script.google.com/macros/s/AKfycbzmtcd52ckx5dK58We4-lCpdaQ4HWfy5tY0PmT95WbIMQr6kkYI8ykvOCIuJfi04Y-g/exec";

export function getApiUrl() {
    return API_URL;
}

export function login(token) {
    if (!token) return false;
    sessionStorage.setItem('vault_token', token);
    return true;
}

export function checkToken() {
    return sessionStorage.getItem('vault_token');
}

// FUNGSI INI YANG HILANG KEMARIN BIKIN ERROR:
export function checkAuth() {
    if (!checkToken()) {
        window.location.href = 'index.html';
    }
}

export function logout() {
    sessionStorage.removeItem('vault_token');
    window.location.href = 'index.html';
}