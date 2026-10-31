export const ARENA = {
  halfX: 100,
  halfZ: 68,
  blueSpawns: [
    [-84, -6],
    [-84, 6],
    [-80, -10],
    [-80, 10],
    [-82, 0],
    [-78, -4],
  ],
  redSpawns: [
    [84, -6],
    [84, 6],
    [80, -10],
    [80, 10],
    [82, 0],
    [78, -4],
  ],
  blueBotSpawns: [
    [-60, -24],
    [-54, 18],
    [-46, -6],
    [-40, 28],
    [-34, -30],
    [-30, 8],
    [-26, -16],
    [-22, 22],
    [-50, 0],
    [-38, -18],
    [-44, 14],
    [-28, 32],
  ],
  redBotSpawns: [
    [60, 24],
    [54, -18],
    [46, 6],
    [40, -28],
    [34, 30],
    [30, -8],
    [26, 16],
    [22, -22],
    [50, 0],
    [38, 18],
    [44, -14],
    [28, -32],
  ],
  loot: [
    { x: -20, z: -8, type: "weapon", id: "M416" },
    { x: 20, z: 8, type: "weapon", id: "AKM" },
    { x: 0, z: 4, type: "weapon", id: "Groza" },
    { x: -8, z: 0, type: "weapon", id: "UMP45" },
    { x: 8, z: -2, type: "weapon", id: "Vector" },
    { x: -36, z: 22, type: "weapon", id: "KAR98K" },
    { x: 36, z: -22, type: "weapon", id: "Mini14" },
    { x: -14, z: 18, type: "weapon", id: "S12K" },
    { x: 14, z: -18, type: "weapon", id: "SCAR" },
    { x: 0, z: -6, type: "weapon", id: "AWM", y: 3.76 },
    { x: -48, z: -20, type: "scope", id: "4x" },
    { x: 48, z: 20, type: "scope", id: "6x" },
    { x: -6, z: 6, type: "scope", id: "Red Dot", y: 3.76 },
    { x: 6, z: -4, type: "scope", id: "2x" },
    { x: -62, z: 0, type: "scope", id: "Holographic" },
    { x: 62, z: 0, type: "scope", id: "8x" },
    { x: -16, z: -14, type: "ammo", ammo: "heavy", amount: 60 },
    { x: 16, z: 14, type: "ammo", ammo: "heavy", amount: 60 },
    { x: -10, z: 12, type: "ammo", ammo: "light", amount: 90 },
    { x: 10, z: -12, type: "ammo", ammo: "shell", amount: 24 },
    { x: -30, z: 6, type: "med" },
    { x: 30, z: -6, type: "med" },
    { x: 0, z: 10, type: "med", y: 3.76 },
    { x: -70, z: 16, type: "weapon", id: "M762" },
    { x: 70, z: -16, type: "weapon", id: "DP28" },
    { x: -4, z: -16, type: "ammo", ammo: "heavy", amount: 40 },
    { x: 4, z: 16, type: "ammo", ammo: "light", amount: 40 },
  ],
};

export function buildArena(api) {
  const { addBox, floorSurfaces, stairRamps, buildingSpots, scene, THREE, setWall } = api;
  const box = (name, w, h, d, x, y, z, collide = true) => addBox(name, w, h, d, x, y, z, collide);
  const wallX = (z, x0, x1, y0, y1, t, name = "concrete") => {
    if (x1 - x0 < 0.08 || y1 - y0 < 0.08) return;
    box(name, x1 - x0, y1 - y0, t, (x0 + x1) / 2, (y0 + y1) / 2, z);
  };
  const wallZ = (x, z0, z1, y0, y1, t, name = "concrete") => {
    if (z1 - z0 < 0.08 || y1 - y0 < 0.08) return;
    box(name, t, y1 - y0, z1 - z0, x, (y0 + y1) / 2, (z0 + z1) / 2);
  };
  const floor = (x0, x1, z0, z1, y) => {
    floorSurfaces.push({ x0, x1, z0, z1, y });
    box("concrete", x1 - x0, 0.16, z1 - z0, (x0 + x1) / 2, y - 0.08, (z0 + z1) / 2, false);
  };
  const stairs = (x, z0, z1, y0, y1) => {
    stairRamps.push({ x0: x - 0.85, x1: x + 0.85, z0, z1, y0, y1 });
    const steps = 14;
    const step = (z1 - z0) / steps;
    for (let i = 0; i < steps; i++) {
      box("metal", 1.55, 0.14, step + 0.03, x, y0 + ((i + 1) / steps) * (y1 - y0) - 0.05, z0 + (i + 0.5) * step, false);
    }
    for (const side of [-1, 1]) {
      box("hazard", 0.08, 0.9, z1 - z0, x + side * 0.9, (y0 + y1) / 2 + 0.45, (z0 + z1) / 2, false);
      addBox("metal", 0.12, y1 - y0 + 1.3, z1 - z0, x + side * 0.98, y0 + (y1 - y0) / 2, (z0 + z1) / 2, true);
    }
  };
  const container = (x, z, alongX, color, stacked = 1) => {
    const w = alongX ? 6.2 : 2.45;
    const d = alongX ? 2.45 : 6.2;
    const h = 2.55 * stacked;
    box(color, w, h, d, x, h / 2, z);
    box("metal", w * 0.92, 0.08, 0.08, x, h - 0.18, z + (alongX ? d / 2 - 0.04 : 0), false);
    box("metal", 0.08, 0.08, d * 0.7, x + (alongX ? 0 : w / 2 - 0.04), h * 0.55, z, false);
    buildingSpots.push({ x, z, w, d, gy: 0, levels: 1, H: h });
  };
  const crateStack = (x, z, n = 2) => {
    for (let i = 0; i < n; i++) box("crate", 1.15, 1.05, 1.15, x, 0.52 + i * 1.05, z);
  };
  const truck = (x, z, facingX) => {
    const cabW = facingX ? 2.3 : 2.1;
    const cabD = facingX ? 2.1 : 2.3;
    box("metal", facingX ? 5.4 : 2.15, 1.35, facingX ? 2.15 : 5.4, x, 1.15, z);
    box("containerRed", cabW, 1.7, cabD, x + (facingX ? 2.2 : 0), 1.55, z + (facingX ? 0 : 2.2));
    box("metal", 0.7, 0.7, 0.25, x - (facingX ? 1.2 : 0.9), 0.38, z - 0.7);
    box("metal", 0.7, 0.7, 0.25, x - (facingX ? 1.2 : 0.9), 0.38, z + 0.7);
    buildingSpots.push({ x, z, w: 6, d: 2.6, gy: 0, levels: 1, H: 2.4 });
  };
  const bunker = (side) => {
    const x = side * 84;
    const w = 16;
    const d = 22;
    const h = 4.4;
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const z0 = -d / 2;
    const z1 = d / 2;
    floor(x0 + 0.3, x1 - 0.3, z0 + 0.3, z1 - 0.3, 0.16);
    wallZ(x - side * (w / 2), z0, z1, 0, h, 0.42);
    wallX(z0, x0, x1, 0, h, 0.42);
    wallX(z1, x0, x1, 0, h, 0.42);
    const doorX = x + side * (w / 2);
    wallZ(doorX, z0, -1.7, 0, h, 0.42);
    wallZ(doorX, 1.7, z1, 0, h, 0.42);
    wallZ(doorX, -1.7, 1.7, 2.5, h, 0.42);
    box("crate", 1.3, 1.15, 2.6, x - side * 2.2, 0.58, -6);
    box("crate", 1.3, 1.15, 2.6, x - side * 2.2, 0.58, 6);
    box("metal", 2.4, 1.05, 0.35, x, 0.55, 0);
    box(side < 0 ? "containerBlue" : "containerRed", 0.18, 2.2, 1.4, x - side * 5.2, 2.4, 0, false);
    buildingSpots.push({ x, z: 0, w, d, gy: 0, levels: 1, H: h });
    box("concrete", 0.5, 1.35, 5.2, x + side * 12.5, 0.68, 0);
  };

  box("asphalt", 198, 0.08, 134, 0, 0.03, 0, false);
  for (const z of [-20, 20]) {
    for (let x = -70; x <= 70; x += 7) box("hazard", 2.2, 0.025, 0.18, x, 0.08, z, false);
  }
  wallX(-68, -100, 100, 0, 5.2, 0.7);
  wallX(68, -100, 100, 0, 5.2, 0.7);
  wallZ(-100, -68, 68, 0, 5.2, 0.7);
  wallZ(100, -68, 68, 0, 5.2, 0.7);
  for (const x of [-100, 100]) {
    for (const z of [-68, 68]) box("hazard", 1.2, 0.7, 1.2, x, 5.5, z, false);
  }

  bunker(-1);
  bunker(1);

  const wx0 = -18;
  const wx1 = 18;
  const wz0 = -12;
  const wz1 = 12;
  const H = 3.6;
  setWall("concrete");
  floor(wx0 + 0.4, wx1 - 0.4, wz0 + 0.4, wz1 - 0.4, 0.16);
  floor(-8.5, 18, wz0 + 0.8, wz1 - 0.8, H + 0.16);
  floor(wx0 + 0.8, -10.2, wz0 + 0.8, wz1 - 0.8, H + 0.16);
  floor(-10.2, -8.2, 6.2, wz1 - 0.5, H + 0.16);
  wallZ(wx0, wz0, -1.8, 0, H, 0.38);
  wallZ(wx0, 1.8, wz1, 0, H, 0.38);
  wallZ(wx0, -1.8, 1.8, 2.45, H, 0.38);
  wallZ(wx1, wz0, -1.8, 0, H, 0.38);
  wallZ(wx1, 1.8, wz1, 0, H, 0.38);
  wallZ(wx1, -1.8, 1.8, 2.45, H, 0.38);
  wallX(wz0, wx0, -4, 0, H, 0.38);
  wallX(wz0, 4, wx1, 0, H, 0.38);
  wallX(wz0, -4, 4, 1.15, 2.35, 0.28);
  wallX(wz1, wx0, -6, 0, H, 0.38);
  wallX(wz1, 2, wx1, 0, H, 0.38);
  wallX(wz1, -6, 2, 1.15, 2.35, 0.28);
  wallZ(wx0, wz0, wz1, H, H * 2, 0.34);
  wallZ(wx1, wz0, -2, H, H * 2, 0.34);
  wallZ(wx1, 3.2, wz1, H, H * 2, 0.34);
  wallZ(wx1, -2, 3.2, H + 2.3, H * 2, 0.34);
  wallX(wz0, wx0, wx1, H, H * 2, 0.34);
  wallX(wz1, wx0, -2, H, H * 2, 0.34);
  wallX(wz1, 3, wx1, H, H * 2, 0.34);
  wallX(wz1, -2, 3, H + 1.2, H * 2, 0.3);
  for (const z of [wz0, wz1]) {
    for (const x of [-10, 0, 10]) box("glass", 2.4, 1.15, 0.08, x, 1.7, z, false);
    for (const x of [-12, 8]) box("glass", 2.2, 1.05, 0.08, x, H + 1.7, z, false);
  }
  stairs(-9.2, -7.2, 6.4, 0.16, H + 0.16);
  box("crate", 1.4, 1.15, 1.4, -4, 0.58, -6);
  box("crate", 1.4, 1.15, 2.2, 6, 0.58, 5);
  box("crate", 1.2, 1.05, 1.2, 6, 1.68, 5);
  box("metal", 4.2, 1.7, 0.35, 2, 0.9, -4);
  box("wood", 3.2, 0.9, 0.8, -2, H + 0.6, 4);
  box("concrete", 36.6, 0.18, 24.6, 0, H * 2 + 0.08, 0, false);
  floorSurfaces.push({ x0: wx0, x1: wx1, z0: wz0, z1: wz1, y: H * 2 + 0.18 });
  for (const z of [wz0, wz1]) box("concrete", 36, 0.9, 0.28, 0, H * 2 + 0.6, z, false);
  for (const x of [wx0, wx1]) box("concrete", 0.28, 0.9, 24, x, H * 2 + 0.6, 0, false);
  buildingSpots.push({ x: 0, z: 0, w: 36, d: 24, gy: 0, levels: 2, H });

  const wings = [
    [-46, -30, 14, 12],
    [46, 30, 14, 12],
    [-42, 26, 12, 10],
    [42, -26, 12, 10],
  ];
  for (const [cx, cz, w, d] of wings) {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    floor(x0 + 0.3, x1 - 0.3, z0 + 0.3, z1 - 0.3, 0.16);
    floor(x0 + 0.4, x1 - 0.4, z0 + 0.4, z1 - 1.8, 3.5);
    wallX(z0, x0, x1, 0, 3.4, 0.32);
    wallX(z1, x0, x1 - 1.6, 0, 3.4, 0.32);
    wallX(z1, x1 - 1.6, x1, 2.4, 3.4, 0.32);
    wallZ(x0, z0, z1, 0, 3.4, 0.32);
    wallZ(x1, z0, cz - 1.2, 0, 3.4, 0.32);
    wallZ(x1, cz + 1.2, z1, 0, 3.4, 0.32);
    wallZ(x1, cz - 1.2, cz + 1.2, 2.4, 3.4, 0.32);
    stairs(cx, cz - 1.2, cz + d / 2 - 0.8, 0.16, 3.5);
    box("crate", 1.1, 1.05, 1.1, cx - 2, 0.55, cz - 2);
    buildingSpots.push({ x: cx, z: cz, w, d, gy: 0, levels: 2, H: 3.4 });
  }

  const containers = [
    [-58, -36, true, "containerBlue", 1],
    [-50, -36, true, "containerOlive", 2],
    [-28, -40, false, "containerRed", 1],
    [-16, -36, true, "containerBlue", 1],
    [22, -38, true, "containerOlive", 1],
    [36, -34, false, "containerRed", 2],
    [54, -36, true, "containerBlue", 1],
    [58, 36, true, "containerRed", 1],
    [48, 38, true, "containerOlive", 2],
    [24, 36, false, "containerBlue", 1],
    [-22, 38, true, "containerRed", 1],
    [-38, 34, false, "containerOlive", 2],
    [-56, 36, true, "containerBlue", 1],
    [-8, 40, true, "containerRed", 1],
    [8, -42, true, "containerOlive", 1],
  ];
  for (const [x, z, along, color, stacked] of containers) container(x, z, along, color, stacked);

  crateStack(-24, -8, 2);
  crateStack(24, 10, 2);
  crateStack(-12, 28, 1);
  crateStack(12, -28, 1);
  crateStack(0, 22, 2);
  crateStack(-62, 12, 1);
  crateStack(62, -12, 1);
  truck(-24, 16, true);
  truck(26, -14, true);
  truck(0, -24, false);

  for (const x of [-32, 32]) {
    box("concrete", 0.45, 1.15, 10, x, 0.58, 0);
    box("concrete", 8, 1.15, 0.45, x, 0.58, 8);
    box("concrete", 8, 1.15, 0.45, x, 0.58, -8);
  }
  box("concrete", 0.4, 1.2, 14, 0, 0.6, 32);
  box("concrete", 0.4, 1.2, 14, 0, 0.6, -32);

  for (const [x, z, color] of [
    [-90, 0, "containerBlue"],
    [90, 0, "containerRed"],
  ]) {
    box(color, 0.4, 6, 8, x, 3.2, z, false);
  }

  for (const [x, z, s] of [
    [-108, -20, 10],
    [-112, 24, 14],
    [110, -16, 12],
    [114, 30, 16],
    [0, -86, 18],
    [20, 90, 14],
  ]) {
    box("concrete", s, s * 0.55, s * 0.7, x, s * 0.22, z, false);
  }

  const lamps = [
    [0, 6.4, 0, 0xffe2b4, 18, 26],
    [-46, 4.6, -30, 0xffd2a2, 8, 16],
    [46, 4.6, 30, 0xffd2a2, 8, 16],
    [-84, 3.4, 0, 0x9ec6ff, 6, 14],
    [84, 3.4, 0, 0xff9e96, 6, 14],
    [0, 5.2, -40, 0xffb15a, 10, 18],
    [0, 5.2, 40, 0xffb15a, 10, 18],
  ];
  for (const [x, y, z, color, intensity, distance] of lamps) {
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.set(x, y, z);
    scene.add(light);
    box("hazard", 0.35, 0.12, 0.35, x, y + 0.2, z, false);
  }
}
