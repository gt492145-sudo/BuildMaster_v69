// IBM key field helper module (v8.0).
(function attachV80IbmKeyModule(global) {
  function initQuantumTokenField() {
    const input = document.getElementById('ibmQuantumKey');
    if (!input) return;
    const saved = safeStorage.get(localStorage, IBM_QUANTUM_KEY_STORAGE, '');
    if (saved && !input.value) input.value = saved;
    input.addEventListener('input', () => {
      safeStorage.set(localStorage, IBM_QUANTUM_KEY_STORAGE, input.value.trim());
    });
  }

  function toggleIBMQuantumKeyVisibility() {
    const input = document.getElementById('ibmQuantumKey');
    const btn = document.getElementById('ibmQuantumKeyToggleBtn');
    if (!input || !btn) return;
    const revealing = input.type === 'password';
    input.type = revealing ? 'text' : 'password';
    btn.textContent = revealing ? '🙈 隱藏' : '👁️ 顯示';
  }

  function clearIBMQuantumKey() {
    const input = document.getElementById('ibmQuantumKey');
    if (input) input.value = '';
    safeStorage.remove(localStorage, IBM_QUANTUM_KEY_STORAGE);
    showToast('已清除 IBM Cloud 金鑰');
  }

  global.initQuantumTokenField = initQuantumTokenField;
  global.toggleIBMQuantumKeyVisibility = toggleIBMQuantumKeyVisibility;
  global.clearIBMQuantumKey = clearIBMQuantumKey;
})(window);
