import { NavLink, Outlet, Route, Routes, useLocation } from "react-router";
import { Icon, type IconName } from "./components/Icon";
import { Empty } from "./components/States";
import { useAlerts } from "./lib/api";
import { AboutPage } from "./pages/AboutPage";
import { AlertsPage } from "./pages/AlertsPage";
import { LinePage } from "./pages/LinePage";
import { LinesPage } from "./pages/LinesPage";
import { MapPage } from "./pages/MapPage";
import { StationPage } from "./pages/StationPage";
import { StopsPage } from "./pages/StopsPage";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Carte", icon: "map" },
  { to: "/arrets", label: "Arrêts", icon: "stop" },
  { to: "/lignes", label: "Lignes", icon: "lines" },
  { to: "/info-trafic", label: "Info trafic", icon: "alert" },
  { to: "/a-propos", label: "À propos", icon: "info" },
];

function Layout() {
  const { data: alerts } = useAlerts();
  const activeAlerts = alerts?.alerts.filter((a) => a.isActive && a.scope === "network").length ?? 0;
  const { pathname } = useLocation();
  const isMap = pathname === "/";

  return (
    <div className={`app ${isMap ? "app--map" : ""}`}>
      <a href="#main" className="skip-link">
        Aller au contenu
      </a>
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Bus Hub Aubagne, accueil">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>
            Bus Hub <small>Aubagne</small>
          </span>
        </NavLink>
        <nav className="nav" aria-label="Navigation principale">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className="nav__link">
              <span className="nav__icon">
                <Icon name={n.icon} />
                {n.to === "/info-trafic" && activeAlerts > 0 && <span className="nav__badge">{activeAlerts}</span>}
              </span>
              <span className="nav__label">{n.label}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="main" className="main">
        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<MapPage />} />
        <Route path="arrets" element={<StopsPage />} />
        <Route path="arrets/:id" element={<StationPage />} />
        <Route path="lignes" element={<LinesPage />} />
        <Route path="lignes/:id" element={<LinePage />} />
        <Route path="info-trafic" element={<AlertsPage />} />
        <Route path="a-propos" element={<AboutPage />} />
        <Route
          path="*"
          element={
            <div className="page">
              <Empty icon="info">Page introuvable.</Empty>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
