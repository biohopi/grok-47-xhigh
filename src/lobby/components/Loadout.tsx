import {
  ArrowLeftRight,
  Backpack,
  Check,
  ChevronDown,
  Crosshair,
  Infinity as InfinityIcon,
  Package,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  attachScope,
  equipWeapon,
  SCOPE_IDS,
  WEAPONS,
  type Inventory,
  type ScopeId,
} from "@/game/data";
import WeaponVisual from "./WeaponVisual";

interface Props {
  inventory: Inventory;
  onChange: (inventory: Inventory) => void;
  onClose: () => void;
}

export default function Loadout({ inventory, onChange, onClose }: Props) {
  const [filter, setFilter] = useState<"weapons" | "equipment">("weapons");
  const stash = inventory.weapons.filter(
    (item) => !inventory.main.includes(item.uid),
  );
  return (
    <section className="loadout-content">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">
            <span className="tiny-line" /> PREPARE FOR CONTACT
          </span>
          <h2>
            YOUR LOADOUT<span className="heading-dot">.</span>
          </h2>
          <p>Two at the ready. Everything else on your back.</p>
        </div>
        <button
          className="icon-button close-button"
          onClick={onClose}
          aria-label="Close loadout"
        >
          <X size={22} />
        </button>
      </div>
      <div className="loadout-grid">
        <div className="primary-loadout">
          <div className="section-label">
            <span>MAIN WEAPONS</span>
            <button
              className="text-button"
              onClick={() =>
                onChange({
                  ...inventory,
                  active: inventory.active === 0 ? 1 : 0,
                })
              }
            >
              <ArrowLeftRight size={13} /> SWITCH ACTIVE
            </button>
          </div>
          {inventory.main.map((uid, slot) => {
            const item = inventory.weapons.find((weapon) => weapon.uid === uid);
            if (!item)
              return (
                <div className="empty-weapon" key={slot}>
                  SLOT {slot + 1} <span>Equip a weapon from your backpack</span>
                </div>
              );
            const weapon = WEAPONS[item.id];
            return (
              <article
                className={`equipped-weapon ${inventory.active === slot ? "is-active" : ""}`}
                key={slot}
              >
                <div className="weapon-topline">
                  <span className="slot-number">0{slot + 1}</span>
                  <span>{slot === 0 ? "PRIMARY" : "SECONDARY"}</span>
                  {inventory.active === slot && (
                    <span className="active-label">
                      <span /> ACTIVE
                    </span>
                  )}
                  <span className="weapon-caliber">{weapon.caliber}</span>
                </div>
                <WeaponVisual id={item.id} />
                <div className="weapon-bottomline">
                  <div>
                    <h3>{weapon.name}</h3>
                    <span>{weapon.category}</span>
                  </div>
                  <label className="scope-select">
                    <Crosshair size={15} />
                    <select
                      aria-label={`Scope for ${weapon.name}`}
                      value={item.scope || ""}
                      onChange={(e) =>
                        onChange(
                          attachScope(
                            inventory,
                            item.uid,
                            (e.target.value || null) as ScopeId | null,
                          ),
                        )
                      }
                    >
                      <option value="">Iron sights</option>
                      {SCOPE_IDS.filter(
                        (scope) =>
                          inventory.scopes.includes(scope) ||
                          scope === item.scope,
                      ).map((scope) => (
                        <option key={scope} value={scope}>
                          {scope} scope
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={13} />
                  </label>
                </div>
              </article>
            );
          })}
          <p className="loadout-note">
            <ShieldCheck size={14} /> Switching weapons only cycles between
            these two slots.
          </p>
        </div>
        <div className="backpack-panel">
          <div className="section-label">
            <span>
              <Backpack size={16} /> FIELD BACKPACK
            </span>
            <span className="capacity">
              <InfinityIcon size={16} /> UNLIMITED
            </span>
          </div>
          <div className="backpack-tabs">
            <button
              className={filter === "weapons" ? "selected" : ""}
              onClick={() => setFilter("weapons")}
            >
              WEAPONS <span>{stash.length}</span>
            </button>
            <button
              className={filter === "equipment" ? "selected" : ""}
              onClick={() => setFilter("equipment")}
            >
              EQUIPMENT <span>{inventory.scopes.length + inventory.heals}</span>
            </button>
          </div>
          <div className="backpack-items">
            {filter === "weapons" ? (
              <>
                {stash.length ? (
                  stash.map((item) => (
                    <div className="stash-weapon" key={item.uid}>
                      <WeaponVisual id={item.id} />
                      <div className="stash-info">
                        <h4>{WEAPONS[item.id].name}</h4>
                        <span>
                          {WEAPONS[item.id].caliber}{" "}
                          {item.scope ? `/ ${item.scope}` : ""}
                        </span>
                      </div>
                      <div className="equip-actions">
                        <span>EQUIP TO</span>
                        <div>
                          {[0, 1].map((slot) => (
                            <button
                              key={slot}
                              aria-label={`Equip ${WEAPONS[item.id].name} to slot ${slot + 1}`}
                              onClick={() =>
                                onChange(equipWeapon(inventory, item.uid, slot))
                              }
                            >
                              {slot + 1}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-stash">
                    <Package size={34} />
                    <p>Room for whatever you find.</p>
                    <span>Pick up weapons in a match to store them here.</span>
                  </div>
                )}
                <div className="backpack-hint">
                  <Backpack size={25} />
                  <p>
                    Loot without leaving anything behind.
                    <span>
                      Equipping a new weapon safely stows the old one.
                    </span>
                  </p>
                </div>
              </>
            ) : (
              <div className="equipment-list">
                {SCOPE_IDS.map((scope) => {
                  const count = inventory.scopes.filter(
                    (item) => item === scope,
                  ).length;
                  return count > 0 ? (
                    <div className="equipment-item" key={scope}>
                      <Crosshair size={23} />
                      <div>
                        <h4>{scope} scope</h4>
                        <span>Compatible with all weapons</span>
                      </div>
                      <b>{count}</b>
                    </div>
                  ) : null;
                })}
                <div className="equipment-item">
                  <Package size={23} />
                  <div>
                    <h4>First aid kit</h4>
                    <span>Restores 50 health</span>
                  </div>
                  <b>{inventory.heals}</b>
                </div>
                <div className="equipment-item">
                  <Package size={23} />
                  <div>
                    <h4>Ammunition</h4>
                    <span>Light / Heavy / Shells</span>
                  </div>
                  <b>
                    {inventory.ammo.light +
                      inventory.ammo.heavy +
                      inventory.ammo.shell}
                  </b>
                </div>
              </div>
            )}
          </div>
          <div className="backpack-bottom">
            <Check size={13} /> LOADOUT AUTO-SAVED
          </div>
        </div>
      </div>
      <div className="panel-footer">
        <span>
          <kbd>1</kbd>
          <kbd>2</kbd> Select main weapon <i />
          <kbd>B</kbd> Backpack
        </span>
        <button className="amber-button small" onClick={onClose}>
          READY TO GO <Check size={17} />
        </button>
      </div>
    </section>
  );
}
