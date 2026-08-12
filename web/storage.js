(function createBrowserStorageModule(root) {
  function createBrowserDraftStore(storage = root.localStorage) {
    if (!storage || !root.MealSplitDraftStore) {
      throw new Error('浏览器草稿服务不可用');
    }

    return root.MealSplitDraftStore.createDraftStore({
      getStorageSync(key) {
        const serialized = storage.getItem(key);
        return serialized === null ? null : JSON.parse(serialized);
      },
      setStorageSync(key, value) {
        storage.setItem(key, JSON.stringify(value));
      },
      removeStorageSync(key) {
        storage.removeItem(key);
      },
    });
  }

  const storageApi = { createBrowserDraftStore };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = storageApi;
  } else {
    root.MealSplitStorage = storageApi;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
