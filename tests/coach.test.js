// node tests/coach.test.js — onboarding must not leak into games or dialogs.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('js/coach.js', 'utf8');
const core = fs.readFileSync('js/core.js', 'utf8');
function setup() {
  const nodes = [];
  const target = { offsetParent: {}, getBoundingClientRect: () => ({ left: 0, top: 80, width: 100, height: 40, bottom: 120 }) };
  const modal = { hidden: true, classList: { contains: () => false, remove() {} } };
  const ctx = {
    Store: { d: { ui: {}, user: { nick: 'Тест' } }, save() {} },
    Sound: { play() {} }, haptic() {}, innerHeight: 844,
    sheet: false, Rewards: { S: () => ({ trophies: 0 }) },
    window: { scrollTo() {} }, setTimeout() {}, clearTimeout() {},
    $$: () => [],
    document: {
      getElementById: () => null,
      body: { appendChild: el => nodes.push(el) },
      createElement: () => ({ addEventListener(name, fn) { this[name] = fn; }, remove() { nodes.splice(nodes.indexOf(this), 1); } }),
    },
  };
  ctx.$ = selector => selector === '#modal' ? modal : selector === '#modal-card' ? {} : selector === '.btns' ? {} : selector.startsWith('.po') ? (ctx.sheet ? {} : null) : target;
  vm.createContext(ctx);
  vm.runInContext(core.slice(core.indexOf('const Screens ='), core.indexOf('// Встряхнуть')), ctx);
  vm.runInContext(core.slice(core.indexOf('const Modal ='), core.indexOf('function confetti()')), ctx);
  vm.runInContext(source, ctx);
  return { ctx, nodes, run: code => vm.runInContext(code, ctx) };
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
  const { ctx, run, nodes } = setup();
  ctx.sheet = true; run('Coach.maybe()'); assert.equal(nodes.length, 0, 'picker blocks delayed onboarding');
  ctx.sheet = false; run('Coach.maybe()');
  nodes[0].click(); nodes[0].click(); nodes[0].click();
  assert.equal(nodes.length, 0);
  assert.equal(ctx.Store.d.ui.coach, 1, 'complete only after final step');
  run('Coach.maybe()'); assert.equal(nodes.length, 0, 'completed tour stays dismissed');
}
console.log('Onboarding regression checks passed');
