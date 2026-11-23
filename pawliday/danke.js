// danke.js - zeigt je nach ?status=... den passenden Text. Der Wert aus der Adresse wird nie als HTML eingefügt,
// sondern nur als Schlüssel für feste Texte benutzt.
'use strict';

(function () {
  var TEXTE = {
    gesendet: {
      titel: 'Fast geschafft: bitte bestätige deine E-Mail-Adresse',
      absaetze: [
        'Wir haben dir eine E-Mail geschickt (Absender apps@bertramplischke.de). Klicke darin auf den Bestätigungslink. Er gilt 48 Stunden.',
        'Die Mail kann ein paar Minuten brauchen. Schau bitte auch im Spam-Ordner nach.',
        'Nach deiner Bestätigung prüfen wir den Eintrag und melden uns per E-Mail. Einen Anspruch auf Aufnahme gibt es nicht.'
      ]
    },
    bestaetigt: {
      titel: 'Danke, wir prüfen deinen Eintrag',
      absaetze: [
        'Deine E-Mail-Adresse ist bestätigt. Wir prüfen die Angaben und melden uns per E-Mail, ob und wann die Unterkunft in der Pawliday-App erscheint.',
        'Du musst jetzt nichts weiter tun.'
      ]
    },
    abgelaufen: {
      titel: 'Der Bestätigungslink ist abgelaufen',
      absaetze: ['Der Link war 48 Stunden gültig. Bitte trage deine Unterkunft noch einmal ein, dann bekommst du einen neuen Link.'],
      link: ['eintragen.html', 'Unterkunft noch einmal eintragen']
    },
    ungueltig: {
      titel: 'Der Bestätigungslink ist ungültig',
      absaetze: ['Dieser Link passt zu keinem Eintrag (vielleicht wurde er unvollständig kopiert oder der Eintrag ist schon gelöscht). Bitte trage deine Unterkunft noch einmal ein oder schreib uns an apps@bertramplischke.de.'],
      link: ['eintragen.html', 'Unterkunft noch einmal eintragen']
    },
    fehler: {
      titel: 'Das hat leider nicht geklappt',
      absaetze: ['Beim Bestätigen ist ein Fehler aufgetreten. Bitte öffne den Link in der E-Mail später noch einmal oder schreib uns an apps@bertramplischke.de.']
    }
  };

  var status = new URLSearchParams(window.location.search).get('status');
  var t = Object.prototype.hasOwnProperty.call(TEXTE, status) ? TEXTE[status] : null;
  if (!t) return;

  document.getElementById('titel').textContent = t.titel;
  document.title = t.titel + ' – Pawliday';
  var box = document.getElementById('text');
  box.textContent = '';
  t.absaetze.forEach(function (a, i) {
    var p = document.createElement('p');
    if (i === t.absaetze.length - 1) p.style.marginBottom = '0';
    if (i === 0) p.style.marginTop = '0';
    p.textContent = a;
    box.appendChild(p);
  });
  if (t.link) {
    var weiter = document.getElementById('weiter');
    weiter.textContent = '';
    var a = document.createElement('a');
    a.href = t.link[0];
    a.textContent = t.link[1];
    weiter.appendChild(a);
  }
})();
