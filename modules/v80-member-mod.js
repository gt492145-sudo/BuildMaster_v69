// Member level and member-code management module (v8.0).
(function attachV80MemberModule(global) {
  function normalizeUserLevel(rawLevel) {
    const raw = String(rawLevel || '').trim().toLowerCase();
    if (raw === '1' || raw === 'basic' || raw.includes('頁1') || raw.includes('會員1')) return 'basic';
    if (raw === '2' || raw === 'standard' || raw.includes('頁2') || raw.includes('會員2')) return 'standard';
    if (raw === '3' || raw === 'pro' || raw.includes('頁3') || raw.includes('會員3')) return 'pro';
    return 'basic';
  }

  function getUserLevelLabel(level) {
    if (level === 'standard') return '會員2（工程）';
    if (level === 'pro') return '會員3（專家）';
    return '會員1（基礎）';
  }

  function getCurrentUserLevel() {
    return normalizeUserLevel(safeStorage.get(localStorage, USER_LEVEL_KEY, 'basic'));
  }

  function setUserLevel(level) {
    const normalized = normalizeUserLevel(level);
    safeStorage.set(localStorage, USER_LEVEL_KEY, normalized);
    applyUserLevel();
    showToast(`已切換：${getUserLevelLabel(normalized)}`);
  }

  function applyUserLevel() {
    const normalized = getCurrentUserLevel();
    safeStorage.set(localStorage, USER_LEVEL_KEY, normalized);
    document.body.setAttribute('data-user-level', normalized);
    const mapping = [
      ['levelBasicBtn', normalized === 'basic'],
      ['levelStandardBtn', normalized === 'standard'],
      ['levelProBtn', normalized === 'pro']
    ];
    mapping.forEach(([id, active]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('active', !!active);
    });
    applyAiCoachMode();
  }

  function normalizeMemberAccount(account) {
    return String(account || '').trim().toLowerCase();
  }

  function loadMemberCodes() {
    try {
      const parsed = JSON.parse(localStorage.getItem(MEMBER_CODES_STORAGE_KEY) || '{}');
      memberCodeMap = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_e) {
      memberCodeMap = {};
    }
  }

  function persistMemberCodes() {
    localStorage.setItem(MEMBER_CODES_STORAGE_KEY, JSON.stringify(memberCodeMap));
  }

  function initMemberManager() {
    loadMemberCodes();
    renderMemberCodeTable();
  }

  function renderMemberCodeTable() {
    const body = document.getElementById('memberCodeBody');
    if (!body) return;
    body.innerHTML = '';
    const accounts = Object.keys(memberCodeMap).sort();
    if (!accounts.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="2" style="color:#99b2c9;">尚無會員帳號</td>';
      body.appendChild(tr);
      return;
    }
    accounts.forEach(acc => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHTML(acc)}</td><td><button class="tool-btn" style="padding:4px 8px;" onclick="deleteMemberCode('${escapeHTML(acc)}')">刪除</button></td>`;
      body.appendChild(tr);
    });
  }

  async function saveMemberCode() {
    const accInput = document.getElementById('memberAccountInput');
    const pwdInput = document.getElementById('memberPasswordInput');
    const account = normalizeMemberAccount(accInput && accInput.value);
    const password = String((pwdInput && pwdInput.value) || '').trim();
    if (!account) return showToast('請輸入會員帳號');
    if (!/^[a-z0-9_.-]{3,30}$/.test(account)) return showToast('會員帳號格式：3-30碼，可用英文/數字/._-');
    if (password.length < 6) return showToast('會員密碼至少 6 碼');
    const hashed = await hashTextSHA256(password);
    memberCodeMap[account] = hashed;
    persistMemberCodes();
    renderMemberCodeTable();
    if (accInput) accInput.value = account;
    if (pwdInput) pwdInput.value = '';
    addAuditLog('會員密碼更新', account);
    showToast(`會員「${account}」密碼已更新`);
  }

  function deleteMemberCodeFromInput() {
    const accInput = document.getElementById('memberAccountInput');
    const account = normalizeMemberAccount(accInput && accInput.value);
    if (!account) return showToast('請先輸入要刪除的會員帳號');
    deleteMemberCode(account);
  }

  function deleteMemberCode(account) {
    const acc = normalizeMemberAccount(account);
    if (!acc) return showToast('會員帳號不可為空');
    if (!memberCodeMap[acc]) return showToast('找不到此會員帳號');
    if (!confirm(`確定刪除會員「${acc}」？`)) return;
    delete memberCodeMap[acc];
    persistMemberCodes();
    renderMemberCodeTable();
    addAuditLog('會員刪除', acc);
    showToast(`已刪除會員「${acc}」`);
  }

  global.normalizeUserLevel = normalizeUserLevel;
  global.getUserLevelLabel = getUserLevelLabel;
  global.getCurrentUserLevel = getCurrentUserLevel;
  global.setUserLevel = setUserLevel;
  global.applyUserLevel = applyUserLevel;
  global.normalizeMemberAccount = normalizeMemberAccount;
  global.loadMemberCodes = loadMemberCodes;
  global.persistMemberCodes = persistMemberCodes;
  global.initMemberManager = initMemberManager;
  global.renderMemberCodeTable = renderMemberCodeTable;
  global.saveMemberCode = saveMemberCode;
  global.deleteMemberCodeFromInput = deleteMemberCodeFromInput;
  global.deleteMemberCode = deleteMemberCode;
})(window);
