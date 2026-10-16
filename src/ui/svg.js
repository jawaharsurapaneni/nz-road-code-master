// Original inline SVG diagrams and sign artwork.
//
// All diagrams use New Zealand left-hand traffic conventions. Every diagram is
// authored here as a build-time constant, embedded in the standalone file, and
// carries alt text that describes the layout without disclosing which answer
// is correct.

const ASPHALT = '#5b646e';
const VERGE = '#e9e7e0';   // decorative roadside; warmed to sit with the paper palette
const WHITE = '#ffffff';
const YELLOW = '#ffd24d';
const CAR_A = '#0b5fa5';
const CAR_B = '#c8102e';
const CAR_C = '#2f7d4f';
const INK = '#1d2328';

function carShape(x, y, heading, fill, label) {
  const tag = label
    ? `<g transform="rotate(${-heading})"><text x="0" y="4" text-anchor="middle" font-size="12" font-weight="700" fill="${WHITE}">${label}</text></g>`
    : '';
  return `<g transform="translate(${x} ${y}) rotate(${heading})">`
    + `<rect x="-10" y="-17" width="20" height="34" rx="5" fill="${fill}" stroke="${INK}" stroke-width="1.5"/>`
    + `<rect x="-7" y="-12" width="14" height="7" rx="2" fill="#d7e7f6" opacity=".85"/>`
    + `<rect x="-7" y="6" width="14" height="6" rx="2" fill="#d7e7f6" opacity=".85"/>`
    + tag
    + '</g>';
}

function pathArrow(key, d, colour) {
  return `<path d="${d}" fill="none" stroke="${colour || CAR_A}" stroke-width="3.5" `
    + `stroke-linecap="round" stroke-dasharray="9 6" marker-end="url(#m-${key})"/>`;
}

function label(x, y, str, anchor) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor || 'middle'}" font-size="13" `
    + `font-family="system-ui, sans-serif" fill="${INK}">${str}</text>`;
}

function scene(key, title, body, w, h) {
  const width = w || 420;
  const height = h || 260;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" `
    + `width="100%" role="img" aria-labelledby="t-${key}" focusable="false">`
    + `<title id="t-${key}">${title}</title>`
    + `<defs><marker id="m-${key}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" `
    + `orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${CAR_A}"/></marker></defs>`
    + `<rect width="${width}" height="${height}" fill="${VERGE}"/>`
    + body
    + '</svg>';
}

// Reusable road slabs -------------------------------------------------------

const vRoad = (x, w, h) => `<rect x="${x}" y="0" width="${w}" height="${h || 260}" fill="${ASPHALT}"/>`;
const hRoad = (y, h, w) => `<rect x="0" y="${y}" width="${w || 420}" height="${h}" fill="${ASPHALT}"/>`;
const vDash = (x, y1, y2) => `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${WHITE}" `
  + 'stroke-width="3" stroke-dasharray="14 12"/>';
const hDash = (y, x1, x2) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${WHITE}" `
  + 'stroke-width="3" stroke-dasharray="14 12"/>';

// ---------------------------------------------------------------------------
// Scene diagrams
// ---------------------------------------------------------------------------

const SCENES = {
  'uncontrolled-crossroads': {
    caption: 'Crossroads with no signs or signals on any approach.',
    title: 'A crossroads with no signs or signals. A blue car approaches from the south heading north. '
      + 'A red car approaches from the east heading west. Neither approach has a stop or give way sign.',
    body: `${hRoad(100, 60)}${vRoad(180, 60)}`
      + `${hDash(130, 0, 175)}${hDash(130, 245, 420)}`
      + `${vDash(210, 0, 95)}${vDash(210, 165, 260)}`
      + carShape(195, 205, 0, CAR_A, 'A')
      + carShape(330, 115, 270, CAR_B, 'B')
      + label(196, 248, 'A')
      + label(360, 150, 'B'),
  },
  't-intersection': {
    caption: 'A T-intersection. The road the blue car is on ends at the top road.',
    title: 'A T-intersection. A blue car travels north on a side road that ends at a through road running '
      + 'east to west. A red car travels west along the through road. No signs are shown.',
    body: `${hRoad(70, 60)}${vRoad(180, 60)}`
      + `${hDash(100, 0, 420)}`
      + `${vDash(210, 140, 260)}`
      + carShape(195, 185, 0, CAR_A, 'A')
      + carShape(320, 85, 270, CAR_B, 'B'),
  },
  'right-turn-conflict': {
    caption: 'Two vehicles approaching from opposite directions; one intends to turn right.',
    title: 'A crossroads. A blue car approaching from the south signals to turn right across the path of a '
      + 'red car approaching from the north and continuing straight ahead.',
    body: `${hRoad(100, 60)}${vRoad(180, 60)}`
      + `${hDash(130, 0, 175)}${hDash(130, 245, 420)}`
      + `${vDash(210, 0, 95)}${vDash(210, 165, 260)}`
      + carShape(197, 210, 0, CAR_A, 'A')
      + carShape(223, 55, 180, CAR_B, 'B')
      + pathArrow('right-turn-conflict', 'M197 195 L197 140 Q197 125 160 125 L40 125')
      + pathArrow('right-turn-conflict', 'M223 75 L223 215', CAR_B),
  },
  'stop-controlled-crossroads': {
    caption: 'A crossroads where one road has a stop sign and a white limit line.',
    title: 'A crossroads. The side road the blue car is on has a stop sign and a solid white limit line '
      + 'painted across it. The through road running east to west has no sign.',
    body: `${hRoad(100, 60)}${vRoad(180, 60)}`
      + `${hDash(130, 0, 175)}${hDash(130, 245, 420)}`
      + `<rect x="180" y="158" width="60" height="5" fill="${WHITE}"/>`
      + '<g transform="translate(152 172)">'
      + `<path d="M-12 -20 L12 -20 L20 -12 L20 12 L12 20 L-12 20 L-20 12 L-20 -12 z" fill="${CAR_B}" stroke="${WHITE}" stroke-width="2"/>`
      + `<text x="0" y="5" text-anchor="middle" font-size="11" font-weight="700" fill="${WHITE}">STOP</text></g>`
      + carShape(210, 210, 0, CAR_A, 'A')
      + carShape(330, 115, 270, CAR_B, 'B'),
  },
  'roundabout': {
    caption: 'A single-lane roundabout with three approaches occupied.',
    title: 'A single-lane roundabout. A blue car approaches from the south, a red car is already on the '
      + 'roundabout approaching from the east, and a green car waits on the western approach.',
    body: `${hRoad(100, 60)}${vRoad(180, 60)}`
      + `<circle cx="210" cy="130" r="74" fill="${ASPHALT}"/>`
      + `<circle cx="210" cy="130" r="40" fill="${VERGE}" stroke="${WHITE}" stroke-width="3"/>`
      + `<circle cx="210" cy="130" r="26" fill="#cfe0cb"/>`
      + `<path d="M210 78 A52 52 0 0 1 262 130" fill="none" stroke="${WHITE}" stroke-width="2" stroke-dasharray="6 6"/>`
      + carShape(210, 228, 0, CAR_A, 'A')
      + carShape(268, 104, 225, CAR_B, 'B')
      + carShape(100, 148, 90, CAR_C, 'C'),
  },
  'pedestrian-crossing': {
    caption: 'A marked pedestrian (zebra) crossing with white stripes.',
    title: 'A two-lane road with a marked pedestrian crossing. A person is standing on the footpath at the '
      + 'left-hand kerb, about to step onto the crossing. A blue car approaches the crossing from the left.',
    body: `${hRoad(90, 90)}`
      + `${hDash(135, 0, 230)}${hDash(135, 300, 420)}`
      + '<g>'
      + [0, 1, 2, 3, 4, 5].map((i) => `<rect x="${240 + i * 12}" y="92" width="7" height="86" fill="${WHITE}"/>`).join('')
      + '</g>'
      + carShape(120, 158, 90, CAR_A, 'A')
      + '<g transform="translate(262 68)">'
      + `<circle cx="0" cy="-8" r="6" fill="${INK}"/>`
      + `<rect x="-4" y="-2" width="8" height="14" rx="3" fill="${INK}"/>`
      + `<line x1="-3" y1="12" x2="-6" y2="22" stroke="${INK}" stroke-width="3"/>`
      + `<line x1="3" y1="12" x2="6" y2="22" stroke="${INK}" stroke-width="3"/></g>`,
  },
  'railway-crossing': {
    caption: 'A level crossing with crossbuck signs and a limit line.',
    title: 'A road crossing a railway line at right angles. Crossbuck signs stand on each side of the road '
      + 'and a white limit line is painted on the road before the rails. A blue car approaches the crossing.',
    body: `${vRoad(170, 80)}`
      + `${vDash(210, 0, 260)}`
      + `<rect x="0" y="104" width="420" height="34" fill="#8a7f6d"/>`
      + `<rect x="0" y="108" width="420" height="4" fill="${INK}"/>`
      + `<rect x="0" y="130" width="420" height="4" fill="${INK}"/>`
      + `<rect x="172" y="160" width="76" height="5" fill="${WHITE}"/>`
      + '<g transform="translate(145 150)">'
      + `<rect x="-2" y="0" width="4" height="40" fill="#777"/>`
      + `<g transform="rotate(45)"><rect x="-22" y="-5" width="44" height="10" fill="${WHITE}" stroke="${INK}" stroke-width="1.5"/></g>`
      + `<g transform="rotate(-45)"><rect x="-22" y="-5" width="44" height="10" fill="${WHITE}" stroke="${INK}" stroke-width="1.5"/></g></g>`
      + carShape(230, 205, 0, CAR_A, 'A'),
  },
  'motorway-merge': {
    caption: 'An on-ramp merging into the left lane of a motorway.',
    title: 'A motorway with two lanes running left to right and an on-ramp joining from the lower left. '
      + 'A blue car is on the on-ramp and a red car is travelling in the left-hand motorway lane.',
    body: `${hRoad(60, 80)}`
      + `${hDash(100, 0, 420)}`
      + `<path d="M0 240 L140 240 Q250 240 300 142 L300 140 L250 140 Q215 215 130 215 L0 215 z" fill="${ASPHALT}"/>`
      + `<line x1="140" y1="140" x2="300" y2="140" stroke="${WHITE}" stroke-width="3" stroke-dasharray="14 12"/>`
      + carShape(140, 228, 90, CAR_A, 'A')
      + carShape(180, 120, 90, CAR_B, 'B')
      + label(60, 50, 'Motorway', 'start')
      + label(20, 256, 'On-ramp', 'start'),
  },
  'lane-change': {
    caption: 'A three-lane one-way road with a vehicle in the next lane.',
    title: 'Three lanes running in the same direction. A blue car is in the centre lane. A red car is '
      + 'slightly behind it in the right-hand lane, close to the blue car’s rear corner.',
    body: `${hRoad(40, 180)}`
      + `${hDash(100, 0, 420)}${hDash(160, 0, 420)}`
      + carShape(210, 130, 90, CAR_A, 'A')
      + carShape(165, 190, 90, CAR_B, 'B')
      + pathArrow('lane-change', 'M232 130 Q280 130 300 190')
      + label(40, 32, 'Same direction of travel', 'start'),
  },
  'centre-lines': {
    caption: 'Three centre-line patterns on a two-way road.',
    title: 'Three sections of a two-way road shown one above the other. The top has a dashed white centre '
      + 'line, the middle has one solid yellow line beside a dashed white line, and the bottom has two solid yellow lines.',
    body: `${hRoad(20, 56)}${hRoad(102, 56)}${hRoad(184, 56)}`
      + `${hDash(48, 10, 410)}`
      + `<line x1="10" y1="126" x2="410" y2="126" stroke="${YELLOW}" stroke-width="4"/>`
      + `<line x1="10" y1="134" x2="410" y2="134" stroke="${WHITE}" stroke-width="3" stroke-dasharray="14 12"/>`
      + `<line x1="10" y1="208" x2="410" y2="208" stroke="${YELLOW}" stroke-width="4"/>`
      + `<line x1="10" y1="216" x2="410" y2="216" stroke="${YELLOW}" stroke-width="4"/>`
      + label(12, 16, 'Pattern 1', 'start') + label(12, 98, 'Pattern 2', 'start') + label(12, 180, 'Pattern 3', 'start'),
  },
  'traffic-light-head': {
    caption: 'A standard three-aspect traffic signal.',
    title: 'A traffic signal head with three lenses. The top red lens is dark, the middle amber lens is '
      + 'lit, and the bottom green lens is dark.',
    body: '<g transform="translate(210 130)">'
      + `<rect x="-36" y="-96" width="72" height="192" rx="12" fill="#2b3138" stroke="${INK}" stroke-width="2"/>`
      + `<circle cx="0" cy="-58" r="24" fill="#4a2024"/>`
      + `<circle cx="0" cy="0" r="24" fill="#ffb81c"/>`
      + `<circle cx="0" cy="58" r="24" fill="#1d3a2a"/></g>`,
  },
  'rural-blind-curve': {
    caption: 'A rural two-lane road curving out of sight behind a bank.',
    title: 'A rural two-lane road curving to the right and disappearing behind a bank of trees, so the road '
      + 'beyond the curve cannot be seen. A blue car approaches the curve.',
    body: `<path d="M120 260 L120 150 Q120 70 230 70 L420 70 L420 130 L240 130 Q180 130 180 185 L180 260 z" fill="${ASPHALT}"/>`
      + `<path d="M150 260 L150 160 Q150 100 235 100 L420 100" fill="none" stroke="${WHITE}" stroke-width="3" stroke-dasharray="14 12"/>`
      + `<path d="M250 20 Q320 10 360 48 Q400 20 420 60 L420 0 L240 0 z" fill="#9cb79a"/>`
      + `<ellipse cx="300" cy="40" rx="60" ry="34" fill="#8aa88a"/>`
      + carShape(135, 215, 0, CAR_A, 'A'),
  },
  'school-bus': {
    caption: 'A school bus stopped on the opposite side of a two-way road.',
    title: 'A two-way road. A yellow school bus is stopped on the far side of the road with children beside '
      + 'it. A blue car approaches in the near lane from the left.',
    body: `${hRoad(80, 100)}`
      + `${hDash(130, 0, 420)}`
      + `<rect x="230" y="86" width="130" height="38" rx="6" fill="#f2c200" stroke="${INK}" stroke-width="1.5"/>`
      + `<rect x="240" y="92" width="26" height="16" rx="3" fill="#d7e7f6"/>`
      + `<rect x="274" y="92" width="26" height="16" rx="3" fill="#d7e7f6"/>`
      + `<rect x="308" y="92" width="26" height="16" rx="3" fill="#d7e7f6"/>`
      + `<text x="295" y="120" text-anchor="middle" font-size="11" font-weight="700" fill="${INK}">SCHOOL</text>`
      + '<g transform="translate(372 96)">'
      + `<circle cx="0" cy="-6" r="5" fill="${INK}"/><rect x="-3" y="0" width="6" height="12" rx="2" fill="${INK}"/></g>`
      + carShape(130, 158, 90, CAR_A, 'A'),
  },
  'following-distance': {
    caption: 'Two vehicles travelling in the same lane with a gap between them.',
    title: 'Two cars travelling left to right in the same lane. A red car is ahead and a blue car follows '
      + 'behind it, with a marked gap between the two vehicles.',
    body: `${hRoad(90, 80)}`
      + `${hDash(130, 0, 420)}`
      + carShape(300, 155, 90, CAR_B, 'B')
      + carShape(110, 155, 90, CAR_A, 'A')
      + `<line x1="132" y1="205" x2="278" y2="205" stroke="${CAR_A}" stroke-width="2"/>`
      + `<line x1="132" y1="198" x2="132" y2="212" stroke="${CAR_A}" stroke-width="2"/>`
      + `<line x1="278" y1="198" x2="278" y2="212" stroke="${CAR_A}" stroke-width="2"/>`
      + label(205, 230, 'following gap'),
  },
  'cyclist-left': {
    caption: 'A cyclist riding near the left kerb ahead of a following vehicle.',
    title: 'A two-way road. A cyclist is riding close to the left-hand kerb. A blue car is behind the '
      + 'cyclist in the same lane, and a red car is approaching in the opposite lane.',
    body: `${hRoad(80, 100)}`
      + `${hDash(130, 0, 420)}`
      + '<g transform="translate(250 162)">'
      + `<circle cx="-13" cy="8" r="9" fill="none" stroke="${INK}" stroke-width="2.5"/>`
      + `<circle cx="13" cy="8" r="9" fill="none" stroke="${INK}" stroke-width="2.5"/>`
      + `<path d="M-13 8 L0 -4 L13 8 M0 -4 L4 -12" fill="none" stroke="${INK}" stroke-width="2.5"/>`
      + `<circle cx="7" cy="-18" r="5" fill="${CAR_C}"/></g>`
      + carShape(130, 158, 90, CAR_A, 'A')
      + carShape(330, 105, 270, CAR_B, 'B'),
  },
  'parking-kerb': {
    caption: 'A vehicle parked at the kerb on a two-way road.',
    title: 'A straight two-way road with a vehicle parked parallel to the left-hand kerb, and a marked '
      + 'distance between the parked vehicle and an intersection further along the road.',
    body: `${hRoad(70, 100)}${vRoad(300, 60, 260)}`
      + `${hDash(120, 0, 295)}${hDash(120, 365, 420)}`
      + carShape(150, 150, 90, CAR_A, 'A')
      + `<line x1="175" y1="196" x2="296" y2="196" stroke="${CAR_B}" stroke-width="2"/>`
      + `<line x1="175" y1="189" x2="175" y2="203" stroke="${CAR_B}" stroke-width="2"/>`
      + `<line x1="296" y1="189" x2="296" y2="203" stroke="${CAR_B}" stroke-width="2"/>`
      + label(235, 220, 'distance to the intersection'),
  },
  'overtaking-sight': {
    caption: 'A two-way road with a slower vehicle ahead and an oncoming vehicle.',
    title: 'A straight two-way road with a dashed centre line. A blue car is behind a slower green vehicle '
      + 'in the left lane, and a red car is approaching in the opposite lane some distance ahead.',
    body: `${hRoad(80, 100)}`
      + `${hDash(130, 0, 420)}`
      + carShape(90, 158, 90, CAR_A, 'A')
      + carShape(180, 158, 90, CAR_C, 'C')
      + carShape(360, 105, 270, CAR_B, 'B')
      + pathArrow('overtaking-sight', 'M112 150 Q150 110 215 108 Q260 108 280 150'),
  },
  'multi-lane-turn': {
    caption: 'A multi-lane approach with turn arrows painted on the road.',
    title: 'An approach to an intersection with three marked lanes. The left lane has a left-turn arrow, '
      + 'the centre lane a straight-ahead arrow, and the right lane a right-turn arrow.',
    body: `${vRoad(120, 180)}`
      + `${vDash(180, 0, 200)}${vDash(240, 0, 200)}`
      + `<rect x="120" y="200" width="180" height="5" fill="${WHITE}"/>`
      + `<path d="M150 170 L150 120 L132 120 M150 120 L138 110 M150 120 L138 130" fill="none" stroke="${WHITE}" stroke-width="4"/>`
      + `<path d="M210 170 L210 110 M210 110 L202 120 M210 110 L218 120" fill="none" stroke="${WHITE}" stroke-width="4"/>`
      + `<path d="M270 170 L270 120 L288 120 M288 120 L276 110 M288 120 L276 130" fill="none" stroke="${WHITE}" stroke-width="4"/>`
      + label(80, 100, 'Left', 'middle') + label(345, 100, 'Right', 'middle'),
  },
};

// ---------------------------------------------------------------------------
// Sign artwork
// ---------------------------------------------------------------------------

function signSvg(key, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160" `
    + `role="img" aria-labelledby="t-${key}" focusable="false">`
    + `<title id="t-${key}">${title}</title>`
    + `<rect width="160" height="160" fill="${VERGE}"/>${body}</svg>`;
}

const REG_RING = `<circle cx="80" cy="80" r="62" fill="${WHITE}" stroke="${CAR_B}" stroke-width="14"/>`;
const SLASH = `<line x1="36" y1="124" x2="124" y2="36" stroke="${CAR_B}" stroke-width="12" stroke-linecap="round"/>`;
const DIAMOND = `<g transform="translate(80 80) rotate(45)"><rect x="-54" y="-54" width="108" height="108" rx="8" `
  + `fill="#ffcf2e" stroke="${INK}" stroke-width="5"/></g>`;

const SIGNS = {
  'sign-no-entry': {
    caption: 'A regulatory sign.',
    title: 'A round sign with a red background and a wide white horizontal bar across the centre.',
    body: `<circle cx="80" cy="80" r="62" fill="${CAR_B}" stroke="${WHITE}" stroke-width="5"/>`
      + `<rect x="34" y="68" width="92" height="24" rx="3" fill="${WHITE}"/>`,
  },
  'sign-no-right-turn': {
    caption: 'A regulatory sign.',
    title: 'A round sign with a white background, a thick red ring, a black arrow curving to the right, and '
      + 'a red diagonal line across it.',
    body: REG_RING
      + `<path d="M62 118 L62 76 Q62 60 86 60 L104 60" fill="none" stroke="${INK}" stroke-width="10"/>`
      + `<path d="M100 44 L122 60 L100 76 z" fill="${INK}"/>`
      + SLASH,
  },
  'sign-keep-left': {
    caption: 'A regulatory sign.',
    title: 'A round sign with a blue background and a white arrow angled up and to the left.',
    body: `<circle cx="80" cy="80" r="62" fill="#0b5fa5" stroke="${WHITE}" stroke-width="5"/>`
      + `<path d="M104 116 L104 72 L124 72 L80 36 L36 72 L56 72 L56 116 z" fill="${WHITE}" transform="rotate(-90 80 80)"/>`,
  },
  'sign-speed-limit': {
    caption: 'A regulatory sign.',
    title: 'A round sign with a white background, a thick red ring, and the number 50 in black in the centre.',
    body: REG_RING
      + `<text x="80" y="102" text-anchor="middle" font-size="62" font-weight="700" `
      + `font-family="system-ui, sans-serif" fill="${INK}">50</text>`,
  },
  'sign-warning-crossroads': {
    caption: 'A warning sign.',
    title: 'A yellow diamond-shaped sign with a black symbol of two roads crossing at right angles.',
    body: DIAMOND
      + `<rect x="74" y="36" width="12" height="88" fill="${INK}"/>`
      + `<rect x="36" y="74" width="88" height="12" fill="${INK}"/>`,
  },
  'sign-warning-side-road': {
    caption: 'A warning sign.',
    title: 'A yellow diamond-shaped sign with a black symbol of a road joining from the right of a '
      + 'continuing road.',
    body: DIAMOND
      + `<rect x="74" y="36" width="12" height="88" fill="${INK}"/>`
      + `<rect x="80" y="74" width="44" height="12" fill="${INK}"/>`,
  },
  'sign-warning-pedestrian': {
    caption: 'A warning sign.',
    title: 'A yellow diamond-shaped sign with a black symbol of a person walking.',
    body: DIAMOND
      + '<g transform="translate(80 54)">'
      + `<circle cx="0" cy="0" r="9" fill="${INK}"/>`
      + `<rect x="-6" y="11" width="12" height="24" rx="4" fill="${INK}"/>`
      + `<line x1="-4" y1="34" x2="-14" y2="56" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`
      + `<line x1="4" y1="34" x2="14" y2="56" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`
      + `<line x1="-6" y1="18" x2="-18" y2="30" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`
      + `<line x1="6" y1="18" x2="18" y2="28" stroke="${INK}" stroke-width="6" stroke-linecap="round"/></g>`,
  },
  'sign-warning-slippery': {
    caption: 'A warning sign.',
    title: 'A yellow diamond-shaped sign with a black symbol of a car above two wavy skid lines.',
    body: DIAMOND
      + `<rect x="58" y="44" width="44" height="30" rx="6" fill="${INK}"/>`
      + `<rect x="66" y="50" width="28" height="10" rx="2" fill="#ffcf2e"/>`
      + `<path d="M46 92 Q62 80 78 92 Q94 104 110 92" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`
      + `<path d="M46 112 Q62 100 78 112 Q94 124 110 112" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`,
  },
  'sign-warning-merge': {
    caption: 'A warning sign.',
    title: 'A yellow diamond-shaped sign with a black symbol of two lines converging into one.',
    body: DIAMOND
      + `<path d="M80 36 L80 124" stroke="${INK}" stroke-width="11"/>`
      + `<path d="M118 124 L118 96 Q118 74 86 64" fill="none" stroke="${INK}" stroke-width="11"/>`,
  },
  'sign-warning-roundabout': {
    caption: 'A warning sign.',
    title: 'A yellow diamond-shaped sign with a black symbol of three arrows arranged in a circle.',
    body: DIAMOND
      + `<circle cx="80" cy="80" r="30" fill="none" stroke="${INK}" stroke-width="10" stroke-dasharray="40 16"/>`
      + `<path d="M80 40 L92 52 L68 52 z" fill="${INK}"/>`
      + `<path d="M46 98 L62 92 L54 112 z" fill="${INK}"/>`
      + `<path d="M114 98 L106 112 L98 92 z" fill="${INK}"/>`,
  },
  'sign-railway-crossbuck': {
    caption: 'A sign at a level crossing.',
    title: 'Two white rectangular blades crossed to form an X shape on a post.',
    body: '<g transform="translate(80 78)">'
      + `<g transform="rotate(45)"><rect x="-58" y="-11" width="116" height="22" rx="3" fill="${WHITE}" stroke="${INK}" stroke-width="3"/></g>`
      + `<g transform="rotate(-45)"><rect x="-58" y="-11" width="116" height="22" rx="3" fill="${WHITE}" stroke="${INK}" stroke-width="3"/></g></g>`
      + '<rect x="76" y="118" width="8" height="38" fill="#8d949c"/>',
  },
  'sign-motorway': {
    caption: 'An information sign.',
    title: 'A green rectangular sign with a white symbol of a divided road narrowing towards the top.',
    body: `<rect x="18" y="26" width="124" height="108" rx="8" fill="${CAR_C}" stroke="${WHITE}" stroke-width="4"/>`
      + `<path d="M48 120 L66 50 L74 50 L68 120 z" fill="${WHITE}"/>`
      + `<path d="M112 120 L94 50 L86 50 L92 120 z" fill="${WHITE}"/>`
      + `<rect x="76" y="46" width="8" height="74" fill="${WHITE}"/>`,
  },
};

// ---------------------------------------------------------------------------

export const DIAGRAMS = (() => {
  const out = {};
  Object.keys(SCENES).forEach((key) => {
    const d = SCENES[key];
    out[key] = { key, title: d.title, caption: d.caption, markup: scene(key, d.title, d.body) };
  });
  Object.keys(SIGNS).forEach((key) => {
    const d = SIGNS[key];
    out[key] = { key, title: d.title, caption: d.caption, markup: signSvg(key, d.title, d.body) };
  });
  return out;
})();

export const DIAGRAM_KEYS = Object.keys(DIAGRAMS);

export function hasDiagram(key) {
  return !!(key && DIAGRAMS[key]);
}

export function diagramFor(key) {
  return DIAGRAMS[key] || null;
}
