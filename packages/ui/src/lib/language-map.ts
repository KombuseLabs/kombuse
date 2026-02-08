const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // JavaScript / TypeScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',

  // Web
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.json': 'json',
  '.jsonc': 'jsonc',

  // Config / Data
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'ini',
  '.xml': 'xml',
  '.svg': 'xml',
  '.graphql': 'graphql',
  '.gql': 'graphql',

  // Languages
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.lua': 'lua',
  '.r': 'r',
  '.sql': 'sql',
  '.pl': 'perl',

  // Shell / Config
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.fish': 'shell',
  '.bat': 'bat',
  '.ps1': 'powershell',
  '.dockerfile': 'dockerfile',

  // Markup / Docs
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.tex': 'plaintext',
  '.ini': 'ini',
  '.conf': 'ini',
  '.env': 'ini',
}

const FILENAME_TO_LANGUAGE: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'plaintext',
  'cmakelists.txt': 'plaintext',
  '.gitignore': 'ini',
  '.dockerignore': 'ini',
  '.editorconfig': 'ini',
}

export function detectLanguage(filePath: string): string {
  const filename = filePath.split('/').pop() ?? ''
  const filenameLower = filename.toLowerCase()

  if (FILENAME_TO_LANGUAGE[filenameLower]) {
    return FILENAME_TO_LANGUAGE[filenameLower]
  }

  const lastDotIndex = filename.lastIndexOf('.')
  if (lastDotIndex >= 0) {
    const ext = filename.slice(lastDotIndex).toLowerCase()
    if (EXTENSION_TO_LANGUAGE[ext]) {
      return EXTENSION_TO_LANGUAGE[ext]
    }
  }

  return 'plaintext'
}
