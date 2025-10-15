import { useState } from 'react';
import Button from '../components/controls/Button';
import ButtonGroup from '../components/controls/ButtonGroup';
import Breadcrumbs from '../components/nav/Breadcrumbs';
import Pagination from '../components/nav/Pagination';
import DropdownMenu, { type DropdownItem } from '../components/overlays/Dropdown';
import Tooltip from '../components/overlays/Tooltip';
import ThemeSwitch from '../components/theme/ThemeSwitch';

const buttonVariants: Array<{ variant: Parameters<typeof Button>[0]['variant']; label: string; icon?: Parameters<typeof Button>[0]['leadingIcon'] }> = [
  { variant: 'primary', label: 'Primary', icon: ['fas', 'play'] },
  { variant: 'secondary', label: 'Secondary', icon: ['fas', 'rotate-right'] },
  { variant: 'danger', label: 'Danger', icon: ['fas', 'stop'] },
  { variant: 'outline', label: 'Outline', icon: ['fas', 'filter'] },
  { variant: 'link', label: 'Link', icon: ['fas', 'magnifying-glass'] },
];

export default function UIKit() {
  const [currentPage, setCurrentPage] = useState(2);
  const [dropdownSelection, setDropdownSelection] = useState<DropdownItem | null>(null);

  return (
    <div className="d-flex flex-column gap-4">
      <section className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
        <div>
          <h1 className="h3 mb-1">UI Kit — Sprint M1/M2</h1>
          <p className="text-muted mb-0">
            Showcase dos componentes base (Bootstrap 5 + Font Awesome) com tokens e tema Light/Dark aplicados.
          </p>
        </div>
        <ThemeSwitch />
      </section>

      <section className="card shadow-sm">
        <div className="card-body d-flex flex-column gap-3">
          <h2 className="h5 mb-0">Buttons</h2>
          <div className="d-flex flex-wrap gap-2">
            {buttonVariants.map((button) => (
              <Button key={button.variant} variant={button.variant} leadingIcon={button.icon}>
                {button.label}
              </Button>
            ))}
            <Button variant="primary" loading>
              Loading
            </Button>
            <Button variant="outline" disabled>
              Disabled
            </Button>
          </div>
        </div>
      </section>

      <section className="card shadow-sm">
        <div className="card-body d-flex flex-column gap-3">
          <h2 className="h5 mb-0">Button group</h2>
          <ButtonGroup
            ariaLabel="Toolbar"
            actions={[
              { id: 'add', variant: 'primary', leadingIcon: ['fas', 'plus'], children: 'Adicionar' },
              { id: 'edit', variant: 'outline', leadingIcon: ['fas', 'pen'], children: 'Editar' },
              { id: 'delete', variant: 'danger', leadingIcon: ['fas', 'trash'], children: 'Excluir' },
            ]}
          />
        </div>
      </section>

      <section className="card shadow-sm">
        <div className="card-body d-flex flex-column gap-3">
          <h2 className="h5 mb-0">Dropdown & tooltip</h2>
          <div className="d-flex flex-wrap gap-3 align-items-center">
            <DropdownMenu
              toggleLabel={dropdownSelection ? dropdownSelection.label : 'Selecione um status'}
              items={[
                { id: 'all', label: 'Todos', icon: ['far', 'circle'] },
                { id: 'active', label: 'Ativos', icon: ['fas', 'play'] },
                { id: 'paused', label: 'Pausados', icon: ['fas', 'stop'] },
              ]}
              onSelect={(item) => setDropdownSelection(item)}
            />
            <Tooltip content="Tooltip com Bootstrap 5" placement="end">
              <Button variant="outline" leadingIcon={['fas', 'circle-info']}>
                Hover me
              </Button>
            </Tooltip>
          </div>
        </div>
      </section>

      <section className="card shadow-sm">
        <div className="card-body d-flex flex-column gap-3">
          <h2 className="h5 mb-0">Breadcrumbs & Pagination</h2>
          <Breadcrumbs
            items={[
              { label: 'Início', href: '/dashboard' },
              { label: 'UI Kit', href: '/uikit' },
              { label: 'Componentes' },
            ]}
          />
          <Pagination currentPage={currentPage} totalPages={7} onChange={(page) => setCurrentPage(page)} />
        </div>
      </section>

      <section className="card shadow-sm">
        <div className="card-body">
          <h2 className="h5 mb-3">Snippet — ThemeSwitch</h2>
          <pre className="bg-body-secondary rounded p-3 small mb-0">
            {`import ThemeSwitch from '../components/theme/ThemeSwitch';

<header className="d-flex gap-2 align-items-center">
  <ThemeSwitch />
</header>`}
          </pre>
        </div>
      </section>
    </div>
  );
}
