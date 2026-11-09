<img src="https://raw.githubusercontent.com/frcarlo/ha-auto-dashboard/main/assets/icon.png" width="96" height="96" alt="">

# HA Auto Dashboard

A Lovelace dashboard strategy that builds the whole dashboard from your areas, floors, devices and entities. The idea is the same as Dwains Dashboard, without blueprints and add-on cards. The look comes from HArmony: a slate palette, an indigo accent, an amber glow for lights and round status buttons.

One ES module (about 400 KB, 110 KB gzipped); its only dependency is Lit. No other custom cards are needed.

The dashboard speaks German and English and follows the language set in Home Assistant.

## What it builds

- **Home**: greeting, clock, weather, people (home or away) and the alarm panel, status chips (lights on, open, unlocked, heating, playing, battery below 20 %, unavailable; a tap opens the list), indoor and outdoor climate and current power use, "Now playing", a row of scenes and scripts, favorites, and below them one room card per area, grouped by floor. From about 720 px wide (tablet, desktop) the weather sits next to indoor climate and power, and "Now playing" next to the scenes; the people sit at the front of the status chips. That way the rooms start on the first screen. On a phone everything is stacked. The cog next to the clock opens the user's own settings.
- **Room pages** (`area-<area_id>`, subview): at the top the temperature, humidity and, if the room has exactly one thermostat, current and target temperature with −/+. Next to it quick tiles like "Lights 2 of 5 on", "Sockets" and one per kind of cover, each switching everything in the room at once. Below them the same status chips as on Home, counted for this room only, plus "Motion detected" while a motion or presence sensor in the room is on. Then the room's favorites and the groups Lights, Climate, Shading, Awnings, Windows & doors, Gates, Locks, Media, Sockets, Switches, Selectors, Motion & presence, Safety & alarms, Sensors, Scenes. Groups with several lights, sockets, covers or locks get a group switch in their heading. Only lights, fans and switches with device class `outlet` are switched together; other switches are often device settings (child lock, eco mode) and stay out of it.
- **Domain pages**: Lights (with "All off"), Climate, Covers (with "Close all", shading and awnings; a room with both gets a heading per kind with up/down or extend/retract), Security (windows, doors, gates, locks, motion, smoke and water sensors). Grouped by room, and only built when there are matching entities. Each room heading leads to the room page and has a switch showing "2/5", up/down for covers, lock/unlock for locks. Unlocking always asks first. Lights, Covers and Security also list everything that happened today next to the tiles (see "Today" below).
- **Cameras** (`cameras`, with an entry in the nav bar): a still of every camera, refreshed every ten seconds, with its name and last detection below ("10:03 · Package", otherwise "Quiet"). To the right (below on narrow screens) is "Detected today": what the cameras noticed since midnight, the newest one large. Detections come from the camera's own sensors (person, vehicle, animal, package, visitor/doorbell, motion, e.g. from Reolink). The device name is ignored when reading what a sensor detects, so the motion sensor of a doorbell named "Doorbell" is not a ring. Motion right next to a more precise detection doesn't count twice, and someone standing at the door for a while counts once. The list is at most one screen high and scrolls on its own. A tap on a camera or a detection opens the camera large and live, with its latest detections, the lights on the device and in the same room to switch, and "Open camera" for HA's own dialog. Tabs at the bottom switch to the other cameras. A camera with several streams (standard, high resolution, snapshots) appears once, with the standard stream. A room's cameras also appear at the top of its room page.
- **Music** (`music`, with an entry in the nav bar, only with Music Assistant): laid out like the music page in HArmony. On the left Home, Search, Radio and Speakers, with the library's playlists below; on a phone these become tabs. "Home" shows recently played playlists as quick picks, then recently played albums and playlists, favorite artists, favorite tracks and stations. A tap on a playlist, album or artist opens its tracks; a tap on a track plays the playlist from there, and the menu next to it plays next, adds to the queue or starts a radio from it. "Search" finds tracks, artists, albums, playlists and stations across all Music Assistant providers. "Speakers" shows every player with what it plays and its volume; a tap selects it, "Join" and "Leave" group it with the selected one. The bar at the bottom has the cover, shuffle, previous, play/pause, next, repeat, a progress bar to seek, the queue (what's playing and what comes next), "Play elsewhere" and the volume. Each device remembers the selected speaker; without a choice it's the one currently playing. A tap on the cover in the bar (or the microphone next to it) opens the large player: the cover, title, artist and album, and next to them the lyrics, running along with the music. The line being sung sits bright in the middle, a tap on a line jumps there; scrolling yourself gives you a few seconds of peace. As in HArmony, lyrics come from LRCLIB (lrclib.net), straight from the browser. Title, artist, album and duration are sent there, but only while the large player is open. Another tap on the cover goes back. Music Assistant also creates a dashboard entity for Cast displays and TVs that can't play anything; it shows neither under Speakers nor as a TV. At the top of "Home" you pick the Spotify account, as in HArmony; each device remembers the choice. Its playlists then appear in the quick picks and in the library on the left, above them "Recently played", artists, albums, liked songs and top artists, and below them what comes from Music Assistant. Browsing goes through a Sonos or Cast speaker, because HA's own Spotify players only show their library while something plays on them; without such a speaker there is no account choice. Playback runs on the selected speaker through Music Assistant, Spotify playlists track by track (up to 100), so private playlists of the other accounts and lists like "Liked songs" play too. The Spotify accounts themselves appear under Speakers and can be controlled there. Everything runs through Music Assistant's services in HA, without a server of its own; editing the queue and playlists as in HArmony is therefore not available. `hide_pages: [music]` hides the page, for everyone or for single users under `users`; `hide_domains: [media_player]` removes the page and all media players from the rooms.
- **Calendar** (`calendar`, with an entry in the nav bar): all calendars as month, week or day, switchable at the top, with previous, today and next. The month shows each day's first events, a tap on a day opens it. Week and day show the hours like a planner, with a line for now. Month and hours fit the screen height so everything is visible without scrolling; the hours run from 7 to 21 or as far as the events need. On a phone the week becomes a list and the month shows dots. Each calendar has a color; each device remembers the chosen view. A tap on an event shows time, calendar, location and description. Where the calendar allows it, events can be created (the "+" at the top, or a tap on a free hour or the all-day row), edited and deleted; for recurring events the card asks whether you mean only this one or all following ones. The integration decides what is allowed: the local calendar can do everything, Google can create and delete but not edit, holiday or waste calendars from the web nothing. `calendar_edit: false` turns editing off, e.g. for a wall tablet. Which calendars appear is set by `calendars` only (in the editor under Home page › "Calendars"), otherwise all; `hide_domains: [calendar]` hides the page.
- **Lists** (`lists`, with an entry in the nav bar): the to-do lists, e.g. the shopping list, with HA's own card; items can be checked off, added and renamed. Several lists sit side by side on tablet and desktop. A tap on the name folds a list, leaving only how many items are open; each device remembers that. Admins create a list with "New list" (through HA's "Local to-do" integration) and delete such lists with the bin, after a confirmation. The shopping list of the "Shopping list" integration can't be deleted on its own. Lists belong to the whole household, so they also appear on dashboards limited to single rooms. Without `todo_lists` all lists appear, including new ones; with `todo_lists` only the chosen ones, and there is no "New list". `hide_domains: [todo]` hides the page.
- **Energy** (`energy`, only with power sensors): the whole house with the room using the most and its three biggest consumers. Below, every room with its power sensors and their share, and a history of the last 24 hours (HA's history graph). Reached through the "Power" tile on Home.
- **Maintenance** (`maintenance`): all batteries, weakest first, unavailable devices and, for admins only, pending updates. Reached through the "Battery" and "Unavailable" chips → "Show all".
- **Settings** (`settings`): every user's own look, face, pages and favorites (see "Own settings" below).
- **Face** (`face`, for wall tablets): after a while without a touch (two minutes by default), a calm full-screen view covers the page, easy to read from across the room. A tap hides it, and the page below stays as it was. Four styles: `clock` (large clock, date, weather, next event today or tomorrow), `analog` (a clock with hands and the same details), `photo` (the dashboard's background picture with time, weather and next event; without a picture the clock) and `calendar` (clock on the left, the week's next events on the right). At the bottom it shows small what is running: dishwasher, washer or dryer with the time they finish and a progress line, then "Done", plus music that is playing. To avoid burn-in, the content moves a few pixels every minute. Best switched on only for the tablet's user (`users: … face:`); `after: 0` shows the face right on opening, e.g. on a display meant to show only the clock; after a touch it then waits one minute. It never appears in HA's edit mode.
- **Navigation**: a floating bar at the bottom on all devices. Lights, Climate, Covers, Security, Cameras, Music, Calendar, Lists and the rooms are subviews, so HA hides its own tab bar. On a phone the bar shows at most five pages plus "More"; the others open above it.

**Today:** On Lights, Covers and Security a list next to the tiles shows every change of the day from HA's history: lights switched on and off, covers opened or closed (without the travel in between), windows, doors and locks both ways, motion and smoke only when they trigger and once per two minutes. The latest change is large at the top; below it the list scrolls on its own and reaches at most to just above the nav bar. On a phone it sits below the tiles, one screen high. A tap opens the device.

**Sockets:** A switch with device class `outlet`, or one named like a socket or plug ("Steckdose", "Zwischenstecker", "plug", "socket", "outlet"), is a socket. Sockets have a group of their own on room pages. A measuring plug is one device there: its row shows the current power and the energy counter, and its single readings (power, energy, voltage, current and the like) no longer appear under Sensors. A tap on the power opens its history. Switching a socket off always asks first, because a fridge, a computer or the router may hang on it: the row asks "Really switch off?" with a red "Switch off" button, and the room's quick tile and "All off" take a second tap. Switching on stays a single tap.

**Covers by purpose:** Roller shutters, blinds and covers without a device class count as shading. Awnings (class `awning`, or "Markise"/"Awning" in the name, because e.g. Shelly creates them as shutters) are a group of their own: their fabric extends in the tile, and the buttons say extend and retract. Covers with class `window` or `door` belong to Windows & doors, `garage` and `gate` to Gates. Each kind has its own quick tile and group switch, so "Close all" for shading never moves the garage door. You can change the device class in HA in the entity's settings under "Show as".

**Appliances:** The dashboard finds dishwasher, washer, dryer and oven by their operation state, a sensor like `sensor.geschirrspuler_betriebszustand` (Home Connect) or `sensor.washing_machine_state` (WashData). Whatever else the appliance reports goes on the card: progress, end time or remaining time, the running program, the door and notices like "Salt almost empty". While a program runs, a ring fills up with the remaining time in the middle, with start and end below. "Done" is green and stays until the appliance reports "Ready" again, with Home Connect until someone opens the door. Each appliance appears on its room page under "Appliances", and its single sensors don't show there again. On Home it only appears while it runs, is done or needs something. Appliances without an operation state of their own, e.g. a dryer on a smart plug, are added with `appliances`: a power sensor is enough as state (from 5 W it runs), or a switch or a status sensor of its own. `hide_domains: [appliance]` turns the cards off.

**TVs:** A media player with class `tv` gets a card like a remote on its room page: power, the running app, a round d-pad with OK, volume up, volume down and mute, back and home. The d-pad goes through the remote entity of the same device (Android TV Remote or Android Debug Bridge). If both integrations bring the same TV, it appears once, with the Android TV Remote. Below, buttons start an app directly, and the running one is highlighted. Which ones is set by `tv_apps` (in the editor "Apps on the TV"): `netflix`, `prime`, `youtube`, `magenta`, `disney`, `spotify`, `plex`, `kodi`, by default Netflix, YouTube and Prime Video. Instead of package names like `de.telekom.magentatv.tv` the card shows the app name, "Home" for the launcher.

**Now playing:** appears as soon as a player plays, with cover, title, room, play/pause and next. With several players "+N" switches between them. A paused player stays for five minutes. `hide_domains: [media_player]` removes the bar.

**Weather:** Home has a weather card with temperature, condition, humidity, wind, pressure and visibility, and below it the next days with temperature bars. With `weather_sensors`, sensors at the house replace the forecast service's values: temperature, humidity, pressure, wind, wind direction, rain and illuminance. Next to a measured temperature the forecast service's value appears for comparison, so a sensor in the sun or inside stands out. A tap on a measured value opens its history. With `weather_warnings` severe weather warnings appear: NINA creates several `binary_sensor.warning_…` per region, and the card shows each active one with headline and end, otherwise "No warnings". The DWD warning sensor works too. The weather card replaces the "Outside" tile; "Inside" and "Power" sit next to it. If there is no weather entity or `weather` is in `hide_domains`, "Outside" appears as a tile again.

**Inside, outside, power:** "Inside" is the average of all rooms, "Outside" the average of the areas in `outdoor_areas`. Outdoor areas don't count inside. "Power" comes from HA's energy settings when they are unambiguous: a house consumption sensor, otherwise exactly one grid source with a power sensor (plus solar and battery). Several grid sources with power sensors are usually single plugs and are ignored. The energy page then shows the three separately. Without these settings (or for users without access to them) "Power" is the sum of all power sensors (`device_class: power`) in the rooms; a main meter in a room then counts twice and can be hidden with a label.

**People and alarm:** All visible `person` entities as avatars, greyed out when away, plus the first alarm panel as a chip (triggered red and blinking, armed blue, disarmed green). Hide them with `hide_domains: [person]` or `[alarm_control_panel]`, or the label `ad_hide`.

A room's temperature and humidity come from the sensors set on the area in HA (Settings → Areas → open the area). Without them the dashboard takes what the thermostat measures, and only then the first working sensor in the room. If a fridge or outdoor thermometer sits in the room, it's best to set the right sensor on the area.

Several taps on −/+ at a thermostat are collected and sent as one command after a short pause.

Using it: tap a room card to open the room page, double-tap to switch all lights in the room, tap a status circle for the more-info dialog. Tiles: a tap switches lights, switches and scenes, everything else opens more-info. A long press always opens more-info.

**Tiles show the amount they control:** A light tile is a small square with a round lamp icon that glows amber while the light is on; warm light rises from the bottom as high as the lamp is bright. Dragging horizontally across the tile dims it (vertically the page keeps scrolling), and so do the arrow keys. Covers show their slats as far closed as they are. Thermostats have a cold-to-warm strip at the bottom with a dot (measured) and a line (target), percentages like humidity a fill bar. Switches and sensors are rows like a wall switch: the whole row switches, and the pilot light on the right shows the state.

## Installation

Requires Home Assistant 2026.5 or newer.

### Through HACS (recommended)

1. Open HACS → menu at the top right → **Custom repositories**.
2. Enter `https://github.com/frcarlo/ha-auto-dashboard`, type **Dashboard**, add.
3. Search for **Auto Dashboard** and download it. HACS adds the resource itself.
4. Reload the browser (Ctrl+Shift+R), or reset the frontend cache in the companion app.
5. **Settings → Dashboards → Add dashboard**. **Auto Dashboard** now appears under **Community dashboards**. Pick it, give it a name, done.

Updates then arrive like for any HACS plugin.

### Manual

1. Copy `auto-dashboard.js` from the [latest release](https://github.com/frcarlo/ha-auto-dashboard/releases/latest) to `/config/www/auto-dashboard/`.
2. **Settings → Dashboards → Resources** → `/local/auto-dashboard/auto-dashboard.js?v=0.1.0`, type **JavaScript module**. Raise the version number with every update, otherwise the old file stays cached for up to 31 days.
3. Reload the browser, then create the dashboard through **Add dashboard** as above. Alternatively create an empty dashboard and put this in its raw configuration:
   ```yaml
   strategy:
     type: custom:auto-dashboard
   ```

### Theme (optional)

Put `themes/harmony.yaml` in `/config/themes/` (`frontend: themes: !include_dir_merge_named themes`) and pick **HArmony** in your profile. Background, header and sidebar then match the cards.

## Options

The easiest way is the editor: open the dashboard → pencil at the top right → **Edit dashboard**. The editor has the tabs Appearance, Home page, House, Room pages and Users. "House" draws the house as a cross-section: floors stacked, rooms inside them, rooms without a floor outside. At the top you choose what a tap on a room does (hide, outdoor area, show only this one), and each room shows its role right in the drawing; a tap on a floor shows only that floor. The same drawing picks the room to customize under "Room pages", and the rooms someone sees in the user rules. Only admins see the editor, because only they may edit dashboards. It saves the same YAML configuration as below, without defaults. User rules from the editor are bound to the user ID, so renaming a user doesn't break them.

All options, all optional:

```yaml
strategy:
  type: custom:auto-dashboard
  title: Home
  theme: auto              # auto | dark | light, auto follows HA's dark mode
  glass: false             # frosted-glass cards, with a soft light in the muted accent color behind them
  background_image: /local/garden.jpg   # photo behind the cards, veiled in the page color; replaces the glass light
  primary_color: "#14b8a6" # accent color, everything else is derived from it
  ha_colors: true          # with primary_color, also color HA's header, sidebar and dialogs
  nav_position: bottom     # bottom | top | left | right
  areas: [living_room]     # only these rooms
  floors: [upstairs]       # only rooms on these floors
  hide_areas: [storage]
  area_order: [living_room, kitchen]   # otherwise alphabetical per floor
  hide_pages: [cameras]    # hide pages for everyone, admins included: lights | climate | covers | security | cameras | music | calendar | lists | energy | maintenance
  hide_domains: [fan, scene]
  hide_labels: [utility]   # label IDs, see below
  favorites: [light.hallway, lock.front_door]  # on Home and at the top of their room
  scenes: [scene.movie, script.good_night]     # row on Home
  todo_lists: [todo.shopping_list]             # only these lists on the "Lists" page, otherwise all (new ones too)
  outdoor_areas: [garden]  # don't count for indoor climate; without a weather card their average is "Outside"
  weather_entity: weather.forecast_home        # otherwise the first weather entity with a daily forecast
  weather_warnings: [binary_sensor.warning_muelheim_1]   # NINA sensors or the DWD warning sensor
  weather_sensors:         # own readings instead of the forecast service, all optional
    temperature: sensor.outdoor_temperature
    humidity: sensor.outdoor_humidity
    pressure: sensor.outdoor_pressure
    wind_speed: sensor.wind
    wind_bearing: sensor.wind_direction
    rain: sensor.rain
    illuminance: sensor.outdoor_illuminance
  forecast_days: 3         # 0 = no forecast
  calendars: [calendar.family, calendar.waste_2026]   # calendar page, otherwise all
  calendar_edit: false     # calendar page for viewing only
  face:                    # face after a while without a touch
    after: 120             # seconds, 0 = right on opening (after a touch then 1 minute)
    style: clock           # clock | analog | photo | calendar
  tv_apps: [magenta, netflix, prime]   # app buttons on the TV card
  appliances:              # appliances without an operation state of their own; the dashboard finds the others
    - status: sensor.dryer_power   # state: power, switch, binary sensor or status sensor
      name: Dryer
      area: basement               # otherwise the area of the state sensor
      progress: sensor.dryer_progress   # optional, as are remaining, end, program, door, power
  hide_entities: [light.decoration]   # hide single entities everywhere
  rooms:                   # settings per room page, see below
    living_room:
      hide_groups: [sensor]
      group_order: [media, light]
      order: [light.ceiling, light.floor_lamp]
      cards:
        top:
          - type: markdown
            content: Welcome
        light: []          # at the end of a group
        bottom: []
```

Wherever a list is expected, a single value also works, e.g. `hide_areas: basement` or `calendars: calendar.family`.

**Customizing room pages:** Easiest in the editor under "Room pages". Pick a room, then sort groups and devices with the arrows and hide them with the eye. Hidden devices (`hide_entities`) disappear everywhere in the dashboard, hidden groups (`hide_groups`) only on that room page. Own cards are ordinary Lovelace cards and go at the top (`top`), the bottom (`bottom`) or the end of a group (group name like `light`, `climate`, `shading`, `awning`, `opening`, `gate`, `lock`, `media`, `outlet`, `switch`, `select`, `motion`, `safety`, `sensor`, `scene`). "Reset room" makes the page automatic again.

**Room picture:** If an area has a picture in HA (Settings → Areas → edit the area), the room header shows it whole, in its own proportions, on the right, with a blurred copy of it behind the room name. On a phone the picture sits small in the top right corner and the name below it.

**Scenes and scripts:** Without `scenes`, Home shows all visible scenes, alphabetically. Scripts only appear when listed in `scenes`. `hide_domains: [scene]` removes the row.

**Accent color:** `primary_color` takes a hex color. From it come, for light and dark, the page background, the card surfaces, the text, the accent (active navigation, play button, status dots) and the info blue. The surfaces get a slight tint of the hue, like the slate grey with the default indigo; a grey accent gives neutral greys. With light accents the text on them turns dark. Amber for lights and heating, red for alarms and green for "all good" stay the same, so you recognize them at a glance. While the dashboard is open, HA's header, sidebar and dialogs (e.g. the more-info dialog) take on the colors too; when you leave, the HA theme comes back. With `ha_colors: false` HA stays as it is. Without the option the HArmony palette stays and the page background comes from the HA theme. The editor offers color suggestions and a color picker.

**Nav bar:** `left` and `right` are a vertical bar at the edge, from 1024 px wide. The content moves over to make room. On narrower screens the bar sits at the bottom. `top` puts it below HA's header.

**One room or one floor only:** `areas` and `floors` limit the whole dashboard: Home, status chips, overviews and room pages. Both together give the intersection. With exactly one room, Home shows that room's content right away, handy for a wall tablet. The IDs are in the URL of the area or floor under Settings → Areas, floors & zones.

### Users

For each HA user you can set what they see and may operate:

```yaml
strategy:
  type: custom:auto-dashboard
  users:
    leni:                          # first name, full name or user ID
      areas: [leni_room, living_room]
      floors: [upstairs]
      hide_pages: [security]       # on top of the dashboard's hide_pages
      access: no_critical          # no locks, alarm panel, "All off/close all"
    guest:
      access: read_only            # view only
    wall_tablet:
      face: { style: calendar }    # face on this device only; face: false switches it off for a user
      settings: false              # no settings page for this user
    default:                       # all other non-admins
      access: no_critical
```

- Admins without an entry of their own see and operate everything. With an entry of their own the rule applies to them too.
- `access` is `full` (default), `no_critical` or `read_only`. The former switches `read_only: true` and `control_critical: false` still work.
- `areas`, `floors` and `hide_pages` apply on top of the dashboard's filters.
- What someone may not operate appears without switches and buttons. HA's more-info dialog doesn't open for it either, since it could be used to switch. Display-only entities like sensors still open their info.

### Own settings

Every user, including one without admin rights like a wall tablet's, opens the **Settings** page with the cog next to the clock on Home. There they choose, for themselves only, theme, accent color, frosted glass, the nav bar position, the face and when it appears, which pages are in their bar, and their favorites: search, add, reorder, remove. The starting point is what the dashboard has set; "Reset everything" goes back to it.

- Settings are stored in HA with the user (not in the browser), per dashboard, and only what differs from the dashboard. They apply on every device the user is signed in on and survive a cleared cache. If the admin later changes something the user hasn't touched, the change reaches them.
- Rooms, rights and the pages the admin hid stay as the admin set them. If the admin set `face: false` for a user, that user can't switch the face on.
- `settings: false` in the user rule (in the editor: Users → "Allow own settings") takes the page away from a user; the dashboard then stays as the admin set it.

**Important:** This is not a security feature. HA has no rights per room or device. Anyone signed in can still switch everything through other dashboards, the settings or the API. The rules suit kids' tablets, guests and wall panels, not protection against someone determined. If someone should only see this dashboard, don't give them admin rights in HA, and hide the other dashboards with "Visible to admins only".

**Hiding by label:** Entities with the label `ad_hide` never appear. `hide_labels` adds your own labels. The label counts on the entity, the device and the area: a device with the label disappears with all its entities, an area with all the devices in it. The label ID is under Settings → Areas, labels & zones → Labels; in the editor you just pick the labels.

Hidden entities and diagnostic or configuration entities never appear anyway. An entity's area is its own or its device's.

## Development

```bash
npx vite        # test page with mock data: http://localhost:5173/dev/index.html
npm run dev     # build in watch mode
npm test        # Vitest for model, presentation and strategy
npm run deploy  # copy the bundle to HA_WWW_TARGET (Samba mount or scp)
npm run push    # push the bundle as an inline resource over WebSocket (HA_URL/HA_TOKEN in .env)
```

The test page (`dev/`) renders the generated views roughly like HA's sections view, with fake states from `dev/mock.ts`. Service calls change the fake states, more-info appears as a toast. `?theme=light` and `?glass` switch the look, `?nav=left` moves the nav bar, `?editor` shows the config editor.

| File | Contents |
|---|---|
| `src/strategy.ts` | builds views and sections |
| `src/model.ts` | areas, floors, groups, status counts (pure functions) |
| `src/presentation.ts` | icons, active/inactive, colors (ported from HArmony) |
| `src/personal.ts` | users' own settings |
| `src/styles/tokens.ts` | colors, card shape, glass |
| `src/cards/*` | `ad-tile`, `ad-room-card`, `ad-status-bar`, `ad-header`, `ad-nav-bar` and the page cards |

## Release

Publish a GitHub release with tag `vX.Y.Z`. The `release.yml` workflow sets the version, builds and attaches `auto-dashboard.js` to the release. HACS downloads the file from there.
