const { createDraftStore } = require('../../services/draft-store');
const { calculateSettlement } = require('../../services/settlement');
const { formatCents } = require('../../utils/money');

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
let expenseIdSequence = 0;

function errorMessage(error, fallback) {
  if (error && typeof error.message === 'string' && error.message.trim() !== '') {
    return `${fallback}：${error.message}`;
  }
  return fallback;
}

function cloneExpense(expense, id) {
  return {
    id,
    amountCents: expense.amountCents,
    payerId: expense.payerId,
    splitMode: expense.splitMode,
    participantIds: Array.isArray(expense.participantIds)
      ? expense.participantIds.slice()
      : expense.participantIds,
    note: expense.note,
  };
}

function allocateExpenseId(expenses) {
  const existingIds = new Set(expenses.map((expense) => expense.id));
  let id;
  do {
    expenseIdSequence += 1;
    id = `expense-${Date.now()}-${expenseIdSequence}`;
  } while (existingIds.has(id));
  return id;
}

function buildExpenseRows(bill) {
  const nameById = new Map(
    bill.participants.map((participant) => [participant.id, participant.displayName]),
  );
  return bill.expenses.map((expense) => {
    const note = typeof expense.note === 'string' ? expense.note.trim() : '';
    const splitText = expense.splitMode === 'all'
      ? '全员均摊'
      : `${bill.participants
        .filter((participant) => expense.participantIds.includes(participant.id))
        .map((participant) => participant.displayName)
        .join('、')}承担`;
    return {
      id: expense.id,
      title: note || '未命名消费',
      detail: `${nameById.get(expense.payerId)}付款 · ${splitText}`,
      amountText: formatCents(expense.amountCents),
    };
  });
}

function buildCollector(bill, settlement) {
  if (!settlement.collectorId) {
    return null;
  }
  const participant = bill.participants.find((item) => item.id === settlement.collectorId);
  if (!participant) {
    return null;
  }
  return {
    id: participant.id,
    displayName: participant.displayName,
    amountText: formatCents(settlement.collectorAmountCents),
  };
}

Page({
  data: {
    bill: null,
    participants: [],
    participantCount: 0,
    totalText: '0.00',
    expenseCount: 0,
    expenseRows: [],
    hasExpenses: false,
    collector: null,
    editorVisible: false,
    editingExpense: null,
    pageError: '',
  },

  onShow() {
    this._navigationPending = false;
    this._draftReady = false;
    storageReadError = null;
    const bill = store.load();
    if (!bill) {
      if (storageReadError) {
        this.surfaceError(storageReadError, '读取账单失败');
        return;
      }
      try {
        wx.reLaunch({
          url: '/pages/start/start',
          fail: (error) => this.surfaceError(error, '返回开始页失败'),
        });
      } catch (error) {
        this.surfaceError(error, '返回开始页失败');
      }
      return;
    }

    try {
      this.commitBill(bill, { persistOnlyWhenCollectorChanges: true });
      this._draftReady = true;
    } catch (error) {
      this.surfaceError(error, '读取账单失败');
    }
  },

  surfaceError(error, fallback) {
    const message = errorMessage(error, fallback);
    this.setData({ pageError: message });
    wx.showToast({ title: fallback, icon: 'none' });
  },

  commitBill(inputBill, options = {}) {
    let bill = inputBill;
    let settlement = calculateSettlement(bill, bill.collectorId);
    const collectorChanged = settlement.collectorId !== bill.collectorId;

    if (collectorChanged) {
      bill = Object.assign({}, bill, {
        collectorId: settlement.collectorId,
        updatedAt: options.persistOnlyWhenCollectorChanges ? Date.now() : bill.updatedAt,
      });
      settlement = calculateSettlement(bill, bill.collectorId);
    }

    if (!options.persistOnlyWhenCollectorChanges || collectorChanged) {
      store.save(bill);
    }

    this.renderBill(bill, settlement, options.patch || {});
  },

  renderBill(bill, settlement, patch) {
    const expenseCount = bill.expenses.length;
    this.setData(Object.assign({
      bill,
      participants: bill.participants.map((participant) => Object.assign({}, participant)),
      participantCount: bill.participants.length,
      totalText: formatCents(settlement.totalCents),
      expenseCount,
      expenseRows: buildExpenseRows(bill),
      hasExpenses: expenseCount > 0,
      collector: buildCollector(bill, settlement),
      pageError: '',
    }, patch));
  },

  openNewExpense() {
    if (!this._draftReady || !this.data.bill) {
      return;
    }
    this.setData({
      editorVisible: true,
      editingExpense: null,
      pageError: '',
    });
  },

  openEditExpense(event) {
    if (!this._draftReady || !this.data.bill) {
      return;
    }
    const id = event.currentTarget.dataset.id;
    const expense = this.data.bill.expenses.find((item) => item.id === id);
    if (!expense) {
      return;
    }
    this.setData({
      editorVisible: true,
      editingExpense: Object.assign({}, cloneExpense(expense, expense.id), {
        amountInput: formatCents(expense.amountCents),
      }),
      pageError: '',
    });
  },

  closeEditor() {
    this.setData({ editorVisible: false, editingExpense: null });
  },

  saveExpense(event) {
    if (
      !this._draftReady
      || !this.data.bill
      || !this.data.editorVisible
      || !event
      || !event.detail
    ) {
      return;
    }

    const currentBill = this.data.bill;
    const editingExpense = this.data.editingExpense;
    const expenses = currentBill.expenses.slice();
    let id;

    if (editingExpense) {
      const index = expenses.findIndex((expense) => expense.id === editingExpense.id);
      if (index === -1) {
        this.surfaceError(null, '未找到要编辑的消费');
        return;
      }
      id = editingExpense.id;
      expenses[index] = cloneExpense(event.detail, id);
    } else {
      id = allocateExpenseId(expenses);
      expenses.push(cloneExpense(event.detail, id));
    }

    const nextBill = Object.assign({}, currentBill, {
      expenses,
      updatedAt: Date.now(),
    });

    try {
      this.commitBill(nextBill, {
        patch: { editorVisible: false, editingExpense: null },
      });
    } catch (error) {
      this.surfaceError(error, '保存失败');
    }
  },

  deleteExpense(event) {
    if (!this._draftReady || !this.data.bill) {
      return;
    }
    const id = event.currentTarget.dataset.id;
    if (!this.data.bill.expenses.some((expense) => expense.id === id)) {
      return;
    }

    try {
      wx.showModal({
        title: '删除这笔消费？',
        content: '删除后需要重新添加，确认继续吗？',
        confirmText: '删除',
        confirmColor: '#d94a4a',
        success: (result) => {
          if (!result.confirm || !this._draftReady || !this.data.bill) {
            return;
          }
          const index = this.data.bill.expenses.findIndex((expense) => expense.id === id);
          if (index === -1) {
            return;
          }
          const expenses = this.data.bill.expenses.slice();
          expenses.splice(index, 1);
          const nextBill = Object.assign({}, this.data.bill, {
            expenses,
            updatedAt: Date.now(),
          });
          try {
            this.commitBill(nextBill);
          } catch (error) {
            this.surfaceError(error, '删除失败');
          }
        },
        fail: (error) => this.surfaceError(error, '删除失败'),
      });
    } catch (error) {
      this.surfaceError(error, '删除失败');
    }
  },

  editParticipants() {
    if (!this._draftReady || !this.data.bill) {
      return;
    }
    this.navigateOnce('/pages/start/start?edit=1', '打开参与人设置失败');
  },

  viewResult() {
    if (!this._draftReady || !this.data.bill || !this.data.hasExpenses) {
      return;
    }
    this.navigateOnce('/pages/result/result', '打开结算结果失败');
  },

  navigateOnce(url, fallback) {
    if (this._navigationPending) {
      return;
    }

    this._navigationPending = true;
    let failureHandled = false;
    const handleFailure = (error) => {
      if (failureHandled) {
        return;
      }
      failureHandled = true;
      this._navigationPending = false;
      this.surfaceError(error, fallback);
    };

    try {
      wx.navigateTo({
        url,
        fail: handleFailure,
      });
    } catch (error) {
      handleFailure(error);
    }
  },
});
