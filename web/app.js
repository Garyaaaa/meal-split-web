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
    let clipboard = options.clipboard
      || (root.MealSplitClipboard && root.MealSplitClipboard.createClipboard(root.navigator && root.navigator.clipboard));
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
      participantCount: 2,
      editor: null,
      error: '',
      status: '',
      copyFallbackText: '',
      confirm: null,
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
      state.participantCount = 2;
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

    function createExpense(input) {
      const amountCents = root.MealSplitMoney.parseYuanToCents(input.amount);
      if (!amountCents) {
        state.error = t('error.invalidAmount');
        render();
        return null;
      }
      if (!state.bill || !state.bill.participants.some((participant) => participant.id === input.payerId)) {
        state.error = t('error.invalidPayer');
        render();
        return null;
      }
      const splitMode = input.splitMode === 'selected' ? 'selected' : 'all';
      const participantIds = splitMode === 'selected'
        ? state.bill.participants
          .map((participant) => participant.id)
          .filter((id) => Array.isArray(input.participantIds) && input.participantIds.includes(id))
        : [];
      if (splitMode === 'selected' && participantIds.length === 0) {
        state.error = t('error.emptySelected');
        render();
        return null;
      }
      return {
        id: input.id || `expense-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        amountCents,
        payerId: input.payerId,
        splitMode,
        participantIds,
        ...(String(input.note || '').trim() ? { note: String(input.note).trim() } : {}),
      };
    }

    function addExpense(input) {
      if (!state.bill) {
        return false;
      }
      const expense = createExpense(input);
      if (!expense) {
        return false;
      }
      const nextBill = { ...state.bill, expenses: [...state.bill.expenses, expense], updatedAt: Date.now() };
      return saveBill(nextBill);
    }

    function editExpense(expenseId, input) {
      if (!state.bill || !state.bill.expenses.some((expense) => expense.id === expenseId)) {
        return false;
      }
      const expense = createExpense({ ...input, id: expenseId });
      if (!expense) {
        return false;
      }
      const nextBill = {
        ...state.bill,
        expenses: state.bill.expenses.map((current) => current.id === expenseId ? expense : current),
        updatedAt: Date.now(),
      };
      return saveBill(nextBill);
    }

    function deleteExpense(expenseId) {
      if (!state.bill || !state.bill.expenses.some((expense) => expense.id === expenseId)) {
        return false;
      }
      const nextBill = {
        ...state.bill,
        expenses: state.bill.expenses.filter((expense) => expense.id !== expenseId),
        updatedAt: Date.now(),
      };
      return saveBill(nextBill);
    }

    function getSettlement() {
      if (!state.bill) {
        return null;
      }
      return root.MealSplitSettlement.calculateSettlement(state.bill, state.bill.collectorId);
    }

    function formatAmount(cents) {
      return `$${root.MealSplitMoney.formatCents(cents)}`;
    }

    function avatarCharacter(name) {
      const trimmedName = String(name || '').trim();
      if (!trimmedName) {
        return '?';
      }
      if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        const firstSegment = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
          .segment(trimmedName)[Symbol.iterator]().next().value;
        if (firstSegment && firstSegment.segment) {
          return firstSegment.segment;
        }
      }
      const visibleCharacter = [...trimmedName].find((character) => character.trim());
      return visibleCharacter || '?';
    }

    function changeCollector(collectorId) {
      const result = getSettlement();
      if (!result || !result.members.some((member) => member.id === collectorId && member.netCents > 0)) {
        return false;
      }
      return saveBill({ ...state.bill, collectorId, updatedAt: Date.now() });
    }

    function setClipboard(nextClipboard) {
      clipboard = root.MealSplitClipboard.createClipboard(nextClipboard);
    }

    async function copySummary() {
      const result = getSettlement();
      if (!result || !clipboard) {
        state.copyFallbackText = '';
        return { copied: false, fallbackText: '' };
      }
      const shareText = root.MealSplitShare.buildShareText(result, state.language);
      const copyResult = await clipboard.copy(shareText);
      state.copyFallbackText = copyResult.fallbackText;
      state.status = copyResult.copied ? t('common.copied') : '';
      render();
      return copyResult;
    }

    function finish(confirmed) {
      if (!confirmed || !state.bill) {
        return false;
      }
      storage.clear();
      state.bill = null;
      state.screen = 'start';
      state.participantCount = 2;
      state.editor = null;
      state.copyFallbackText = '';
      state.status = '';
      render();
      return true;
    }

    function openEditor(expenseId = null) {
      const expense = expenseId && state.bill
        ? state.bill.expenses.find((item) => item.id === expenseId)
        : null;
      const participantIds = state.bill ? state.bill.participants.map((participant) => participant.id) : [];
      state.editor = expense
        ? {
          id: expense.id,
          amount: root.MealSplitMoney.formatCents(expense.amountCents),
          payerId: expense.payerId,
          splitMode: expense.splitMode,
          participantIds: expense.splitMode === 'all' ? participantIds : [...expense.participantIds],
          note: expense.note || '',
        }
        : {
          id: null,
          amount: '',
          payerId: participantIds[0] || '',
          splitMode: 'all',
          participantIds,
          note: '',
        };
      state.error = '';
      render();
    }

    function requestConfirm(kind, id = null) {
      state.confirm = { kind, id };
      render();
    }

    function resolveConfirm(confirmed) {
      const pending = state.confirm;
      state.confirm = null;
      if (!pending || !confirmed) {
        render();
        return;
      }
      if (pending.kind === 'delete') {
        deleteExpense(pending.id);
        render();
      } else if (pending.kind === 'finish') {
        finish(true);
      } else if (pending.kind === 'reset') {
        storage.clear();
        state.bill = null;
        state.screen = 'start';
        state.participantCount = 2;
        state.status = '';
        render();
      }
    }

    function submitStartForm(form) {
      const mode = form.elements.namingMode.value;
      const count = Number(form.elements.count.value);
      const names = form.elements.names.value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
      try {
        createBill(mode, mode === 'letters' ? count : names);
      } catch (error) {
        state.error = t('error.invalidNames');
        render();
      }
    }

    function submitExpenseForm(form) {
      const input = {
        id: state.editor && state.editor.id,
        amount: form.elements.amount.value,
        payerId: form.elements.payerId.value,
        splitMode: form.elements.splitMode.value,
        participantIds: Array.from(form.querySelectorAll('input[name="participantIds"]:checked')).map((input) => input.value),
        note: form.elements.note.value,
      };
      const success = state.editor && state.editor.id
        ? editExpense(state.editor.id, input)
        : addExpense(input);
      if (success) {
        state.editor = null;
        state.error = '';
        render();
      }
    }

    function handleSubmit(event) {
      const form = event.target;
      if (!form || !form.dataset || !form.dataset.action) {
        return;
      }
      event.preventDefault();
      if (form.dataset.action === 'create-bill') {
        submitStartForm(form);
      } else if (form.dataset.action === 'save-expense') {
        submitExpenseForm(form);
      }
    }

    function handleClick(event) {
      const target = event.target.closest('[data-action]');
      if (!target) {
        return;
      }
      const action = target.dataset.action;
      if (action === 'change-count') {
        const form = target.closest('form[data-action="create-bill"]');
        const countInput = form && form.elements ? form.elements.count : null;
        if (!countInput) {
          return;
        }
        const currentCount = Number(countInput.value) || 2;
        const step = target.dataset.direction === 'decrease' ? -1 : 1;
        const nextCount = Math.max(2, Math.min(20, currentCount + step));
        countInput.value = String(nextCount);
        state.participantCount = nextCount;
        const output = form.querySelector('output[data-count-value]');
        if (output) {
          output.textContent = String(nextCount);
        }
      } else if (action === 'toggle-language') {
        setLanguage(state.language === 'zh' ? 'en' : 'zh');
      } else if (action === 'resume') {
        navigate('ledger');
      } else if (action === 'new-bill') {
        requestConfirm('reset');
      } else if (action === 'open-expense') {
        openEditor();
      } else if (action === 'edit-expense') {
        openEditor(target.dataset.id);
      } else if (action === 'delete-expense') {
        requestConfirm('delete', target.dataset.id);
      } else if (action === 'close-editor') {
        state.editor = null;
        state.error = '';
        render();
      } else if (action === 'view-result') {
        navigate('result');
      } else if (action === 'back-ledger') {
        navigate('ledger');
      } else if (action === 'copy-summary') {
        copySummary();
      } else if (action === 'finish-request') {
        requestConfirm('finish');
      } else if (action === 'change-collector') {
        if (changeCollector(target.dataset.id)) {
          render();
        }
      } else if (action === 'confirm') {
        resolveConfirm(target.dataset.confirm === 'yes');
      }
    }

    function renderMessages() {
      return `${state.error ? `<p role="alert" class="message error">${escapeHtml(state.error)}</p>` : ''}
        ${state.status ? `<p role="status" class="message success">${escapeHtml(state.status)}</p>` : ''}`;
    }

    function renderHeader() {
      return `<header class="app-header">
        <div>
          <p class="eyebrow">${escapeHtml(t('app.name'))}</p>
          <p class="tagline">${escapeHtml(t('app.tagline'))}</p>
        </div>
        <button type="button" data-action="toggle-language" class="language-toggle" aria-label="${escapeHtml(t('common.language'))}">
          ${state.language === 'zh' ? 'English' : '中文'}
        </button>
      </header>`;
    }

    function renderStart() {
      return `<section class="screen start-screen" data-screen="start">
        <div class="hero">
          <p class="kicker">${escapeHtml(t('start.title'))}</p>
          <h1>${escapeHtml(t('start.subtitle'))}</h1>
        </div>
        ${state.bill ? `<div class="resume-card card">
          <div><strong>${escapeHtml(t('start.resume'))}</strong><p>${state.bill.participants.length} ${escapeHtml(t('ledger.people'))} · ${state.bill.expenses.length} ${escapeHtml(t('ledger.title').toLowerCase())}</p></div>
          <button type="button" class="button primary" data-action="resume">${escapeHtml(t('start.resume'))}</button>
          <button type="button" class="button quiet" data-action="new-bill">${escapeHtml(t('start.newBill'))}</button>
        </div>` : ''}
        <form class="card form-card setup-card" data-action="create-bill">
          <div class="section-heading"><h2>${escapeHtml(t('start.participants'))}</h2></div>
          <label for="participant-count-value">${escapeHtml(t('start.participantCount'))}</label>
          <div class="count-stepper" aria-label="${escapeHtml(t('start.participantCount'))}">
            <button type="button" class="stepper-button count-decrease" data-action="change-count" data-direction="decrease" aria-label="${escapeHtml(t('common.delete'))}">−</button>
            <output id="participant-count-value" data-count-value="" aria-live="polite">${state.participantCount}</output>
            <button type="button" class="stepper-button count-increase" data-action="change-count" data-direction="increase" aria-label="${escapeHtml(t('common.add'))}">＋</button>
          </div>
          <input type="hidden" name="count" value="${state.participantCount}">
          <fieldset>
            <legend>${escapeHtml(t('start.namingMode'))}</legend>
            <div class="segmented-control">
              <label class="choice-chip"><input type="radio" name="namingMode" value="letters" checked> <span>${escapeHtml(t('start.letters'))}</span></label>
              <label class="choice-chip"><input type="radio" name="namingMode" value="names"> <span>${escapeHtml(t('start.names'))}</span></label>
            </div>
          </fieldset>
          <label for="participant-names">${escapeHtml(t('start.namesHelp'))}</label>
          <textarea id="participant-names" name="names" rows="4" placeholder="${escapeHtml(t('start.namesPlaceholder'))}"></textarea>
          <button class="button primary wide" type="submit">${escapeHtml(t('start.create'))}</button>
        </form>
      </section>`;
    }

    function renderExpenseEditor() {
      const editor = state.editor;
      const payerOptions = state.bill.participants.map((participant) => (
        `<label class="choice-chip"><input type="radio" name="payerId" value="${escapeHtml(participant.id)}" ${editor.payerId === participant.id ? 'checked' : ''}> <span>${escapeHtml(participant.displayName)}</span></label>`
      )).join('');
      const participantChecks = state.bill.participants.map((participant) => (
        `<label class="choice-chip"><input type="checkbox" name="participantIds" value="${escapeHtml(participant.id)}" ${editor.participantIds.includes(participant.id) ? 'checked' : ''}> <span>${escapeHtml(participant.displayName)}</span></label>`
      )).join('');
      return `<div class="overlay" role="presentation">
        <section class="modal card" role="dialog" aria-modal="true" aria-labelledby="expense-title">
          <div class="modal-heading"><h2 id="expense-title">${escapeHtml(t(editor.id ? 'expense.edit' : 'expense.new'))}</h2><button type="button" class="icon-button" data-action="close-editor" aria-label="${escapeHtml(t('common.close'))}">×</button></div>
          <form data-action="save-expense">
            <label for="expense-amount">${escapeHtml(t('expense.amount'))}</label>
            <div class="amount-field">
              <span class="amount-prefix" aria-hidden="true">$</span>
              <input class="amount-input" id="expense-amount" name="amount" type="text" inputmode="decimal" value="${escapeHtml(editor.amount)}" placeholder="${escapeHtml(t('expense.amountPlaceholder'))}" required>
            </div>
            <fieldset><legend>${escapeHtml(t('expense.payer'))}</legend><div class="choice-grid payer-options">${payerOptions}</div></fieldset>
            <fieldset><legend>${escapeHtml(t('expense.splitMode'))}</legend>
              <div class="segmented-control">
                <label class="choice-chip"><input type="radio" name="splitMode" value="all" ${editor.splitMode === 'all' ? 'checked' : ''}> <span>${escapeHtml(t('expense.all'))}</span></label>
                <label class="choice-chip"><input type="radio" name="splitMode" value="selected" ${editor.splitMode === 'selected' ? 'checked' : ''}> <span>${escapeHtml(t('expense.selected'))}</span></label>
              </div>
            </fieldset>
            <fieldset><legend>${escapeHtml(t('expense.participants'))}</legend><div class="choice-grid">${participantChecks}</div></fieldset>
            <label for="expense-note">${escapeHtml(t('expense.note'))}</label>
            <textarea id="expense-note" name="note" rows="2" placeholder="${escapeHtml(t('expense.notePlaceholder'))}">${escapeHtml(editor.note)}</textarea>
            ${renderMessages()}
            <div class="button-row"><button type="button" class="button quiet" data-action="close-editor">${escapeHtml(t('common.cancel'))}</button><button type="submit" class="button primary wide">${escapeHtml(t('expense.save'))}</button></div>
          </form>
        </section>
      </div>`;
    }

    function renderLedger() {
      const expenses = state.bill.expenses;
      const totalCents = expenses.reduce((total, expense) => total + expense.amountCents, 0);
      const names = new Map(state.bill.participants.map((participant) => [participant.id, participant.displayName]));
      const headline = state.language === 'zh'
        ? `<span>${escapeHtml(t('ledger.headlineZhTop'))}</span><span>${escapeHtml(t('ledger.headlineZhBottom'))}</span>`
        : `<span>${escapeHtml(t('ledger.headline'))}</span>`;
      const expenseRows = expenses.map((expense) => {
        const payerName = names.get(expense.payerId) || '';
        const splitLabel = expense.splitMode === 'all'
          ? t('ledger.splitAll')
          : expense.participantIds.map((id) => names.get(id) || '').join(', ');
        return `<article class="expense-row">
        <div class="expense-copy">
          <div class="expense-primary"><strong class="expense-note">${escapeHtml(expense.note || t('ledger.defaultNote'))}</strong><span class="expense-payer">${escapeHtml(t('ledger.paidByName', { name: payerName }))}</span></div>
          <span class="expense-split">${escapeHtml(splitLabel)}</span>
        </div>
        <strong class="expense-amount">${formatAmount(expense.amountCents)}</strong>
        <div class="row-actions"><button type="button" class="button quiet small" data-action="edit-expense" data-id="${escapeHtml(expense.id)}">${escapeHtml(t('common.edit'))}</button><button type="button" class="button danger small" data-action="delete-expense" data-id="${escapeHtml(expense.id)}">${escapeHtml(t('common.delete'))}</button></div>
      </article>`;
      }).join('');
      return `<section class="screen" data-screen="ledger">
        <div class="ledger-topbar"><div><p class="eyebrow">${escapeHtml(t('ledger.eyebrow', { count: state.bill.participants.length }))}</p><h1 class="ledger-headline">${headline}</h1></div><button type="button" class="button primary" data-action="open-expense">＋ ${escapeHtml(t('ledger.addExpense'))}</button></div>
        ${renderMessages()}
        <section class="total-card"><span class="total-label">${escapeHtml(t('ledger.total'))}</span><strong class="total-amount">${formatAmount(totalCents)}</strong></section>
        <div class="section-heading expense-section-heading"><h2>${escapeHtml(t('ledger.title'))}</h2><span>${escapeHtml(t('ledger.expenseCount', { count: expenses.length }))}</span></div>
        ${expenses.length ? `<div class="expense-list card">${expenseRows}</div>` : `<div class="empty-card card"><div class="empty-icon">＋</div><h2>${escapeHtml(t('ledger.empty'))}</h2><p>${escapeHtml(t('ledger.emptyHelp'))}</p><button type="button" class="button primary" data-action="open-expense">${escapeHtml(t('ledger.addExpense'))}</button></div>`}
        <div class="bottom-actions"><button type="button" class="button primary wide" data-action="view-result" ${expenses.length ? '' : 'disabled'}>${escapeHtml(t('ledger.settlement'))} →</button></div>
        ${state.editor ? renderExpenseEditor() : ''}
      </section>`;
    }

    function renderResult() {
      const result = getSettlement();
      const names = new Map(result.members.map((member) => [member.id, member.displayName]));
      const memberRows = result.members.map((member) => `<article class="member-row"><div><strong>${escapeHtml(member.displayName)}</strong><span>${escapeHtml(t('result.paid'))} ${formatAmount(member.paidCents)} · ${escapeHtml(t('result.owed'))} ${formatAmount(member.owedCents)}</span></div><strong class="net ${member.netCents >= 0 ? 'positive' : 'negative'}">${member.netCents >= 0 ? '+' : ''}${formatAmount(member.netCents)}</strong></article>`).join('');
      const transferRows = result.transfers.map((transfer) => {
        const fromName = names.get(transfer.fromId) || '';
        const toName = names.get(transfer.toId) || '';
        return `<article class="transfer-row">
          <span class="transfer-route"><span class="action-avatar">${escapeHtml(avatarCharacter(fromName))}</span><span class="transfer-copy"><strong class="transfer-names">${escapeHtml(fromName)} <b>→</b> ${escapeHtml(toName)}</strong><span class="transfer-meta">${escapeHtml(t('result.peopleSummary', { count: state.bill.participants.length }))}</span></span></span>
          <strong class="transfer-amount">${formatAmount(transfer.amountCents)}</strong>
        </article>`;
      }).join('');
      const eligibleCollectors = result.members.filter((member) => member.netCents > 0).map((member) => `<button type="button" class="collector-choice ${member.id === result.collectorId ? 'selected' : ''}" data-action="change-collector" data-id="${escapeHtml(member.id)}">${escapeHtml(member.displayName)}${member.id === result.collectorId ? ' ✓' : ''}</button>`).join('');
      const selectedCollector = result.collectorId ? result.members.find((member) => member.id === result.collectorId) : null;
      const collectorSection = selectedCollector ? `<section class="collector-card card">
          <div class="collector-hero">
            <span class="collector-avatar">${escapeHtml(avatarCharacter(selectedCollector.displayName))}</span>
            <strong class="collector-hero-name">${escapeHtml(selectedCollector.displayName)}</strong>
            <span class="collector-hero-meta">${escapeHtml(t('result.collectorHint'))} · ${escapeHtml(t('result.peopleSummary', { count: state.bill.participants.length }))}</span>
            <span class="collector-hero-total">${escapeHtml(t('result.total'))} · ${formatAmount(result.totalCents)}</span>
            <strong class="collector-hero-amount">${formatAmount(result.collectorAmountCents)}</strong>
          </div>
          <div class="collector-choices">${eligibleCollectors}</div>
        </section>` : '';
      return `<section class="screen" data-screen="result">
        <div class="result-topbar screen-heading"><div><p class="kicker">${escapeHtml(t('result.title'))}</p><h1>${formatAmount(result.totalCents)}</h1></div><div class="result-heading-actions"><button type="button" class="button quiet" data-action="finish-request">${escapeHtml(t('common.finish'))}</button></div></div>
        ${renderMessages()}
        <div class="member-list card">${memberRows}</div>
        ${collectorSection}
        <section class="card transfer-card"><div class="section-heading"><h2>${escapeHtml(t('result.transfers'))}</h2></div><div class="transfer-list">${transferRows || `<p class="empty-copy">${escapeHtml(t('result.noTransfers'))}</p>`}</div></section>
        <div class="result-actions"><button type="button" class="button primary wide" data-action="copy-summary">${escapeHtml(t('result.copySummary'))}</button>${state.copyFallbackText ? `<p class="message error">${escapeHtml(t('result.copyFailed'))}</p><textarea class="copy-fallback" aria-label="${escapeHtml(t('result.copySummary'))}" readonly>${escapeHtml(state.copyFallbackText)}</textarea>` : ''}<button type="button" class="button quiet wide" data-action="back-ledger">${escapeHtml(t('result.backToLedger'))}</button><button type="button" class="button quiet wide" data-action="finish-request">${escapeHtml(t('result.finish'))}</button></div>
      </section>`;
    }

    function renderConfirm() {
      if (!state.confirm) {
        return '';
      }
      const messageKey = state.confirm.kind === 'delete' ? 'expense.deleteConfirm' : state.confirm.kind === 'finish' ? 'result.finishConfirm' : 'result.finishConfirm';
      return `<div class="overlay" role="presentation"><section class="modal card confirm-modal" role="dialog" aria-modal="true"><h2>${escapeHtml(t('common.confirm'))}</h2><p>${escapeHtml(t(messageKey))}</p><div class="button-row"><button type="button" class="button quiet" data-action="confirm" data-confirm="no">${escapeHtml(t('common.cancel'))}</button><button type="button" class="button primary" data-action="confirm" data-confirm="yes">${escapeHtml(t('common.confirm'))}</button></div></section></div>`;
    }

    function render() {
      if (!document || typeof document.getElementById !== 'function') {
        return;
      }
      const mount = document.getElementById('app');
      if (!mount) {
        return;
      }
      const screen = state.screen === 'start' ? renderStart() : state.screen === 'ledger' ? renderLedger() : renderResult();
      mount.innerHTML = `${renderHeader()}<div id="main-content">${screen}</div>${renderConfirm()}`;
    }

    return {
      getState() {
        return clone(state);
      },
      t,
      setLanguage,
      createBill,
      navigate,
      addExpense,
      editExpense,
      deleteExpense,
      getSettlement,
      formatAmount,
      changeCollector,
      setClipboard,
      copySummary,
      finish,
      handleClick,
      handleSubmit,
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
          root.document.addEventListener('click', root.mealSplitApp.handleClick);
          root.document.addEventListener('submit', root.mealSplitApp.handleSubmit);
          root.mealSplitApp.render();
        });
      }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
