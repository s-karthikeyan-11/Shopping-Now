import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import ProductCard from '../components/ProductCard';

const heroImage = 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80';
const categoryImages = {
  Electronics: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80',
  Apparel: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80',
  Footwear: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
  Home: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80',
  General: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=80',
};

const Home = () => {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const load = async (q) => {
    setLoading(true);
    try {
      const { data } = await api.get('/products', { params: q ? { search: q } : {} });
      setProducts(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    load(search);
  };

  const showToast = (name) => {
    setToast(`Added "${name}" to cart`);
    setTimeout(() => setToast(''), 2200);
  };

  const categories = useMemo(() => {
    const map = {};
    products.forEach((product) => {
      const key = product.category || 'General';
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).slice(0, 4);
  }, [products]);

  const featuredProducts = products.slice(0, 4);

  return (
    <div className="pb-20">
      <section className="bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.9),_#f8fafc_55%,_#f1f5f9)]">
        <div className="section-shell py-8 sm:py-12 lg:py-16">
          <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                Fresh arrivals · Curated essentials
              </span>

              <div className="space-y-4">
                <h1 className="max-w-xl text-4xl font-black leading-[1.05] text-slate-900 sm:text-5xl lg:text-6xl">
                  Everything you want.<br />
                  One beautiful store.
                </h1>
                <p className="max-w-xl text-lg text-slate-600">
                  Discover products curated for your everyday life, designed to blend quality, comfort, and effortless style.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <a href="#shop" className="btn btn-primary px-6 py-3 text-base">Shop Now</a>
                <a href="#categories" className="btn btn-secondary px-6 py-3 text-base">Explore Collection</a>
              </div>

              <div className="grid max-w-lg grid-cols-3 gap-4 pt-2">
                {[
                  ['12k+', 'happy customers'],
                  ['4.9/5', 'average rating'],
                  ['48h', 'express delivery'],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-4 shadow-sm">
                    <div className="text-2xl font-bold text-slate-900">{value}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-8 top-8 h-32 w-32 rounded-full bg-amber-200/60 blur-3xl" />
              <div className="absolute -right-10 bottom-4 h-40 w-40 rounded-full bg-sky-200/60 blur-3xl" />
              <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white p-3 shadow-soft">
                <img src={heroImage} alt="Premium lifestyle shopping" className="h-[520px] w-full rounded-[24px] object-cover" />
                <div className="absolute bottom-8 left-8 right-8 rounded-2xl border border-white/60 bg-slate-900/70 p-4 text-white backdrop-blur-sm">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-300">New season</div>
                  <div className="mt-2 text-2xl font-bold">Elevated essentials</div>
                  <div className="mt-1 text-sm text-slate-200">up to 30% off selected picks</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="categories" className="section-shell py-14 sm:py-16">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Curated picks</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Shop by Category</h2>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="animate-pulse overflow-hidden rounded-[24px] border border-slate-200 bg-slate-200/80">
                <div className="h-52 bg-slate-300" />
                <div className="space-y-2 p-4">
                  <div className="h-4 w-20 rounded bg-slate-300" />
                  <div className="h-3 w-28 rounded bg-slate-300" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {categories.map(([category, count]) => (
              <div key={category} className="group relative overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-soft">
                <div className="relative h-56 overflow-hidden">
                  <img
                    src={categoryImages[category] || heroImage}
                    alt={category}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-200">{count} products</p>
                    <h3 className="mt-2 text-2xl font-bold">{category}</h3>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="shop" className="section-shell py-14 sm:py-16">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Top picks</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Featured Products</h2>
          </div>
          <form className="flex w-full max-w-md items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:max-w-sm" onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="Search products..."
              className="input border-0 bg-transparent px-3 py-2.5 shadow-none focus:ring-0"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="btn btn-primary whitespace-nowrap">Search</button>
          </form>
        </div>

        {toast && (
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            {toast}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm">
                <div className="animate-pulse rounded-[20px] bg-slate-200 h-64" />
                <div className="mt-4 space-y-3">
                  <div className="h-4 w-20 rounded bg-slate-200" />
                  <div className="h-5 w-32 rounded bg-slate-200" />
                  <div className="h-5 w-24 rounded bg-slate-200" />
                  <div className="h-10 rounded-xl bg-slate-200" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-2xl">⌕</div>
            <h3 className="text-2xl font-bold text-slate-900">No products found</h3>
            <p className="mt-2 text-slate-500">Try a broader search or check back later for fresh arrivals.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard key={product._id} product={product} onAdded={showToast} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Home;
