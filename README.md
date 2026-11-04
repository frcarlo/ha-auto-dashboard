# HA Auto Dashboard

Lovelace-Dashboard-Strategy, die das Dashboard aus Areas, Floors, Devices und Entities erzeugt. Idee wie bei Dwains Dashboard, aber ohne Editor, Blueprints und Zusatzkarten. Die Optik kommt aus HArmony: Slate-Palette, Indigo-Akzent, Amber-Glow bei Licht, runde Status-Buttons.

Ein ES-Modul (~63 KB, ~19 KB gzip), einzige Abhängigkeit ist Lit. Keine anderen Custom Cards nötig.

## Was erzeugt wird

- **Zuhause**: Begrüßung, Uhrzeit, Wetter, Status-Chips (Licht an, offen, unverriegelt, heizt, spielt, Batterie < 20 %, nicht erreichbar), darunter eine Raumkarte pro Area, gruppiert nach Etage.
- **Raumseiten** (`area-<area_id>`, Subview): Licht, Klima, Rollos, Medien, Schalter, Sicherheit, Sensoren, Szenen.
- **Domain-Seiten**: Licht (mit „Alle aus“), Klima, Rollos (mit „Alle zu“), Sicherheit. Nach Raum gruppiert, nur wenn es passende Entities gibt.
- **Navigation**: schwebende Leiste unten auf allen Geräten. Licht, Klima, Rollos, Sicherheit und die Räume sind Unteransichten, deshalb blendet HA seine eigene Tab-Leiste aus.

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

Alle optional:

```yaml
strategy:
  type: custom:auto-dashboard
  title: Zuhause
  theme: auto              # auto | dark | light, auto folgt dem HA-Dunkelmodus
  glass: false             # Milchglas-Karten (auf Touch-Geräten ohne Blur)
  hide_areas: [abstellraum]
  area_order: [wohnzimmer, kueche]   # sonst alphabetisch je Etage
  hide_domains: [fan, scene]
```

Einzelne Entities blendet man mit dem Label `ad_hide` aus. Versteckte Entities und Diagnose-/Konfigurations-Entities erscheinen ohnehin nicht. Die Area eines Entities ist seine eigene oder die seines Geräts.

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
