import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const linkClass = ({ isActive }) =>
  `flex items-center rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
    isActive
      ? 'bg-slate-900 text-white shadow-sm'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

const AdminLayout = () => (
  <div className="section-shell py-10 sm:py-12">
    <div className="mb-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Admin panel</p>
      <h1 className="mt-2 text-4xl font-bold text-slate-900">Operations dashboard</h1>
    </div>

    <div className="grid gap-8 xl:grid-cols-[220px_1fr]">
      <aside className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm">
        <nav className="flex flex-wrap gap-2 xl:flex-col">
          <NavLink to="/admin" end className={linkClass}>Dashboard</NavLink>
          <NavLink to="/admin/products" className={linkClass}>Products</NavLink>
          <NavLink to="/admin/orders" className={linkClass}>Orders</NavLink>
          <NavLink to="/admin/users" className={linkClass}>Users</NavLink>
        </nav>
      </aside>

      <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <Outlet />
      </div>
    </div>
  </div>
);

export default AdminLayout;
