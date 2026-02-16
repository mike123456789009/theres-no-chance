import * as THREE from "three";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TTFLoader } from "three/addons/loaders/TTFLoader.js";
import { SVGRenderer } from "three/addons/renderers/SVGRenderer.js";

const stage = document.querySelector("[data-stage]");
const logo = document.querySelector(".tnc-logo");
const scrollCue = document.querySelector(".scroll-cue");
const canvas = document.getElementById("hero-canvas");
const wrap = document.getElementById("hero3d");

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const WORD_CONFIGS = [
  { key: "theres", text: "THERE'S", color: "red", row: 0, segment: [0.0, 0.33], direction: "left" },
  { key: "no", text: "NO", color: "gold", row: 1, segment: [0.33, 0.66], direction: "left" },
  { key: "chance", text: "CHANCE", color: "red", row: 2, segment: [0.66, 0.99], direction: "left" },
  { key: "slash", text: "/", color: "neutral", row: 1, segment: [0.33, 0.66], direction: "right" },
  { key: "a", text: "A", color: "gold", row: 1, segment: [0.33, 0.66], direction: "right" },
];
const MAIN_WORD_KEYS = new Set(["theres", "no", "chance"]);

const DEFAULT_COLORS = {
  redFace: 0xbc595e,
  redSide: 0x955158,
  goldFace: 0xc6a727,
  goldSide: 0xc6a727,
  neutralFace: 0xc9c5b8,
  neutralSide: 0xaba596,
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const segProgress = (p, s, e) => (p <= s ? 0 : p >= e ? 1 : (p - s) / (e - s));

let renderer = null;
let scene = null;
let camera = null;
let renderMode = "fallback";
let svgHost = null;

let words = [];
let activeTextures = [];
let needsRender = true;
let lastW = 0;
let lastH = 0;
let revealObserver = null;
let themeColors = { ...DEFAULT_COLORS };
const wordMap = new Map();
const hoverRaycaster = new THREE.Raycaster();
const hoverPointer = new THREE.Vector2();
let isAHovered = false;

function setRenderMode(mode) {
  renderMode = mode;
  document.body.dataset.renderMode = mode;
}

function ensureSvgHost() {
  if (svgHost) return svgHost;
  svgHost = document.createElement("div");
  svgHost.className = "svg-render-host";
  wrap.appendChild(svgHost);
  return svgHost;
}

function getThemeColor(cssVarName, fallbackHex) {
  const cssValue = getComputedStyle(document.documentElement).getPropertyValue(cssVarName).trim();
  if (!cssValue) return fallbackHex;

  try {
    return new THREE.Color(cssValue).getHex();
  } catch {
    return fallbackHex;
  }
}

function syncThemeColors() {
  themeColors = {
    redFace: getThemeColor("--red-face", DEFAULT_COLORS.redFace),
    redSide: getThemeColor("--red-side", DEFAULT_COLORS.redSide),
    goldFace: getThemeColor("--gold-face", DEFAULT_COLORS.goldFace),
    goldSide: getThemeColor("--gold-side", DEFAULT_COLORS.goldSide),
    neutralFace: getThemeColor("--neutral-face", DEFAULT_COLORS.neutralFace),
    neutralSide: getThemeColor("--neutral-side", DEFAULT_COLORS.neutralSide),
  };
}

function loadFont() {
  const ttf = new TTFLoader();
  return new Promise((resolve, reject) => {
    ttf.load(
      "/assets/fonts/Bungee-Regular.ttf",
      (fontJson) => {
        resolve(new FontLoader().parse(fontJson));
      },
      undefined,
      reject
    );
  });
}

function initWebGLRenderer() {
  const webglRenderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "default",
  });
  webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  webglRenderer.outputColorSpace = THREE.SRGBColorSpace;
  webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  webglRenderer.toneMappingExposure = 0.98;
  webglRenderer.shadowMap.enabled = true;
  webglRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return webglRenderer;
}

function initSvgRenderer() {
  const svgRenderer = new SVGRenderer();
  svgRenderer.setQuality("high");
  svgRenderer.setPrecision(8);
  svgRenderer.overdraw = 0.6;
  const host = ensureSvgHost();
  host.innerHTML = "";
  host.appendChild(svgRenderer.domElement);
  return svgRenderer;
}

function initRenderer() {
  try {
    renderer = initWebGLRenderer();
    setRenderMode("webgl");
    return;
  } catch (webglErr) {
    console.warn("WebGL renderer unavailable. Falling back to software SVG renderer.", webglErr);
  }

  renderer = initSvgRenderer();
  setRenderMode("svg");
}

function setupScene() {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2500, 2500);
  camera.position.set(160, 0, 680);
  camera.lookAt(0, 0, 0);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xcecece, 0.74);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 1.02);
  key.position.set(-460, 580, 860);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.42);
  fill.position.set(760, 120, 460);
  scene.add(fill);

  if (renderMode === "webgl") {
    key.castShadow = true;
    key.shadow.mapSize.width = 2048;
    key.shadow.mapSize.height = 2048;
    key.shadow.camera.left = -1200;
    key.shadow.camera.right = 1200;
    key.shadow.camera.top = 1200;
    key.shadow.camera.bottom = -1200;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 2600;
    key.shadow.bias = -0.00012;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6200, 6200),
      new THREE.ShadowMaterial({ opacity: 0.1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -420;
    ground.receiveShadow = true;
    scene.add(ground);
  }
}

function disposeTextures() {
  for (const texture of activeTextures) {
    texture.dispose();
  }
  activeTextures = [];
}

function disposeWords() {
  for (const item of words) {
    item.mesh.geometry.dispose();
    if (Array.isArray(item.mesh.material)) {
      item.mesh.material.forEach((mat) => mat.dispose());
    } else {
      item.mesh.material.dispose();
    }
    scene.remove(item.mesh);
  }
  words = [];
  wordMap.clear();
  isAHovered = false;
}

function makeNoiseCanvas(size = 512) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const img = ctx.createImageData(size, size);

  for (let i = 0; i < img.data.length; i += 4) {
    const v = 126 + Math.floor(Math.random() * 24);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  ctx.filter = "blur(1.5px)";
  ctx.globalAlpha = 0.72;
  ctx.drawImage(c, 0, 0);
  return c;
}

function buildMaterials(faceHex, sideHex, bumpTex, roughTex) {
  if (renderMode === "webgl") {
    const face = new THREE.MeshStandardMaterial({
      color: faceHex,
      roughness: 0.94,
      metalness: 0,
      bumpMap: bumpTex,
      bumpScale: 0.4,
      roughnessMap: roughTex,
      transparent: false,
      opacity: 1,
    });

    const side = new THREE.MeshStandardMaterial({
      color: sideHex,
      roughness: 0.98,
      metalness: 0,
      bumpMap: bumpTex,
      bumpScale: 0.35,
      roughnessMap: roughTex,
      transparent: false,
      opacity: 1,
    });

    return [face, side];
  }

  const face = new THREE.MeshBasicMaterial({ color: faceHex, transparent: false, opacity: 1 });
  const side = new THREE.MeshBasicMaterial({ color: sideHex, transparent: false, opacity: 1 });
  return [face, side];
}

function setRendererSize(width, height) {
  if (renderMode === "webgl") {
    renderer.setSize(width, height, false);
    return;
  }
  renderer.setSize(width, height);
}

function setMeshOpacity(mesh, opacity) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => {
    material.transparent = opacity < 0.999;
    material.opacity = opacity;
    material.depthWrite = opacity >= 0.999;
    material.needsUpdate = true;
  });
}

function applySwapState() {
  const noWord = wordMap.get("no");
  const slashWord = wordMap.get("slash");
  const aWord = wordMap.get("a");
  if (!noWord || !aWord) return;

  if (slashWord) {
    setMeshOpacity(slashWord.mesh, 0.68);
  }

  if (isAHovered) {
    setMeshOpacity(aWord.mesh, 1);
    setMeshOpacity(noWord.mesh, 0.22);
  } else {
    setMeshOpacity(aWord.mesh, 0.18);
    setMeshOpacity(noWord.mesh, 1);
  }
  needsRender = true;
}

function handleHeroPointerMove(event) {
  const aWord = wordMap.get("a");
  if (!aWord || !camera) return;

  const rect = wrap.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
    if (isAHovered) {
      isAHovered = false;
      applySwapState();
      queueRender();
    }
    return;
  }

  hoverPointer.x = (x / rect.width) * 2 - 1;
  hoverPointer.y = -(y / rect.height) * 2 + 1;
  hoverRaycaster.setFromCamera(hoverPointer, camera);
  const hoveringA = hoverRaycaster.intersectObject(aWord.mesh, false).length > 0;

  if (hoveringA !== isAHovered) {
    isAHovered = hoveringA;
    applySwapState();
    queueRender();
  }
}

function handleHeroPointerLeave() {
  if (!isAHovered) return;
  isAHovered = false;
  applySwapState();
  queueRender();
}

function layout(font) {
  syncThemeColors();

  const rect = wrap.getBoundingClientRect();
  const W = Math.max(1, Math.floor(rect.width));
  const H = Math.max(1, Math.floor(rect.height));
  if (W === lastW && H === lastH) return;
  lastW = W;
  lastH = H;

  setRendererSize(W, H);
  camera.left = -W / 2;
  camera.right = W / 2;
  camera.top = H / 2;
  camera.bottom = -H / 2;
  camera.updateProjectionMatrix();

  disposeWords();
  disposeTextures();

  const size = clamp(W * 0.17, 120, 270);
  const depth = clamp(size * 0.33, 36, 92);
  const margin = clamp(W * 0.045, 20, 76);
  const gap = size * 0.13;
  const verticalPad = clamp(H * 0.08, 24, 52);

  const noise = makeNoiseCanvas(512);
  const bumpTex = new THREE.CanvasTexture(noise);
  bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.repeat.set(2, 2);
  bumpTex.anisotropy = 8;

  const roughTex = new THREE.CanvasTexture(noise);
  roughTex.wrapS = roughTex.wrapT = THREE.RepeatWrapping;
  roughTex.repeat.set(2, 2);
  roughTex.anisotropy = 8;
  activeTextures.push(bumpTex, roughTex);

  const materialsByColor = {
    red: buildMaterials(themeColors.redFace, themeColors.redSide, bumpTex, roughTex),
    gold: buildMaterials(themeColors.goldFace, themeColors.goldSide, bumpTex, roughTex),
    neutral: buildMaterials(themeColors.neutralFace, themeColors.neutralSide, bumpTex, roughTex),
  };

  if (renderMode === "webgl") {
    materialsByColor.gold.forEach((material) => {
      material.emissive = new THREE.Color(themeColors.goldFace);
      material.emissiveIntensity = 0.16;
    });
  }

  const mainWords = WORD_CONFIGS.filter((word) => MAIN_WORD_KEYS.has(word.key));
  const suffixWords = WORD_CONFIGS.filter((word) => !MAIN_WORD_KEYS.has(word.key) && word.row === 1);

  const mainGeos = mainWords.map((word) => {
    const geometry = new TextGeometry(word.text, {
      font,
      size,
      depth,
      curveSegments: 14,
      bevelEnabled: false,
    });
    geometry.computeBoundingBox();
    return geometry;
  });

  const firstCharMinX = mainWords.map((word) => {
    const firstCharGeo = new TextGeometry(word.text[0], {
      font,
      size,
      depth,
      curveSegments: 14,
      bevelEnabled: false,
    });
    firstCharGeo.computeBoundingBox();
    const minX = firstCharGeo.boundingBox.min.x;
    firstCharGeo.dispose();
    return minX;
  });

  const heights = mainGeos.map((g) => g.boundingBox.max.y - g.boundingBox.min.y);
  const widths = mainGeos.map((g) => g.boundingBox.max.x - g.boundingBox.min.x);
  const maxWordWidth = W - margin * 2 - depth * 1.6;
  const widthScales = widths.map((w) => Math.min(1, maxWordWidth / w));

  const unscaledHeight = heights.reduce((sum, height, idx) => sum + height * widthScales[idx], 0) + gap * 2;
  const globalScale = Math.min(1, (H - verticalPad * 2) / unscaledHeight);
  const gapScaled = gap * globalScale;
  const wordScales = widthScales.map((s) => s * globalScale);

  const totalStackHeight =
    heights[0] * wordScales[0] +
    heights[1] * wordScales[1] +
    heights[2] * wordScales[2] +
    gapScaled * 2;

  const rowOffsets = {};
  const rowRightEdges = {};
  const rowScales = {};
  let yCursor = totalStackHeight / 2;

  for (let i = 0; i < mainWords.length; i += 1) {
    const word = mainWords[i];
    const geometry = mainGeos[i];
    const bbox = geometry.boundingBox;
    const height = heights[i];
    const wordScale = wordScales[i];

    const meshMaterials = materialsByColor[word.color].map((material) => material.clone());
    const mesh = new THREE.Mesh(geometry, meshMaterials);
    mesh.scale.setScalar(wordScale);
    if (renderMode === "webgl") mesh.castShadow = true;

    const targetLeftX = -W / 2 + margin;
    const xOffset = targetLeftX - firstCharMinX[i] * wordScale;
    const yCenter = yCursor - (height * wordScale) / 2;
    const yOffset = yCenter - (bbox.min.y + height / 2) * wordScale;

    mesh.position.set(xOffset, yOffset, 0);
    scene.add(mesh);

    const entry = { ...word, mesh, baseX: xOffset };
    words.push(entry);
    wordMap.set(word.key, entry);

    rowOffsets[word.row] = yOffset;
    rowScales[word.row] = wordScale;
    rowRightEdges[word.row] = xOffset + bbox.max.x * wordScale;

    yCursor -= height * wordScale + gapScaled;
  }

  if (suffixWords.length > 0) {
    let suffixCursorRight = rowRightEdges[1] || rowRightEdges[0] || -W / 2 + margin;
    for (const suffixWord of suffixWords) {
      const suffixGeometry = new TextGeometry(suffixWord.text, {
        font,
        size,
        depth,
        curveSegments: 14,
        bevelEnabled: false,
      });
      suffixGeometry.computeBoundingBox();
      const suffixBox = suffixGeometry.boundingBox;
      const suffixScale = rowScales[suffixWord.row] || wordScales[1] || globalScale;
      const suffixMeshMaterials = materialsByColor[suffixWord.color].map((material) => material.clone());
      const suffixMesh = new THREE.Mesh(suffixGeometry, suffixMeshMaterials);
      suffixMesh.scale.setScalar(suffixScale);
      if (renderMode === "webgl") suffixMesh.castShadow = true;

      const suffixGap =
        suffixWord.key === "slash" ? clamp(W * 0.058, 30, 66) : clamp(W * 0.055, 28, 62);
      const suffixX = suffixCursorRight + suffixGap - suffixBox.min.x * suffixScale;
      const suffixY = rowOffsets[suffixWord.row] ?? 0;
      suffixMesh.position.set(suffixX, suffixY, 0);

      scene.add(suffixMesh);
      const suffixEntry = { ...suffixWord, mesh: suffixMesh, baseX: suffixX };
      words.push(suffixEntry);
      wordMap.set(suffixWord.key, suffixEntry);
      suffixCursorRight = suffixX + suffixBox.max.x * suffixScale;
    }
  }

  Object.values(materialsByColor)
    .flat()
    .forEach((material) => material.dispose());

  applySwapState();

  needsRender = true;
}

function computeProgress() {
  const scrollable = stage.offsetHeight - window.innerHeight;
  const stageTop = stage.getBoundingClientRect().top;
  const traveled = clamp(-stageTop, 0, Math.max(0, scrollable));
  return scrollable > 0 ? traveled / scrollable : 0;
}

function applyScroll(progress) {
  logo.classList.toggle("is-visible", progress > 0.05);
  if (scrollCue) {
    scrollCue.classList.toggle("is-hidden", progress > 0.06);
  }

  if (!prefersReduced) {
    const W = lastW || wrap.getBoundingClientRect().width || window.innerWidth;
    const slideLeftDist = -W * 1.35;
    const slideRightDist = W * 1.35;

    words.forEach((word) => {
      const [start, end] = word.segment;
      const t = segProgress(progress, start, end);
      const dist = word.direction === "right" ? slideRightDist : slideLeftDist;
      word.mesh.position.x = word.baseX + dist * t;
    });
  }

  needsRender = true;
}

function render() {
  if (!renderer || !scene || !camera || !needsRender) return;
  needsRender = false;
  renderer.render(scene, camera);
}

let rafQueued = false;
function queueRender() {
  if (rafQueued) return;
  rafQueued = true;
  requestAnimationFrame(() => {
    rafQueued = false;
    render();
  });
}

function showFatalFallback(error) {
  setRenderMode("fallback");
  console.error(error);

  if (document.getElementById("render-fallback-note")) return;
  const badge = document.createElement("div");
  badge.id = "render-fallback-note";
  badge.textContent = "3D renderer unavailable";
  badge.style.position = "fixed";
  badge.style.right = "12px";
  badge.style.bottom = "12px";
  badge.style.padding = "8px 10px";
  badge.style.background = "rgba(255,255,255,0.92)";
  badge.style.border = "2px solid #111";
  badge.style.font = "12px monospace";
  badge.style.zIndex = "9999";
  document.body.appendChild(badge);
}

function initSectionReveals() {
  const revealItems = Array.from(document.querySelectorAll(".reveal-item"));
  if (revealItems.length === 0) return;

  if (prefersReduced) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  document.body.classList.add("reveal-enabled");

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        if (revealObserver) {
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.16,
      rootMargin: "0px 0px -10% 0px",
    }
  );

  revealItems.forEach((item) => {
    if (item.getBoundingClientRect().top < window.innerHeight * 0.88) {
      item.classList.add("is-visible");
      return;
    }
    revealObserver.observe(item);
  });
}

async function main() {
  initSectionReveals();

  try {
    initRenderer();
    setupScene();
    const font = await loadFont();

    layout(font);
    applyScroll(computeProgress());
    render();

    wrap.addEventListener("mousemove", handleHeroPointerMove, { passive: true });
    wrap.addEventListener("mouseleave", handleHeroPointerLeave);

    window.addEventListener("resize", () => {
      layout(font);
      applyScroll(computeProgress());
      queueRender();
    });

    window.addEventListener(
      "scroll",
      () => {
        applyScroll(computeProgress());
        queueRender();
      },
      { passive: true }
    );
  } catch (error) {
    showFatalFallback(error);
  }
}

main();
