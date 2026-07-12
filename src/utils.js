// Format Bytes ke KB/MB/GB
export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Skema ikon & warna berdasarkan ekstensi file untuk estetika grid/list
export function getFileMeta(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    switch (ext) {
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp':
            return { icon: '🖼️', color: 'text-cyan-400', border: 'border-cyan-500/20', bg: 'bg-cyan-500/5' };
        case 'pdf': case 'doc': case 'docx': case 'txt': case 'md':
            return { icon: '📄', color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' };
        case 'mp4': case 'mkv': case 'avi': case 'mov': case 'mp3':
            return { icon: '🎥', color: 'text-purple-400', border: 'border-purple-500/20', bg: 'bg-purple-500/5' };
        case 'zip': case 'rar': case '7z': case 'tar':
            return { icon: '📦', color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/5' };
        default:
            return { icon: '📁', color: 'text-slate-400', border: 'border-slate-500/20', bg: 'bg-slate-500/5' };
    }
}