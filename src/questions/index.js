// The assembled question bank. Each topic owns one file and one contiguous
// block of NZRC ids; this module only concatenates and freezes them.

import { Q_SIGNS } from './01-signs.js';
import { Q_INTERSECTIONS } from './02-intersections.js';
import { Q_SPEED } from './03-speed.js';
import { Q_MARKINGS } from './04-markings.js';
import { Q_FOLLOWING } from './05-following.js';
import { Q_PARKING } from './06-parking.js';
import { Q_OVERTAKING } from './07-overtaking.js';
import { Q_VULNERABLE } from './08-vulnerable.js';
import { Q_SPECIAL } from './09-special.js';
import { Q_IMPAIRMENT } from './10-impairment.js';
import { Q_RESTRAINTS } from './11-restraints.js';
import { Q_VEHICLE } from './12-vehicle.js';
import { Q_WEATHER } from './13-weather.js';
import { Q_RURAL } from './14-rural.js';
import { Q_RESTRICTED } from './15-restricted.js';
import { Q_SCENARIOS } from './16-scenarios.js';

export const QUESTIONS = Object.freeze([
  ...Q_SIGNS,
  ...Q_INTERSECTIONS,
  ...Q_SPEED,
  ...Q_MARKINGS,
  ...Q_FOLLOWING,
  ...Q_PARKING,
  ...Q_OVERTAKING,
  ...Q_VULNERABLE,
  ...Q_SPECIAL,
  ...Q_IMPAIRMENT,
  ...Q_RESTRAINTS,
  ...Q_VEHICLE,
  ...Q_WEATHER,
  ...Q_RURAL,
  ...Q_RESTRICTED,
  ...Q_SCENARIOS,
].map(Object.freeze));

export const QUESTION_IDS = Object.freeze(QUESTIONS.map((q) => q.id));
