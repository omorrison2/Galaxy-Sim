import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js";

let PROTOTYPE_MODE = true;
let NUM_PARTICLES = 4000;
let prototypeStarMaterial;
let galaxyType = "spiral";
const MAX_WARP_ZOOM = 5;

const hud = document.getElementById("hud");

let scene, camera, renderer, controls;
let composer;
let points;
let starMaterial;

const clock = new THREE.Clock();
const statsEl = document.getElementById("stats");

let frameCount = 0;
let lastTime = performance.now();
let fps = 0;

let solarSystemActive = false;
let lastGalaxyType = null;
let currentSolarSystem = null;

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  camera.position.set(0, 16, 30);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  enableKeyCapture();

  prototypeStarMaterial = new THREE.PointsMaterial({
    size: 0.06,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
  });

  starMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      u_time: { value: 0 },
      u_size: { value: 8.0 },
      u_pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      u_warp: { value: 0 },
      u_cameraDir: { value: new THREE.Vector3() },
    },
    vertexShader: `
      uniform float u_time;
uniform float u_size;
uniform float u_pixelRatio;
uniform float u_warp;
uniform vec3 u_cameraDir;

attribute vec3 color;
varying vec3 vColor;

void main() {
  vColor = color;

  vec3 pos = position;

  pos += u_cameraDir * u_warp * (length(position) * 4.0);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

  float twinkle = 0.75 + 0.25 *
      sin(u_time * 3.0 + pos.x * 10.0 + pos.y * 20.0);

  float size = u_size * (1.0 / -mvPosition.z);
  gl_PointSize = size * u_pixelRatio * twinkle;

  gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float alpha = smoothstep(0.5, 0.0, d);
        if (alpha < 0.01) discard;
        float glow = smoothstep(0.3, 0.0, d);
        vec3 col = vColor * (1.0 + glow * 1.5);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  initGalaxy();

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.4,
    0.4,
    0.0
  );
  composer.addPass(bloomPass);

  window.addEventListener("resize", onWindowResize);

  window.setGalaxyType = setGalaxyType;
  window.randomGalaxy = randomGalaxy;
}
function enableKeyCapture() {
  renderer.domElement.setAttribute("tabindex", "0");
  renderer.domElement.style.outline = "none";

  window.addEventListener("keydown", onSolarKey);
  document.body.addEventListener("keydown", onSolarKey);
  renderer.domElement.addEventListener("keydown", onSolarKey);

  window.addEventListener("keydown", onWarpKey);
  document.body.addEventListener("keydown", onWarpKey);
  renderer.domElement.addEventListener("keydown", onWarpKey);
}

function setGalaxyType(type) {
  galaxyType = type;
  regenerateGalaxy();
}

function randomGalaxy() {
  const types = ["spiral", "barred", "elliptical", "irregular", "dwarf"];
  setGalaxyType(types[Math.floor(Math.random() * types.length)]);
}

function initGalaxy() {
  regenerateGalaxy();
}

function clearSolarSystem() {
  if (!currentSolarSystem) return;

  scene.remove(currentSolarSystem);
  currentSolarSystem.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });

  currentSolarSystem = null;
  solarSystemActive = false;
}

function clearGalaxy() {
  if (!points) return;
  scene.remove(points);
  points.geometry.dispose();
  points = null;
}

function regenerateGalaxy() {
  clearSolarSystem();

  if (points) {
    scene.remove(points);
    points.geometry.dispose();
    points = null;
  }

  const data = generateGalaxy(galaxyType);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(data.positions, 3)
  );
  geometry.setAttribute("color", new THREE.BufferAttribute(data.colors, 3));

  points = new THREE.Points(
    geometry,
    PROTOTYPE_MODE ? prototypeStarMaterial : starMaterial
  );

  scene.add(points);
  solarSystemActive = false;
}

function generateGalaxy(type) {
  const positions = new Float32Array(NUM_PARTICLES * 3);
  const colors = new Float32Array(NUM_PARTICLES * 3);

  switch (type) {
    case "spiral":
      generateSpiralGalaxy(positions, colors);
      break;
    case "barred":
      generateBarredSpiralGalaxy(positions, colors);
      break;
    case "elliptical":
      generateEllipticalGalaxy(positions, colors);
      break;
    case "irregular":
      generateIrregularGalaxy(positions, colors);
      break;
    case "dwarf":
      generateDwarfGalaxy(positions, colors);
      break;
    default:
      generateSpiralGalaxy(positions, colors);
  }

  return { positions, colors };
}

function generateSpiralGalaxy(pos, col) {
  const branches = 6;
  const spin = 0.7;
  const radius = 14;
  const randomness = 0.35;

  for (let i = 0; i < NUM_PARTICLES; i++) {
    const i3 = i * 3;
    const r = Math.pow(Math.random(), 1.3) * radius;

    const branchAngle = ((i % branches) / branches) * Math.PI * 2;
    const spinAngle = r * spin + Math.sin(r * 0.7) * 0.4;

    const baseX = Math.cos(branchAngle + spinAngle) * r;
    const baseZ = Math.sin(branchAngle + spinAngle) * r;

    const randX = (Math.random() - 0.5) * randomness * r;
    const randZ = (Math.random() - 0.5) * randomness * r;
    const y = (Math.random() - 0.5) * (0.4 + (1 - r / radius) * 2);

    pos[i3 + 0] = baseX + randX;
    pos[i3 + 1] = y;
    pos[i3 + 2] = baseZ + randZ;

    const t = 1 - r / radius;
    col[i3 + 0] = 1.0;
    col[i3 + 1] = 0.7 * t + 0.3;
    col[i3 + 2] = 0.3 + 0.7 * (1 - t);
  }
}

function generateBarredSpiralGalaxy(pos, col) {
  const branches = 6;
  const barBranches = [0, 3];
  const spin = 0.8;
  const radius = 14;
  const randomness = 0.25;
  const barRadius = 3.5;

  for (let i = 0; i < NUM_PARTICLES; i++) {
    const i3 = i * 3;

    const r = Math.pow(Math.random(), 1.3) * radius;
    const branch = i % branches;

    const isBarArm = barBranches.includes(branch);

    const branchAngle = (branch / branches) * Math.PI * 2 + 0.4;
    const spinFactor = isBarArm && r < barRadius ? 0.15 : 1.0;

    const spinAngle = r * spin * spinFactor;
    let baseX = Math.cos(branchAngle + spinAngle) * r;
    let baseZ = Math.sin(branchAngle + spinAngle) * r;
    let extraX = 0,
      extraZ = 0;

    if (isBarArm && r < barRadius) {
      const dx = Math.cos(branchAngle + spinAngle);
      const dz = Math.sin(branchAngle + spinAngle);
      const px = -dz;
      const pz = dx;

      const barThickness = 0.8;

      extraX = px * (Math.random() - 0.5) * barThickness;
      extraZ = pz * (Math.random() - 0.5) * barThickness;
    }
    const randScale = isBarArm && r < barRadius ? 0.15 : randomness;
    const x = baseX + extraX + (Math.random() - 0.5) * randScale * r;
    const z = baseZ + extraZ + (Math.random() - 0.5) * randScale * r;
    const y = (Math.random() - 0.5) * (0.4 + (1 - r / radius) * 2);

    pos[i3 + 0] = x;
    pos[i3 + 1] = y;
    pos[i3 + 2] = z;
    if (isBarArm && r < barRadius) {
      col[i3 + 0] = 1.0;
      col[i3 + 1] = 0.9;
      col[i3 + 2] = 0.75;
    } else {
      const t = 1 - r / radius;
      col[i3 + 0] = 1.0;
      col[i3 + 1] = 0.75 * t + 0.25;
      col[i3 + 2] = 0.4 + 0.5 * (1 - t);
    }
  }
}

function generateEllipticalGalaxy(pos, col) {
  const a = 10;
  const b = 5;
  const c = 4;
  for (let i = 0; i < NUM_PARTICLES; i++) {
    const i3 = i * 3;
    const r = Math.pow(Math.random(), 4.0);
    const u = Math.random();
    const v = Math.random();
    const theta = Math.acos(2 * u - 1);
    const phi = 2 * Math.PI * v;
    const x = r * Math.sin(theta) * Math.cos(phi) * a;
    const y = r * Math.cos(theta) * c;
    const z = r * Math.sin(theta) * Math.sin(phi) * b;

    pos[i3 + 0] = x;
    pos[i3 + 1] = y;
    pos[i3 + 2] = z;

    const t = r;
    col[i3 + 0] = 1.0;
    col[i3 + 1] = 0.75 - t * 0.35;
    col[i3 + 2] = 0.6 - t * 0.25;
  }
}

function generateIrregularGalaxy(pos, col) {
  const radius = 5;

  function noise(x, y, z) {
    return (
      (Math.sin(x * 12.1 + y * 7.33 + z * 5.77) +
        Math.sin(x * 3.11 + z * 9.17) +
        Math.sin(y * 4.27 + x * 8.91)) *
      0.33
    );
  }

  for (let i = 0; i < NUM_PARTICLES; i++) {
    const i3 = i * 3;

    let x = (Math.random() - 0.5) * radius * 2;
    let y = (Math.random() - 0.5) * radius * 1.2;
    let z = (Math.random() - 0.5) * radius * 2;

    const n = noise(x * 0.1, y * 0.1, z * 0.1);
    x += n * 4.0;
    y += n * 2.0;
    z += n * 4.0;

    pos[i3 + 0] = x;
    pos[i3 + 1] = y;
    pos[i3 + 2] = z;

    const burst = noise(x * 0.2, y * 0.2, z * 0.2);

    if (burst > 0.25) {
      col[i3 + 0] = 0.7 + burst * 0.3;
      col[i3 + 1] = 0.8 + burst * 0.2;
      col[i3 + 2] = 1.0;
    } else if (burst < -0.3) {
      col[i3 + 0] = 1.0;
      col[i3 + 1] = 0.6;
      col[i3 + 2] = 0.4;
    } else {
      const t = Math.random() * 0.8 + 0.2;
      col[i3 + 0] = 0.7 * t + 0.3;
      col[i3 + 1] = 0.7 * t + 0.2;
      col[i3 + 2] = 0.9 * t;
    }
  }
}

function generateDwarfGalaxy(pos, col) {
  const NUM_DWARF_PARTICLES = 100000;
  const branches = 5;
  const spin = 0.4;
  const radius = 5.5;
  const randomness = 0.5;

  for (let i = 0; i < NUM_DWARF_PARTICLES; i++) {
    const i3 = i * 3;

    const r = Math.pow(Math.random(), 1.6) * radius;

    const branchAngle = ((i % branches) / branches) * Math.PI * 2;
    const spinAngle = r * spin;

    const baseX = Math.cos(branchAngle + spinAngle) * r;
    const baseZ = Math.sin(branchAngle + spinAngle) * r;

    pos[i3 + 0] = baseX + (Math.random() - 0.5) * randomness * r;
    pos[i3 + 1] = (Math.random() - 0.5) * (0.3 + (1 - r / radius));
    pos[i3 + 2] = baseZ + (Math.random() - 0.5) * randomness * r;

    const t = 1 - r / radius;
    col[i3 + 0] = 1.0;
    col[i3 + 1] = 0.75 * t + 0.25;
    col[i3 + 2] = 0.55 + 0.45 * (1 - t);
  }
}

function onPrototypeToggle(e) {
  if (e.key.toLowerCase() !== "p") return;

  PROTOTYPE_MODE = !PROTOTYPE_MODE;
  NUM_PARTICLES = PROTOTYPE_MODE ? 4000 : 250000;

  hud.textContent = PROTOTYPE_MODE ? "Prototype Mode" : "Galaxy Mode";
  hud.style.opacity = 1;

  regenerateGalaxy();
}
window.addEventListener("keydown", onPrototypeToggle);

function onSolarKey(event) {
  if (event.key.toLowerCase() !== "s") return;
  if (solarSystemActive) return;
  if (!points) return;

  const cameraDist = camera.position.distanceTo(controls.target);

  if (cameraDist > 18) {
    hud.textContent = "Zoom in closer to explore a solar system!";
    hud.style.opacity = 1;
    return;
  }

  const center = controls.target.clone();

  const sCameraDist = camera.position.distanceTo(controls.target);
  if (sCameraDist < MAX_WARP_ZOOM && controls.target.length() < 0.5) {
    hud.textContent = "Warping…";
    hud.style.opacity = 1;
    warpToRandomGalaxy();
    return;
  }

  hud.textContent = "Exploring solar system...";
  hud.style.opacity = 1;
  spawnSolarSystem(center);
}

function onWarpKey(event) {
  if (event.key.toLowerCase() !== "w") return;
  if (solarSystemActive) return;

  const cameraDist = camera.position.distanceTo(controls.target);

  if (cameraDist > 18) {
    hud.textContent = "Press W to warp into a new galaxy!";
    hud.style.opacity = 1;
    return;
  }

  hud.textContent = "Warping...";
  hud.style.opacity = 1;

  warpToRandomGalaxy();
}

function spawnSolarSystem(center) {
  lastGalaxyType = galaxyType;
  solarSystemActive = true;

  clearGalaxy();

  const system = new THREE.Group();
  system.position.copy(center);
  scene.add(system);

  const sunGeo = new THREE.SphereGeometry(3, 32, 32);
  const sunMat = new THREE.MeshStandardMaterial({
    emissive: 0xffdd88,
    emissiveIntensity: 3.0,
    color: 0xffffff,
    toneMapped: false,
  });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  system.add(sun);

  const fillLight = new THREE.DirectionalLight(0x223355, 0.6);
  fillLight.position.set(-20, 6, -20);
  scene.add(fillLight);

  const sunlight = new THREE.PointLight(0xffffff, 2.3, 2000);
  sunlight.decay = 1.2;
  sunlight.distance = 2000;
  sunlight.position.copy(sun.position);
  sunlight.castShadow = false;
  system.add(sunlight);

  const ambientSpace = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientSpace);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.5);
  scene.add(hemi);

  const textureLoader = new THREE.TextureLoader();
  textureLoader.crossOrigin = "";

  const NUM_PLANETS = THREE.MathUtils.randInt(3, 12);

  for (let i = 0; i < NUM_PLANETS; i++) {
    const orbitRadius = 3 + i * THREE.MathUtils.randFloat(10, 14);
    const size = THREE.MathUtils.randFloat(0.25, 1.25);

    const geo = new THREE.SphereGeometry(size, 32, 32);

    let mat;

    if (PROTOTYPE_MODE) {
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(Math.random(), 0.6, 0.5),
        roughness: 0.9,
        metalness: 0.0,
      });
    } else {
      const map = textureLoader.load(
        `https://picsum.photos/512/512?random=${Math.random()}`
      );

      mat = new THREE.MeshStandardMaterial({
        map,
        roughness: 0.8,
        metalness: 0.0,
      });
    }

    const planet = new THREE.Mesh(geo, mat);
    planet.userData.orbitRadius = orbitRadius;
    planet.userData.orbitSpeed = THREE.MathUtils.randFloat(0.05, 0.5);
    system.add(planet);

    composer.passes[1].strength = 0.8;
    composer.passes[1].radius = 0.35;
    composer.passes[1].threshold = 0.25;

    if (Math.random() < 0.35) {
      const NUM_MOONS = THREE.MathUtils.randInt(1, 3);
      for (let m = 0; m < NUM_MOONS; m++) {
        const moonSize = THREE.MathUtils.randFloat(size * 0.1, size * 0.3);
        const moonGeo = new THREE.SphereGeometry(moonSize, 16, 16);
        const moonMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
        const moon = new THREE.Mesh(moonGeo, moonMat);

        moon.userData.parentPlanet = planet;
        moon.userData.moonOrbitRadius = THREE.MathUtils.randFloat(
          size * 1.5,
          size * 3.0
        );
        moon.userData.moonOrbitSpeed = THREE.MathUtils.randFloat(0.2, 1.2);

        system.add(moon);
      }
    }
  }

  currentSolarSystem = system;

  controls.target.copy(center);
  camera.position.set(center.x, center.y + 8, center.z + 12);
}

function revertToGalaxy() {
  clearSolarSystem();
  galaxyType = lastGalaxyType;
  regenerateGalaxy();

  controls.target.set(0, 0, 0);
  camera.position.set(0, 16, 30);
  composer.passes[1].strength = 1.4;
  composer.passes[1].radius = 0.4;
  composer.passes[1].threshold = 0.0;
}

function playHyperspaceWarp(onComplete) {
  if (!points) {
    onComplete();
    return;
  }

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  starMaterial.uniforms.u_cameraDir.value.copy(dir);

  const start = performance.now();

  function animateWarp(time) {
    const t = (time - start) / 700;
    const w = Math.min(t, 1);

    starMaterial.uniforms.u_warp.value = w;

    if (w < 1) {
      requestAnimationFrame(animateWarp);
    } else {
      starMaterial.uniforms.u_warp.value = 0;

      onComplete();
    }
  }

  requestAnimationFrame(animateWarp);
}

function warpToRandomGalaxy() {
  playHyperspaceWarp(() => {
    clearSolarSystem();
    clearGalaxy();
    randomGalaxy();

    solarSystemActive = false;
    controls.target.set(0, 0, 0);
    camera.position.set(0, 16, 30);
    controls.update();
  });
}

function animate() {
  requestAnimationFrame(animate);

  const elapsed = clock.getElapsedTime();

  if (!PROTOTYPE_MODE && starMaterial?.uniforms) {
    starMaterial.uniforms.u_time.value = elapsed;
  }

  if (points) points.rotation.y += 0.0008;

  if (solarSystemActive && currentSolarSystem) {
    currentSolarSystem.children.forEach((obj) => {
      if (obj.userData.orbitRadius) {
        const r = obj.userData.orbitRadius;
        const speed = obj.userData.orbitSpeed || 0.3;
        obj.position.set(
          Math.cos(elapsed * speed) * r,
          0,
          Math.sin(elapsed * speed) * r
        );
      }
      if (obj.userData.parentPlanet) {
        const parent = obj.userData.parentPlanet;
        const r = obj.userData.moonOrbitRadius;
        const speed = obj.userData.moonOrbitSpeed || 1.0;
        obj.position.set(
          parent.position.x + Math.cos(elapsed * speed) * r,
          parent.position.y,
          parent.position.z + Math.sin(elapsed * speed) * r
        );
      }
    });
  }

  if (solarSystemActive && currentSolarSystem) {
    const dist = camera.position.distanceTo(controls.target);
    if (dist > 60) {
      revertToGalaxy();
    }
  }

  const now = performance.now();
  frameCount++;
  if (now - lastTime >= 1000) {
    fps = (frameCount * 1000) / (now - lastTime);
    frameCount = 0;
    lastTime = now;
    if (statsEl) {
      statsEl.textContent = `FPS: ${fps.toFixed(0)} • Mode: ${
        solarSystemActive ? "Solar System" : galaxyType
      }`;
    }
  }

  if (!solarSystemActive && points) {
    const dist = camera.position.distanceTo(controls.target);

    if (dist > 60) {
      hud.textContent = "Use mouse wheel/trackpad to zoom";
      hud.style.opacity = 1;
    } else if (dist > 25) {
      hud.textContent = "Zoom closer to explore star systems!";
      hud.style.opacity = 1;
    } else if (dist > 10) {
      hud.textContent = "Press S to explore a star system!";
      hud.style.opacity = 1;
    } else if (controls.target.length() < 2.5) {
      hud.textContent = "Press W to warp into a new galaxy!";
      hud.style.opacity = 1;
    } else {
      hud.textContent = "Press S to explore this star system!";
      hud.style.opacity = 1;
    }
  } else {
    hud.style.opacity = 0;
  }

  controls.update();
  composer.render();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);

  if (starMaterial) {
    starMaterial.uniforms.u_pixelRatio.value = Math.min(
      window.devicePixelRatio,
      2
    );
  }
}
