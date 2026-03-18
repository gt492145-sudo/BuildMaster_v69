// Site weather and weather-linked staking module (v8.0).
(function attachV80WeatherModule(global) {
  function startSiteWeatherAutoRefresh() {
    if (siteWeatherAutoRefreshTimer) clearInterval(siteWeatherAutoRefreshTimer);
    siteWeatherAutoRefreshTimer = setInterval(() => {
      refreshSiteWeather(true);
    }, SITE_WEATHER_REFRESH_MS);
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
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return { latitude, longitude };
    } catch (_e) {
      return null;
    }
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

  function applyWeatherScene(level) {
    const body = document.body;
    if (!body) return;
    body.classList.remove('weather-scene-good', 'weather-scene-caution', 'weather-scene-bad');
    if (level === '可施工') body.classList.add('weather-scene-good');
    else if (level === '注意施工') body.classList.add('weather-scene-caution');
    else if (level === '建議暫緩') body.classList.add('weather-scene-bad');
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
      applyWeatherScene('未知');
      applyWeatherLinkedStakingMode('未知', null);
      info.innerText = `天氣：${errorText || '暫無資料'}`;
      info.style.color = '#ffd48a';
      safety.innerText = `施工建議：天氣暫時無法更新，系統會自動重試｜放樣模式：${stakingConservativeMode ? '保守' : '標準'}（QA門檻 ${getActiveStakingQaGate()}）`;
      safety.style.color = '#ffd48a';
      setSiteWeatherNewsText('氣象快報：目前無即時資料，系統將自動重試更新。', '#ffd48a');
      return;
    }
    const weatherLabel = WEATHER_CODE_MAP[Number(weather.weatherCode)] || '天氣變化';
    info.innerText = `天氣：${weatherLabel}｜${weather.tempC.toFixed(1)}°C（體感 ${weather.apparentC.toFixed(1)}°C）｜降雨 ${weather.rainMm.toFixed(1)}mm / ${Math.round(weather.rainProb)}%｜風速 ${Math.round(weather.windKmh)}km/h`;
    info.style.color = '#cde8ff';
    const advice = getWeatherAdviceLevel(weather);
    applyWeatherScene(advice.level);
    applyWeatherLinkedStakingMode(advice.level, weather);
    safety.innerText = `施工建議：${advice.level}｜${advice.message}｜放樣模式：${stakingConservativeMode ? '保守（僅高信心）' : '標準'}｜QA門檻 ${getActiveStakingQaGate()}`;
    safety.style.color = advice.color;
    setSiteWeatherNewsText(createWeatherNewsBulletin(weather), '#cfe6ff');
  }

  async function refreshSiteWeather(silent = false) {
    const coords = await getDeviceCoordinates();
    if (!coords) {
      updateSiteWeatherUI(null, '無法取得定位（請開啟定位權限）');
      if (!silent) showToast('無法取得定位，請開啟定位權限後重試');
      return;
    }
    try {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,apparent_temperature,weather_code,precipitation,precipitation_probability,wind_speed_10m&hourly=precipitation_probability&forecast_days=1&timezone=auto`;
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
        rainProb: Number(rainProb) || 0
      };
      updateSiteWeatherUI(weather);
      addAuditLog('工地天氣更新', `溫度 ${weather.tempC}°C / 降雨機率 ${Math.round(weather.rainProb)}% / 風速 ${Math.round(weather.windKmh)}km/h`);
      if (!silent) showToast('工地即時天氣已更新');
    } catch (_e) {
      updateSiteWeatherUI(null, '天氣服務連線失敗，請稍後重試');
      if (!silent) showToast('天氣服務暫時不可用，請稍後重試');
    }
  }

  global.startSiteWeatherAutoRefresh = startSiteWeatherAutoRefresh;
  global.getDeviceCoordinates = getDeviceCoordinates;
  global.resolveOpenMeteoRainProbability = resolveOpenMeteoRainProbability;
  global.detectRegionFromDevice = detectRegionFromDevice;
  global.getWeatherAdviceLevel = getWeatherAdviceLevel;
  global.applyWeatherScene = applyWeatherScene;
  global.createWeatherNewsBulletin = createWeatherNewsBulletin;
  global.getActiveStakingQaGate = getActiveStakingQaGate;
  global.applyWeatherLinkedStakingMode = applyWeatherLinkedStakingMode;
  global.setSiteWeatherNewsText = setSiteWeatherNewsText;
  global.updateSiteWeatherUI = updateSiteWeatherUI;
  global.refreshSiteWeather = refreshSiteWeather;
})(window);
