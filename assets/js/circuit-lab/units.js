// Pure SI-unit parsing / formatting + resistor color band lookup.
// Used by Circuit Lab UI (circuitforge.js) and component renderers.

export function parseUnit(str) {
    if (!str) return 0;
    str = String(str).trim();
    const m = str.match(/^(-?[\d.]+)\s*([a-zA-Zµμ]*)$/);
    if (!m) return parseFloat(str) || 0;

    let v = parseFloat(m[1]);
    let s = m[2];

    switch (s) {
        case 'p': v *= 1e-12; break;
        case 'n': v *= 1e-9;  break;
        case 'u':
        case 'µ':
        case 'μ': v *= 1e-6;  break;
        case 'm': v *= 1e-3;  break;
        case 'k': v *= 1e3;   break;
        case 'M': v *= 1e6;   break;
        case 'G': v *= 1e9;   break;
    }
    return v;
}

export function formatUnit(num, unit = '') {
    if (!isFinite(num)) return '0' + unit;
    const a = Math.abs(num);
    if (a === 0)         return '0' + unit;
    if (a < 1e-9)        return (num * 1e12).toFixed(2) + 'p' + unit;
    if (a < 1e-6)        return (num * 1e9 ).toFixed(2) + 'n' + unit;
    if (a < 1e-3)        return (num * 1e6 ).toFixed(2) + 'µ' + unit;
    if (a < 1)           return (num * 1e3 ).toFixed(2) + 'm' + unit;
    if (a >= 1e6)        return (num / 1e6).toFixed(2) + 'M' + unit;
    if (a >= 1e3)        return (num / 1e3).toFixed(2) + 'k' + unit;
    return num.toFixed(2) + unit;
}

export function formatSignedUnit(num, unit = '') {
    if (!isFinite(num)) return '0' + unit;
    const sign = num < 0 ? '-' : '';
    return sign + formatUnit(Math.abs(num), unit);
}

// Resistor color-band bands for a given resistance string and tolerance percentage.
// Returns an array of 4 CSS colors (first digit, second digit, multiplier, tolerance).
export function getResColor(val, Tolerance) {
    const colors = ['#000000', '#512627', '#FF2100', '#D87347',
                    '#E6C951', '#528F65', '#0F5190', '#6967CE',
                    '#7D7D7D', '#FFFFFF'];

    let ohms = parseUnit(val);
    if (!isFinite(ohms) || ohms <= 0) ohms = 1000; // fallback 1k

    let mag  = Math.floor(Math.log10(ohms));
    let base = ohms / Math.pow(10, mag);
    if (base < 1) { base *= 10; mag--; }

    let dv  = Math.round(base * 10);
    let d1  = Math.floor(dv / 10);
    let d2  = dv % 10;
    let mult = mag - 1;

    d1 = Math.max(0, Math.min(9, d1));
    d2 = Math.max(0, Math.min(9, d2));

    const bands = [colors[d1], colors[d2]];

    // multiplier band
    let multColor = '#000000';
    if (mult >= 0 && mult <= 9) multColor = colors[mult];
    else if (mult === -1) multColor = '#C08327'; // gold
    else if (mult === -2) multColor = '#BFBEBF'; // silver
    bands.push(multColor);

    // tolerance band
    const t = parseFloat(Tolerance);
    let tolColor = '#C08327'; // default ~5%
    if (t === 1)  tolColor = '#512627';
    if (t === 2)  tolColor = '#FF2100';
    if (t === 10) tolColor = '#BFBEBF';
    bands.push(tolColor);

    return bands;
}
