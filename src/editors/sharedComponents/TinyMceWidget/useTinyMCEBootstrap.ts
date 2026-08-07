import { useCallback, useEffect, useState } from 'react';
import { getConfig } from '@edx/frontend-platform';
import { createCorrectInternalRoute } from '@src/utils';
import { registerEmbedIframePlugin } from './customTinyMcePlugins/embedIframePlugin';

interface UseTinyMCEBootstrapResult {
  /** True once the chosen TinyMCE runtime bundle is ready to use. */
  isReady: boolean;
  /** TinyMCE Cloud API key, if configured. */
  apiKey: string | undefined;
  /** Self-hosted placeholder script src; only set in fallback mode. */
  tinymceScriptSrc: string | undefined;
  /** Callback passed to the Editor to register our custom plugin before init. */
  onScriptsLoad: () => void;
}

/**
 * Bootstrap TinyMCE at runtime.
 *
 * - If `TINYMCE_API_KEY` is present in the runtime config, TinyMCE is loaded
 *   from TinyMCE Cloud; the custom embed-iframe plugin is registered once the
 *   cloud script has finished loading.
 * - Otherwise, the self-hosted bundle (tinymce core, theme, icons, and the
 *   open-source advanced-plugins stubs) is loaded dynamically; the custom
 *   plugin is registered before the editor initializes.
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
        setIsReady(true);
      }
    };

    loadSelfHosted().catch(() => {
      // Ignored: the editor simply will not render if the bundle fails to load.
    });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  return {
    isReady,
    apiKey,
    tinymceScriptSrc: apiKey ? undefined : createCorrectInternalRoute('/tinymce-noop.js'),
    onScriptsLoad,
  };
};
