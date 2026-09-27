import React, { useEffect, useState } from 'react';
import api from '../../api/axios';

const AdminUsers = () => {
  const [users, setUsers] = useState([]);

  const load = () => api.get('/admin/users').then(({ data }) => setUsers(data));

  useEffect(() => {
    load();
  }, []);

  const toggleBlock = async (id, isBlocked) => {
    await api.put(`/admin/users/${id}/block`, { isBlocked: !isBlocked });
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this user? This cannot be undone.')) return;
    await api.delete(`/admin/users/${id}`);
    load();
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Users</h2>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200">
        <table className="w-full border-collapse bg-white">
          <thead>
            <tr>
              <th className="table-th">Name</th><th className="table-th">Email</th><th className="table-th">Joined</th>
              <th className="table-th">Status</th><th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td className="table-td">{u.name}</td>
                <td className="table-td">{u.email}</td>
                <td className="table-td">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="table-td">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${u.isBlocked ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {u.isBlocked ? 'Blocked' : 'Active'}
                  </span>
                </td>
                <td className="table-td">
                  <div className="flex gap-3">
                    <button className="link-btn" onClick={() => toggleBlock(u._id, u.isBlocked)}>
                      {u.isBlocked ? 'Unblock' : 'Block'}
                    </button>
                    <button className="link-btn text-rose-600" onClick={() => handleDelete(u._id)}>Delete</button>
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

export default AdminUsers;
