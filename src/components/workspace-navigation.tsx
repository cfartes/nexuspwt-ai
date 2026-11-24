'use client';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { Tab } from './workspace';

export type NavigationItem = [Tab, string, LucideIcon];
const groups: [string, string, Tab[]][] = [
  ['operation', 'Operação', ['APR', 'PT', 'approvals']],
  ['structure', 'Estrutura', ['companies', 'regions', 'units', 'contractors']],
  ['people', 'Pessoas', ['people', 'approvers', 'team', 'identity']],
  ['administration', 'Administração', ['account', 'settings', 'audit']],
];

export default function WorkspaceNavigation({
  items,
  active,
  pending,
  onSelect,
}: {
  items: NavigationItem[];
  active: Tab;
  pending: number;
  onSelect: (tab: Tab) => void;
}) {
  const item = ([id, label, Icon]: NavigationItem) => (
    <button
      key={id}
      className={active === id ? 'nav active' : 'nav'}
      aria-current={active === id ? 'page' : undefined}
      onClick={(event) => {
        onSelect(id);
        if (window.matchMedia('(max-width: 760px)').matches)
          event.currentTarget.closest('details')?.removeAttribute('open');
      }}
    >
      <Icon size={19} />
      <span>{label}</span>
      {id === 'approvals' && pending > 0 && <b>{pending}</b>}
    </button>
  );
  return (
    <nav
      aria-label="Menu principal"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          const group = event.currentTarget.querySelector('details[open]');
          group?.querySelector('summary')?.focus();
          group?.removeAttribute('open');
        }
      }}
    >
      {items.filter(([id]) => id === 'overview').map(item)}
      {groups.map(([id, label, tabs]) => {
        const visible = tabs.flatMap((tab) => items.filter(([key]) => key === tab));
        if (!visible.length) return null;
        return (
          <details className="nav-group" name="workspace-menu" key={id}>
            <summary className="nav-group-heading">
              <span>{label}</span>
              <ChevronRight size={16} />
            </summary>
            <div className="nav-group-items">{visible.map(item)}</div>
          </details>
        );
      })}
    </nav>
  );
}
