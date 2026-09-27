import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

const fallbackImage = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80';

const ProductCard = ({ product, onAdded }) => {
  const { user, isAdmin } = useAuth();
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const [imageSrc, setImageSrc] = useState(product.image || product.imageUrl || product.imageURL || fallbackImage);
  const outOfStock = Number(product.stock) <= 0;
  const rating = product.rating || 4.8;
  const reviewCount = product.reviewCount || 128;

  const handleAdd = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      await addToCart(product._id, 1);
      onAdded && onAdded(product.name);
    } catch (err) {
      alert(err.response?.data?.message || 'Could not add to cart');
    }
  };

  const salePercent = Math.max(Number(product.discountPercent || 0), 0);
  const price = Number(product.price || 0);
  const originalPrice = Number(product.finalPrice || price).toFixed(2);
  const displayPrice = salePercent > 0 ? Number(product.finalPrice || price) : Number(product.finalPrice || price);

  return (
    <article className="group overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_12px_35px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(15,23,42,0.1)]">
      <div className="relative overflow-hidden">
        <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {salePercent > 0 && (
              <span className="rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                -{salePercent}%
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="Save item"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/80 text-slate-700 shadow-sm backdrop-blur-sm transition hover:border-slate-200 hover:text-rose-500"
          >
            ♥
          </button>
        </div>

        <div className="relative h-64 overflow-hidden bg-slate-100">
          <img
            src={imageSrc}
            alt={product.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
            onError={() => setImageSrc(fallbackImage)}
          />
          {outOfStock && (
            <div className="absolute inset-x-0 bottom-0 bg-slate-900/70 px-3 py-2 text-center text-xs font-medium tracking-[0.1em] text-white uppercase">
              Out of stock
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">{product.category || 'General'}</p>
            <h3 className="mt-2 line-clamp-2 text-lg font-semibold text-slate-900">{product.name}</h3>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="text-amber-500">★</span>
          <span className="font-medium text-slate-700">{rating.toFixed(1)}</span>
          <span>({reviewCount}+ reviews)</span>
        </div>

        <div className="flex items-end gap-2">
          <span className="text-2xl font-bold text-slate-900">₹{Number(product.finalPrice || 0).toFixed(2)}</span>
          {salePercent > 0 && <span className="pb-1 text-sm text-slate-400 line-through">₹{Number(price).toFixed(2)}</span>}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{product.gstPercent || 0}% GST included</span>
          {!outOfStock && <span className="font-medium text-emerald-600">{product.stock} in stock</span>}
        </div>

        {!isAdmin && (
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={outOfStock}
            onClick={handleAdd}
          >
            {user ? 'Add to Cart' : 'Log in to buy'}
          </button>
        )}
      </div>
    </article>
  );
};

export default ProductCard;
