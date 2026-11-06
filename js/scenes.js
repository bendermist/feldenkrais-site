// 3D scenes of human movement for the Feldenkrais site.
// Models: BodyParts3D spine (CC BY-SA 2.1 JP), Lee Perry-Smith head scan (CC BY 3.0), Mixamo X Bot mannequin.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = {};
const load = (url) => (cache[url] ??= loader.loadAsync(url));

const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/* ---------- materials: matte plaster / porcelain ---------- */
const plaster = (color, extra = {}) => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.66, metalness: 0, sheen: 0.5, sheenRoughness: 0.85, sheenColor: new THREE.Color(0xffffff), ...extra,
});
const MAT = {
  bone: plaster(0xf0e8dc),
  cartilage: plaster(0xd8b49a, { roughness: 0.5 }),
  head: plaster(0xeee6da, { roughness: 0.7 }),
  client: plaster(0xebe2d5),
  clientJoint: plaster(0xd9cdbd),
  teacher: plaster(0xc89a7c),
  teacherJoint: plaster(0xb3866a),
  table: plaster(0xdfd5c6, { roughness: 0.8 }),
  pad: plaster(0xf4eee4, { roughness: 0.95 }),
  wood: plaster(0xc9b8a3, { roughness: 0.7 }),
};

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
  const look = new THREE.Vector3(...target);
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

  const stage = { renderer, scene, camera, look, key };
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    stage.onResize?.(w, h);
    if (reduced && stage.ready) renderer.render(scene, camera);
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
  canvas.classList.add("loaded");
  const frame = () => {
    raf = 0;
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!reduced) t += dt;
    update(t, dt);
    stage.renderer.render(stage.scene, stage.camera);
    if (!reduced) raf = requestAnimationFrame(frame);
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) { clock.getDelta(); raf = requestAnimationFrame(frame); }
  }, { rootMargin: "150px" }).observe(canvas);
}

const shadows = (o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

/* =========================================================
   1. Spine rotation (hero): an anatomical spine turning,
   rotation shared out along the segments as in a real twist.
   ========================================================= */
const LEVELS = ["L5", "L4", "L3", "L2", "L1", "T12", "T11", "T10", "T9", "T8", "T7", "T6", "T5", "T4", "T3", "T2", "T1", "C7", "C6", "C5", "C4", "C3", "C2", "C1"];
// Approximate share of axial rotation per segment (radians at full turn).
const TWIST = { L: 0.012, T: 0.048, C: 0.055, C2: 0.04, C1: 0.3 };

async function spineScene(canvas) {
  const stage = makeStage(canvas, { fov: 26, pos: [0, 1.24, 2.75], target: [0, 1.2, 0] });
  const gltf = await load("models/spine.glb");
  const model = gltf.scene;
  model.traverse((o) => { if (o.isMesh) o.material = o.material.name === "cartilage" ? MAT.cartilage : MAT.bone; });
  shadows(model);
  model.updateMatrixWorld(true);

  // Re-parent into a chain: pelvis → L5 → … → C1 → skull, keeping world positions.
  const get = (n) => model.getObjectByName(n);
  let parent = get("pelvis");
  const segs = LEVELS.map((n) => { const node = get(n); parent.attach(node); parent = node; return node; });
  get("C1").attach(get("skull"));
  get("T5").attach(get("sternum"));
  get("T2").attach(get("shoulders"));
  for (const s of segs) s.userData.rest = s.quaternion.clone();
  const skull = get("skull");

  const figure = new THREE.Group();
  figure.add(model);
  stage.scene.add(figure);
  stage.scene.add(shadowCatcher(0.74, 6, 0.1));

  const pointer = { x: 0, tx: 0 };
  addEventListener("pointermove", (e) => { pointer.tx = (e.clientX / innerWidth) * 2 - 1; }, { passive: true });
  stage.onResize = () => {
    const wide = innerWidth > 720;
    figure.position.x = wide ? 0.08 : 0;
  };
  stage.onResize();

  const q = new THREE.Quaternion(), e = new THREE.Euler();
  run(canvas, stage, (t) => {
    pointer.x += (pointer.tx - pointer.x) * 0.03;
    // 36 s cycle: whole spine turns together, then shoulders turn while the head stays (differentiation).
    const cycle = (t % 36) / 36;
    const diff = smooth(clamp01((cycle - 0.45) * 8)) * (1 - smooth(clamp01((cycle - 0.92) * 12.5)));
    const turn = Math.sin((t / 9) * Math.PI * 2) * (0.75 + 0.25 * Math.sin(t * 0.09));
    segs.forEach((s, i) => {
      const name = LEVELS[i];
      const w = name === "C1" ? TWIST.C1 : name === "C2" ? TWIST.C2 : TWIST[name[0]];
      const neck = name[0] === "C" ? 1 - 2 * diff : 1; // cervical turns back during differentiation
      const breathe = name[0] === "T" ? 0.006 * Math.sin(t * 1.1 - i * 0.2) : 0;
      e.set(breathe, turn * w * neck, (name[0] === "C" ? 0.02 : 0.008) * turn * neck);
      s.quaternion.copy(s.userData.rest).multiply(q.setFromEuler(e));
    });
    skull.rotation.x = 0.03 * Math.sin(t * 0.5);
    figure.rotation.y = -0.55 + 0.18 * Math.sin(t * 0.07) + pointer.x * 0.25;
  });
}

/* =========================================================
   2. Awareness Through Movement: head and eyes.
   ========================================================= */
const ATM_PHASES = [
  { caption: "Turn your head gently right and left. Let your eyes lead.", head: 0.5, eyes: 1.35 },
  { caption: "Now let the eyes look the other way while the head turns.", head: 0.38, eyes: -0.9 },
  { caption: "Eyes and head together again. Notice how much further, how much easier.", head: 0.78, eyes: 1.25 },
];

// Head-scan landmarks after normalising the bust to 1.1 units tall, centred at the origin.
const HEAD = { neckLow: -0.27, neckHigh: -0.08, pivot: [0, -0.13, -0.03], eyes: [0, 0.245, 0.235], gazeR: 1.25 };

async function headScene(canvas) {
  const stage = makeStage(canvas, { fov: 28, pos: [0.75, 1.15, 2.9], target: [0, 0.08, 0.15] });
  stage.key.position.set(2, 4, 3.5);
  const gltf = await load("models/head.glb");
  const src = gltf.scene.getObjectByName("LeePerrySmith");

  // Normalise the geometry, then skin it with two bones so only head and neck turn.
  const geo = src.geometry.clone();
  geo.computeBoundingBox();
  const size = new THREE.Vector3(), centre = new THREE.Vector3();
  geo.boundingBox.getSize(size); geo.boundingBox.getCenter(centre);
  const s = 1.1 / size.y;
  geo.translate(-centre.x, -centre.y, -centre.z).scale(s, s, s);
  const pos = geo.attributes.position, n = pos.count;
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const w = smooth(clamp01((pos.getY(i) - HEAD.neckLow) / (HEAD.neckHigh - HEAD.neckLow)));
    skinIndex[i * 4 + 1] = 1;
    skinWeight[i * 4] = 1 - w;
    skinWeight[i * 4 + 1] = w;
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
  const rootBone = new THREE.Bone(), headBone = new THREE.Bone();
  headBone.position.set(...HEAD.pivot);
  rootBone.add(headBone);
  const bust = new THREE.SkinnedMesh(geo, MAT.head);
  bust.add(rootBone);
  bust.bind(new THREE.Skeleton([rootBone, headBone]));
  bust.castShadow = bust.receiveShadow = true;
  bust.frustumCulled = false;
  stage.scene.add(bust);
  stage.scene.add(shadowCatcher(-0.55, 6, 0.08));

  // Gaze: a fine dashed line from between the eyes to the point the eyes look at, on an arc at eye level.
  const eyeInBone = new THREE.Vector3(...HEAD.eyes).sub(new THREE.Vector3(...HEAD.pivot));
  const eyeY = HEAD.eyes[1];
  const target = new THREE.Mesh(new THREE.SphereGeometry(0.022, 20, 14), new THREE.MeshBasicMaterial({ color: 0xa8714f }));
  stage.scene.add(target);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const gaze = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: 0xa8714f, dashSize: 0.035, gapSize: 0.025, transparent: true, opacity: 0.85 }));
  stage.scene.add(gaze);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(HEAD.gazeR, 0.002, 4, 160, Math.PI * 0.8), new THREE.MeshBasicMaterial({ color: 0xc4b39f }));
  arc.rotation.set(Math.PI / 2, 0, Math.PI * 0.1);
  arc.position.set(0, eyeY, HEAD.pivot[2]);
  stage.scene.add(arc);
  const pivot = headBone, inner = headBone; // animated below

  const captionEl = canvas.closest(".feature")?.querySelector("[data-atm-caption]");
  const stepEls = canvas.closest(".feature")?.querySelectorAll("[data-atm-step]") || [];
  let shownPhase = -1;
  const eyeWorld = new THREE.Vector3();
  const PHASE_LEN = 11;

  run(canvas, stage, (t) => {
    const p = Math.floor(t / PHASE_LEN) % ATM_PHASES.length;
    const local = (t % PHASE_LEN) / PHASE_LEN;
    const next = ATM_PHASES[(p + 1) % ATM_PHASES.length], cur = ATM_PHASES[p];
    const blend = smooth(clamp01((local - 0.88) / 0.12));
    const headAmp = THREE.MathUtils.lerp(cur.head, next.head, blend);
    const eyeAmp = THREE.MathUtils.lerp(cur.eyes, next.eyes, blend);
    const wave = Math.sin((t / (PHASE_LEN / 2)) * Math.PI * 2);
    const yaw = headAmp * wave;
    pivot.rotation.set(0.03 * Math.sin(t * 0.7), yaw, -0.06 * wave * (headAmp / 0.8), "YXZ"); // a little side-tilt follows the turn
    const gazeYaw = eyeAmp >= 0 ? yaw * eyeAmp : headAmp * eyeAmp * wave; // with the head, or against it
    target.position.set(Math.sin(gazeYaw) * HEAD.gazeR, eyeY, HEAD.pivot[2] + Math.cos(gazeYaw) * HEAD.gazeR);
    bust.updateMatrixWorld(true);
    eyeWorld.copy(eyeInBone); inner.localToWorld(eyeWorld);
    lineGeo.attributes.position.setXYZ(0, eyeWorld.x, eyeWorld.y, eyeWorld.z);
    lineGeo.attributes.position.setXYZ(1, target.position.x, target.position.y, target.position.z);
    lineGeo.attributes.position.needsUpdate = true;
    gaze.computeLineDistances();
    if (p !== shownPhase) {
      shownPhase = p;
      if (captionEl) { captionEl.classList.remove("show"); void captionEl.offsetWidth; captionEl.textContent = cur.caption; captionEl.classList.add("show"); }
      stepEls.forEach((el, k) => el.classList.toggle("active", k === p));
    }
  });
}

/* =========================================================
   3. Functional Integration: a client lying on the table,
   the practitioner seated at the head, cradling and turning it.
   ========================================================= */
// Pose angles (radians) applied on top of the T-pose bind, per bone: [x, y, z].
const CLIENT_POSE = {
  LeftArm: [0, 0, -1.25], RightArm: [0, 0, 1.25],
  LeftForeArm: [0, 0, -0.1], RightForeArm: [0, 0, 0.1],
  LeftUpLeg: [-0.95, 0, -0.06], RightUpLeg: [-0.95, 0, 0.06],
  LeftLeg: [1.75, 0, 0], RightLeg: [1.75, 0, 0],
  LeftFoot: [-0.6, 0, 0], RightFoot: [-0.6, 0, 0],
};
// Arm angles found by a small reach search so both hands rest under the client's head.
const TEACHER_POSE = {
  Spine: [0.38, 0, 0], Spine1: [0.18, 0, 0], Spine2: [0.08, 0, 0], Neck: [0.2, 0, 0], Head: [0.35, 0, 0],
  LeftArm: [-0.86, -1.26, -0.81], LeftForeArm: [-0.48, -0.68, -0.15],
  RightArm: [-1.1, 1.23, 0.8], RightForeArm: [0.88, 0.65, -0.23],
  LeftHand: [0.2, 0, 0.2], RightHand: [0.2, 0, -0.2],
  LeftUpLeg: [-1.6, 0, -0.12], RightUpLeg: [-1.6, 0, 0.12],
  LeftLeg: [1.6, 0, 0], RightLeg: [1.6, 0, 0],
};

function rig(root) {
  const bones = {};
  root.traverse((o) => { if (o.isBone) { const k = o.name.replace(/^mixamorig:?/, ""); bones[k] = o; o.userData.rest = o.quaternion.clone(); } });
  return bones;
}
const qq = new THREE.Quaternion(), ee = new THREE.Euler();
function pose(bones, p, extra = {}) {
  for (const [k, b] of Object.entries(bones)) {
    const a = p[k], x = extra[k];
    b.quaternion.copy(b.userData.rest);
    if (a) b.quaternion.multiply(qq.setFromEuler(ee.set(a[0], a[1], a[2])));
    if (x) b.quaternion.multiply(qq.setFromEuler(ee.set(x[0], x[1], x[2])));
  }
}
function dress(root, body, joint) {
  root.traverse((o) => { if (o.isMesh) { o.material = /Joints/i.test(o.material.name) ? joint : body; o.castShadow = o.receiveShadow = true; o.frustumCulled = false; } });
}

async function tableScene(canvas) {
  const stage = makeStage(canvas, { fov: 30, pos: [1.7, 2.3, 3.4], target: [0.1, 0.72, 0] });
  stage.key.position.set(1.5, 6, 3);
  const gltf = await load("models/figure.glb");

  // Table
  const TABLE_H = 0.62;
  const table = new THREE.Group();
  const top = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.08, 0.72, 4, 0.03), MAT.table);
  top.position.y = TABLE_H - 0.04;
  const pad = new THREE.Mesh(new RoundedBoxGeometry(1.96, 0.07, 0.7, 4, 0.03), MAT.pad);
  pad.position.y = TABLE_H + 0.03;
  table.add(top, pad);
  for (const x of [-0.88, 0.88]) for (const z of [-0.28, 0.28]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, TABLE_H - 0.08, 12), MAT.wood);
    leg.position.set(x, (TABLE_H - 0.08) / 2, z);
    table.add(leg);
  }
  shadows(table);
  stage.scene.add(table);

  // Stool for the practitioner
  const stool = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 32), MAT.wood);
  seat.position.y = 0.46;
  stool.add(seat);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.46, 10), MAT.wood);
    leg.position.set(Math.cos(a) * 0.13, 0.23, Math.sin(a) * 0.13);
    stool.add(leg);
  }
  stool.position.set(-1.4, 0, 0);
  shadows(stool);
  stage.scene.add(stool);
  stage.scene.add(shadowCatcher(0.001, 8, 0.12));

  // Client: supine along x, head towards -x, face up.
  const client = cloneSkinned(gltf.scene);
  dress(client, MAT.client, MAT.clientJoint);
  const cb = rig(client);
  const lie = new THREE.Group(); // rotate the standing figure onto its back
  lie.rotation.set(-Math.PI / 2, 0, 0, "YXZ");
  lie.add(client);
  const clientRoot = new THREE.Group();
  clientRoot.rotation.y = Math.PI / 2;
  clientRoot.add(lie);
  clientRoot.position.set(0.85, TABLE_H + 0.14, 0);
  stage.scene.add(clientRoot);

  // Practitioner: seated on the stool facing the client's head.
  const teacher = cloneSkinned(gltf.scene);
  dress(teacher, MAT.teacher, MAT.teacherJoint);
  const tb = rig(teacher);
  teacher.rotation.y = Math.PI / 2;
  teacher.position.set(-1.36, -0.53, 0); // seated: the bind pose stands, so lower the root onto the stool
  stage.scene.add(teacher);

  stage.onResize = (w) => {
    const narrow = w < 560;
    stage.look.set(narrow ? -0.35 : -0.18, 0.66, 0);
    stage.camera.position.set(narrow ? 1.6 : 1.15, narrow ? 2.3 : 1.75, narrow ? 3.9 : 2.75);
    stage.camera.lookAt(stage.look);
  };
  stage.onResize(canvas.clientWidth);

  run(canvas, stage, (t) => {
    const w = Math.sin(t * 0.5);
    const headTurn = 0.5 * w;
    // Client: head turns in the practitioner's hands; ribs breathe; knees settle.
    pose(cb, CLIENT_POSE, {
      Neck: [0, headTurn * 0.45, 0],
      Head: [0, headTurn * 0.55, 0],
      Spine2: [0.015 * Math.sin(t * 1.1), headTurn * 0.06, 0],
      Spine1: [0, headTurn * 0.03, 0],
    });
    // Practitioner: hands follow the head; a slight lean with the movement.
    pose(tb, TEACHER_POSE, {
      Spine: [0, 0.04 * w, 0],
      Head: [0, 0.12 * w, 0],
      LeftHand: [0, 0, -0.2 * w], RightHand: [0, 0, -0.2 * w],
    });
  });
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
      make(canvas).catch((err) => { console.warn("3D scene unavailable:", err); canvas.remove(); });
    }, { rootMargin: "400px" });
    io.observe(canvas);
  }
}
