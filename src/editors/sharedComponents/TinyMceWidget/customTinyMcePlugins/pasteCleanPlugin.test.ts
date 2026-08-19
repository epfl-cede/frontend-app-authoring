import { Editor } from 'tinymce';
import tinyMCEPasteCleanPlugin from './pasteCleanPlugin';

const webkitNoisyHtml =
  '<p class="p1" style="margin: 0px; font-style: normal; font-size: 12px; line-height: normal; font-family: Helvetica; color: #000000;"><span class="s1" style="text-decoration: line-through;">asdasd</span></p>'
  + '<p class="p1" style="margin: 0px; color: #000000;"><i>asdasd</i><i></i></p>'
  + '<p class="p1" style="margin: 0px; color: #000000;"><b>bold text</b></p>';

interface PasteEvent {
  content: string;
  internal?: boolean;
}

type PastePreProcessHandler = (event: PasteEvent) => void;

const createEditorMock = (allowedStyles?: string) => {
  const handlers: Record<string, PastePreProcessHandler> = {};
  const on = jest.fn((eventName: string, callback: PastePreProcessHandler) => {
    handlers[eventName] = callback;
  });
  const editor = {
    getParam: jest.fn((key: string, defaultValue: string) => (
      key === 'pasteclean_allowed_styles' && allowedStyles ? allowedStyles : defaultValue
    )),
    getDoc: () => document,
    on,
  } as unknown as Editor;

  return {
    editor,
    on,
    firePastePreProcess: (event: PasteEvent) => handlers.PastePreProcess(event),
  };
};

// Render cleaned HTML back into a DOM fragment for assertions.
const parseHtml = (html: string): HTMLElement => {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
};

describe('TinyMCE Paste Clean Plugin', () => {
  it('registers a PastePreProcess handler', () => {
    const { editor, on } = createEditorMock();
    tinyMCEPasteCleanPlugin(editor);
    expect(on).toHaveBeenCalledWith('PastePreProcess', expect.any(Function));
  });

  it('strips non-whitelisted inline styles but keeps text-decoration, classes and semantic tags', () => {
    const { editor, firePastePreProcess } = createEditorMock();
    tinyMCEPasteCleanPlugin(editor);

    const event = { content: webkitNoisyHtml, internal: false };
    firePastePreProcess(event);

    const container = parseHtml(event.content);

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(3);
    paragraphs.forEach((p) => {
      expect(p.getAttribute('style')).toBeNull();
      expect(p.getAttribute('class')).toEqual('p1');
    });

    const span = container.querySelector('span');
    expect(span?.getAttribute('class')).toEqual('s1');
    expect(span?.style.getPropertyValue('text-decoration')).toContain('line-through');

    expect(container.querySelector('i')).not.toBeNull();
    expect(container.querySelector('b')).not.toBeNull();
    expect(container.textContent).toContain('asdasd');
    expect(container.textContent).toContain('bold text');
  });

  it('keeps combined text-decoration values such as underline line-through', () => {
    const { editor, firePastePreProcess } = createEditorMock();
    tinyMCEPasteCleanPlugin(editor);

    const event = {
      content:
        '<p style="color: red;"><span style="text-decoration: underline line-through; font-kerning: none;">text</span></p>',
      internal: false,
    };
    firePastePreProcess(event);

    const container = parseHtml(event.content);
    const span = container.querySelector('span');
    const textDecoration = span?.style.getPropertyValue('text-decoration') ?? '';
    expect(textDecoration).toContain('underline');
    expect(textDecoration).toContain('line-through');
    expect(span?.style.getPropertyValue('font-kerning')).toEqual('');
    expect(container.querySelector('p')?.getAttribute('style')).toBeNull();
  });

  it('unwraps spans left without attributes and matches PowerPaste "Remove Formatting" output (Google Docs source)', () => {
    const { editor, firePastePreProcess } = createEditorMock();
    tinyMCEPasteCleanPlugin(editor);

    // Real Google Docs clipboard fragment (Cyrillic legal document paste).
    const event = {
      content: '<p style="line-height: 1.2; text-align: center; margin-bottom: 0pt">'
        + '<strong><em><span style="font-size: 12pt; font-family: Times New Roman, serif; color: #000000; white-space-collapse: preserve;">Д О В Е Р Е Н Н О С Т Ь</span></em></strong>'
        + '</p>',
      internal: false,
    };
    firePastePreProcess(event);

    // Same result as edx.org's PowerPaste "Remove Formatting" on this paste.
    expect(event.content).toEqual('<p><strong><em>Д О В Е Р Е Н Н О С Т Ь</em></strong></p>');
  });

  it('unwraps nested spans left without attributes', () => {
    const { editor, firePastePreProcess } = createEditorMock();
    tinyMCEPasteCleanPlugin(editor);

    const event = {
      content: '<p><span style="color: red;"><span style="font-weight: bold;">text</span></span></p>',
      internal: false,
    };
    firePastePreProcess(event);

    expect(event.content).toEqual('<p>text</p>');
  });

  it('keeps spans that still carry a class after style cleanup', () => {
    const { editor, firePastePreProcess } = createEditorMock();
    tinyMCEPasteCleanPlugin(editor);

    const event = {
      content: '<p style="color: red;"><span class="s1" style="font-family: Helvetica;">text</span></p>',
      internal: false,
    };
    firePastePreProcess(event);

    expect(event.content).toEqual('<p><span class="s1">text</span></p>');
  });

  it('keeps spans that carry non-style attributes (e.g. lang) without looping forever', () => {
    const { editor, firePastePreProcess } = createEditorMock();
    tinyMCEPasteCleanPlugin(editor);

    // Regression test: the unwrap pass must not spin on spans it cannot
    // unwrap (here `lang` survives the style cleanup).
    const event = {
      content: '<p style="color: red;"><span lang="en">text</span></p>',
      internal: false,
    };
    firePastePreProcess(event);

    expect(event.content).toEqual('<p><span lang="en">text</span></p>');
  });

  it('leaves internal (copied inside the editor) pastes untouched', () => {
    const { editor, firePastePreProcess } = createEditorMock();
    tinyMCEPasteCleanPlugin(editor);

    const event = { content: '<span style="color: rgb(255, 0, 0);">red</span>', internal: true };
    firePastePreProcess(event);

    expect(event.content).toEqual('<span style="color: rgb(255, 0, 0);">red</span>');
  });

  it('honours the pasteclean_allowed_styles setting', () => {
    const { editor, firePastePreProcess } = createEditorMock('color text-decoration');
    tinyMCEPasteCleanPlugin(editor);

    const event = {
      content: '<p style="color: red; font-family: Helvetica;">text</p>',
      internal: false,
    };
    firePastePreProcess(event);

    const container = parseHtml(event.content);
    const p = container.querySelector('p');
    expect(p?.style.getPropertyValue('color')).toEqual('red');
    expect(p?.style.getPropertyValue('font-family')).toEqual('');
  });

  it('leaves content without style attributes unchanged', () => {
    const { editor, firePastePreProcess } = createEditorMock();
    tinyMCEPasteCleanPlugin(editor);

    const event = { content: '<p><strong>plain</strong></p>', internal: false };
    firePastePreProcess(event);

    expect(event.content).toEqual('<p><strong>plain</strong></p>');
  });
});
