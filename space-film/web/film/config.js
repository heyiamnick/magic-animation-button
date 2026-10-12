// Everything the film needs to know that is not code: timing, stops, bodies.
// Units: 1 = Earth's radius. Sizes and distances are NOT to scale (see README).

export const FPS = 30;
export const DURATION = 84; // seconds
export const FRAMES = FPS * DURATION;

// Vertical field of view. A body of radius R fills a third of the frame height
// when the camera is FILL_THIRD * R from its centre.
export const FOV = 32;
export const FILL_THIRD = 1 / Math.sin((FOV / 3 / 2) * Math.PI / 180);

// Where the thing we look at sits on screen (NDC, -1..1). Upper right of centre,
// so the year and its line in the lower left never sit on a body.
export const LENS_SHIFT = { x: 0.3, y: 0.12 };

// The Sun is far away in this direction (world space). It is the only light.
export const SUN_DIR = [1, 0, 0];

export const BODIES = {
  earth: { radius: 1.0, center: [0, 0, 0] },
  moon: { radius: 0.2727, center: null }, // placed in path.js
  mars: { radius: 0.532, center: null },
};

// The opening (not a stop) and the five stops.
// t: the moment the camera arrives and the year lands; hold: how long the line stays.
export const OPENING = { year: 2026, line: 'earth at night', t: 0, hold: 4.5 };

export const STOPS = [
  { id: 'sats', body: 'earth', year: 2030, line: '40,000 satellites in low earth orbit', t: 10.0, hold: 6.0 },
  { id: 'base', body: 'moon', year: 2036, line: "a base at the moon's south pole", t: 28.0, hold: 6.0 },
  { id: 'rail', body: 'moon', year: 2043, line: 'a railway around the moon', t: 42.0, hold: 6.0 },
  { id: 'city', body: 'mars', year: 2050, line: 'the first city on mars', t: 64.0, hold: 6.0 },
  { id: 'mirrors', body: 'mars', year: 2056, line: 'mirrors warming mars', t: 76.0, hold: 8.0 },
];

export const SEED = 20261012;
