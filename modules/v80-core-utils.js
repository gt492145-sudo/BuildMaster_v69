// Shared runtime utilities extracted from index.html (v8.0).
(function attachV80CoreUtils(global) {
  function triggerFileDownload(content, filename, mimeType) {
    const safeMime = mimeType || 'application/octet-stream';
    const blob = new Blob([content], { type: safeMime });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = filename;
    link.click();
    // Release object URL after click to reduce memory retention.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  function getCurrentProjectName() {
    const field = document.getElementById('project_name');
    return (field && field.value) || '未命名專案';
  }

  function buildKeyValueCsv(rows) {
    let csv = '\uFEFF項目,數值\n';
    rows.forEach(([k, v]) => {
      const key = typeof sanitizeCSVField === 'function' ? sanitizeCSVField(k) : String(k ?? '');
      const value = typeof sanitizeCSVField === 'function' ? sanitizeCSVField(v) : String(v ?? '');
      csv += `${key},${value}\n`;
    });
    return csv;
  }

  global.triggerFileDownload = triggerFileDownload;
  global.getCurrentProjectName = getCurrentProjectName;
  global.buildKeyValueCsv = buildKeyValueCsv;
})(window);
