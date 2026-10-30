// Наш игрок (assets3d/player.glb + js/playerkit.js) вместо тела игрока Mixamo в «Ударе». Включается только ?jg=1 (30.10: с позами Мбаппе кривится, основа футбола — Мбаппе).
// Скелет Mixamo остаётся и делает всё, что делал: движения, касания мяча, тень, вратарские сейвы. Его тело прячем,
// а наш игрок каждый кадр повторяет его позу: поворот каждой кости относительно позы привязки (берётся из матриц
// скелета, а не из текущей позы; наша кость выравнивается по кости источника), таз — ровно там же, где таз источника,
// рост — по длине ноги. Проверено числами на теле Ch38 (вратарь, стенка): направления костей совпадают, стопы ±5 см.
// На модели героя (партнёры/соперники в матче) не проверено в движении — смотреть глазами.
// Подключение в shot.js (4 строки):
//   1) import * as JG from './jgskin.js?v=…';
//   2) в player(): return { holder, model: m, kit, … }            — запомнить форму
//   3) после «const got = await Promise.all(all);»:
//      await JG.ready; got.slice(1).forEach((pl, i) => JG.attach(pl, pl.kit, i + 1));   — всех, кроме своего героя
//   4) в recolor(pl, kit): JG.recolor(pl, kit);   и в цикле перед faceSync(): JG.sync();
// В index.html до importmap: <script src="../../js/playerkit.js?v=…"></script>. ?jg=0 — старое тело Mixamo.
import * as THREE from 'three';
import { GLTFLoader } from '../balotelli/vendor/loaders/GLTFLoader.js';
import { DRACOLoader } from './jg/DRACOLoader.js';   // r170 + декодер jg/draco (vendor/draco — для r128, не подходит)
import { clone as cloneSkinned } from '../balotelli/vendor/utils/SkeletonUtils.js';

// PlayerKit объявлен в js/playerkit.js как const — в window его нет, но из модуля он виден по имени
const PK = typeof PlayerKit !== 'undefined' ? PlayerKit : null; // eslint-disable-line no-undef
const ON = new URLSearchParams(location.search).get('jg') === '1' && !!PK; // модель не грузится, если не нужна
let G = null;
export const ready = !ON ? Promise.resolve(null) : new Promise((ok) => {
  const draco = new DRACOLoader().setDecoderPath('./jg/draco/')   // декодер под эту версию three.js (r170); vendor/draco — для r128;
  new GLTFLoader().setDRACOLoader(draco).load('../../assets3d/player.glb?v=20261028-a4', (g) => { G = g; ok(g); }, undefined, () => ok(null));
});

const strip = (n) => n.replace(/^mixamorig[:_]?/i, '');
const list = []; window.__jg = list;   // для проверки: сколько игроков подменено
const V = () => new THREE.Vector3(), Qn = () => new THREE.Quaternion();

// приложить нашего игрока к игроку «Удара»: pl — { holder, model, … }, kit — { shirt, shorts, socks }, i — номер для внешности
export function attach(pl, kit, i) {
  if (!G || !pl || pl.jg) return null;
  window.THREE = window.THREE || THREE;   // PlayerKit рисует майку через глобальный THREE
  const base = kit ? { pattern: 'plain', c1: kit.shirt, c2: kit.shirt, shorts: kit.shorts || kit.shirt, socks: kit.socks || kit.shirt } : {};
  const look = PK.random(1009 + i * 37, Object.assign(base, { number: null, tex: 256 }));
  const man = cloneSkinned(G.scene);
  PK.apply(man, look);
  man.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; } });
  const H = pl.holder; H.add(man);

  const src = {}; pl.model.traverse((o) => { if (o.isBone) src[strip(o.name)] = o; });
  const hide = []; pl.model.traverse((o) => { if (o.isMesh) hide.push(o); });
  H.updateMatrixWorld(true);
  const hMi = H.matrixWorld.clone().invert();
  // поза привязки (bind pose) из самого скелета — а не текущая: игра к этому моменту уже могла запустить движения
  const bind = new Map(), mx = new THREE.Matrix4();
  const takeBind = (root) => { let sk = null; root.traverse((o) => { if (!sk && o.isSkinnedMesh) sk = o; }); if (!sk) return;
    sk.skeleton.bones.forEach((b, k) => bind.set(b, hMi.clone().multiply(sk.matrixWorld).multiply(sk.bindMatrixInverse).multiply(mx.copy(sk.skeleton.boneInverses[k]).invert()))); };
  const hp = (o) => (bind.has(o) ? V().setFromMatrixPosition(bind.get(o)) : o.getWorldPosition(V()).applyMatrix4(hMi));
  const hq = (o) => (bind.has(o) ? new THREE.Quaternion().setFromRotationMatrix(mx.extractRotation(bind.get(o))) : H.getWorldQuaternion(Qn()).invert().multiply(o.getWorldQuaternion(Qn())));
  const bones = []; man.traverse((o) => { if (o.isBone && src[strip(o.name)]) bones.push(o); });   // сверху вниз: родитель раньше
  const oH = bones.find((b) => strip(b.name) === 'Hips'), sH = src.Hips;
  if (!oH || !sH) { H.remove(man); return null; }
  // рост — по длине ноги (она одна в любой позе; исходная поза у разных моделей разная: у героя таз почти на земле).
  // Тогда таз нашего игрока можно ставить ровно туда же, где таз источника, и стопы стоят на газоне.
  const leg = (B) => ['LeftUpLeg', 'LeftLeg', 'LeftFoot'].map((n) => B(n)).reduce((a, o, k, arr) => (k ? a + hp(o).distanceTo(hp(arr[k - 1])) : 0), 0);
  const ob = (n) => bones.find((b) => strip(b.name) === n);
  takeBind(pl.model); man.scale.setScalar(1); H.updateMatrixWorld(true); takeBind(man);
  man.scale.setScalar(leg((n) => src[n]) / Math.max(1e-4, leg(ob))); H.updateMatrixWorld(true); takeBind(man);
  // поправка роста по полной высоте (29.10): у нашей модели исходная поза другая, по одной ноге выходило вдвое ниже
  { const hb = new THREE.Box3().setFromObject(pl.model), mb = new THREE.Box3().setFromObject(man), hs = hb.max.y - hb.min.y, ms = mb.max.y - mb.min.y;
    if (hs > 0.8 && ms > 0.1 && Math.abs(hs / ms - 1) > 0.12) { man.scale.multiplyScalar(hs / ms); H.updateMatrixWorld(true); takeBind(man); } }
  const items = bones.map((b) => {
    const sb = src[strip(b.name)], sRest = hq(sb); let oRest = hq(b);
    const oc = b.children.find((c) => c.isBone && src[strip(c.name)]);
    if (oc) {   // разворачиваем нашу кость вдоль кости источника (кратчайшим поворотом)
      const dO = hp(oc).sub(hp(b)).normalize(), dS = hp(src[strip(oc.name)]).sub(hp(sb)).normalize();
      oRest = new THREE.Quaternion().setFromUnitVectors(dO, dS).multiply(oRest);
    }
    return { b, sb, K: sRest.clone().invert().multiply(oRest), pQ: hq(b.parent) };
  });
  const entry = { i, pl, man, items, oH, sH, pMi: hMi.clone().multiply(oH.parent.matrixWorld).invert(), hide };
  list.push(entry); pl.jg = entry;
  return entry;
}
// новая форма (штрафной ↔ «2 на 1» и т. п.)
export function recolor(pl, kit) {
  if (!pl || !pl.jg || !kit) return;
  const look = PK.random(1009 + pl.jg.i * 37, { pattern: 'plain', c1: kit.shirt, c2: kit.shirt, shorts: kit.shorts || kit.shirt, socks: kit.socks || kit.shirt, number: null, tex: 256 });
  const sc = pl.jg.man.scale.x; PK.apply(pl.jg.man, look); pl.jg.man.scale.setScalar(sc);
}
// каждый кадр, после движений и перед отрисовкой
const W = new Map(), tq = new THREE.Quaternion(), hQi = new THREE.Quaternion(), tv = new THREE.Vector3(), hMi = new THREE.Matrix4();
export function sync() {
  for (const e of list) {
    const H = e.pl.holder; if (!H.visible || !H.parent) continue;
    for (const m of e.hide) m.visible = false;
    H.updateMatrixWorld(true);
    H.getWorldQuaternion(hQi).invert(); hMi.copy(H.matrixWorld).invert();
    W.clear();
    for (const it of e.items) {
      const T = hQi.clone().multiply(it.sb.getWorldQuaternion(tq)).multiply(it.K);
      const P = W.get(it.b.parent) || it.pQ;
      it.b.quaternion.copy(P).invert().multiply(T);
      W.set(it.b, T);
    }
    // таз — там же, где таз источника (ноги одной длины)
    tv.copy(e.sH.getWorldPosition(tv)).applyMatrix4(hMi).applyMatrix4(e.pMi);
    e.oH.position.copy(tv);
  }
}
