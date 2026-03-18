// Auth/member gate module extracted from index.html (v8.0).
(function attachV80AuthModule(global) {
  function hasOwnerPassword() {
    return !!safeStorage.get(localStorage, OWNER_LOCK_HASH_KEY, '');
  }

  function currentMemberAccount() {
    return normalizeMemberAccount(sessionStorage.getItem('bm_69:member') || '');
  }

  function isMemberSession() {
    return !!currentMemberAccount();
  }

  function isOwnerUnlocked() {
    if (!hasOwnerPassword()) return true;
    return sessionStorage.getItem(OWNER_UNLOCK_SESSION_KEY) === '1';
  }

  function updateMonkeyControlsVisibility() {
    const mobileMonkeyBtn = document.getElementById('mobileMonkeyBtn');
    if (!mobileMonkeyBtn) return;
    const visible = !isMemberSession() && hasOwnerPassword() && isOwnerUnlocked();
    mobileMonkeyBtn.style.display = visible ? '' : 'none';
  }

  function updateOwnerLockButton() {
    const btn = document.getElementById('mobileOwnerLockBtn');
    if (!btn) {
      updateMonkeyControlsVisibility();
      return;
    }
    if (isMemberSession()) {
      const span = btn.querySelector('span');
      const text = '🚫 猴子權限：會員不可用';
      if (span) span.textContent = text;
      else btn.textContent = text;
      updateMonkeyControlsVisibility();
      return;
    }
    let text = '🐒 猴子權限：未設定';
    if (hasOwnerPassword()) {
      text = isOwnerUnlocked() ? '🐒 猴子權限：已解鎖' : '🐒 猴子權限：已上鎖';
    }
    const span = btn.querySelector('span');
    if (span) span.textContent = text;
    else btn.textContent = text;
    updateMonkeyControlsVisibility();
  }

  async function setupOwnerPassword() {
    if (isMemberSession()) {
      showToast('此功能僅限擁有者，會員不可使用');
      return false;
    }
    const pass1 = prompt('設定管理密碼（至少 4 碼）');
    if (pass1 === null) return false;
    const password = String(pass1).trim();
    if (password.length < 4) {
      showToast('管理密碼至少 4 碼');
      return false;
    }
    const pass2 = prompt('再次輸入管理密碼');
    if (pass2 === null) return false;
    if (password !== String(pass2).trim()) {
      showToast('兩次密碼不一致');
      return false;
    }
    const hashed = await hashTextSHA256(password);
    safeStorage.set(localStorage, OWNER_LOCK_HASH_KEY, hashed);
    sessionStorage.setItem(OWNER_UNLOCK_SESSION_KEY, '1');
    updateOwnerLockButton();
    showToast('管理密碼已設定並解鎖');
    return true;
  }

  async function unlockOwnerPassword() {
    if (isMemberSession()) {
      showToast('此功能僅限擁有者，會員不可使用');
      return false;
    }
    if (!hasOwnerPassword()) return setupOwnerPassword();
    const input = prompt('輸入管理密碼');
    if (input === null) return false;
    const hashed = await hashTextSHA256(String(input).trim());
    const saved = safeStorage.get(localStorage, OWNER_LOCK_HASH_KEY, '');
    if (hashed !== saved) {
      showToast('管理密碼錯誤');
      return false;
    }
    sessionStorage.setItem(OWNER_UNLOCK_SESSION_KEY, '1');
    updateOwnerLockButton();
    showToast('猴子權限已解鎖');
    return true;
  }

  async function changeOwnerPassword() {
    if (isMemberSession()) {
      showToast('此功能僅限擁有者，會員不可使用');
      return false;
    }
    if (!hasOwnerPassword()) {
      showToast('請先設定猴子密碼');
      return false;
    }
    const oldPass = prompt('輸入舊猴子密碼');
    if (oldPass === null) return false;
    const saved = safeStorage.get(localStorage, OWNER_LOCK_HASH_KEY, '');
    const oldHash = await hashTextSHA256(String(oldPass).trim());
    if (oldHash !== saved) {
      showToast('舊密碼錯誤');
      return false;
    }
    const newPass1 = prompt('輸入新猴子密碼（至少 4 碼）');
    if (newPass1 === null) return false;
    const newPassword = String(newPass1).trim();
    if (newPassword.length < 4) {
      showToast('新密碼至少 4 碼');
      return false;
    }
    const newPass2 = prompt('再次輸入新猴子密碼');
    if (newPass2 === null) return false;
    if (newPassword !== String(newPass2).trim()) {
      showToast('兩次新密碼不一致');
      return false;
    }
    const nextHash = await hashTextSHA256(newPassword);
    safeStorage.set(localStorage, OWNER_LOCK_HASH_KEY, nextHash);
    sessionStorage.setItem(OWNER_UNLOCK_SESSION_KEY, '1');
    updateOwnerLockButton();
    showToast('猴子密碼已更新');
    return true;
  }

  async function ensureOwnerUnlocked(reason) {
    if (isMemberSession()) {
      showToast('此功能僅限擁有者，會員不可使用');
      return false;
    }
    if (isOwnerUnlocked()) return true;
    showToast(`此功能需管理密碼：${reason || '受保護功能'}`);
    return unlockOwnerPassword();
  }

  function lockOwnerAccess() {
    sessionStorage.removeItem(OWNER_UNLOCK_SESSION_KEY);
    updateOwnerLockButton();
    showToast('猴子權限已上鎖');
  }

  async function handleOwnerLockAction() {
    if (isMemberSession()) {
      showToast('此功能僅限擁有者，會員不可使用');
      return;
    }
    if (!hasOwnerPassword()) {
      await setupOwnerPassword();
      return;
    }
    if (isOwnerUnlocked()) {
      lockOwnerAccess();
      return;
    }
    await unlockOwnerPassword();
  }

  function showSecurityLock(message) {
    const lock = document.getElementById('securityLock');
    const msg = document.getElementById('securityMessage');
    if (msg) msg.innerText = message || '請輸入存取碼以啟用系統。';
    if (lock) lock.classList.add('show');
    const input = document.getElementById('securityCodeInput');
    if (input) setTimeout(() => input.focus(), 80);
  }

  function hideSecurityLock() {
    const lock = document.getElementById('securityLock');
    if (lock) lock.classList.remove('show');
  }

  function setupSecurityWatermark() {
    const wm = document.getElementById('securityWatermark');
    if (!wm) return;
    const stamp = new Date().toLocaleString('zh-TW');
    wm.innerText = `Construction Master Secure | ${location.hostname} | ${stamp}`;
  }

  function bindClientDeterrence() {
    if (isDevHost()) return;
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', e => {
      const key = String(e.key || '').toLowerCase();
      const blocked =
        key === 'f12' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
        (e.metaKey && e.altKey && ['i', 'j', 'c'].includes(key)) ||
        (e.ctrlKey && key === 'u') ||
        (e.metaKey && key === 'u') ||
        (e.ctrlKey && key === 's') ||
        (e.metaKey && key === 's');
      if (blocked) {
        e.preventDefault();
        showToast('此快捷鍵已受保護模式限制');
      }
    });
  }

  async function bootstrapSecurity() {
    setupSecurityWatermark();
    bindClientDeterrence();

    if (window.top !== window.self) {
      showSecurityLock('偵測到外部框架嵌入，已阻擋顯示。');
      return false;
    }

    const hostAllowed =
      SECURITY_CONFIG.allowedHosts.includes(location.hostname) ||
      location.hostname.endsWith('.netlify.app') ||
      location.hostname.endsWith('.github.io');
    if (!hostAllowed) {
      showSecurityLock(`未授權網域：${location.hostname}`);
      return false;
    }

    if (!SECURITY_PASSWORD_ENABLED) {
      sessionStorage.setItem(SECURITY_UNLOCK_KEY, '1');
      hideSecurityLock();
      return true;
    }

    const unlocked = sessionStorage.getItem(SECURITY_UNLOCK_KEY) === '1';
    if (unlocked || isDevHost()) {
      hideSecurityLock();
      return true;
    }

    showSecurityLock('請輸入存取碼以啟用系統。');
    const input = document.getElementById('securityCodeInput');
    const memberInput = document.getElementById('securityMemberInput');
    if (input) {
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') submitSecurityCode();
      }, { once: true });
    }
    if (memberInput) {
      memberInput.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') submitSecurityCode();
      }, { once: true });
    }
    return false;
  }

  async function submitSecurityCode() {
    loadMemberCodes();
    const memberInput = document.getElementById('securityMemberInput');
    const input = document.getElementById('securityCodeInput');
    const hint = document.getElementById('securityHint');
    const account = normalizeMemberAccount((memberInput && memberInput.value) || '');
    const code = String((input && input.value) || '').trim();
    if (!code) {
      if (hint) hint.innerText = '請先輸入存取碼';
      return;
    }
    const hashed = await hashTextSHA256(code);
    const memberHash = account ? memberCodeMap[account] : '';
    const isMemberLogin = !!memberHash;
    const ok = isMemberLogin ? (hashed === memberHash) : (hashed === SECURITY_CONFIG.accessHash);
    if (!ok) {
      if (hint) hint.innerText = '存取碼錯誤，請重試';
      if (input) input.value = '';
      return;
    }
    sessionStorage.setItem(SECURITY_UNLOCK_KEY, '1');
    if (account) sessionStorage.setItem('bm_69:member', account);
    if (isMemberLogin) {
      localStorage.setItem(USER_LEVEL_KEY, 'pro');
      document.body.setAttribute('data-user-level', 'pro');
    }
    hideSecurityLock();
    if (hint) hint.innerText = '';
    if (memberInput) memberInput.value = '';
    if (input) input.value = '';
    await startApp();
    showToast(isMemberLogin ? `會員「${account}」驗證成功` : '保護模式驗證成功');
  }

  global.hasOwnerPassword = hasOwnerPassword;
  global.currentMemberAccount = currentMemberAccount;
  global.isMemberSession = isMemberSession;
  global.isOwnerUnlocked = isOwnerUnlocked;
  global.updateMonkeyControlsVisibility = updateMonkeyControlsVisibility;
  global.updateOwnerLockButton = updateOwnerLockButton;
  global.setupOwnerPassword = setupOwnerPassword;
  global.unlockOwnerPassword = unlockOwnerPassword;
  global.changeOwnerPassword = changeOwnerPassword;
  global.ensureOwnerUnlocked = ensureOwnerUnlocked;
  global.lockOwnerAccess = lockOwnerAccess;
  global.handleOwnerLockAction = handleOwnerLockAction;
  global.showSecurityLock = showSecurityLock;
  global.hideSecurityLock = hideSecurityLock;
  global.setupSecurityWatermark = setupSecurityWatermark;
  global.bindClientDeterrence = bindClientDeterrence;
  global.bootstrapSecurity = bootstrapSecurity;
  global.submitSecurityCode = submitSecurityCode;
})(window);
