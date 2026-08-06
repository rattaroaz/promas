import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MainMenu, MainAction } from "./screens/MainMenu";
import { ProcessRouter } from "./screens/flow/ProcessRouter";
import { MaterialBrowse, MaterialSort } from "./screens/MaterialBrowse";
import { WagesReport } from "./screens/WagesReport";
import { ReportsScreen } from "./screens/ReportsScreen";
import { MiscScreen } from "./screens/MiscScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SubMenu } from "./screens/SubMenu";
import { UpdateDialog } from "./components/UpdateDialog";
import {
  log,
  metrics,
  setCurrentScreen,
} from "./lib/observability";
import { APP_NAME, APP_VERSION } from "./lib/constants";
import "./App.css";

/**
 * Original PROMAS menu tree (functionally identical):
 *
 *   Property Management System
 *    1 Estimate Process      → Company → Property → Proposal
 *    2 Work Order Process    → Company → Property → Orders
 *    3 Invoice Process       → Company → Property → Invoices
 *    4 Cash Receipts Process → Company → Property → Ledger/Pay
 *    5 Material Process      → sub-menu
 *    6 Reports Menu          → sub-menu
 *    7 Miscellaneous         → Change System Date / Reindex / Form Management
 *    8 Settings              → modern only (import/backup/db) — leave alone
 *    Quit (Y/N)
 */
type Screen =
  | { name: "main" }
  | { name: "estimate" }
  | { name: "workorder" }
  | { name: "invoice" }
  | { name: "cash" }
  | { name: "material" }
  | { name: "material-browse"; sort: MaterialSort }
  | { name: "wages" }
  | { name: "reports" }
  | { name: "misc" }
  | { name: "settings" };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "main" });

  useEffect(() => {
    log.info("app", "session start", {
      app: APP_NAME,
      version: APP_VERSION,
    });
    metrics.inc("app.session_start");
  }, []);

  useEffect(() => {
    setCurrentScreen(screen.name);
    log.info("ui", `navigate → ${screen.name}`);
    metrics.inc("ui.navigate", { screen: screen.name });
  }, [screen.name]);

  function goMain() {
    setScreen({ name: "main" });
  }

  async function handleMain(action: MainAction) {
    log.debug("ui", `main action=${action}`);
    switch (action) {
      case "estimate":
        setScreen({ name: "estimate" });
        break;
      case "workorder":
        setScreen({ name: "workorder" });
        break;
      case "invoice":
        setScreen({ name: "invoice" });
        break;
      case "cash":
        setScreen({ name: "cash" });
        break;
      case "material":
        setScreen({ name: "material" });
        break;
      case "reports":
        setScreen({ name: "reports" });
        break;
      case "misc":
        setScreen({ name: "misc" });
        break;
      case "settings":
        setScreen({ name: "settings" });
        break;
      case "quit":
        log.info("app", "quit requested");
        try {
          await getCurrentWindow().close();
        } catch {
          window.close();
        }
        break;
    }
  }

  return (
    <div className="dos-app">
      <UpdateDialog />
      {screen.name === "main" && <MainMenu onSelect={handleMain} />}

      {screen.name === "estimate" && (
        <ProcessRouter process="estimate" onBack={goMain} />
      )}
      {screen.name === "workorder" && (
        <ProcessRouter process="workorder" onBack={goMain} />
      )}
      {screen.name === "invoice" && (
        <ProcessRouter process="invoice" onBack={goMain} />
      )}
      {screen.name === "cash" && (
        <ProcessRouter process="cash" onBack={goMain} />
      )}

      {screen.name === "material" && (
        <SubMenu
          title=" Material Process "
          items={[
            {
              id: "trans",
              num: "1",
              label: "Material Transaction (Add,Modification)",
            },
            {
              id: "worker",
              num: "2",
              label: "Material Transaction in Worker No",
            },
            {
              id: "date",
              num: "3",
              label: "Material Transaction in Date",
            },
            {
              id: "desc",
              num: "4",
              label: "Material Transaction in Descript",
            },
            {
              id: "wages",
              num: "5",
              label: "Worker Wages Calculation",
            },
          ]}
          onBack={goMain}
          onSelect={(id) => {
            if (id === "wages") setScreen({ name: "wages" });
            else if (id === "worker")
              setScreen({ name: "material-browse", sort: "worker" });
            else if (id === "date")
              setScreen({ name: "material-browse", sort: "date" });
            else if (id === "desc")
              setScreen({ name: "material-browse", sort: "desc" });
            else setScreen({ name: "material-browse", sort: "default" });
          }}
        />
      )}

      {screen.name === "material-browse" && (
        <MaterialBrowse
          sort={screen.sort}
          onBack={() => setScreen({ name: "material" })}
        />
      )}

      {screen.name === "wages" && (
        <WagesReport onBack={() => setScreen({ name: "material" })} />
      )}

      {screen.name === "reports" && <ReportsScreen onBack={goMain} />}

      {screen.name === "misc" && <MiscScreen onBack={goMain} />}

      {screen.name === "settings" && <SettingsScreen onBack={goMain} />}
    </div>
  );
}
