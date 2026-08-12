(function createClipboardModule(root) {
  function createClipboard(clipboard) {
    const writer = clipboard && typeof clipboard.writeText === 'function'
      ? clipboard
      : null;

    return {
      async copy(text) {
        if (!writer) {
          return { copied: false, fallbackText: text };
        }

        try {
          await writer.writeText(text);
          return { copied: true, fallbackText: '' };
        } catch (error) {
          return { copied: false, fallbackText: text };
        }
      },
    };
  }

  const clipboardApi = { createClipboard };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = clipboardApi;
  } else {
    root.MealSplitClipboard = clipboardApi;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
