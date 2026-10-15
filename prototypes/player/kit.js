// Форма для общей модели игрока: белая ткань перекрашивается в цвета клуба (футболка, шорты, гетры),
// на спине — фамилия и номер, на груди — маленький номер; оттенок кожи можно задать.
// Всё делается в шейдере по позе привязки (rest pose), поэтому надписи и границы «приклеены» к ткани
// и двигаются вместе с ней при ходьбе. Высоты — в долях роста модели (стопы на 0).
import * as THREE from 'three';

// границы по высоте в позе привязки (доли роста) — подобраны по prototypes/player/player-mobile.glb
const Z = { neck: 0.875, waist: 0.47, knee: 0.30 };
// лицо модели: высота глаз, высота рта (доли роста), половина расстояния между глазами (доли роста)
const FACE_MODEL = [0.930, 0.8845, 0.0152];

// ?kit=1e3a8a.ffffff.c8102e.ffffff&num=10&name=МБАППЕ&skin=6b4632
//   цвета: футболка.шорты.гетры.надписи (без #); skin — цвет кожи (без #), по умолчанию — как на модели
export function kitFromQuery(Q) {
  const k = (Q.get('kit') || '').split('.').filter((c) => /^[0-9a-f]{6}$/i.test(c));
  if (!k.length) return null;
  const s = Q.get('skin');
  return { shirt: '#' + k[0], shorts: '#' + (k[1] || k[0]), socks: '#' + (k[2] || k[1] || k[0]), ink: '#' + (k[3] || 'ffffff'),
    num: String(Q.get('num') || '').replace(/[^0-9]/g, '').slice(0, 2), name: String(Q.get('name') || '').toUpperCase().replace(/[^A-ZА-ЯЁ' -]/g, '').slice(0, 14),
    skin: s && /^[0-9a-f]{6}$/i.test(s) ? '#' + s : '',
    // лицо с фото: face — картинка (из папки игры), fp — где на ней глаза и рот: глазаY,ротY,полрасстояния между глазами,центрX (доли картинки)
    face: faceUrl(Q.get('face') || ''),
    // у фото с сервера лиц игры (и у img/players/<номер>.webp) кадр одинаковый — глаза и рот на одних местах
    fp: ((Q.get('fp') || '').split(',').map(Number).filter((n) => n >= 0 && n <= 1).length === 4 ? Q.get('fp').split(',').map(Number) : [0.445, 0.69, 0.117, 0.5]),
    fm: (Q.get('fm') || '').split(',').map(Number).filter((n) => isFinite(n)),
    // готовая текстура лица (tools/rig/face.py): фото уже «натянуто» по точкам лица на лицо модели;
    // ff — её кадр в долях роста: x слева, x справа, высота низа, высота верха
    crest: faceUrl(Q.get('crest') || ''), // эмблема клуба на груди (img/clubs/…)
    stripes: /^[0-9a-f]{6}$/i.test(Q.get('stripes') || '') ? '#' + Q.get('stripes') : '', // три полоски по плечам
    ff: (Q.get('ff') || '').split(',').map(Number).filter((n) => isFinite(n) && Math.abs(n) <= 1.2) };
}

// откуда можно брать лицо: картинка из папки игры или сервер лиц игры (/face/<номер>)
function faceUrl(f) {
  if (/^https:\/\/jackson-games(-staging)?\.komutatorcisco\.workers\.dev\/face\/\d{1,7}(\?s=(120|240))?$/.test(f)) return f;
  if (/^[\w./-]+\.(webp|png|jpe?g)$/i.test(f) && !/\.\./.test(f)) return new URL('../../' + f, import.meta.url).href;
  return '';
}

// средний цвет щёк на фото — им же красим кожу всего тела, чтобы лицо и руки совпадали
function cheekColor(img, fp) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const [ey, my, sep, cx] = fp; const W = img.width, H = img.height;
  let r = 0, gg = 0, b = 0, n = 0;
  for (const sx of [-1, 1]) {
    const d = g.getImageData(Math.round((cx + sx * sep * 1.1) * W) - 3, Math.round(((ey + my) / 2) * H) - 3, 6, 6).data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  }
  if (!n) return '';
  const h = (v) => Math.round(v / n).toString(16).padStart(2, '0');
  return '#' + h(r) + h(gg) + h(b);
}

// надписи: фамилия дугой сверху и крупный номер; второй слой — номер для груди
function printTexture(kit) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = kit.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kit.name) {
    let fs = 64; g.font = `900 ${fs}px Rubik, "Arial Black", sans-serif`;
    while (g.measureText(kit.name).width > 440 && fs > 30) { fs -= 2; g.font = `900 ${fs}px Rubik, "Arial Black", sans-serif`; }
    g.fillText(kit.name, 256, 70);
  }
  if (kit.num) { g.font = '900 300px Rubik, "Arial Black", sans-serif'; g.fillText(kit.num, 256, 300); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.flipY = true;
  return t;
}

export async function applyKit(model, kit) {
  if (!kit) return;
  let faceTex = null; const tint = new THREE.Vector3(1, 1, 1);
  const framed = kit.ff.length === 4;
  if (kit.face && (framed || kit.fp.length === 4)) {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.crossOrigin = 'anonymous'; i.src = kit.face; }).catch(() => null);
    if (img) { faceTex = new THREE.Texture(img); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.needsUpdate = true; const ch = framed ? '' : cheekColor(img, kit.fp); if (!kit.skin) kit.skin = ch;
      // фото и кожа модели одного тона: фото подкрашивается к цвету кожи
      if (ch && kit.skin) { const a = new THREE.Color(kit.skin), b = new THREE.Color(ch); tint.set(a.r / Math.max(b.r, 0.02), a.g / Math.max(b.g, 0.02), a.b / Math.max(b.b, 0.02)); } }
  }
  const FM = kit.fm.length === 3 ? kit.fm : FACE_MODEL;
  let crestTex = null, crestAsp = 1;
  if (kit.crest) {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.crossOrigin = 'anonymous'; i.src = kit.crest; }).catch(() => null);
    if (img) { crestTex = new THREE.Texture(img); crestTex.colorSpace = THREE.SRGBColorSpace; crestTex.anisotropy = 4; crestTex.needsUpdate = true; crestAsp = img.height / img.width; }
  }
  let minY = Infinity, maxY = -Infinity;
  model.traverse((o) => { if (o.isMesh && o.geometry) { o.geometry.computeBoundingBox(); minY = Math.min(minY, o.geometry.boundingBox.min.y); maxY = Math.max(maxY, o.geometry.boundingBox.max.y); } });
  const Hm = maxY - minY;
  const lin = (hex) => new THREE.Color(hex); // three переводит sRGB → линейное само
  const print = printTexture(kit);
  model.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const m = o.material;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        kShirt: { value: lin(kit.shirt) }, kShorts: { value: lin(kit.shorts) }, kSocks: { value: lin(kit.socks) },
        kSkin: { value: lin(kit.skin || '#000000') }, kUseSkin: { value: kit.skin ? 1 : 0 },
        kPrint: { value: print }, kY0: { value: minY }, kH: { value: Hm },
        kFace: { value: faceTex || print }, kUseFace: { value: faceTex ? 1 : 0 }, kTint: { value: tint }, kCrest: { value: crestTex || print }, kUseCrest: { value: crestTex ? crestAsp : 0 }, kStripes: { value: lin(kit.stripes || '#000000') }, kUseStripes: { value: kit.stripes ? 1 : 0 },
        kFM: { value: new THREE.Vector3(...FM) }, kFF: { value: new THREE.Vector4(...(framed ? kit.ff : [0, 0, 0, 0])) }, kFP: { value: new THREE.Vector4(...(kit.fp.length === 4 ? kit.fp : [0, 1, 1, 0.5])) },
      });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRest; varying vec3 vRestN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position; vRestN = normal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vRest; varying vec3 vRestN;
float kSkinMask = 0.0;
uniform vec3 kShirt, kShorts, kSocks, kSkin; uniform float kUseSkin, kY0, kH, kUseFace; uniform sampler2D kPrint, kFace; uniform vec3 kFM, kTint, kStripes; uniform vec4 kFP, kFF; uniform sampler2D kCrest; uniform float kUseCrest, kUseStripes;`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.78, kSkinMask);')
        .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 c = diffuseColor.rgb;
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float h = (vRest.y - kY0) / kH;
  // белая ткань: светлая и почти без цвета; выше шеи не трогаем (белки глаз, зубы)
  float cloth = smoothstep(0.16, 0.07, mx - mn) * smoothstep(0.10, 0.22, lum) * step(h, ${Z.neck.toFixed(3)});
  vec3 kc = h > ${Z.waist.toFixed(3)} ? kShirt : (h > ${Z.knee.toFixed(3)} ? kShorts : kSocks);
  float shade = clamp(lum / 0.62, 0.0, 1.35);
  vec3 col = kc * shade;
  // надписи на футболке: спина — фамилия и номер, грудь — маленький номер
  if (h > ${Z.waist.toFixed(3)} && h < 0.79) {
    float xr = vRest.x / kH;
    if (vRestN.z < -0.25 && abs(xr) < 0.085) {
      vec2 uv = vec2(0.5 - xr / 0.17, (h - 0.585) / 0.19);
      if (uv.y > 0.0 && uv.y < 1.0) { vec4 p = texture2D(kPrint, uv); col = mix(col, p.rgb * max(shade, 0.55), p.a); }
    }
    if (vRestN.z > 0.25 && abs(xr) < 0.03) {
      vec2 uv = vec2(0.5 + xr / 0.06, ((h - 0.665) / 0.06) * 0.62 + 0.18);
      if (uv.y > 0.18 && uv.y < 0.8) { vec4 p = texture2D(kPrint, uv); col = mix(col, p.rgb * max(shade, 0.55), p.a); }
    }
  }
  // три полоски по верху плеч и рукавов: вдоль линии плеча, измеренной на модели (верх по высоте и центр по глубине)
  if (kUseStripes > 0.5 && h > ${Z.waist.toFixed(3)}) {
    float ax = abs(vRest.x / kH);
    float top = ax < 0.10 ? mix(0.843, 0.825, (ax - 0.06) / 0.04) : ax < 0.14 ? mix(0.825, 0.804, (ax - 0.10) / 0.04) : ax < 0.16 ? mix(0.804, 0.770, (ax - 0.14) / 0.02) : mix(0.770, 0.726, (ax - 0.16) / 0.02);
    float c = vRest.z / kH + 0.028;
    float st = 0.0;
    for (int i = -1; i <= 1; i++) st = max(st, smoothstep(0.0042, 0.0030, abs(c - float(i) * 0.0105)));
    st *= step(0.058, ax) * step(ax, 0.192) * smoothstep(top - 0.03, top - 0.018, h);
    col = mix(col, kStripes * max(shade, 0.45), st);
  }
  // эмблема клуба на груди слева (у игрока), над сердцем
  if (kUseCrest > 0.0 && h > ${Z.waist.toFixed(3)} && vRestN.z > 0.2) {
    float hw = 0.0165;
    vec2 cuv = vec2((vRest.x / kH - 0.043) / (2.0 * hw) + 0.5, (h - 0.738) / (2.0 * hw * kUseCrest) + 0.5);
    if (cuv.x > 0.0 && cuv.x < 1.0 && cuv.y > 0.0 && cuv.y < 1.0) { vec4 e = texture2D(kCrest, cuv); col = mix(col, e.rgb * max(shade, 0.6), e.a); }
  }
  diffuseColor.rgb = mix(c, col, cloth);
  // кожа: тёплый тон средней насыщенности (не ткань, не волосы, не бутсы)
  if (kUseSkin > 0.5) {
    float sat = (mx - mn) / max(mx, 1e-4);
    float skin = (1.0 - cloth) * smoothstep(0.12, 0.22, sat) * smoothstep(0.03, 0.08, lum) * step(c.b, c.g) * step(c.g, c.r);
    float ref = 0.42;
    diffuseColor.rgb = mix(diffuseColor.rgb, kSkin * clamp(lum / ref, 0.0, 1.6), skin);
    kSkinMask = skin;
  }
  // лицо с фото: проекция спереди по линии глаз и рта, мягкий овал, только на лицевой стороне головы
  if (kUseFace > 0.5 && kFF.w > kFF.z && vRestN.z > 0.0) {
    float xr = vRest.x / kH;
    vec2 fuv = vec2((xr - kFF.x) / (kFF.y - kFF.x), (h - kFF.z) / (kFF.w - kFF.z));
    if (fuv.x > 0.0 && fuv.x < 1.0 && fuv.y > 0.0 && fuv.y < 1.0) {
      vec4 f = texture2D(kFace, fuv);
      float fm = f.a * smoothstep(0.05, 0.45, vRestN.z);
      diffuseColor.rgb = mix(diffuseColor.rgb, clamp(f.rgb * kTint, 0.0, 1.0), fm);
      kSkinMask = max(kSkinMask, fm);
    }
  } else if (kUseFace > 0.5 && h > 0.865 && vRestN.z > 0.0) {
    float xr = vRest.x / kH;
    float v = kFP.x + (h - kFM.x) / (kFM.y - kFM.x) * (kFP.y - kFP.x);
    float u = kFP.w + xr / kFM.z * kFP.z;
    vec4 f = texture2D(kFace, vec2(u, 1.0 - v));
    vec2 e = vec2((u - kFP.w) / (kFP.z * 2.45), (v - (kFP.x + kFP.y) * 0.5 + (kFP.y - kFP.x) * 0.1) / ((kFP.y - kFP.x) * 2.2));
    float oval = smoothstep(1.0, 0.8, length(e));
    float fm = f.a * oval * smoothstep(0.15, 0.55, vRestN.z);
    diffuseColor.rgb = mix(diffuseColor.rgb, clamp(f.rgb * kTint, 0.0, 1.0), fm);
    kSkinMask = max(kSkinMask, fm);
  }
}`);
    };
    m.customProgramCacheKey = () => 'kit:' + kit.shirt + kit.shorts + kit.socks + kit.skin + (faceTex ? (framed ? 'F' : 'f') : '') + (crestTex ? 'C' : '') + (kit.stripes ? 'S' : '');
    m.needsUpdate = true;
  });
}
