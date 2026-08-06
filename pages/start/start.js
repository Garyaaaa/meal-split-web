const { createBill, reconcileParticipants } = require('../../domain/participants');
const { createDraftStore } = require('../../services/draft-store');

let storageReadError = null;
const store = createDraftStore({
  getStorageSync(key) {
    try {
      return wx.getStorageSync(key);
    } catch (error) {
      storageReadError = error;
      throw error;
    }
  },
  setStorageSync(key, value) {
    return wx.setStorageSync(key, value);
  },
  removeStorageSync(key) {
    return wx.removeStorageSync(key);
  },
});
const LETTERS = 'ABCDEFGHIJKLMNOPQRST'.split('');
const DEFAULT_COUNT = 5;
const MIN_COUNT = 2;
const MAX_COUNT = 20;

function blankNames(count) {
  return Array.from({ length: count }, () => '');
}

function blankParticipantIds(count) {
  return Array.from({ length: count }, () => null);
}

function resizeNames(names, count) {
  const resized = names.slice(0, count);
  while (resized.length < count) {
    resized.push('');
  }
  return resized;
}

function resizeParticipantIds(participantIds, count) {
  const resized = participantIds.slice();
  while (resized.length < count) {
    resized.push(null);
  }
  return resized;
}

function clampCount(count) {
  return Math.max(MIN_COUNT, Math.min(MAX_COUNT, count));
}

function loadDraft() {
  storageReadError = null;
  const draft = store.load();
  return { draft, error: storageReadError };
}

function errorMessage(error, fallback) {
  if (error && typeof error.message === 'string' && error.message.trim() !== '') {
    return `${fallback}：${error.message}`;
  }
  return fallback;
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalize(value[key]);
    return result;
  }, {});
}

function billFingerprint(bill) {
  return JSON.stringify(canonicalize(bill));
}

function alignDraftParticipants(draft, participantIds) {
  const participantsById = new Map(
    draft.participants.map((participant) => [participant.id, participant]),
  );
  const usedIds = new Set(draft.participants.map((participant) => participant.id));
  const visibleIds = new Set();
  let nextIdNumber = 1;

  function allocateId() {
    while (usedIds.has(`p${nextIdNumber}`)) {
      nextIdNumber += 1;
    }
    const id = `p${nextIdNumber}`;
    usedIds.add(id);
    return id;
  }

  const visibleParticipants = participantIds.map((id) => {
    const participant = participantsById.get(id);
    if (participant && !visibleIds.has(id)) {
      visibleIds.add(id);
      return participant;
    }

    const newId = allocateId();
    visibleIds.add(newId);
    return { id: newId, displayName: '' };
  });
  const removedParticipants = draft.participants.filter(
    (participant) => !visibleIds.has(participant.id),
  );

  return Object.assign({}, draft, {
    participants: visibleParticipants.concat(removedParticipants),
  });
}

Page({
  data: {
    mode: 'letters',
    count: DEFAULT_COUNT,
    letterChips: LETTERS.slice(0, DEFAULT_COUNT),
    names: blankNames(DEFAULT_COUNT),
    participantIds: blankParticipantIds(DEFAULT_COUNT),
    hasDraft: false,
    editing: false,
    editInitialized: false,
    error: '',
  },

  onLoad(options) {
    this.beginLifecycle();
    const loaded = loadDraft();
    const draft = loaded.draft;
    const wantsEdit = Boolean(options && options.edit === '1');

    if (wantsEdit && !draft) {
      this.setData({
        hasDraft: false,
        editing: true,
        editInitialized: false,
        error: '未找到可编辑的账单',
      });
      return;
    }

    if (wantsEdit) {
      const count = draft.participants.length;
      this.setData({
        mode: draft.participantMode,
        count,
        letterChips: LETTERS.slice(0, count),
        names: draft.participants.map((participant) => participant.displayName),
        participantIds: draft.participants.map((participant) => participant.id),
        hasDraft: false,
        editing: true,
        editInitialized: true,
        error: '',
      });
      return;
    }

    if (loaded.error) {
      this.setData({
        hasDraft: false,
        editing: false,
        editInitialized: false,
        error: errorMessage(loaded.error, '读取账单失败'),
      });
      return;
    }

    this.setData({
      hasDraft: Boolean(draft),
      editing: false,
      editInitialized: false,
      error: '',
    });
  },

  onShow() {
    this.beginLifecycle();
    if (this.data.editing) {
      return;
    }
    const loaded = loadDraft();
    if (loaded.error) {
      this.setData({
        hasDraft: false,
        error: errorMessage(loaded.error, '读取账单失败'),
      });
      return;
    }
    this.setData({ hasDraft: Boolean(loaded.draft), error: '' });
  },

  beginLifecycle() {
    this._lifecycleGeneration = (this._lifecycleGeneration || 0) + 1;
    this._replacePending = false;
    this._replaceRequest = null;
    this._navigationPending = false;
  },

  chooseMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode !== 'letters' && mode !== 'names') {
      return;
    }

    this.setData({
      mode,
      names: resizeNames(this.data.names, this.data.count),
      participantIds: resizeParticipantIds(this.data.participantIds, this.data.count),
      error: '',
    });
  },

  changeCount(event) {
    const delta = Number(event.currentTarget.dataset.delta);
    const count = clampCount(this.data.count + delta);
    this.updateCount(count);
  },

  updateCount(count) {
    const nextCount = clampCount(count);
    this.setData({
      count: nextCount,
      letterChips: LETTERS.slice(0, nextCount),
      names: resizeNames(this.data.names, nextCount),
      participantIds: resizeParticipantIds(this.data.participantIds, nextCount),
      error: '',
    });
  },

  updateName(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.count) {
      return;
    }

    const names = this.data.names.slice();
    names[index] = event.detail.value;
    this.setData({ names, error: '' });
  },

  addName() {
    this.updateCount(this.data.count + 1);
  },

  removeName(event) {
    if (this.data.count <= MIN_COUNT) {
      return;
    }

    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.count) {
      return;
    }

    const names = this.data.names.slice();
    const participantIds = this.data.participantIds.slice();
    names.splice(index, 1);
    participantIds.splice(index, 1);
    const count = names.length;
    this.setData({
      count,
      names,
      participantIds,
      letterChips: LETTERS.slice(0, count),
      error: '',
    });
  },

  continueDraft() {
    wx.navigateTo({ url: '/pages/ledger/ledger' });
  },

  submit() {
    if (this.data.editing) {
      this.submitEdit();
      return;
    }

    let candidate;
    try {
      const input = this.data.mode === 'letters'
        ? this.data.count
        : this.data.names.slice(0, this.data.count);
      candidate = createBill(this.data.mode, input);
    } catch (error) {
      const message = error && typeof error.message === 'string'
        ? error.message
        : '操作失败，请重试';
      this.setData({ error: message });
      return;
    }

    if (this._replacePending || this._navigationPending) {
      return;
    }

    const loaded = loadDraft();
    if (loaded.error) {
      this.setData({ error: errorMessage(loaded.error, '读取账单失败') });
      return;
    }
    if (!loaded.draft) {
      this.saveNewBill(candidate, null);
      return;
    }

    this.openReplacementConfirmation(candidate, loaded.draft);
  },

  submitEdit() {
    try {
      if (!this.data.editInitialized) {
        throw new Error('未找到可编辑的账单');
      }
      const loaded = loadDraft();
      if (!loaded.draft) {
        throw new Error('未找到可编辑的账单');
      }

      const labels = this.data.mode === 'letters'
        ? LETTERS.slice(0, this.data.count)
        : this.data.names.slice(0, this.data.count);
      const alignedDraft = alignDraftParticipants(
        loaded.draft,
        this.data.participantIds.slice(0, this.data.count),
      );
      const bill = Object.assign({}, reconcileParticipants(alignedDraft, labels), {
        participantMode: this.data.mode,
        updatedAt: Date.now(),
      });
      store.save(bill);
      this.setData({ error: '' });
      wx.navigateBack({ delta: 1 });
    } catch (error) {
      const message = error && typeof error.message === 'string'
        ? error.message
        : '操作失败，请重试';
      this.setData({ error: message });
    }
  },

  isReplacementRequestActive(request) {
    return Boolean(
      request
      && this._replaceRequest === request
      && this._lifecycleGeneration === request.generation,
    );
  },

  releaseReplacementRequest(request) {
    if (!this.isReplacementRequestActive(request)) {
      return false;
    }
    this._replaceRequest = null;
    this._replacePending = false;
    return true;
  },

  openReplacementConfirmation(candidate, currentDraft) {
    if (this._replacePending) {
      return;
    }

    this._replacePending = true;
    const request = {
      generation: this._lifecycleGeneration,
      expectedFingerprint: billFingerprint(currentDraft),
      candidate,
      modalHandled: false,
    };
    this._replaceRequest = request;

    const modalFailure = (error) => {
      if (!this.isReplacementRequestActive(request) || request.modalHandled) {
        return;
      }
      request.modalHandled = true;
      this.releaseReplacementRequest(request);
      this.setData({ error: errorMessage(error, '打开确认提示失败') });
    };
    const modalSuccess = (result) => {
      if (!this.isReplacementRequestActive(request) || request.modalHandled) {
        return;
      }
      request.modalHandled = true;
      if (!result || !result.confirm) {
        this.releaseReplacementRequest(request);
        return;
      }

      const loaded = loadDraft();
      if (loaded.error) {
        this.releaseReplacementRequest(request);
        this.setData({ error: errorMessage(loaded.error, '读取账单失败') });
        return;
      }
      if (
        !loaded.draft
        || billFingerprint(loaded.draft) !== request.expectedFingerprint
      ) {
        this.releaseReplacementRequest(request);
        this.setData({
          hasDraft: Boolean(loaded.draft),
          error: '账单已更新，请重新操作',
        });
        return;
      }

      this.saveNewBill(request.candidate, request);
    };

    this.setData({ error: '' });
    try {
      wx.showModal({
        title: '开始新账单？',
        content: '当前未完成的账单将被替换并清除，确认继续吗？',
        confirmText: '清除账单',
        confirmColor: '#d94a4a',
        cancelText: '取消',
        success: modalSuccess,
        fail: modalFailure,
      });
    } catch (error) {
      modalFailure(error);
    }
  },

  saveNewBill(candidate, request) {
    try {
      store.save(candidate);
      this.setData({ hasDraft: true, error: '' });
    } catch (error) {
      if (request) {
        this.releaseReplacementRequest(request);
      }
      this.setData({ error: errorMessage(error, '保存账单失败') });
      return;
    }

    this.navigateToLedger(request);
  },

  navigateToLedger(request) {
    if (this._navigationPending) {
      return;
    }
    this._navigationPending = true;
    const generation = this._lifecycleGeneration;
    let failureHandled = false;
    const handleFailure = (error) => {
      if (
        failureHandled
        || this._lifecycleGeneration !== generation
        || (request && !this.isReplacementRequestActive(request))
      ) {
        return;
      }
      failureHandled = true;
      this._navigationPending = false;
      if (request) {
        this.releaseReplacementRequest(request);
      }
      this.setData({
        hasDraft: true,
        error: errorMessage(error, '打开账单失败'),
      });
    };

    try {
      wx.navigateTo({
        url: '/pages/ledger/ledger',
        fail: handleFailure,
      });
    } catch (error) {
      handleFailure(error);
    }
  },
});
