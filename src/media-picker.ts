import { html } from 'lit'
import type { HomeAssistant } from './types'

/** HA's media picker with upload, like in its own view background editor, when it is loaded, else a path. */
export function imagePicker(hass: HomeAssistant | undefined, value: string | undefined, set: (value?: string) => void) {
  const done = (v?: string) => set(v?.trim() || undefined)
  if (customElements.get('ha-selector')) {
    // The picker works with { media_content_id }; the config keeps just the id, a URL or media-source://…
    return html`<ha-selector .hass=${hass} .value=${value ? { media_content_id: value } : undefined}
      .selector=${{ media: { accept: ['image/*'], image_upload: true, hide_content_type: true } }}
      @value-changed=${(e: CustomEvent) => done((e.detail.value as { media_content_id?: string } | undefined)?.media_content_id)}></ha-selector>`
  }
  return html`<input type="text" .value=${value ?? ''} placeholder="/local/garten.jpg"
    @change=${(e: Event) => done((e.target as HTMLInputElement).value)}>`
}
