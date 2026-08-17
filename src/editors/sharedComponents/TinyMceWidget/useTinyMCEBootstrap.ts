import { useCallback, useEffect, useState } from 'react';
import { getConfig } from '@edx/frontend-platform';
import { registerEmbedIframePlugin } from './customTinyMcePlugins/embedIframePlugin';

/** TinyMCE Cloud release channel used when an API key is configured. */
export const TINYMCE_CLOUD_CHANNEL = '5';

interface UseTinyMCEBootstrapResult {
  /** True once the chosen TinyMCE runtime bundle is ready to use. */
  isReady: boolean;
  /** TinyMCE Cloud API key, if configured. */
  apiKey: string | undefined;
  /** Callback passed to the Editor to register our custom plugin before init. */
  onScriptsLoad: () => void;
}

/**
 * Bootstrap TinyMCE at runtime.
 *
 * - If `TINYMCE_API_KEY` is present in the runtime config, TinyMCE is loaded
 *   from TinyMCE Cloud; the custom embed-iframe plugin is registered once the
 *   cloud script has finished loading (`onScriptsLoad`), before the editor
 *   initialises.
 * - Otherwise, the self-hosted bundle (tinymce core, theme, icons, and the
 *   open-source advanced-plugins stubs) is loaded dynamically and the custom
 *   plugin is registered immediately afterwards — in this mode the global
 *   `tinymce` already exists when the Editor mounts, so `onScriptsLoad`
 *   never fires and registration must happen here.
 */
export const useTinyMCEBootstrap = (): UseTinyMCEBootstrapResult => {
  const apiKey = getConfig().TINYMCE_API_KEY || undefined;
  const [isReady, setIsReady] = useState(!!apiKey);

  const onScriptsLoad = useCallback(() => {
    registerEmbedIframePlugin((window as any).tinymce);
  }, []);

  useEffect(() => {
    if (apiKey) {
      // Cloud mode: the Editor component loads TinyMCE from the CDN.
      return undefined;
    }

    let cancelled = false;

    const loadSelfHosted = async () => {
      await Promise.all([
        import('tinymce'),
        import('tinymce/themes/silver'),
        import('tinymce/icons/default'),
        import('frontend-components-tinymce-advanced-plugins'),
      ]);

      if (!cancelled) {
        registerEmbedIframePlugin((window as any).tinymce);
        setIsReady(true);
      }
    };

    loadSelfHosted().catch((error) => {
      // The editor will not render; make the failure visible in the console.
      // eslint-disable-next-line no-console
      console.error('Failed to load the self-hosted TinyMCE bundle', error);
    });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  return {
    isReady,
    apiKey,
    onScriptsLoad,
  };
};
