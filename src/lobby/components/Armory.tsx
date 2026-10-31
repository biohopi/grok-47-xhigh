import {
  ArrowRight,
  Check,
  ChevronRight,
  Crosshair,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import { WEAPONS, type Inventory, type WeaponId } from "@/game/data";
import WeaponVisual from "./WeaponVisual";

export default function Armory({
  inventory,
  onChange,
  onClose,
  onLoadout,
}: {
  inventory: Inventory;
  onChange: (value: Inventory) => void;
  onClose: () => void;
  onLoadout: () => void;
}) {
  const [selected, setSelected] = useState<WeaponId>("M416");
  const [category, setCategory] = useState("ALL");
  const [search, setSearch] = useState("");
  const weapon = WEAPONS[selected];
  const owned = inventory.weapons.some((item) => item.id === selected);
  const list = (Object.keys(WEAPONS) as WeaponId[]).filter(
    (id) =>
      (category === "ALL" ||
        (category === "RIFLES"
          ? ["ASSAULT RIFLE", "SNIPER RIFLE", "DMR", "LMG"].includes(
              WEAPONS[id].category,
            )
          : category === WEAPONS[id].category)) &&
      WEAPONS[id].name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="armory-content">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">
            <span className="tiny-line" /> THE RIGHT TOOL FOR THE JOB
          </span>
          <h2>
            THE ARMORY<span className="heading-dot">.</span>
          </h2>
          <p>Know your weapon. Own the battleground.</p>
        </div>
        <button
          className="icon-button close-button"
          aria-label="Close armory"
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </div>
      <div className="armory-layout">
        <aside className="armory-browser">
          <label className="weapon-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a weapon"
              aria-label="Search weapons"
            />
          </label>
          <div className="armory-filters">
            {["ALL", "RIFLES", "SMG", "SHOTGUN", "SIDEARM"].map((item) => (
              <button
                key={item}
                className={category === item ? "selected" : ""}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="armory-list">
            {list.length ? (
              list.map((id) => (
                <button
                  className={id === selected ? "selected" : ""}
                  key={id}
                  onClick={() => setSelected(id)}
                >
                  <div>
                    <strong>{WEAPONS[id].name}</strong>
                    <span>{WEAPONS[id].category}</span>
                  </div>
                  <ChevronRight size={17} />
                </button>
              ))
            ) : (
              <p className="no-results">No weapons match your search.</p>
            )}
          </div>
        </aside>
        <div className="armory-preview">
          <div className="section-label">
            <span>{weapon.category}</span>
            <span>{weapon.caliber}</span>
          </div>
          <WeaponVisual id={selected} />
          <h3>{weapon.name}</h3>
          <p className="armory-description">
            {weapon.category === "SNIPER RIFLE"
              ? "Precision at a distance. A single well-placed shot can change everything."
              : weapon.category === "SMG"
                ? "Fast handling, controlled recoil. Built for close-quarters encounters."
                : weapon.category === "SHOTGUN"
                  ? "Devastating stopping power when the fight gets up close and personal."
                  : "Dependable firepower for whatever lies beyond the next ridgeline."}
          </p>
          <div className="weapon-stats">
            {[
              ["DAMAGE", weapon.damage],
              ["RANGE", weapon.range],
              ["STABILITY", weapon.stability],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <div>
                  <i style={{ width: `${value}%` }} />
                </div>
                <b>{value}</b>
              </div>
            ))}
          </div>
          <p className="scope-compatibility">
            <Crosshair size={16} /> ALL 6 OPTICS COMPATIBLE
          </p>
          <div className="armory-preview-actions">
            <button
              className={`amber-button small ${owned ? "owned" : ""}`}
              disabled={owned}
              onClick={() =>
                onChange({
                  ...inventory,
                  weapons: [
                    ...inventory.weapons,
                    {
                      uid: crypto.randomUUID(),
                      id: selected,
                      mag: weapon.mag,
                      scope: null,
                    },
                  ],
                })
              }
            >
              {owned ? (
                <>
                  <Check size={17} /> IN YOUR LOADOUT
                </>
              ) : (
                <>
                  ADD TO BACKPACK <ArrowRight size={17} />
                </>
              )}
            </button>
            <button className="text-button" onClick={onLoadout}>
              MANAGE LOADOUT <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
