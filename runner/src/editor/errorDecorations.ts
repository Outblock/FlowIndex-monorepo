import type * as Monaco from 'monaco-editor';

export interface ParsedLineError {
  line: number;
  column: number;
  message: string;
}

export interface ParsedArgError {
  index: number;
  message: string;
}

export interface ParsedExecutionError {
  lineError: ParsedLineError | null;
  argErrors: ParsedArgError[];
}

/**
 * Parse Cadence runtime / execution error messages.
 *
 * Extracts:
 * - Line/column from `--> hash:LINE:COL` patterns
 * - Argument index from `invalid argument at index N` patterns
 */
export function parseExecutionError(errorMsg: string): ParsedExecutionError {
  const result: ParsedExecutionError = { lineError: null, argErrors: [] };
  if (!errorMsg || typeof errorMsg !== 'string') return result;

  // ── Line error ──
  const arrowMatch = /-->\s*[\w.]+:(\d+):(\d+)/.exec(errorMsg);
  if (arrowMatch) {
    const line = parseInt(arrowMatch[1], 10);
    const column = parseInt(arrowMatch[2], 10);
    if (!isNaN(line) && line >= 1) {
      let message = '';
      const panicMatch = errorMsg.match(/(?:error:\s*)?panic:\s*(.+?)(?:\s*-->|Was this error|$)/);
      const caretMatch = errorMsg.match(/\^\^+\s*error:\s*(.+?)(?:\s*-->|Was this error|$)/);
      if (caretMatch) {
        message = caretMatch[1].trim();
      } else if (panicMatch) {
        message = panicMatch[1].trim();
      }
      if (message.length > 200) message = message.slice(0, 200) + '...';
      result.lineError = { line, column: Math.max(1, column), message };
    }
  }

  // ── Argument errors ──
  // Pattern: "invalid argument at index N" or "decod(e)ing argument at index N"
  const argPattern = /(?:invalid|decod[ei]?ing)\s+argument\s+at\s+index\s+(\d+)/gi;
  let argMatch;
  while ((argMatch = argPattern.exec(errorMsg)) !== null) {
    const index = parseInt(argMatch[1], 10);
    if (!isNaN(index)) {
      // Extract the most specific error detail for this argument
      let msg = 'Invalid argument';
      const afterIndex = errorMsg.slice(argMatch.index);
      // Try to find a specific detail like "missing address prefix: `0x`"
      const specificMatch = afterIndex.match(/(?:failed to decode[^:]*:\s*)?(.+?)(?:\)\s*-->|\s*-->|\s*Was this error|$)/);
      if (specificMatch) {
        // Extract the most meaningful part — after the last parenthetical or colon chain
        let detail = specificMatch[1].trim();
        // Find the innermost useful message (after last open paren or "value:")
        const parenMatch = detail.match(/\(([^()]+)\)\s*$/);
        if (parenMatch) {
          detail = parenMatch[1].trim();
        }
        if (detail.length > 150) detail = detail.slice(0, 150) + '...';
        if (detail) msg = detail;
      }
      // Avoid duplicates
      if (!result.argErrors.some(e => e.index === index)) {
        result.argErrors.push({ index, message: msg });
      }
    }
  }

  return result;
}

const MARKER_OWNER = 'cadence-execution';

/**
 * Set execution error decorations on the Monaco editor.
 * Returns a cleanup function to remove them.
 */
export function setErrorDecorations(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco,
  error: ParsedLineError,
): () => void {
  const model = editor.getModel();
  if (!model) return () => {};

  // Validate line number is within range
  if (error.line > model.getLineCount()) return () => {};

  // 1. Set a marker (squiggly underline)
  const lineContent = model.getLineContent(error.line);
  const endCol = lineContent.length + 1;

  monaco.editor.setModelMarkers(model, MARKER_OWNER, [{
    severity: monaco.MarkerSeverity.Error,
    message: error.message || 'Execution error',
    startLineNumber: error.line,
    startColumn: 1,
    endLineNumber: error.line,
    endColumn: endCol,
  }]);

  // 2. Add line decoration (red background + gutter icon)
  const decorations = editor.createDecorationsCollection([
    {
      range: new monaco.Range(error.line, 1, error.line, 1),
      options: {
        isWholeLine: true,
        className: 'execution-error-line',
        glyphMarginClassName: 'execution-error-glyph',
        overviewRuler: {
          color: '#ef444480',
          position: monaco.editor.OverviewRulerLane.Full,
        },
      },
    },
  ]);

  // 3. Add inline content widget with error message
  let widget: Monaco.editor.IContentWidget | null = null;
  if (error.message) {
    const domNode = document.createElement('div');
    domNode.className = 'execution-error-widget';
    domNode.innerHTML = `<span class="execution-error-icon">\u26A0</span> Line ${error.line}: ${escapeHtml(error.message)}`;
    domNode.title = 'Click to dismiss';

    widget = {
      getId: () => 'execution-error-widget',
      getDomNode: () => domNode,
      getPosition: () => ({
        position: { lineNumber: error.line, column: 1 },
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
      }),
    };
    domNode.onclick = () => cleanup();
    editor.addContentWidget(widget);
  }

  // 4. Scroll to the error line
  editor.revealLineInCenter(error.line);

  function cleanup() {
    decorations.clear();
    monaco.editor.setModelMarkers(model!, MARKER_OWNER, []);
    if (widget) {
      editor.removeContentWidget(widget);
      widget = null;
    }
  }

  return cleanup;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
