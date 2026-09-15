(() => {
  'use strict';

  const BANK_EDITABLE_STATUSES = new Set(['USDT Confirmed', 'INR Processing']);
  const state = {
    orderId: null,
    draft: new Map(),
    dirty: false,
    saving: false
  };

  const inr = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const snapshot = () => typeof window.__digiStateSnapshot === 'function' ? window.__digiStateSnapshot() : {};
  const bankOrders = () => (snapshot().orders || [])
    .filter(order => String(order.payoutType || '').toUpperCase() === 'BANK')
    .sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const activeBankOrder = () => bankOrders().find(order =>
    ['Awaiting Deposit','Detected','Confirming','USDT Confirmed','INR Processing','Late Review'].includes(order.status)
  ) || null;

  function methodMap() {
    return new Map((snapshot().methods || []).map(method => [method.id, method]));
  }

  function paidByMethod(order) {
    const paid = new Map();
    for (const ref of order?.payout?.references || []) {
      paid.set(ref.payoutMethodId, (paid.get(ref.payoutMethodId) || 0) + Number(ref.inrAmount || 0));
    }
    return paid;
  }

  function syncDraft(order, force = false) {
    if (!order) {
      state.orderId = null;
      state.draft.clear();
      state.dirty = false;
      return;
    }
    if (force || state.orderId !== order.id || !state.dirty) {
      state.orderId = order.id;
      state.draft = new Map((order.allocations || []).map(item => [item.payoutMethodId, Number(item.inrAmount || 0)]));
      for (const [methodId, paid] of paidByMethod(order)) {
        if (Number(state.draft.get(methodId) || 0) < paid) state.draft.set(methodId, paid);
      }
      state.dirty = false;
    }
  }

  function currentPlan(order, methodId) {
    return Number((order.allocations || []).find(item => item.payoutMethodId === methodId)?.inrAmount || 0);
  }

  function methodMax(order, method, methodId) {
    const paid = paidByMethod(order).get(methodId) || 0;
    const current = currentPlan(order, methodId);
    if (!method) return Math.max(paid, current);
    if (!method.enabled) return Math.max(paid, current);
    const remaining = Number.isFinite(Number(method.remainingDailyInr))
      ? Math.max(0, Number(method.remainingDailyInr))
      : Math.max(0, Number(method.dailyLimitInr || 0));
    return Math.max(paid, current + remaining);
  }

  function draftState(order) {
    syncDraft(order);
    const total = Number(order?.inrAmount || 0);
    const paid = paidByMethod(order);
    const methods = methodMap();
    let allocated = 0;
    let error = '';

    for (const [methodId, paidAmount] of paid) {
      const planned = Number(state.draft.get(methodId) || 0);
      if (planned < paidAmount) error = `Allocation cannot be below already paid ${inr(paidAmount)}`;
    }

    for (const [methodId, amountRaw] of state.draft) {
      const amount = Number(amountRaw || 0);
      if (amount <= 0) continue;
      const method = methods.get(methodId);
      const floor = paid.get(methodId) || 0;
      const max = methodMax(order, method, methodId);
      if (amount < floor) error = `Allocation cannot be below already paid ${inr(floor)}`;
      if (amount > max) error = `${method?.bankName || method?.label || 'Bank'} exceeds available capacity`;
      allocated += amount;
    }

    if (allocated > total) error = 'Allocated INR cannot exceed the trade total';
    return { total, allocated, pending: Math.max(0, total - allocated), paid, error };
  }

  function enhanceMissingRows(order) {
    const list = document.querySelector('.digi-v6-plan-list');
    if (!list || !order || !BANK_EDITABLE_STATUSES.has(order.status)) return;
    const methods = methodMap();
    const paid = paidByMethod(order);

    const needed = new Set([
      ...(order.allocations || []).map(item => item.payoutMethodId),
      ...paid.keys()
    ]);

    for (const methodId of needed) {
      if (list.querySelector(`[data-bank-plan="${CSS.escape(methodId)}"]`)) continue;
      const method = methods.get(methodId);
      const floor = paid.get(methodId) || 0;
      const current = Math.max(floor, Number(state.draft.get(methodId) || currentPlan(order, methodId) || 0));
      state.draft.set(methodId, current);
      const max = methodMax(order, method, methodId);

      const label = document.createElement('label');
      label.className = 'digi-v6-plan-row';
      label.dataset.hotfixBankRow = methodId;
      const bankName = method?.bankName || method?.label || 'Bank';
      const last4 = String(method?.accountNumber || '').slice(-4);
      label.innerHTML = `
        <div class="digi-v6-plan-copy">
          <b>${escapeHtml(bankName)}${last4 ? ` ••••${escapeHtml(last4)}` : ''}</b>
          <small>${method?.enabled === false ? 'Disabled · ' : ''}${floor ? `Paid ${inr(floor)} · ` : ''}Max ${inr(max)}</small>
        </div>
        <div class="digi-v6-plan-input">
          <span>₹</span>
          <input type="number" inputmode="decimal" min="${floor}" max="${max}" step="0.01" value="${current || ''}" data-bank-plan="${escapeHtml(methodId)}" placeholder="0">
        </div>`;
      list.appendChild(label);
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
    }[ch]));
  }

  function setTextIfChanged(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function refreshSummary(order) {
    const plan = document.querySelector('.digi-v6-bank-plan');
    if (!plan || !order) return;
    const ds = draftState(order);
    const boxes = plan.querySelectorAll('.digi-v6-plan-summary > div b');
    setTextIfChanged(boxes[0], inr(ds.total));
    setTextIfChanged(boxes[1], inr(ds.allocated));
    setTextIfChanged(boxes[2], inr(ds.pending));
    const note = plan.querySelector('.digi-v6-plan-footer small');
    setTextIfChanged(note, ds.error || 'Enter any amount per bank. The remaining INR can stay pending.');
    const save = plan.querySelector('#digiV6SaveBankPlan');
    if (save) {
      save.disabled = !!ds.error || state.saving;
      if (!state.saving) setTextIfChanged(save, 'Save');
    }
  }

  function normalizeInput(input, order) {
    syncDraft(order);
    const methodId = input.dataset.bankPlan;
    const method = methodMap().get(methodId);
    const paid = paidByMethod(order).get(methodId) || 0;
    const max = methodMax(order, method, methodId);
    let value = Number(input.value || 0);

    if (!Number.isFinite(value) || value < 0) value = 0;
    if (value === 0 && paid > 0) value = paid;
    if (value > 0) value = Math.max(paid, value);
    value = Math.min(value, max);

    const other = [...state.draft.entries()]
      .filter(([id]) => id !== methodId)
      .reduce((sum,[,amount]) => sum + Math.max(0, Number(amount || 0)), 0);
    const orderRemaining = Math.max(paid, Number(order.inrAmount || 0) - other);
    value = Math.min(value, orderRemaining);
    value = Math.round(value * 100) / 100;

    if (value > 0) state.draft.set(methodId, value);
    else state.draft.delete(methodId);

    state.dirty = true;
    if (value !== Number(input.value || 0) || (value === paid && !input.value)) input.value = value || '';
    refreshSummary(order);
  }

  async function saveDraft(order) {
    if (!order || !BANK_EDITABLE_STATUSES.has(order.status) || state.saving) return;
    const ds = draftState(order);
    if (ds.error) {
      window.toastMsg?.(ds.error, true);
      return;
    }

    for (const [methodId, paid] of ds.paid) {
      if (Number(state.draft.get(methodId) || 0) < paid) state.draft.set(methodId, paid);
    }

    const allocations = [...state.draft.entries()]
      .filter(([,amount]) => Number(amount) > 0)
      .map(([payoutMethodId,inrAmount]) => ({ payoutMethodId, inrAmount:Number(inrAmount) }));

    const button = document.querySelector('#digiV6SaveBankPlan');
    state.saving = true;
    if (button) { button.disabled = true; button.textContent = 'Saving...'; }

    try {
      const updated = await window.__digiSaveBankAllocations?.(order.id, allocations);
      if (!updated) throw new Error('Bank distribution service is unavailable');
      state.orderId = updated.id;
      state.draft = new Map((updated.allocations || []).map(item => [item.payoutMethodId, Number(item.inrAmount || 0)]));
      for (const [methodId, paid] of paidByMethod(updated)) {
        if (Number(state.draft.get(methodId) || 0) < paid) state.draft.set(methodId, paid);
      }
      state.dirty = false;
      window.toastMsg?.('Bank distribution saved');
      window.__digiLayoutV6?.renderDeposit?.('BANK');
    } catch (error) {
      window.toastMsg?.(error.message || 'Could not save distribution', true);
    } finally {
      state.saving = false;
      const fresh = activeBankOrder();
      if (fresh) {
        syncDraft(fresh, !state.dirty);
        enhanceMissingRows(fresh);
        refreshSummary(fresh);
      }
    }
  }

  document.addEventListener('input', event => {
    const input = event.target?.closest?.('[data-bank-plan]');
    if (!input) return;
    const order = activeBankOrder();
    if (!order || !BANK_EDITABLE_STATUSES.has(order.status)) return;
    event.stopImmediatePropagation();
    normalizeInput(input, order);
  }, true);

  document.addEventListener('click', event => {
    const save = event.target?.closest?.('#digiV6SaveBankPlan');
    if (!save) return;
    const order = activeBankOrder();
    if (!order || !BANK_EDITABLE_STATUSES.has(order.status)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    saveDraft(order);
  }, true);

  window.addEventListener('digirupee:state', event => {
    const editing = state.dirty && document.activeElement?.matches?.('[data-bank-plan]');
    if (editing) event.stopImmediatePropagation();
  }, true);

  function enhance() {
    const order = activeBankOrder();
    if (!order || !BANK_EDITABLE_STATUSES.has(order.status)) return;
    if (state.orderId !== order.id) syncDraft(order, true);
    enhanceMissingRows(order);
    refreshSummary(order);
  }

  const observer = new MutationObserver(() => enhance());
  const start = () => {
    const root = document.getElementById('digiTradeRoot') || document.body;
    observer.observe(root, { childList:true, subtree:true });
    enhance();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  window.__digiV6BankFix = { enhance, draftState };
})();