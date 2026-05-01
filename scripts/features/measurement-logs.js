    let measurementLogsHiddenLocally = false;

    function loadMeasurementLogs() {
        if (workspaceHydratedFromBackend) {
            measurementLogs = Array.isArray(measurementLogs) ? measurementLogs : [];
            return;
        }
        try {
            const saved = readJsonStorage(localStorage, MEASUREMENT_LOG_STORAGE_KEY, []);
            measurementLogs = Array.isArray(saved) ? saved : [];
        } catch (_e) {
            measurementLogs = [];
        }
    }

    function persistMeasurementLogs() {
        queueWorkspacePersist('measurementLogs', measurementLogs.slice(0, 200));
    }

    function getCalcTypeLabel() {
        const select = document.getElementById('calcType');
        if (!select || !select.options || select.selectedIndex < 0) return '';
        return String(select.options[select.selectedIndex].text || '').trim();
    }

    function recordMeasurementLog(entry) {
        measurementLogsHiddenLocally = false;
        const row = {
            ts: new Date().toISOString(),
            project: String((document.getElementById('project_name') && document.getElementById('project_name').value) || '').trim() || '未命名專案',
            floor: String((document.getElementById('floor_tag') && document.getElementById('floor_tag').value) || '').trim() || '未分層',
            calcType: String(document.getElementById('calcType') ? document.getElementById('calcType').value : ''),
            calcLabel: getCalcTypeLabel(),
            mode: String(entry && entry.mode ? entry.mode : '').trim(),
            modeLabel: String(entry && entry.modeLabel ? entry.modeLabel : '').trim(),
            targetField: String(entry && entry.targetField ? entry.targetField : '').trim(),
            targetLabel: String(entry && entry.targetLabel ? entry.targetLabel : '').trim(),
            valueM: Number.isFinite(Number(entry && entry.valueM)) ? Number(entry.valueM) : null,
            actualLenM: Number.isFinite(Number(entry && entry.actualLenM)) ? Number(entry.actualLenM) : null,
            scalePixelsPerUnit: Number.isFinite(Number(entry && entry.scalePixelsPerUnit)) ? Number(entry.scalePixelsPerUnit) : null,
            distancePx: Number.isFinite(Number(entry && entry.distancePx)) ? Number(entry.distancePx) : null,
            componentType: String(entry && entry.componentType ? entry.componentType : '').trim(),
            smart: !!(entry && entry.smart),
            snapped: !!(entry && entry.snapped),
            manualAdjust: !!(entry && entry.manualAdjust),
            dragAdjustCount: Number(entry && entry.dragAdjustCount) || 0,
            nudgeAdjustCount: Number(entry && entry.nudgeAdjustCount) || 0,
            qualityScore: Number(entry && entry.qualityScore) || 0,
            fallbackUsed: !!(entry && entry.fallbackUsed),
            precisionMode: String(entry && entry.precisionMode ? entry.precisionMode : '').trim(),
            overallConfidence: Number.isFinite(Number(entry && entry.overallConfidence)) ? Number(entry.overallConfidence) : null,
            fieldConfidence: safeCloneJson(entry && entry.fieldConfidence ? entry.fieldConfidence : {}, {}),
            fieldConfidenceSummary: String(entry && entry.fieldConfidenceSummary ? entry.fieldConfidenceSummary : '').trim(),
            reviewFields: Array.isArray(entry && entry.reviewFields) ? entry.reviewFields.map(item => String(item || '').trim()).filter(Boolean) : [],
            valueSet: safeCloneJson(entry && entry.valueSet ? entry.valueSet : null, null),
            needsReview: !!(entry && entry.needsReview),
            summary: String(entry && entry.summary ? entry.summary : '').trim(),
            p1: entry && entry.p1 ? { x: Number(entry.p1.x) || 0, y: Number(entry.p1.y) || 0 } : null,
            p2: entry && entry.p2 ? { x: Number(entry.p2.x) || 0, y: Number(entry.p2.y) || 0 } : null
        };
        measurementLogs.unshift(row);
        measurementLogs = measurementLogs.slice(0, 200);
        persistMeasurementLogs();
        renderMeasurementLogTable();
    }

    function getMeasurementLogResultText(log) {
        if (!log) return '-';
        if (log.mode === 'calibration' || log.mode === 'smart-calibration') {
            return `比例 ${log.actualLenM !== null ? `${log.actualLenM.toFixed(2)}m` : '-'}`;
        }
        if (log.mode === 'auto-interpret' || log.mode === 'guided-auto-interpret') {
            const qtyText = log.valueSet && String(log.valueSet.qty || '').trim()
                ? `數量 ${log.valueSet.qty}`
                : '';
            const confidenceText = Number.isFinite(Number(log.overallConfidence))
                ? `信心 ${Math.round(Number(log.overallConfidence) * 100)}%`
                : (Number(log.qualityScore) > 0 ? `信心 ${Number(log.qualityScore)}%` : '');
            return [qtyText, confidenceText].filter(Boolean).join(' / ') || '-';
        }
        return `${log.valueM !== null ? `${log.valueM.toFixed(2)}m` : '-'}`;
    }

    function renderMeasurementLogTable() {
        const body = document.getElementById('measurementLogBody');
        if (!body) return;
        const modeFilterEl = document.getElementById('measurementLogModeFilter');
        const dateFilterEl = document.getElementById('measurementLogDateFilter');
        const keywordFilterEl = document.getElementById('measurementLogKeywordFilter');
        const modeFilter = String(modeFilterEl && modeFilterEl.value ? modeFilterEl.value : 'all');
        const dateFilter = String(dateFilterEl && dateFilterEl.value ? dateFilterEl.value : '').trim();
        const keyword = String(keywordFilterEl && keywordFilterEl.value ? keywordFilterEl.value : '').trim().toLowerCase();
        body.innerHTML = '';
        if (measurementLogsHiddenLocally) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="6" style="color:#99b2c9;">本機畫面已清空，記憶紀錄仍保留；重新整理頁面後可再顯示。</td>';
            body.appendChild(tr);
            return;
        }
        if (!measurementLogs.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="6" style="color:#99b2c9;">尚無測量紀錄</td>';
            body.appendChild(tr);
            return;
        }
        const filteredLogs = measurementLogs
            .map((log, index) => ({ log, index }))
            .filter(({ log }) => {
                if (modeFilter !== 'all' && log.mode !== modeFilter) return false;
                if (dateFilter) {
                    const localDate = new Date(log.ts);
                    const yyyy = localDate.getFullYear();
                    const mm = String(localDate.getMonth() + 1).padStart(2, '0');
                    const dd = String(localDate.getDate()).padStart(2, '0');
                    if (`${yyyy}-${mm}-${dd}` !== dateFilter) return false;
                }
                if (keyword) {
                    const haystack = [
                        log.project,
                        log.floor,
                        log.calcLabel,
                        log.targetLabel,
                        log.summary,
                        log.modeLabel,
                        log.fieldConfidenceSummary,
                        log.precisionMode
                    ].join(' ').toLowerCase();
                    if (!haystack.includes(keyword)) return false;
                }
                return true;
            })
            .slice(0, 60);
        if (!filteredLogs.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="6" style="color:#99b2c9;">查無符合條件的測量紀錄</td>';
            body.appendChild(tr);
            return;
        }
        filteredLogs.forEach(({ log, index }) => {
            const tr = document.createElement('tr');
            const dt = new Date(log.ts);
            const resultText = getMeasurementLogResultText(log);
            const tags = [];
            if (log.smart) tags.push('智慧');
            if (log.snapped) tags.push('吸附');
            if (log.manualAdjust) tags.push('修正');
            if (log.fallbackUsed) tags.push('回退');
            if (log.needsReview) tags.push('待複核');
            tr.innerHTML = `
                <td>${dt.toLocaleString('zh-TW')}</td>
                <td>${log.modeLabel || log.mode || '-'}</td>
                <td>${log.targetLabel || log.calcLabel || '-'}</td>
                <td>${resultText}</td>
                <td>${[log.summary, log.fieldConfidenceSummary, log.reviewFields && log.reviewFields.length ? `待補 ${log.reviewFields.join('、')}` : '', tags.join(' / ')].filter(Boolean).join('｜') || '-'}</td>
                <td><button class="tool-btn" style="padding:4px 8px; width:auto;" onclick="applyMeasurementLogEntry(${index})">回填</button></td>
            `;
            body.appendChild(tr);
        });
    }

    function resetMeasurementLogFilters() {
        const modeEl = document.getElementById('measurementLogModeFilter');
        const dateEl = document.getElementById('measurementLogDateFilter');
        const keywordEl = document.getElementById('measurementLogKeywordFilter');
        if (modeEl) modeEl.value = 'all';
        if (dateEl) dateEl.value = '';
        if (keywordEl) keywordEl.value = '';
        renderMeasurementLogTable();
    }

    function applyMeasurementLogEntry(index) {
        const log = measurementLogs[index];
        if (!log) return showToast('找不到這筆測量紀錄');
        if (document.getElementById('project_name')) document.getElementById('project_name').value = log.project || '';
        if (document.getElementById('floor_tag')) document.getElementById('floor_tag').value = log.floor || '';
        const calcTypeEl = document.getElementById('calcType');
        if (calcTypeEl && log.calcType) {
            calcTypeEl.value = log.calcType;
            updateUI();
        }
        if (log.mode === 'calibration' || log.mode === 'smart-calibration') {
            if (Number.isFinite(Number(log.scalePixelsPerUnit)) && Number(log.scalePixelsPerUnit) > 0) {
                scalePixelsPerUnit = Number(log.scalePixelsPerUnit);
                const scaleInfo = document.getElementById('scale-info');
                if (scaleInfo) scaleInfo.innerText = '✅ 比例已設（由測量紀錄回填）';
                updateSmartMeasureQualityStatus();
            }
        } else if (log.valueSet && typeof log.valueSet === 'object') {
            ['v1', 'v2', 'v3', 'qty'].forEach(fieldId => {
                const input = document.getElementById(fieldId);
                const nextValue = String(log.valueSet[fieldId] == null ? '' : log.valueSet[fieldId]).trim();
                if (input && nextValue) input.value = nextValue;
            });
            if (Number.isFinite(Number(log.scalePixelsPerUnit)) && Number(log.scalePixelsPerUnit) > 0) {
                scalePixelsPerUnit = Number(log.scalePixelsPerUnit);
                const scaleInfo = document.getElementById('scale-info');
                if (scaleInfo) scaleInfo.innerText = '✅ 比例已設（由看圖紀錄回填）';
            }
        } else if (log.targetField) {
            const input = document.getElementById(log.targetField);
            if (input && Number.isFinite(Number(log.valueM))) {
                input.value = Number(log.valueM).toFixed(2);
            }
        }
        previewCalc();
        const resultText = getMeasurementLogResultText(log);
        addAuditLog('回填測量紀錄', `${log.modeLabel || log.mode} / ${log.targetLabel || log.calcLabel || '-'} / ${resultText}`);
        showToast(`已回填測量紀錄：${log.targetLabel || log.calcLabel || log.modeLabel || '量測結果'}`);
    }

    function exportMeasurementLogs() {
        if (!measurementLogs.length) return showToast('目前沒有測量紀錄可匯出');
        let csv = '\uFEFF時間,專案,樓層,模式,工種,目標欄位,目標名稱,結果,實際比例長度(m),比例(px/m),距離(px),構件,智慧量圖,吸附,手動修正,拖曳次數,微調次數,信心分數,回退,精度模式,總信心,欄位信心,待補欄位,回填值,摘要\n';
        measurementLogs.forEach(log => {
            csv += [
                sanitizeCSVField(new Date(log.ts).toLocaleString('zh-TW')),
                sanitizeCSVField(log.project || ''),
                sanitizeCSVField(log.floor || ''),
                sanitizeCSVField(log.modeLabel || log.mode || ''),
                sanitizeCSVField(log.calcLabel || log.calcType || ''),
                sanitizeCSVField(log.targetField || ''),
                sanitizeCSVField(log.targetLabel || ''),
                sanitizeCSVField(getMeasurementLogResultText(log)),
                log.actualLenM === null ? '' : log.actualLenM.toFixed(4),
                log.scalePixelsPerUnit === null ? '' : log.scalePixelsPerUnit.toFixed(4),
                log.distancePx === null ? '' : log.distancePx.toFixed(2),
                sanitizeCSVField(log.componentType || ''),
                log.smart ? '是' : '否',
                log.snapped ? '是' : '否',
                log.manualAdjust ? '是' : '否',
                String(log.dragAdjustCount || 0),
                String(log.nudgeAdjustCount || 0),
                String(log.qualityScore || 0),
                log.fallbackUsed ? '是' : '否',
                sanitizeCSVField(log.precisionMode || ''),
                log.overallConfidence === null ? '' : `${Math.round(Number(log.overallConfidence) * 100)}%`,
                sanitizeCSVField(log.fieldConfidenceSummary || ''),
                sanitizeCSVField(Array.isArray(log.reviewFields) ? log.reviewFields.join(' / ') : ''),
                sanitizeCSVField(log.valueSet ? JSON.stringify(log.valueSet) : ''),
                sanitizeCSVField(log.summary || '')
            ].join(',') + '\n';
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `ConstructionMaster_測量紀錄_${new Date().getTime()}.csv`;
        link.click();
        addAuditLog('匯出測量紀錄', `共 ${measurementLogs.length} 筆`);
        showToast(`測量紀錄已匯出（${measurementLogs.length} 筆）`);
    }

    function clearMeasurementLogs() {
        if (!measurementLogs.length) {
            showToast('目前沒有測量紀錄');
            return;
        }
        if (!window.confirm(`確定要清空 ${measurementLogs.length} 筆測量紀錄嗎？`)) return;
        measurementLogsHiddenLocally = true;
        renderMeasurementLogTable();
        addAuditLog('清空測量紀錄畫面', '僅清空本機畫面，保留記憶紀錄');
        showToast('已清空本機畫面，測量紀錄記憶仍保留');
    }
