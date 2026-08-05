import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MainMenu, MainAction } from "./screens/MainMenu";
import { CompanyBrowse } from "./screens/CompanyBrowse";
import { InvoiceBrowse } from "./screens/InvoiceBrowse";
import { CashBrowse } from "./screens/CashBrowse";
import { MaterialBrowse } from "./screens/MaterialBrowse";
import { WorkOrderBrowse } from "./screens/WorkOrderBrowse";
import { ReportsScreen } from "./screens/ReportsScreen";
import { MiscScreen } from "./screens/MiscScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { WorkerBrowse } from "./screens/WorkerBrowse";
import { WorkTypeBrowse } from "./screens/WorkTypeBrowse";
import { SubMenu } from "./screens/SubMenu";
import { UpdateDialog } from "./components/UpdateDialog";
import "./App.css";

/**
 * Screen stack mirrors original PROMAS menu tree:
 *   Main → Process screens / sub-menus → browse/edit
 */
type Screen =
  | { name: "main" }
  | { name: "estimate" }
  | { name: "workorder" }
  | { name: "invoice" }
  | { name: "cash" }
  | { name: "material" }
  | { name: "material-browse" }
  | { name: "reports" }
  | { name: "misc" }
  | { name: "settings" }
  | { name: "workers" }
  | { name: "worktypes" }
  | { name: "companies" };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "main" });

  function goMain() {
    setScreen({ name: "main" });
  }

  async function handleMain(action: MainAction) {
    switch (action) {
      case "estimate":
        // Estimates in original led to company/property browse then proposal
        setScreen({ name: "companies" });
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

      {screen.name === "companies" && (
        <CompanyBrowse onBack={goMain} />
      )}

      {screen.name === "workorder" && (
        <WorkOrderBrowse onBack={goMain} />
      )}

      {screen.name === "invoice" && <InvoiceBrowse onBack={goMain} />}

      {screen.name === "cash" && <CashBrowse onBack={goMain} />}

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
            if (id === "wages") setScreen({ name: "workers" });
            else setScreen({ name: "material-browse" });
          }}
        />
      )}

      {screen.name === "material-browse" && (
        <MaterialBrowse onBack={() => setScreen({ name: "material" })} />
      )}

      {screen.name === "reports" && <ReportsScreen onBack={goMain} />}

      {screen.name === "misc" && (
        <MiscScreen
          onBack={goMain}
          onWorkers={() => setScreen({ name: "workers" })}
          onWorkTypes={() => setScreen({ name: "worktypes" })}
        />
      )}

      {screen.name === "settings" && <SettingsScreen onBack={goMain} />}

      {screen.name === "workers" && (
        <WorkerBrowse
          onBack={() => setScreen({ name: "misc" })}
        />
      )}

      {screen.name === "worktypes" && (
        <WorkTypeBrowse
          onBack={() => setScreen({ name: "misc" })}
        />
      )}
    </div>
  );
}
