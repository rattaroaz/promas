import { useState } from "react";
import { useDosKeys } from "../dos/hooks";
import { Screen, MENU_KEYS, HelpOverlay } from "../dos/Shell";

export interface MenuItem {
  id: string;
  num: string;
  label: string;
  accel?: string;
}

export function SubMenu({
  title,
  items,
  onSelect,
  onBack,
}: {
  title: string;
  items: MenuItem[];
  onSelect: (id: string) => void;
  onBack: () => void;
}) {
  const [hot, setHot] = useState(0);
  const [help, setHelp] = useState(false);

  useDosKeys({
    onArrowUp: () => setHot((h) => (h <= 0 ? items.length - 1 : h - 1)),
    onArrowDown: () => setHot((h) => (h >= items.length - 1 ? 0 : h + 1)),
    onEnter: () => {
      if (help) setHelp(false);
      else onSelect(items[hot].id);
    },
    onEscape: () => {
      if (help) setHelp(false);
      else onBack();
    },
    onF1: () => setHelp(true),
    onChar: (ch) => {
      if (help) {
        setHelp(false);
        return true;
      }
      const num = items.findIndex((i) => i.num === ch);
      if (num >= 0) {
        setHot(num);
        onSelect(items[num].id);
        return true;
      }
      const acc = items.findIndex(
        (i) => i.accel && i.accel.toLowerCase() === ch.toLowerCase()
      );
      if (acc >= 0) {
        setHot(acc);
        onSelect(items[acc].id);
        return true;
      }
      return false;
    },
  });

  return (
    <Screen
      statusKeys={MENU_KEYS}
      title={title}
      message=""
    >
      <div className="dos-main-wrap">
        <div className="dos-menu-frame">
          <div className="menu-header"> {title} </div>
          <div className="menu-body">
            {items.map((item, i) => (
              <button
                key={item.id}
                className={`dos-menu-item ${i === hot ? "hot" : ""}`}
                onMouseEnter={() => setHot(i)}
                onClick={() => onSelect(item.id)}
              >
                <span className="num">{item.num}.</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
