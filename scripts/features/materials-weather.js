    async function initMaterialCatalog() {
        const savedRegion = localStorage.getItem(REGION_STORAGE_KEY);
        const selector = document.getElementById('regionSelect');
        if (savedRegion) {
            currentRegionLabel = savedRegion;
            currentRegionMode = '手動';
            if (selector) selector.value = savedRegion;
        } else {
            currentRegionLabel = '全台共用';
            currentRegionMode = '預設';
            if (selector) selector.value = '全台共用';
        }
        materialCatalog = await loadMaterialCatalog(currentRegionLabel);
        renderMaterialOptions(materialCatalog);
        updateMaterialChips(materialCatalog.length, null);
        updateRegionChip();
        updateMaterialSourceChip();
        await refreshSiteWeather(true, { allowGps: false });
        startSiteWeatherAutoRefresh();
        initBimRuleEditor();
    }

    function startSiteWeatherAutoRefresh() {
        if (siteWeatherAutoRefreshTimer) clearInterval(siteWeatherAutoRefreshTimer);
        siteWeatherAutoRefreshTimer = setInterval(() => {
            refreshSiteWeather(true, { allowGps: false });
        }, SITE_WEATHER_REFRESH_MS);
    }


    function normalizeMaterialItems(payload) {
        const items = Array.isArray(payload)
            ? payload
            : (Array.isArray(payload && payload.items) ? payload.items : []);

        const parsePrice = value => {
            if (typeof value === 'number') return value;
            const text = String(value ?? '').replace(/,/g, '').trim();
            const parsed = Number(text);
            return Number.isFinite(parsed) ? parsed : NaN;
        };

        return items
            .map(item => {
                if (!item || typeof item !== 'object') return null;
                const name = String(
                    item.name ??
                    item.materialName ??
                    item.material ??
                    item['材料名稱'] ??
                    item['名稱'] ??
                    ''
                ).trim();
                const price = parsePrice(
                    item.price ??
                    item.unitPrice ??
                    item['單價'] ??
                    item['單價 (已取高標)'] ??
                    item['單價(已取高標)']
                );
                const unit = String(item.unit ?? item['單位'] ?? '').trim();
                return { name, price, unit };
            })
            .filter(item => item && item.name && Number.isFinite(item.price) && item.price > 0);
    }

    async function loadMaterialCatalog(regionLabel = '全台共用') {
        const regionFile = REGION_FILE_MAP[regionLabel];
        const candidateFiles = regionFile ? [regionFile, PRICES_JSON_URL] : [PRICES_JSON_URL];
        const loaded = [];

        for (const file of candidateFiles) {
            try {
                const res = await fetchWithRetry(
                    `${file}?v=${Date.now()}`,
                    { cache: 'no-store' },
                    { retries: 2, timeoutMs: 6500 }
                );
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const payload = await res.json();
                const normalized = normalizeMaterialItems(payload);
                if (normalized.length > 0) {
                    const sourceFile = String(
                        (payload && typeof payload === 'object' && payload.source) ? payload.source : file
                    ).trim() || file;
                    const generatedAt = String(
                        (payload && typeof payload === 'object' && payload.generated_at) ? payload.generated_at : ''
                    ).trim();
                    const updateMode = String(
                        (payload && typeof payload === 'object' && payload.price_update_mode) ? payload.price_update_mode : ''
                    ).trim();
                    const seasonalFactor = String(
                        (payload && typeof payload === 'object' && payload.seasonal_factor !== undefined) ? payload.seasonal_factor : ''
                    ).trim();
                    const fallbackReason = String(
                        (payload && typeof payload === 'object' && payload.fallback_reason) ? payload.fallback_reason : ''
                    ).trim();
                    loaded.push({ file, items: normalized, sourceFile, generatedAt, updateMode, seasonalFactor, fallbackReason });
                }
            } catch (e) {
                console.warn(`載入 ${file} 失敗`, e);
            }
        }

        if (loaded.length > 0) {
            loaded.sort((a, b) => b.items.length - a.items.length);
            const best = loaded[0];
            const isRegionFile = !!regionFile && best.file === regionFile;
            const isRegionMode = regionLabel !== '全台共用';

            // 若地區檔資料筆數偏少，優先改用全台完整檔，避免只看到少量單價。
            if (isRegionMode && isRegionFile && best.items.length < 30) {
                const fallbackGlobal = loaded.find(entry => entry.file === PRICES_JSON_URL);
                if (fallbackGlobal && fallbackGlobal.items.length > best.items.length) {
                    showToast(`偵測到地區單價僅 ${best.items.length} 筆，已改用全台完整價目 ${fallbackGlobal.items.length} 筆`);
                    currentMaterialSourceMeta = {
                        file: fallbackGlobal.sourceFile || fallbackGlobal.file,
                        generatedAt: fallbackGlobal.generatedAt || '',
                        updateMode: fallbackGlobal.updateMode || '',
                        seasonalFactor: fallbackGlobal.seasonalFactor || '',
                        fallbackReason: fallbackGlobal.fallbackReason || ''
                    };
                    if (currentMaterialSourceMeta.updateMode === 'fallback_seasonal_factor') {
                        const factorText = currentMaterialSourceMeta.seasonalFactor
                            ? `（係數 x${currentMaterialSourceMeta.seasonalFactor}）`
                            : '';
                        showToast(`提醒：目前為季度估算價${factorText}，正式報價請上傳審核 CSV`);
                    }
                    return fallbackGlobal.items;
                }
            }

            currentMaterialSourceMeta = {
                file: best.sourceFile || best.file,
                generatedAt: best.generatedAt || '',
                updateMode: best.updateMode || '',
                seasonalFactor: best.seasonalFactor || '',
                fallbackReason: best.fallbackReason || ''
            };
            if (currentMaterialSourceMeta.updateMode === 'fallback_seasonal_factor') {
                const factorText = currentMaterialSourceMeta.seasonalFactor
                    ? `（係數 x${currentMaterialSourceMeta.seasonalFactor}）`
                    : '';
                showToast(`提醒：目前為季度估算價${factorText}，正式報價請上傳審核 CSV`);
            }
            showToast(`已同步${regionLabel}價格（${best.items.length} 筆）`);
            return best.items;
        }

        try {
            currentMaterialSourceMeta = {
                file: '內建預設',
                generatedAt: '',
                updateMode: '',
                seasonalFactor: '',
                fallbackReason: ''
            };
            showToast(`使用內建單價（離線模式：${DEFAULT_MATERIAL_CATALOG.length} 筆）`);
            return [...DEFAULT_MATERIAL_CATALOG];
        } catch (_e) {
            currentMaterialSourceMeta = {
                file: '內建預設',
                generatedAt: '',
                updateMode: '',
                seasonalFactor: '',
                fallbackReason: ''
            };
            return [...DEFAULT_MATERIAL_CATALOG];
        }
    }

    async function handleRegionChange(value) {
        if (value === 'auto') {
            localStorage.removeItem(REGION_STORAGE_KEY);
            const detected = await detectRegionFromDevice();
            currentRegionLabel = detected || '全台共用';
            currentRegionMode = detected ? '自動' : '預設';
        } else {
            currentRegionLabel = value;
            currentRegionMode = '手動';
            localStorage.setItem(REGION_STORAGE_KEY, value);
        }

        selectedMaterial = null;
        materialCatalog = await loadMaterialCatalog(currentRegionLabel);
        renderMaterialOptions(materialCatalog);
        renderBimRuleMaterialOptions();
        updateMaterialChips(materialCatalog.length, null);
        updateRegionChip();
        updateMaterialSourceChip();
        addAuditLog('切換地區價目', `${currentRegionLabel}（${currentRegionMode}）`);
    }

    async function autoDetectRegion() {
        localStorage.removeItem(REGION_STORAGE_KEY);
        const selector = document.getElementById('regionSelect');
        if (selector) selector.value = 'auto';
        await handleRegionChange('auto');
        await refreshSiteWeather(true, { allowGps: true });
    }

    function updateRegionChip() {
        const chip = document.getElementById('materialRegionChip');
        if (!chip) return;
        chip.innerHTML = `地區：<strong>${currentRegionLabel}</strong>（${currentRegionMode}）`;
    }

    function updateMaterialSourceChip() {
        const chip = document.getElementById('materialSourceChip');
        if (!chip) return;
        const file = String(currentMaterialSourceMeta.file || '未同步');
        const generatedAt = String(currentMaterialSourceMeta.generatedAt || '').trim();
        const timeText = generatedAt ? ` / ${generatedAt}` : '';
        const isFallback = String(currentMaterialSourceMeta.updateMode || '').trim() === 'fallback_seasonal_factor';
        const factor = String(currentMaterialSourceMeta.seasonalFactor || '').trim();
        const warningText = isFallback
            ? ` ｜ <strong>估算價模式</strong>${factor ? ` (x${factor})` : ''}`
            : '';
        chip.innerHTML = `資料來源：<strong>${file}</strong>${timeText}${warningText}`;
        chip.classList.toggle('material-chip-warning', isFallback);
    }

    function formatMaterialCatalogLabel(item) {
        if (!item) return '';
        const name = String(item.name || '').trim() || '未命名材料';
        const unit = String(item.unit || '').trim();
        const price = Number(item.price);
        const priceText = Number.isFinite(price) ? price.toLocaleString() : '-';
        return unit
            ? `${name} ｜ ${unit} ｜ ${priceText}`
            : `${name} ｜ ${priceText}`;
    }

    function normalizeRegionName(name) {
        const text = String(name || '');
        if (text.includes('台中') || text.includes('臺中')) return '台中市';
        if (text.includes('台北') || text.includes('臺北')) return '台北市';
        if (text.includes('新北')) return '新北市';
        if (text.includes('桃園')) return '桃園市';
        if (text.includes('台南') || text.includes('臺南')) return '台南市';
        if (text.includes('高雄')) return '高雄市';
        return '';
    }

    async function getDeviceCoordinates() {
        if (!navigator.geolocation) return null;
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 6000,
                    maximumAge: 120000
                });
            });
            const latitude = Number(pos && pos.coords && pos.coords.latitude);
            const longitude = Number(pos && pos.coords && pos.coords.longitude);
            const accuracyM = Number(pos && pos.coords && pos.coords.accuracy);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
            return {
                latitude,
                longitude,
                accuracyM: Number.isFinite(accuracyM) ? Math.max(0, accuracyM) : null
            };
        } catch (_e) {
            return null;
        }
    }

    function getWeatherFallbackCoordsByRegion(regionName) {
        const normalized = normalizeRegionName(regionName) || String(regionName || '');
        return WEATHER_REGION_CENTER_MAP[normalized] || null;
    }

    function getWeatherLocationSourceLabel(mode) {
        if (mode === 'manual-region') return '手動地區';
        if (mode === 'region-fallback') return '地區備援';
        return '按鈕抓地區';
    }

    async function resolveWeatherLocation(options = {}) {
        const allowGps = !!(options && options.allowGps);
        const coords = allowGps ? await getDeviceCoordinates() : null;
        const fallbackRegion = currentRegionLabel && currentRegionLabel !== '全台共用'
            ? (normalizeRegionName(currentRegionLabel) || currentRegionLabel)
            : '';
        const fallbackCoords = getWeatherFallbackCoordsByRegion(fallbackRegion);

        if (coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
            const accuracyM = Number(coords.accuracyM);
            if (!Number.isFinite(accuracyM) || accuracyM <= WEATHER_GEOLOCATION_MAX_ACCURACY_M) {
                return {
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    accuracyM: Number.isFinite(accuracyM) ? accuracyM : null,
                    label: fallbackRegion || '目前工地',
                    mode: 'gps'
                };
            }
            if (fallbackCoords) {
                return {
                    latitude: fallbackCoords.latitude,
                    longitude: fallbackCoords.longitude,
                    accuracyM,
                    label: fallbackRegion,
                    mode: 'region-fallback'
                };
            }
            return {
                latitude: coords.latitude,
                longitude: coords.longitude,
                accuracyM,
                label: '目前工地',
                mode: 'gps'
            };
        }

        if (fallbackCoords) {
            return {
                latitude: fallbackCoords.latitude,
                longitude: fallbackCoords.longitude,
                accuracyM: null,
                label: fallbackRegion,
                mode: 'manual-region'
            };
        }
        return null;
    }

    function resolveOpenMeteoRainProbability(current, hourly) {
        const fromCurrent = Number(current && current.precipitation_probability);
        if (Number.isFinite(fromCurrent)) {
            return Math.max(0, Math.min(100, fromCurrent));
        }
        const times = Array.isArray(hourly && hourly.time) ? hourly.time : [];
        const probs = Array.isArray(hourly && hourly.precipitation_probability) ? hourly.precipitation_probability : [];
        if (!times.length || times.length !== probs.length) return 0;
        const nowTime = String((current && current.time) || '');
        const exactIdx = times.indexOf(nowTime);
        if (exactIdx >= 0 && Number.isFinite(Number(probs[exactIdx]))) {
            return Math.max(0, Math.min(100, Number(probs[exactIdx])));
        }
        const nowTs = Date.parse(nowTime);
        if (Number.isFinite(nowTs)) {
            let bestIdx = -1;
            let bestGap = Infinity;
            for (let i = 0; i < times.length; i += 1) {
                const ts = Date.parse(String(times[i] || ''));
                if (!Number.isFinite(ts)) continue;
                const gap = Math.abs(ts - nowTs);
                if (gap < bestGap) {
                    bestGap = gap;
                    bestIdx = i;
                }
            }
            if (bestIdx >= 0 && Number.isFinite(Number(probs[bestIdx]))) {
                return Math.max(0, Math.min(100, Number(probs[bestIdx])));
            }
        }
        return Number.isFinite(Number(probs[0])) ? Math.max(0, Math.min(100, Number(probs[0]))) : 0;
    }

    async function detectRegionFromDevice() {
        try {
            const coords = await getDeviceCoordinates();
            if (!coords) return '';
            const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}&accept-language=zh-TW`;
            const res = await fetchWithRetry(url, {}, { retries: 1, timeoutMs: 5000 });
            if (!res.ok) return '';
            const data = await res.json();
            const address = data.address || {};
            const cityRaw = address.city || address.county || address.state || address.town || '';
            return normalizeRegionName(cityRaw);
        } catch (_e) {
            return '';
        }
    }

    function getWeatherAdviceLevel(weather) {
        if (!weather) return { level: '未知', message: '無天氣資料，請更新。', color: '#ffd48a' };
        const rain = Number(weather.rainMm) || 0;
        const rainProb = Number(weather.rainProb) || 0;
        const wind = Number(weather.windKmh) || 0;
        const code = Number(weather.weatherCode) || 0;
        const badCode = [65, 75, 82, 95, 96, 99];
        if (badCode.includes(code) || rain >= 5 || rainProb >= 80 || wind >= 40) {
            return { level: '建議暫緩', message: '風雨風險高，建議延後外業。', color: '#ff9a9a' };
        }
        if (rain >= 1 || rainProb >= 50 || wind >= 28) {
            return { level: '注意施工', message: '請加強防滑、防風與儀器固定。', color: '#ffd48a' };
        }
        return { level: '可施工', message: '天氣條件穩定，可依標準流程施工。', color: '#9ef5c2' };
    }

    function resolveWeatherVisualState(weather, level) {
        const code = Number(weather && weather.weatherCode) || 0;
        const rain = Number(weather && weather.rainMm) || 0;
        const rainProb = Number(weather && weather.rainProb) || 0;
        const stormCodes = [95, 96, 99];
        const rainCodes = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];
        const fogCodes = [45, 48];
        if (stormCodes.includes(code) || level === '建議暫緩') return 'storm';
        if (fogCodes.includes(code)) return 'fog';
        if (rainCodes.includes(code) || rain >= 0.4 || rainProb >= 50) return 'rain';
        if ([2, 3].includes(code)) return 'cloudy';
        if ([0, 1].includes(code)) return 'sun';
        if (level === '注意施工') return 'rain';
        return 'cloudy';
    }

    function applyWeatherScene(level, weather = null) {
        const body = document.body;
        if (!body) return;
        body.classList.remove(
            'weather-scene-good',
            'weather-scene-caution',
            'weather-scene-bad',
            'weather-visual-sun',
            'weather-visual-cloudy',
            'weather-visual-rain',
            'weather-visual-storm',
            'weather-visual-fog'
        );
        if (level === '可施工') body.classList.add('weather-scene-good');
        else if (level === '注意施工') body.classList.add('weather-scene-caution');
        else if (level === '建議暫緩') body.classList.add('weather-scene-bad');
        const visualState = resolveWeatherVisualState(weather, level);
        body.classList.add(`weather-visual-${visualState}`);
    }

    function createWeatherNewsBulletin(weather) {
        if (!weather) return '氣象快報：資料不足，請稍後更新。';
        const weatherLabel = WEATHER_CODE_MAP[Number(weather.weatherCode)] || '天氣變化';
        const rainProb = Math.round(Number(weather.rainProb) || 0);
        const rainMm = Number(weather.rainMm) || 0;
        const windKmh = Math.round(Number(weather.windKmh) || 0);
        const tempC = Number(weather.tempC) || 0;
        const advice = getWeatherAdviceLevel(weather);
        let phaseText = '整體天氣穩定';
        if (rainProb >= 80 || rainMm >= 5 || windKmh >= 40) phaseText = '短時風雨風險偏高';
        else if (rainProb >= 50 || rainMm >= 1 || windKmh >= 28) phaseText = '局部有雨勢變化';
        return `氣象快報：目前${weatherLabel}，${tempC.toFixed(1)}°C，降雨機率 ${rainProb}%、風速 ${windKmh} km/h；${phaseText}，施工判斷 ${advice.level}。`;
    }

    function getActiveStakingQaGate() {
        if (latestWeatherAdviceLevel === '建議暫緩') return Math.max(STAKING_EXPORT_QA_MIN_SCORE, 92);
        if (latestWeatherAdviceLevel === '注意施工') return Math.max(STAKING_EXPORT_QA_MIN_SCORE, 90);
        return STAKING_EXPORT_QA_MIN_SCORE;
    }

    function applyWeatherLinkedStakingMode(adviceLevel, weather) {
        latestWeatherAdviceLevel = adviceLevel || '未知';
        const nextConservative = adviceLevel === '注意施工' || adviceLevel === '建議暫緩';
        const changed = nextConservative !== stakingConservativeMode;
        stakingConservativeMode = nextConservative;
        if (stakingConservativeMode && bimLayoutPoints.length) {
            runBimLayoutConfidenceLayering(true, true);
        }
        if (changed) {
            const rainProb = Math.round(Number(weather && weather.rainProb) || 0);
            const wind = Math.round(Number(weather && weather.windKmh) || 0);
            const gate = getActiveStakingQaGate();
            if (stakingConservativeMode) {
                addAuditLog('天氣聯動保守模式', `啟用 / 天氣 ${adviceLevel} / 門檻 ${gate} / 雨機率 ${rainProb}% / 風速 ${wind}km/h`);
            } else {
                addAuditLog('天氣聯動保守模式', `解除 / 天氣 ${adviceLevel} / 門檻 ${gate}`);
            }
        }
    }

    function setSiteWeatherNewsText(text, color) {
        const applyText = (node) => {
            if (!node) return;
            node.innerText = text;
            if (color) node.style.color = color;
            // Restart marquee each time bulletin text changes.
            node.style.animation = 'none';
            void node.offsetWidth;
            node.style.animation = 'weather-news-marquee 16s linear infinite';
        };
        applyText(document.getElementById('siteWeatherNews'));
        applyText(document.getElementById('globalWeatherTickerText'));
    }

    function updateSiteWeatherUI(weather, errorText = '') {
        const info = document.getElementById('siteWeatherInfo');
        const safety = document.getElementById('siteWeatherSafety');
        const news = document.getElementById('siteWeatherNews');
        if (!info || !safety || !news) return;
        if (!weather) {
            applyWeatherScene('未知', null);
            applyWeatherLinkedStakingMode('未知', null);
            info.innerText = `天氣：${errorText || '暫無資料'}`;
            info.style.color = '#ffd48a';
            safety.innerText = `施工建議：天氣暫時無法更新，系統會自動重試｜放樣模式：${stakingConservativeMode ? '保守' : '標準'}（QA門檻 ${getActiveStakingQaGate()}）`;
            safety.style.color = '#ffd48a';
            setSiteWeatherNewsText('氣象快報：目前無即時資料，系統將自動重試更新。', '#ffd48a');
            return;
        }
        const weatherLabel = WEATHER_CODE_MAP[Number(weather.weatherCode)] || '天氣變化';
        const locationLabel = String(weather.locationLabel || '').trim();
        const sourceLabel = getWeatherLocationSourceLabel(weather.locationMode);
        const locationText = locationLabel ? `｜工地 ${locationLabel}（${sourceLabel}）` : `｜來源 ${sourceLabel}`;
        const accuracyText = Number.isFinite(Number(weather.locationAccuracyM)) ? `｜範圍誤差約 ${Math.round(Number(weather.locationAccuracyM))}m` : '';
        info.innerText = `天氣：${weatherLabel}${locationText}${accuracyText}｜${weather.tempC.toFixed(1)}°C（體感 ${weather.apparentC.toFixed(1)}°C）｜降雨 ${weather.rainMm.toFixed(1)}mm / ${Math.round(weather.rainProb)}%｜風速 ${Math.round(weather.windKmh)}km/h`;
        info.style.color = '#cde8ff';
        const advice = getWeatherAdviceLevel(weather);
        applyWeatherScene(advice.level, weather);
        applyWeatherLinkedStakingMode(advice.level, weather);
        safety.innerText = `施工建議：${advice.level}｜${advice.message}｜放樣模式：${stakingConservativeMode ? '保守（僅高信心）' : '標準'}｜QA門檻 ${getActiveStakingQaGate()}`;
        safety.style.color = advice.color;
        setSiteWeatherNewsText(createWeatherNewsBulletin(weather), '#cfe6ff');
    }

    async function refreshSiteWeather(silent = false, options = {}) {
        const location = await resolveWeatherLocation(options);
        if (!location) {
            updateSiteWeatherUI(null, '尚未指定工地地區，可手動選城市或按按鈕抓目前工地');
            if (!silent) showToast('請先手動選地區，或按「抓目前工地並套用」');
            return;
        }
        try {
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,apparent_temperature,weather_code,precipitation,precipitation_probability,wind_speed_10m&hourly=precipitation_probability&forecast_days=1&timezone=auto`;
            const res = await fetchWithRetry(weatherUrl, {}, { retries: 1, timeoutMs: 6500 });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const payload = await res.json();
            const current = payload && payload.current ? payload.current : {};
            const hourly = payload && payload.hourly ? payload.hourly : {};
            const rainProb = resolveOpenMeteoRainProbability(current, hourly);
            const weather = {
                tempC: Number(current.temperature_2m) || 0,
                apparentC: Number(current.apparent_temperature) || 0,
                weatherCode: Number(current.weather_code) || 0,
                rainMm: Number(current.precipitation) || 0,
                windKmh: Number(current.wind_speed_10m) || 0,
                rainProb: Number(rainProb) || 0,
                locationLabel: location.label || '',
                locationMode: location.mode || 'gps',
                locationAccuracyM: Number.isFinite(Number(location.accuracyM)) ? Number(location.accuracyM) : null
            };
            updateSiteWeatherUI(weather);
            addAuditLog('工地天氣更新', `${weather.locationLabel || '目前工地'} / ${getWeatherLocationSourceLabel(weather.locationMode)} / 溫度 ${weather.tempC}°C / 降雨機率 ${Math.round(weather.rainProb)}% / 風速 ${Math.round(weather.windKmh)}km/h`);
            if (!silent) showToast('工地即時天氣已更新');
        } catch (_e) {
            updateSiteWeatherUI(null, '天氣服務連線失敗，請稍後重試');
            if (!silent) showToast('天氣服務暫時不可用，請稍後重試');
        }
    }

    function renderMaterialOptions(items) {
        const select = document.getElementById('materialSelect');
        if (!select) return;
        select.innerHTML = '<option value="">請選擇材料項目</option>';
        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.name;
            opt.textContent = formatMaterialCatalogLabel(item);
            select.appendChild(opt);
        });
    }

    function normalizeText(text) {
        return (text || '').toLowerCase().replace(/\s+/g, '');
    }

    function filterMaterialCatalog(keyword) {
        const q = normalizeText(keyword);
        const filtered = materialCatalog.filter(item => normalizeText(item.name).includes(q));
        renderMaterialOptions(filtered);
        selectedMaterial = filtered.length === 1 ? filtered[0] : null;
        updateMaterialChips(filtered.length, selectedMaterial, materialCatalog.length);
    }

    function selectMaterialFromDropdown(name) {
        selectedMaterial = materialCatalog.find(item => item.name === name) || null;
        updateMaterialChips(materialCatalog.length, selectedMaterial);
    }

    function updateMaterialChips(count, material, totalCount) {
        const countChip = document.getElementById('materialCountChip');
        const priceChip = document.getElementById('materialPriceChip');
        const total = Number.isFinite(totalCount) ? totalCount : count;
        if (countChip) {
            if (count !== total) countChip.innerHTML = `資料筆數：<strong>${count}</strong> / <span style="color:#9bc2e5;">總 ${total}</span>`;
            else countChip.innerHTML = `資料筆數：<strong>${count}</strong>`;
        }
        if (priceChip) {
            if (material) {
                priceChip.innerHTML = `目前材料：<strong>${formatMaterialCatalogLabel(material)}</strong>`;
            } else {
                priceChip.innerHTML = '目前材料：<strong>尚未選取</strong>';
            }
        }
    }

    function applySelectedMaterialPrice() {
        if (!selectedMaterial) return showToast('請先從試算表項目選擇材料');
        const unitPriceInput = document.getElementById('unitPrice');
        const customNameInput = document.getElementById('customName');
        unitPriceInput.value = selectedMaterial.price;
        if (!customNameInput.value.trim()) customNameInput.value = selectedMaterial.name;
        previewCalc();
        showToast(`已套用「${selectedMaterial.name}」單價`);
    }
