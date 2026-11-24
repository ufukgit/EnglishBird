import { containsTarget } from '../src/lib/match';
const cases: [string, string, boolean][] = [
  ['Could we get the bill please', 'bill', true],
  ['Lunch is on me today', "it's on me", true],
  ['Can I get it to go', 'to go', true],
  ['I ran into an old friend today', 'run into', true],
  ['He hung up on me', 'hang up', true],
  ['Sorry we are out of salmon', "we're out of", true],
  ['Could you give me a lift home', 'give someone a lift', true],
  ['I locked myself out', 'locked myself out', true],
  ['I think I sprained my ankle', 'sprain', true],
  ['We have run out of coffee', 'run out of', true],
  ['I would like a refund', 'refund', true],
  ['It takes twenty minutes', 'it takes', true],
  ['I need a lift', 'give someone a lift', false],
  ['Could we get the check please', 'bill', false],
  ["I was wondering if you could help me", 'I was wondering if…', true],
  ["Would you mind closing the window", 'Would you mind…?', true],
  ["I'd love to but I'm busy", "I'd love to, but…", true],
  ["How did your interview go", 'How did … go?', true],
  ["I've been meaning to call you", "I've been meaning to…", true],
  ['Do you happen to know where it is', 'Do you happen to know…?', true],
  ['I was going to call but I forgot', 'I was going to…, but…', true],
];
let fail = 0;
for (const [h, t, exp] of cases) { const r = containsTarget(h, t); if (r.ok !== exp) { fail++; console.log('FAIL', JSON.stringify(h), t, r); } }
console.log(cases.length - fail, '/', cases.length);
const more: [string, string, boolean][] = [
  ['Is it OK if I sit here', 'Is it okay if I…?', true],
  ['Is it alright if I sit here', 'Is it all right if I…', true],
  ['I want to check-in please', 'check in', true],
  ["What's the wifi password", 'Wi-Fi password', true],
];
for (const [h, t, exp] of more) { const r = containsTarget(h, t); if (r.ok !== exp) console.log('FAIL2', h, t, r); }
console.log('more done');
if (fail) process.exit(1);
