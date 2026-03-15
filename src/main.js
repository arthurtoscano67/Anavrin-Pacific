import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

const canvas = document.querySelector("#game-canvas");
const overlay = document.querySelector("#intro-overlay");
const startButton = document.querySelector("#start-btn");
const hudMap = document.querySelector("#hud-map");
const hudHair = document.querySelector("#hud-hair");
const hudLights = document.querySelector("#hud-lights");
const hudSlot = document.querySelector("#hud-slot");
const statusLine = document.querySelector("#status-line");
const inventoryPanel = document.querySelector("#inventory-panel");
const inventoryGrid = document.querySelector("#inventory-grid");
const storagePanel = document.querySelector("#storage-panel");
const storageItems = document.querySelector("#storage-items");
const storeSelectedButton = document.querySelector("#store-selected-btn");
const retrieveItemButton = document.querySelector("#retrieve-item-btn");
const dialogPanel = document.querySelector("#dialog-panel");
const dialogNpc = document.querySelector("#dialog-npc");
const dialogText = document.querySelector("#dialog-text");
const dialogOptions = document.querySelector("#dialog-options");
const transitionOverlay = document.querySelector("#transition-overlay");

const INVENTORY_SIZE = 10;
const WALK_SPEED = 6.8;
const TURN_SPEED = 2.4;
const TOWN_HALF_SIZE = 34;
const ROOM_HALF_SIZE = 10;
const GROUND_Y = 0;
const EXIT_HOLD_SECONDS = 3;
const PREVIEW_OFFSET = 2.1;
const PREVIEW_ROTATION_SEQUENCE = ["away", "right", "away", "left", "toward"];
const PREVIEW_ROTATION_LABEL = {
  toward: "toward you",
  away: "away from you",
  left: "to your left",
  right: "to your right",
};

const MAPS = {
  town: "Small Town",
  grocery: "Grocery Store",
  clothes: "Clothes Store",
  furniture: "Furniture Store",
  barber: "Barber Shop",
  home: "Your Home",
};

const HAIR_STYLES = [
  { id: "starter", name: "Starter Style" },
  { id: "long", name: "Long Hair" },
  { id: "curly", name: "Curly Hair" },
  { id: "shortfull", name: "Short Full Hair" },
];

const HAIR_COLORS = [
  { name: "Black", hex: 0x1c1511 },
  { name: "Brown", hex: 0x4b2e1f },
  { name: "Blonde", hex: 0xd8b55f },
  { name: "Red", hex: 0x8d3a24 },
  { name: "Blue", hex: 0x385e9e },
  { name: "Silver", hex: 0x8b929d },
];

const CLOTH_COLORS = [
  { name: "Blue", hex: 0x4977af },
  { name: "Red", hex: 0xb4474c },
  { name: "Green", hex: 0x4f8a63 },
  { name: "Black", hex: 0x232428 },
  { name: "White", hex: 0xe9edf2 },
  { name: "Purple", hex: 0x694a98 },
];

const FURNITURE_COLORS = [
  { name: "Red", hex: 0xaa4c4c },
  { name: "Blue", hex: 0x4f6e9a },
  { name: "Green", hex: 0x4e8460 },
  { name: "Gray", hex: 0x6a7079 },
  { name: "Brown", hex: 0x8f6647 },
  { name: "White", hex: 0xe5e7ea },
];

const GROCERY_ITEMS = [
  { id: "fruit-apple", name: "Apple", kind: "food", color: 0xc94840, section: "Fruits" },
  { id: "fruit-banana", name: "Banana", kind: "food", color: 0xe3ce67, section: "Fruits" },
  { id: "fruit-orange", name: "Orange", kind: "food", color: 0xd97d2d, section: "Fruits" },
  { id: "veg-carrot", name: "Carrot", kind: "food", color: 0xe2803a, section: "Veggies" },
  { id: "veg-lettuce", name: "Lettuce", kind: "food", color: 0x7eb36d, section: "Veggies" },
  { id: "veg-tomato", name: "Tomato", kind: "food", color: 0xc14540, section: "Veggies" },
  { id: "snack-cookies", name: "Cookies", kind: "snack", color: 0xc89f72, section: "Snacks" },
  { id: "snack-chips", name: "Chips", kind: "snack", color: 0xf0ca64, section: "Snacks" },
  { id: "snack-lollipop", name: "Lollipop", kind: "snack", color: 0xff6f9b, section: "Snacks" },
];

const FURNITURE_TEMPLATES = {
  couch: {
    id: "furniture-couch",
    name: "Couch",
    kind: "furniture",
    placeable: true,
    shape: "couch",
    color: 0x6f7ba2,
  },
  tv: {
    id: "furniture-tv",
    name: "TV",
    kind: "furniture",
    placeable: true,
    shape: "tv",
    color: 0x2f2f34,
  },
  flower_painting: {
    id: "furniture-flower-painting",
    name: "Flower Painting",
    kind: "furniture",
    placeable: true,
    shape: "painting",
    color: 0xe8d8c5,
  },
  plant: {
    id: "furniture-plant",
    name: "Plant",
    kind: "furniture",
    placeable: true,
    shape: "plant",
    color: 0x4b8d5d,
  },
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xafd0e5);
scene.fog = new THREE.Fog(0xafd0e5, 40, 120);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 350);
camera.position.set(0, 6.5, 9);

const ambientLight = new THREE.AmbientLight(0xdcecff, 0.83);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff4dd, 1.15);
sunLight.position.set(34, 48, 18);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -58;
sunLight.shadow.camera.right = 58;
sunLight.shadow.camera.top = 58;
sunLight.shadow.camera.bottom = -58;
scene.add(sunLight);

const state = {
  mode: "menu",
  currentMap: "town",
  inventory: Array.from({ length: INVENTORY_SIZE }, () => null),
  selectedSlot: 0,
  inventoryOpen: false,
  storageOpen: false,
  storage: [],
  homeLightsOn: true,
  hairstyleIndex: 0,
  hairColorHex: HAIR_COLORS[1].hex,
  outfit: {
    hatColorHex: CLOTH_COLORS[0].hex,
    shirtColorHex: 0x5d9fd1,
    pantsColorHex: 0x354a66,
    jacketColorHex: 0x3f5675,
    hatEnabled: false,
    jacketEnabled: false,
  },
  promptText: "",
  flashText: "",
  flashTimer: 0,
  dialogOpen: false,
  exitHoldSeconds: 0,
  teleportCooldown: 0,
};

const keys = new Map();
const tmpVec3 = new THREE.Vector3();

const player = {
  group: new THREE.Group(),
  heading: Math.PI,
  activeInteractable: null,
};

const shirtMaterial = new THREE.MeshStandardMaterial({ color: state.outfit.shirtColorHex, roughness: 0.78, metalness: 0.1 });
const pantsMaterial = new THREE.MeshStandardMaterial({ color: state.outfit.pantsColorHex, roughness: 0.86, metalness: 0.08 });
const jacketMaterial = new THREE.MeshStandardMaterial({ color: state.outfit.jacketColorHex, roughness: 0.72, metalness: 0.12 });
const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xebcaa8, roughness: 0.82 });
const hatMaterial = new THREE.MeshStandardMaterial({ color: state.outfit.hatColorHex, roughness: 0.65, metalness: 0.12 });
const hairMaterial = new THREE.MeshStandardMaterial({ color: state.hairColorHex, roughness: 0.66, metalness: 0.08 });

const playerShirt = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 0.92, 5, 8), shirtMaterial);
playerShirt.castShadow = true;
playerShirt.position.y = 1.02;

const playerJacket = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 0.88, 5, 8), jacketMaterial);
playerJacket.castShadow = true;
playerJacket.position.y = 1.03;
playerJacket.visible = false;

const playerPants = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.9, 10), pantsMaterial);
playerPants.castShadow = true;
playerPants.position.set(0, 0.45, 0);

const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), skinMaterial);
playerHead.castShadow = true;
playerHead.position.set(0, 1.86, 0);

const playerHat = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.24, 16), hatMaterial);
playerHat.castShadow = true;
playerHat.position.set(0, 2.22, 0);
playerHat.visible = false;

const hairStarter = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.2, 0.54), hairMaterial);
hairStarter.position.set(0, 2.08, 0);
hairStarter.castShadow = true;

const hairLong = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.52, 0.62), hairMaterial);
hairLong.position.set(0, 1.95, 0);
hairLong.castShadow = true;
hairLong.visible = false;

const hairCurly = new THREE.Group();
for (let i = 0; i < 7; i += 1) {
  const curl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), hairMaterial);
  const angle = (i / 7) * Math.PI * 2;
  curl.position.set(Math.cos(angle) * 0.23, 2.06 + (i % 2 === 0 ? 0.04 : -0.03), Math.sin(angle) * 0.23);
  curl.castShadow = true;
  hairCurly.add(curl);
}
const curlTop = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), hairMaterial);
curlTop.position.set(0, 2.12, 0);
curlTop.castShadow = true;
hairCurly.add(curlTop);
hairCurly.visible = false;

const hairShortFull = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), hairMaterial);
hairShortFull.position.set(0, 2.02, 0);
hairShortFull.castShadow = true;
hairShortFull.visible = false;

const hairMeshes = [hairStarter, hairLong, hairCurly, hairShortFull];

player.group.add(playerShirt, playerJacket, playerPants, playerHead, playerHat, ...hairMeshes);
player.group.position.set(0, GROUND_Y, 16);
scene.add(player.group);

let currentMapGroup = new THREE.Group();
scene.add(currentMapGroup);
let currentInteractables = [];
let currentEntryZones = [];
let currentExitZone = null;
let currentMapBounds = { minX: -TOWN_HALF_SIZE, maxX: TOWN_HALF_SIZE, minZ: -TOWN_HALF_SIZE, maxZ: TOWN_HALF_SIZE };
let homeLights = [];
let decorations = [];
let transitionTimer = 0;
let defaultStatus = "Walk near a building door to enter automatically.";
let nextTownSpawn = { x: 0, z: 16, heading: Math.PI };
let activeDialog = null;
const placementPreview = {
  active: false,
  mesh: null,
  item: null,
  slotIndex: -1,
  rotationIndex: 0,
};

const clock = new THREE.Clock();

function cloneItem(item) {
  return item ? { ...item } : null;
}

function setFlash(message, durationSeconds = 2.2) {
  state.flashText = message;
  state.flashTimer = durationSeconds;
}

function updateStatusLine() {
  const text = state.flashTimer > 0 ? state.flashText : state.promptText || defaultStatus;
  statusLine.textContent = text;
}

function updateHud() {
  hudMap.textContent = MAPS[state.currentMap];
  hudHair.textContent = HAIR_STYLES[state.hairstyleIndex].name;
  hudLights.textContent = state.homeLightsOn ? "On" : "Off";
  hudSlot.textContent = `${state.selectedSlot + 1} / ${INVENTORY_SIZE}`;
}

function setSelectedSlot(index) {
  state.selectedSlot = THREE.MathUtils.clamp(index, 0, INVENTORY_SIZE - 1);
  buildInventoryUI();
  updateHud();
}

function buildInventoryUI() {
  inventoryGrid.innerHTML = "";
  for (let i = 0; i < INVENTORY_SIZE; i += 1) {
    const slot = document.createElement("div");
    slot.className = `slot${state.selectedSlot === i ? " selected" : ""}`;
    slot.dataset.slotIndex = String(i);

    const item = state.inventory[i];
    slot.innerHTML = `
      <span class="slot-index">Slot ${i + 1}</span>
      <span class="slot-name">${item ? item.name : "Empty"}</span>
    `;

    slot.addEventListener("mouseenter", () => {
      if (state.selectedSlot !== i) {
        setSelectedSlot(i);
      }
    });

    slot.addEventListener("click", () => {
      if (state.selectedSlot !== i) {
        setSelectedSlot(i);
      }
    });

    inventoryGrid.append(slot);
  }
}

function buildStorageUI() {
  storageItems.innerHTML = "";
  if (state.storage.length === 0) {
    const empty = document.createElement("div");
    empty.className = "storage-empty";
    empty.textContent = "Storage is empty.";
    storageItems.append(empty);
    return;
  }

  state.storage.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "storage-item";
    row.textContent = `${index + 1}. ${item.name}`;
    storageItems.append(row);
  });
}

function setInventoryOpen(nextOpen) {
  state.inventoryOpen = nextOpen;
  inventoryPanel.classList.toggle("hidden", !nextOpen);
}

function setStorageOpen(nextOpen) {
  if (state.currentMap !== "home") {
    state.storageOpen = false;
    storagePanel.classList.add("hidden");
    return;
  }

  state.storageOpen = nextOpen;
  storagePanel.classList.toggle("hidden", !nextOpen);
}

function openDialog({ npc, text, options }) {
  state.dialogOpen = true;
  activeDialog = { npc, text, options };

  dialogNpc.textContent = npc;
  dialogText.textContent = text;
  dialogOptions.innerHTML = "";

  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option.label;
    button.addEventListener("click", () => {
      option.action();
    });
    dialogOptions.append(button);
  });

  dialogPanel.classList.remove("hidden");
}

function closeDialog() {
  state.dialogOpen = false;
  activeDialog = null;
  dialogPanel.classList.add("hidden");
  dialogOptions.innerHTML = "";
}

function showNoThanksMessage() {
  closeDialog();
  setFlash("No problem.", 1.2);
}

function showColorChoiceDialog({ npc, title, palette, onPick, onBack }) {
  openDialog({
    npc,
    text: title,
    options: [
      ...palette.map((color) => ({
        label: color.name,
        action: () => onPick(color),
      })),
      {
        label: "Back",
        action: onBack,
      },
    ],
  });
}

function addItemToInventory(item) {
  const freeIndex = state.inventory.findIndex((slot) => slot == null);
  if (freeIndex === -1) {
    setFlash("Inventory is full (10 slots).", 2.2);
    return false;
  }

  state.inventory[freeIndex] = cloneItem(item);
  buildInventoryUI();
  setFlash(`${item.name} added to slot ${freeIndex + 1}.`, 1.8);
  return true;
}

function createWearableItem(category, color) {
  const slug = color.name.toLowerCase().replace(/\s+/g, "-");
  if (category === "hat") {
    return {
      id: `wearable-hat-${slug}`,
      name: `${color.name} Hat`,
      kind: "wearable",
      wearableType: "hat",
      color: color.hex,
    };
  }

  if (category === "shirt") {
    return {
      id: `wearable-shirt-${slug}`,
      name: `${color.name} Shirt`,
      kind: "wearable",
      wearableType: "shirt",
      color: color.hex,
    };
  }

  if (category === "pants") {
    return {
      id: `wearable-pants-${slug}`,
      name: `${color.name} Pants`,
      kind: "wearable",
      wearableType: "pants",
      color: color.hex,
    };
  }

  return {
    id: `wearable-jacket-${slug}`,
    name: `${color.name} Jacket`,
    kind: "wearable",
    wearableType: "jacket",
    color: color.hex,
  };
}

function createLabel(text, color = "#e9f6ff", bg = "rgba(8,18,30,0.85)") {
  const canvasEl = document.createElement("canvas");
  canvasEl.width = 512;
  canvasEl.height = 128;
  const ctx = canvasEl.getContext("2d");

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.strokeStyle = "rgba(132, 194, 232, 0.85)";
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, canvasEl.width - 16, canvasEl.height - 16);

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 46px Poppins, sans-serif";
  ctx.fillText(text, canvasEl.width / 2, canvasEl.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4.8, 1.2, 1);
  return sprite;
}

function createDoorMarker(color = 0xffd06a) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.11, 12, 26),
    new THREE.MeshStandardMaterial({ color, roughness: 0.36, metalness: 0.25 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  ring.receiveShadow = true;
  return ring;
}

function createNpc({ shirt = 0x768aa8, pants = 0x2f3743, hair = 0x32241d }) {
  const npc = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 0.8, 5, 8),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.8, metalness: 0.08 }),
  );
  body.position.y = 0.95;
  body.castShadow = true;

  const legs = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.37, 0.84, 10),
    new THREE.MeshStandardMaterial({ color: pants, roughness: 0.88, metalness: 0.05 }),
  );
  legs.position.y = 0.42;
  legs.castShadow = true;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.31, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xeac4a3, roughness: 0.83 }),
  );
  head.position.y = 1.72;
  head.castShadow = true;

  const hairCap = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.14, 0.48),
    new THREE.MeshStandardMaterial({ color: hair, roughness: 0.64 }),
  );
  hairCap.position.y = 1.92;
  hairCap.castShadow = true;

  npc.add(body, legs, head, hairCap);
  return npc;
}

function createFurnitureMesh(item) {
  const group = new THREE.Group();
  const primary = new THREE.MeshStandardMaterial({
    color: item.color || 0x7f6b58,
    roughness: 0.72,
    metalness: 0.12,
  });

  if (item.shape === "couch") {
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.6, 1.2), primary);
    base.position.set(0, 0.4, 0);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.0, 0.32), primary);
    back.position.set(0, 0.95, -0.43);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.75, 1.2), primary);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.75, 1.2), primary);
    armL.position.set(-1.25, 0.7, 0);
    armR.position.set(1.25, 0.7, 0);
    [base, back, armL, armR].forEach((mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    return group;
  }

  if (item.shape === "tv") {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 10), primary);
    stand.position.y = 0.4;
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 1.0, 0.12),
      new THREE.MeshStandardMaterial({ color: item.color || 0x222227, roughness: 0.38, metalness: 0.45 }),
    );
    panel.position.y = 1.1;
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.8, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x161a25, emissive: 0x1f2f44, emissiveIntensity: 0.42 }),
    );
    screen.position.set(0, 1.1, 0.08);
    [stand, panel, screen].forEach((mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    return group;
  }

  if (item.shape === "painting") {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.2, 0.08), primary);
    frame.position.y = 1;
    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(1.45, 0.95),
      new THREE.MeshStandardMaterial({ color: 0xf5d9c8, roughness: 0.88 }),
    );
    art.position.set(0, 1, 0.05);

    const flowerCenter = new THREE.Mesh(new THREE.CircleGeometry(0.09, 14), new THREE.MeshStandardMaterial({ color: 0xe0ad35 }));
    flowerCenter.position.set(0, 1, 0.06);

    for (let i = 0; i < 6; i += 1) {
      const petal = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), new THREE.MeshStandardMaterial({ color: 0xdb6f8d }));
      const angle = (i / 6) * Math.PI * 2;
      petal.position.set(Math.cos(angle) * 0.15, 1 + Math.sin(angle) * 0.15, 0.06);
      group.add(petal);
    }

    const stem = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.34), new THREE.MeshStandardMaterial({ color: 0x5c9f59 }));
    stem.position.set(0, 0.74, 0.06);

    [frame, art, flowerCenter, stem].forEach((mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    return group;
  }

  if (item.shape === "plant") {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.45, 14), primary);
    pot.position.y = 0.22;
    pot.castShadow = true;
    pot.receiveShadow = true;
    group.add(pot);

    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.58, 0.2),
        new THREE.MeshStandardMaterial({ color: item.color || 0x4b8d5d, roughness: 0.78 }),
      );
      const angle = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(angle) * 0.12, 0.62, Math.sin(angle) * 0.12);
      leaf.rotation.y = angle;
      leaf.rotation.z = 0.24;
      leaf.castShadow = true;
      group.add(leaf);
    }
    return group;
  }

  const fallback = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), primary);
  fallback.position.y = 0.5;
  fallback.castShadow = true;
  fallback.receiveShadow = true;
  group.add(fallback);
  return group;
}

function applyHairAppearance() {
  hairMeshes.forEach((mesh, index) => {
    mesh.visible = index === state.hairstyleIndex;
  });

  hairMaterial.color.setHex(state.hairColorHex);
  updateHud();
}

function applyOutfitAppearance() {
  shirtMaterial.color.setHex(state.outfit.shirtColorHex);
  pantsMaterial.color.setHex(state.outfit.pantsColorHex);
  jacketMaterial.color.setHex(state.outfit.jacketColorHex);
  hatMaterial.color.setHex(state.outfit.hatColorHex);
  playerHat.visible = state.outfit.hatEnabled;
  playerJacket.visible = state.outfit.jacketEnabled;
}

function clearPlacementPreview() {
  if (placementPreview.mesh) {
    currentMapGroup.remove(placementPreview.mesh);
    placementPreview.mesh.traverse((node) => {
      if (node.geometry) {
        node.geometry.dispose();
      }
      if (node.material) {
        if (Array.isArray(node.material)) {
          node.material.forEach((mat) => mat.dispose());
        } else {
          node.material.dispose();
        }
      }
    });
  }

  placementPreview.active = false;
  placementPreview.mesh = null;
  placementPreview.item = null;
  placementPreview.slotIndex = -1;
  placementPreview.rotationIndex = 0;
}

function getPreviewFacingMode() {
  const index = ((placementPreview.rotationIndex % PREVIEW_ROTATION_SEQUENCE.length) + PREVIEW_ROTATION_SEQUENCE.length) % PREVIEW_ROTATION_SEQUENCE.length;
  return PREVIEW_ROTATION_SEQUENCE[index];
}

function getPreviewFacingOffset() {
  const mode = getPreviewFacingMode();
  if (mode === "toward") {
    return Math.PI;
  }
  if (mode === "left") {
    return -Math.PI / 2;
  }
  if (mode === "right") {
    return Math.PI / 2;
  }
  return 0;
}

function createPreviewMesh(item) {
  const mesh = createFurnitureMesh(item);
  mesh.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    node.castShadow = false;
    node.receiveShadow = true;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((mat) => {
      mat.transparent = true;
      mat.opacity = 0.56;
      mat.depthWrite = false;
      if ("emissiveIntensity" in mat) {
        mat.emissiveIntensity = Math.max(0.12, mat.emissiveIntensity || 0);
      }
    });
  });
  return mesh;
}

function updatePlacementPreviewTransform() {
  if (!placementPreview.active || !placementPreview.mesh || state.currentMap !== "home") {
    return;
  }

  const placementLimit = ROOM_HALF_SIZE - 1.8;
  const targetX = THREE.MathUtils.clamp(
    player.group.position.x + Math.sin(player.heading) * PREVIEW_OFFSET,
    -placementLimit,
    placementLimit,
  );
  const targetZ = THREE.MathUtils.clamp(
    player.group.position.z + Math.cos(player.heading) * PREVIEW_OFFSET,
    -placementLimit,
    placementLimit,
  );

  placementPreview.mesh.position.set(targetX, GROUND_Y, targetZ);
  placementPreview.mesh.rotation.y = player.heading + getPreviewFacingOffset();
}

function spawnPlacementPreviewFromSelectedSlot() {
  if (state.currentMap !== "home") {
    setFlash("Go home to preview and place furniture.", 1.7);
    return false;
  }

  const item = state.inventory[state.selectedSlot];
  if (!item || !item.placeable) {
    setFlash("Select furniture in inventory, then press 7.", 1.7);
    return false;
  }

  clearPlacementPreview();

  placementPreview.active = true;
  placementPreview.item = cloneItem(item);
  placementPreview.slotIndex = state.selectedSlot;
  placementPreview.rotationIndex = 0;
  placementPreview.mesh = createPreviewMesh(placementPreview.item);
  currentMapGroup.add(placementPreview.mesh);
  updatePlacementPreviewTransform();
  setFlash(`${item.name} preview ready. Press 8 to place, 9 to rotate.`, 1.9);
  return true;
}

function placePlacementPreview() {
  if (state.currentMap !== "home") {
    setFlash("Furniture placement only works at home.", 1.7);
    return false;
  }

  if (!placementPreview.active || !placementPreview.mesh) {
    setFlash("Press 7 on a furniture item to start placement.", 1.7);
    return false;
  }

  const inventoryItem = state.inventory[placementPreview.slotIndex];
  if (!inventoryItem || !inventoryItem.placeable) {
    clearPlacementPreview();
    setFlash("The preview item is no longer in that slot.", 1.8);
    return false;
  }

  const itemData = cloneItem(inventoryItem);
  const entry = {
    item: itemData,
    position: {
      x: placementPreview.mesh.position.x,
      y: GROUND_Y,
      z: placementPreview.mesh.position.z,
    },
    rotation: placementPreview.mesh.rotation.y,
  };
  decorations.push(entry);

  const mesh = createFurnitureMesh(itemData);
  mesh.position.set(entry.position.x, entry.position.y, entry.position.z);
  mesh.rotation.y = entry.rotation;
  currentMapGroup.add(mesh);

  state.inventory[placementPreview.slotIndex] = null;
  buildInventoryUI();
  clearPlacementPreview();
  setFlash(`${itemData.name} placed in your home.`, 1.9);
  return true;
}

function cyclePlacementPreviewRotation() {
  if (!placementPreview.active) {
    setFlash("Press 7 on furniture first to start preview.", 1.6);
    return false;
  }

  placementPreview.rotationIndex = (placementPreview.rotationIndex + 1) % PREVIEW_ROTATION_SEQUENCE.length;
  updatePlacementPreviewTransform();
  const mode = getPreviewFacingMode();
  setFlash(`Preview facing ${PREVIEW_ROTATION_LABEL[mode]}.`, 1.3);
  return true;
}

function equipWearableItem(item) {
  const colorHex = typeof item.color === "number" ? item.color : CLOTH_COLORS[0].hex;
  if (item.wearableType === "hat") {
    state.outfit.hatEnabled = true;
    state.outfit.hatColorHex = colorHex;
    applyOutfitAppearance();
    setFlash(`Equipped ${item.name}.`, 1.6);
    return true;
  }

  if (item.wearableType === "shirt") {
    state.outfit.shirtColorHex = colorHex;
    applyOutfitAppearance();
    setFlash(`Equipped ${item.name}.`, 1.6);
    return true;
  }

  if (item.wearableType === "pants") {
    state.outfit.pantsColorHex = colorHex;
    applyOutfitAppearance();
    setFlash(`Equipped ${item.name}.`, 1.6);
    return true;
  }

  if (item.wearableType === "jacket") {
    state.outfit.jacketEnabled = true;
    state.outfit.jacketColorHex = colorHex;
    applyOutfitAppearance();
    setFlash(`Equipped ${item.name}.`, 1.6);
    return true;
  }

  return false;
}

function useSelectedItemWith7() {
  if (state.dialogOpen) {
    setFlash("Finish the conversation first.", 1.3);
    return false;
  }

  const item = state.inventory[state.selectedSlot];
  if (!item) {
    setFlash("Selected slot is empty.", 1.4);
    return false;
  }

  if (item.kind === "food" || item.kind === "snack") {
    if (placementPreview.active && placementPreview.slotIndex === state.selectedSlot) {
      clearPlacementPreview();
    }
    state.inventory[state.selectedSlot] = null;
    buildInventoryUI();
    setFlash(`You ate ${item.name}.`, 1.5);
    return true;
  }

  if (item.kind === "wearable") {
    return equipWearableItem(item);
  }

  if (item.placeable || item.kind === "furniture") {
    return spawnPlacementPreviewFromSelectedSlot();
  }

  setFlash(`Can't use ${item.name} right now.`, 1.5);
  return false;
}

function clearCurrentMap() {
  clearPlacementPreview();
  scene.remove(currentMapGroup);
  currentMapGroup.traverse((node) => {
    if (node.geometry) {
      node.geometry.dispose();
    }
    if (node.material) {
      if (Array.isArray(node.material)) {
        node.material.forEach((mat) => mat.dispose());
      } else {
        node.material.dispose();
      }
    }
  });

  currentMapGroup = new THREE.Group();
  scene.add(currentMapGroup);
  currentInteractables = [];
  currentEntryZones = [];
  currentExitZone = null;
  homeLights = [];
  state.exitHoldSeconds = 0;
}

function addRoomShell({ wallColor = 0xcad6de, floorColor = 0x5d7688 }) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.92, metalness: 0.04 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  currentMapGroup.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9, metalness: 0.05 });
  const wallBack = new THREE.Mesh(new THREE.BoxGeometry(24, 6, 0.5), wallMaterial);
  wallBack.position.set(0, 3, -12);
  const wallFrontLeft = new THREE.Mesh(new THREE.BoxGeometry(9.8, 6, 0.5), wallMaterial);
  const wallFrontRight = new THREE.Mesh(new THREE.BoxGeometry(9.8, 6, 0.5), wallMaterial);
  wallFrontLeft.position.set(-7.1, 3, 12);
  wallFrontRight.position.set(7.1, 3, 12);
  const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 24), wallMaterial);
  const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 24), wallMaterial);
  wallLeft.position.set(-12, 3, 0);
  wallRight.position.set(12, 3, 0);

  [wallBack, wallFrontLeft, wallFrontRight, wallLeft, wallRight].forEach((wall) => {
    wall.castShadow = true;
    wall.receiveShadow = true;
    currentMapGroup.add(wall);
  });

  const label = createLabel(MAPS[state.currentMap], "#ffffff");
  label.position.set(0, 4.9, -10.8);
  currentMapGroup.add(label);

  const exitMarker = createDoorMarker(0x9ce8ff);
  exitMarker.position.set(0, 0.05, 10.4);
  currentMapGroup.add(exitMarker);

  currentExitZone = {
    position: new THREE.Vector3(0, 0, 10.4),
    radius: 2.05,
    townSpawn: { x: nextTownSpawn.x, z: nextTownSpawn.z, heading: nextTownSpawn.heading },
  };
}

function buildTown() {
  scene.background = new THREE.Color(0xafd0e5);
  scene.fog = new THREE.Fog(0xafd0e5, 44, 128);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(95, 95),
    new THREE.MeshStandardMaterial({ color: 0x74a563, roughness: 0.98, metalness: 0.02 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  currentMapGroup.add(ground);

  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x3b434d, roughness: 0.9, metalness: 0.04 });
  const roadA = new THREE.Mesh(new THREE.BoxGeometry(78, 0.18, 9), roadMaterial);
  roadA.position.set(0, 0.09, 0);
  const roadB = new THREE.Mesh(new THREE.BoxGeometry(9, 0.18, 78), roadMaterial);
  roadB.position.set(0, 0.09, 0);
  roadA.receiveShadow = true;
  roadB.receiveShadow = true;
  currentMapGroup.add(roadA, roadB);

  const centerSign = createLabel("Small Town", "#f0fbff", "rgba(11, 25, 38, 0.82)");
  centerSign.position.set(0, 2.8, 0);
  currentMapGroup.add(centerSign);

  const buildingData = [
    {
      id: "grocery",
      title: "Grocery",
      color: 0x7dbf78,
      roof: 0x49753e,
      x: -16,
      z: -16,
      doorX: -16,
      doorZ: -11,
      townSpawn: { x: -16, z: -8.8, heading: Math.PI },
    },
    {
      id: "clothes",
      title: "Clothes",
      color: 0x80a5d2,
      roof: 0x3e5e88,
      x: 16,
      z: -16,
      doorX: 16,
      doorZ: -11,
      townSpawn: { x: 16, z: -8.8, heading: Math.PI },
    },
    {
      id: "furniture",
      title: "Furniture",
      color: 0xc9a876,
      roof: 0x8a6741,
      x: -16,
      z: 16,
      doorX: -16,
      doorZ: 11,
      townSpawn: { x: -16, z: 8.8, heading: 0 },
    },
    {
      id: "barber",
      title: "Barber",
      color: 0xdc8b8a,
      roof: 0x954744,
      x: 16,
      z: 16,
      doorX: 16,
      doorZ: 11,
      townSpawn: { x: 16, z: 8.8, heading: 0 },
    },
    {
      id: "home",
      title: "Home",
      color: 0xd8d5ad,
      roof: 0x8a6b4d,
      x: 0,
      z: 28,
      doorX: 0,
      doorZ: 22,
      townSpawn: { x: 0, z: 19.2, heading: 0 },
    },
  ];

  buildingData.forEach((entry) => {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(10, 6, 10),
      new THREE.MeshStandardMaterial({ color: entry.color, roughness: 0.85, metalness: 0.03 }),
    );
    base.position.set(entry.x, 3, entry.z);
    base.castShadow = true;
    base.receiveShadow = true;

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(7.2, 2.4, 4),
      new THREE.MeshStandardMaterial({ color: entry.roof, roughness: 0.82, metalness: 0.06 }),
    );
    roof.position.set(entry.x, 7.1, entry.z);
    roof.rotation.y = Math.PI * 0.25;
    roof.castShadow = true;

    const doorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 2.6, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.7 }),
    );
    doorFrame.position.set(entry.doorX, 1.3, entry.doorZ + (entry.z > 0 ? 0.2 : -0.2));
    doorFrame.castShadow = true;

    currentMapGroup.add(base, roof, doorFrame);

    const sign = createLabel(entry.title);
    sign.position.set(entry.x, 4.7, entry.z - 5.5);
    currentMapGroup.add(sign);

    const door = createDoorMarker(0xffe27a);
    door.position.set(entry.doorX, 0.05, entry.doorZ);
    currentMapGroup.add(door);

    currentEntryZones.push({
      label: `Enter ${entry.title}`,
      targetMap: entry.id,
      position: new THREE.Vector3(entry.doorX, 0, entry.doorZ),
      radius: 1.7,
      townSpawn: entry.townSpawn,
    });
  });

  currentMapBounds = {
    minX: -TOWN_HALF_SIZE,
    maxX: TOWN_HALF_SIZE,
    minZ: -TOWN_HALF_SIZE,
    maxZ: TOWN_HALF_SIZE,
  };
  defaultStatus = "Walk in front of a building to teleport inside.";
}

function buildGrocery() {
  scene.background = new THREE.Color(0xb7d2e0);
  scene.fog = new THREE.Fog(0xb7d2e0, 18, 65);
  addRoomShell({ wallColor: 0xa6c39d, floorColor: 0x54687b });

  const sectionConfigs = [
    { name: "Fruits", x: -6.2 },
    { name: "Veggies", x: 0 },
    { name: "Snacks", x: 6.2 },
  ];

  sectionConfigs.forEach((section) => {
    const sectionLabel = createLabel(section.name, "#f4fbff");
    sectionLabel.scale.set(2.8, 0.75, 1);
    sectionLabel.position.set(section.x, 4.15, -3.3);
    currentMapGroup.add(sectionLabel);

    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 1.35, 2.8),
      new THREE.MeshStandardMaterial({ color: 0x68798a, roughness: 0.83 }),
    );
    stand.position.set(section.x, 0.68, -3.5);
    stand.castShadow = true;
    stand.receiveShadow = true;
    currentMapGroup.add(stand);
  });

  const itemsBySection = {
    Fruits: GROCERY_ITEMS.filter((item) => item.section === "Fruits"),
    Veggies: GROCERY_ITEMS.filter((item) => item.section === "Veggies"),
    Snacks: GROCERY_ITEMS.filter((item) => item.section === "Snacks"),
  };

  sectionConfigs.forEach((section) => {
    const items = itemsBySection[section.name];
    items.forEach((item, index) => {
      const x = section.x - 1.6 + index * 1.6;
      const y = 1.76;

      let mesh;
      if (item.kind === "snack") {
        if (item.name === "Lollipop") {
          mesh = new THREE.Group();
          const candy = new THREE.Mesh(
            new THREE.SphereGeometry(0.23, 12, 10),
            new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.4, metalness: 0.1 }),
          );
          candy.position.y = 0.26;
          const stick = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8),
            new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.92 }),
          );
          mesh.add(candy, stick);
          mesh.position.set(x, 1.58, -3.5);
        } else {
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.5, 0.34),
            new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.58, metalness: 0.2 }),
          );
          mesh.position.set(x, y, -3.5);
        }
      } else if (item.name === "Banana") {
        mesh = new THREE.Mesh(
          new THREE.TorusGeometry(0.24, 0.07, 8, 14, Math.PI * 1.1),
          new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.58, metalness: 0.1 }),
        );
        mesh.rotation.z = -Math.PI * 0.35;
        mesh.position.set(x, y, -3.5);
      } else {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 14, 12),
          new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.48, metalness: 0.08 }),
        );
        mesh.position.set(x, y, -3.5);
      }

      mesh.castShadow = true;
      currentMapGroup.add(mesh);

      const label = createLabel(item.name, "#f3fbff", "rgba(8,16,28,0.82)");
      label.scale.set(1.9, 0.56, 1);
      label.position.set(x, 2.65, -3.5);
      currentMapGroup.add(label);

      currentInteractables.push({
        type: "pickup",
        label: `Pick up ${item.name}`,
        radius: 1.2,
        position: new THREE.Vector3(x, 0, -2.1),
        item,
        mesh,
        labelSprite: label,
        taken: false,
      });
    });
  });

  currentMapBounds = {
    minX: -ROOM_HALF_SIZE,
    maxX: ROOM_HALF_SIZE,
    minZ: -ROOM_HALF_SIZE,
    maxZ: ROOM_HALF_SIZE,
  };
  defaultStatus = "Grocery: fruits, veggies, and snacks. Press E to pick items.";
}

function buildClothesStore() {
  scene.background = new THREE.Color(0xb7d2e0);
  scene.fog = new THREE.Fog(0xb7d2e0, 18, 65);
  addRoomShell({ wallColor: 0xa2b7d4, floorColor: 0x52687b });

  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(7.4, 1.8, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x4b5f74, roughness: 0.82 }),
  );
  counter.position.set(0, 0.9, -4.4);
  counter.castShadow = true;
  counter.receiveShadow = true;
  currentMapGroup.add(counter);

  const npc = createNpc({ shirt: 0x587fbb, pants: 0x2f3c4e, hair: 0x1f1914 });
  npc.position.set(0, 0, -5.4);
  currentMapGroup.add(npc);

  const displayHat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16),
    new THREE.MeshStandardMaterial({ color: 0x4f6b9f, roughness: 0.6 }),
  );
  displayHat.position.set(-3.2, 1.95, -4.35);
  displayHat.castShadow = true;

  const displayShirt = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.95, 0.45),
    new THREE.MeshStandardMaterial({ color: 0xba4d57, roughness: 0.76 }),
  );
  displayShirt.position.set(-1.05, 1.95, -4.35);
  displayShirt.castShadow = true;

  const displayPants = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.95, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x354c73, roughness: 0.82 }),
  );
  displayPants.position.set(1.05, 1.95, -4.35);
  displayPants.castShadow = true;

  const displayJacket = new THREE.Mesh(
    new THREE.BoxGeometry(0.96, 1.06, 0.52),
    new THREE.MeshStandardMaterial({ color: 0x4e607b, roughness: 0.74 }),
  );
  displayJacket.position.set(3.2, 1.95, -4.35);
  displayJacket.castShadow = true;

  currentMapGroup.add(displayHat, displayShirt, displayPants, displayJacket);

  const labelHat = createLabel("Beanies / Hats", "#f4fbff");
  labelHat.scale.set(2.4, 0.64, 1);
  labelHat.position.set(-3.2, 3.2, -4.35);
  const labelShirt = createLabel("Shirts", "#f4fbff");
  labelShirt.scale.set(1.45, 0.64, 1);
  labelShirt.position.set(-1.05, 3.2, -4.35);
  const labelPants = createLabel("Pants", "#f4fbff");
  labelPants.scale.set(1.45, 0.64, 1);
  labelPants.position.set(1.05, 3.2, -4.35);
  const labelJacket = createLabel("Jackets", "#f4fbff");
  labelJacket.scale.set(1.65, 0.64, 1);
  labelJacket.position.set(3.2, 3.2, -4.35);
  currentMapGroup.add(labelHat, labelShirt, labelPants, labelJacket);

  currentInteractables.push({
    type: "npc",
    npcKind: "clothes",
    label: "Talk to clothes seller",
    radius: 2.1,
    position: new THREE.Vector3(0, 0, -2.7),
  });

  currentMapBounds = {
    minX: -ROOM_HALF_SIZE,
    maxX: ROOM_HALF_SIZE,
    minZ: -ROOM_HALF_SIZE,
    maxZ: ROOM_HALF_SIZE,
  };
  defaultStatus = "Walk to the seller and press E to talk.";
}

function buildFurnitureStore() {
  scene.background = new THREE.Color(0xb7d2e0);
  scene.fog = new THREE.Fog(0xb7d2e0, 18, 65);
  addRoomShell({ wallColor: 0xd2b58b, floorColor: 0x52697c });

  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(7.4, 1.8, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x536577, roughness: 0.8 }),
  );
  counter.position.set(0, 0.9, -4.6);
  counter.castShadow = true;
  counter.receiveShadow = true;
  currentMapGroup.add(counter);

  const npc = createNpc({ shirt: 0x99815f, pants: 0x3f3d41, hair: 0x2a2018 });
  npc.position.set(0, 0, -5.7);
  currentMapGroup.add(npc);

  const sampleCouch = createFurnitureMesh({ shape: "couch", color: 0x8e6077 });
  sampleCouch.scale.set(0.5, 0.5, 0.5);
  sampleCouch.position.set(-4.8, 0, -2.8);
  const sampleTv = createFurnitureMesh({ shape: "tv", color: 0x26262a });
  sampleTv.scale.set(0.62, 0.62, 0.62);
  sampleTv.position.set(-1.5, 0, -2.8);
  const samplePainting = createFurnitureMesh({ shape: "painting", color: 0xe1d5c4 });
  samplePainting.scale.set(0.75, 0.75, 0.75);
  samplePainting.position.set(1.6, 0, -2.8);
  const samplePlant = createFurnitureMesh({ shape: "plant", color: 0x4f8d5f });
  samplePlant.scale.set(0.85, 0.85, 0.85);
  samplePlant.position.set(4.8, 0, -2.8);

  currentMapGroup.add(sampleCouch, sampleTv, samplePainting, samplePlant);

  const l1 = createLabel("Couches", "#f4fbff");
  l1.scale.set(1.7, 0.6, 1);
  l1.position.set(-4.8, 2.5, -2.8);
  const l2 = createLabel("TVs", "#f4fbff");
  l2.scale.set(1.4, 0.6, 1);
  l2.position.set(-1.5, 2.5, -2.8);
  const l3 = createLabel("Flower Painting", "#f4fbff");
  l3.scale.set(2.3, 0.6, 1);
  l3.position.set(1.6, 2.5, -2.8);
  const l4 = createLabel("Plants", "#f4fbff");
  l4.scale.set(1.5, 0.6, 1);
  l4.position.set(4.8, 2.5, -2.8);
  currentMapGroup.add(l1, l2, l3, l4);

  currentInteractables.push({
    type: "npc",
    npcKind: "furniture",
    label: "Talk to furniture seller",
    radius: 2.2,
    position: new THREE.Vector3(0, 0, -2.8),
  });

  currentMapBounds = {
    minX: -ROOM_HALF_SIZE,
    maxX: ROOM_HALF_SIZE,
    minZ: -ROOM_HALF_SIZE,
    maxZ: ROOM_HALF_SIZE,
  };
  defaultStatus = "Walk to the seller and press E to talk.";
}

function buildBarberShop() {
  scene.background = new THREE.Color(0xb7d2e0);
  scene.fog = new THREE.Fog(0xb7d2e0, 18, 65);
  addRoomShell({ wallColor: 0xc59baa, floorColor: 0x51677a });

  const chairPositions = [
    [-4.8, -4.4],
    [-1.6, -4.4],
    [1.6, -4.4],
    [4.8, -4.4],
  ];

  chairPositions.forEach(([x, z]) => {
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.0, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x9a343d, roughness: 0.62, metalness: 0.18 }),
    );
    seat.position.set(x, 0.5, z);
    seat.castShadow = true;
    seat.receiveShadow = true;
    currentMapGroup.add(seat);

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.2, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x7c262d, roughness: 0.6, metalness: 0.2 }),
    );
    back.position.set(x, 1.3, z - 0.58);
    back.castShadow = true;
    currentMapGroup.add(back);
  });

  const barberNpc = createNpc({ shirt: 0x2c4154, pants: 0x232c36, hair: 0x1b1410 });
  barberNpc.position.set(0, 0, -2.8);
  const customerA = createNpc({ shirt: 0x8f4253, pants: 0x343944, hair: 0x6b3d28 });
  customerA.position.set(-4.8, 0, -4.4);
  customerA.rotation.y = Math.PI;
  const customerB = createNpc({ shirt: 0x4a698b, pants: 0x32414f, hair: 0x2d2218 });
  customerB.position.set(4.8, 0, -4.4);
  customerB.rotation.y = Math.PI;
  currentMapGroup.add(barberNpc, customerA, customerB);

  const stationLabel = createLabel("Hair Style Station", "#f3fbff");
  stationLabel.position.set(0, 4.1, -2.8);
  currentMapGroup.add(stationLabel);

  currentInteractables.push({
    type: "npc",
    npcKind: "barber",
    label: "Talk to barber",
    radius: 2.2,
    position: new THREE.Vector3(0, 0, -1.1),
  });

  currentMapBounds = {
    minX: -ROOM_HALF_SIZE,
    maxX: ROOM_HALF_SIZE,
    minZ: -ROOM_HALF_SIZE,
    maxZ: ROOM_HALF_SIZE,
  };
  defaultStatus = "Press E near the barber to start conversation.";
}

function buildHome() {
  scene.background = new THREE.Color(0xb7d2e0);
  scene.fog = new THREE.Fog(0xb7d2e0, 18, 65);
  addRoomShell({ wallColor: 0xf6f7f8, floorColor: 0x5f7688 });

  const sandCarpet = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 6),
    new THREE.MeshStandardMaterial({ color: 0xd7bd89, roughness: 0.96, metalness: 0.02 }),
  );
  sandCarpet.rotation.x = -Math.PI / 2;
  sandCarpet.position.y = 0.04;
  sandCarpet.receiveShadow = true;
  currentMapGroup.add(sandCarpet);

  const chest = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.3, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x74553d, roughness: 0.75, metalness: 0.11 }),
  );
  chest.position.set(-7.4, 0.65, -6.4);
  chest.castShadow = true;
  chest.receiveShadow = true;
  currentMapGroup.add(chest);

  const chestLabel = createLabel("Storage Chest", "#f6fbff");
  chestLabel.scale.set(2.7, 0.75, 1);
  chestLabel.position.set(-7.4, 2.3, -6.4);
  currentMapGroup.add(chestLabel);

  const mainLightA = new THREE.PointLight(0xfff0c8, 1.05, 22, 2.1);
  const mainLightB = new THREE.PointLight(0xfff0c8, 0.92, 18, 2.2);
  mainLightA.position.set(-3.2, 4.5, 0);
  mainLightB.position.set(3.4, 4.5, -2.2);

  const bulbMaterialA = new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffd171, emissiveIntensity: 0.9 });
  const bulbMaterialB = new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffd171, emissiveIntensity: 0.9 });
  const bulbA = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), bulbMaterialA);
  const bulbB = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), bulbMaterialB);
  bulbA.position.copy(mainLightA.position);
  bulbB.position.copy(mainLightB.position);

  currentMapGroup.add(mainLightA, mainLightB, bulbA, bulbB);
  homeLights = [
    { light: mainLightA, emissiveMaterial: bulbMaterialA },
    { light: mainLightB, emissiveMaterial: bulbMaterialB },
  ];

  applyHomeLights();

  decorations.forEach((entry) => {
    const mesh = createFurnitureMesh(entry.item);
    mesh.position.set(entry.position.x, entry.position.y, entry.position.z);
    mesh.rotation.y = entry.rotation;
    currentMapGroup.add(mesh);
  });

  currentMapBounds = {
    minX: -ROOM_HALF_SIZE,
    maxX: ROOM_HALF_SIZE,
    minZ: -ROOM_HALF_SIZE,
    maxZ: ROOM_HALF_SIZE,
  };
  defaultStatus = "Home: press 1 storage, 2 lights, 7 use, 8 place preview, 9 rotate.";
}

function applyHomeLights() {
  homeLights.forEach(({ light, emissiveMaterial }) => {
    light.visible = state.homeLightsOn;
    emissiveMaterial.emissiveIntensity = state.homeLightsOn ? 0.95 : 0.08;
  });
}

function loadMap(mapId, options = {}) {
  const { spawnInTown = null } = options;
  state.currentMap = mapId;

  closeDialog();

  if (mapId !== "home") {
    setStorageOpen(false);
  }

  if (mapId === "town" && spawnInTown) {
    nextTownSpawn = { ...spawnInTown };
  }

  clearCurrentMap();

  if (mapId === "town") {
    buildTown();
    player.group.position.set(nextTownSpawn.x, GROUND_Y, nextTownSpawn.z);
    player.heading = nextTownSpawn.heading;
  } else if (mapId === "grocery") {
    buildGrocery();
    player.group.position.set(0, GROUND_Y, 7.8);
    player.heading = Math.PI;
  } else if (mapId === "clothes") {
    buildClothesStore();
    player.group.position.set(0, GROUND_Y, 7.8);
    player.heading = Math.PI;
  } else if (mapId === "furniture") {
    buildFurnitureStore();
    player.group.position.set(0, GROUND_Y, 7.8);
    player.heading = Math.PI;
  } else if (mapId === "barber") {
    buildBarberShop();
    player.group.position.set(0, GROUND_Y, 7.8);
    player.heading = Math.PI;
  } else {
    buildHome();
    player.group.position.set(0, GROUND_Y, 7.8);
    player.heading = Math.PI;
  }

  state.teleportCooldown = 0.45;
  transitionTimer = 0.2;
  transitionOverlay.classList.remove("hidden");
  transitionOverlay.classList.add("show");

  updateHud();
  buildInventoryUI();
  buildStorageUI();
  updateStatusLine();
}

function setHairStyle(index) {
  state.hairstyleIndex = index;
  applyHairAppearance();
}

function setHairColor(colorHex) {
  state.hairColorHex = colorHex;
  applyHairAppearance();
}

function startBarberConversation() {
  const showStyleMenu = () => {
    openDialog({
      npc: "Barber",
      text: "Pick a style:",
      options: [
        {
          label: "Starter Style",
          action: () => {
            setHairStyle(0);
            showColorMenu();
          },
        },
        {
          label: "Long Hair",
          action: () => {
            setHairStyle(1);
            showColorMenu();
          },
        },
        {
          label: "Curly Hair",
          action: () => {
            setHairStyle(2);
            showColorMenu();
          },
        },
        {
          label: "Short Full Hair",
          action: () => {
            setHairStyle(3);
            showColorMenu();
          },
        },
      ],
    });
  };

  const showColorMenu = () => {
    showColorChoiceDialog({
      npc: "Barber",
      title: "Pick a hair color:",
      palette: HAIR_COLORS,
      onPick: (color) => {
        setHairColor(color.hex);
        closeDialog();
        setFlash(`Hair updated: ${HAIR_STYLES[state.hairstyleIndex].name}, ${color.name}.`, 2.1);
      },
      onBack: showStyleMenu,
    });
  };

  openDialog({
    npc: "Barber",
    text: "Would you like a haircut?",
    options: [
      {
        label: "Yes please",
        action: showStyleMenu,
      },
      {
        label: "No thanks",
        action: showNoThanksMessage,
      },
    ],
  });
}

function startClothesConversation() {
  const showCategoryMenu = () => {
    openDialog({
      npc: "Clothes Seller",
      text: "Choose clothing type:",
      options: [
        {
          label: "Beanies / Hats",
          action: () => showColorMenu("hat"),
        },
        {
          label: "Shirts",
          action: () => showColorMenu("shirt"),
        },
        {
          label: "Pants",
          action: () => showColorMenu("pants"),
        },
        {
          label: "Jackets",
          action: () => showColorMenu("jacket"),
        },
      ],
    });
  };

  const showColorMenu = (category) => {
    const categoryLabel = category === "hat" ? "hat" : category;
    showColorChoiceDialog({
      npc: "Clothes Seller",
      title: `Pick ${categoryLabel} color:`,
      palette: CLOTH_COLORS,
      onPick: (color) => {
        const item = createWearableItem(category, color);
        const added = addItemToInventory(item);
        if (!added) {
          return;
        }
        closeDialog();
        setFlash(`${item.name} added. Press 7 to equip.`, 1.8);
      },
      onBack: showCategoryMenu,
    });
  };

  openDialog({
    npc: "Clothes Seller",
    text: "Would you like clothes?",
    options: [
      {
        label: "Yes please",
        action: showCategoryMenu,
      },
      {
        label: "No thanks",
        action: showNoThanksMessage,
      },
    ],
  });
}

function giveFurnitureItem(template, colorHex) {
  const item = cloneItem(template);
  if (typeof colorHex === "number") {
    item.color = colorHex;
  }
  addItemToInventory(item);
}

function startFurnitureConversation() {
  const showItemMenu = () => {
    openDialog({
      npc: "Furniture Seller",
      text: "Pick furniture:",
      options: [
        {
          label: "Couches",
          action: () => showColorMenu("couch"),
        },
        {
          label: "TVs",
          action: () => showColorMenu("tv"),
        },
        {
          label: "Flower Painting",
          action: () => {
            giveFurnitureItem(FURNITURE_TEMPLATES.flower_painting);
            closeDialog();
          },
        },
        {
          label: "Plants",
          action: () => {
            giveFurnitureItem(FURNITURE_TEMPLATES.plant);
            closeDialog();
          },
        },
      ],
    });
  };

  const showColorMenu = (type) => {
    showColorChoiceDialog({
      npc: "Furniture Seller",
      title: `Pick ${type} color:`,
      palette: FURNITURE_COLORS,
      onPick: (color) => {
        if (type === "couch") {
          giveFurnitureItem(FURNITURE_TEMPLATES.couch, color.hex);
          closeDialog();
          setFlash(`Couch (${color.name}) added to inventory.`, 1.8);
          return;
        }

        giveFurnitureItem(FURNITURE_TEMPLATES.tv, color.hex);
        closeDialog();
        setFlash(`TV (${color.name}) added to inventory.`, 1.8);
      },
      onBack: showItemMenu,
    });
  };

  openDialog({
    npc: "Furniture Seller",
    text: "Do you want furniture?",
    options: [
      {
        label: "Yes please",
        action: showItemMenu,
      },
      {
        label: "No thanks",
        action: showNoThanksMessage,
      },
    ],
  });
}

function storeSelectedSlot() {
  if (state.currentMap !== "home") {
    setFlash("Storage only works inside your home.", 1.8);
    return;
  }

  const item = state.inventory[state.selectedSlot];
  if (!item) {
    setFlash("Selected slot is empty.", 1.6);
    return;
  }

  if (placementPreview.active && placementPreview.slotIndex === state.selectedSlot) {
    clearPlacementPreview();
  }

  state.storage.push(item);
  state.inventory[state.selectedSlot] = null;
  buildInventoryUI();
  buildStorageUI();
  setFlash(`${item.name} stored at home.`, 1.6);
}

function retrieveStoredItem() {
  if (state.currentMap !== "home") {
    setFlash("Storage only works inside your home.", 1.8);
    return;
  }

  if (state.storage.length === 0) {
    setFlash("Storage is empty.", 1.6);
    return;
  }

  let destination = state.selectedSlot;
  if (state.inventory[destination]) {
    destination = state.inventory.findIndex((slot) => slot == null);
  }

  if (destination === -1) {
    setFlash("Inventory full. Free a slot first.", 1.9);
    return;
  }

  const item = state.storage.shift();
  state.inventory[destination] = item;
  buildInventoryUI();
  buildStorageUI();
  setFlash(`${item.name} moved to slot ${destination + 1}.`, 1.8);
}

function placeFurnitureFromSelectedSlot() {
  return placePlacementPreview();
}

function interactWith(target) {
  if (!target) {
    setFlash("Nothing to interact with here.", 1.2);
    return;
  }

  if (target.type === "pickup") {
    if (target.taken) {
      setFlash("Item already collected.", 1.3);
      return;
    }

    const added = addItemToInventory(target.item);
    if (added) {
      target.taken = true;
      if (target.mesh) {
        target.mesh.visible = false;
      }
      if (target.labelSprite) {
        target.labelSprite.visible = false;
      }
    }
    return;
  }

  if (target.type === "npc") {
    if (target.npcKind === "barber") {
      startBarberConversation();
      return;
    }

    if (target.npcKind === "clothes") {
      startClothesConversation();
      return;
    }

    if (target.npcKind === "furniture") {
      startFurnitureConversation();
    }
  }
}

function findNearestInteractable() {
  let best = null;
  let bestDistance = Infinity;

  for (const entry of currentInteractables) {
    if (entry.taken) {
      continue;
    }

    const distance = player.group.position.distanceTo(entry.position);
    if (distance <= entry.radius && distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }

  return best;
}

function updateTownAutoEntry(dt) {
  if (state.currentMap !== "town") {
    return;
  }

  if (state.teleportCooldown > 0) {
    state.teleportCooldown = Math.max(0, state.teleportCooldown - dt);
    return;
  }

  for (const zone of currentEntryZones) {
    const distance = player.group.position.distanceTo(zone.position);
    if (distance <= zone.radius) {
      nextTownSpawn = zone.townSpawn;
      loadMap(zone.targetMap);
      setFlash(`Teleported into ${MAPS[zone.targetMap]}.`, 1.3);
      break;
    }
  }
}

function updateExitProgress(dt) {
  if (state.currentMap === "town" || !currentExitZone) {
    state.exitHoldSeconds = 0;
    return;
  }

  const distance = player.group.position.distanceTo(currentExitZone.position);
  if (distance <= currentExitZone.radius) {
    state.exitHoldSeconds = Math.min(EXIT_HOLD_SECONDS, state.exitHoldSeconds + dt);
    const remaining = Math.max(0, EXIT_HOLD_SECONDS - state.exitHoldSeconds);
    state.promptText = `Standing at exit... ${remaining.toFixed(1)}s`;

    if (state.exitHoldSeconds >= EXIT_HOLD_SECONDS) {
      loadMap("town", { spawnInTown: currentExitZone.townSpawn });
      setFlash("Returned to town.", 1.3);
    }
    return;
  }

  state.exitHoldSeconds = 0;
}

function updateInteractionPrompt() {
  const target = findNearestInteractable();
  player.activeInteractable = target;

  if (state.dialogOpen) {
    state.promptText = "Choose a dialog response.";
    return;
  }

  if (state.currentMap === "town") {
    let nearestEntry = null;
    let nearestDist = Infinity;
    currentEntryZones.forEach((zone) => {
      const dist = player.group.position.distanceTo(zone.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestEntry = zone;
      }
    });

    if (nearestEntry && nearestDist < 4.5) {
      state.promptText = `Walk closer to auto-enter: ${nearestEntry.label}`;
      return;
    }

    state.promptText = "Walk to a building doorway to teleport inside.";
    return;
  }

  if (target) {
    state.promptText = `Press E: ${target.label}`;
    return;
  }

  if (state.currentMap === "home") {
    const selected = state.inventory[state.selectedSlot];
    if (placementPreview.active) {
      const mode = getPreviewFacingMode();
      state.promptText = `Preview active (${PREVIEW_ROTATION_LABEL[mode]}). Press 8 place, 9 rotate.`;
    } else if (selected && selected.placeable) {
      state.promptText = "At home: select furniture and press 7 to preview.";
    } else {
      state.promptText = "At home: 1 storage, 2 lights, 7 use/equip/eat, 6 inventory.";
    }
    return;
  }

  state.promptText = "Press E near NPCs/items. Press 7 to use selected inventory item.";
}

function applyMovement(dt) {
  if (state.dialogOpen) {
    return;
  }

  const move = (keys.get("KeyW") || keys.get("ArrowUp") ? 1 : 0) - (keys.get("KeyS") || keys.get("ArrowDown") ? 1 : 0);
  const turn = (keys.get("KeyD") || keys.get("ArrowRight") ? 1 : 0) - (keys.get("KeyA") || keys.get("ArrowLeft") ? 1 : 0);

  if (turn !== 0) {
    player.heading -= turn * TURN_SPEED * dt;
  }

  if (move !== 0) {
    player.group.position.x += Math.sin(player.heading) * move * WALK_SPEED * dt;
    player.group.position.z += Math.cos(player.heading) * move * WALK_SPEED * dt;
  }

  player.group.position.x = THREE.MathUtils.clamp(player.group.position.x, currentMapBounds.minX, currentMapBounds.maxX);
  player.group.position.z = THREE.MathUtils.clamp(player.group.position.z, currentMapBounds.minZ, currentMapBounds.maxZ);
  player.group.rotation.y = player.heading;
}

function updateCamera() {
  const followDistance = 7.2;
  tmpVec3.set(
    player.group.position.x - Math.sin(player.heading) * followDistance,
    player.group.position.y + 4.3,
    player.group.position.z - Math.cos(player.heading) * followDistance,
  );

  camera.position.lerp(tmpVec3, 0.14);
  camera.lookAt(player.group.position.x, 1.2, player.group.position.z);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function handleToggle(code) {
  if (code === "Digit6") {
    setInventoryOpen(!state.inventoryOpen);
    setFlash(state.inventoryOpen ? "Inventory opened." : "Inventory closed.", 1.2);
    return;
  }

  if (code === "BracketLeft") {
    setSelectedSlot((state.selectedSlot - 1 + INVENTORY_SIZE) % INVENTORY_SIZE);
    return;
  }

  if (code === "BracketRight") {
    setSelectedSlot((state.selectedSlot + 1) % INVENTORY_SIZE);
    return;
  }

  if (code === "Digit1") {
    if (state.currentMap !== "home") {
      setFlash("Go home to use storage.", 1.4);
      return;
    }
    setStorageOpen(!state.storageOpen);
    setFlash(state.storageOpen ? "Home storage opened." : "Home storage closed.", 1.3);
    buildStorageUI();
    return;
  }

  if (code === "Digit2") {
    if (state.currentMap !== "home") {
      setFlash("Home lights can only be changed at home.", 1.4);
      return;
    }
    state.homeLightsOn = !state.homeLightsOn;
    applyHomeLights();
    updateHud();
    setFlash(`Home lights ${state.homeLightsOn ? "on" : "off"}.`, 1.4);
    return;
  }

  if (code === "Digit7") {
    useSelectedItemWith7();
    return;
  }

  if (code === "Digit8") {
    placePlacementPreview();
    return;
  }

  if (code === "Digit9") {
    cyclePlacementPreviewRotation();
    return;
  }

  if (code === "Digit3") {
    placePlacementPreview();
    return;
  }

  if (code === "KeyF") {
    toggleFullscreen();
    return;
  }

  if (code === "KeyE") {
    if (!state.dialogOpen) {
      interactWith(player.activeInteractable);
    }
    return;
  }

  if (code === "Escape") {
    if (state.dialogOpen) {
      closeDialog();
      setFlash("Conversation ended.", 1.2);
      return;
    }

    if (placementPreview.active) {
      clearPlacementPreview();
      setFlash("Placement preview canceled.", 1.2);
    }
  }
}

function onKeyDown(event) {
  keys.set(event.code, true);

  if (event.repeat) {
    return;
  }

  if (state.mode === "menu") {
    if (event.code === "Enter" || event.code === "Space") {
      startGame();
    }
    return;
  }

  handleToggle(event.code);
}

function onKeyUp(event) {
  keys.set(event.code, false);
}

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function startGame() {
  state.mode = "playing";
  overlay.classList.add("hidden");
  setFlash("Welcome! Walk in front of a building to enter.", 2.2);
}

function update(dt) {
  if (state.mode === "playing") {
    applyMovement(dt);
    updatePlacementPreviewTransform();
    updateTownAutoEntry(dt);
    updateExitProgress(dt);
    updateInteractionPrompt();
  }

  if (state.flashTimer > 0) {
    state.flashTimer = Math.max(0, state.flashTimer - dt);
  }

  if (state.teleportCooldown > 0) {
    state.teleportCooldown = Math.max(0, state.teleportCooldown - dt);
  }

  if (transitionTimer > 0) {
    transitionTimer = Math.max(0, transitionTimer - dt);
    if (transitionTimer === 0) {
      transitionOverlay.classList.remove("show");
      transitionOverlay.classList.add("hidden");
    }
  }

  updateCamera();
  updateStatusLine();
}

function render() {
  renderer.render(scene, camera);
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  render();
  requestAnimationFrame(animate);
}

function renderGameToText() {
  const nearest = player.activeInteractable
    ? {
        type: player.activeInteractable.type,
        label: player.activeInteractable.label,
        x: Number(player.activeInteractable.position.x.toFixed(2)),
        z: Number(player.activeInteractable.position.z.toFixed(2)),
      }
    : null;

  const interactables = currentInteractables
    .filter((entry) => !entry.taken)
    .slice(0, 24)
    .map((entry) => ({
      type: entry.type,
      label: entry.label,
      x: Number(entry.position.x.toFixed(2)),
      z: Number(entry.position.z.toFixed(2)),
      radius: Number(entry.radius.toFixed(2)),
      npc_kind: entry.npcKind || null,
    }));

  const entryZones = currentEntryZones.slice(0, 8).map((zone) => ({
    label: zone.label,
    target_map: zone.targetMap,
    x: Number(zone.position.x.toFixed(2)),
    z: Number(zone.position.z.toFixed(2)),
    radius: Number(zone.radius.toFixed(2)),
  }));

  const dialogPayload = activeDialog
    ? {
        npc: activeDialog.npc,
        text: activeDialog.text,
        options: activeDialog.options.map((option) => option.label),
      }
    : null;

  const previewPayload = placementPreview.active && placementPreview.mesh
    ? {
        item_name: placementPreview.item ? placementPreview.item.name : null,
        slot: placementPreview.slotIndex + 1,
        facing_mode: getPreviewFacingMode(),
        x: Number(placementPreview.mesh.position.x.toFixed(2)),
        z: Number(placementPreview.mesh.position.z.toFixed(2)),
      }
    : null;

  const payload = {
    coordinate_system: "origin centered per map; x=right, y=up, z=forward",
    mode: state.mode,
    map: state.currentMap,
    map_name: MAPS[state.currentMap],
    player: {
      x: Number(player.group.position.x.toFixed(2)),
      y: Number(player.group.position.y.toFixed(2)),
      z: Number(player.group.position.z.toFixed(2)),
      heading: Number(player.heading.toFixed(3)),
    },
    nearby_interaction: nearest,
    inventory_open: state.inventoryOpen,
    selected_slot: state.selectedSlot + 1,
    inventory_slots: state.inventory.map((item) => (item ? item.name : null)),
    storage_open: state.storageOpen,
    storage_items: state.storage.map((item) => item.name),
    home_lights_on: state.homeLightsOn,
    hairstyle: HAIR_STYLES[state.hairstyleIndex].name,
    hair_color_hex: state.hairColorHex,
    outfit: {
      hat_enabled: state.outfit.hatEnabled,
      hat_color_hex: state.outfit.hatColorHex,
      shirt_color_hex: state.outfit.shirtColorHex,
      pants_color_hex: state.outfit.pantsColorHex,
      jacket_enabled: state.outfit.jacketEnabled,
      jacket_color_hex: state.outfit.jacketColorHex,
    },
    dialog_open: state.dialogOpen,
    dialog: dialogPayload,
    exit_hold_seconds: Number(state.exitHoldSeconds.toFixed(2)),
    placed_furniture_count: decorations.length,
    placement_preview: previewPayload,
    interactables,
    entry_zones: entryZones,
    status_text: statusLine.textContent,
  };

  return JSON.stringify(payload);
}

function advanceTime(ms) {
  const clamped = Math.max(1, ms);
  const steps = Math.max(1, Math.round(clamped / (1000 / 60)));
  const dt = clamped / 1000 / steps;
  for (let i = 0; i < steps; i += 1) {
    update(dt);
  }
  render();
}

storeSelectedButton.addEventListener("click", () => {
  storeSelectedSlot();
});

retrieveItemButton.addEventListener("click", () => {
  retrieveStoredItem();
});

window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("resize", onResize);
startButton.addEventListener("click", startGame);

window.render_game_to_text = renderGameToText;
window.advanceTime = advanceTime;

addItemToInventory({
  id: "starter-couch",
  name: "Starter Couch",
  kind: "furniture",
  placeable: true,
  shape: "couch",
  color: 0x6d6da3,
});

applyHairAppearance();
applyOutfitAppearance();
updateHud();
buildInventoryUI();
buildStorageUI();
loadMap("town", { spawnInTown: nextTownSpawn });
animate();
