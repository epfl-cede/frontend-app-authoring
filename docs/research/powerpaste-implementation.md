# Getting the real TinyMCE PowerPaste plugin working in `frontend-app-authoring`

> Scope: EPFL/SwissMOOC fork of `frontend-app-authoring`, branch `sms/ulmo.master`, TinyMCE 5.x self-hosted.\
> Goal: determine what it would take to replace the upstream stub PowerPaste plugin with the real premium PowerPaste plugin, and recommend a path for the EPFL deployment.

---

## 1. Local baseline (established facts)

The editor is configured in the files already present in this repo:

- `src/editors/sharedComponents/TinyMceWidget/index.tsx` bootstraps a self-hosted TinyMCE 5 instance: it does `import 'tinymce'`, pulls in the silver theme and default icons, and imports `frontend-components-tinymce-advanced-plugins` for its bundled plugin exports.
- `src/editors/sharedComponents/TinyMceWidget/pluginConfig.js` adds `plugins.a11ychecker` and `plugins.powerpaste` to the plugin list and sets the standard PowerPaste options:
  ```js
  powerpaste_allow_local_images: true,
  powerpaste_word_import: 'prompt',
  powerpaste_html_import: 'prompt',
  powerpaste_googledoc_import: 'prompt',
  ```
- `src/editors/sharedComponents/TinyMceWidget/hooks.ts` concatenates `a11ycheckerCss` from `frontend-components-tinymce-advanced-plugins` into `content_style`.
- `src/editors/data/constants/tinyMCE.js` lists both `a11ychecker` and `powerpaste` in the plugin name store.

The upstream package that provides these names is a **stub**: it registers `tinymce.PluginManager.add('powerpaste', ...)` with metadata only and no paste-handling logic. That is why pasting rich content on the SwissMOOC deployment keeps raw WebKit inline styles and never shows the "Paste Formatting Options" dialog.

---

## 2. The upstream stub package

### 2.1 What the package actually ships

`frontend-components-tinymce-advanced-plugins` is published by Open edX under the AGPL-3.0 license. Its `package.json` depends on `tinymce: ^5.10.4` and exports two premium-looking names:

```js
export { default as a11ychecker } from './plugins/a11ychecker';
export { default as powerpaste } from './plugins/powerpaste';
```

Source: [`frontend-components-tinymce-advanced-plugins/index.js`](https://raw.githubusercontent.com/openedx/frontend-components-tinymce-advanced-plugins/main/index.js)

The PowerPaste "plugin" is only a stub:

```js
tinymce.PluginManager.add('powerpaste', function(editor, url) {
  return {
    getMetadata: function() {
      return {
        name: 'stub open-source powerpaste',
        url: 'https://github.com/openedx/frontend-components-tinymce-advanced-plugins',
      };
    },
  };
});
```

Source: [`frontend-components-tinymce-advanced-plugins/plugins/powerpaste/plugin.js`](https://raw.githubusercontent.com/openedx/frontend-components-tinymce-advanced-plugins/main/plugins/powerpaste/plugin.js)

The package's `readme.txt` inside the same folder confirms it was built against a real PowerPaste version: `powerpaste - build: 5.6.2-4`.
Source: [`frontend-components-tinymce-advanced-plugins/plugins/powerpaste/readme.txt`](https://raw.githubusercontent.com/openedx/frontend-components-tinymce-advanced-plugins/main/plugins/powerpaste/readme.txt)

### 2.2 Why it is a stub

An Open edX maintainer confirmed on the public issue tracker that the real plugin lives elsewhere:

> "@sarina for clarity, this is the openedx portion of the paid plugin. There is also a corresponding private repo that contains the actual plugin contents. This was a requirement of getting this feature into Studio at the time..."

Source: [openedx/frontend-components-tinymce-advanced-plugins#27 (comment)](https://github.com/openedx/frontend-components-tinymce-advanced-plugins/issues/27#issuecomment-2697909958)

Another contributor added:

> "The public repo should only contain placeholder 'stubs' for the plugins. This was always ripe for architectural refactoring."

Source: [openedx/frontend-components-tinymce-advanced-plugins#27 (comment)](https://github.com/openedx/frontend-components-tinymce-advanced-plugins/issues/27#issuecomment-2698188562)

In short: the AGPL package is intentionally a placeholder. edX's production build gets the real plugin from a private source that is not redistributed with the open-source tree.

---

## 3. TinyMCE PowerPaste documentation (v5)

### 3.1 PowerPaste behavior and options

The TinyMCE 5 PowerPaste docs describe the plugin as follows:

> "The TinyMCE PowerPaste plugin automatically cleans up content from Microsoft Word, Microsoft Excel, Google Docs, and HTML sources to ensure clean, compliant content that matches the look and feel of the site."
> "This plugin is only available for paid TinyMCE subscriptions."

Source: [TinyMCE 5 Introduction to PowerPaste](https://www.tiny.cloud/docs/tinymce/5/introduction-to-powerpaste/)

The options used by Open edX are documented in the v5 options page:

| Option                                      | Default in v5 | Notes                                                                                                             |
| ------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `powerpaste_word_import`                    | `'prompt'`    | `prompt` "Prompts the user to choose between the clean and merge options after attempting to paste HTML content." |
| `powerpaste_html_import`                    | `'clean'`     | Open edX overrides this to `'prompt'`.                                                                            |
| `powerpaste_googledoc_import`               | `'prompt'`    | Available from TinyMCE 5.8.                                                                                       |
| `powerpaste_allow_local_images`             | `true`        | Keeps Base64 images in the pasted content.                                                                        |
| `powerpaste_block_drop`                     | `false`       | Disables drag-and-drop if set to `true`.                                                                          |
| `powerpaste_clean_filtered_inline_elements` | unset         | Comma-separated tag list removed when cleaning.                                                                   |
| `powerpaste_keep_unsupported_src`           | `false`       | Stores original `src` in `data-image-src` for unsupported images.                                                 |
| `smart_paste`                               | `true`        | Auto-converts URL-like text to links/images.                                                                      |

Source: [TinyMCE 5 PowerPaste options](https://www.tiny.cloud/docs/tinymce/5/introduction-to-powerpaste/)

The `'prompt'` value is the one that produces the "Keep Formatting / Remove Formatting" dialog observed on edx.org.

### 3.2 How real PowerPaste can be obtained and wired

#### Self-hosted Enterprise Bundle

TinyMCE 5 docs describe the canonical self-hosted upgrade path:

> "For the TinyMCE Enterprise Version, download the **TinyMCE Enterprise Bundle** from [Tiny Account > Downloads](https://www.tiny.cloud/my-account/downloads/). The downloaded file will be named `enterprise_latest.zip`."

Source: [Upgrading TinyMCE 5](https://www.tiny.cloud/docs/tinymce/5/upgrading/)

The bundle contains the premium plugins under `plugins/<name>/plugin.js`. For PowerPaste the bundle includes:

```
./plugins/powerpaste/js/wordimport.js
./plugins/powerpaste/langs/<locale>.js
./plugins/powerpaste/plugin.js
```

Source: [Bundling TinyMCE plugins (v5)](https://www.tiny.cloud/docs/tinymce/5/bundling-plugins/)

To load a plugin that lives outside the default `tinymce/plugins` directory, TinyMCE 5 supports `external_plugins`:

> "This option allows you to specify a URL based location of plugins outside of the normal TinyMCE plugins directory. TinyMCE will attempt to load these as per regular plugins when starting up."

Source: [TinyMCE 5 integration and setup options](https://www.tiny.cloud/docs/tinymce/5/integration-and-setup/)

#### Hybrid cloud loading

If the core editor is self-hosted but the premium plugin should come from Tiny Cloud, TinyMCE 5 supports `cloud-plugins.min.js`:

> "Instead of loading `tinymce.min.js` from Tiny Cloud, serve TinyMCE from a self-hosted server, and load `cloud-plugins.min.js` from Tiny Cloud. Unlike `plugins.min.js`, `cloud-plugins.min.js` defaults to loading every premium plugin from the self-hosted TinyMCE installation, not Tiny Cloud. However, plugins can be loaded from Tiny Cloud by specifying them as query parameters."

Example from the docs:

```html
<script src="https://cdn.tiny.cloud/1/no-api-key/tinymce/5/cloud-plugins.min.js?mentions=2.2&powerpaste=5.5&advcode" referrerpolicy="origin"></script>
```

Source: [TinyMCE 5 editor & plugin versions](https://www.tiny.cloud/docs/tinymce/5/editor-plugin-version/)

The PowerPaste plugin versions still served for TinyMCE 5 include `5.6.2`:

Source: [Tiny Cloud PowerPaste available versions](https://cdn.tiny.cloud/1/no-api-key/tinymce-plugins/powerpaste/available-versions)

#### Is an API key / license key required at runtime?

For a **purely self-hosted** TinyMCE 5 deployment, no runtime API key or `license_key` is required to run the open-source editor. Tiny support confirmed:

> "No, an API-key is not needed for self-hosted deployments of TinyMCE."

Source: [tinymce/tinymce-docs#1810 (comment)](https://github.com/tinymce/tinymce-docs/issues/1810#issuecomment-753756967)

PowerPaste itself is premium, so a paid subscription is required to download and use it, but TinyMCE 5 does **not** use the `license_key` option that was introduced later:

> "The `license_key` configuration option was introduced in TinyMCE 7 ... For TinyMCE 5, the `license_key` option does not exist and is not required."

Source: web search synthesis of [TinyMCE license-key docs](https://www.tiny.cloud/docs/tinymce/latest/license-key/) and [tinymce/tinymce#9411](https://github.com/tinymce/tinymce/pull/9411)

If a **hybrid** cloud approach is used, an API key with the correct entitlements is required.

### 3.3 Licensing and end-of-life

PowerPaste is not in the Essential plan. The current Tiny pricing/feature table shows:

> | Feature    | Free | Essential | Professional | Enterprise |
> | ---------- | ---- | --------- | ------------ | ---------- |
> | PowerPaste | No   | No        | Yes          | Yes        |

Source: [TinyMCE pricing page](https://www.tiny.cloud/pricing/) (feature comparison table)

TinyMCE 5 reached End of Support on **20 April 2023**:

> "TinyMCE 5 reaches End of Support on April 20, 2023. ... Beyond the End of Support date, we don't release any more updates to the version of TinyMCE that's reached its End of Support. This means no new features, plugins, or enhancements, but more importantly, no more bug fixes or security patches."

Source: [What does TinyMCE 5 end of support mean?](https://www.tiny.cloud/blog/tinymce-end-of-support/)

The pricing page also notes that using legacy TinyMCE versions incurs an additional monthly/annual flat fee and higher overage rates.

### 3.4 `@tinymce/tinymce-react` and cloud delivery

The React wrapper can load TinyMCE in three ways:

> 1. The global `tinymce` will be used, if it is present on the page.
> 2. If the `tinymceScriptSrc` prop is provided, then a script tag will be added to the page to load TinyMCE from the given URL.
> 3. If none of the above conditions apply, then a script tag will be added to the page to load TinyMCE from Tiny Cloud.

The `apiKey` prop is only needed when loading from Tiny Cloud, to remove the "This domain is not registered" warning. The `cloudChannel` default is `5-stable`.

Source: [TinyMCE React integration (v5)](https://www.tiny.cloud/docs/tinymce/5/react/)

Because the EPFL MFE already imports `tinymce` as an npm module (global `tinymce` is present), the wrapper will **not** automatically fall back to Tiny Cloud. Switching to cloud delivery would require removing the local `tinymce` import and relying on `apiKey`/`cloudChannel`, which conflicts with the existing self-hosted theme/skin setup.

---

## 4. Upstream `frontend-app-authoring` status

As of the current `master` branch, upstream `frontend-app-authoring` is still on TinyMCE 5:

```json
"tinymce": "^5.10.4",
"@tinymce/tinymce-react": "^6.0.0",
"frontend-components-tinymce-advanced-plugins": "^1.0.3",
```

Source: [`openedx/frontend-app-authoring/master/package.json`](https://raw.githubusercontent.com/openedx/frontend-app-authoring/master/package.json)

No TinyMCE 6/7 upgrade pull request was found in the upstream repository during this research. The open issues/PRs around TinyMCE in `frontend-app-authoring` are mostly bug fixes (cursor position, image URLs, etc.) on the existing v5 editor. This means any real-PowerPaste integration built for v5 today will likely need to be rebuilt when upstream eventually upgrades.

---

## 5. Implementation options for the EPFL/SwissMOOC fork

### Option A: Self-host the real PowerPaste plugin from a Tiny Enterprise Bundle

This is the option that keeps the deployment fully self-hosted.

1. **Purchase a subscription** that includes PowerPaste (Tiny Professional or Enterprise). Confirm with Tiny support that a v5 Enterprise Bundle download is still available for new customers.
2. **Download the bundle** from `Tiny Account > Downloads`. The v5 bundle is `enterprise_latest.zip` and contains `plugins/powerpaste/plugin.js`, `plugins/powerpaste/js/wordimport.js`, and language files.
3. **Make the plugin files available to the MFE at runtime.** The cleanest approach for EPFL is to copy the `plugins/powerpaste/` directory into the MFE's static assets (e.g. `public/tinymce/plugins/powerpaste/`). Because the files are commercially licensed, **do not commit them to the public fork**. Instead, inject them during the `swissmooc-tutor` MFE image build from a private store (private S3 object, encrypted CI secret, or ansible-vault archive).
4. **Remove the stub registration.** In `src/editors/sharedComponents/TinyMceWidget/index.tsx`, stop importing the whole `frontend-components-tinymce-advanced-plugins` package. Replace it with direct imports of the non-premium plugins it was re-exporting:
   ```js
   import 'tinymce/plugins/link';
   import 'tinymce/plugins/lists';
   import 'tinymce/plugins/codesample';
   import 'tinymce/plugins/emoticons';
   import 'tinymce/plugins/table';
   import 'tinymce/plugins/hr';
   import 'tinymce/plugins/charmap';
   import 'tinymce/plugins/code';
   import 'tinymce/plugins/autoresize';
   import 'tinymce/plugins/image';
   import 'tinymce/plugins/imagetools';
   import 'tinymce/plugins/quickbars';
   ```
   Also remove the `a11ycheckerCss` import and its use in `content_style` in `src/editors/sharedComponents/TinyMceWidget/hooks.ts`.
   Also remove the `a11ycheck` toolbar button from the `toolbar` and `quickbarsSelectionToolbar` arrays in `pluginConfig.js` (it depends on the disabled `a11ychecker` plugin).
5. **Keep the PowerPaste config** in `pluginConfig.js` (`plugins: '... powerpaste ...'` and the existing `powerpaste_*` options).
6. **Add `external_plugins`** so TinyMCE loads the real plugin from the static path. In `src/editors/sharedComponents/TinyMceWidget/hooks.ts`, add to the init config:
   ```js
   external_plugins: {
     powerpaste: '/authoring/tinymce/plugins/powerpaste/plugin.js',
   },
   ```
   Adjust the path to match the MFE's `PUBLIC_PATH` and where the build step copied the files.
7. **Build and test** through `swissmooc-tutor` (`make build` / MFE image build) on staging before campus.

**Pros:** fully self-hosted; no per-editor calls to Tiny Cloud; works in restricted networks.\
**Cons:** subscription cost; v5 is EOL so obtaining the bundle may require sales/support; the integration is v5-specific and will need rework when upstream upgrades.

### Option B: Hybrid cloud loading of PowerPaste

Keep the self-hosted TinyMCE 5 core, but load the real PowerPaste plugin from Tiny Cloud.

1. Purchase a Tiny Professional/Enterprise subscription and get an API key.
2. Before any `<Editor>` initializes, load the cloud plugin script. For example, inject it from a bootstrap effect:
   ```js
   const script = document.createElement('script');
   script.src = 'https://cdn.tiny.cloud/1/<API_KEY>/tinymce/5/cloud-plugins.min.js?powerpaste=5.6.2';
   script.referrerPolicy = 'origin';
   script.async = true;
   document.head.appendChild(script);
   ```
   Render the editor only after the script's `onload` fires (or add the tag to the generated `index.html` in the MFE build).
3. Remove or bypass the stub as in Option A. Because TinyMCE's `PluginManager` later registration wins, the cloud-loaded real plugin should override the stub, but avoiding the stub entirely is cleaner.
4. Keep the PowerPaste options in `pluginConfig.js`.

**Pros:** no need to host or inject proprietary plugin files into the MFE build.\
**Cons:** every user's browser must reach `cdn.tiny.cloud`; editor loads are metered against the Tiny plan; the v5 cloud channel is EOL/legacy; not fully self-hosted.

### Option C: Move the whole editor to Tiny Cloud

Remove the local `import 'tinymce'` and plugin imports, set `<Editor apiKey="..." cloudChannel="5-stable" ... />`, and let the wrapper load TinyMCE and all plugins from Tiny Cloud.

**Not recommended.** It conflicts with the existing self-hosted theme/skin wiring, the `content_style` / `skin: false` settings, and the custom `embediframe` plugin. It also couples the deployment to Tiny Cloud for the core editor.

### Option D: Free fallback (custom paste-clean plugin)

A previous research note in this repo, [`docs/research/paste-style-stripping-plugin.md`](./paste-style-stripping-plugin.md), describes replacing `powerpaste` with the free core `paste` plugin plus a small custom `pasteclean` plugin that filters inline styles on `PastePreProcess`. That approach costs nothing and avoids licensing/EOL issues, but it does **not** provide the real PowerPaste "Keep / Remove Formatting" dialog or the full Word/Excel/Google Docs filters.

---

## 6. Recommendation

For the EPFL/SwissMOOC deployment, the decision hinges on whether the product team requires the **exact** PowerPaste UX (the keep/remove dialog and full Word/Excel/GDocs cleaning) or only needs to strip noisy inline styles from pasted HTML.

- **If the observed raw-WebKit-style problem is the only issue:** implement the free `pasteclean` plugin described in [`docs/research/paste-style-stripping-plugin.md`](./paste-style-stripping-plugin.md). It is the lowest risk, lowest cost, and most maintainable fix for TinyMCE 5.

- **If real PowerPaste is a hard requirement:** pursue **Option A (self-hosted Enterprise Bundle)** because it aligns with the SwissMOOC self-hosted, multi-tenant model and avoids a runtime dependency on Tiny Cloud. Before committing engineering time, however, confirm with Tiny sales/support that:
  1. A v5 Enterprise Bundle (or at least the v5 `powerpaste` plugin files) is still available for new Professional/Enterprise customers.
  2. The exact legacy-version surcharge is understood and budgeted.

  If Tiny no longer provides the v5 bundle to new customers, fall back to **Option B (hybrid cloud)** with the explicit acceptance that editor loads will hit `cdn.tiny.cloud`.

- **Do not pursue Option C.** The refactor cost is high and it contradicts the existing self-hosted integration.

- **Plan for the next Open edX release upgrade.** Upstream `frontend-app-authoring` is still on TinyMCE 5 today, but future named releases are likely to move to TinyMCE 6/7. Any real-PowerPaste work done now is v5-specific and will need to be re-implemented using the then-current plugin packaging (`tinymce-premium` npm package, cloud channels, or the new license-key flow).

---

## Sources

1. Local repo files:
   - `src/editors/sharedComponents/TinyMceWidget/index.tsx`
   - `src/editors/sharedComponents/TinyMceWidget/pluginConfig.js`
   - `src/editors/sharedComponents/TinyMceWidget/hooks.ts`
   - `src/editors/data/constants/tinyMCE.js`
   - `docs/research/paste-style-stripping-plugin.md`
2. Upstream stub package: [`frontend-components-tinymce-advanced-plugins/index.js`](https://raw.githubusercontent.com/openedx/frontend-components-tinymce-advanced-plugins/main/index.js), [`plugins/powerpaste/plugin.js`](https://raw.githubusercontent.com/openedx/frontend-components-tinymce-advanced-plugins/main/plugins/powerpaste/plugin.js), [`plugins/powerpaste/readme.txt`](https://raw.githubusercontent.com/openedx/frontend-components-tinymce-advanced-plugins/main/plugins/powerpaste/readme.txt), and issue [#27](https://github.com/openedx/frontend-components-tinymce-advanced-plugins/issues/27).
3. TinyMCE 5 PowerPaste docs: [introduction-to-powerpaste](https://www.tiny.cloud/docs/tinymce/5/introduction-to-powerpaste/), [PowerPaste options](https://www.tiny.cloud/docs/tinymce/5/introduction-to-powerpaste/).
4. TinyMCE 5 self-hosting/hybrid docs: [Upgrading TinyMCE 5](https://www.tiny.cloud/docs/tinymce/5/upgrading/), [Bundling plugins v5](https://www.tiny.cloud/docs/tinymce/5/bundling-plugins/), [editor & plugin versions](https://www.tiny.cloud/docs/tinymce/5/editor-plugin-version/), [integration-and-setup/external_plugins](https://www.tiny.cloud/docs/tinymce/5/integration-and-setup/).
5. API key / license key: [tinymce/tinymce-docs#1810 (comment)](https://github.com/tinymce/tinymce-docs/issues/1810#issuecomment-753756967), [tinymce/tinymce#9411](https://github.com/tinymce/tinymce/pull/9411).
6. Pricing & EOL: [Tiny pricing page](https://www.tiny.cloud/pricing/), [TinyMCE 5 end-of-support blog](https://www.tiny.cloud/blog/tinymce-end-of-support/).
7. React wrapper: [TinyMCE React integration v5](https://www.tiny.cloud/docs/tinymce/5/react/).
8. Upstream `frontend-app-authoring` `package.json`: [master](https://raw.githubusercontent.com/openedx/frontend-app-authoring/master/package.json).
9. PowerPaste available versions endpoint: `https://cdn.tiny.cloud/1/no-api-key/tinymce-plugins/powerpaste/available-versions`.
