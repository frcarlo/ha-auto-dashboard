<img src="https://raw.githubusercontent.com/frcarlo/ha-auto-dashboard/main/assets/icon.png" width="96" height="96" alt="">

# HA Auto Dashboard

Lovelace-Dashboard-Strategy, die das Dashboard aus Areas, Floors, Devices und Entities erzeugt. Idee wie bei Dwains Dashboard, aber ohne Blueprints, Wandtablet-Modus und Zusatzkarten. Die Optik kommt aus HArmony: Slate-Palette, Indigo-Akzent, Amber-Glow bei Licht, runde Status-Buttons.

Ein ES-Modul (~140 KB, ~39 KB gzip), einzige Abhängigkeit ist Lit. Keine anderen Custom Cards nötig.

## Was erzeugt wird

- **Zuhause**: Begrüßung, Uhrzeit, Wetter, Personen (zu Hause oder unterwegs) und Alarmanlage, Status-Chips (Licht an, offen, unverriegelt, heizt, spielt, Batterie < 20 %, nicht erreichbar; ein Tipp klappt die Liste auf), Innen- und Außenklima und aktueller Stromverbrauch, „Läuft gerade“, eine Zeile mit Szenen und Skripten, Favoriten, darunter eine Raumkarte pro Area, gruppiert nach Etage. Ab etwa 720 px Breite (Tablet, Desktop) stehen das Wetter und Innen/Strom nebeneinander, ebenso „Läuft gerade“ und die Szenen, die Personen sitzen vorne in der Reihe der Status-Chips; so beginnen die Räume schon auf dem ersten Bildschirm. Auf dem Handy steht alles untereinander.
- **Raumseiten** (`area-<area_id>`, Subview): oben Temperatur, Luftfeuchte und, wenn der Raum genau ein Thermostat hat, Ist- und Solltemperatur mit −/+. Daneben Schnellkacheln „Licht 2 von 5 an“, „Steckdosen“ und je eine pro Rollo-Art, die alles im Raum auf einmal schalten. Darunter die Favoriten des Raums und die Gruppen Licht, Klima, Beschattung, Markisen, Fenster & Türen, Tore, Schlösser, Medien, Schalter, Auswahl, Bewegung & Anwesenheit, Sicherheit & Alarm, Sensoren, Szenen. Gruppen mit mehreren Lichtern, Steckdosen, Rollos oder Schlössern haben einen Sammelschalter in der Überschrift. Gemeinsam geschaltet werden nur Lichter, Ventilatoren und Schalter mit der Geräteklasse `outlet`; andere Schalter sind oft Geräteeinstellungen (Kindersicherung, Eco-Modus) und bleiben außen vor.
- **Domain-Seiten**: Licht (mit „Alle aus“), Klima, Rollos (mit „Alle zu“, Beschattung und Markisen; hat ein Raum beides, bekommt jede Art ihre eigene Überschrift mit Hoch/Runter bzw. Ausfahren/Einfahren), Sicherheit (Fenster, Türen, Tore, Schlösser, Bewegung, Rauch- und Wassermelder). Nach Raum gruppiert, nur wenn es passende Entities gibt. Jede Raum-Überschrift führt zur Raumseite und hat einen Schalter mit „2/5“, bei Rollos auf/zu, bei Schlössern verriegeln/entriegeln. Entriegeln fragt immer erst nach.
- **Kameras** (`cameras`, mit Eintrag in der Navigationsleiste): ein Standbild jeder Kamera, alle zehn Sekunden neu, darunter Name und letzte Erkennung („10:03 · Paket“, sonst „Ruhig“). Rechts daneben (auf schmalen Bildschirmen darunter) steht „Erkannt heute“: was die Kameras seit Mitternacht bemerkt haben, die neueste Erkennung groß. Die Erkennungen kommen aus den Sensoren der Kamera selbst (Person, Fahrzeug, Tier, Paket, Besucher/Klingel, Bewegung, etwa von Reolink). Bewegung direkt neben einer genaueren Erkennung zählt nicht extra, und wer eine Weile vor der Tür steht, zählt einmal. Ein Tipp auf eine Kamera oder eine Erkennung öffnet die Kamera groß und live, daneben ihre letzten Erkennungen, die Lichter am Gerät und im selben Raum zum Schalten und „Kamera öffnen“ für HAs eigenen Dialog. Unten wechseln Reiter zu den anderen Kameras. Eine Kamera mit mehreren Streams (Standard, Hochauflösung, Schnappschüsse) erscheint nur einmal, mit dem Standard-Stream. Die Kameras eines Raums stehen zusätzlich oben auf seiner Raumseite.
- **Musik** (`music`, mit Eintrag in der Navigationsleiste, nur mit Music Assistant): aufgebaut wie die Musikseite in HArmony. Links Start, Suche, Radio und Lautsprecher, darunter die Playlists der Bibliothek; auf dem Handy werden daraus Reiter. „Start“ zeigt die zuletzt gespielten Playlists als Schnellauswahl, darunter zuletzt gespielte Alben und Playlists, Lieblingskünstler, Lieblingstitel und Sender. Ein Tipp auf eine Playlist, ein Album oder einen Künstler öffnet die Titel; ein Tipp auf einen Titel spielt die Playlist ab dort, das Menü daneben spielt als Nächstes, hängt an die Warteschlange an oder startet ein Radio dazu. „Suche“ findet Titel, Künstler, Alben, Playlists und Sender bei allen Diensten von Music Assistant. „Lautsprecher“ zeigt jeden Player mit dem, was er spielt, und seiner Lautstärke; ein Tipp wählt ihn, „Dazu“ und „Trennen“ gruppieren ihn mit dem gewählten. Unten liegt die Leiste mit Cover, Zufall, Zurück, Play/Pause, Weiter, Wiederholen, Fortschritt zum Springen, der Warteschlange (was läuft, was danach kommt), „Woanders weiterspielen“ und der Lautstärke. Welcher Lautsprecher gewählt ist, merkt sich jedes Gerät; ohne Wahl ist es der, der gerade spielt. Ein Tipp auf das Cover in der Leiste (oder auf das Mikrofon daneben) öffnet den großen Player: das Cover groß, Titel, Künstler und Album, daneben der Liedtext, der beim Abspielen mitläuft. Die gesungene Zeile steht hell in der Mitte, ein Tipp auf eine Zeile springt dorthin; wer selbst scrollt, hat ein paar Sekunden Ruhe. Die Liedtexte kommen wie in HArmony von LRCLIB (lrclib.net), direkt aus dem Browser. Dafür gehen Titel, Künstler, Album und Länge dorthin, aber nur, solange der große Player offen ist. Ein weiterer Tipp aufs Cover führt zurück. Music Assistant legt für Cast-Displays und Fernseher zusätzlich eine Dashboard-Entität an, die nichts abspielen kann; sie erscheint weder unter Lautsprecher noch als Fernseher. Oben auf „Start“ wählt man das Spotify-Konto, wie in HArmony; jedes Gerät merkt sich die Wahl. Dann stehen dessen Playlists in der Schnellauswahl und links in der Bibliothek, darüber „Zuletzt gehört“, Künstler, Alben, Lieblingssongs und Top-Künstler, darunter, was aus Music Assistant kommt. Durchgeblättert wird über einen Sonos- oder Cast-Lautsprecher, denn HAs eigene Spotify-Player zeigen ihre Bibliothek nur, solange auf ihnen etwas läuft; ohne einen solchen Lautsprecher gibt es keine Kontowahl. Abgespielt wird auf dem gewählten Lautsprecher über Music Assistant, Spotify-Playlists Titel für Titel (bis 100), so laufen auch private Playlists der anderen Konten und Listen wie „Lieblingssongs“. Die Spotify-Konten selbst stehen unter Lautsprecher und lassen sich dort steuern. Alles läuft über die Dienste von Music Assistant in HA, ohne eigenen Server; Das Bearbeiten von Warteschlange und Playlists aus HArmony gibt es deshalb nicht. `hide_pages: [music]` blendet die Seite aus, für alle oder unter `users` für einzelne Nutzer; `hide_domains: [media_player]` nimmt mit der Seite auch alle Mediaplayer aus den Räumen.
- **Kalender** (`calendar`, mit Eintrag in der Navigationsleiste): alle Kalender als Monat, Woche oder Tag, oben umschaltbar, dazu Zurück, Heute und Weiter. Im Monat stehen die ersten Termine jedes Tages, ein Tipp auf den Tag öffnet ihn. Woche und Tag zeigen die Stunden wie ein Planer, mit einer Linie für jetzt. Monat und Stunden passen sich der Bildschirmhöhe an, damit alles ohne Scrollen sichtbar ist; die Stunden reichen von 7 bis 21 Uhr oder so weit, wie die Termine es verlangen; auf dem Handy wird die Woche zur Liste und der Monat zeigt Punkte. Jeder Kalender hat eine Farbe; die gewählte Ansicht merkt sich jedes Gerät. Ein Tipp auf einen Termin zeigt Zeit, Kalender, Ort und Beschreibung. Wo der Kalender es erlaubt, lassen sich Termine anlegen (das „+“ oben oder ein Tipp auf eine freie Stunde bzw. die Ganztägig-Zeile), bearbeiten und löschen; bei Serienterminen fragt die Karte, ob nur dieser oder auch alle folgenden gemeint sind. Was erlaubt ist, entscheidet die Integration: der lokale Kalender kann alles, Google anlegen und löschen, aber nicht bearbeiten, Feiertags- oder Abfallkalender aus dem Netz nichts. `calendar_edit: false` schaltet das ab, etwa für ein Wandtablet. Welche Kalender, legt nur `calendars` fest (im Editor unter Startseite › „Kalender“), sonst alle; `hide_domains: [calendar]` blendet die Seite aus.
- **Listen** (`lists`, mit Eintrag in der Navigationsleiste): die To-do-Listen, etwa die Einkaufsliste, mit HAs eigener Karte; Einträge lassen sich abhaken, hinzufügen und umbenennen. Mehrere Listen stehen auf Tablet und Desktop nebeneinander. Ein Tipp auf den Namen klappt eine Liste zu, oben bleibt dann nur, wie viel noch offen ist; das merkt sich jedes Gerät. Admins legen mit „Neue Liste“ eine Liste an (über HAs Integration „Lokale To-do-Liste“) und löschen solche Listen mit dem Papierkorb, nach einer Rückfrage. Die Einkaufsliste der Integration „Einkaufsliste“ lässt sich nicht einzeln löschen. Listen gehören dem ganzen Haushalt, deshalb erscheinen sie auch auf Dashboards, die auf einzelne Räume beschränkt sind. Ohne `todo_lists` stehen alle Listen da, auch neu angelegte; mit `todo_lists` nur die gewählten, dann gibt es auch kein „Neue Liste“. `hide_domains: [todo]` blendet die Seite aus.
- **Energie** (`energy`, nur mit Leistungssensoren): das ganze Haus mit dem Raum, der am meisten verbraucht, und dessen drei größten Verbrauchern. Darunter jeder Raum mit seinen Leistungssensoren und ihrem Anteil, darunter ein Verlauf der letzten 24 Stunden (HAs Verlaufsgraph). Erreichbar über die Kachel „Strom“ auf der Startseite.
- **Wartung** (`maintenance`): alle Batterien, schwächste zuerst, nicht erreichbare Geräte und, nur für Admins, ausstehende Updates. Erreichbar über die Chips „Batterie“ und „Nicht erreichbar“ → „Alle anzeigen“.
- **Zifferblatt** (`face`, für Wandtablets): Wenn eine Weile niemand den Bildschirm berührt (Standard zwei Minuten), legt sich eine ruhige Vollbildansicht über die Seite, gut lesbar aus der Entfernung. Ein Tipp blendet sie aus, die Seite darunter bleibt, wie sie war. Vier Stile: `clock` (große Uhr, Datum, Wetter, nächster Termin heute oder morgen), `analog` (Zeigeruhr mit denselben Angaben), `photo` (das Hintergrundbild des Dashboards mit Uhrzeit, Wetter und nächstem Termin; ohne Bild die Uhr) und `calendar` (Uhr links, die nächsten Termine der Woche rechts). Unten steht klein, was gerade läuft: Spülmaschine, Waschmaschine oder Trockner mit der Uhrzeit, zu der sie fertig sind, und einem Fortschrittsstrich, danach „Fertig“, dazu spielende Musik. Damit sich nichts ins Display einbrennt, wandert der Inhalt jede Minute ein paar Pixel. Am besten nur für den Nutzer des Tablets einschalten (`users: … face:`); `after: 0` zeigt das Zifferblatt gleich beim Öffnen, etwa auf einem Display, das sonst nur die Uhr zeigen soll; nach einer Berührung wartet es dann eine Minute. Im Bearbeitungsmodus von HA erscheint es nie.
- **Navigation**: schwebende Leiste unten auf allen Geräten. Licht, Klima, Rollos, Sicherheit, Kameras, Musik, Kalender, Listen und die Räume sind Unteransichten, deshalb blendet HA seine eigene Tab-Leiste aus.

**Rollos nach Zweck:** Rollläden, Jalousien und Rollos ohne Geräteklasse zählen als Beschattung. Markisen (Klasse `awning`, oder „Markise“/„Awning“ im Namen, weil z. B. Shelly sie als Rollladen anlegt) sind eine eigene Gruppe: Ihr Stoff fährt in der Kachel aus, die Knöpfe heißen Ausfahren und Einfahren. Rollos mit der Klasse `window` oder `door` gehören zu Fenster & Türen, `garage` und `gate` zu Tore. Jede Art hat ihre eigene Schnellkachel und ihren eigenen Sammelschalter, „Alle zu“ für die Beschattung fährt also nie das Garagentor. Die Geräteklasse lässt sich in HA in den Einstellungen des Entities unter „Anzeigen als“ ändern.

**Haushaltsgeräte:** Spülmaschine, Waschmaschine, Trockner und Ofen findet das Dashboard an ihrem Betriebszustand, einem Sensor wie `sensor.geschirrspuler_betriebszustand` (Home Connect) oder `sensor.washing_machine_state` (WashData). Was das Gerät sonst noch meldet, nimmt die Karte mit: Fortschritt, Endzeit oder Restzeit, das laufende Programm, Tür und Hinweise wie „Salz fast leer“. Während ein Programm läuft, füllt sich ein Ring mit der Restzeit in der Mitte, darunter stehen Start und Ende. „Fertig“ ist grün und bleibt stehen, bis das Gerät wieder „Bereit“ meldet, bei Home Connect also bis jemand die Tür öffnet. Jedes Gerät steht auf seiner Raumseite unter „Geräte“, seine einzelnen Sensoren erscheinen dort nicht noch einmal. Auf der Startseite erscheint es nur, solange es läuft, fertig ist oder etwas braucht. Geräte ohne eigenen Betriebszustand, etwa ein Trockner an einer smarten Steckdose, kommen über `appliances` dazu: Als Zustand reicht eine Leistung (ab 5 W läuft es), ein Schalter oder ein eigener Status-Sensor. `hide_domains: [appliance]` schaltet die Karten ab.

**Fernseher:** Ein Mediaplayer mit der Klasse `tv` bekommt auf seiner Raumseite eine Karte wie eine Fernbedienung: Ein/Aus, die laufende App, ein rundes Steuerkreuz mit OK, Lauter, Leiser und Stumm, Zurück und Start. Das Steuerkreuz geht über die Remote-Entity desselben Geräts (Android TV Remote oder Android Debug Bridge). Bringen beide Integrationen denselben Fernseher mit, erscheint er nur einmal, mit der Android-TV-Remote-Fernbedienung. Darunter starten Knöpfe eine App direkt, die laufende ist hervorgehoben. Welche, legt `tv_apps` fest (im Editor „Apps am Fernseher“): `netflix`, `prime`, `youtube`, `magenta`, `disney`, `spotify`, `plex`, `kodi`, ohne Angabe Netflix, YouTube und Prime Video. Statt Paketnamen wie `de.telekom.magentatv.tv` zeigt die Karte den App-Namen, beim Launcher „Startseite“.

**Läuft gerade:** erscheint, sobald ein Player spielt, mit Cover, Titel, Raum, Play/Pause und Weiter. Bei mehreren Playern schaltet „+N“ weiter. Ein pausierter Player bleibt fünf Minuten stehen. Mit `hide_domains: [media_player]` verschwindet die Leiste.

**Wetter:** Auf der Startseite steht eine Wetterkarte mit Temperatur, Zustand, Luftfeuchte, Wind, Luftdruck und Sicht, darunter die nächsten Tage mit Temperaturbalken. Mit `weather_sensors` ersetzen Sensoren am Haus die Werte vom Wetterdienst: Temperatur, Luftfeuchte, Luftdruck, Wind, Windrichtung, Regen und Helligkeit. Neben einer gemessenen Temperatur steht zum Vergleich die des Wetterdienstes, so fällt ein Sensor in der Sonne oder im Haus auf. Ein Tipp auf einen gemessenen Wert öffnet seinen Verlauf. Mit `weather_warnings` erscheinen Unwetterwarnungen: NINA legt pro Region mehrere `binary_sensor.warning_…` an, die Karte zeigt jede aktive mit Überschrift und Ende, sonst „Keine Warnungen“. Der DWD-Warnsensor geht ebenso. Die Wetterkarte ersetzt die Kachel „Außen“; „Innen“ und „Strom“ stehen darunter. Gibt es keine Wetter-Entity oder ist `weather` unter `hide_domains`, erscheint „Außen“ wieder als Kachel.

**Innen, Außen, Strom:** „Innen“ ist der Durchschnitt aller Räume, „Außen“ der Durchschnitt der Bereiche in `outdoor_areas`. Außenbereiche zählen innen nicht mit. „Strom“ kommt aus HAs Energieeinstellungen, wenn sie eindeutig sind: ein Hausverbrauch-Sensor, sonst genau eine Netzquelle mit Leistungssensor (plus Solar und Akku). Mehrere Netzquellen mit Leistungssensor sind meist einzelne Steckdosen und werden ignoriert. Die Energieseite zeigt die drei dann einzeln. Ohne diese Angaben (oder für Nutzer ohne Zugriff darauf) ist „Strom“ die Summe aller Leistungssensoren (`device_class: power`) in den Räumen; ein Gesamtzähler in einem Raum zählt dann doppelt und lässt sich per Label ausblenden.

**Personen und Alarm:** Alle sichtbaren `person`-Entities als Avatar, unterwegs ausgegraut, dazu die erste Alarmanlage als Chip (ausgelöst rot und blinkend, scharf blau, unscharf grün). Ausblenden mit `hide_domains: [person]` bzw. `[alarm_control_panel]` oder dem Label `ad_hide`.

Temperatur und Luftfeuchte eines Raums kommen aus den Sensoren, die in HA beim Bereich eingetragen sind (Einstellungen → Bereiche → Bereich öffnen). Ohne diese Angabe nimmt das Dashboard, was das Thermostat misst, und erst danach den ersten funktionierenden Sensor im Raum. Steht im Raum ein Kühlschrank- oder Außenthermometer, trägt man den richtigen Sensor deshalb am besten beim Bereich ein.

Mehrere Tipps auf −/+ am Thermostat werden gesammelt und nach einer kurzen Pause als ein Befehl geschickt.

Bedienung: Raumkarte antippen öffnet die Raumseite, Doppeltipp schaltet alle Lichter im Raum, ein Tipp auf einen Status-Kreis öffnet den More-Info-Dialog. Kacheln: Tippen schaltet Licht, Schalter und Szenen, alles andere öffnet More-Info. Lange drücken öffnet immer More-Info.

**Kacheln zeigen die Menge, die sie steuern:** Eine Lichtkachel füllt sich mit warmem Licht bis zur Helligkeit; waagerecht über die Kachel ziehen dimmt, die Pfeiltasten auch. Rollos zeigen ihre Lamellen so weit geschlossen, wie sie es sind. Thermostate haben unten einen Streifen von kalt nach warm mit Punkt (gemessen) und Strich (Soll), Prozentwerte wie Luftfeuchte einen Füllstreifen. Schalter und Sensoren sind Zeilen wie ein Wandschalter: die ganze Zeile schaltet, die Kontrolllampe rechts zeigt den Zustand.

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

Am einfachsten über den Editor: Dashboard öffnen → Stift oben rechts → **Dashboard bearbeiten**. Der Editor hat die Reiter Darstellung, Startseite, Haus, Raumseiten und Nutzer. Unter „Haus“ ist das Haus als Querschnitt gezeichnet: Etagen übereinander, Räume darin, Räume ohne Etage draußen. Oben wählst du, was ein Tipp auf einen Raum bewirkt (ausblenden, Außenbereich, nur diesen zeigen), und jeder Raum zeigt seine Rolle direkt in der Zeichnung; ein Tipp auf eine Etage zeigt nur diese Etage. Dieselbe Zeichnung wählt unter „Raumseiten“ den Raum zum Anpassen und in den Nutzerregeln die Räume, die jemand sieht. Den Editor sehen nur Admins, weil nur sie Dashboards bearbeiten dürfen. Gespeichert wird dieselbe YAML-Konfiguration wie unten, ohne Standardwerte. Nutzerregeln aus dem Editor sind an die User-ID gebunden, eine Umbenennung bricht sie deshalb nicht.

Alle Optionen, alle optional:

```yaml
strategy:
  type: custom:auto-dashboard
  title: Zuhause
  theme: auto              # auto | dark | light, auto folgt dem HA-Dunkelmodus
  glass: false             # Milchglas-Karten, dahinter ein weiches Licht in der gedämpften Akzentfarbe
  background_image: /local/garten.jpg   # Foto hinter den Karten, mit Schleier in der Seitenfarbe; ersetzt das Glas-Licht
  primary_color: "#14b8a6" # Akzentfarbe, alles andere wird daraus abgeleitet
  ha_colors: true          # mit primary_color auch HA-Kopfzeile, Seitenleiste und Dialoge färben
  nav_position: bottom     # bottom | top | left | right
  areas: [wohnzimmer]      # nur diese Räume
  floors: [obergeschoss]   # nur Räume auf diesen Etagen
  hide_areas: [abstellraum]
  area_order: [wohnzimmer, kueche]   # sonst alphabetisch je Etage
  hide_pages: [cameras]    # Seiten für alle ausblenden, auch für Admins: lights | climate | covers | security | cameras | music | calendar | lists | energy | maintenance
  hide_domains: [fan, scene]
  hide_labels: [technik]   # Label-IDs, siehe unten
  favorites: [light.flur, lock.haustuer]       # Startseite und oben im jeweiligen Raum
  scenes: [scene.kino, script.gute_nacht]      # Zeile auf der Startseite
  todo_lists: [todo.einkaufsliste]             # nur diese Listen auf der Seite „Listen“, sonst alle (auch neue)
  outdoor_areas: [garten]  # zählen nicht zum Innenklima; ohne Wetterkarte ihr Durchschnitt als „Außen“
  weather_entity: weather.forecast_home        # sonst die erste Wetter-Entity mit Tagesvorhersage
  weather_warnings: [binary_sensor.warning_muelheim_1]   # NINA-Sensoren oder der DWD-Warnsensor
  weather_sensors:         # eigene Messwerte statt Wetterdienst, alle optional
    temperature: sensor.aussen_temperatur
    humidity: sensor.aussen_luftfeuchte
    pressure: sensor.aussen_luftdruck
    wind_speed: sensor.wind
    wind_bearing: sensor.windrichtung
    rain: sensor.regen
    illuminance: sensor.aussen_helligkeit
  forecast_days: 3         # 0 = keine Vorhersage
  calendars: [calendar.familie, calendar.abfall_2026]   # Kalenderseite, sonst alle
  calendar_edit: false     # Kalenderseite nur zum Ansehen
  face:                    # Zifferblatt nach einer Weile ohne Berührung
    after: 120             # Sekunden, 0 = gleich beim Öffnen (nach einer Berührung dann 1 Minute)
    style: clock           # clock | analog | photo | calendar
  tv_apps: [magenta, netflix, prime]   # App-Knöpfe auf der TV-Karte
  appliances:              # Geräte ohne eigenen Betriebszustand; die anderen findet das Dashboard selbst
    - status: sensor.trockner_leistung   # Zustand: Leistung, Schalter, Binärsensor oder Status-Sensor
      name: Trockner
      area: keller                       # sonst der Raum des Zustands-Sensors
      progress: sensor.trockner_fortschritt   # optional, ebenso remaining, end, program, door, power
  hide_entities: [light.deko]   # einzelne Geräte überall ausblenden
  rooms:                   # Einstellungen pro Raumseite, siehe unten
    wohnzimmer:
      hide_groups: [sensor]
      group_order: [media, light]
      order: [light.decke, light.stehlampe]
      cards:
        top:
          - type: markdown
            content: Willkommen
        light: []          # am Ende einer Gruppe
        bottom: []
```

Wo eine Liste steht, reicht für einen einzelnen Eintrag auch der Wert allein, etwa `hide_areas: keller` oder `calendars: calendar.familie`.

**Raumseiten anpassen:** Am einfachsten im Editor unter „Raumseiten“. Raum wählen, dann Gruppen und Geräte mit den Pfeilen sortieren und mit dem Auge ausblenden. Ausgeblendete Geräte (`hide_entities`) verschwinden überall im Dashboard, ausgeblendete Gruppen (`hide_groups`) nur auf dieser Raumseite. Eigene Karten sind normale Lovelace-Karten und landen oben (`top`), unten (`bottom`) oder am Ende einer Gruppe (Gruppenname wie `light`, `climate`, `shading`, `awning`, `opening`, `gate`, `lock`, `media`, `switch`, `select`, `motion`, `safety`, `sensor`, `scene`). „Raum zurücksetzen“ macht die Seite wieder automatisch.

**Raumbild:** Hat ein Bereich in HA ein Bild (Einstellungen → Bereiche → Bereich bearbeiten), steht der Raumname auf diesem Bild.

**Szenen und Skripte:** Ohne `scenes` zeigt die Startseite alle sichtbaren Szenen, alphabetisch. Skripte erscheinen nur, wenn sie in `scenes` stehen. Mit `hide_domains: [scene]` verschwindet die Zeile.

**Akzentfarbe:** `primary_color` nimmt eine Hex-Farbe. Daraus entstehen für hell und dunkel der Seitenhintergrund, die Kartenflächen, die Schrift, der Akzent (aktive Navigation, Play-Knopf, Status-Punkte) und das Info-Blau. Die Flächen bekommen einen leichten Stich des Farbtons, wie das Schiefergrau beim voreingestellten Indigo; ein Grau als Akzent ergibt neutrale Grautöne. Bei hellen Akzenten wird die Schrift darauf dunkel. Gelb für Licht und Heizen, Rot für Alarm und Grün für „in Ordnung“ bleiben gleich, damit man sie auf einen Blick erkennt. Solange das Dashboard offen ist, übernehmen auch HAs Kopfzeile, Seitenleiste und Dialoge (z. B. der Detail-Dialog) die Farben; beim Verlassen kommt das HA-Theme zurück. Mit `ha_colors: false` bleibt HA, wie es ist. Ohne die Option bleibt die HArmony-Palette und der Seitenhintergrund kommt aus dem HA-Theme. Im Editor gibt es dafür Farbvorschläge und einen Farbwähler.

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
      hide_pages: [security]       # zusätzlich zu hide_pages des Dashboards
      access: no_critical          # keine Schlösser, Alarmanlage, „Alle aus/zu“
    gast:
      access: read_only            # nur ansehen
    wandtablet:
      face: { style: calendar }    # Zifferblatt nur auf diesem Gerät; face: false schaltet es für einen Nutzer ab
    default:                       # alle übrigen Nicht-Admins
      access: no_critical
```

- Admins ohne eigenen Eintrag sehen und bedienen alles. Mit einem eigenen Eintrag gilt auch für sie die Regel.
- `access` ist `full` (Standard), `no_critical` oder `read_only`. Die früheren Schalter `read_only: true` und `control_critical: false` funktionieren weiter.
- `areas`, `floors` und `hide_pages` gelten zusätzlich zu den Filtern des Dashboards.
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
