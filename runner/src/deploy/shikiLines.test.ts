import { describe, expect, it } from 'vitest';
import { extractShikiLines, stripShikiLineWrapper } from './shikiLines';

describe('shikiLines', () => {
  it('splits shiki output into per-line fragments even when lines are newline-separated', () => {
    const html = `<pre class="shiki cadence-editor"><code><span class="line"><span style="color:#D4D4D4">let feeIdx = reverse </span><span style="color:#C792EA;font-weight:bold">?</span><span style="color:#D4D4D4"> (nHops - 1 - i) : i</span></span>
<span class="line"><span style="color:#C792EA;font-weight:bold">import</span><span style="color:#D4D4D4"> FlowToken </span><span style="color:#C792EA;font-weight:bold">from</span><span style="color:#D4D4D4"> 0x1654653399040a61</span></span>
<span class="line"><span style="color:#6A9955;font-style:italic">/// comment</span></span></code></pre>`;

    expect(extractShikiLines(html)).toEqual([
      '<span style="color:#D4D4D4">let feeIdx = reverse </span><span style="color:#C792EA;font-weight:bold">?</span><span style="color:#D4D4D4"> (nHops - 1 - i) : i</span>',
      '<span style="color:#C792EA;font-weight:bold">import</span><span style="color:#D4D4D4"> FlowToken </span><span style="color:#C792EA;font-weight:bold">from</span><span style="color:#D4D4D4"> 0x1654653399040a61</span>',
      '<span style="color:#6A9955;font-style:italic">/// comment</span>',
    ]);
  });

  it('falls back to raw code lines when the shiki line wrappers are missing', () => {
    const html = '<pre class="shiki cadence-editor"><code>let a = 1\nlet b = 2</code></pre>';

    expect(extractShikiLines(html)).toEqual(['let a = 1', 'let b = 2']);
  });

  it('strips a single line wrapper without touching token spans', () => {
    expect(
      stripShikiLineWrapper(
        '<span class="line"><span style="color:#C792EA">import</span><span style="color:#D4D4D4"> Foo</span></span>',
      ),
    ).toBe('<span style="color:#C792EA">import</span><span style="color:#D4D4D4"> Foo</span>');
  });
});
