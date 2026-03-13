const SHIKI_LINE_RE = /<span class="line">[\s\S]*?<\/span>(?=(?:\r?\n)?<span class="line">|(?:\r?\n)?<\/code>)/g;

export function stripShikiLineWrapper(html: string): string {
  return html.replace(/^<span class="line">/, '').replace(/<\/span>$/, '');
}

export function extractShikiLines(html: string): string[] | null {
  const lineMatches = html.match(SHIKI_LINE_RE);
  if (lineMatches?.length) {
    return lineMatches.map(stripShikiLineWrapper);
  }

  const codeContent = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
  if (codeContent) {
    return codeContent[1].split(/\r?\n/);
  }

  return null;
}
