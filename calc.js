/* AA-5 weight & balance math — a line-for-line copy of "Weight and Balance 1-16-88.numbers". */
(function (root) {
  'use strict';

  // Sheet defaults (Table 1, sheet "Weight and Balance").
  var DEFAULTS = {
    // Dan, Oct 19, 2026, 4:53 PM: take the full 8 qt of oil OUT of the empty weight so oil is entered as quarts on board.
    // His logbook figures 1292.8 / 80.14 / 103.61053 include full oil (8 qt x 1.875 = 15.0 lb at arm 32.0 = 0.48).
    // 1292.8 - 15.0 = 1277.8; 103.61053 - 0.48 = 103.13053 (kept exact, not recomputed); arm 103130.53 / 1277.8 = 80.7094, shown 80.71.
    settings: { emptyWeight: 1277.8, emptyArm: 80.71, emptyMoment: 103.13053 },
    // Earlier defaults — a device still holding exactly one of these sets is moved to the figures above on load.
    oldSettings: [
      { emptyWeight: 1292.8, emptyArm: 80.14, emptyMoment: 103.61053 }, // Oct 19, 4:35 PM default (aa5wb-v6), oil included
      { emptyWeight: 1301.5, emptyArm: 80.06, emptyMoment: 104.20213 }, // Oct 19, 4:21 PM default (aa5wb-v5)
      { emptyWeight: 1292.8, emptyArm: 80.14, emptyMoment: 103.61 }     // the sheet's original I4/J4/K4
    ],
    // Oil = quarts on board (empty weight excludes oil). Reset and Restore never change it (see resetKeepOil).
    inputs: { oilQt: 8, fuelGal: 37, front: 230, rear: 60, baggage: 0, cargo: 0 },
    resetInputs: { oilQt: 8, fuelGal: 37, front: 0, rear: 0, baggage: 0, cargo: 0 }
  };

  // Arms (inches) and conversions exactly as the sheet holds them.
  var ARMS = { oil: 32.0, fuel: 90.9, front: 90.6, rear: 126.0, baggage: 148.0, cargo: 116.4 };
  var OIL_LB_PER_QT = 1.875; // corrected per Dan Oct 16 (sheet had 1.8)
  var FUEL_LB_PER_GAL = 6;   // I8 = SUM(H8x6)
  var MAX_GROSS = 2200;      // I20 = SUM((I18-2200)x(-1.0))
  var MAX_BAGGAGE = 120;     // label "Baggage (Max 120 lbs.)"
  var MAX_CARGO = 340;       // label "Cargo Area ( Max 340 lbs.)"
  // Input limits (Dan, Oct 19, 2026, 5:06 PM): fuel 0-37 gal usable, oil 0-8 qt on board.
  var LIMITS = {
    fuelGal: { min: 0, max: 37, unit: 'gal', maxNote: 'Max 37 gal (usable)', minNote: 'Min 0 gal' },
    oilQt:   { min: 0, max: 8,  unit: 'qt',  maxNote: 'Max 8 qt',            minNote: 'Min 0 qt' }
  };

  // Envelope table A2:C53: moment/1000, upper weight line (col B), lower weight line (col C).
  var ENV_MOMENT = [96,98,100,102,104,106,108,110,112,114,116,118,120,122,124,126,128,130,132,134,136,138,140,142,144,146,148,150,152,154,156,158,160,162,164,166,168,170,172,174,176,178,180,182,184,186,188,190,192,194,196,198];
  var ENV_UPPER = [1200,1225,1260,1280,1300,1330,1360,1380,1400,1430,1460,1480,1500,1525,1555,1575,1600,1625,1650,1675,1700,1725,1737,1752,1775,1800,1820,1830,1850,1875,1885,1910,1925,1950,1965,1975,2000,2020,2030,2050,2070,2080,2100,2120,2135,2150,2175,2180,2200,2200,2200,2200];
  var ENV_LOWER = [1200,1200,1200,1200,1200,1200,1200,1225,1250,1275,1300,1320,1340,1360,1380,1410,1425,1450,1475,1490,1515,1535,1560,1580,1600,1625,1650,1670,1690,1710,1730,1750,1775,1800,1825,1845,1865,1885,1910,1930,1950,1975,2000,2020,2040,2060,2080,2100,2125,2150,2175,2200];

  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v === null || v === undefined) return 0;
    // Pasted minus signs (− U+2212, – U+2013, ‒ U+2012) read as '-'.
    var n = parseFloat(String(v).replace(/,/g, '').replace(/[\u2212\u2013\u2012]/g, '-').replace(/\s+/g, ''));
    return isFinite(n) ? n : 0;
  }

  // The value the math uses for a limited box: capped into [min, max]. Other boxes pass through.
  function capped(key, v) {
    var n = num(v), L = LIMITS[key];
    if (!L) return n;
    return Math.min(L.max, Math.max(L.min, n));
  }
  // 'max' / 'min' when the typed value is past a limit, else null.
  function limitState(key, v) {
    var L = LIMITS[key], n = num(v);
    if (!L) return null;
    if (n > L.max) return 'max';
    if (n < L.min) return 'min';
    return null;
  }

  // Moment/1000 exactly as the sheet: (J x I / 1000)
  function mom(weight, arm) { return arm * weight / 1000; }

  function interp(xs, ys, x) {
    for (var i = 0; i < xs.length - 1; i++) {
      if (x >= xs[i] && x <= xs[i + 1]) {
        var t = (x - xs[i]) / (xs[i + 1] - xs[i]);
        return ys[i] + t * (ys[i + 1] - ys[i]);
      }
    }
    return null;
  }

  // Moment at which a non-decreasing weight line first (or last) reaches weight w.
  function momentAtWeight(ys, w, last) {
    var hit = null;
    for (var i = 0; i < ys.length - 1; i++) {
      var y0 = ys[i], y1 = ys[i + 1];
      if (w >= Math.min(y0, y1) && w <= Math.max(y0, y1)) {
        var m;
        if (y1 === y0) m = last ? ENV_MOMENT[i + 1] : ENV_MOMENT[i];
        else m = ENV_MOMENT[i] + (w - y0) / (y1 - y0) * (ENV_MOMENT[i + 1] - ENV_MOMENT[i]);
        if (!last) return m;
        hit = m;
      }
    }
    return hit;
  }

  // The sheet's chart marker: D column puts the total weight in the row whose 2-unit moment bucket holds K18.
  function chartBucket(totalMoment) {
    for (var i = 0; i < ENV_MOMENT.length - 1; i++) {
      if (totalMoment >= ENV_MOMENT[i] && totalMoment < ENV_MOMENT[i + 1]) return ENV_MOMENT[i];
    }
    return null;
  }

  function compute(inputs, settings) {
    inputs = inputs || {}; settings = settings || {};
    var rows = [];
    var ew = num(settings.emptyWeight), ea = num(settings.emptyArm), em = num(settings.emptyMoment);
    rows.push({ key: 'empty', label: 'Licensed Empty Weight', qty: null, weight: ew, arm: ea, moment: em });
    var oilQt = capped('oilQt', inputs.oilQt), fuelGal = capped('fuelGal', inputs.fuelGal);
    var oilW = oilQt * OIL_LB_PER_QT, fuelW = fuelGal * FUEL_LB_PER_GAL;
    rows.push({ key: 'oil', label: 'Oil', qty: oilQt, unit: 'qt', weight: oilW, arm: ARMS.oil, moment: mom(oilW, ARMS.oil) });
    rows.push({ key: 'fuel', label: 'Fuel', qty: fuelGal, unit: 'gal', weight: fuelW, arm: ARMS.fuel, moment: mom(fuelW, ARMS.fuel) });
    var f = num(inputs.front), r = num(inputs.rear), b = num(inputs.baggage), c = num(inputs.cargo);
    rows.push({ key: 'front', label: 'Pilot and Co-Pilot', qty: null, weight: f, arm: ARMS.front, moment: mom(f, ARMS.front) });
    rows.push({ key: 'rear', label: 'Rear Seat Passengers', qty: null, weight: r, arm: ARMS.rear, moment: mom(r, ARMS.rear) });
    rows.push({ key: 'baggage', label: 'Baggage', qty: null, weight: b, arm: ARMS.baggage, moment: mom(b, ARMS.baggage) });
    rows.push({ key: 'cargo', label: 'Cargo Area', qty: null, weight: c, arm: ARMS.cargo, moment: mom(c, ARMS.cargo) });

    // I18 = SUM(I4:I16), K18 = SUM(K4:K16) — summed top to bottom like the sheet.
    var totalWeight = 0, totalMoment = 0;
    rows.forEach(function (row) { totalWeight += row.weight; totalMoment += row.moment; });
    var remaining = (totalWeight - MAX_GROSS) * (-1.0);
    var cg = totalWeight > 0 ? totalMoment * 1000 / totalWeight : null;

    var upper = interp(ENV_MOMENT, ENV_UPPER, totalMoment);
    var lower = interp(ENV_MOMENT, ENV_LOWER, totalMoment);
    var inEnvelope = upper !== null && lower !== null && totalWeight <= upper + 1e-9 && totalWeight >= lower - 1e-9;

    var fwdM = momentAtWeight(ENV_UPPER, totalWeight, false);
    var aftM = momentAtWeight(ENV_LOWER, totalWeight, true);
    var cgFwd = fwdM !== null && totalWeight > 0 ? fwdM * 1000 / totalWeight : null;
    var cgAft = aftM !== null && totalWeight > 0 ? aftM * 1000 / totalWeight : null;

    var problems = [];
    if (totalWeight > MAX_GROSS) problems.push('Over gross weight by ' + (totalWeight - MAX_GROSS).toFixed(1) + ' lb');
    if (b > MAX_BAGGAGE) problems.push('Baggage over ' + MAX_BAGGAGE + ' lb max');
    if (c > MAX_CARGO) problems.push('Cargo area over ' + MAX_CARGO + ' lb max');
    // Out of the CG envelope: always say which way (Dan, Oct 27, 2026, 9:23 AM).
    // For a given moment, weight above the upper line = CG forward of limit; below the lower line = CG aft of limit.
    // Past gross weight the limits at 2,200 lb are used; off the chart's moment range, below = forward, above = aft.
    var cgDir = null, limCg = null;
    if (!inEnvelope && totalWeight > 0) {
      var nM = ENV_MOMENT.length - 1;
      if (totalWeight > MAX_GROSS) {
        var fG = momentAtWeight(ENV_UPPER, MAX_GROSS, false) * 1000 / MAX_GROSS;
        var aG = momentAtWeight(ENV_LOWER, MAX_GROSS, true) * 1000 / MAX_GROSS;
        if (cg < fG) { cgDir = 'forward'; limCg = fG; } else if (cg > aG) { cgDir = 'aft'; limCg = aG; }
      } else if (totalMoment < ENV_MOMENT[0]) { cgDir = 'forward'; limCg = cgFwd; }
      else if (totalMoment > ENV_MOMENT[nM]) { cgDir = 'aft'; limCg = cgAft; }
      else if (upper !== null && totalWeight > upper) { cgDir = 'forward'; limCg = cgFwd; }
      else if (lower !== null && totalWeight < lower) { cgDir = 'aft'; limCg = cgAft; }
    }
    if (cgDir) {
      var lim = (limCg !== null && isFinite(limCg)) ? ' (CG ' + cg.toFixed(2) + ' in, ' + cgDir + ' limit ' + limCg.toFixed(2) + ' in)' : ' (CG ' + cg.toFixed(2) + ' in)';
      problems.push((cgDir === 'forward' ? 'CG too far FORWARD' : 'CG too far AFT') + lim);
    } else if (!inEnvelope && totalWeight <= MAX_GROSS) {
      problems.push('Outside the CG envelope');
    }

    return {
      rows: rows, totalWeight: totalWeight, totalMoment: totalMoment, remaining: remaining, cg: cg,
      envelope: { upper: upper, lower: lower, inside: inEnvelope, cgFwd: cgFwd, cgAft: cgAft, bucket: chartBucket(totalMoment) },
      checks: { gross: totalWeight <= MAX_GROSS, baggage: b <= MAX_BAGGAGE, cargo: c <= MAX_CARGO, envelope: inEnvelope },
      ok: problems.length === 0, problems: problems, cgDir: cgDir
    };
  }

  // True when saved settings exactly equal one of the earlier default sets (strings from storage are read as numbers).
  function isOldDefault(saved) {
    if (!saved) return false;
    return DEFAULTS.oldSettings.some(function (o) {
      return Object.keys(o).every(function (k) { return (k in saved) && num(saved[k]) === o[k]; });
    });
  }

  // Reset: seats, baggage and cargo to 0, fuel back to 37 gal; oil stays exactly what Dan last entered (Oct 19, 4:51 PM).
  function resetKeepOil(current) {
    var out = JSON.parse(JSON.stringify(DEFAULTS.resetInputs));
    if (current && ('oilQt' in current)) out.oilQt = current.oilQt;
    return out;
  }

  var API = {
    DEFAULTS: DEFAULTS, ARMS: ARMS, OIL_LB_PER_QT: OIL_LB_PER_QT, FUEL_LB_PER_GAL: FUEL_LB_PER_GAL,
    MAX_GROSS: MAX_GROSS, MAX_BAGGAGE: MAX_BAGGAGE, MAX_CARGO: MAX_CARGO, LIMITS: LIMITS, capped: capped, limitState: limitState,
    ENV_MOMENT: ENV_MOMENT, ENV_UPPER: ENV_UPPER, ENV_LOWER: ENV_LOWER,
    num: num, isOldDefault: isOldDefault, resetKeepOil: resetKeepOil, compute: compute, interp: interp, momentAtWeight: momentAtWeight, chartBucket: chartBucket
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WB = API;
})(this);
