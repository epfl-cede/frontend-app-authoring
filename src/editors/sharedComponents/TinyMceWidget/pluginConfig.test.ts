import { getConfig, mergeConfig } from '@edx/frontend-platform';
import pluginConfig from './pluginConfig';

const props = { placeholder: 'placeholder', editorType: 'text', enableImageUpload: false };

describe('pluginConfig paste cleanup toggle', () => {
  afterEach(() => {
    mergeConfig({ ENABLE_PASTE_CLEANUP: undefined });
  });

  it('enables the pasteclean plugin by default', () => {
    expect(getConfig().ENABLE_PASTE_CLEANUP).toBeUndefined();
    const config = pluginConfig(props);
    expect(config.plugins).toContain('pasteclean');
    expect(config.config.paste_remove_styles_if_webkit).toBe(false);
  });

  it('enables the pasteclean plugin when ENABLE_PASTE_CLEANUP is not "false"', () => {
    mergeConfig({ ENABLE_PASTE_CLEANUP: 'true' });
    const config = pluginConfig(props);
    expect(config.plugins).toContain('pasteclean');
    expect(config.config.paste_remove_styles_if_webkit).toBe(false);
  });

  it('disables the pasteclean plugin when ENABLE_PASTE_CLEANUP is "false"', () => {
    mergeConfig({ ENABLE_PASTE_CLEANUP: 'false' });
    const config = pluginConfig(props);
    expect(config.plugins).not.toContain('pasteclean');
    // core paste plugin and its built-in WebKit style cleanup remain active
    expect(config.plugins).toContain('paste');
    expect(config.config.paste_remove_styles_if_webkit).toBe(true);
  });
});
