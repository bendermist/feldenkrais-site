// 3D scenes of human movement for the Feldenkrais site.
// One movement runs through all three: turning the head right and left.
// Models: BodyParts3D skeleton (CC BY-SA 2.1 JP), Lee Perry-Smith head scan (CC BY 3.0), Mixamo "Michelle" figure.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

const V3 = THREE.Vector3, Quat = THREE.Quaternion;
const v = (x, y, z) => new V3(x, y, z);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const DEBUG = location.search.includes("debug");
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = {};
const load = (url) => (cache[url] ??= loader.loadAsync(url));

const smooth = (x) => x * x * (3 - 2 * x);
const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clamp01 = (x) => clamp(x, 0, 1);
const lerp = THREE.MathUtils.lerp;
const DEG = Math.PI / 180;
const ACCENT = 0xa8714f;

/* ---------- materials: matte plaster / porcelain ---------- */
const plaster = (color, extra = {}) => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.66, metalness: 0, sheen: 0.5, sheenRoughness: 0.85, sheenColor: new THREE.Color(0xffffff), ...extra,
});
const MAT = {
  bone: plaster(0xf0e8dc),
  cartilage: plaster(0xd8b49a, { roughness: 0.5 }),
  head: plaster(0xeee6da, { roughness: 0.7 }),
  client: plaster(0xece3d6, { roughness: 0.72 }),
  teacher: plaster(0xd3a88c, { roughness: 0.72 }),
  table: plaster(0xdfd5c6, { roughness: 0.8 }),
  pad: plaster(0xf4eee4, { roughness: 0.95 }),
  wood: plaster(0xc9b8a3, { roughness: 0.7 }),
};
const BONE_COLOR = new THREE.Color(0xf0e8dc), FOCUS_COLOR = new THREE.Color(0xd08a5c);

/* ---------- stage: soft studio light, tone mapping, contact shadows ---------- */
let envTexture;
function makeStage(canvas, { fov = 30, pos = [0, 1.2, 4], target = [0, 1, 0] } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const scene = new THREE.Scene();
  envTexture ??= new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.85;

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 60);
  camera.position.set(...pos);
  const look = v(...target);
  camera.lookAt(look);

  const key = new THREE.DirectionalLight(0xfff6ec, 1.6);
  key.position.set(2.5, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 10;
  key.shadow.blurSamples = 16;
  key.shadow.bias = -0.0004;
  Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 0.5, far: 20 });
  scene.add(key);
  const fillLight = new THREE.DirectionalLight(0xffe4cf, 0.35);
  fillLight.position.set(-4, 2, -3);
  scene.add(fillLight);

  const stage = { renderer, scene, camera, look, key, fill: fillLight };
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    stage.onResize?.(w, h);
    if (reduced && stage.ready) { stage.update?.(0, 0); renderer.render(scene, camera); }
  };
  stage.resize = resize;
  new ResizeObserver(resize).observe(canvas);
  resize();
  return stage;
}

function shadowCatcher(y, size, opacity) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShadowMaterial({ opacity }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

function run(canvas, stage, update) {
  const clock = new THREE.Clock();
  let t = 0, raf = 0, visible = false;
  stage.ready = true;
  stage.update = update;
  canvas.classList.add("loaded");
  const frame = () => {
    raf = 0;
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!reduced) t += dt;
    update(DEBUG ? (window.__sceneTime?.[canvas.dataset.scene] ?? t) : t, dt);
    stage.renderer.render(stage.scene, stage.camera);
    if (!reduced) raf = requestAnimationFrame(frame);
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) { clock.getDelta(); raf = requestAnimationFrame(frame); }
  }, { rootMargin: "150px" }).observe(canvas);
}

const shadows = (o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

/* ---------- labels pinned to points of the model, and the caption under each scene ---------- */
function labelLayer(canvas, stage) {
  const layer = document.createElement("div");
  layer.className = "scene-labels";
  layer.setAttribute("aria-hidden", "true");
  canvas.after(layer);
  const p = v(0, 0, 0);
  return (cls = "") => {
    const el = document.createElement("div");
    el.className = "scene-label " + cls;
    el.innerHTML = "<b><i></i><span></span></b>";
    const span = el.querySelector("span");
    layer.append(el);
    let text = null, shown = false;
    return (pos, txt, opacity = 1) => {
      if (opacity < 0.01) { if (shown) { el.style.opacity = 0; shown = false; } return; }
      if (txt !== text) span.textContent = text = txt;
      p.copy(pos).project(stage.camera);
      const w = canvas.clientWidth, h = canvas.clientHeight, x = (p.x * 0.5 + 0.5) * w, y = (-p.y * 0.5 + 0.5) * h;
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      if (!cls.includes("fixed")) el.classList.toggle("flip", x > w * 0.56);
      el.style.opacity = opacity.toFixed(2);
      shown = true;
    };
  };
}

function captioner(canvas) {
  const el = canvas.parentElement.querySelector(".scene-caption");
  let text = null;
  return (txt, on) => {
    if (!el) return;
    if (txt !== text) el.textContent = text = txt;
    el.classList.toggle("show", reduced || on);
  };
}

/* ---------- director: a loop of camera shots, each with a caption ---------- */
// A shot looks at `at` from azimuth `az` (0 = from the front, +z), elevation `el`, distance `dist`.
// `width` (metres) keeps that much of the scene in view on narrow canvases.
function director(stage, shots, trans = 2.6) {
  const total = shots.reduce((s, x) => s + x.dur, 0);
  const at = v(0, 0, 0);
  const fit = (s) => Math.max(s.dist, s.width ? s.width / (2 * Math.tan((stage.camera.fov / 2) * DEG) * stage.camera.aspect) : 0);
  return (t, azOffset = 0) => {
    let x = t % total, i = 0;
    while (x >= shots[i].dur) { x -= shots[i].dur; i++; }
    const cur = shots[i], next = shots[(i + 1) % shots.length];
    const hold = cur.dur - trans;
    const k = smoother(clamp01((x - hold) / trans));
    const az = lerp(cur.az, next.az, k) + azOffset, el = lerp(cur.el, next.el, k), dist = lerp(fit(cur), fit(next), k);
    at.lerpVectors(cur.at, next.at, k);
    stage.camera.position.set(at.x + dist * Math.sin(az) * Math.cos(el), at.y + dist * Math.sin(el), at.z + dist * Math.cos(az) * Math.cos(el));
    stage.camera.lookAt(at);
    stage.camera.updateMatrixWorld();
    // focus: 0 → 1 once the camera has settled, back to 0 just before it leaves
    const focus = reduced ? 0 : smooth(clamp01((x - 0.3) / 1.2)) * (1 - smooth(clamp01((x - hold + 0.7) / 0.7)));
    return { i, cur, focus, captionOn: x > 0.25 && x < hold + 0.2 };
  };
}

/* =========================================================
   1. The skeleton (hero): turning to look over your shoulder.
   The camera moves in on the neck, the ribs and the lower back
   to show how unevenly one simple turn is shared out.
   ========================================================= */
const LEVELS = ["L5", "L4", "L3", "L2", "L1", "T12", "T11", "T10", "T9", "T8", "T7", "T6", "T5", "T4", "T3", "T2", "T1", "C7", "C6", "C5", "C4", "C3", "C2", "C1"];
// Axial rotation to one side at the joint below each vertebra, in degrees, near the end of a full turn
// (typical values from the biomechanics literature: little in the lumbar spine, a few degrees per thoracic
// joint, and about half of all neck rotation between atlas and axis).
const AXIAL = {
  L5: 1, L4: 1.5, L3: 1.5, L2: 1.5, L1: 1.5,
  T12: 1.5, T11: 2, T10: 2.5, T9: 3, T8: 3, T7: 3, T6: 3, T5: 3, T4: 3, T3: 3, T2: 3, T1: 3,
  C7: 2.5, C6: 5, C5: 6, C4: 6, C3: 5.5, C2: 3, C1: 38,
};
const TURN = 0.75; // an easy turn, not the end of the range
const sumOf = (re) => LEVELS.filter((n) => re.test(n)).reduce((s, n) => s + AXIAL[n], 0);
const REGION = { neck: sumOf(/^C/), chest: sumOf(/^T/), low: sumOf(/^L/), lowNeck: sumOf(/^C[2-7]/) / 6 };
const fmt = (deg) => (deg < 3 ? deg.toFixed(1) : deg.toFixed(0)) + "°";

let spinePromise;
function loadSpine() {
  return (spinePromise ??= load("models/spine.glb").then((gltf) => {
    gltf.scene.updateMatrixWorld(true);
    const rest = {};
    for (const o of gltf.scene.children) {
      const prims = [], pos = o.getWorldPosition(v(0, 0, 0)), inv = new THREE.Matrix4().makeTranslation(-pos.x, -pos.y, -pos.z);
      // the meshes carry their own (de-quantisation) transform, so keep it relative to the part's pivot
      o.traverse((m) => { if (m.isMesh) prims.push({ geometry: m.geometry, soft: m.material.name === "cartilage", matrix: inv.clone().multiply(m.matrixWorld) }); });
      rest[o.name] = { pos, prims };
    }
    return { scene: gltf.scene, rest };
  }));
}

async function spineScene(canvas) {
  const stage = makeStage(canvas, { fov: 26 });
  stage.fill.intensity = 1.3; // the camera also goes round the back
  stage.fill.position.set(-3, 2.5, -4);
  const { scene: model, rest } = await loadSpine();
  const get = (n) => model.getObjectByName(n);

  // Materials: groups of bones that are tinted when the camera moves in on them.
  const mat = { bone: MAT.bone, neck: MAT.bone.clone(), ribs: MAT.bone.clone(), lumbar: MAT.bone.clone(), skull: MAT.bone.clone() };
  const groupOf = (n) => (n === "C1" || n === "C2" ? "neck" : /^R\d/.test(n) ? "ribs" : /^L\d/.test(n) ? "lumbar" : n === "skull" ? "skull" : "bone");
  for (const node of [...model.children]) {
    const g = groupOf(node.name);
    node.traverse((o) => { if (o.isMesh) o.material = o.material.name === "cartilage" ? MAT.cartilage : mat[g]; });
  }
  shadows(model);
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(v(0, 0, 0)), mid = box.getCenter(v(0, 0, 0));

  // Chain: pelvis → L5 → … → C1 → skull; each rib hangs from its own vertebra.
  let parent = get("pelvis");
  const segs = LEVELS.map((n) => { const node = get(n); parent.attach(node); parent = node; return node; });
  get("C1").attach(get("skull"));
  get("T4").attach(get("sternum"));
  get("T3").attach(get("shoulders"));
  const ribs = [];
  for (let i = 1; i <= 12; i++) for (const [tag, sx] of [["L", 1], ["R", -1]]) {
    const rib = get(`R${i}${tag}`);
    get("T" + i).attach(rib);
    ribs.push({ rib, level: "T" + i, sx, follow: i <= 7 ? 0.65 : i <= 10 ? 0.5 : 0 });
  }
  stage.scene.add(model);
  stage.scene.add(shadowCatcher(box.min.y, 6, 0.1));

  const P = (n, dx = 0, dy = 0, dz = 0) => rest[n].pos.clone().add(v(dx, dy, dz));
  const shots = [
    { dur: 8, at: mid.clone(), az: -0.45, el: 0.04, dist: size.y * 2.5, width: 0.8,
      caption: "Turn to look over your shoulder. One simple movement." },
    { dur: 12, at: P("C3", 0, 0.012, 0), az: -2.25, el: 0.1, dist: 0.66, width: 0.22, focus: "neck",
      caption: "Look closer. Half of the neck’s turn happens at one joint, right under the skull." },
    { dur: 12, at: P("T7", 0, -0.01, 0.07), az: -0.3, el: 0.1, dist: 1.25, width: 0.44, focus: "ribs",
      caption: "The ribs join in. On the side you turn to they swing back; on the other side, forward." },
    { dur: 11, at: P("L3"), az: -1.15, el: 0.03, dist: 0.74, width: 0.26, focus: "lumbar",
      caption: "The lower back hardly twists at all: about one degree at each joint." },
    { dur: 10, at: mid.clone(), az: -0.25, el: 0.04, dist: size.y * 2.5, width: 0.8, focus: "all",
      caption: "Many small parts, each doing a little. A lesson teaches you to feel them." },
  ];
  const direct = director(stage, shots);
  const say = captioner(canvas);
  const label = labelLayer(canvas, stage);
  const L = { top: label(), lowNeck: label(), chestJoint: label(), ribA: label("fixed"), ribB: label("fixed flip"), low: label(), sumNeck: label(), sumChest: label(), sumLow: label() };
  const ribL = get("R6L"), ribR = get("R6R");

  const pointer = { x: 0, tx: 0 };
  addEventListener("pointermove", (e) => { pointer.tx = (e.clientX / innerWidth) * 2 - 1; }, { passive: true });
  const cum = {}, w = v(0, 0, 0), w2 = v(0, 0, 0);
  const world = (node, out, x = 0, y = 0, z = 0) => node.localToWorld(out.set(x, y, z));

  run(canvas, stage, (t) => {
    pointer.x += (pointer.tx - pointer.x) * 0.03;
    const turn = reduced ? 0.6 : Math.sin((t / 8) * Math.PI * 2); // +1 = fully to the left, −1 = fully to the right
    const a = Math.abs(turn);

    // Vertebrae: each joint adds its own small share; the neck also side-bends a little into the turn.
    let total = 0;
    segs.forEach((s, i) => {
      const n = LEVELS[i], yaw = AXIAL[n] * DEG * TURN * turn;
      total += yaw;
      cum[n] = total;
      const bend = n[0] === "C" && n !== "C1" ? -0.45 * yaw : n[0] === "T" && i > 12 ? -0.2 * yaw : 0;
      s.rotation.set(0, yaw, bend);
    });
    // Ribs: the cage turns more as one piece than the vertebrae do, and the two sides tilt opposite ways.
    const breath = 0.008 * Math.sin(t * 1.2);
    for (const r of ribs) r.rib.rotation.set(-r.sx * turn * 0.055 - breath, r.follow * (cum.T4 - cum[r.level]), 0);

    const s = direct(t, pointer.x * 0.12);
    say(s.cur.caption, s.captionOn);
    const f = (name) => (s.cur.focus === name ? s.focus : 0);
    mat.neck.color.lerpColors(BONE_COLOR, FOCUS_COLOR, f("neck"));
    mat.ribs.color.lerpColors(BONE_COLOR, FOCUS_COLOR, f("ribs") * 0.75);
    mat.lumbar.color.lerpColors(BONE_COLOR, FOCUS_COLOR, f("lumbar"));
    model.updateMatrixWorld(true);
    L.top(world(get("C1"), w), "top joint: " + fmt(AXIAL.C1 * TURN * a), f("neck"));
    L.lowNeck(world(get("C5"), w), "each joint below: " + fmt(REGION.lowNeck * TURN * a), f("neck"));
    const side = turn > 0 ? 1 : -1, ribFade = f("ribs") * clamp01(a * 3);
    L.ribA(world(ribL, w, 0.13, -0.07, 0.05), side > 0 ? "swings back" : "comes forward", ribFade);
    L.ribB(world(ribR, w2, -0.13, -0.07, 0.05), side > 0 ? "comes forward" : "swings back", ribFade);
    L.chestJoint(world(get("T10"), w, 0, 0, 0.02), "each joint: " + fmt(3 * TURN * a), f("ribs"));
    L.low(world(get("L3"), w, 0, 0, 0.02), "each joint: " + fmt(1.5 * TURN * a), f("lumbar"));
    L.sumNeck(world(get("C4"), w), "neck: " + fmt(REGION.neck * TURN * a), f("all"));
    L.sumChest(world(get("T7"), w), "chest: " + fmt(REGION.chest * TURN * a), f("all"));
    L.sumLow(world(get("L3"), w), "lower back: " + fmt(REGION.low * TURN * a), f("all"));
  });
  if (DEBUG) (window.__scenes ??= {}).spine = { stage, model, rest, shots };
}

/* =========================================================
   2. Awareness Through Movement: head and eyes.
   Two things are drawn: where the eyes look (terracotta sight
   lines) and where the nose points (grey).
   ========================================================= */
const ATM_PHASES = [
  { caption: "Turn your head right and left. The eyes go along.", head: 0.5, eyes: 0.1 },
  { caption: "Now the eyes look one way while the nose goes the other.", head: 0.4, eyes: -0.62 },
  { caption: "Together again. The head turns further, and more easily.", head: 0.78, eyes: 0.1 },
];

// Head-scan landmarks after normalising the bust to 1.1 units tall, centred at the origin.
const HEAD = { neckLow: -0.27, neckHigh: -0.08, pivot: [0, -0.13, -0.03], eyeX: 0.082, eyeY: 0.245, eyeR: 0.036, gazeR: 0.7 };

function beam(radius, material) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 8, 1, true), material);
  const up = v(0, 1, 0), d = v(0, 0, 0);
  m.span = (a, b) => {
    d.subVectors(b, a);
    const len = d.length();
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(up, d.divideScalar(len));
    m.scale.set(1, len, 1);
  };
  return m;
}

async function headScene(canvas) {
  const stage = makeStage(canvas, { fov: 28 });
  stage.key.position.set(1.2, 4, 4);
  stage.fill.position.set(-3, 1.5, 3);
  stage.fill.intensity = 0.9;
  const gltf = await load("models/head.glb");
  const src = gltf.scene.getObjectByName("LeePerrySmith");

  // Normalise the geometry, then skin it with two bones so only head and neck turn.
  const geo = src.geometry.clone();
  geo.computeBoundingBox();
  const size = v(0, 0, 0), centre = v(0, 0, 0);
  geo.boundingBox.getSize(size); geo.boundingBox.getCenter(centre);
  const sc = 1.1 / size.y;
  geo.translate(-centre.x, -centre.y, -centre.z).scale(sc, sc, sc);
  const pos = geo.attributes.position, n = pos.count;
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  const noseTip = v(0, 0, -1);
  for (let i = 0; i < n; i++) {
    const wgt = smooth(clamp01((pos.getY(i) - HEAD.neckLow) / (HEAD.neckHigh - HEAD.neckLow)));
    skinIndex[i * 4 + 1] = 1;
    skinWeight[i * 4] = 1 - wgt;
    skinWeight[i * 4 + 1] = wgt;
    if (pos.getZ(i) > noseTip.z && pos.getY(i) > -0.05) noseTip.fromBufferAttribute(pos, i);
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
  const rootBone = new THREE.Bone(), headBone = new THREE.Bone();
  const pivot = v(...HEAD.pivot);
  headBone.position.copy(pivot);
  rootBone.add(headBone);
  const bust = new THREE.SkinnedMesh(geo, MAT.head);
  bust.add(rootBone);
  bust.bind(new THREE.Skeleton([rootBone, headBone]));
  bust.castShadow = bust.receiveShadow = true;
  bust.frustumCulled = false;
  stage.scene.add(bust);
  stage.scene.add(shadowCatcher(-0.55, 6, 0.08));

  // Eyes: the scan's eyes are closed, so an iris is drawn on each lid and slides over it as the eyes move.
  // The lid surface is sampled once so the iris stays on the skin.
  const probe = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  const ray = new THREE.Raycaster();
  const hit = (o, d) => { ray.set(o, d); return ray.intersectObject(probe, false)[0]?.point; };
  const irisMat = new THREE.MeshBasicMaterial({ color: 0x5a4334, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x1c1613, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10 });
  const STEP = 0.05, HALF = 16;
  const eyes = [-1, 1].map((sx) => {
    const front = hit(v(sx * HEAD.eyeX, HEAD.eyeY, 2), v(0, 0, -1)) ?? v(sx * HEAD.eyeX, HEAD.eyeY, 0.2);
    const c = front.clone().add(v(0, 0, -HEAD.eyeR));
    const radius = [];
    for (let k = -HALF; k <= HALF; k++) {
      const d = v(Math.sin(k * STEP), 0, Math.cos(k * STEP));
      const h = hit(c.clone().addScaledVector(d, 1), d.clone().negate());
      radius.push(clamp(h ? h.distanceTo(c) : HEAD.eyeR, HEAD.eyeR * 0.85, HEAD.eyeR * 1.35));
    }
    const iris = new THREE.Group();
    iris.add(new THREE.Mesh(new THREE.CircleGeometry(0.02, 28), irisMat), new THREE.Mesh(new THREE.CircleGeometry(0.0085, 20), pupilMat));
    iris.children[1].position.z = 0.0006;
    headBone.add(iris);
    return { c: c.sub(pivot), radius, iris, world: v(0, 0, 0) };
  });
  const noseLocal = noseTip.clone().sub(pivot);

  // Sight lines to the point the eyes look at (on an arc at eye level), and a grey line from the nose.
  const sightMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.8 });
  const noseMat = new THREE.MeshBasicMaterial({ color: 0x7d736a });
  const target = new THREE.Mesh(new THREE.SphereGeometry(0.026, 24, 16), new THREE.MeshBasicMaterial({ color: ACCENT }));
  const noseDot = new THREE.Mesh(new THREE.SphereGeometry(0.019, 20, 14), new THREE.MeshBasicMaterial({ color: 0x7d736a }));
  const sight = [beam(0.0032, sightMat), beam(0.0032, sightMat)], noseLine = beam(0.003, noseMat);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(HEAD.gazeR, 0.0022, 4, 160, Math.PI * 0.7), new THREE.MeshBasicMaterial({ color: 0xc9b9a6 }));
  arc.rotation.set(Math.PI / 2, 0, Math.PI * 0.15);
  arc.position.set(0, HEAD.eyeY, pivot.z);
  stage.scene.add(target, noseDot, ...sight, noseLine, arc);

  const label = labelLayer(canvas, stage);
  const eyesLabel = label("accent up"), noseLabel = label("grey down");
  const say = captioner(canvas);
  const stepEls = canvas.closest(".feature")?.querySelectorAll("[data-atm-step]") || [];
  let shownPhase = -1;
  const PHASE_LEN = 11;

  const camDir = v(0.3, 0.5, 2.3), camAt = v(0, 0.1, 0.2);
  stage.onResize = () => {
    const k = Math.max(1, 1.12 / stage.camera.aspect);
    stage.camera.position.copy(camAt).addScaledVector(camDir, k);
    stage.camera.lookAt(camAt);
    stage.camera.updateMatrixWorld();
  };
  stage.onResize();

  const d = v(0, 0, 0), nose = v(0, 0, 0), out = v(0, 0, 1);
  run(canvas, stage, (t) => {
    const p = Math.floor(t / PHASE_LEN) % ATM_PHASES.length;
    const local = (t % PHASE_LEN) / PHASE_LEN;
    const next = ATM_PHASES[(p + 1) % ATM_PHASES.length], cur = ATM_PHASES[p];
    const blend = smooth(clamp01((local - 0.88) / 0.12));
    const headAmp = lerp(cur.head, next.head, blend), eyeAmp = lerp(cur.eyes, next.eyes, blend);
    const wave = reduced ? 0.7 : Math.sin((t / (PHASE_LEN / 2)) * Math.PI * 2);
    const yaw = headAmp * wave, gazeYaw = yaw + eyeAmp * wave;
    headBone.rotation.set(0.02 * Math.sin(t * 0.7), yaw, -0.05 * wave * (headAmp / 0.8), "YXZ");
    bust.updateMatrixWorld(true);

    target.position.set(Math.sin(gazeYaw) * HEAD.gazeR, HEAD.eyeY, pivot.z + Math.cos(gazeYaw) * HEAD.gazeR);
    eyes.forEach((e, k) => {
      // direction from this eye to the target, in the head's own frame: the iris always points along the sight line
      headBone.worldToLocal(d.copy(target.position)).sub(e.c).normalize();
      const phi = clamp(Math.atan2(d.x, d.z), -HALF * STEP, HALF * STEP), x = phi / STEP + HALF, i0 = Math.min(Math.floor(x), 2 * HALF - 1);
      const r = lerp(e.radius[i0], e.radius[i0 + 1], x - i0) + 0.002;
      e.iris.position.copy(e.c).addScaledVector(d, r);
      e.iris.quaternion.setFromUnitVectors(out, d);
      e.iris.getWorldPosition(e.world);
      sight[k].span(e.world, target.position);
    });
    headBone.localToWorld(nose.copy(noseLocal));
    noseDot.position.set(Math.sin(yaw) * HEAD.gazeR * 0.72, nose.y, pivot.z + Math.cos(yaw) * HEAD.gazeR * 0.72);
    noseLine.span(nose, noseDot.position);
    eyesLabel(target.position, "eyes", 1);
    noseLabel(noseDot.position, "nose", 1);

    say(cur.caption, local > 0.03 && local < 0.9);
    if (p !== shownPhase) {
      shownPhase = p;
      stepEls.forEach((el, k) => el.classList.toggle("active", k === p));
    }
  });
  if (DEBUG) (window.__scenes ??= {}).head = { stage, eyes, HEAD, noseTip };
}

/* =========================================================
   3. Functional Integration: you lie on the table; the
   practitioner sits at your head, one hand on your forehead,
   and rolls the head very gently right and left.
   ========================================================= */
const _pq = new Quat(), _q = new Quat(), _a = v(0, 0, 0), _c = v(0, 0, 0), _n = v(0, 0, 0), _n2 = v(0, 0, 0);
const _s = v(0, 0, 0), _e = v(0, 0, 0), _h = v(0, 0, 0), _d = v(0, 0, 0), _p = v(0, 0, 0), _k = v(0, 0, 0), _t = v(0, 0, 0), _w = v(0, 0, 0);
const _m = new THREE.Matrix4();

// Poses a Mixamo-rigged figure with world-space operations, so nothing depends on the rig's local bone axes.
// Directions given to aim() and turn() are in the figure's own frame: +y up, +z forward, +x its left.
class Poser {
  constructor(root) {
    this.root = root;
    this.b = {};
    root.traverse((o) => { if (o.isBone) { this.b[o.name.replace(/^mixamorig:?/, "")] = o; o.userData.rest = o.quaternion.clone(); } });
    this.frame = new Quat();
    this.sync();
    // Hands: in the bind pose (T-pose) the fingers point along the arm and the palms face the floor.
    this.hands = {};
    for (const S of ["Left", "Right"]) {
      const hand = this.b[S + "Hand"];
      const toLocal = hand.getWorldQuaternion(new Quat()).invert();
      const f = this.wpos(S + "HandMiddle1").sub(this.wpos(S + "Hand")).normalize();
      const nrm = v(0, -1, 0).applyQuaternion(this.frame);
      nrm.addScaledVector(f, -nrm.dot(f)).normalize();
      const c = v(0, 0, 0).crossVectors(f, nrm);
      _m.makeBasis(f.clone().applyQuaternion(toLocal), nrm.clone().applyQuaternion(toLocal), c.clone().applyQuaternion(toLocal));
      this.hands[S] = new Quat().setFromRotationMatrix(_m).invert();
      for (const finger of ["Index", "Middle", "Ring", "Pinky"]) for (let k = 1; k <= 3; k++) {
        const fb = this.b[`${S}Hand${finger}${k}`];
        if (fb) fb.userData.curl = c.clone().applyQuaternion(fb.getWorldQuaternion(new Quat()).invert()).normalize();
      }
    }
  }
  sync() { this.root.updateWorldMatrix(true, true); this.root.getWorldQuaternion(this.frame); }
  reset(names) { for (const n of names) this.b[n].quaternion.copy(this.b[n].userData.rest); }
  bake() { for (const b of Object.values(this.b)) b.userData.rest = b.quaternion.clone(); }
  wpos(name, out = v(0, 0, 0)) { return this.b[name].getWorldPosition(out); }
  dir(d, out = v(0, 0, 0)) { return out.copy(d).normalize().applyQuaternion(this.frame); }
  applyWorld(bone, qWorld) {
    bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.premultiply(_pq).premultiply(qWorld).premultiply(_pq.invert());
    bone.updateWorldMatrix(false, true);
  }
  aimWorld(name, child, dirWorld) {
    _n.copy(dirWorld).normalize();
    this.wpos(name, _a); this.wpos(child, _c).sub(_a).normalize();
    this.applyWorld(this.b[name], _q.setFromUnitVectors(_c, _n));
  }
  aim(name, child, d) { this.aimWorld(name, child, this.dir(d, _n2)); }
  turn(name, axis, angle) { this.applyWorld(this.b[name], _q.setFromAxisAngle(this.dir(axis, _n2), angle)); }
  // Two-bone reach: put the end bone at `target`, bending towards `pole` (both in world space).
  ik(a, m, e, target, pole) {
    this.wpos(a, _s); this.wpos(m, _e); this.wpos(e, _h);
    const l1 = _s.distanceTo(_e), l2 = _e.distanceTo(_h);
    _d.subVectors(target, _s);
    const len = clamp(_d.length(), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.998);
    _d.normalize();
    const x = (l1 * l1 - l2 * l2 + len * len) / (2 * len), hgt = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    _p.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
    _k.copy(_s).addScaledVector(_d, x).addScaledVector(_p, hgt);
    _w.copy(_s).addScaledVector(_d, len);
    this.aimWorld(a, m, _t.subVectors(_k, _s));
    this.aimWorld(m, e, _t.subVectors(_w, _k));
  }
  // Lay a hand on `contact`: fingers along `fingers`, palm facing `into` the surface (world space).
  hand(S, contact, fingers, into, pole) {
    _d.copy(fingers).normalize();
    const f = v(_d.x, _d.y, _d.z), nrm = v(0, 0, 0).copy(into);
    nrm.addScaledVector(f, -nrm.dot(f)).normalize();
    const wrist = v(0, 0, 0).copy(contact).addScaledVector(f, -0.085).addScaledVector(nrm, -0.022);
    this.ik(S + "Arm", S + "ForeArm", S + "Hand", wrist, pole);
    _m.makeBasis(f, nrm, v(0, 0, 0).crossVectors(f, nrm));
    const hand = this.b[S + "Hand"];
    hand.parent.getWorldQuaternion(_pq);
    hand.quaternion.copy(_pq.invert()).multiply(_q.setFromRotationMatrix(_m)).multiply(this.hands[S]);
    hand.updateWorldMatrix(false, true);
  }
  curl(S, angle) {
    for (const finger of ["Index", "Middle", "Ring", "Pinky"]) for (let k = 1; k <= 3; k++) {
      const fb = this.b[`${S}Hand${finger}${k}`];
      if (fb) fb.quaternion.copy(fb.userData.rest).multiply(_q.setFromAxisAngle(fb.userData.curl, angle));
    }
  }
}
const dress = (root, material) => root.traverse((o) => { if (o.isMesh) { o.material = material; o.castShadow = o.receiveShadow = true; o.frustumCulled = false; } });

// The figure's own head is replaced by the head scan used in the lesson above (cropped at the neck),
// so the same head appears in both scenes.
let headGeo;
async function scanHead() {
  if (headGeo) return headGeo;
  const src = (await load("models/head.glb")).scene.getObjectByName("LeePerrySmith").geometry;
  src.computeBoundingBox();
  const size = src.boundingBox.getSize(v(0, 0, 0)), c = src.boundingBox.getCenter(v(0, 0, 0)), k = 1.1 / size.y;
  const g = src.clone();
  for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
  g.translate(-c.x, -c.y, -c.z).scale(k, k, k);
  const pos = g.attributes.position, idx = g.index.array, keep = [];
  for (let i = 0; i < idx.length; i += 3) if (Math.max(pos.getY(idx[i]), pos.getY(idx[i + 1]), pos.getY(idx[i + 2])) > HEAD_FIT.cut) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  g.setIndex(keep);
  return (headGeo = g);
}
const HEAD_FIT = { cut: -0.14, scale: 0.34, y: 1.413, z: 0.0 }; // where the scan sits on the figure, in the figure's frame
function giveHead(figure, geo, material) {
  const head = new THREE.Mesh(geo, material);
  head.scale.setScalar(HEAD_FIT.scale);
  head.position.set(0, HEAD_FIT.y, HEAD_FIT.z);
  head.castShadow = head.receiveShadow = true;
  figure.add(head);
  figure.updateWorldMatrix(true, true);
  let bone;
  figure.traverse((o) => { if (o.isBone && /Head$/.test(o.name)) bone = o; });
  bone.attach(head);
  return head;
}

const NECK = ["C7", "C6", "C5", "C4", "C3", "C2", "C1"];
const ROLL = 0.4; // radians to each side: a small, slow roll of the head

async function tableScene(canvas) {
  const stage = makeStage(canvas, { fov: 30 });
  stage.key.position.set(1.5, 6, 3.5);
  const [gltf, spine, headScan] = await Promise.all([load("models/person.glb"), loadSpine(), scanHead()]);

  // Table: a low, wide, padded table.
  const TOP = 0.7; // top of the padding
  const table = new THREE.Group();
  const slab = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.06, 0.74, 4, 0.025), MAT.table);
  slab.position.y = TOP - 0.08;
  const pad = new THREE.Mesh(new RoundedBoxGeometry(1.97, 0.06, 0.72, 4, 0.03), MAT.pad);
  pad.position.y = TOP - 0.03;
  table.add(slab, pad);
  for (const x of [-0.9, 0.9]) for (const z of [-0.31, 0.31]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, TOP - 0.11, 12), MAT.wood);
    leg.position.set(x, (TOP - 0.11) / 2, z);
    table.add(leg);
  }
  const towel = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.035, 0.34, 4, 0.016), MAT.pad);
  towel.position.set(-0.84, TOP + 0.012, 0);
  table.add(towel);
  shadows(table);
  stage.scene.add(table, shadowCatcher(0.001, 8, 0.12));

  // Client: lying on the back along x, head towards −x, legs long, arms by the sides.
  const client = cloneSkinned(gltf.scene);
  dress(client, MAT.client);
  giveHead(client, headScan, MAT.client);
  const lie = new THREE.Group();
  lie.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(v(0, 0, -1), v(-1, 0, 0), v(0, 1, 0)));
  lie.position.set(0.7, TOP + 0.1, 0);
  lie.add(client);
  stage.scene.add(lie);
  const C = new Poser(client);
  for (const [S, sx] of [["Left", 1], ["Right", -1]]) {
    C.aim(S + "Arm", S + "ForeArm", v(0.22 * sx, -1, -0.04));
    C.aim(S + "ForeArm", S + "Hand", v(0.1 * sx, -1, 0.1));
    C.aim(S + "UpLeg", S + "Leg", v(0.1 * sx, -1, 0));
    C.turn(S + "UpLeg", v(0, 1, 0), 0.24 * sx);
    C.aim(S + "Foot", S + "ToeBase", v(0.12 * sx, -0.8, 0.6));
    C.curl(S, 0.2);
  }
  C.bake();

  // Practitioner: seated on a stool at the head of the table.
  const SEAT = 0.47, HIP_X = -1.31;
  const stool = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 32), MAT.wood);
  seat.position.y = SEAT - 0.025;
  stool.add(seat);
  for (let k = 0; k < 3; k++) {
    const ang = (k / 3) * Math.PI * 2 + 0.5;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, SEAT - 0.04, 10), MAT.wood);
    leg.position.set(Math.cos(ang) * 0.13, (SEAT - 0.04) / 2, Math.sin(ang) * 0.13);
    stool.add(leg);
  }
  stool.position.set(HIP_X - 0.03, 0, 0);
  shadows(stool);
  stage.scene.add(stool);

  const teacher = cloneSkinned(gltf.scene);
  dress(teacher, MAT.teacher);
  giveHead(teacher, headScan, MAT.teacher);
  teacher.rotation.y = Math.PI / 2;
  stage.scene.add(teacher);
  const T = new Poser(teacher);
  teacher.position.set(HIP_X, SEAT + 0.085 - T.wpos("LeftUpLeg").y, 0);
  T.sync();
  T.turn("Spine", v(1, 0, 0), 0.2); T.turn("Spine1", v(1, 0, 0), 0.12); T.turn("Spine2", v(1, 0, 0), 0.1);
  T.turn("Neck", v(1, 0, 0), 0.16); T.turn("Head", v(1, 0, 0), 0.26);
  for (const [S, sx] of [["Left", 1], ["Right", -1]]) {
    const ankle = teacher.localToWorld(v(0.2 * sx, 0, 0.4)); ankle.y = 0.095;
    T.ik(S + "UpLeg", S + "Leg", S + "Foot", ankle, T.dir(v(0.3 * sx, 0.7, 1)));
    T.aim(S + "Foot", S + "ToeBase", v(0.16 * sx, -0.55, 1));
    T.curl(S, 0.14);
  }
  T.bake();

  // The neck vertebrae inside the client's neck, shown as an "x-ray" when the camera moves in.
  // The rig's "Head" joint sits at chin level, so the top vertebra belongs a little above it.
  const neckFig = client.worldToLocal(C.wpos("Neck")), headFig = client.worldToLocal(C.wpos("Head"));
  const up = client.worldToLocal(C.wpos("HeadTop_End")).sub(headFig).normalize();
  headFig.addScaledVector(up, 0.045); neckFig.addScaledVector(up, -0.012);
  const c7 = spine.rest.C7.pos, k = headFig.distanceTo(neckFig) / spine.rest.C1.pos.distanceTo(c7);
  const xBone = new THREE.MeshStandardMaterial({ color: 0x9a5f41, roughness: 0.55, transparent: true, opacity: 0 });
  const xSoft = new THREE.MeshStandardMaterial({ color: 0xc79a7e, roughness: 0.55, transparent: true, opacity: 0 });
  const xray = new THREE.Group();
  xray.visible = false;
  client.add(xray);
  const figPos = (n) => spine.rest[n].pos.clone().sub(c7).multiplyScalar(k).add(neckFig).add(v(0, 0, -0.012));
  let parent = xray, parentPos = v(0, 0, 0), first = true;
  const neck = NECK.map((n) => {
    const g = new THREE.Group(), p = figPos(n), inner = new THREE.Group();
    g.position.copy(p).sub(parentPos);
    inner.scale.setScalar(k);
    g.add(inner);
    for (const prim of spine.rest[n].prims) {
      const m = new THREE.Mesh(prim.geometry, prim.soft ? xSoft : xBone);
      prim.matrix.decompose(m.position, m.quaternion, m.scale);
      m.renderOrder = first ? 10 : 11;
      if (first) m.onBeforeRender = (renderer) => renderer.clearDepth(); // draw the vertebrae over the body
      first = false;
      inner.add(m);
    }
    parent.add(g); parent = g; parentPos = p;
    return g;
  });
  const neckTotal = NECK.reduce((s, n) => s + AXIAL[n], 0);

  const headPos = C.wpos("Head");
  const shots = [
    { dur: 9, at: v(-0.25, 0.7, 0), az: 0.5, el: 0.3, dist: 3.4, width: 2.45,
      caption: "You lie comfortably, in your clothes. I sit at your head." },
    { dur: 11, at: v(headPos.x + 0.02, headPos.y + 0.03, 0), az: 0.85, el: 0.34, dist: 1.75, width: 0.95,
      caption: "One hand on your forehead. Very gently, I roll your head: a little right, a little left." },
    { dur: 13, at: v(headPos.x + 0.05, headPos.y + 0.02, 0), az: 0.25, el: 0.3, dist: 1.0, width: 0.5, focus: "neck",
      caption: "Inside, the small joints of the neck turn one by one: the same movement as the skeleton above." },
  ];
  const direct = director(stage, shots);
  const say = captioner(canvas);
  const label = labelLayer(canvas, stage);
  const topLabel = label("fixed up"), lowLabel = label("fixed down");

  const rollAxis = v(0, 1, 0), rollQ = new Quat();
  const fore = { c: v(0, 0.118, 0.098), f: v(0.8, -0.5, 0.05), n: v(0, -0.25, -1) }; // forehead, in the client's own frame, relative to the Head joint
  const cw = v(0, 0, 0), fw = v(0, 0, 0), nw = v(0, 0, 0), pole = v(0, 0, 0), w = v(0, 0, 0);
  const ARMS = ["Spine", "LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand"];

  run(canvas, stage, (t) => {
    const wave = reduced ? 0.5 : Math.sin((t / 8) * Math.PI * 2);
    const roll = ROLL * wave; // + = towards the client's left
    C.reset(["Neck", "Head", "Spine2"]);
    C.turn("Spine2", v(1, 0, 0), -0.012 * Math.sin(t * 1.15)); // breathing
    C.turn("Neck", rollAxis, roll * 0.45);
    C.turn("Head", rollAxis, roll * 0.55);

    // Practitioner: right hand rides on the forehead, left hand rests on the shoulder.
    T.reset(ARMS);
    T.turn("Spine", v(0, 1, 0), 0.03 * wave);
    rollQ.setFromAxisAngle(rollAxis, roll);
    C.wpos("Head", cw).add(w.copy(fore.c).applyQuaternion(rollQ).applyQuaternion(C.frame));
    fw.copy(fore.f).applyQuaternion(rollQ).applyQuaternion(C.frame);
    nw.copy(fore.n).applyQuaternion(rollQ).applyQuaternion(C.frame);
    T.hand("Right", cw, fw, nw, pole.set(-0.5, -0.5, 1));
    C.wpos("LeftArm", cw).add(w.set(-0.045, 0.0, 0.062).applyQuaternion(C.frame));
    T.hand("Left", cw, fw.set(0.15, -1, 0).applyQuaternion(C.frame), nw.set(0.2, -0.1, -1).applyQuaternion(C.frame), pole.set(-0.4, -0.6, -1));

    const s = direct(t);
    say(s.cur.caption, s.captionOn);
    const x = s.cur.focus === "neck" ? s.focus : 0;
    xray.visible = x > 0.01;
    xBone.opacity = 0.96 * x; xSoft.opacity = 0.9 * x;
    neck.forEach((g, i) => { g.rotation.y = (AXIAL[NECK[i]] / neckTotal) * roll; });
    if (x > 0.01) {
      stage.scene.updateMatrixWorld(true);
      topLabel(neck[6].getWorldPosition(w), "top joint: turns the most", x);
      lowLabel(neck[2].getWorldPosition(w), "each joint below: a little", x);
    } else { topLabel(w, "", 0); lowLabel(w, "", 0); }
  });
  if (DEBUG) (window.__scenes ??= {}).table = { stage, C, T, client, teacher, lie, shots, fore, xray, HEAD_FIT };
}

const SCENES = { spine: spineScene, head: headScene, table: tableScene };

export function initScenes() {
  for (const canvas of document.querySelectorAll("canvas[data-scene]")) {
    const make = SCENES[canvas.dataset.scene];
    if (!make) continue;
    // Load each scene only when it approaches the viewport.
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      make(canvas).catch((err) => { console.warn("3D scene unavailable:", err); canvas.parentElement.classList.add("scene-failed"); canvas.remove(); });
    }, { rootMargin: "400px" });
    io.observe(canvas);
  }
}
