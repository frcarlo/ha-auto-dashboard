// Streaming apps a TV card can start with one tap, and readable names for what a TV reports as running.
// Android TV Remote opens an app by its deep link where one is known (a Play Store update in 2026 stopped
// many TVs from opening apps by package name), else by package; ADB picks the package as source.

export interface TvApp {
  name: string
  /** Android package name */
  package: string
  /** Deep link the app answers to */
  link?: string
  icon?: string
}

export const TV_APPS: Record<string, TvApp> = {
  netflix: { name: 'Netflix', package: 'com.netflix.ninja', link: 'https://www.netflix.com/title', icon: 'mdi:netflix' },
  prime: { name: 'Prime Video', package: 'com.amazon.amazonvideo.livingroom', link: 'https://app.primevideo.com' },
  youtube: { name: 'YouTube', package: 'com.google.android.youtube.tv', link: 'https://www.youtube.com', icon: 'mdi:youtube' },
  magenta: { name: 'MagentaTV', package: 'de.telekom.magentatv.tv' },
  disney: { name: 'Disney+', package: 'com.disney.disneyplus', link: 'https://www.disneyplus.com' },
  spotify: { name: 'Spotify', package: 'com.spotify.tv.android', icon: 'mdi:spotify' },
  plex: { name: 'Plex', package: 'com.plexapp.android', icon: 'mdi:plex' },
  kodi: { name: 'Kodi', package: 'org.xbmc.kodi', icon: 'mdi:kodi' },
}

/** Without `tv_apps` the card offers these */
export const DEFAULT_TV_APPS = ['netflix', 'youtube', 'prime']

/** Home screens the TV reports as the running app */
const LAUNCHERS = ['com.spocky.projengmenu', 'com.google.android.tvlauncher', 'com.google.android.apps.tv.launcherx', 'com.android.tv.launcher']

/** The picked apps that exist in the catalog, in the order picked. */
export function tvApps(keys: string[] | undefined): TvApp[] {
  return (keys ?? DEFAULT_TV_APPS).map(key => TV_APPS[key]).filter((app): app is TvApp => !!app)
}

/**
 * What the TV runs, the way people call it: a known app's name, "home" for a launcher,
 * else the app id's last part ("com.example.mediathek" → "Mediathek"). Names that are no ids stay.
 */
export function appLabel(id: string | undefined, home: string): string | undefined {
  if (!id) return undefined
  if (LAUNCHERS.includes(id)) return home
  const known = Object.values(TV_APPS).find(app => app.package === id)
  if (known) return known.name
  if (!/^[\w]+(\.[\w]+)+$/.test(id)) return id
  const last = id.split('.').pop()!
  return last.charAt(0).toUpperCase() + last.slice(1)
}
