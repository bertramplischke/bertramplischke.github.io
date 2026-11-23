// eintragen.js - Formular "Unterkunft eintragen" (Pawliday). Reines JavaScript, keine fremden Server außer dem
// eigenen Backend (Supabase, Frankfurt). Kein Schlüssel nötig: die Funktion gastgeber-anmelden ist ohne JWT-Prüfung
// bereitgestellt und schützt sich selbst (Herkunft, Prüfung, Bremse).
'use strict';

(function () {
  var FUNKTION_URL = 'https://lwuwzxxgmfrplvrmcttr.supabase.co/functions/v1/gastgeber-anmelden';
  var MAX_FOTOS = 5;
  var MAX_KANTE = 2000;
  var MAX_BYTES = 4.5 * 1024 * 1024; // knapp unter dem Server-Limit von 5 MB
  var ZEITLIMIT_MS = 120000;

  var formular = document.getElementById('formular');
  var fehlerbox = document.getElementById('fehlerbox');
  var statusBox = document.getElementById('status');
  var sendenKnopf = document.getElementById('senden');
  var fotoWahl = document.getElementById('foto-wahl');
  var fotoZaehler = document.getElementById('foto-zaehler');
  var vorschau = document.getElementById('vorschau');
  var fotos = []; // { blob, url }
  var sendet = false;

  // Feldbeschriftungen für die Fehlerliste (Name -> { id, text })
  var PFLICHT = [
    ['titel', 'titel', 'Name der Unterkunft'],
    ['unterkunftsart', 'unterkunftsart', 'Art'],
    ['land', 'land', 'Land'],
    ['ort', 'ort', 'Ort'],
    ['lat', 'lat', 'Breitengrad'],
    ['lng', 'lng', 'Längengrad'],
    ['max_personen', 'max_personen', 'Höchstens Personen'],
    ['max_hunde', 'max_hunde', 'Höchstens Hunde'],
    ['hundegebuehr', 'hundegebuehr', 'Hundegebühr'],
    ['website_url', 'website_url', 'Website der Unterkunft'],
    ['beschreibung', 'beschreibung', 'Kurzbeschreibung'],
    ['kontakt_name', 'kontakt_name', 'Dein Name'],
    ['kontakt_email', 'kontakt_email', 'Deine E-Mail-Adresse']
  ];
  var RADIOS = [
    ['garten_eingezaeunt', 'Eingezäunter Garten'],
    ['hunde_vor_ort', 'Hunde des Gastgebers auf dem Grundstück']
  ];
  var HAKEN = [
    ['datenschutz_ok', 'Bitte bestätige, dass du die Datenschutzerklärung gelesen hast.'],
    ['bedingungen_ok', 'Bitte akzeptiere die Bedingungen für Gastgeber.'],
    ['fotorechte_ok', 'Bitte bestätige die Rechte an Angaben und Fotos.']
  ];

  function el(id) { return document.getElementById(id); }

  // --- Zaunhöhe nur bei eingezäuntem Garten ---------------------------------------------
  function zaunUmschalten() {
    var ja = formular.querySelector('input[name="garten_eingezaeunt"][value="ja"]').checked;
    el('zaun-feld').hidden = !ja;
    if (!ja) el('zaunhoehe_cm').value = '';
  }
  Array.prototype.forEach.call(formular.querySelectorAll('input[name="garten_eingezaeunt"]'), function (r) {
    r.addEventListener('change', zaunUmschalten);
  });
  zaunUmschalten();

  // --- Zeichenzähler ------------------------------------------------------------------------
  var beschreibung = el('beschreibung');
  function zaehlen() {
    el('zaehler').textContent = beschreibung.value.length + ' von 600 Zeichen';
  }
  beschreibung.addEventListener('input', zaehlen);
  zaehlen();

  // --- Koordinaten: "54.4698, 9.0505" im ersten Feld wird aufgeteilt ---------------------------------
  var KOORD_PUNKT = /^\s*(-?\d+\.\d+)\s*[,;\s]\s*(-?\d+\.\d+)\s*$/;
  var KOORD_KOMMA = /^\s*(-?\d+,\d+)\s*[;\s]\s*(-?\d+,\d+)\s*$/;
  function koordinatenTeilen() {
    var lat = el('lat');
    var m = KOORD_PUNKT.exec(lat.value) || KOORD_KOMMA.exec(lat.value);
    if (m) {
      lat.value = m[1].replace(',', '.');
      el('lng').value = m[2].replace(',', '.');
    }
  }
  el('lat').addEventListener('change', koordinatenTeilen);
  el('lat').addEventListener('paste', function () { setTimeout(koordinatenTeilen, 0); });

  // --- Fotos ------------------------------------------------------------------------------------
  function anzeigeAktualisieren() {
    fotoZaehler.textContent = fotos.length + ' von ' + MAX_FOTOS + ' Fotos';
    vorschau.textContent = '';
    fotos.forEach(function (f, i) {
      var li = document.createElement('li');
      var img = document.createElement('img');
      img.src = f.url;
      img.alt = 'Foto ' + (i + 1);
      var knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.textContent = 'Foto ' + (i + 1) + ' entfernen';
      knopf.addEventListener('click', function () {
        URL.revokeObjectURL(f.url);
        fotos.splice(fotos.indexOf(f), 1);
        anzeigeAktualisieren();
      });
      li.appendChild(img);
      li.appendChild(knopf);
      vorschau.appendChild(li);
    });
    fotoWahl.disabled = fotos.length >= MAX_FOTOS;
  }

  function alsBlob(canvas, qualitaet) {
    return new Promise(function (ok) { canvas.toBlob(ok, 'image/jpeg', qualitaet); });
  }

  function bildLaden(datei) {
    if (window.createImageBitmap) {
      return window.createImageBitmap(datei, { imageOrientation: 'from-image' }).catch(function () {
        return bildElement(datei);
      });
    }
    return bildElement(datei);
  }

  function bildElement(datei) {
    return new Promise(function (ok, nein) {
      var url = URL.createObjectURL(datei);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); ok(img); };
      img.onerror = function () { URL.revokeObjectURL(url); nein(new Error('nicht lesbar')); };
      img.src = url;
    });
  }

  // Verkleinert auf höchstens 2000 Pixel Kantenlänge und kodiert neu als JPEG. Dabei gehen EXIF-Angaben
  // (Aufnahmeort, Kamera) verloren.
  function verkleinern(datei) {
    return bildLaden(datei).then(function (bild) {
      var b0 = bild.naturalWidth || bild.width;
      var h0 = bild.naturalHeight || bild.height;
      if (!b0 || !h0) throw new Error('leer');
      var faktor = Math.min(1, MAX_KANTE / Math.max(b0, h0));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(b0 * faktor));
      canvas.height = Math.max(1, Math.round(h0 * faktor));
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bild, 0, 0, canvas.width, canvas.height);
      if (bild.close) bild.close();
      var q = 0.86;
      function versuch() {
        return alsBlob(canvas, q).then(function (blob) {
          if (!blob) throw new Error('kodieren');
          if (blob.size > MAX_BYTES && q > 0.45) { q -= 0.1; return versuch(); }
          if (blob.size > MAX_BYTES) throw new Error('zu groß');
          return blob;
        });
      }
      return versuch();
    });
  }

  fotoWahl.addEventListener('change', function () {
    var dateien = Array.prototype.slice.call(fotoWahl.files || []);
    fotoWahl.value = '';
    if (dateien.length === 0) return;
    var frei = MAX_FOTOS - fotos.length;
    var meldung = '';
    if (dateien.length > frei) {
      meldung = 'Es passen höchstens ' + MAX_FOTOS + ' Fotos. Die übrigen wurden nicht übernommen. ';
      dateien = dateien.slice(0, frei);
    }
    var fertig = Promise.resolve();
    dateien.forEach(function (d) {
      fertig = fertig.then(function () {
        return verkleinern(d).then(function (blob) {
          fotos.push({ blob: blob, url: URL.createObjectURL(blob) });
          anzeigeAktualisieren();
        }, function () {
          meldung += '„' + d.name + '“ konnte nicht gelesen werden (bitte JPEG, PNG oder WebP). ';
        });
      });
    });
    fertig.then(function () {
      if (meldung) zeigeStatus(meldung.trim()); else verstecke(statusBox);
    });
  });
  anzeigeAktualisieren();

  // --- Meldungen ------------------------------------------------------------------------------------
  function verstecke(box) { box.hidden = true; box.textContent = ''; }
  function zeigeStatus(text) { statusBox.textContent = text; statusBox.hidden = false; }

  function zeigeFehler(liste) {
    fehlerbox.textContent = '';
    var p = document.createElement('p');
    p.style.margin = '0';
    p.textContent = liste.length === 1 ? 'Bitte korrigiere diese Angabe:' : 'Bitte korrigiere diese Angaben:';
    var ul = document.createElement('ul');
    liste.forEach(function (f) {
      var li = document.createElement('li');
      if (f.id && el(f.id)) {
        var a = document.createElement('a');
        a.href = '#' + f.id;
        a.textContent = f.text;
        a.addEventListener('click', function (e) { e.preventDefault(); el(f.id).focus(); });
        li.appendChild(a);
      } else {
        li.textContent = f.text;
      }
      ul.appendChild(li);
    });
    fehlerbox.appendChild(p);
    fehlerbox.appendChild(ul);
    fehlerbox.hidden = false;
    fehlerbox.focus();
    fehlerbox.scrollIntoView({ block: 'center' });
  }

  function markiere(ids) {
    Array.prototype.forEach.call(formular.querySelectorAll('[aria-invalid]'), function (n) { n.removeAttribute('aria-invalid'); });
    ids.forEach(function (id) { if (el(id)) el(id).setAttribute('aria-invalid', 'true'); });
  }

  // --- Prüfung im Browser (der Server prüft alles noch einmal) ----------------------------------------------
  function pruefen() {
    var fehler = [];
    PFLICHT.forEach(function (p) {
      var feld = el(p[1]);
      if (!feld.value.trim()) fehler.push({ id: p[1], text: p[2] + ': bitte ausfüllen.' });
    });
    RADIOS.forEach(function (r) {
      if (!formular.querySelector('input[name="' + r[0] + '"]:checked')) {
        var erstes = formular.querySelector('input[name="' + r[0] + '"]');
        fehler.push({ id: erstes.id || (erstes.id = 'r-' + r[0]), text: r[1] + ': bitte Ja oder Nein wählen.' });
      }
    });
    var url = el('website_url').value.trim();
    if (url && !/^https:\/\/[^\s/]+\.[^\s/]+/i.test(url)) {
      fehler.push({ id: 'website_url', text: 'Website: bitte mit https:// beginnen.' });
    }
    var b = beschreibung.value.trim().length;
    if (b > 0 && b < 20) fehler.push({ id: 'beschreibung', text: 'Kurzbeschreibung: mindestens 20 Zeichen.' });
    HAKEN.forEach(function (h) {
      if (!el(h[0]).checked) fehler.push({ id: h[0], text: h[1] });
    });
    return fehler;
  }

  // Zuordnung Serverfehler -> Feld
  function feldFuer(name) {
    if (name === 'fotos') return 'foto-wahl';
    if (name === 'garten_eingezaeunt' || name === 'hunde_vor_ort') {
      var r = formular.querySelector('input[name="' + name + '"]');
      return r ? (r.id || (r.id = 'r-' + name)) : null;
    }
    return el(name) ? name : null;
  }

  // --- Absenden --------------------------------------------------------------------------------------------
  formular.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sendet) return;
    verstecke(fehlerbox);
    verstecke(statusBox);

    var fehler = pruefen();
    markiere(fehler.map(function (f) { return f.id; }));
    if (fehler.length > 0) { zeigeFehler(fehler); return; }

    var fd = new FormData(formular);
    // Alle Textfelder zusätzlich als ein JSON-Teil mit ausdrücklich UTF-8: Der Server liest bevorzugt diesen Teil,
    // damit Umlaute und Sonderzeichen unabhängig von der Dekodierung einzelner Formularfelder ankommen.
    var daten = {};
    fd.forEach(function (wert, name) {
      if (typeof wert === 'string' && !Object.prototype.hasOwnProperty.call(daten, name)) daten[name] = wert;
    });
    fd.append('daten', new Blob([JSON.stringify(daten)], { type: 'application/json; charset=utf-8' }), 'daten.json');
    fotos.forEach(function (f, i) { fd.append('fotos', f.blob, 'foto' + (i + 1) + '.jpg'); });

    sendet = true;
    sendenKnopf.disabled = true;
    zeigeStatus('Wird gesendet … bitte warten' + (fotos.length ? ' (Fotos brauchen etwas länger)' : '') + '.');

    var abbruch = new AbortController();
    var timer = setTimeout(function () { abbruch.abort(); }, ZEITLIMIT_MS);

    fetch(FUNKTION_URL, {
      method: 'POST',
      body: fd,
      signal: abbruch.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    }).then(function (antwort) {
      return antwort.json().catch(function () { return {}; }).then(function (daten) {
        return { status: antwort.status, daten: daten };
      });
    }).then(function (r) {
      clearTimeout(timer);
      if (r.status === 200 && r.daten && r.daten.ok) {
        window.location.href = 'danke.html?status=gesendet';
        return;
      }
      sendet = false;
      sendenKnopf.disabled = false;
      verstecke(statusBox);
      if (r.status === 422 && r.daten && typeof r.daten.fehler === 'object') {
        var liste = [];
        Object.keys(r.daten.fehler).forEach(function (k) {
          liste.push({ id: feldFuer(k), text: String(r.daten.fehler[k]) });
        });
        markiere(liste.map(function (f) { return f.id; }).filter(Boolean));
        zeigeFehler(liste);
      } else if (r.status === 429) {
        zeigeFehler([{ id: null, text: 'Es gab zu viele Anmeldungen. Bitte versuche es später noch einmal (mit derselben E-Mail-Adresse höchstens dreimal am Tag).' }]);
      } else if (r.status === 413) {
        zeigeFehler([{ id: 'foto-wahl', text: 'Die Fotos sind zusammen zu groß. Bitte nimm weniger oder kleinere Fotos.' }]);
      } else if (r.status === 502) {
        zeigeFehler([{ id: null, text: 'Deine Angaben sind gespeichert, aber die Bestätigungsmail konnte nicht gesendet werden. Bitte schreib uns an apps@bertramplischke.de.' }]);
      } else {
        zeigeFehler([{ id: null, text: (r.daten && typeof r.daten.fehler === 'string' ? r.daten.fehler + ' ' : '') + 'Das hat leider nicht geklappt. Bitte versuche es später noch einmal oder schreib uns an apps@bertramplischke.de.' }]);
      }
    }).catch(function () {
      clearTimeout(timer);
      sendet = false;
      sendenKnopf.disabled = false;
      verstecke(statusBox);
      zeigeFehler([{ id: null, text: 'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung und versuche es noch einmal.' }]);
    });
  });
})();
