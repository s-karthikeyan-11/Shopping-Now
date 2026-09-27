import React, { useEffect, useState } from 'react';
import api from '../../api/axios';

const emptyForm = {
  name: '', description: '', category: '', image: '',
  price: '', discountPercent: 0, gstPercent: 0, stock: '', lowStockThreshold: 5,
};

const AdminProducts = () => {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.get('/admin/products').then(({ data }) => setProducts(data));

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
      name: p.name, description: p.description, category: p.category, image: p.image,
      price: p.price, discountPercent: p.discountPercent, gstPercent: p.gstPercent,
      stock: p.stock, lowStockThreshold: p.lowStockThreshold,
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
        await api.put(`/admin/products/${editingId}`, payload);
      } else {
        await api.post('/admin/products', payload);
      }
      cancelEdit();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save product');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    await api.delete(`/admin/products/${id}`);
    load();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-900">Products</h2>
      </div>

      <form className="mb-8 rounded-[24px] border border-slate-200 bg-slate-50 p-5 shadow-sm" onSubmit={handleSubmit}>
        <h3 className="text-xl font-semibold text-slate-900">{editingId ? 'Edit product' : 'Add product'}</h3>
        {error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</div>}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input className="input" name="name" placeholder="Name" value={form.name} onChange={handleChange} required />
          <input className="input" name="category" placeholder="Category" value={form.category} onChange={handleChange} />
          <input className="input" name="price" type="number" min="0" step="0.01" placeholder="Price" value={form.price} onChange={handleChange} required />
          <input className="input" name="discountPercent" type="number" min="0" max="100" placeholder="Discount %" value={form.discountPercent} onChange={handleChange} />
          <input className="input" name="gstPercent" type="number" min="0" max="100" placeholder="GST %" value={form.gstPercent} onChange={handleChange} />
          <input className="input" name="stock" type="number" min="0" placeholder="Stock" value={form.stock} onChange={handleChange} required />
          <input className="input" name="lowStockThreshold" type="number" min="0" placeholder="Low stock threshold" value={form.lowStockThreshold} onChange={handleChange} />
          <input className="input" name="image" placeholder="Image URL (optional)" value={form.image} onChange={handleChange} />
        </div>
        <textarea className="input mt-3 min-h-[100px]" name="description" placeholder="Description" value={form.description} onChange={handleChange} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" type="submit">{editingId ? 'Save changes' : 'Add product'}</button>
          {editingId && <button className="btn btn-outline" type="button" onClick={cancelEdit}>Cancel</button>}
        </div>
      </form>

      <div className="overflow-hidden rounded-[24px] border border-slate-200">
        <table className="w-full border-collapse bg-white">
          <thead>
            <tr>
              <th className="table-th">Name</th><th className="table-th">Price</th><th className="table-th">Discount</th>
              <th className="table-th">GST</th><th className="table-th">Final</th><th className="table-th">Stock</th>
              <th className="table-th">Active</th><th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p._id}>
                <td className="table-td">{p.name}</td>
                <td className="table-td">₹{Number(p.price || 0).toFixed(2)}</td>
                <td className="table-td">{p.discountPercent}%</td>
                <td className="table-td">{p.gstPercent}%</td>
                <td className="table-td">₹{Number(p.finalPrice || 0).toFixed(2)}</td>
                <td className={`table-td ${p.stock <= p.lowStockThreshold ? 'text-rose-600' : ''}`}>{p.stock}</td>
                <td className="table-td">{p.isActive ? 'Yes' : 'No'}</td>
                <td className="table-td">
                  <div className="flex gap-3">
                    <button className="link-btn" onClick={() => startEdit(p)}>Edit</button>
                    <button className="link-btn text-rose-600" onClick={() => handleDelete(p._id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminProducts;
