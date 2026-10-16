// Question-bank schema: canonical topics, ID allocation, difficulty levels and
// field constants. Shared by the app, the validator and the report generator.

export const APP_NAME = 'NZ Road Code Master';
export const APP_SUBTITLE = 'Theory & Restricted Test Prep';
export const APP_VERSION = '1.0.0';

export const OPTION_IDS = ['A', 'B', 'C', 'D'];
export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

export const RULESET_CURRENT = 'current';
export const RULESET_2027 = '2027-01-25';

// Official learner licence theory test parameters (NZTA, verified 2026-10-14).
export const THEORY_MOCK = Object.freeze({
  questionCount: 35,
  passMark: 32,
  timeLimitSeconds: 30 * 60,
});

// Each topic owns a contiguous block of NZRC ids so a topic file can be
// regenerated without renumbering the rest of the bank.
export const TOPICS = Object.freeze([
  { key: 'signs',        label: 'Road signs, signals and traffic lights',            target: 25, idFrom: 1,   idTo: 25 },
  { key: 'intersections',label: 'Intersections, give-way rules and turning',         target: 30, idFrom: 26,  idTo: 55 },
  { key: 'speed',        label: 'Speed limits and choosing a safe speed',            target: 20, idFrom: 56,  idTo: 75 },
  { key: 'markings',     label: 'Road markings, lanes and lane changes',             target: 15, idFrom: 76,  idTo: 90 },
  { key: 'following',    label: 'Following distances and stopping distances',        target: 15, idFrom: 91,  idTo: 105 },
  { key: 'parking',      label: 'Parking, stopping and restricted areas',            target: 15, idFrom: 106, idTo: 120 },
  { key: 'overtaking',   label: 'Overtaking and passing other vehicles',             target: 15, idFrom: 121, idTo: 135 },
  { key: 'vulnerable',   label: 'Pedestrians, cyclists and vulnerable road users',   target: 20, idFrom: 136, idTo: 155 },
  { key: 'special',      label: 'School buses, emergency vehicles and special situations', target: 15, idFrom: 156, idTo: 170 },
  { key: 'impairment',   label: 'Alcohol, drugs, fatigue and driver impairment',     target: 15, idFrom: 171, idTo: 185 },
  { key: 'restraints',   label: 'Seatbelts, passengers and child restraints',        target: 10, idFrom: 186, idTo: 195 },
  { key: 'vehicle',      label: 'Vehicle safety, tyres, lights and maintenance',     target: 10, idFrom: 196, idTo: 205 },
  { key: 'weather',      label: 'Weather, night driving and hazard management',      target: 20, idFrom: 206, idTo: 225 },
  { key: 'rural',        label: 'Railway crossings, motorways and rural roads',      target: 15, idFrom: 226, idTo: 240 },
  { key: 'restricted',   label: 'Restricted licence conditions and safe solo driving', target: 15, idFrom: 241, idTo: 255 },
  { key: 'scenarios',    label: 'Restricted practical scenarios',                    target: 20, idFrom: 256, idTo: 275 },
]);

export const TOPIC_KEYS = TOPICS.map((t) => t.key);

// Topics whose questions feed the Restricted Practical Test Preparation module.
export const RESTRICTED_MODULE_TOPICS = ['restricted', 'scenarios'];

// Tags that additionally qualify a question for the restricted module.
export const RESTRICTED_MODULE_TAGS = [
  'observation', 'mirrors', 'blind-spot', 'signalling', 'lane-position',
  'gap-selection', 'hazard', 'defensive', 'scanning',
];

export function topicByKey(key) {
  return TOPICS.find((t) => t.key === key) || null;
}

export function topicLabel(key) {
  const t = topicByKey(key);
  return t ? t.label : key;
}

export function formatQuestionId(n) {
  return `NZRC-${String(n).padStart(3, '0')}`;
}

export function questionIdNumber(id) {
  const m = /^NZRC-(\d{3,})$/.exec(String(id || ''));
  return m ? Number(m[1]) : NaN;
}

// A question is "available" under a ruleset when it lists it. Questions whose
// answer changes on 25 Jan 2027 carry a variant2027 override block.
export function appliesToRuleset(q, ruleset) {
  const list = Array.isArray(q.rulesets) ? q.rulesets : [RULESET_CURRENT];
  return list.includes(ruleset);
}

// Returns the question as it should be presented under the given ruleset,
// applying variant2027 when the future ruleset is selected. Never mutates.
export function resolveQuestion(q, ruleset) {
  if (ruleset !== RULESET_2027 || !q.variant2027) return q;
  const v = q.variant2027;
  return {
    ...q,
    question: v.question || q.question,
    scenario: v.scenario !== undefined ? v.scenario : q.scenario,
    options: v.options || q.options,
    correctOptionId: v.correctOptionId || q.correctOptionId,
    explanation: v.explanation || q.explanation,
    realWorldExample: v.realWorldExample !== undefined ? v.realWorldExample : q.realWorldExample,
    sourceUrl: v.sourceUrl || q.sourceUrl,
    sourceSection: v.sourceSection || q.sourceSection,
    lastVerified: v.lastVerified || q.lastVerified,
    _variantApplied: true,
  };
}

export function correctOption(q) {
  return q.options.find((o) => o.id === q.correctOptionId) || null;
}

export function optionById(q, id) {
  return q.options.find((o) => o.id === id) || null;
}
