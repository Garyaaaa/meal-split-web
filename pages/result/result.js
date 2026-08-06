const { createDraftStore } = require('../../services/draft-store');
const { calculateSettlement } = require('../../services/settlement');
const { buildShareText } = require('../../services/share');
const { formatCents } = require('../../utils/money');

let storageReadError = null;
let recoveredStoredCollector = false;

function recoverUnknownCollector(envelope) {
  if (
    !envelope
    || typeof envelope !== 'object'
    || !envelope.bill
    || typeof envelope.bill !== 'object'
    || !Array.isArray(envelope.bill.participants)
    || !Object.prototype.hasOwnProperty.call(envelope.bill, 'collectorId')
    || envelope.bill.collectorId === null
    || envelope.bill.participants.some((participant) => (
      participant
      && typeof participant === 'object'
      && participant.id === envelope.bill.collectorId
    ))
  ) {
    return envelope;
  }

  recoveredStoredCollector = true;
  return Object.assign({}, envelope, {
    bill: Object.assign({}, envelope.bill, { collectorId: null }),
  });
}

const store = createDraftStore({
  getStorageSync(key) {
    try {
      return recoverUnknownCollector(wx.getStorageSync(key));
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

const EMPTY_STATE = {
  isReady: false,
  bill: null,
  totalText: '0.00',
  participantCount: 0,
  collector: null,
  eligibleCollectors: [],
  showCollectorPicker: false,
  actionRows: [],
  isSettled: false,
  pageError: '',
};

function errorMessage(error, fallback) {
  if (error && typeof error.message === 'string' && error.message.trim() !== '') {
    return `${fallback}：${error.message}`;
  }
  return fallback;
}

function initialFor(displayName) {
  return Array.from(displayName.trim())[0] || '人';
}

function transferKey(fromId, toId) {
  return `${fromId.length}:${fromId}|${toId.length}:${toId}`;
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

function buildActionDetail(bill, member) {
  const notes = [];
  for (const expense of bill.expenses) {
    if (
      expense.splitMode === 'selected'
      && expense.participantIds.includes(member.id)
      && typeof expense.note === 'string'
      && expense.note.trim() !== ''
    ) {
      notes.push(expense.note.trim());
      if (notes.length === 2) {
        break;
      }
    }
  }

  if (notes.length > 0) {
    return `承担 ${notes.join('、')}`;
  }

  const paid = member.paidCents > 0
    ? ` · 已付 ¥${formatCents(member.paidCents)}`
    : '';
  return `应承担 ¥${formatCents(member.owedCents)}${paid}`;
}

function buildViewModel(bill, settlement) {
  const membersById = new Map(settlement.members.map((member) => [member.id, member]));
  const collectorMember = settlement.collectorId
    ? membersById.get(settlement.collectorId)
    : null;
  const eligibleCollectors = settlement.members
    .filter((member) => member.netCents > 0)
    .map((member) => ({
      id: member.id,
      displayName: member.displayName,
      initial: initialFor(member.displayName),
      isSelected: member.id === settlement.collectorId,
    }));
  const actionRows = settlement.transfers.map((transfer) => {
    const from = membersById.get(transfer.fromId);
    const to = membersById.get(transfer.toId);
    const subject = transfer.fromId === settlement.collectorId ? to : from;
    return {
      key: transferKey(transfer.fromId, transfer.toId),
      fromId: transfer.fromId,
      toId: transfer.toId,
      fromName: from.displayName,
      toName: to.displayName,
      avatarInitial: initialFor(subject.displayName),
      routeText: `${from.displayName} 转给 ${to.displayName}`,
      detail: buildActionDetail(bill, subject),
      amountText: formatCents(transfer.amountCents),
    };
  });

  return {
    isReady: true,
    bill,
    totalText: formatCents(settlement.totalCents),
    participantCount: bill.participants.length,
    collector: collectorMember ? {
      id: collectorMember.id,
      displayName: collectorMember.displayName,
      initial: initialFor(collectorMember.displayName),
      amountText: formatCents(settlement.collectorAmountCents),
    } : null,
    eligibleCollectors,
    showCollectorPicker: eligibleCollectors.length > 1,
    actionRows,
    isSettled: settlement.transfers.length === 0,
    pageError: '',
  };
}

Page({
  data: Object.assign({}, EMPTY_STATE),

  onShow() {
    this._lifecycleGeneration = (this._lifecycleGeneration || 0) + 1;
    this._navigationPending = false;
    this._finishPending = false;
    this._finishRequest = null;
    this._copyPending = false;
    this._copyRequest = null;
    this._currentBill = null;
    this._currentSettlement = null;
    storageReadError = null;
    recoveredStoredCollector = false;
    this.setData(Object.assign({}, EMPTY_STATE));

    const bill = store.load();
    if (!bill) {
      if (storageReadError) {
        this.surfaceError(storageReadError, '读取账单失败');
        return;
      }
      this.redirectUnavailable('/pages/start/start', '返回开始页失败');
      return;
    }
    if (bill.expenses.length === 0) {
      this.redirectUnavailable('/pages/ledger/ledger', '返回账单失败');
      return;
    }

    let settlement;
    try {
      settlement = calculateSettlement(bill, bill.collectorId);
    } catch (error) {
      this.surfaceError(error, '读取账单失败');
      return;
    }

    let resolvedBill = bill;
    if (recoveredStoredCollector || settlement.collectorId !== bill.collectorId) {
      resolvedBill = Object.assign({}, bill, {
        collectorId: settlement.collectorId,
        updatedAt: Date.now(),
      });
      try {
        store.save(resolvedBill);
        settlement = calculateSettlement(resolvedBill, resolvedBill.collectorId);
      } catch (error) {
        this.surfaceError(error, '保存收款人失败');
        return;
      }
    }

    this.renderResult(resolvedBill, settlement);
  },

  renderResult(bill, settlement) {
    const viewModel = buildViewModel(bill, settlement);
    this.setData(viewModel);
    this._currentBill = bill;
    this._currentSettlement = settlement;
  },

  surfaceError(error, fallback) {
    const message = errorMessage(error, fallback);
    this.setData({ pageError: message });
    try {
      wx.showToast({ title: fallback, icon: 'none' });
    } catch (toastError) {
      // The inline message remains available if the native toast cannot open.
    }
  },

  redirectUnavailable(url, fallback) {
    let handled = false;
    const handleFailure = (error) => {
      if (handled) {
        return;
      }
      handled = true;
      this.surfaceError(error, fallback);
    };
    try {
      wx.reLaunch({ url, fail: handleFailure });
    } catch (error) {
      handleFailure(error);
    }
  },

  changeCollector(event) {
    if (!this.data.isReady || !this._currentBill || !this._currentSettlement) {
      return;
    }
    const id = event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset.id
      : null;
    if (
      id === this._currentSettlement.collectorId
      || !this._currentSettlement.members.some((member) => (
        member.id === id && member.netCents > 0
      ))
    ) {
      return;
    }

    const nextBill = Object.assign({}, this._currentBill, {
      collectorId: id,
      updatedAt: Date.now(),
    });
    try {
      const nextSettlement = calculateSettlement(nextBill, id);
      if (nextSettlement.collectorId !== id) {
        return;
      }
      store.save(nextBill);
      this.renderResult(nextBill, nextSettlement);
    } catch (error) {
      this.surfaceError(error, '更换收款人失败');
    }
  },

  copyResult() {
    if (
      !this.data.isReady
      || !this._currentSettlement
      || this._copyPending
    ) {
      return;
    }
    this._copyPending = true;
    const request = {
      generation: this._lifecycleGeneration,
      handled: false,
    };
    this._copyRequest = request;
    const isCurrentRequest = () => (
      this._copyRequest === request
      && this._lifecycleGeneration === request.generation
      && !request.handled
    );
    const handleFailure = (error) => {
      if (!isCurrentRequest()) {
        return;
      }
      request.handled = true;
      this._copyRequest = null;
      this._copyPending = false;
      this.surfaceError(error, '复制失败');
    };
    const handleSuccess = () => {
      if (!isCurrentRequest()) {
        return;
      }
      request.handled = true;
      this._copyRequest = null;
      this._copyPending = false;
      this.setData({ pageError: '' });
      try {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' });
      } catch (error) {
        this.setData({ pageError: errorMessage(error, '复制成功，但提示失败') });
      }
    };

    try {
      const data = buildShareText(this._currentSettlement);
      wx.setClipboardData({ data, success: handleSuccess, fail: handleFailure });
    } catch (error) {
      handleFailure(error);
    }
  },

  returnToLedger() {
    if (!this.data.isReady || this._navigationPending) {
      return;
    }
    this._navigationPending = true;
    let fallbackStarted = false;
    let failureHandled = false;
    const failFallback = (error) => {
      if (failureHandled) {
        return;
      }
      failureHandled = true;
      this._navigationPending = false;
      this.surfaceError(error, '返回账单失败');
    };
    const fallback = () => {
      if (fallbackStarted) {
        return;
      }
      fallbackStarted = true;
      try {
        wx.reLaunch({
          url: '/pages/ledger/ledger',
          fail: failFallback,
        });
      } catch (error) {
        failFallback(error);
      }
    };

    try {
      wx.navigateBack({ delta: 1, fail: fallback });
    } catch (error) {
      fallback();
    }
  },

  finish() {
    if (!this.data.isReady || !this._currentBill || this._finishPending) {
      return;
    }
    this._finishPending = true;
    const request = {
      generation: this._lifecycleGeneration,
      expectedFingerprint: billFingerprint(this._currentBill),
      modalHandled: false,
      navigationFailureHandled: false,
    };
    this._finishRequest = request;
    const isActiveRequest = () => (
      this._finishRequest === request
      && this._lifecycleGeneration === request.generation
    );
    const releaseRequest = () => {
      if (!isActiveRequest()) {
        return false;
      }
      this._finishRequest = null;
      this._finishPending = false;
      return true;
    };
    const modalFailure = (error) => {
      if (!isActiveRequest() || request.modalHandled) {
        return;
      }
      request.modalHandled = true;
      releaseRequest();
      this.surfaceError(error, '打开确认提示失败');
    };
    const modalSuccess = (result) => {
      if (!isActiveRequest() || request.modalHandled) {
        return;
      }
      request.modalHandled = true;
      if (!result || !result.confirm) {
        releaseRequest();
        return;
      }

      storageReadError = null;
      recoveredStoredCollector = false;
      const currentBill = store.load();
      if (storageReadError) {
        releaseRequest();
        this.surfaceError(storageReadError, '读取账单失败');
        return;
      }
      if (!currentBill || billFingerprint(currentBill) !== request.expectedFingerprint) {
        releaseRequest();
        this.surfaceError(null, '账单已更新，请重新确认');
        return;
      }

      try {
        store.clear();
      } catch (error) {
        releaseRequest();
        this.surfaceError(error, '清除账单失败');
        return;
      }

      this._currentBill = null;
      this._currentSettlement = null;
      this.setData(Object.assign({}, EMPTY_STATE));

      const navigationFailure = (error) => {
        if (!isActiveRequest() || request.navigationFailureHandled) {
          return;
        }
        request.navigationFailureHandled = true;
        releaseRequest();
        this.surfaceError(error, '返回开始页失败');
      };
      try {
        wx.reLaunch({
          url: '/pages/start/start',
          fail: navigationFailure,
        });
      } catch (error) {
        navigationFailure(error);
      }
    };

    try {
      wx.showModal({
        title: '开始一笔新账单？',
        content: '当前本地账单将被清除，此操作无法撤销。',
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
});
