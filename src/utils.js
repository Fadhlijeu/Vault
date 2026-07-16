// Format Bytes ke KB/MB/GB
export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Mapping ekstensi file ke nama folder Devicon
const DEVICON_MAP = {
    'py': 'python', 'pyw': 'python',
    'js': 'javascript', 'jsx': 'react', 'ts': 'typescript', 'tsx': 'react',
    'html': 'html5', 'htm': 'html5', 'css': 'css3', 'scss': 'sass', 'sass': 'sass', 'less': 'less',
    'json': 'json', 'xml': 'xml', 'yaml': 'yaml', 'yml': 'yaml', 'toml': 'toml',
    'md': 'markdown', 'mdx': 'markdown', 'rst': 'markdown',
    'svg': 'svg', 'ico': 'svg',
    'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'webp': 'image',
    'mp4': 'video', 'mkv': 'video', 'avi': 'video', 'mov': 'video',
    'mp3': 'audio', 'wav': 'audio', 'ogg': 'audio', 'flac': 'audio',
    'zip': 'zip', 'rar': 'rar', '7z': '7z', 'tar': 'tar', 'gz': 'tar',
    'pdf': 'pdf',
    'doc': 'doc', 'docx': 'doc',
    'xls': 'xls', 'xlsx': 'xls',
    'ppt': 'ppt', 'pptx': 'ppt',
    'txt': 'text',
    'exe': 'exe', 'msi': 'exe',
    'sh': 'bash', 'bash': 'bash', 'zsh': 'zsh',
    'ps1': 'powershell', 'psm1': 'powershell',
    'bat': 'cmd', 'cmd': 'cmd',
    'cpp': 'cplusplus', 'c': 'c', 'h': 'c', 'hpp': 'cplusplus',
    'cs': 'csharp', 'vb': 'visualbasic',
    'go': 'go', 'rs': 'rust', 'rb': 'ruby', 'php': 'php',
    'swift': 'swift', 'kt': 'kotlin', 'java': 'java',
    'pl': 'perl', 'lua': 'lua', 'r': 'r', 'm': 'matlab',
    'sql': 'mysql', 'db': 'sqlite', 'sqlite': 'sqlite',
    'dockerfile': 'docker', 'dockerignore': 'docker',
    'gitignore': 'git', 'gitattributes': 'git',
    'env': 'env',
    'wasm': 'wasm',
    'vue': 'vuejs', 'svelte': 'svelte', 'astro': 'astro',
    'graphql': 'graphql', 'gql': 'graphql',
    'prisma': 'prisma',
    'tf': 'terraform', 'tfvars': 'terraform',
    'lock': 'lock',
    'ai': 'illustrator', 'psd': 'photoshop', 'xd': 'xd', 'fig': 'figma',
    'blend': 'blender', 'blend1': 'blender',
    'ino': 'arduino',
    'cmake': 'cmake',
    'ejs': 'ejs',
    'erb': 'ruby',
    'code': 'vscode', 'code-workspace': 'vscode',
};

// Base path untuk Devicon SVG
const DEVICON_BASE_PATH = 'assets/images/devicons/icons';

function getDeviconPath(ext) {
    const folder = DEVICON_MAP[ext];
    if (!folder) return null;
    return `${DEVICON_BASE_PATH}/${folder}/${folder}-original.svg`;
}

// Skema ikon & warna berdasarkan ekstensi file untuk estetika grid/list
export function getFileMeta(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const deviconPath = getDeviconPath(ext);
    switch (ext) {
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp':
            return { icon: '🖼️', color: 'text-cyan-400', border: 'border-cyan-500/20', bg: 'bg-cyan-500/5', devicon: deviconPath };
        case 'pdf': case 'doc': case 'docx': case 'txt': case 'md':
            return { icon: '📄', color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5', devicon: deviconPath };
        case 'mp4': case 'mkv': case 'avi': case 'mov': case 'mp3':
            return { icon: '🎥', color: 'text-purple-400', border: 'border-purple-500/20', bg: 'bg-purple-500/5', devicon: deviconPath };
        case 'zip': case 'rar': case '7z': case 'tar':
            return { icon: '📦', color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/5', devicon: deviconPath };
        default:
            return { icon: '📁', color: 'text-slate-400', border: 'border-slate-500/20', bg: 'bg-slate-500/5', devicon: deviconPath };
    }
}