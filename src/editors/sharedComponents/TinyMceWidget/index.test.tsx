import React from 'react';
import {
  screen,
  initializeMocks,
  waitFor,
} from '@src/testUtils';
import { getConfig } from '@edx/frontend-platform';
import { editorRender } from '@src/editors/editorTestRender';
import * as hooks from './hooks';
import { registerEmbedIframePlugin } from './customTinyMcePlugins/embedIframePlugin';
import TinyMceWidget from '.';

const staticUrl = '/assets/sOmEaSsET';

let capturedEditorProps: any;

// Per https://github.com/tinymce/tinymce-react/issues/91 React unit testing in JSDOM is not supported by tinymce.
// Consequently, mock the Editor out, but capture its props so we can assert on bootstrap behavior.
jest.mock('@tinymce/tinymce-react', () => {
  const originalModule = jest.requireActual('@tinymce/tinymce-react');
  return {
    __esModule: true,
    ...originalModule,
    Editor: (props: any) => {
      capturedEditorProps = props;
      return <div data-testid="tinymce-editor">TiNYmCE EDitOR</div>;
    },
  };
});

jest.mock('../ImageUploadModal', () => 'ImageUploadModal');
jest.mock('../SourceCodeModal', () => 'SourceCodeModal');

jest.mock('./hooks', () => ({
  editorConfig: jest.fn(args => ({ editorConfig: args })),
  imgModalToggle: jest.fn(() => ({
    isImgOpen: true,
    openImgModal: jest.fn().mockName('openModal'),
    closeImgModal: jest.fn().mockName('closeModal'),
  })),
  sourceCodeModalToggle: jest.fn(() => ({
    isSourceCodeOpen: true,
    openSourceCodeModal: jest.fn().mockName('openModal'),
    closeSourceCodeModal: jest.fn().mockName('closeModal'),
  })),
  selectedImage: jest.fn(() => ({
    selection: 'hooks.selectedImage.selection',
    setSelection: jest.fn().mockName('hooks.selectedImage.setSelection'),
    clearSelection: jest.fn().mockName('hooks.selectedImage.clearSelection'),
  })),
  useImages: jest.fn(() => ({ imagesRef: { current: [{ externalUrl: staticUrl }] } })),
}));

jest.mock('tinymce', () => ({}));
jest.mock('tinymce/themes/silver', () => ({}));
jest.mock('tinymce/icons/default', () => ({}));
jest.mock('frontend-components-tinymce-advanced-plugins', () => ({ a11ycheckerCss: '' }));

jest.mock('./customTinyMcePlugins/embedIframePlugin', () => ({
  __esModule: true,
  registerEmbedIframePlugin: jest.fn(),
}));

describe('TinyMceWidget', () => {
  beforeEach(() => {
    initializeMocks();
    capturedEditorProps = null;
  });

  const props = {
    editorType: 'text',
    editorRef: { current: { value: 'something' } },
    isLibrary: false,
    images: { sOmEaSsET: { staTICUrl: staticUrl } },
    lmsEndpointUrl: 'sOmEvaLue.cOm',
    studioEndpointUrl: 'sOmEoThERvaLue.cOm',
    disabled: false,
    id: 'sOMeiD',
    updateContent: () => ({}),
    learningContextId: 'course+org+run',
    editorContentHtml: undefined,
    enableImageUpload: undefined,
    onChange: undefined,
    staticRootUrl: undefined,
  };

  describe('render', () => {
    jest.spyOn(hooks, 'imgModalToggle').mockReturnValue({
      isImgOpen: false,
      openImgModal: jest.fn().mockName('modal.openModal'),
      closeImgModal: jest.fn().mockName('modal.closeModal'),
    });
    jest.spyOn(hooks, 'sourceCodeModalToggle').mockReturnValue({
      isSourceCodeOpen: false,
      openSourceCodeModal: jest.fn().mockName('modal.openModal'),
      closeSourceCodeModal: jest.fn().mockName('modal.closeModal'),
    });

    test('renders as expected with default behavior', async () => {
      const { container } = editorRender(<TinyMceWidget {...props} />);
      await waitFor(() => expect(screen.getByTestId('tinymce-editor')).toBeInTheDocument());
      expect(screen.getByText('TiNYmCE EDitOR')).toBeInTheDocument();
      expect(container.querySelector('sourcecodemodal')).toBeInTheDocument();
      expect(container.querySelector('imageuploadmodal')).toBeInTheDocument();
    });

    test('SourcecodeModal is not rendered', async () => {
      const { container } = editorRender(<TinyMceWidget {...props} editorType="problem" />);
      await waitFor(() => expect(screen.getByTestId('tinymce-editor')).toBeInTheDocument());
      expect(container.querySelector('imageuploadmodal')).toBeInTheDocument();
      expect(container.querySelector('sourcecodemodal')).not.toBeInTheDocument();
    });

    test('ImageUploadModal is not rendered', async () => {
      const { container } = editorRender(<TinyMceWidget {...props} enableImageUpload={false} />);
      await waitFor(() => expect(screen.getByTestId('tinymce-editor')).toBeInTheDocument());
      expect(container.querySelector('imageuploadmodal')).not.toBeInTheDocument();
      expect(container.querySelector('sourcecodemodal')).toBeInTheDocument();
    });
  });

  describe('bootstrap', () => {
    test('loads TinyMCE from Cloud when TINYMCE_API_KEY is configured', async () => {
      getConfig().TINYMCE_API_KEY = 'test-api-key';
      editorRender(<TinyMceWidget {...props} />);
      await waitFor(() => expect(capturedEditorProps).not.toBeNull());
      expect(capturedEditorProps.apiKey).toBe('test-api-key');
      expect(capturedEditorProps.tinymceScriptSrc).toBeUndefined();
      expect(capturedEditorProps.cloudChannel).toBe('5');
    });

    test('falls back to the self-hosted bundle when no API key is configured', async () => {
      getConfig().TINYMCE_API_KEY = undefined;
      editorRender(<TinyMceWidget {...props} />);
      await waitFor(() => expect(capturedEditorProps).not.toBeNull());
      expect(capturedEditorProps.apiKey).toBeUndefined();
      expect(capturedEditorProps.tinymceScriptSrc).toBe('/tinymce-noop.js');
    });

    test('registers the embed-iframe plugin after scripts load in Cloud mode', async () => {
      getConfig().TINYMCE_API_KEY = 'test-api-key';
      editorRender(<TinyMceWidget {...props} />);
      await waitFor(() => expect(capturedEditorProps).not.toBeNull());
      capturedEditorProps.onScriptsLoad();
      expect(registerEmbedIframePlugin).toHaveBeenCalledWith((window as any).tinymce);
    });

    test('registers the embed-iframe plugin after scripts load in self-hosted mode', async () => {
      getConfig().TINYMCE_API_KEY = undefined;
      editorRender(<TinyMceWidget {...props} />);
      await waitFor(() => expect(capturedEditorProps).not.toBeNull());
      capturedEditorProps.onScriptsLoad();
      expect(registerEmbedIframePlugin).toHaveBeenCalledWith((window as any).tinymce);
    });
  });
});
