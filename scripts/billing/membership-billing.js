(function () {
    function isCapacitorIos() {
        try {
            const cap = typeof window !== 'undefined' ? window.Capacitor : null;
            return !!(cap && typeof cap.getPlatform === 'function' && String(cap.getPlatform()) === 'ios');
        } catch (_e) {
            return false;
        }
    }

    function isIosReviewRuntime() {
        try {
            if (isCapacitorIos()) return true;
            const ua = String(navigator.userAgent || '');
            const platform = String(navigator.platform || '');
            const hasAppleTouch = Number(navigator.maxTouchPoints || 0) > 1;
            return /iPad|iPhone|iPod/i.test(ua) || (/MacIntel/i.test(platform) && hasAppleTouch);
        } catch (_e) {
            return false;
        }
    }

    function getDefaultApiBaseForBilling() {
        try {
            const cap = typeof window !== 'undefined' ? window.Capacitor : null;
            if (cap && typeof cap.getPlatform === 'function' && String(cap.getPlatform()) === 'ios') {
                return 'https://wenwenming.com';
            }
        } catch (_e) {}
        return '/api';
    }

    function normalizeApiBase() {
        try {
            let explicit = null;
            try {
                explicit = localStorage.getItem('bm_69:api_base_url');
            } catch (_e) {
                explicit = null;
            }
            const fallback = getDefaultApiBaseForBilling();
            const raw = String(explicit !== null && explicit !== '' ? explicit : fallback).trim();
            if (!raw || raw === '/') return '/api';
            if (/^https?:\/\/[^/]+$/i.test(raw)) return `${raw.replace(/\/+$/g, '')}/api`;
            return raw.replace(/\/+$/g, '');
        } catch (_e) {
            return '/api';
        }
    }

    function buildApiUrl(path) {
        const p = String(path || '').startsWith('/') ? String(path) : `/${path}`;
        return `${normalizeApiBase()}${p}`;
    }

    function clearStripeReturnParams() {
        try {
            const url = new URL(window.location.href);
            if (!url.searchParams.has('stripe_session') && !url.searchParams.has('session_id')) return;
            url.searchParams.delete('stripe_session');
            url.searchParams.delete('session_id');
            history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
        } catch (_e) {}
    }

    async function fetchCatalog() {
        const res = await fetch(buildApiUrl('/billing/catalog'), { headers: { Accept: 'application/json' } });
        if (!res.ok) return null;
        return res.json();
    }

    async function redeemStripeSession(sessionId) {
        const res = await fetch(buildApiUrl('/billing/stripe/redeem'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ sessionId: String(sessionId || '').trim() })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.message || data.error || `HTTP ${res.status}`);
            err.payload = data;
            throw err;
        }
        return data;
    }

    async function redeemAppleReceipt(receiptBase64) {
        const res = await fetch(buildApiUrl('/billing/apple/redeem'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ receiptBase64: String(receiptBase64 || '').trim() })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.message || data.error || `HTTP ${res.status}`);
            err.payload = data;
            throw err;
        }
        return data;
    }

    function renderTierButtons(container, catalog) {
        if (!container || !catalog || !Array.isArray(catalog.tiers)) return;
        container.innerHTML = '';
        catalog.tiers.forEach((tier) => {
            const row = document.createElement('div');
            row.className = 'billing-tier-row';
            const label = document.createElement('span');
            label.className = 'billing-tier-label';
            label.textContent = tier.label || tier.id;
            const actions = document.createElement('div');
            actions.className = 'billing-tier-actions';
            if (tier.stripePaymentLinkUrl && !isIosReviewRuntime()) {
                const a = document.createElement('a');
                a.className = 'billing-link billing-link-stripe';
                a.href = tier.stripePaymentLinkUrl;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = '信用卡 (Stripe)';
                actions.appendChild(a);
            }
            if (tier.appleProductId) {
                const hint = document.createElement('span');
                hint.className = 'billing-iap-hint';
                hint.textContent = 'App 內：用 Apple 訂閱';
                hint.title = `Product ID: ${tier.appleProductId}`;
                actions.appendChild(hint);
            }
            row.appendChild(label);
            row.appendChild(actions);
            container.appendChild(row);
        });
        if (!container.children.length) {
            container.innerHTML = '<p class="billing-muted">尚未設定付款連結（伺服器環境變數）。</p>';
        }
    }

    function setBillingStripeSessionPreview(raw) {
        const wrap = document.getElementById('billingStripeSessionPreview');
        const codeEl = document.getElementById('billingStripeSessionPreviewValue');
        const sid = String(raw || '').trim();
        if (!wrap || !codeEl) return;
        if (isIosReviewRuntime()) {
            codeEl.textContent = '';
            wrap.hidden = true;
            return;
        }
        if (sid.startsWith('cs_')) {
            codeEl.textContent = sid;
            wrap.hidden = false;
        } else {
            codeEl.textContent = '';
            wrap.hidden = true;
        }
    }

    async function tryAutoRedeemStripe() {
        if (isIosReviewRuntime()) {
            clearStripeReturnParams();
            return;
        }
        const params = new URLSearchParams(window.location.search);
        const sid = params.get('stripe_session') || params.get('session_id');
        if (!sid || !sid.startsWith('cs_')) return;
        const input = document.getElementById('billingStripeSessionInput');
        if (input && !String(input.value || '').trim()) {
            input.value = sid;
        }
        setBillingStripeSessionPreview(sid);
        const hint = document.getElementById('securityHint');
        if (hint) hint.innerText = '正在兌換 Stripe 付款…';
        try {
            const data = await redeemStripeSession(sid);
            const bridge = window.BuildMasterAuthBridge;
            if (bridge && typeof bridge.applyLoginResult === 'function') {
                await bridge.applyLoginResult(data);
            }
            clearStripeReturnParams();
        } catch (e) {
            console.warn(e);
            if (hint) hint.innerText = e.message || 'Stripe 兌換失敗，請改用手動輸入 Session ID';
        }
    }

    function bindManualRedeem() {
        const btn = document.getElementById('billingStripeRedeemBtn');
        const input = document.getElementById('billingStripeSessionInput');
        const hint = document.getElementById('securityHint');
        if (!btn || !input) return;
        if (isIosReviewRuntime()) {
            btn.disabled = true;
            btn.hidden = true;
            input.disabled = true;
            input.hidden = true;
            return;
        }
        const syncPreview = () => setBillingStripeSessionPreview(input.value);
        input.addEventListener('input', syncPreview);
        input.addEventListener('paste', () => queueMicrotask(syncPreview));
        syncPreview();
        btn.addEventListener('click', async () => {
            const sid = String(input.value || '').trim();
            if (!sid.startsWith('cs_')) {
                if (hint) hint.innerText = 'Session ID 應以 cs_ 開頭';
                setBillingStripeSessionPreview(input.value);
                return;
            }
            setBillingStripeSessionPreview(sid);
            if (hint) hint.innerText = '兌換中…';
            try {
                const data = await redeemStripeSession(sid);
                const bridge = window.BuildMasterAuthBridge;
                if (bridge && typeof bridge.applyLoginResult === 'function') {
                    await bridge.applyLoginResult(data);
                }
                input.value = '';
                setBillingStripeSessionPreview('');
            } catch (e) {
                if (hint) hint.innerText = e.message || '兌換失敗';
            }
        });
    }

    async function initBillingPanel() {
        const tiersHost = document.getElementById('billingTiersHost');
        if (tiersHost) {
            const catalog = await fetchCatalog();
            if (catalog) renderTierButtons(tiersHost, catalog);
        }
        bindManualRedeem();
        await tryAutoRedeemStripe();
    }

    function boot() {
        initBillingPanel().catch((e) => console.warn('billing ui', e));
    }

    window.BuildMasterBilling = {
        redeemStripeSession,
        redeemAppleReceipt,
        fetchCatalog
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
