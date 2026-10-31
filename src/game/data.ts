export type WeaponId =
  | "M416"
  | "KAR98K"
  | "AKM"
  | "UMP45"
  | "AWM"
  | "SCAR"
  | "Vector"
  | "M762"
  | "Groza"
  | "DP28"
  | "Mini14"
  | "S686"
  | "S12K"
  | "P92"
  | "P1911";
export type ScopeId = "Red Dot" | "Holographic" | "2x" | "4x" | "6x" | "8x";
export type WeaponCategory =
  | "ASSAULT RIFLE"
  | "SNIPER RIFLE"
  | "SMG"
  | "DMR"
  | "LMG"
  | "SHOTGUN"
  | "SIDEARM";

export interface WeaponDefinition {
  name: string;
  category: WeaponCategory;
  caliber: string;
  damage: number;
  range: number;
  stability: number;
  mag: number;
  image?: string;
}

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  M416: {
    name: "M416",
    category: "ASSAULT RIFLE",
    caliber: "5.56 mm",
    damage: 41,
    range: 65,
    stability: 78,
    mag: 30,
    image: "/images/m416.jpg",
  },
  KAR98K: {
    name: "Kar98k",
    category: "SNIPER RIFLE",
    caliber: "7.62 mm",
    damage: 79,
    range: 88,
    stability: 48,
    mag: 5,
    image: "/images/kar98k.jpg",
  },
  AKM: {
    name: "AKM",
    category: "ASSAULT RIFLE",
    caliber: "7.62 mm",
    damage: 48,
    range: 62,
    stability: 52,
    mag: 30,
  },
  UMP45: {
    name: "UMP45",
    category: "SMG",
    caliber: ".45 ACP",
    damage: 39,
    range: 42,
    stability: 85,
    mag: 30,
  },
  AWM: {
    name: "AWM",
    category: "SNIPER RIFLE",
    caliber: ".300 Magnum",
    damage: 100,
    range: 100,
    stability: 40,
    mag: 5,
  },
  SCAR: {
    name: "SCAR-L",
    category: "ASSAULT RIFLE",
    caliber: "5.56 mm",
    damage: 41,
    range: 60,
    stability: 80,
    mag: 30,
  },
  Vector: {
    name: "Vector",
    category: "SMG",
    caliber: "9 mm",
    damage: 31,
    range: 35,
    stability: 92,
    mag: 19,
  },
  M762: {
    name: "Beryl M762",
    category: "ASSAULT RIFLE",
    caliber: "7.62 mm",
    damage: 46,
    range: 58,
    stability: 48,
    mag: 30,
  },
  Groza: {
    name: "Groza",
    category: "ASSAULT RIFLE",
    caliber: "7.62 mm",
    damage: 47,
    range: 60,
    stability: 65,
    mag: 30,
  },
  DP28: {
    name: "DP-28",
    category: "LMG",
    caliber: "7.62 mm",
    damage: 51,
    range: 66,
    stability: 58,
    mag: 47,
  },
  Mini14: {
    name: "Mini14",
    category: "DMR",
    caliber: "5.56 mm",
    damage: 48,
    range: 85,
    stability: 70,
    mag: 20,
  },
  S686: {
    name: "S686",
    category: "SHOTGUN",
    caliber: "12 gauge",
    damage: 95,
    range: 18,
    stability: 36,
    mag: 2,
  },
  S12K: {
    name: "S12K",
    category: "SHOTGUN",
    caliber: "12 gauge",
    damage: 84,
    range: 23,
    stability: 52,
    mag: 5,
  },
  P92: {
    name: "P92",
    category: "SIDEARM",
    caliber: "9 mm",
    damage: 35,
    range: 25,
    stability: 80,
    mag: 15,
  },
  P1911: {
    name: "P1911",
    category: "SIDEARM",
    caliber: ".45 ACP",
    damage: 41,
    range: 23,
    stability: 74,
    mag: 7,
  },
};

export const SCOPE_IDS: ScopeId[] = [
  "Red Dot",
  "Holographic",
  "2x",
  "4x",
  "6x",
  "8x",
];
export const SCOPE_ZOOM: Record<ScopeId, number> = {
  "Red Dot": 1,
  Holographic: 1,
  "2x": 2,
  "4x": 4,
  "6x": 6,
  "8x": 8,
};

export interface WeaponItem {
  uid: string;
  id: WeaponId;
  mag: number;
  scope: ScopeId | null;
}

export interface Inventory {
  weapons: WeaponItem[];
  main: [string | null, string | null];
  active: number;
  scopes: ScopeId[];
  ammo: { light: number; heavy: number; shell: number };
  heals: number;
}

export interface GameSettings {
  volume: number;
  sensitivity: number;
  shadows: boolean;
  muted: boolean;
  perspective: "TPP" | "FPP";
}

export const DEFAULT_INVENTORY: Inventory = {
  weapons: [
    { uid: "starter-m416", id: "M416", mag: 30, scope: "Red Dot" },
    { uid: "starter-kar98k", id: "KAR98K", mag: 5, scope: "4x" },
    { uid: "starter-akm", id: "AKM", mag: 30, scope: null },
    { uid: "starter-ump", id: "UMP45", mag: 30, scope: null },
  ],
  main: ["starter-m416", "starter-kar98k"],
  active: 0,
  scopes: ["Holographic", "2x", "6x", "8x"],
  ammo: { light: 90, heavy: 120, shell: 20 },
  heals: 3,
};

export const DEFAULT_SETTINGS: GameSettings = {
  volume: 65,
  sensitivity: 50,
  shadows: true,
  muted: false,
  perspective: "TPP",
};

export function readSaved<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

export function equipWeapon(
  inventory: Inventory,
  uid: string,
  slot: number,
): Inventory {
  const next = structuredClone(inventory);
  const previousSlot = next.main.indexOf(uid);
  if (previousSlot !== -1) next.main[previousSlot] = next.main[slot];
  next.main[slot] = uid;
  return next;
}

export function attachScope(
  inventory: Inventory,
  uid: string,
  scope: ScopeId | null,
): Inventory {
  const next = structuredClone(inventory);
  const weapon = next.weapons.find((item) => item.uid === uid);
  if (!weapon || weapon.scope === scope) return inventory;
  const index = scope ? next.scopes.indexOf(scope) : -1;
  if (scope && index === -1) return inventory;
  if (index !== -1) next.scopes.splice(index, 1);
  if (weapon.scope) next.scopes.push(weapon.scope);
  weapon.scope = scope;
  return next;
}
