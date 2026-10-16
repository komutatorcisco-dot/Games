// node tests/coach.test.js — обучение: не вылезает поверх игр и окон, идёт по шагам, пропустить нельзя, дошёл до конца — больше не показывается.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('js/coach.js', 'utf8');
const core = fs.readFileSync('js/core.js', 'utf8');
function setup() {
  const nodes = [], btns = {}, calls = [];
  const target = { offsetParent: {}, focus() {}, getBoundingClientRect: () => ({ left: 0, top: 80, width: 100, height: 40, right: 100, bottom: 120 }) };
  const modal = { hidden: true, classList: { contains: () => false, remove() {} } };
  const ctx = {
    Store: { d: { ui: {}, user: { nick: 'Тест' } }, save() {} },
    Sound: { play() {} }, haptic() {}, innerHeight: 844,
    sheet: false,
    Guess: { startCareer() { calls.push('match'); } },
    Rewards: { openDrop(o) { calls.push('pack'); o.onStart(); o.onDone(); } },
    window: { scrollTo() {} }, setTimeout() {}, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, later() {},
    $$: () => [],
    document: {
      getElementById: () => null,
      body: { appendChild: el => nodes.push(el) },
      createElement: () => ({ addEventListener(name, fn) { this[name] = fn; }, remove() { nodes.splice(nodes.indexOf(this), 1); } }),
    },
  };
  ctx.$ = (selector, root) => {
    if (root) return { addEventListener: (n, fn) => { btns[selector] = fn; } };
    return selector === '#modal' ? modal : selector === '#modal-card' ? {} : selector === '.btns' ? {} : selector.startsWith('.po') ? (ctx.sheet ? {} : null) : target;
  };
  vm.createContext(ctx);
  vm.runInContext(core.slice(core.indexOf('const Screens ='), core.indexOf('// Встряхнуть')), ctx);
  vm.runInContext(core.slice(core.indexOf('const Modal ='), core.indexOf('function confetti()')), ctx);
  vm.runInContext(source, ctx);
  const tapIn = () => nodes[0].click({ clientX: 50, clientY: 100, stopPropagation() {} });
  const tapOut = () => nodes[0].click({ clientX: 300, clientY: 600, stopPropagation() {} });
  return { ctx, nodes, btns, calls, tapIn, tapOut, run: code => vm.runInContext(code, ctx), step: () => ctx.Store.d.ui.tut };
}
{
  const { run, nodes } = setup();
  run('Coach.maybe()'); assert.equal(nodes.length, 1);
  run("Screens.show('ng')"); assert.equal(nodes.length, 0, 'navigation removes active overlay');
  run('Coach.maybe()'); assert.equal(nodes.length, 0, 'late callback cannot open over game');
  run("Screens.show('hub'); Coach.maybe()"); assert.equal(nodes.length, 1, 'interrupted tour can restart');
  run("Modal.open('Rules')"); assert.equal(nodes.length, 0, 'rules replace onboarding');
  run('Coach.maybe()'); assert.equal(nodes.length, 0, 'no onboarding over modal');
}
{
  const { ctx, run, nodes, btns, calls, tapIn, tapOut, step } = setup();
  ctx.Store.d.ui.coach = 1; // прошёл старое обучение — новое всё равно покажем
  ctx.sheet = true; run('Coach.maybe()'); assert.equal(nodes.length, 0, 'picker blocks delayed onboarding');
  ctx.sheet = false; run('Coach.maybe()'); assert.equal(nodes.length, 1, 'old players see the new tour');
  btns['.co-go'](); assert.equal(step(), 2);
  run('Coach.maybe()'); tapOut(); assert.equal(step(), 2, 'tap outside the highlight does nothing — no skipping');
  tapIn(); assert.equal(step(), 3); assert.deepEqual(calls, ['match']);
  assert.equal(ctx.Store.d.howto.guess, 1, 'standard rules popup is replaced by coach tips');
  run('Coach.matchDone()'); assert.equal(step(), 4);
  run("Screens.show('hub'); Coach.maybe()"); tapIn(); assert.equal(step(), 5);
  run('Coach.maybe()'); tapIn(); assert.equal(step(), 6);
  run('Coach.maybe()'); btns['.co-go'](); assert.equal(step(), 7); assert.deepEqual(calls, ['match', 'pack']);
  run('Coach.maybe()'); btns['.co-go'](); assert.equal(step(), 99, 'complete only after final step');
  run('Coach.maybe()'); assert.equal(nodes.length, 0, 'completed tour stays dismissed');
}
{
  const { ctx, run, step } = setup();
  ctx.Store.d.ui.tut = 3; // закрыл игру посреди первого матча
  run('Coach.maybe()'); assert.equal(step(), 2, 'unfinished first match starts again from the Play button');
}
console.log('Onboarding regression checks passed');
