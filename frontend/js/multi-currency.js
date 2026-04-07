// ============================================================
// multi-currency.js — Multi-Currency Support Module
// Adds currency selector + exchange rate to itinerary & invoice
// Supported: INR, USD, EUR, GBP, AED, THB, SGD, MYR, LKR
// ============================================================

const CURRENCIES = {
    INR: { symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳' },
    USD: { symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
    EUR: { symbol: '€', name: 'Euro', flag: '🇪🇺' },
    GBP: { symbol: '£', name: 'British Pound', flag: '🇬🇧' },
    AED: { symbol: 'د.إ', name: 'UAE Dirham', flag: '🇦🇪' },
    THB: { symbol: '฿', name: 'Thai Baht', flag: '🇹🇭' },
    SGD: { symbol: 'S$', name: 'Singapore Dollar', flag: '🇸🇬' },
    MYR: { symbol: 'RM', name: 'Malaysian Ringgit', flag: '🇲🇾' },
    LKR: { symbol: 'Rs', name: 'Sri Lankan Rupee', flag: '🇱🇰' },
};

// Default exchange rates (INR per 1 unit of foreign currency)
const DEFAULT_RATES = {
    INR: 1, USD: 83.5, EUR: 91.0, GBP: 106.0, AED: 22.7,
    THB: 2.35, SGD: 62.5, MYR: 17.8, LKR: 0.27,
};

let _cachedRates = null;

// ── Fetch latest exchange rates (cache in DB if available) ──
async function getExchangeRate(currency) {
    if (currency === 'INR') return 1;
    if (_cachedRates && _cachedRates[currency]) return _cachedRates[currency];

    // Try DB cache first
    const { data } = await window.supabase.from('exchange_rates')
        .select('rate_to_inr, fetched_at')
        .eq('currency_code', currency)
        .single();

    if (data) {
        const age = Date.now() - new Date(data.fetched_at).getTime();
        if (age < 24 * 60 * 60 * 1000) { // Less than 24h old
            if (!_cachedRates) _cachedRates = {};
            _cachedRates[currency] = data.rate_to_inr;
            return data.rate_to_inr;
        }
    }

    // Fallback to default
    return DEFAULT_RATES[currency] || 1;
}

// ── Format amount in given currency ──────────────────────
function formatCurrency(amount, currencyCode) {
    const c = CURRENCIES[currencyCode] || CURRENCIES.INR;
    const num = Number(amount) || 0;
    if (currencyCode === 'INR') return formatINR(num);
    return `${c.symbol} ${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Inject currency selector into a container ──────────────
function injectCurrencySelector(containerId, selectId, onChangeCallback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    // Avoid double injection
    if (document.getElementById(selectId)) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'form-group';
    wrapper.style.marginBottom = '14px';
    wrapper.innerHTML = `
        <label for="${selectId}" class="form-label">Currency</label>
        <div style="display:flex;gap:8px;align-items:center">
            <select id="${selectId}" class="form-select" style="flex:1">
                ${Object.entries(CURRENCIES).map(([code, c]) =>
                    `<option value="${code}" ${code === 'INR' ? 'selected' : ''}>${c.flag} ${code} — ${c.name}</option>`
                ).join('')}
            </select>
            <div style="display:flex;gap:6px;align-items:center" id="${selectId}RateWrap">
                <label style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap">Rate to ₹</label>
                <input type="number" id="${selectId}Rate" class="form-input" style="width:90px" value="1" min="0" step="0.01">
            </div>
        </div>
    `;
    container.prepend(wrapper);

    const sel = document.getElementById(selectId);
    const rateInput = document.getElementById(`${selectId}Rate`);
    const rateWrap = document.getElementById(`${selectId}RateWrap`);

    async function handleChange() {
        const code = sel.value;
        if (code === 'INR') {
            rateWrap.style.display = 'none';
            rateInput.value = '1';
        } else {
            rateWrap.style.display = 'flex';
            const rate = await getExchangeRate(code);
            rateInput.value = rate;
        }
        if (onChangeCallback) onChangeCallback(code, parseFloat(rateInput.value) || 1);
    }

    sel.addEventListener('change', handleChange);
    rateInput.addEventListener('input', () => {
        if (onChangeCallback) onChangeCallback(sel.value, parseFloat(rateInput.value) || 1);
    });

    // Initial state: hide rate for INR
    rateWrap.style.display = 'none';
}

// ── Get current currency state from a selector ────────────
function getCurrencyState(selectId) {
    const sel = document.getElementById(selectId);
    const rateInput = document.getElementById(`${selectId}Rate`);
    if (!sel) return { currency: 'INR', rate: 1 };
    return {
        currency: sel.value,
        rate: parseFloat(rateInput?.value) || 1,
    };
}

// ── Display INR equivalent line ───────────────────────────
function showInrEquivalent(containerId, amount, currencyCode, rate) {
    let el = document.getElementById(containerId);
    if (!el) return;
    if (currencyCode === 'INR') {
        el.textContent = '';
        return;
    }
    const inrAmount = amount * rate;
    el.innerHTML = `<span style="font-size:0.78rem;color:var(--text-muted)">≈ ${formatINR(inrAmount)} INR</span>`;
}

// ── Wire into itinerary page ──────────────────────────────
function initItineraryCurrency() {
    // Insert before the pricing breakdown section
    const pricingSection = document.querySelector('.pricing-breakdown')?.parentElement;
    if (!pricingSection) return;

    // Add a container div before pricing breakdown
    const anchor = pricingSection.querySelector('.pricing-breakdown');
    if (!anchor) return;
    const holder = document.createElement('div');
    holder.id = 'itinCurrencyHolder';
    anchor.parentElement.insertBefore(holder, anchor);

    injectCurrencySelector('itinCurrencyHolder', 'itinCurrency', (code, rate) => {
        // Update display labels
        const sym = CURRENCIES[code]?.symbol || '₹';
        document.querySelectorAll('.currency-symbol').forEach(el => el.textContent = sym);
        // Trigger recalculate if exists
        if (typeof recalculate === 'function') recalculate();
    });
}

// ── Wire into invoice page ────────────────────────────────
function initInvoiceCurrency() {
    injectCurrencySelector('invoiceFormTop', 'invCurrency', (code, rate) => {
        if (typeof recalcInvoice === 'function') recalcInvoice();
    });
}
