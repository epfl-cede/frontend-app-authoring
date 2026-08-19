/**
 * Custom TinyMCE 5 plugin that cleans inline styles from pasted HTML.
 *
 * Replaces the premium `powerpaste` plugin (which upstream Open edX only
 * ships as a non-functional stub). It hooks the core Paste plugin's
 * `PastePreProcess` event and rewrites the `style` attribute of every
 * element in the pasted fragment so that only whitelisted CSS properties
 * survive. By default only `text-decoration` is kept, which preserves
 * underline/strikethrough pasted from sources (e.g. macOS TextEdit, Word)
 * that express them as inline styles instead of semantic tags, while
 * dropping WebKit/Word font and layout noise.
 *
 * After style cleanup, `<span>` elements left without any attributes are
 * unwrapped (replaced by their children). Sources like Google Docs and Word
 * carry all their formatting on throwaway spans; once the styles are gone
 * those spans are dead weight, and removing them matches the output of
 * PowerPaste's "Remove Formatting" mode.
 *
 * Only external pastes are cleaned: content copied inside the editor
 * (`e.internal`) is left untouched so that formatting created with the
 * editor itself (e.g. text color via `forecolor`) survives copy/paste.
 *
 * Configuration:
 *   pasteclean_allowed_styles: space- or comma-separated list of CSS
 *   properties to keep. Default: 'text-decoration'.
 */
import tinymce, { Editor } from 'tinymce';

interface PastePreProcessEvent {
  content: string;
  internal?: boolean;
}

interface KeptStyle {
  property: string;
  value: string;
  priority: string;
}

function tinyMCEPasteCleanPlugin(editor: Editor): void {
  const allowed = editor.getParam('pasteclean_allowed_styles', 'text-decoration');
  const allowedProps = allowed
    .split(/[,\s]+/)
    .map((prop) => prop.trim().toLowerCase())
    .filter(Boolean);

  editor.on('PastePreProcess', (e: PastePreProcessEvent) => {
    if (e.internal || !e.content) {
      return;
    }

    const container = editor.getDoc().createElement('div');
    container.innerHTML = e.content;

    container.querySelectorAll('[style]').forEach((element) => {
      const el = element as HTMLElement;
      const kept: KeptStyle[] = [];
      allowedProps.forEach((property) => {
        const value = el.style.getPropertyValue(property);
        if (value) {
          kept.push({ property, value, priority: el.style.getPropertyPriority(property) });
        }
      });

      el.removeAttribute('style');
      kept.forEach(({ property, value, priority }) => {
        el.style.setProperty(property, value, priority);
      });
    });

    // Unwrap spans that carry no attributes anymore (Google Docs/Word
    // styling spans). querySelectorAll returns a static list in document
    // order, so outer spans are unwrapped before nested ones and a single
    // pass is enough. Spans that still carry other attributes (lang, dir,
    // data-*) can never be unwrapped; skipping them in place (instead of
    // re-querying until the list is empty) is what keeps this from
    // spinning forever on them.
    container.querySelectorAll('span:not([style]):not([class]):not([id])').forEach((span) => {
      if (span.attributes.length > 0 || !span.parentNode) {
        return;
      }
      const parent = span.parentNode;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    });

    e.content = container.innerHTML;
  });
}

tinymce.PluginManager.add('pasteclean', tinyMCEPasteCleanPlugin);

export default tinyMCEPasteCleanPlugin;
