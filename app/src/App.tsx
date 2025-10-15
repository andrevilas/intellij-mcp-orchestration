import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useMemo } from 'react';

import AppShell from './components/layout/AppShell';
import type { BreadcrumbItem } from './components/nav/Breadcrumbs';
import { ThemeProvider } from './components/theme/ThemeProvider';
import Dashboard from './pages/Dashboard';
import FinOps from './pages/FinOps';
import Keys from './pages/Keys';
import Policies from './pages/Policies';
import Routing from './pages/Routing';
import Servers from './pages/Servers';
import UIKit from './pages/UIKit';

interface RouteDefinition {
  path: string;
  element: JSX.Element;
  breadcrumbs: BreadcrumbItem[];
}

const routeDefinitions: RouteDefinition[] = [
  {
    path: '/dashboard',
    element: <Dashboard />, 
    breadcrumbs: [
      { label: 'Início', href: '/dashboard' },
      { label: 'Dashboard' },
    ],
  },
  {
    path: '/servers',
    element: <Servers />, 
    breadcrumbs: [
      { label: 'Início', href: '/dashboard' },
      { label: 'Servers' },
    ],
  },
  {
    path: '/keys',
    element: <Keys />, 
    breadcrumbs: [
      { label: 'Início', href: '/dashboard' },
      { label: 'Keys' },
    ],
  },
  {
    path: '/policies',
    element: <Policies />, 
    breadcrumbs: [
      { label: 'Início', href: '/dashboard' },
      { label: 'Policies' },
    ],
  },
  {
    path: '/routing',
    element: <Routing />, 
    breadcrumbs: [
      { label: 'Início', href: '/dashboard' },
      { label: 'Routing' },
    ],
  },
  {
    path: '/finops',
    element: <FinOps />, 
    breadcrumbs: [
      { label: 'Início', href: '/dashboard' },
      { label: 'FinOps' },
    ],
  },
  {
    path: '/uikit',
    element: <UIKit />, 
    breadcrumbs: [
      { label: 'Início', href: '/dashboard' },
      { label: 'UI Kit' },
    ],
  },
];

function AppRoutes() {
  const location = useLocation();
  const currentRoute = useMemo(
    () => routeDefinitions.find((route) => route.path === location.pathname),
    [location.pathname],
  );

  const breadcrumbs = currentRoute?.breadcrumbs ?? [
    { label: 'Início', href: '/dashboard' },
  ];

  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <Routes>
        {routeDefinitions.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ThemeProvider>
  );
}
