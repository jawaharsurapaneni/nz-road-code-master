// Ruleset definitions. The app always displays which ruleset is active, its
// effective date and when the question bank was last verified, so a user is
// never guessing which rules a question is being marked against.
//
// Every claim below was checked against the NZTA pages cited in `sources`.

import { RULESET_CURRENT, RULESET_2027 } from './schema.js';

// The date the bank's rules were last checked against official sources.
export const BANK_LAST_VERIFIED = '2026-10-14';

export const RULESETS = Object.freeze([
  {
    id: RULESET_CURRENT,
    label: 'Current rules',
    effectiveFrom: 'In force now',
    effectiveTo: '24 January 2027',
    summary:
      'The graduated driver licensing rules in force today. Learner period 6 months, '
      + 'restricted period 18 months under 25 (6 months if 25 or over), and a full licence '
      + 'practical test is still required.',
    sources: [
      'https://www.nzta.govt.nz/driver-licences/getting-a-licence/take-your-test/theory-tests',
      'https://www.nzta.govt.nz/driver-licences/getting-a-licence/licences-by-vehicle-type/cars/restricted-licence/',
    ],
  },
  {
    id: RULESET_2027,
    label: 'From 25 January 2027',
    effectiveFrom: '25 January 2027',
    effectiveTo: null,
    summary:
      'Confirmed changes to the graduated driver licensing system. Only the questions that '
      + 'actually change under these rules are presented differently; everything else is '
      + 'identical to the current ruleset.',
    sources: [
      'https://www.nzta.govt.nz/driver-licences/getting-a-licence/proposed-changes-to-graduated-driver-licensing/moving-to-the-new-car-licence-system',
    ],
  },
]);

// The specific confirmed changes, shown in the app's ruleset panel. Keeping
// these as data (rather than prose buried in the UI) makes them easy to update
// if NZTA revises the detail before commencement.
export const CHANGES_2027 = Object.freeze([
  {
    area: 'Learner licence period (under 25)',
    current: '6 months',
    future: '12 months, reducible back to 6 months by completing an approved practical driving course or logging supervised driving hours',
  },
  {
    area: 'Learner licence period (25 and over)',
    current: '6 months',
    future: '6 months (no change)',
  },
  {
    area: 'Restricted licence period (under 25)',
    current: '18 months, or 12 months after an approved advanced driving course',
    future: '12 months. An advanced driving course no longer reduces the restricted period',
  },
  {
    area: 'Restricted licence period (25 and over)',
    current: '6 months',
    future: '6 months (no change)',
  },
  {
    area: 'Full licence practical test',
    current: 'Required, along with an eyesight check',
    future: 'Removed. Progression is based on time held plus a clean demerit record',
  },
  {
    area: 'Demerit points on a restricted licence',
    current: 'No automatic extension of the restricted period',
    future: 'Demerits received from 7 May 2026 can extend the restricted period by 6 months each, applied from 25 January 2027',
  },
]);

export function rulesetById(id) {
  return RULESETS.find((r) => r.id === id) || RULESETS[0];
}

export function rulesetIds() {
  return RULESETS.map((r) => r.id);
}
