# Replacing PowerPaste / a11ychecker with a custom TinyMCE 5 paste-clean plugin

> **Scope:** `frontend-app-authoring`, TinyMCE **5.x** only (self-hosted `tinymce@5.10.9` and cloud channel `5`).\
> **Goal:** Strip unwanted inline `style` attributes from pasted HTML while preserving a whitelist of styles (e.g. `text-decoration: line-through`), so the premium `powerpaste` and `a11ychecker` plugins can be removed and the free API key stops showing "premium plugin not enabled" notifications.

---

## 1. Context and the exact transformation

Current editor config (`src/editors/sharedComponents/TinyMceWidget/pluginConfig.js`) loads the premium plugins `a11ychecker` and `powerpaste`, plus `powerpaste_*` options. On a free Tiny Cloud API key this triggers the notification: _"The _ premium plugin is not enabled on your API key. Upgrade your account."_ The fix is to remove those premium plugins and replace the paste cleanup they provided with the built-in **Paste** plugin plus a small custom plugin.

### Required transformation

Input (Apple/WebKit rich-text paste noise):

```html
<p class="p1" style="margin: 0px; font-style: normal; font-variant: normal; font-size-adjust: none; font-language-override: normal; font-kerning: auto; font-optical-sizing: auto; font-feature-settings: normal; font-variation-settings: normal; font-stretch: normal; font-size: 12px; line-height: normal; font-family: Helvetica; color: #000000;"><span class="s1" style="text-decoration: line-through;">asdasd</span></p>
<p class="p1" style="margin: 0px; ... color: #000000;"><i>asdasd</i><i></i></p>
<p class="p1" style="margin: 0px; ... color: #000000;"><b>asdas dad a</b></p>
```

Desired output:

```html
<p class="p1"><span class="s1" style="text-decoration: line-through;">asdasd</span></p>
<p class="p1"><i>asdasd</i></p>
<p class="p1"><b>asdas dad a</b></p>
```

Key observations:

- `class` attributes (`p1`, `s1`) are kept.
- The noisy `style` block on `<p>` is fully stripped.
- `style="text-decoration: line-through;"` on `<span>` is kept.
- Semantic tags (`<i>`, `<b>`) are preserved; empty inline formatting tags (e.g. the trailing `<i></i>` WebKit leaves after a pasted `<i>` run) are removed.

This means the rule must be a **whitelist of retained CSS properties**, not "strip every `style` attribute".

---

## 2. TinyMCE 5 paste API facts

### 2.1 Events fired by the Paste plugin

The built-in **Paste** plugin fires two editor-level events that can be used to modify clipboard content:

| Event              | Fired                                                 | Data                                                             | Mutate via        |
| ------------------ | ----------------------------------------------------- | ---------------------------------------------------------------- | ----------------- |
| `PastePreProcess`  | Before the content is parsed/inserted                 | `{ content: string, internal: boolean, wordContent: boolean }`   | `e.content = ...` |
| `PastePostProcess` | After the content has been parsed into a DOM fragment | `{ node: HTMLElement, internal: boolean, wordContent: boolean }` | Mutate `e.node`   |

Source (`tinymce/tinymce` 5.10.9):

```ts
const firePastePreProcess = (
  editor: Editor,
  html: string,
  internal: boolean,
  isWordHtml: boolean,
): EditorEvent<PastePreProcessEvent> =>
  editor.fire('PastePreProcess', { content: html, internal, wordContent: isWordHtml });

const firePastePostProcess = (
  editor: Editor,
  node: HTMLElement,
  internal: boolean,
  isWordHtml: boolean,
): EditorEvent<PastePostProcessEvent> => editor.fire('PastePostProcess', { node, internal, wordContent: isWordHtml });
```

> Source: [`modules/tinymce/src/plugins/paste/main/ts/api/Events.ts`](https://github.com/tinymce/tinymce/blob/5.10.9/modules/tinymce/src/plugins/paste/main/ts/api/Events.ts) on branch `5.10.9`.

The `Paste` plugin also wires the legacy config callbacks `paste_preprocess` and `paste_postprocess` to these same events. The TinyMCE 5 docs list both the event and callback forms: _"This option enables you to modify the pasted content before it gets inserted into the editor."_ (`paste_preprocess`) and _"after it's been parsed into a DOM structure"_ (`paste_postprocess`) [TinyMCE 5 Paste plugin docs](https://www.tiny.cloud/docs/tinymce/5/paste/).

### 2.2 Built-in config options and what they actually do in v5

All of the following are documented on the [TinyMCE 5 Paste plugin page](https://www.tiny.cloud/docs/tinymce/5/paste/) unless noted.

- **`paste_enable_default_filters`** (boolean, default `true`) — enables the Word filter and WebKit style cleanup. Set to `false` to disable all default paste filters.
- **`paste_webkit_styles`** (string, default `none`) — controls which inline styles are kept when pasting from WebKit. Values: `"none"`, `"all"`, or a space-separated list such as `"color font-size"`. The default `"none"` causes the paste plugin to strip **all** `style` attributes on WebKit pastes.
- **`paste_remove_styles_if_webkit`** (boolean, default `true`) — set to `false` to skip the WebKit style stripping entirely.
- **`paste_retain_style_properties`** (string, default unset) — **deprecated in TinyMCE 5.10, removed in 6.0**. Retains a space-separated list of CSS properties when filtering **Microsoft Word** content only. It does not apply to generic WebKit/TextEdit paste.
- **`paste_word_valid_elements`** (string, default unset) — **deprecated in TinyMCE 5.10, removed in 6.0**. Restricts the schema used while filtering Word content.
- **`paste_merge_formats`** (boolean, default `true`) — merges nested identical inline format tags after paste (e.g. `<b>a<b>b</b></b>` → `<b>ab</b>`).
- **`paste_as_text`** (boolean, default `false`) — if `true`, paste is forced to plain text. Too aggressive for our use case.
- **`paste_remove_styles` / `paste_filter_drop`** — `paste_filter_drop` exists in v5 and disables the default drop filters. There is **no documented `paste_remove_styles` option in TinyMCE 5**; the v5 source only reads `paste_remove_styles_if_webkit` and `paste_webkit_styles` for style removal.

> v5 source for the WebKit cleanup confirms the behavior: when `paste_webkit_styles` is unset it removes **all** `style="..."` attributes, when set to a list it keeps only those properties (and only if they differ from the current selection's computed style), and when `"all"` it keeps everything. See [`modules/tinymce/src/plugins/paste/main/ts/core/Quirks.ts`](https://github.com/tinymce/tinymce/blob/5.10.9/modules/tinymce/src/plugins/paste/main/ts/core/Quirks.ts).

### 2.3 Why config-only is not enough

A pure config approach has three problems for the exact transformation above:

1. **`paste_webkit_styles`** only runs on WebKit browsers (`Env.webkit`). It will not clean paste from Firefox/Edge/etc.
2. The WebKit filter compares each retained style against the **current selection node's computed style** and only keeps the property if it differs. This can unexpectedly drop a retained style if the surrounding text happens to already have it.
3. **`invalid_styles` / `valid_styles`** are applied by the editor's global schema serializer, not just during paste. If configured to allow only `text-decoration`, any existing non-pasted content with other inline styles would be stripped the next time the content is parsed/serialized (e.g. on save or `getContent`).

Therefore a **custom `PastePreProcess` listener** is the right seam: it runs at paste time, operates only on the pasted string, and lets us implement a precise property whitelist.

---

## 3. Recommended implementation: custom `pasteclean` plugin

The repo already has a pattern for runtime-registered custom plugins:

- `src/editors/sharedComponents/TinyMceWidget/customTinyMcePlugins/embedIframePlugin.js` defines a plugin function, then self-registers it against the global `tinymce` in a side-effecting IIFE, and `src/editors/sharedComponents/TinyMceWidget/index.tsx` imports it for that side effect.

> Note: an earlier draft of this doc referred to a `useTinyMCEBootstrap.ts` module and a `registerEmbedIframePlugin(tinymce)` helper. That file does not exist in this repo — the embed-iframe plugin is registered by the side-effect import in `index.tsx` (self-hosted mode only). The `pasteclean` plugin mirrors that same pattern.

### 3.1 Plugin source (as shipped)

Create `src/editors/sharedComponents/TinyMceWidget/customTinyMcePlugins/pasteCleanPlugin.ts`. The committed implementation deviates from the earlier `DomParser`/`Serializer` draft in four deliberate ways (see §3.2): it parses the pasted string into a plain DOM `div` and walks it with `querySelectorAll`, it skips internal pastes rather than honouring `isDefaultPrevented()`, and it unwraps attribute-less spans and removes empty inline formatting tags. It also self-registers against the global `tinymce` (mirroring `embedIframePlugin.js`) instead of exporting a `registerPasteCleanPlugin` helper.

```ts
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

    // Rewrite the `style` attribute so only whitelisted properties survive.
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

    // Unwrap spans left without attributes (Google Docs/Word styling spans).
    // A single pass suffices: querySelectorAll returns a static list in
    // document order, so outer spans unwrap before nested ones. Spans that
    // still carry other attributes (lang, dir, data-*) are skipped in place,
    // which keeps this from spinning forever.
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

    // Remove empty inline formatting elements (e.g. `<b></b>`, `<i></i>`).
    // Re-querying in a loop is required because removing an inner empty tag
    // can leave its parent empty; each pass removes at least one node, so
    // the loop always terminates. Whitespace-only elements are kept.
    const emptyFormattingTags = [
      'b',
      'strong',
      'i',
      'em',
      'u',
      's',
      'strike',
      'del',
      'ins',
      'mark',
      'sub',
      'sup',
      'font',
    ];
    let removedEmptyTag: boolean;
    do {
      removedEmptyTag = false;
      container.querySelectorAll(emptyFormattingTags.join(',')).forEach((element) => {
        if (element.childNodes.length === 0 && element.parentNode) {
          element.parentNode.removeChild(element);
          removedEmptyTag = true;
        }
      });
    } while (removedEmptyTag);

    e.content = container.innerHTML;
  });
}

tinymce.PluginManager.add('pasteclean', tinyMCEPasteCleanPlugin);

export default tinyMCEPasteCleanPlugin;
```

### 3.2 How the shipped implementation works

The committed plugin trades the `DomParser`/`Serializer` draft above for a plain DOM pass, for two reasons:

- **No iframe/toolbar access needed.** `editor.getDoc()` returns the host document in the self-hosted setup; creating a detached `div` there and reading `element.style` uses the browser's own CSSOM, which correctly parses shorthand/`!important` (`getPropertyValue`/`getPropertyPriority`).
- **Simpler than the AST/schema round-trip.** `querySelectorAll('[style]')` finds every inline-styled element without reasoning about TinyMCE's `AstNode`/schema serialization. The paste plugin re-parses `e.content` downstream anyway, so the schema-validation fidelity lost by not using `DomParser` is benign in practice.

Notes on the specific choices:

- `e.internal || !e.content` — skips content copied _inside_ the editor (internal paste), so formatting created with the editor (e.g. `forecolor`) survives copy/paste. This is intentionally different from the earlier draft's `e.isDefaultPrevented()` guard.
- `getParam('pasteclean_allowed_styles', 'text-decoration')` — same whitelist surface as the draft, but read once at plugin init and applied property-by-property via `style.setProperty(property, value, priority)`.
- **Span unwrapping** — after style cleanup, `<span>`s left with no attributes are replaced by their children (Google Docs/Word styling spans). `querySelectorAll` returns a static list in document order, so one pass unwraps outer spans before nested ones; spans that still carry other attributes are skipped in place so the loop can't spin.
- **Empty-tag removal** — after span unwrapping, inline formatting elements (`b`, `strong`, `i`, `em`, `u`, `s`, `strike`, `del`, `ins`, `mark`, `sub`, `sup`, `font`) that have no child nodes at all are removed. WebKit/Word paste often leaves a trailing empty `<i></i>` after each pasted `<i>` run. Re-querying in a loop is required because removing an inner empty tag can leave its parent empty; each pass removes at least one node, so the loop terminates. Elements that still contain whitespace or other nodes are kept (e.g. `<b> </b>` survives).
- **Self-registration** — `tinymce.PluginManager.add('pasteclean', ...)` at module scope, mirroring `embedIframePlugin.js`. The side-effect import in `index.tsx` runs it in self-hosted mode.

This runs on the **pasted string only**, does not require iframe access, and does not alter content already in the editor.

---

## 4. Wiring it into the repo

### 4.1 Register the custom plugin

The plugin self-registers against the global `tinymce` (side effect), mirroring `embedIframePlugin.js`:

```js
// src/editors/sharedComponents/TinyMceWidget/customTinyMcePlugins/pasteCleanPlugin.ts
import tinymce from 'tinymce';

tinymce.PluginManager.add('pasteclean', tinyMCEPasteCleanPlugin);
```

Then import it for the side effect in `src/editors/sharedComponents/TinyMceWidget/index.tsx`, alongside the embed-iframe plugin:

```ts
import './customTinyMcePlugins/embedIframePlugin';
import './customTinyMcePlugins/pasteCleanPlugin';
```

> This repo has no `useTinyMCEBootstrap.ts` (the earlier draft above referenced one). Registration is via the side-effect import in `index.tsx`, which covers the self-hosted path. If a cloud-loading path is ever added, register the plugin there the same way.

### 4.2 Replace the premium plugins and options

Edit `src/editors/sharedComponents/TinyMceWidget/pluginConfig.js`:

1. Import the new plugin name and add `plugins.paste` and `plugins.pasteclean` to the plugin list.
2. Remove `plugins.a11ychecker` and `plugins.powerpaste`.
3. Remove the `powerpaste_*` config keys.
4. Disable the built-in WebKit style stripper (our plugin handles it cross-browser).
5. Remove the `buttons.a11ycheck` toolbar button from the toolbar arrays.

> The shipped `pluginConfig.js` additionally gates `pasteclean` behind an `ENABLE_PASTE_CLEANUP` runtime flag (default on): `const pasteCleanEnabled = getConfig().ENABLE_PASTE_CLEANUP !== 'false';`, and sets `paste_remove_styles_if_webkit: !pasteCleanEnabled`.

```js
// src/editors/sharedComponents/TinyMceWidget/pluginConfig.js

// Add to the plugins list:
plugins: [
  plugins.link,
  plugins.lists,
  plugins.codesample,
  plugins.emoticons,
  plugins.table,
  plugins.hr,
  plugins.charmap,
  codePlugin,
  plugins.autoresize,
  image,
  imageTools,
  quickToolbar,
  plugins.paste,          // built-in free paste plugin (replaces powerpaste)
  plugins.pasteclean,     // our custom plugin
  plugins.embediframe,
].join(' '),

// In the config block:
config: {
  // ... existing keys ...
  paste_remove_styles_if_webkit: false, // we clean styles ourselves
  // remove all powerpaste_* options
}
```

Also add `paste` and `pasteclean` to the plugin name store in `src/editors/data/constants/tinyMCE.js`:

```js
export const plugins = listKeyStore([
  'link',
  // ...
  'paste',
  'pasteclean',
  'embediframe',
]);
```

### 4.3 Config-only alternative (not recommended, but possible)

If you want to avoid a custom plugin, the closest config-only approximation is:

```js
paste_remove_styles_if_webkit: false,
valid_styles: {
  span: 'text-decoration',
},
```

This keeps only `text-decoration` on `<span>` elements everywhere in the editor, not just on paste. As noted above, it will also strip other inline styles from content already in the editor when it is re-serialized, which is why the custom plugin is safer.

---

## 5. Removing the premium-plugin notifications

The [TinyMCE 5 Cloud Troubleshooting page](https://www.tiny.cloud/docs/tinymce/5/cloud-troubleshooting/) states:

> _"The premium plugin is not enabled on your API key. Upgrade your account."_\
> **Cause:** your API key does not have access to the premium plugin being requested.\
> **Solution:** Either remove the premium plugin from your TinyMCE configuration, or upgrade your subscription.

Therefore:

1. **Remove `a11ychecker` from `plugins`** and the `a11ycheck` toolbar button from the toolbar arrays in `pluginConfig.js`.
2. **Remove `powerpaste` from `plugins`** and delete the `powerpaste_*` option keys.
3. **Clean up dead a11ychecker CSS import.** `src/editors/sharedComponents/TinyMceWidget/hooks.ts` imports:

   ```ts
   import a11ycheckerCss from 'frontend-components-tinymce-advanced-plugins/plugins/a11ychecker/css';
   ```

   and concatenates it into `content_style`:

   ```ts
   content_style: tinyMCEStyles + a11ycheckerCss,
   ```

   Once `a11ychecker` is removed, this CSS is no longer needed and can be removed (keeping `a11ycheckerCss` as `''` to avoid breaking existing test mocks is also acceptable).
   > Repo refs: `src/editors/sharedComponents/TinyMceWidget/hooks.ts` lines 9 and 463; `src/editors/data/constants/tinyMCE.js` lines 72–73.

   **Status:** done — the `a11ycheckerCss` import and the concatenation were both removed; `content_style` is now just `tinyMCEStyles`.

4. **No changes are required to `frontend-components-tinymce-advanced-plugins` installation.** It is a packaging helper; the notification comes from Tiny Cloud when the editor requests a plugin it is not entitled to. Removing the plugin names from the init config stops the request.

---

## 6. Summary of changes

| File                                                                                  | Change                                                                                                                                                            |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/editors/sharedComponents/TinyMceWidget/customTinyMcePlugins/pasteCleanPlugin.js` | **New** custom plugin that whitelists retained `style` properties on `PastePreProcess`, unwraps attribute-less spans, and removes empty inline formatting tags.   |
| `src/editors/sharedComponents/TinyMceWidget/index.tsx`                                | Import `pasteclean` for its side effect (registration), alongside `embedIframePlugin`.                                                                            |
| `src/editors/sharedComponents/TinyMceWidget/pluginConfig.js`                          | Replace `a11ychecker`/`powerpaste` with `paste`/`pasteclean`; drop `powerpaste_*`; set `paste_remove_styles_if_webkit: false`; remove `a11ycheck` toolbar button. |
| `src/editors/data/constants/tinyMCE.js`                                               | Add `paste` and `pasteclean` to the plugin name store; remove the `a11ychecker` plugin name and the `a11ycheck` button constant.                                  |
| `src/editors/sharedComponents/TinyMceWidget/hooks.ts`                                 | Remove the dead `a11ycheckerCss` import and concatenation.                                                                                                        |

This gives a free-API-key-friendly paste cleanup that preserves `class`, keeps `text-decoration: line-through` on `<span>`, strips Apple/WebKit font noise from `<p>`, removes empty inline formatting tags left behind by WebKit/Word paste, and leaves non-empty `<i>`/`<b>` intact.
