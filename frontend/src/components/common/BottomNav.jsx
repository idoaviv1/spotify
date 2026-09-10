import { useLocation, useNavigate } from 'react-router-dom';
import {
  IconHome,
  IconSearch,
  IconLibrary,
  IconSettings,
  IconShield,
} from './Icons';
import useAuthStore from '../../stores/authStore';
import useI18nStore from '../../stores/i18nStore';

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const t = useI18nStore((s) => s.t);

  const navItems = [
    { path: '/', label: t('nav.home'), icon: IconHome },
    { path: '/search', label: t('nav.search'), icon: IconSearch },
    { path: '/library', label: t('nav.library'), icon: IconLibrary },
    ...(isAdmin ? [{ path: '/admin', label: t('nav.admin'), icon: IconShield }] : []),
    { path: '/settings', label: t('nav.settings'), icon: IconSettings },
  ];

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);

        return (
          <button
            key={item.path}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
            aria-label={item.label}
          >
            <Icon size={24} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
