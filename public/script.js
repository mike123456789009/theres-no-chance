import * as THREE from "/vendor/three/build/three.module.js";
import { TextGeometry } from "/vendor/three/examples/jsm/geometries/TextGeometry.js";
import { FontLoader } from "/vendor/three/examples/jsm/loaders/FontLoader.js";
import { TTFLoader } from "/vendor/three/examples/jsm/loaders/TTFLoader.js";
import { SVGRenderer } from "/vendor/three/examples/jsm/renderers/SVGRenderer.js";

const stage = document.querySelector("[data-stage]");
const logo = document.querySelector(".tnc-logo");
const scrollCue = document.querySelector(".scroll-cue");
const heroTransitionCta = document.querySelector(".hero-transition-cta");
const canvas = document.getElementById("hero-canvas");
const wrap = document.getElementById("hero3d");

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const LANDING_VISITED_KEY = "tnc-landing-visited";
const FORCE_LANDING_TOP_KEY = "tnc-force-landing-top";

const WORD_CONFIGS = [
  { key: "theres", text: "THERE'S", color: "red", row: 0, segment: [0.0, 0.33], direction: "left" },
  { key: "no", text: "NO", color: "gold", row: 1, segment: [0.33, 0.66], direction: "left" },
  { key: "chance", text: "CHANCE", color: "red", row: 2, segment: [0.66, 0.99], direction: "left" },
  { key: "slash", text: "/", color: "slash", row: 1, segment: [0.33, 0.66], direction: "right" },
  { key: "a", text: "A", color: "gold", row: 1, segment: [0.33, 0.66], direction: "right" },
];
const MAIN_WORD_KEYS = new Set(["theres", "no", "chance"]);
const MOBILE_LAYOUT_MAX_WIDTH = 640;

const DEFAULT_COLORS = {
  background: 0xececec,
  redFace: 0xbc595e,
  redSide: 0x955158,
  goldFace: 0xc6a727,
  goldSide: 0xc6a727,
  slashFace: 0xd3d0c5,
  slashSide: 0xbab6ab,
  neutralFace: 0xc9c5b8,
  neutralSide: 0xaba596,
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const segProgress = (p, s, e) => (p <= s ? 0 : p >= e ? 1 : (p - s) / (e - s));
const smoothstep = (t) => t * t * (3 - 2 * t);

function getSessionValue(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function setSessionValue(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage failures (e.g. private mode restrictions).
  }
}

function removeSessionValue(key) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures (e.g. private mode restrictions).
  }
}

function markLandingVisited() {
  setSessionValue(LANDING_VISITED_KEY, "1");
}

function primeAuthReturnFlagOnAuthNav() {
  const authLinks = document.querySelectorAll('a[href="/login"], a[href="/signup"], a[href="/reset"]');
  authLinks.forEach((link) => {
    link.addEventListener(
      "click",
      () => {
        setSessionValue(FORCE_LANDING_TOP_KEY, "1");
      },
      { capture: true }
    );
  });
}

function consumeForceLandingTopFlag() {
  const shouldForceTop = getSessionValue(FORCE_LANDING_TOP_KEY) === "1";
  if (shouldForceTop) {
    removeSessionValue(FORCE_LANDING_TOP_KEY);
  }
  return shouldForceTop;
}

function isBackForwardNavigation() {
  const navEntry = performance.getEntriesByType("navigation")[0];
  return Boolean(navEntry && navEntry.type === "back_forward");
}

let renderer = null;
let scene = null;
let camera = null;
let renderMode = "boot";
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
let hoveredSwapKey = null;
let pinnedSwapKey = "no";
let layoutMode = "desktop";

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
    background: getThemeColor("--bg", DEFAULT_COLORS.background),
    redFace: getThemeColor("--red-face", DEFAULT_COLORS.redFace),
    redSide: getThemeColor("--red-side", DEFAULT_COLORS.redSide),
    goldFace: getThemeColor("--gold-face", DEFAULT_COLORS.goldFace),
    goldSide: getThemeColor("--gold-side", DEFAULT_COLORS.goldSide),
    slashFace: getThemeColor("--slash-face", DEFAULT_COLORS.slashFace),
    slashSide: getThemeColor("--slash-side", DEFAULT_COLORS.slashSide),
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
    item.mesh.traverse((node) => {
      if (!node.isMesh) return;
      if (node.geometry) {
        node.geometry.dispose();
      }
      if (Array.isArray(node.material)) {
        node.material.forEach((material) => material.dispose());
      } else if (node.material) {
        node.material.dispose();
      }
    });
    scene.remove(item.mesh);
  }
  words = [];
  wordMap.clear();
  hoveredSwapKey = null;
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
  const alpha = clamp(opacity, 0, 1);
  const bgColor = new THREE.Color(themeColors.background);
  const blendedColor = new THREE.Color();
  const materials = [];

  function appendMaterialsFromObject(object) {
    if (!object || !object.material) return;
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => {
        if (material) materials.push(material);
      });
      return;
    }
    materials.push(object.material);
  }

  appendMaterialsFromObject(mesh);

  if (materials.length === 0 && typeof mesh.traverse === "function") {
    mesh.traverse((node) => {
      if (!node.isMesh) return;
      appendMaterialsFromObject(node);
    });
  }

  if (materials.length === 0) {
    return;
  }

  materials.forEach((material) => {
    const userData = material.userData || (material.userData = {});

    if (material.color) {
      if (userData.baseColorHex == null) {
        userData.baseColorHex = material.color.getHex();
      }
      blendedColor.setHex(userData.baseColorHex).lerp(bgColor, 1 - alpha);
      material.color.copy(blendedColor);
    }

    if ("emissive" in material && material.emissive) {
      if (userData.baseEmissiveHex == null) {
        userData.baseEmissiveHex = material.emissive.getHex();
      }
      if (userData.baseEmissiveIntensity == null && typeof material.emissiveIntensity === "number") {
        userData.baseEmissiveIntensity = material.emissiveIntensity;
      }

      blendedColor.setHex(userData.baseEmissiveHex).lerp(bgColor, 1 - alpha);
      material.emissive.copy(blendedColor);

      if (typeof material.emissiveIntensity === "number") {
        material.emissiveIntensity = userData.baseEmissiveIntensity * alpha;
      }
    }

    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.needsUpdate = true;
  });
}

function applySwapState() {
  const noWord = wordMap.get("no");
  const slashWord = wordMap.get("slash");
  const aWord = wordMap.get("a");
  if (!noWord || !aWord) return;

  const activeSwapKey = hoveredSwapKey ?? pinnedSwapKey;
  const isAActive = activeSwapKey === "a";

  if (slashWord) {
    setMeshOpacity(slashWord.mesh, 0.62);
  }

  if (isAActive) {
    setMeshOpacity(aWord.mesh, 1);
    setMeshOpacity(noWord.mesh, 0.22);
  } else {
    setMeshOpacity(aWord.mesh, 0.18);
    setMeshOpacity(noWord.mesh, 1);
  }
  needsRender = true;
}

function getSwapKeyAtPointer(clientX, clientY) {
  const aWord = wordMap.get("a");
  const noWord = wordMap.get("no");
  if (!aWord || !noWord || !camera) return null;

  const rect = wrap.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;

  hoverPointer.x = (x / rect.width) * 2 - 1;
  hoverPointer.y = -(y / rect.height) * 2 + 1;
  hoverRaycaster.setFromCamera(hoverPointer, camera);
  const intersections = hoverRaycaster.intersectObjects([aWord.mesh, noWord.mesh], true);
  if (intersections.length === 0) return null;

  let node = intersections[0].object;
  while (node) {
    const swapKey = node.userData?.swapKey;
    if (swapKey === "a" || swapKey === "no") {
      return swapKey;
    }
    node = node.parent;
  }
  return null;
}

function handleHeroPointerMove(event) {
  const hoveredKey = getSwapKeyAtPointer(event.clientX, event.clientY);
  if (hoveredKey !== hoveredSwapKey) {
    hoveredSwapKey = hoveredKey;
    applySwapState();
    queueRender();
  }
}

function handleHeroPointerLeave() {
  if (hoveredSwapKey == null) return;
  hoveredSwapKey = null;
  applySwapState();
  queueRender();
}

function handleHeroClick(event) {
  const clickedKey = getSwapKeyAtPointer(event.clientX, event.clientY);
  if (!clickedKey) return;

  pinnedSwapKey = clickedKey;
  hoveredSwapKey = clickedKey;
  applySwapState();
  queueRender();
}

function isMobileLayoutViewport(width) {
  return width <= MOBILE_LAYOUT_MAX_WIDTH;
}

function buildWordMesh({
  text,
  font,
  size,
  depth,
  color,
  materialsByColor,
  curveSegments = 14,
  scaleX = 1,
  scaleY = 1,
  scaleZ = 1,
}) {
  const geometry = new TextGeometry(text, {
    font,
    size,
    depth,
    curveSegments,
    bevelEnabled: false,
  });
  geometry.computeBoundingBox();

  const materials = materialsByColor[color].map((material) => material.clone());
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.scale.set(scaleX, scaleY, scaleZ);
  if (renderMode === "webgl") {
    mesh.castShadow = true;
  }

  const bbox = geometry.boundingBox;
  const width = bbox.max.x - bbox.min.x;
  const height = bbox.max.y - bbox.min.y;
  return { mesh, bbox, width, height };
}

function placeMeshAtCenter(meshEntry, centerX, centerY) {
  const { mesh, bbox, width, height } = meshEntry;
  mesh.position.set(
    centerX - (bbox.min.x + width / 2) * mesh.scale.x,
    centerY - (bbox.min.y + height / 2) * mesh.scale.y,
    0
  );
}

function buildStackedWordGroup({
  text,
  font,
  size,
  depth,
  color,
  materialsByColor,
  letterGap,
  align = "center",
  uniformLetterWidth = false,
}) {
  const group = new THREE.Group();
  const letters = Array.from(text);
  const letterEntries = [];
  let totalHeight = 0;
  let maxWidth = 0;

  for (const letter of letters) {
    const letterMesh = buildWordMesh({
      text: letter,
      font,
      size,
      depth,
      color,
      materialsByColor,
      curveSegments: 12,
    });
    letterEntries.push(letterMesh);
    totalHeight += letterMesh.height;
    maxWidth = Math.max(maxWidth, letterMesh.width);
  }

  totalHeight += letterGap * Math.max(0, letterEntries.length - 1);

  if (uniformLetterWidth && maxWidth > 0) {
    letterEntries.forEach((entry) => {
      const widthScale = maxWidth / Math.max(1, entry.width);
      entry.mesh.scale.x = widthScale;
    });
  }

  let yCursor = totalHeight / 2;
  const stackLeft = -maxWidth / 2;
  const stackRight = maxWidth / 2;
  letterEntries.forEach((entry) => {
    const yCenter = yCursor - entry.height / 2;
    const scaledWidth = entry.width * entry.mesh.scale.x;
    let centerX = 0;
    if (align === "left") {
      centerX = stackLeft + scaledWidth / 2;
    } else if (align === "right") {
      centerX = stackRight - scaledWidth / 2;
    }
    placeMeshAtCenter(entry, centerX, yCenter);
    group.add(entry.mesh);
    yCursor -= entry.height + letterGap;
  });

  return {
    group,
    width: maxWidth,
    height: totalHeight,
  };
}

function getObjectBounds(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  return {
    minX: box.min.x,
    maxX: box.max.x,
    minY: box.min.y,
    maxY: box.max.y,
  };
}

function layout(font, force = false) {
  syncThemeColors();

  const rect = wrap.getBoundingClientRect();
  const W = Math.max(1, Math.floor(rect.width));
  const H = Math.max(1, Math.floor(rect.height));
  if (!force && W === lastW && H === lastH) return;
  lastW = W;
  lastH = H;
  layoutMode = isMobileLayoutViewport(W) ? "mobile" : "desktop";

  if (layoutMode === "mobile") {
    camera.position.set(0, 0, 680);
  } else {
    camera.position.set(160, 0, 680);
  }
  camera.lookAt(0, 0, 0);

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
    slash: buildMaterials(themeColors.slashFace, themeColors.slashSide, bumpTex, roughTex),
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

  if (layoutMode === "mobile") {
    let didBuildMobileLayout = false;
    const theresWord = mainWords.find((word) => word.key === "theres");
    const noWord = mainWords.find((word) => word.key === "no");
    const chanceWord = mainWords.find((word) => word.key === "chance");
    const slashWord = suffixWords.find((word) => word.key === "slash");
    const aWord = suffixWords.find((word) => word.key === "a");

    if (theresWord && noWord && chanceWord && slashWord && aWord) {
      const columnSize = clamp(W * 0.21, 94, 154);
      const columnDepth = clamp(columnSize * 0.1, 6, 14);
      const columnGap = clamp(columnSize * 0.085, 5, 11);
      const sidePadding = clamp(W * 0.05, 16, 28);
      const centerLaneWidth = clamp(W * 0.11, 36, 72);
      const topBottomPadding = clamp(H * 0.004, 0, 4);
      const sideWidthBoost = 1.2;
      const viewportHeight = Math.max(window.visualViewport?.height || 0, window.innerHeight || 0, H);
      const chromeBottomInset = window.visualViewport
        ? Math.max(0, window.innerHeight - window.visualViewport.height)
        : 0;

      const theresStack = buildStackedWordGroup({
        text: theresWord.text.replace("'", ""),
        font,
        size: columnSize,
        depth: columnDepth,
        color: theresWord.color,
        materialsByColor,
        letterGap: columnGap,
        align: "left",
        uniformLetterWidth: true,
      });
      const chanceStack = buildStackedWordGroup({
        text: chanceWord.text,
        font,
        size: columnSize,
        depth: columnDepth,
        color: chanceWord.color,
        materialsByColor,
        letterGap: columnGap,
        align: "right",
        uniformLetterWidth: true,
      });

      const maxColumnHeight = Math.max(1, H - topBottomPadding * 2);
      const maxColumnWidth = Math.max(1, (W - sidePadding * 2 - centerLaneWidth) / (2 * sideWidthBoost));
      const rawMaxWidth = Math.max(theresStack.width, chanceStack.width);
      const rawMaxHeight = Math.max(theresStack.height, chanceStack.height);
      const columnScale = Math.min(1.16, maxColumnHeight / rawMaxHeight, maxColumnWidth / rawMaxWidth);
      const sideColumnScale = columnScale * 0.965;

      theresStack.group.scale.set(sideWidthBoost * sideColumnScale, sideColumnScale, sideColumnScale);
      chanceStack.group.scale.set(sideWidthBoost * sideColumnScale, sideColumnScale, sideColumnScale);

      const theresBounds = getObjectBounds(theresStack.group);
      const chanceBounds = getObjectBounds(chanceStack.group);
      const leftOuterEdge = -W / 2 + sidePadding;
      const rightOuterEdge = W / 2 - sidePadding;
      let theresX = leftOuterEdge - theresBounds.minX;
      let chanceX = rightOuterEdge - chanceBounds.maxX;
      const theresLeftEdge = theresBounds.minX + theresX;
      const chanceRightEdge = chanceBounds.maxX + chanceX;
      theresX += leftOuterEdge - theresLeftEdge;
      chanceX += rightOuterEdge - chanceRightEdge;
      const leftColumnRightEdge = theresBounds.maxX + theresX;
      const rightColumnLeftEdge = chanceBounds.minX + chanceX;
      const laneInset = clamp(W * 0.008, 1, 5);
      const availableCenterLane = Math.max(1, rightColumnLeftEdge - leftColumnRightEdge - laneInset * 2);

      theresStack.group.position.set(theresX, 0, 0);
      chanceStack.group.position.set(chanceX, 0, 0);

      scene.add(theresStack.group);
      scene.add(chanceStack.group);

      const centerSize = clamp(W * 0.2, 78, 132);
      const centerDepth = clamp(centerSize * 0.13, 7, 16);
      const centerGap = clamp(H * 0.032, 12, 30);
      const noInternalGap = clamp(centerSize * 0.16, 9, 20);
      const noWidthBoost = 1.14;
      const aWidthBoost = 1.12;
      const slashXScale = 0.86;

      const noStack = buildStackedWordGroup({
        text: noWord.text,
        font,
        size: centerSize,
        depth: centerDepth,
        color: noWord.color,
        materialsByColor,
        letterGap: noInternalGap,
        align: "center",
        uniformLetterWidth: true,
      });

      const aMeshEntry = buildWordMesh({
        text: aWord.text,
        font,
        size: centerSize,
        depth: centerDepth,
        color: aWord.color,
        materialsByColor,
      });

      const slashMeshEntry = buildWordMesh({
        text: slashWord.text,
        font,
        size: centerSize,
        depth: centerDepth,
        color: slashWord.color,
        materialsByColor,
      });

      const rawCenterWidth = Math.max(noStack.width * noWidthBoost, slashMeshEntry.width * slashXScale, aMeshEntry.width * aWidthBoost);
      const rawCenterHeight = noStack.height + centerGap + slashMeshEntry.height + centerGap + aMeshEntry.height;
      const centerHeightBudget = clamp(H * 0.56, 220, 420);
      const fitScaleByWidth = availableCenterLane / rawCenterWidth;
      const fitScaleByHeight = centerHeightBudget / rawCenterHeight;
      const centerScale = clamp(Math.min(fitScaleByWidth, fitScaleByHeight, columnScale * 1.06) * 1.05, 0.34, 1.2);

      noStack.group.scale.set(noWidthBoost * centerScale, centerScale, centerScale);
      aMeshEntry.mesh.scale.set(aWidthBoost * centerScale, centerScale, centerScale);
      slashMeshEntry.mesh.scale.set(slashXScale * centerScale, centerScale, centerScale);

      const noHeightScaled = noStack.height * centerScale;
      const slashHeightScaled = slashMeshEntry.height * centerScale;
      const aHeightScaled = aMeshEntry.height * centerScale;
      const centerGapScaled = centerGap * centerScale;
      const centerTotalHeight = noHeightScaled + centerGapScaled * 2 + slashHeightScaled + aHeightScaled;
      const centerTopEdge = centerTotalHeight / 2;

      const noCenterY = centerTopEdge - noHeightScaled / 2;
      const slashCenterY = centerTopEdge - noHeightScaled - centerGapScaled - slashHeightScaled / 2;
      const aCenterY = centerTopEdge - noHeightScaled - centerGapScaled - slashHeightScaled - centerGapScaled - aHeightScaled / 2;

      noStack.group.position.set(0, noCenterY, 0);
      placeMeshAtCenter(aMeshEntry, 0, aCenterY);
      placeMeshAtCenter(slashMeshEntry, 0, slashCenterY);

      const mobileObjects = [theresStack.group, chanceStack.group, noStack.group, aMeshEntry.mesh, slashMeshEntry.mesh];
      let currentMinY = Number.POSITIVE_INFINITY;
      let currentMaxY = Number.NEGATIVE_INFINITY;
      mobileObjects.forEach((object) => {
        const bounds = getObjectBounds(object);
        currentMinY = Math.min(currentMinY, bounds.minY);
        currentMaxY = Math.max(currentMaxY, bounds.maxY);
      });

      const topSafe = clamp(H * 0.01, 2, 8);
      const bottomSafe = clamp(H * 0.018 + chromeBottomInset * 0.25, 8, 26);
      const desiredTop = H / 2 - topSafe;
      const desiredBottom = -H / 2 + bottomSafe;
      const minShift = desiredBottom - currentMinY;
      const maxShift = desiredTop - currentMaxY;
      const preferredShift = clamp(chromeBottomInset * 0.18, 0, H * 0.08);

      let fittedShift = preferredShift;
      if (minShift <= maxShift) {
        fittedShift = clamp(preferredShift, minShift, maxShift);
      } else {
        fittedShift = (minShift + maxShift) / 2;
      }

      mobileObjects.forEach((object) => {
        object.position.y += fittedShift;
      });

      noStack.group.userData.swapKey = "no";
      noStack.group.traverse((node) => {
        if (!node.isMesh) return;
        node.userData.swapKey = "no";
      });
      aMeshEntry.mesh.userData.swapKey = "a";

      scene.add(noStack.group);
      scene.add(aMeshEntry.mesh);
      scene.add(slashMeshEntry.mesh);

      const mobileEntries = [
        { ...theresWord, mesh: theresStack.group },
        { ...chanceWord, mesh: chanceStack.group },
        { ...noWord, mesh: noStack.group },
        { ...aWord, mesh: aMeshEntry.mesh },
        { ...slashWord, mesh: slashMeshEntry.mesh },
      ];

      mobileEntries.forEach((entry) => {
        entry.baseX = entry.mesh.position.x;
        entry.baseY = entry.mesh.position.y;
        words.push(entry);
        wordMap.set(entry.key, entry);
      });
      didBuildMobileLayout = true;
    }

    if (didBuildMobileLayout) {
      Object.values(materialsByColor)
        .flat()
        .forEach((material) => material.dispose());

      applySwapState();
      needsRender = true;
      return;
    }

    layoutMode = "desktop";
  }

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
    if (word.key === "no") {
      mesh.userData.swapKey = "no";
    }
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

  const mainStackRightEdge = Math.max(
    rowRightEdges[0] ?? Number.NEGATIVE_INFINITY,
    rowRightEdges[2] ?? Number.NEGATIVE_INFINITY,
    rowRightEdges[1] ?? Number.NEGATIVE_INFINITY
  );
  const aRightInset = clamp(W * 0.02, 14, 30);

  if (suffixWords.length > 0) {
    let suffixCursorRight = rowRightEdges[1] || rowRightEdges[0] || -W / 2 + margin;
    let slashPlacement = null;
    let aPlacement = null;

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
      const suffixScaleX = suffixWord.key === "slash" ? suffixScale * 0.72 : suffixScale;
      const suffixMeshMaterials = materialsByColor[suffixWord.color].map((material) => material.clone());
      const suffixMesh = new THREE.Mesh(suffixGeometry, suffixMeshMaterials);
      suffixMesh.scale.set(suffixScaleX, suffixScale, suffixScale);
      if (suffixWord.key === "a") {
        suffixMesh.userData.swapKey = "a";
      }
      if (renderMode === "webgl") suffixMesh.castShadow = true;

      const suffixGap =
        suffixWord.key === "slash" ? clamp(W * 0.13, 110, 220) : clamp(W * 0.036, 24, 56);
      let suffixX = suffixCursorRight + suffixGap - suffixBox.min.x * suffixScaleX;

      if (suffixWord.key === "a" && Number.isFinite(mainStackRightEdge)) {
        const targetRightEdge = mainStackRightEdge - aRightInset;
        const targetX = targetRightEdge - suffixBox.max.x * suffixScaleX;
        suffixX = Math.max(suffixX, targetX);
      }

      const suffixY = rowOffsets[suffixWord.row] ?? 0;
      suffixMesh.position.set(suffixX, suffixY, 0);

      scene.add(suffixMesh);
      const suffixEntry = { ...suffixWord, mesh: suffixMesh, baseX: suffixX };
      words.push(suffixEntry);
      wordMap.set(suffixWord.key, suffixEntry);

      const leftEdge = suffixX + suffixBox.min.x * suffixScaleX;
      const rightEdge = suffixX + suffixBox.max.x * suffixScaleX;
      if (suffixWord.key === "slash") {
        slashPlacement = { entry: suffixEntry, box: suffixBox, scaleX: suffixScaleX };
      } else if (suffixWord.key === "a") {
        aPlacement = { leftEdge };
      }

      suffixCursorRight = suffixX + suffixBox.max.x * suffixScaleX;
    }

    if (slashPlacement && aPlacement) {
      const noRightEdge = rowRightEdges[1] || rowRightEdges[0] || -W / 2 + margin;
      const slashWidth = (slashPlacement.box.max.x - slashPlacement.box.min.x) * slashPlacement.scaleX;
      const centeredLeft = noRightEdge + (aPlacement.leftEdge - noRightEdge - slashWidth) / 2;
      const centeredSlashX = centeredLeft - slashPlacement.box.min.x * slashPlacement.scaleX;
      slashPlacement.entry.mesh.position.x = centeredSlashX;
      slashPlacement.entry.baseX = centeredSlashX;
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

  if (heroTransitionCta) {
    const ctaStart = 0.985;
    const ctaEnd = 1;
    const ctaRaw = segProgress(progress, ctaStart, ctaEnd);
    const ctaProgress = prefersReduced ? (progress >= ctaStart ? 1 : 0) : smoothstep(ctaRaw);
    heroTransitionCta.style.setProperty("--hero-cta-progress", ctaProgress.toFixed(4));

    const ctaHeight = heroTransitionCta.getBoundingClientRect().height;
    if (ctaHeight > 0) {
      const ctaOffsetPx = Math.round((1 - ctaProgress) * ctaHeight * 1.45);
      heroTransitionCta.style.setProperty("--hero-cta-offset", `${ctaOffsetPx}px`);
    } else {
      heroTransitionCta.style.removeProperty("--hero-cta-offset");
    }
  }

  if (!prefersReduced) {
    const W = lastW || wrap.getBoundingClientRect().width || window.innerWidth;

    if (layoutMode === "mobile") {
      const H = lastH || wrap.getBoundingClientRect().height || window.innerHeight;
      const verticalExitProgress = smoothstep(segProgress(progress, 0, 0.64));
      const horizontalExitProgress = smoothstep(segProgress(progress, 0.64, 1));
      const viewportHeight = Math.max(window.visualViewport?.height || 0, window.innerHeight || 0, H);
      const verticalExitDistance = viewportHeight * 1.52;
      const horizontalExitDistance = W * 1.3;

      const theresWord = wordMap.get("theres");
      if (theresWord) {
        theresWord.mesh.position.x = theresWord.baseX;
        theresWord.mesh.position.y = theresWord.baseY - verticalExitDistance * verticalExitProgress;
      }

      const chanceWord = wordMap.get("chance");
      if (chanceWord) {
        chanceWord.mesh.position.x = chanceWord.baseX;
        chanceWord.mesh.position.y = chanceWord.baseY + verticalExitDistance * verticalExitProgress;
      }

      const noWord = wordMap.get("no");
      if (noWord) {
        noWord.mesh.position.x = noWord.baseX - horizontalExitDistance * horizontalExitProgress;
        noWord.mesh.position.y = noWord.baseY;
      }

      const aWord = wordMap.get("a");
      if (aWord) {
        aWord.mesh.position.x = aWord.baseX + horizontalExitDistance * horizontalExitProgress;
        aWord.mesh.position.y = aWord.baseY;
      }

      const slashWord = wordMap.get("slash");
      if (slashWord) {
        slashWord.mesh.position.x = slashWord.baseX;
        slashWord.mesh.position.y = slashWord.baseY;
      }
    } else {
      const slideLeftDist = -W * 1.35;
      const slideRightDist = W * 1.35;

      words.forEach((word) => {
        const [start, end] = word.segment;
        const t = segProgress(progress, start, end);
        const dist = word.direction === "right" ? slideRightDist : slideLeftDist;
        word.mesh.position.x = word.baseX + dist * t;
      });
    }
  }

  needsRender = true;
}

function syncSceneToScrollPosition() {
  applyScroll(computeProgress());
  queueRender();
}

function forceLandingTopAndRender() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  syncSceneToScrollPosition();
}

function handlePendingAuthReturn() {
  markLandingVisited();

  if (!consumeForceLandingTopFlag()) {
    return "none";
  }

  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  if (isBackForwardNavigation()) {
    window.location.reload();
    return "reload";
  }

  forceLandingTopAndRender();
  return "handled";
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
  const authReturnAction = handlePendingAuthReturn();
  if (authReturnAction === "reload") {
    return;
  }

  markLandingVisited();
  primeAuthReturnFlagOnAuthNav();

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
    wrap.addEventListener("click", handleHeroClick);

    window.addEventListener("resize", () => {
      layout(font);
      syncSceneToScrollPosition();
    });

    window.addEventListener(
      "scroll",
      () => {
        syncSceneToScrollPosition();
      },
      { passive: true }
    );

    window.addEventListener("pageshow", () => {
      const action = handlePendingAuthReturn();
      if (action === "reload" || action === "handled") {
        return;
      }
      syncSceneToScrollPosition();
    });

    window.addEventListener("popstate", () => {
      const action = handlePendingAuthReturn();
      if (action === "reload" || action === "handled") {
        return;
      }
      syncSceneToScrollPosition();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      const action = handlePendingAuthReturn();
      if (action === "reload" || action === "handled") {
        return;
      }
      syncSceneToScrollPosition();
    });

    window.addEventListener("focus", () => {
      const action = handlePendingAuthReturn();
      if (action === "reload" || action === "handled") {
        return;
      }
      syncSceneToScrollPosition();
    });

    window.addEventListener("tnc:ui-style-changed", () => {
      layout(font, true);
      syncSceneToScrollPosition();
    });
  } catch (error) {
    console.error(error);
  }
}

main();
