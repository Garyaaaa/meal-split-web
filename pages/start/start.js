const { createBill, reconcileParticipants } = require('../../domain/participants');
const { createDraftStore } = require('../../services/draft-store');

const store = createDraftStore(wx);
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
  const resized = participantIds.slice(0, count);
  while (resized.length < count) {
    resized.push(null);
  }
  return resized;
}

function clampCount(count) {
  return Math.max(MIN_COUNT, Math.min(MAX_COUNT, count));
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
    error: '',
  },

  onLoad(options) {
    const draft = store.load();
    const shouldEdit = options && options.edit === '1' && draft;

    if (shouldEdit) {
      const count = draft.participants.length;
      this.setData({
        mode: draft.participantMode,
        count,
        letterChips: LETTERS.slice(0, count),
        names: draft.participants.map((participant) => participant.displayName),
        participantIds: draft.participants.map((participant) => participant.id),
        hasDraft: false,
        editing: true,
        error: '',
      });
      return;
    }

    this.setData({
      hasDraft: Boolean(draft),
      editing: false,
      error: '',
    });
  },

  onShow() {
    if (this.data.editing) {
      return;
    }
    this.setData({ hasDraft: Boolean(store.load()) });
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
    try {
      let bill;
      if (this.data.editing) {
        const draft = store.load();
        if (!draft) {
          throw new Error('未找到可编辑的账单');
        }

        const labels = this.data.mode === 'letters'
          ? LETTERS.slice(0, this.data.count)
          : this.data.names.slice(0, this.data.count);
        const alignedDraft = alignDraftParticipants(
          draft,
          this.data.participantIds.slice(0, this.data.count),
        );
        bill = Object.assign({}, reconcileParticipants(alignedDraft, labels), {
          participantMode: this.data.mode,
          updatedAt: Date.now(),
        });
      } else {
        const input = this.data.mode === 'letters'
          ? this.data.count
          : this.data.names.slice(0, this.data.count);
        bill = createBill(this.data.mode, input);
      }

      store.save(bill);
      this.setData({ error: '' });

      if (this.data.editing) {
        wx.navigateBack({ delta: 1 });
      } else {
        wx.navigateTo({ url: '/pages/ledger/ledger' });
      }
    } catch (error) {
      const message = error && typeof error.message === 'string'
        ? error.message
        : '操作失败，请重试';
      this.setData({ error: message });
    }
  },
});
