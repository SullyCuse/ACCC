/* Compatibility rules for AudioChainHiFi's checker. Pure functions, no DOM,
   so the same file runs in the browser and under Node for testing.
   Every check returns { id, label, status, detail }; status is one of
   good | caution | poor | unknown. Missing inputs give "unknown", never a guess. */
(function (root) {
  var RANK = { unknown: 0, good: 1, caution: 2, poor: 3 };

  function fmt(n, d) { return Number(n).toFixed(d == null ? 0 : d); }
  function has(n) { return typeof n === 'number' && isFinite(n); }

  function overall(checks) {
    var known = checks.filter(function (c) { return c.status !== 'unknown'; });
    if (!known.length) return 'unknown';
    return known.reduce(function (w, c) { return RANK[c.status] > RANK[w] ? c.status : w; }, 'good');
  }

  /* ── Amplifier + speakers ─────────────────────────────────────── */
  function ampSpeaker(i) {
    var checks = [];
    var n = i.nominal;
    var P = null, powerNote = '';

    if (has(n)) {
      var wantsFour = n <= 5;
      if (wantsFour && has(i.power4)) P = i.power4;
      else if (wantsFour && has(i.power8)) { P = i.power8; powerNote = ' (4 Ω rating not available, so the 8 Ω figure is used, which is conservative)'; }
      else if (!wantsFour && has(i.power8)) P = i.power8;
    }

    // 1. Power vs the speaker maker's recommended range
    if (has(P) && has(i.recMin)) {
      var range = has(i.recMax) ? fmt(i.recMin) + '–' + fmt(i.recMax) + ' W' : fmt(i.recMin) + ' W or more';
      if (P < i.recMin * 0.5) {
        checks.push({ id: 'power', label: 'Power vs. recommendation', status: 'poor',
          detail: 'The amp makes ' + fmt(P) + ' W at this speaker\'s impedance' + powerNote + '; the speaker maker recommends ' + range + '. That is well under, so expect strain and clipping at higher volumes.' });
      } else if (P < i.recMin) {
        checks.push({ id: 'power', label: 'Power vs. recommendation', status: 'caution',
          detail: 'The amp makes ' + fmt(P) + ' W' + powerNote + '; the speaker maker recommends ' + range + '. It will work, but you have less headroom than they suggest.' });
      } else if (has(i.recMax) && P > i.recMax * 3) {
        checks.push({ id: 'power', label: 'Power vs. recommendation', status: 'caution',
          detail: 'The amp makes ' + fmt(P) + ' W' + powerNote + ', far above the recommended ' + range + '. That is fine at sensible volumes, but the speakers can be damaged if driven hard.' });
      } else {
        checks.push({ id: 'power', label: 'Power vs. recommendation', status: 'good',
          detail: 'The amp makes ' + fmt(P) + ' W' + powerNote + ', which suits the recommended ' + range + '.' });
      }
    } else {
      checks.push({ id: 'power', label: 'Power vs. recommendation', status: 'unknown',
        detail: 'Needs the amp\'s power at the speaker\'s impedance and the speaker maker\'s recommended amplifier power.' });
    }

    // 2. How loud it can play at the listening position
    if (has(P) && has(i.sensitivity) && has(n) && has(i.distance) && i.distance > 0) {
      var volts = Math.sqrt(P * n);
      var splOne = i.sensitivity + 20 * Math.log10(volts / 2.83) - 20 * Math.log10(i.distance);
      var peak = splOne + 3; // two speakers add about 3 dB
      var status = peak >= 100 ? 'good' : peak >= 92 ? 'caution' : 'poor';
      var verdict = peak >= 100 ? 'Plenty for loud, dynamic listening.'
        : peak >= 92 ? 'Fine for moderate listening; loud peaks may run out of headroom.'
        : 'Likely too quiet for dynamic music at this distance.';
      checks.push({ id: 'loudness', label: 'Loudness at ' + fmt(i.distance, 1) + ' m', status: status,
        detail: 'About ' + fmt(peak) + ' dB peak at the listening position with a stereo pair. ' + verdict +
          ' (Typical listening is around 80–85 dB average, and music peaks need 15–20 dB above that.)',
        spl: peak });
    } else {
      checks.push({ id: 'loudness', label: 'Loudness', status: 'unknown',
        detail: 'Needs the speaker\'s sensitivity, its impedance and the amp\'s power.' });
    }

    // 3. Is the speaker an easy electrical load?
    if (has(n)) {
      var hard = n <= 4.5 || (has(i.minimum) && i.minimum < 3);
      if (!hard) {
        checks.push({ id: 'load', label: 'Impedance load', status: 'good',
          detail: 'A ' + fmt(n, 1) + ' Ω speaker' + (has(i.minimum) ? ' (dips to ' + fmt(i.minimum, 1) + ' Ω)' : '') + ' is an easy load for almost any amplifier.' });
      } else if (has(i.power4)) {
        var doubles = !has(i.power8) || i.power4 >= i.power8 * 1.4;
        var very = has(i.minimum) && i.minimum < 2.5;
        if (doubles && !very) {
          checks.push({ id: 'load', label: 'Impedance load', status: 'good',
            detail: 'This speaker is a demanding load, but the amp\'s output rises from ' + (has(i.power8) ? fmt(i.power8) + ' W at 8 Ω to ' : '') + fmt(i.power4) + ' W at 4 Ω, which suggests it can supply the current.' });
        } else if (very) {
          checks.push({ id: 'load', label: 'Impedance load', status: 'caution',
            detail: 'The speaker dips to ' + fmt(i.minimum, 1) + ' Ω, which is a very demanding load. Only a high-current amplifier is a safe match.' });
        } else {
          checks.push({ id: 'load', label: 'Impedance load', status: 'caution',
            detail: 'This speaker is a demanding load, and the amp\'s 4 Ω output (' + fmt(i.power4) + ' W) barely rises over its 8 Ω output (' + fmt(i.power8) + ' W). That points to limited current, so it may sound strained at volume.' });
        }
      } else {
        checks.push({ id: 'load', label: 'Impedance load', status: 'caution',
          detail: 'This speaker is a demanding load (' + fmt(n, 1) + ' Ω' + (has(i.minimum) ? ', dips to ' + fmt(i.minimum, 1) + ' Ω' : '') + '), and no 4 Ω rating was found for the amp. Check the manufacturer confirms it is stable into 4 Ω.' });
      }
    } else {
      checks.push({ id: 'load', label: 'Impedance load', status: 'unknown', detail: 'Needs the speaker\'s nominal impedance.' });
    }

    return { checks: checks, overall: overall(checks) };
  }

  /* ── Cartridge + phono stage ──────────────────────────────────── */
  function nearest(list, target) {
    return list.reduce(function (best, g) { return best == null || Math.abs(g - target) < Math.abs(best - target) ? g : best; }, null);
  }

  function cartridgePhono(i) {
    var checks = [];
    var s = i.stage || {};
    var mm = i.cartType !== 'MC';
    var target = i.targetMv || 200;

    // 1. Gain
    if (has(i.outputMv) && i.outputMv > 0) {
      var need = 20 * Math.log10(target / i.outputMv);
      var gains = mm ? (s.mmGain || []) : (s.mcGain && s.mcGain.length ? s.mcGain : (s.hasMC ? [] : (s.mmGain || [])));
      var usingMmForMc = !mm && !(s.mcGain && s.mcGain.length) && !s.hasMC;
      if (!mm && s.hasMC === false && i.outputMv < 1) {
        checks.push({ id: 'gain', label: 'Gain', status: 'poor',
          detail: 'A ' + fmt(i.outputMv, 2) + ' mV moving-coil cartridge needs about ' + fmt(need) + ' dB, and this phono stage has no MC input. You would need a step-up transformer or a different phono stage.' });
      } else if (gains.length) {
        var best = nearest(gains, need);
        var diff = best - need;
        var st = (diff >= -6 && diff <= 8) ? 'good' : (diff >= -10 && diff <= 14) ? 'caution' : 'poor';
        var msg = 'The cartridge needs about ' + fmt(need) + ' dB; the closest setting on the phono stage is ' + fmt(best) + ' dB. ';
        msg += st === 'good' ? 'That is a good match.'
          : diff < 0 ? 'That is on the low side, so output may be quiet or noisy.'
          : 'That is on the high side, so you may need to keep the volume low and there is some risk of overload.';
        if (usingMmForMc) msg += ' (Using the MM gain, since no MC gain was found.)';
        checks.push({ id: 'gain', label: 'Gain', status: st, detail: msg });
      } else {
        checks.push({ id: 'gain', label: 'Gain', status: 'unknown',
          detail: 'The cartridge needs about ' + fmt(need) + ' dB. Enter the phono stage\'s ' + (mm ? 'MM' : 'MC') + ' gain to compare.' });
      }
    } else {
      checks.push({ id: 'gain', label: 'Gain', status: 'unknown', detail: 'Needs the cartridge\'s output voltage in mV.' });
    }

    // 2. Loading
    if (mm) {
      if (has(s.mmLoad)) {
        var ok = s.mmLoad >= 30000 && s.mmLoad <= 100000;
        checks.push({ id: 'load', label: 'Input loading', status: ok ? 'good' : 'caution',
          detail: ok ? 'The phono stage loads the cartridge at ' + fmt(s.mmLoad / 1000) + ' kΩ, in line with the standard 47 kΩ for moving-magnet cartridges.'
            : 'The phono stage loads the cartridge at ' + fmt(s.mmLoad) + ' Ω; moving-magnet cartridges are designed for about 47 kΩ and may sound off at other values.' });
      } else {
        checks.push({ id: 'load', label: 'Input loading', status: 'unknown', detail: 'Enter the phono stage\'s MM input impedance (usually 47 kΩ).' });
      }
    } else if (has(s.mcLoadMax)) {
      var want = has(i.loadOhms) ? i.loadOhms : (has(i.internalOhms) ? i.internalOhms * 10 : null);
      var adjustable = has(s.mcLoadMin) && s.mcLoadMin < s.mcLoadMax;
      if (want == null) {
        checks.push({ id: 'load', label: 'Input loading', status: 'unknown', detail: 'Enter the cartridge\'s recommended load or internal impedance.' });
      } else if (s.mcLoadMax >= want) {
        checks.push({ id: 'load', label: 'Input loading', status: 'good',
          detail: 'The cartridge wants roughly ' + fmt(want) + ' Ω or more' + (has(i.loadOhms) ? '' : ' (10× its internal impedance)') + ', and the phono stage ' + (adjustable ? 'can be set from ' + fmt(s.mcLoadMin) + ' to ' + fmt(s.mcLoadMax) + ' Ω.' : 'loads at ' + fmt(s.mcLoadMax) + ' Ω.') });
      } else {
        checks.push({ id: 'load', label: 'Input loading', status: 'caution',
          detail: 'The cartridge wants roughly ' + fmt(want) + ' Ω or more, but the phono stage loads at no more than ' + fmt(s.mcLoadMax) + ' Ω. The sound may be duller than intended.' });
      }
    } else {
      checks.push({ id: 'load', label: 'Input loading', status: 'unknown', detail: 'Enter the phono stage\'s MC input impedance.' });
    }

    return { checks: checks, overall: overall(checks) };
  }

  var api = { ampSpeaker: ampSpeaker, cartridgePhono: cartridgePhono };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CompatRules = api;
})(this);
