import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => (
    <footer className="border-t border-slate-200 bg-slate-900 text-slate-200">
        <div className="section-shell py-12">
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-5">
                <div className="lg:col-span-2">
                    <Link to="/" className="text-2xl font-black tracking-tight text-white">
                        SHOP-NOW
                    </Link>
                    <p className="mt-4 max-w-sm text-sm text-slate-300">
                        Thoughtful essentials for everyday living. Premium products, curated for modern lifestyles.
                    </p>
                </div>

                <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Shop</h3>
                    <ul className="mt-4 space-y-3 text-sm text-slate-300">
                        <li><Link to="/" className="hover:text-white">Products</Link></li>
                        <li><Link to="/" className="hover:text-white">Categories</Link></li>
                        <li><Link to="/" className="hover:text-white">New Arrivals</Link></li>
                    </ul>
                </div>

                <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Customer</h3>
                    <ul className="mt-4 space-y-3 text-sm text-slate-300">
                        <li><Link to="/orders" className="hover:text-white">Orders</Link></li>
                        <li><Link to="/" className="hover:text-white">Returns</Link></li>
                        <li><Link to="/" className="hover:text-white">Help</Link></li>
                    </ul>
                </div>

                <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Social</h3>
                    <ul className="mt-4 space-y-3 text-sm text-slate-300">
                        <li><a href="https://instagram.com" target="_blank" rel="noreferrer" className="hover:text-white">Instagram</a></li>
                        <li><a href="https://facebook.com" target="_blank" rel="noreferrer" className="hover:text-white">Facebook</a></li>
                        <li><a href="https://x.com" target="_blank" rel="noreferrer" className="hover:text-white">X / LinkedIn</a></li>
                    </ul>
                </div>
            </div>

            <div className="mt-12 border-t border-slate-800 pt-6 text-center text-sm text-slate-400">
                © 2026 SHOP-NOW
            </div>
        </div>
    </footer>
);

export default Footer;
