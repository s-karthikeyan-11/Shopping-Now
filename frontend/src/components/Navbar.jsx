import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

const navClass = ({ isActive }) =>
  `relative px-2 py-2 text-sm font-medium transition ${
    isActive ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'
  }`;

const Navbar = () => {
  const { user, logout, isAdmin } = useAuth();
  const { items } = useCart();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setIsSidebarOpen(false);
    navigate('/');
  };

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/shop', label: 'Shop' },
    { to: '/#categories', label: 'Categories' },
    ...(user ? [{ to: '/orders', label: 'Orders' }] : []),
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-xl">
        <div className="section-shell flex h-20 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl text-slate-700 shadow-sm transition hover:border-slate-300 lg:hidden"
              onClick={() => setIsSidebarOpen((open) => !open)}
            >
              ☰
            </button>

            <Link to="/" className="text-2xl font-black tracking-tight text-slate-900">
              SHOP-NOW🛒
            </Link>
          </div>

          <nav className="hidden items-center gap-7 lg:flex">
            {navLinks.map((link) => (
              <NavLink key={link.to} to={link.to} className={navClass}>
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button type="button" className="hidden h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg text-slate-700 shadow-sm transition hover:border-slate-300 sm:inline-flex" aria-label="Search">
              ⌕
            </button>
            <button type="button" className="hidden h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg text-slate-700 shadow-sm transition hover:border-slate-300 sm:inline-flex" aria-label="Wishlist">
              ♡
            </button>

            <Link to="/cart" className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg text-slate-700 shadow-sm transition hover:border-slate-300" aria-label="Cart">
              🛒
              {itemCount > 0 && (
                <span className="absolute -right-2 -top-2 inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {itemCount}
                </span>
              )}
            </Link>

            {!user ? (
              <div className="hidden items-center gap-2 sm:flex">
                <Link to="/login" className="btn btn-secondary px-4 py-2.5">Login</Link>
                <Link to="/register" className="btn btn-primary px-4 py-2.5">Sign up</Link>
              </div>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                {isAdmin ? (
                  <Link to="/admin" className="btn btn-secondary px-4 py-2.5">Admin</Link>
                ) : (
                  <Link to="/orders" className="btn btn-secondary px-4 py-2.5">Profile</Link>
                )}
                <button type="button" onClick={handleLogout} className="btn btn-outline px-4 py-2.5">
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={`fixed inset-0 z-50 transition ${isSidebarOpen ? 'pointer-events-auto visible' : 'pointer-events-none invisible'}`}>
        <div
          className={`absolute inset-0 bg-slate-950/45 transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsSidebarOpen(false)}
        />

        <aside
          className={`absolute left-0 top-0 flex h-full w-[82%] max-w-sm flex-col border-r border-slate-200 bg-white p-4 shadow-xl transition-transform duration-300 ease-in-out ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="mb-6 flex items-center justify-between">
            <div className="text-xl font-black tracking-tight text-slate-900">SHOP-NOW🛒</div>
            <button type="button" aria-label="Close menu" className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-700" onClick={() => setIsSidebarOpen(false)}>
              ×
            </button>
          </div>

          <nav className="space-y-1">
            {[
              { to: '/', label: 'Home', icon: '⌂' },
              { to: '/', label: 'Shop', icon: '◫' },
              { to: '/#categories', label: 'Categories', icon: '▣' },
              { to: '/orders', label: 'Orders', icon: '◌' },
              { to: '/login', label: 'Wishlist', icon: '♡' },
              { to: '/orders', label: 'Profile', icon: '◉' },
              ...(isAdmin ? [{ to: '/admin', label: 'Admin Dashboard', icon: '⚑' }] : []),
            ].map((link) => (
              <NavLink
                key={link.label}
                to={link.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-3 text-base font-medium transition ${
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
                onClick={() => setIsSidebarOpen(false)}
              >
                <span>{link.icon}</span>
                {link.label}
              </NavLink>
            ))}

            {!user ? (
              <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
                <Link to="/login" className="btn btn-secondary w-full" onClick={() => setIsSidebarOpen(false)}>Login</Link>
                <Link to="/register" className="btn btn-primary w-full" onClick={() => setIsSidebarOpen(false)}>Create account</Link>
              </div>
            ) : (
              <button type="button" className="btn btn-outline mt-4 w-full" onClick={handleLogout}>
                Logout
              </button>
            )}
          </nav>
        </aside>
      </div>
    </>
  );
};

export default Navbar;
