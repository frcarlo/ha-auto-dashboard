# HA Auto Dashboard

Lovelace-Dashboard-Strategy, die das Dashboard aus Areas, Floors, Devices und Entities erzeugt. Idee wie bei Dwains Dashboard, aber ohne Blueprints, Wandtablet-Modus und Zusatzkarten. Die Optik kommt aus HArmony: Slate-Palette, Indigo-Akzent, Amber-Glow bei Licht, runde Status-Buttons.

Ein ES-Modul (~100 KB, ~29 KB gzip), einzige Abhängigkeit ist Lit. Keine anderen Custom Cards nötig.

## Was erzeugt wird

- **Zuhause**: Begrüßung, Uhrzeit, Wetter, Status-Chips (Licht an, offen, unverriegelt, heizt, spielt, Batterie < 20 %, nicht erreichbar; ein Tipp klappt die Liste auf), eine Zeile mit Szenen und Skripten, Favoriten, darunter eine Raumkarte pro Area, gruppiert nach Etage.
- **Raumseiten** (`area-<area_id>`, Subview): oben Temperatur, Luftfeuchte und, wenn der Raum genau ein Thermostat hat, Ist- und Solltemperatur mit −/+. Daneben Schnellkacheln „Licht 2 von 5 an“, „Schalter“ und „Rollos“, die alles im Raum auf einmal schalten. Darunter die Favoriten des Raums und die Gruppen Licht, Klima, Rollos, Medien, Schalter, Sicherheit, Sensoren, Szenen. Gruppen mit mehreren Lichtern, Schaltern, Rollos oder Schlössern haben einen Sammelschalter in der Überschrift.
- **Domain-Seiten**: Licht (mit „Alle aus“), Klima, Rollos (mit „Alle zu“), Sicherheit. Nach Raum gruppiert, nur wenn es passende Entities gibt. Jede Raum-Überschrift führt zur Raumseite und hat einen Schalter mit „2/5“, bei Rollos auf/zu, bei Schlössern verriegeln/entriegeln. Entriegeln fragt immer erst nach.
- **Navigation**: schwebende Leiste unten auf allen Geräten. Licht, Klima, Rollos, Sicherheit und die Räume sind Unteransichten, deshalb blendet HA seine eigene Tab-Leiste aus.

Temperatur und Luftfeuchte eines Raums kommen aus den Sensoren, die in HA beim Bereich eingetragen sind (Einstellungen → Bereiche → Bereich öffnen). Ohne diese Angabe nimmt das Dashboard den ersten passenden Sensor im Raum.

Mehrere Tipps auf −/+ am Thermostat werden gesammelt und nach einer kurzen Pause als ein Befehl geschickt.

Bedienung: Raumkarte antippen öffnet die Raumseite, Doppeltipp schaltet alle Lichter im Raum, ein Tipp auf einen Status-Kreis öffnet den More-Info-Dialog. Kacheln: Tippen schaltet Licht, Schalter und Szenen, alles andere öffnet More-Info. Lange drücken öffnet immer More-Info.

## Installation

Voraussetzung: Home Assistant 2026.5 oder neuer.

### Über HACS (empfohlen)

1. HACS öffnen → Menü oben rechts → **Benutzerdefinierte Repositories**.
2. `https://github.com/frcarlo/ha-auto-dashboard` eintragen, Typ **Dashboard**, hinzufügen.
3. **Auto Dashboard** suchen und herunterladen. HACS trägt die Ressource selbst ein.
4. Browser neu laden (Strg+Shift+R) bzw. in der Companion-App den Frontend-Cache zurücksetzen.
5. **Einstellungen → Dashboards → Dashboard hinzufügen**. Unter **Community-Dashboards** steht jetzt **Auto Dashboard**. Auswählen, Namen vergeben, fertig.

Updates kommen danach wie bei jedem HACS-Plugin.

### Manuell

1. `auto-dashboard.js` aus dem [neuesten Release](https://github.com/frcarlo/ha-auto-dashboard/releases/latest) nach `/config/www/auto-dashboard/` kopieren.
2. **Einstellungen → Dashboards → Ressourcen** → `/local/auto-dashboard/auto-dashboard.js?v=0.1.0`, Typ **JavaScript-Modul**. Bei jedem Update die Versionsnummer hochzählen, sonst bleibt die alte Datei bis zu 31 Tage im Cache.
3. Browser neu laden, dann wie oben über **Dashboard hinzufügen** anlegen. Alternativ ein leeres Dashboard anlegen und in der Rohkonfiguration eintragen:
   ```yaml
   strategy:
     type: custom:auto-dashboard
   ```

### Theme (optional)

`themes/harmony.yaml` nach `/config/themes/` legen (`frontend: themes: !include_dir_merge_named themes`) und im Profil **HArmony** wählen. Dann passen Hintergrund, Kopfzeile und Seitenleiste zu den Karten.

## Optionen

Am einfachsten über den Editor: Dashboard öffnen → Stift oben rechts → **Dashboard bearbeiten**. Dort lassen sich Darstellung, Startseite (Favoriten, Szenen), Räume und Nutzerregeln anklicken. Den Editor sehen nur Admins, weil nur sie Dashboards bearbeiten dürfen. Gespeichert wird dieselbe YAML-Konfiguration wie unten, ohne Standardwerte. Nutzerregeln aus dem Editor sind an die User-ID gebunden, eine Umbenennung bricht sie deshalb nicht.

Alle Optionen, alle optional:

```yaml
strategy:
  type: custom:auto-dashboard
  title: Zuhause
  theme: auto              # auto | dark | light, auto folgt dem HA-Dunkelmodus
  glass: false             # Milchglas-Karten (auf Touch-Geräten ohne Blur)
  nav_position: bottom     # bottom | top | left | right
  areas: [wohnzimmer]      # nur diese Räume
  floors: [obergeschoss]   # nur Räume auf diesen Etagen
  hide_areas: [abstellraum]
  area_order: [wohnzimmer, kueche]   # sonst alphabetisch je Etage
  hide_domains: [fan, scene]
  hide_labels: [technik]   # Label-IDs, siehe unten
  favorites: [light.flur, lock.haustuer]       # Startseite und oben im jeweiligen Raum
  scenes: [scene.kino, script.gute_nacht]      # Zeile auf der Startseite
```

**Szenen und Skripte:** Ohne `scenes` zeigt die Startseite alle sichtbaren Szenen, alphabetisch. Skripte erscheinen nur, wenn sie in `scenes` stehen. Mit `hide_domains: [scene]` verschwindet die Zeile.

**Navigationsleiste:** `left` und `right` sind eine senkrechte Leiste am Rand, ab 1024 px Breite. Der Inhalt rückt dafür ein. Auf schmaleren Bildschirmen sitzt die Leiste unten. `top` setzt sie unter die HA-Kopfzeile.

**Nur ein Raum oder eine Etage:** `areas` und `floors` beschränken das ganze Dashboard, also Startseite, Status-Chips, Übersichten und Raumseiten. Beide zusammen ergeben die Schnittmenge. Mit genau einem Raum zeigt die Startseite gleich dessen Inhalt, praktisch für ein Wandtablet. Die IDs stehen unter Einstellungen → Bereiche, Etagen & Zonen in der URL des Bereichs bzw. der Etage.

### Nutzer

Pro HA-Nutzer lässt sich festlegen, was er sieht und bedienen darf:

```yaml
strategy:
  type: custom:auto-dashboard
  users:
    leni:                          # Vorname, voller Name oder User-ID
      areas: [zimmer_leni, wohnzimmer]
      floors: [obergeschoss]
      hide_pages: [security]       # lights | climate | covers | security
      control_critical: false      # keine Schlösser, Alarmanlage, „Alle aus/zu“
    gast:
      read_only: true              # nur ansehen
    default:                       # alle übrigen Nicht-Admins
      control_critical: false
```

- Admins ohne eigenen Eintrag sehen und bedienen alles. Mit einem eigenen Eintrag gilt auch für sie die Regel.
- `areas` und `floors` gelten zusätzlich zu den Filtern des Dashboards.
- Was jemand nicht bedienen darf, erscheint ohne Schalter und Knöpfe. HAs Detail-Dialog öffnet sich dafür ebenfalls nicht, sonst ließe sich darüber schalten. Reine Anzeigen wie Sensoren öffnen weiter ihre Infos.

**Wichtig:** Das ist keine Sicherheitsfunktion. HA kennt keine Rechte pro Raum oder Gerät. Wer angemeldet ist, kann über andere Dashboards, die Einstellungen oder die API weiterhin alles schalten. Die Regeln eignen sich für Kinder-Tablets, Gäste und Wandpanels, nicht zum Schutz gegen jemanden, der es darauf anlegt. Wer nur dieses Dashboard sehen soll, bekommt in HA keine Admin-Rechte, und die anderen Dashboards werden über „Nur für Admins sichtbar“ ausgeblendet.

**Ausblenden per Label:** Entities mit dem Label `ad_hide` erscheinen nie. Mit `hide_labels` kommen eigene Labels dazu. Dabei zählt das Label am Entity, am Gerät und am Bereich: Ein Gerät mit dem Label verschwindet mit allen seinen Entities, ein Bereich mit allen Geräten darin. Die Label-ID steht unter Einstellungen → Bereiche, Labels & Zonen → Labels; im Editor wählt man die Labels einfach an.

Versteckte Entities und Diagnose-/Konfigurations-Entities erscheinen ohnehin nicht. Die Area eines Entities ist seine eigene oder die seines Geräts.

## Entwicklung

```bash
npx vite        # Testseite mit Mock-Daten: http://localhost:5173/dev/index.html
npm run dev     # Build im Watch-Modus
npm test        # Vitest für Modell, Darstellung und Strategy
npm run deploy  # Bundle nach HA_WWW_TARGET kopieren (Samba-Mount oder scp)
npm run push    # Bundle als Inline-Resource per WebSocket (HA_URL/HA_TOKEN in .env)
```

Die Testseite (`dev/`) rendert die generierten Views ungefähr so wie HAs Sections-View, mit Fake-States aus `dev/mock.ts`. Service-Aufrufe ändern die Fake-States, More-Info erscheint als Toast. `?theme=light` und `?glass` schalten die Optik um.

| Datei | Inhalt |
|---|---|
| `src/strategy.ts` | erzeugt Views und Sections |
| `src/model.ts` | Areas, Etagen, Gruppen, Status-Zähler (reine Funktionen) |
| `src/presentation.ts` | Icons, aktiv/inaktiv, Farben (Port aus HArmony) |
| `src/styles/tokens.ts` | Farben, Kartenform, Glas |
| `src/cards/*` | `ad-tile`, `ad-room-card`, `ad-status-bar`, `ad-header`, `ad-nav-bar` |

## Release

Ein GitHub-Release mit Tag `vX.Y.Z` veröffentlichen. Der Workflow `release.yml` setzt die Version, baut und hängt `auto-dashboard.js` an das Release. Von dort lädt HACS die Datei.
