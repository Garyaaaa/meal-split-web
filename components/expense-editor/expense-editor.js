const { parseYuanToCents } = require('../../utils/money');

let provisionalIdSequence = 0;

function participantIds(participants) {
  if (!Array.isArray(participants)) {
    return [];
  }
  return participants
    .filter((participant) => (
      participant
      && typeof participant.id === 'string'
      && participant.id.trim() !== ''
    ))
    .map((participant) => participant.id);
}

function orderedSelection(participants, selectedIds) {
  const selected = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  return participantIds(participants).filter((id) => selected.has(id));
}

function buildParticipantOptions(participants, payerId, selectedIds) {
  const selected = new Set(selectedIds);
  return (Array.isArray(participants) ? participants : []).map((participant) => ({
    id: participant.id,
    displayName: participant.displayName,
    isPayer: participant.id === payerId,
    isSelected: selected.has(participant.id),
  }));
}

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer(visible) {
        if (visible) {
          this.resetForm();
        }
      },
    },
    participants: {
      type: Array,
      value: [],
    },
    value: {
      type: Object,
      value: null,
    },
  },

  data: {
    amountInput: '',
    note: '',
    payerId: '',
    splitMode: 'all',
    selectedParticipantIds: [],
    participantOptions: [],
    error: '',
  },

  methods: {
    resetForm() {
      const participants = Array.isArray(this.data.participants)
        ? this.data.participants
        : [];
      const allIds = participantIds(participants);
      const value = this.data.value;
      const isEditing = Boolean(value && typeof value === 'object');
      const payerId = isEditing ? value.payerId : (allIds[0] || '');
      const splitMode = isEditing ? value.splitMode : 'all';
      const selectedParticipantIds = isEditing && splitMode === 'selected'
        ? orderedSelection(participants, value.participantIds)
        : allIds.slice();

      this.setData({
        amountInput: isEditing && typeof value.amountInput === 'string'
          ? value.amountInput
          : '',
        note: isEditing && typeof value.note === 'string' ? value.note : '',
        payerId,
        splitMode,
        selectedParticipantIds,
        participantOptions: buildParticipantOptions(
          participants,
          payerId,
          selectedParticipantIds,
        ),
        error: '',
      });
    },

    syncParticipantOptions(payerId, selectedParticipantIds) {
      this.setData({
        participantOptions: buildParticipantOptions(
          this.data.participants,
          payerId,
          selectedParticipantIds,
        ),
      });
    },

    close() {
      this.triggerEvent('close');
    },

    stopPropagation() {},

    onAmountInput(event) {
      this.setData({ amountInput: event.detail.value, error: '' });
    },

    onNoteInput(event) {
      this.setData({ note: event.detail.value, error: '' });
    },

    choosePayer(event) {
      const id = event.currentTarget.dataset.id;
      if (!participantIds(this.data.participants).includes(id)) {
        return;
      }
      this.setData({ payerId: id, error: '' });
      this.syncParticipantOptions(id, this.data.selectedParticipantIds);
    },

    chooseSplitMode(event) {
      const mode = event.currentTarget.dataset.mode;
      if (mode !== 'all' && mode !== 'selected') {
        return;
      }
      this.setData({ splitMode: mode, error: '' });
    },

    toggleParticipant(event) {
      const id = event.currentTarget.dataset.id;
      const validIds = participantIds(this.data.participants);
      if (!validIds.includes(id)) {
        return;
      }
      const selected = new Set(this.data.selectedParticipantIds);
      if (selected.has(id)) {
        selected.delete(id);
      } else {
        selected.add(id);
      }
      const selectedParticipantIds = validIds.filter((participantId) => (
        selected.has(participantId)
      ));
      this.setData({ selectedParticipantIds, error: '' });
      this.syncParticipantOptions(this.data.payerId, selectedParticipantIds);
    },

    submit() {
      const amountCents = parseYuanToCents(this.data.amountInput);
      if (amountCents === null) {
        this.setData({ error: '请输入有效金额（最多两位小数）' });
        return;
      }

      const validIds = participantIds(this.data.participants);
      if (!validIds.includes(this.data.payerId)) {
        this.setData({ error: '请选择付款人' });
        return;
      }
      if (this.data.splitMode !== 'all' && this.data.splitMode !== 'selected') {
        this.setData({ error: '请选择承担方式' });
        return;
      }

      const selectedParticipantIds = orderedSelection(
        this.data.participants,
        this.data.selectedParticipantIds,
      );
      if (this.data.splitMode === 'selected' && selectedParticipantIds.length === 0) {
        this.setData({ error: '至少选择一位承担人' });
        return;
      }

      const value = this.data.value;
      provisionalIdSequence += 1;
      const id = value && typeof value.id === 'string' && value.id.trim() !== ''
        ? value.id
        : `pending-${Date.now()}-${provisionalIdSequence}`;
      const note = typeof this.data.note === 'string'
        ? this.data.note.trim().slice(0, 30)
        : '';

      this.triggerEvent('save', {
        id,
        amountCents,
        payerId: this.data.payerId,
        splitMode: this.data.splitMode,
        participantIds: this.data.splitMode === 'all' ? [] : selectedParticipantIds,
        note,
      });
    },
  },
});
