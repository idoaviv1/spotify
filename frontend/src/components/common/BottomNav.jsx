import { useLocation, useNavigate } from 'react-router-dom';
import {
  IconHome,
  IconSearch,
  IconLibrary,
  IconSettings,
  IconShield,
} from './Icons';
import useAuthStore from '../../stores/authStore';

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const navItems = [
    { path: '/', label: 'Home', icon: IconHome },
    { path: '/search', label: 'Search', icon: IconSearch },
    { path: '/library', label: 'Library', icon: IconLibrary },
    ...(isAdmin ? [{ path: '/admin', label: 'Admin', icon: IconShield }] : []),
    { path: '/settings', label: 'Settings', icon: IconSettings },
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
