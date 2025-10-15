import classNames from 'classnames';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import Breadcrumbs, { type BreadcrumbItem } from '../nav/Breadcrumbs';
import ThemeSwitch from '../theme/ThemeSwitch';
import DropdownMenu from '../overlays/Dropdown';
import Tooltip from '../overlays/Tooltip';

const PRIMARY_NAV = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/servers', label: 'Servers' },
  { path: '/keys', label: 'Keys' },
  { path: '/policies', label: 'Policies' },
  { path: '/routing', label: 'Routing' },
  { path: '/finops', label: 'FinOps' },
] as const;

interface AppShellProps {
  children: ReactNode;
  breadcrumbs: BreadcrumbItem[];
}

export default function AppShell({ children, breadcrumbs }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const handleNavigate = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const navItems = useMemo(
    () => (
      <nav className="flex-grow-1 d-flex flex-column gap-3">
        <ul className="nav flex-column gap-1">
          {PRIMARY_NAV.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  classNames('nav-link rounded px-3 py-2', {
                    active: isActive,
                    'text-body': !isActive,
                  })
                }
                aria-current={location.pathname === item.path ? 'page' : undefined}
                onClick={handleNavigate}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="pt-3 border-top">
          <h2 className="fs-6 text-uppercase text-muted mb-2">Dev</h2>
          <NavLink
            to="/uikit"
            className={({ isActive }) =>
              classNames('nav-link px-3 py-2 rounded small', {
                active: isActive,
                'text-muted': !isActive,
              })
            }
            aria-current={location.pathname === '/uikit' ? 'page' : undefined}
            onClick={handleNavigate}
          >
            UI Kit
          </NavLink>
        </div>
      </nav>
    ),
    [handleNavigate, location.pathname],
  );

  return (
    <div className="d-flex min-vh-100 flex-column bg-body">
      <header className="border-bottom bg-body position-sticky top-0 z-3">
        <div className="container-fluid py-2">
          <div className="d-flex align-items-center gap-3">
            <button
              type="button"
              className="btn btn-outline-secondary d-lg-none"
              aria-label={sidebarOpen ? 'Recolher menu lateral' : 'Expandir menu lateral'}
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((previous) => !previous)}
            >
              <FontAwesomeIcon icon={['fas', 'bars']} fixedWidth />
            </button>
            <NavLink to="/dashboard" className="navbar-brand me-auto" onClick={handleNavigate}>
              MCP Console
            </NavLink>
            <form className="d-none d-md-flex" role="search" aria-label="Buscar recursos">
              <div className="input-group">
                <span className="input-group-text bg-transparent border-end-0">
                  <FontAwesomeIcon icon={['fas', 'magnifying-glass']} />
                </span>
                <input
                  type="search"
                  className="form-control border-start-0"
                  placeholder="Buscar servers, policies, FinOps..."
                  aria-label="Buscar"
                />
              </div>
            </form>
            <div className="d-flex align-items-center gap-2">
              <ThemeSwitch />
              <Tooltip content="Central de alertas" placement="bottom">
                <button type="button" className="btn btn-outline-secondary" aria-label="Abrir central de alertas">
                  <FontAwesomeIcon icon={['fas', 'bell']} />
                </button>
              </Tooltip>
              <DropdownMenu
                toggleLabel="Ações"
                items={[
                  {
                    id: 'settings',
                    label: 'Preferências',
                    description: 'Ajustes de layout e sessão',
                    icon: ['fas', 'cog'],
                  },
                  {
                    id: 'support',
                    label: 'Central de suporte',
                    description: 'Abrir documentação e suporte',
                    icon: ['fab', 'slack'],
                  },
                ]}
                onSelect={() => {}}
                align="end"
              />
            </div>
          </div>
        </div>
      </header>
      <div className="d-flex flex-grow-1 position-relative">
        {sidebarOpen && (
          <button
            type="button"
            className="position-fixed top-0 start-0 bottom-0 end-0 bg-black bg-opacity-25 border-0 d-lg-none"
            aria-label="Fechar menu lateral"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="visually-hidden">Fechar menu lateral</span>
          </button>
        )}
        {sidebarOpen && (
          <aside
            className="sidebar bg-body-tertiary border-end p-3 d-flex flex-column gap-2 position-fixed top-0 bottom-0 start-0 w-75 shadow-lg d-lg-none"
            role="navigation"
            aria-label="Menu principal"
          >
            {navItems}
            <div className="mt-auto small text-muted">
              <div>Conectado</div>
              <div className="fw-semibold">workspace@mcp</div>
            </div>
          </aside>
        )}
        <aside
          className="sidebar bg-body-tertiary border-end p-3 d-none d-lg-flex flex-column gap-2 position-sticky top-0 start-0 vh-100"
          role="navigation"
          aria-label="Menu principal"
        >
          {navItems}
          <div className="mt-auto small text-muted">
            <div>Conectado</div>
            <div className="fw-semibold">workspace@mcp</div>
          </div>
        </aside>
        <main className="flex-grow-1 ms-lg-auto w-100">
          <section className="container-fluid py-4">
            <Breadcrumbs items={breadcrumbs} />
            {children}
          </section>
        </main>
      </div>
    </div>
  );
}
