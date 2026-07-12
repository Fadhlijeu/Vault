// URL script Google Drive lu.
const API_URL = "https://script.google.com/macros/s/AKfycbzogCFKEjKq-8Mma70wJ-zAF2tpNS4sfOMe6tEWPEL57VVSfN0YKC0s6ulwq-1qeID2/exec";

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