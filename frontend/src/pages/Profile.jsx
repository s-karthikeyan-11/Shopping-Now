import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreditCard, Heart, LogOut, MapPin, Package, Settings, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [walletBalance, setWalletBalance] = useState(0);
  useEffect(() => {
    api.get('/wallet').then(({ data }) => setWalletBalance(data.balance)).catch(() => {});
  }, []);
  const links = [
    { label: 'Orders', detail: 'View and track your purchases', to: '/orders', icon: Package },
    ...(user?.role !== 'admin' ? [{ label: 'Wishlist', detail: 'Your saved products', to: '/wishlist', icon: Heart }] : []),
    { label: 'Addresses', detail: 'Your latest delivery address', to: '/checkout', icon: MapPin },
    { label: 'Payment methods', detail: 'Choose a method at checkout', to: '/checkout', icon: CreditCard },
    ...(user?.role === 'seller' ? [{ label: 'Seller dashboard', detail: 'Manage inventory and orders', to: '/seller', icon: Settings }] : []),
    ...(user && user.role !== 'admin' && user.role !== 'seller' ? [{ label: 'Become a seller', detail: 'Open your storefront', to: '/seller/apply', icon: Settings }] : []),
    { label: 'Settings', detail: 'Account preferences', to: '/profile', icon: Settings },
  ];
  const handleLogout = () => { logout(); navigate('/'); };

  return <div className="section-shell py-8 sm:py-12">
    <div className="mb-8"><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Your account</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Profile</h1></div>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex sm:items-center sm:gap-5 sm:p-7">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800"><UserRound size={28} /></div>
      <div className="mt-4 min-w-0 sm:mt-0"><h2 className="text-xl font-bold">{user?.name}</h2><p className="mt-1 break-all text-sm text-slate-500">{user?.email}</p><p className="mt-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">{user?.role === 'admin' ? 'Administrator' : 'Shop member'}</p></div>
      <button onClick={handleLogout} className="btn btn-outline mt-5 gap-2 sm:ml-auto sm:mt-0"><LogOut size={16} />Log out</button>
    </section>
    <section className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <div><p className="text-sm font-semibold text-emerald-900">Cashback wallet</p><p className="mt-1 text-xs text-emerald-800">Promotional cashback is credited after delivery.</p></div>
      <strong className="text-xl text-emerald-900">₹{Number(walletBalance).toFixed(2)}</strong>
    </section>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {links.map(({ label, detail, to, icon: Icon }) => <Link key={label} to={to} className="group flex min-h-28 items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-emerald-700 hover:shadow-sm"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-emerald-50 group-hover:text-emerald-800"><Icon size={19} /></span><span><span className="block font-semibold text-slate-900">{label}</span><span className="mt-1 block text-sm text-slate-500">{detail}</span></span></Link>)}
    </div>
  </div>;
};

export default Profile;
