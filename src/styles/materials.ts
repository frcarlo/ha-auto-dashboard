// State shown as the material it controls: warm light filling up to the brightness, blind slats hanging down
// as far as the cover is closed, a level strip for percentages, a pilot light like on a wall switch.
// These fills are the only decoration on the tiles; everything around them stays plain.
import { css } from 'lit'

export const materials = css`
  /* Dimmer: light fills from the left up to --level, with a clear edge where it ends */
  .light-fill {
    position: absolute; inset: 0 auto 0 0; z-index: 0; pointer-events: none; width: var(--level, 0%);
    background: linear-gradient(90deg, rgba(var(--ad-warning), 0.42), rgba(var(--ad-warning), 0.22));
    transition: width 0.25s ease;
  }
  .light-fill::after {
    content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 2px;
    background: rgb(var(--ad-warning));
  }
  .light-fill[data-full]::after { display: none; }

  /* Blind: slats hang from the top as far as the cover is closed (--closed) */
  .slats {
    position: absolute; inset: 0 0 auto 0; z-index: 0; pointer-events: none; height: var(--closed, 0%);
    background: repeating-linear-gradient(to bottom,
      rgba(var(--ad-on-surface), 0.11) 0 7px, rgba(var(--ad-on-surface), 0.03) 7px 9px);
    border-bottom: 2px solid rgba(var(--ad-on-surface), 0.28);
    transition: height 0.5s ease;
  }
  .slats[data-closed='0'] { border-bottom: 0; }

  /* Awning: striped fabric rolls out from the top as far as it is extended (--out), with a scalloped valance */
  .awning {
    position: absolute; inset: 0 0 auto 0; z-index: 0; pointer-events: none; height: var(--out, 0%);
    background: repeating-linear-gradient(90deg, rgba(var(--ad-on-surface), 0.13) 0 14px, rgba(var(--ad-on-surface), 0.04) 14px 28px);
    transition: height 0.5s ease;
  }
  .awning::after {
    content: ''; position: absolute; left: 0; right: 0; top: 100%; height: 7px;
    background: radial-gradient(circle at 7px 0, rgba(var(--ad-on-surface), 0.13) 6.5px, transparent 7px) 0 0 / 28px 7px repeat-x,
      radial-gradient(circle at 21px 0, rgba(var(--ad-on-surface), 0.04) 6.5px, transparent 7px) 0 0 / 28px 7px repeat-x;
  }
  .awning[data-out='0']::after { display: none; }

  /* Level strip along the bottom edge, for percentages (humidity, battery) and the temperature scale */
  .level { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; z-index: 0; background: rgba(var(--ad-on-surface), 0.07); }
  .level > span { display: block; height: 100%; width: var(--level, 0%); background: rgba(var(--ad-on-surface), 0.45); transition: width 0.4s ease; }

  /* Temperature scale: cold to warm, a dot for the measured value, a tick for the target */
  .scale {
    position: absolute; left: 0; right: 0; bottom: 0; height: 4px; z-index: 0;
    background: linear-gradient(90deg, rgba(var(--ad-info), 0.55), rgba(var(--ad-on-surface), 0.12) 50%, rgba(var(--ad-warning), 0.6));
  }
  .scale .now, .scale .goal { position: absolute; transform: translateX(-50%); }
  .scale .now { left: var(--now); bottom: -3px; width: 10px; height: 10px; border-radius: 50%; background: rgb(var(--ad-on-surface)); box-shadow: 0 0 0 2px var(--ad-surface); }
  .scale .goal { left: var(--goal); bottom: 0; width: 2px; height: 14px; background: rgb(var(--ad-on-surface)); opacity: 0.7; }

  /* Pilot light: off is an empty ring, on a solid dot in its color (--pilot, an r, g, b triplet) */
  .pilot { flex: 0 0 auto; width: 10px; height: 10px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px rgba(var(--ad-on-surface), 0.35); }
  .pilot.on {
    background: rgb(var(--pilot, var(--ad-primary)));
    box-shadow: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .light-fill, .slats, .awning, .level > span { transition: none; }
  }
`
