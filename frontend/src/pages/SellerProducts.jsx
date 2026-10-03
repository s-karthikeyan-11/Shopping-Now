import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { getProductImage, setProductImageFallback } from '../utils/productImage';

const emptyForm = {
  name: '', description: '', category: '', image: '',
  price: '', discountPercent: 0, gstPercent: 0, stock: '', lowStockThreshold: 5,
};

const SellerProducts = () => {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.get('/products/seller/me').then(({ data }) => setProducts(data));

  useEffect(() => {
    load();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const startEdit = (p) => {
    setEditingId(p._id);
    setForm({
      name: p.name,
      description: p.description,
      category: p.category,
      image: p.image,
      price: p.price,
      discountPercent: p.discountPercent,
      gstPercent: p.gstPercent,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const payload = {
      ...form,
      price: Number(form.price),
      discountPercent: Number(form.discountPercent),
      gstPercent: Number(form.gstPercent),
      stock: Number(form.stock),
      lowStockThreshold: Number(form.lowStockThreshold),
    };

    try {
      if (editingId) {
        await api.put(`/products/seller/${editingId}`, payload);
      } else {
        await api.post('/products/seller', payload);
      }
      cancelEdit();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save product');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Archive this product?')) return;
    await api.delete(`/products/seller/${id}`);
    load();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Seller portal</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Inventory</h1>
          </div>
          <Link to="/seller" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Back to dashboard
          </Link>
        </div>

        <form className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">{editingId ? 'Edit product' : 'Add new product'}</h2>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Live catalog</span>
          </div>

          {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</div>}

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Name</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-500 focus:bg-white" name="name" value={form.name} onChange={handleChange} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Category</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-500 focus:bg-white" name="category" value={form.category} onChange={handleChange} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Price</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-500 focus:bg-white" type="number" min="0" step="0.01" name="price" value={form.price} onChange={handleChange} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Stock</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-500 focus:bg-white" type="number" min="0" name="stock" value={form.stock} onChange={handleChange} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Discount %</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-500 focus:bg-white" type="number" min="0" max="100" name="discountPercent" value={form.discountPercent} onChange={handleChange} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">GST %</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-500 focus:bg-white" type="number" min="0" max="100" name="gstPercent" value={form.gstPercent} onChange={handleChange} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Low stock threshold</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-500 focus:bg-white" type="number" min="0" name="lowStockThreshold" value={form.lowStockThreshold} onChange={handleChange} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Image URL</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-500 focus:bg-white" type="url" name="image" value={form.image} onChange={handleChange} />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <img src={getProductImage(form)} onError={setProductImageFallback} alt="Product preview" className="h-16 w-16 rounded-lg object-cover" />
            <p className="text-sm text-slate-600">Preview</p>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Description</label>
            <textarea className="min-h-[120px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-500 focus:bg-white" name="description" value={form.description} onChange={handleChange} />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="rounded-xl bg-emerald-600 px-4 py-2.5 font-medium text-white shadow-sm hover:bg-emerald-500" type="submit">{editingId ? 'Save changes' : 'Add product'}</button>
            {editingId && <button className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-100" type="button" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Item</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Price</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Stock</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {products.map((p) => (
                <tr key={p._id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img src={getProductImage(p)} onError={setProductImageFallback} alt={p.name} className="h-12 w-12 rounded-lg object-cover" />
                      <div>
                        <p className="font-semibold text-slate-800">{p.name}</p>
                        <p className="text-sm text-slate-500">{p.category || 'General'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">₹{Number(p.price || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${p.stock <= p.lowStockThreshold ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {p.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                      {p.isActive ? 'Active' : 'Archived'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button type="button" className="text-sm font-medium text-sky-700" onClick={() => startEdit(p)}>Edit</button>
                      <button type="button" className="text-sm font-medium text-rose-600" onClick={() => handleDelete(p._id)}>Archive</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SellerProducts;
