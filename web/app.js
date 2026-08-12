(function createAppModule(root) {
  const LANGUAGE_KEY = 'meal_split_language';
  const screens = new Set(['start', 'ledger', 'result']);

  function clone(value) {
    return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function createApp(options = {}) {
    const i18n = options.i18n || root.MealSplitI18n;
    const participants = options.participants || root.MealSplitParticipants;
    const storage = options.storage || root.MealSplitStorage.createBrowserDraftStore();
    const languageStorage = options.languageStorage || root.localStorage;
    const document = options.document || root.document;
    const browserLanguage = options.browserLanguage
      || (root.navigator && root.navigator.language)
      || '';
    const initialLanguage = languageStorage && typeof languageStorage.getItem === 'function'
      ? languageStorage.getItem(LANGUAGE_KEY)
      : null;
    let bill = null;
    try {
      bill = storage.load();
    } catch (error) {
      bill = null;
    }

    const state = {
      language: i18n.normalizeLanguage(initialLanguage || i18n.detectLanguage(browserLanguage)),
      screen: 'start',
      bill,
      editor: null,
      error: '',
      status: '',
      copyFallbackText: '',
    };

    function t(key, values) {
      return i18n.translate(state.language, key, values);
    }

    function setLanguage(language) {
      state.language = i18n.normalizeLanguage(language);
      if (languageStorage && typeof languageStorage.setItem === 'function') {
        languageStorage.setItem(LANGUAGE_KEY, state.language);
      }
      render();
    }

    function saveBill(nextBill) {
      try {
        storage.save(nextBill);
        state.bill = nextBill;
        state.status = t('status.saved');
        state.error = '';
        return true;
      } catch (error) {
        state.error = t('error.storage');
        return false;
      }
    }

    function createBill(mode, input) {
      const nextBill = participants.createBill(mode, input);
      if (!saveBill(nextBill)) {
        return false;
      }
      state.screen = 'ledger';
      render();
      return true;
    }

    function navigate(screen) {
      if (!screens.has(screen)) {
        throw new Error(`Unknown screen: ${screen}`);
      }
      if (screen !== 'start' && !state.bill) {
        state.screen = 'start';
      } else {
        state.screen = screen;
      }
      state.error = '';
      state.status = '';
      render();
    }

    function render() {
      if (!document || typeof document.getElementById !== 'function') {
        return;
      }
      const mount = document.getElementById('app');
      if (!mount) {
        return;
      }
      mount.innerHTML = `
        <header class="app-header">
          <div>
            <p class="eyebrow">${escapeHtml(t('app.name'))}</p>
            <p class="tagline">${escapeHtml(t('app.tagline'))}</p>
          </div>
          <button type="button" data-action="toggle-language" class="language-toggle">
            ${state.language === 'zh' ? 'English' : '中文'}
          </button>
        </header>
        <main class="screen" data-screen="${state.screen}">
          <h1>${escapeHtml(t(`${state.screen}.title`))}</h1>
          ${state.error ? `<p role="alert" class="message error">${escapeHtml(state.error)}</p>` : ''}
          ${state.status ? `<p role="status" class="message success">${escapeHtml(state.status)}</p>` : ''}
        </main>
      `;
    }

    return {
      getState() {
        return clone(state);
      },
      t,
      setLanguage,
      createBill,
      navigate,
      render,
    };
  }

  const appApi = { createApp };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = appApi;
  } else {
    root.MealSplitApp = appApi;
    if (root.document && typeof root.document.addEventListener === 'function') {
      root.document.addEventListener('DOMContentLoaded', () => {
        root.mealSplitApp = createApp();
        root.mealSplitApp.render();
      });
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
