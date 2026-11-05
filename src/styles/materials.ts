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

  /* Blind: the slat curtain hangs from the top and slides down as far as the cover is closed (--closed).
     It moves as one piece (transform), so the slats keep their size and tablets don't stutter. */
  .slats {
    position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden;
    transform: translateY(calc(var(--closed, 0%) - 100%));
    border-bottom: 2px solid rgba(var(--ad-on-surface), 0.28);
    transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .slats::before {
    content: ''; position: absolute; inset: -18px 0 0 0;
    background: repeating-linear-gradient(to bottom, rgba(var(--ad-on-surface), 0.11) 0 7px, rgba(var(--ad-on-surface), 0.03) 7px 9px);
  }
  .slats[data-closed='0'] { border-bottom: 0; }
  /* Garage door: wide panels with grooves, rolling up into the ceiling */
  .slats.garage { border-bottom-width: 4px; }
  .slats.garage::before {
    inset: -48px 0 0 0;
    background: repeating-linear-gradient(to bottom, rgba(var(--ad-on-surface), 0.09) 0 22px, rgba(var(--ad-on-surface), 0.22) 22px 24px);
  }
  /* Gate: bars sliding in from the side */
  .slats.gate { transform: translateX(calc(var(--closed, 0%) - 100%)); border-bottom: 0; border-right: 3px solid rgba(var(--ad-on-surface), 0.28); }
  .slats.gate::before {
    inset: 0 0 0 -32px;
    background: repeating-linear-gradient(90deg, rgba(var(--ad-on-surface), 0.16) 0 4px, transparent 4px 16px);
  }

  /* Awning: striped fabric rolls out from the top as far as it is extended (--out), with a scalloped valance */
  .awning {
    position: absolute; inset: 0; z-index: 0; pointer-events: none;
    transform: translateY(calc(var(--out, 0%) - 100%));
    background: repeating-linear-gradient(90deg, rgba(var(--ad-on-surface), 0.13) 0 14px, rgba(var(--ad-on-surface), 0.04) 14px 28px);
    transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .awning::after {
    content: ''; position: absolute; left: 0; right: 0; top: 100%; height: 7px;
    background: radial-gradient(circle at 7px 0, rgba(var(--ad-on-surface), 0.13) 6.5px, transparent 7px) 0 0 / 28px 7px repeat-x,
      radial-gradient(circle at 21px 0, rgba(var(--ad-on-surface), 0.04) 6.5px, transparent 7px) 0 0 / 28px 7px repeat-x;
  }
  .awning[data-out='0']::after { display: none; }

  /* Window: a frame whose sash tilts outwards as far as the window is open (--open, 0 to 100) */
  .sash { position: absolute; inset: 10px; z-index: 0; pointer-events: none; perspective: 360px; border-radius: 14px; box-shadow: inset 0 0 0 2px rgba(var(--ad-on-surface), 0.12); }
  .sash > span {
    position: absolute; inset: 6px; border-radius: 8px;
    background: linear-gradient(rgba(var(--ad-on-surface), 0.12), rgba(var(--ad-on-surface), 0.12)) center / 1px 100% no-repeat, rgba(var(--ad-on-surface), 0.05);
    box-shadow: inset 0 0 0 1px rgba(var(--ad-on-surface), 0.14);
    transform-origin: top; transform: rotateX(calc(var(--open, 0) * 0.45deg));
    transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* While the motor runs, the slats or panels travel in its direction; they stop when HA reports it stopped */
  @media (prefers-reduced-motion: no-preference) {
    .slats.moving::before { animation: ad-slats 0.9s linear infinite; }
    .slats.garage.moving::before { animation: ad-panels 2.4s linear infinite; }
    .slats.gate.moving::before { animation: ad-bars 1.6s linear infinite; }
    .slats.moving.up::before { animation-direction: reverse; }
  }
  @keyframes ad-slats { to { transform: translateY(18px); } }
  @keyframes ad-panels { to { transform: translateY(48px); } }
  @keyframes ad-bars { to { transform: translateX(32px); } }

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
    .light-fill, .slats, .awning, .sash > span, .level > span { transition: none; }
  }
`
