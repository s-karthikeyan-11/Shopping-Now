import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';

import Navbar from './components/Navbar';
import Footer from './components/Footer';
import PrivateRoute from './components/PrivateRoute';
import AdminRoute from './components/AdminRoute';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Cart from './pages/Cart';
import Orders from './pages/Orders';

import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import AdminProducts from './pages/admin/Products';
import AdminOrders from './pages/admin/Orders';
import AdminUsers from './pages/admin/Users';

import Checkout from './pages/Checkout';
import Profile from './pages/Profile';
import Wishlist from './pages/Wishlist';
import ProductDetails from './pages/ProductDetails';
import OrderDetails from './pages/OrderDetails';

const App = () => (
  <AuthProvider>
    <CartProvider>

      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >

        <div className="min-h-screen bg-slate-50 text-slate-900">

          <Navbar />

          <main className="app-content min-h-[70vh]">

            <Routes>

              {/* Customer Pages */}
              <Route path="/" element={<Home />} />
              <Route path="/home" element={<Home />} />
              <Route path="/products" element={<Home />} />
              <Route path="/categories" element={<Home />} />

              <Route
                path="/product/:id"
                element={<ProductDetails />}
              />

              <Route
                path="/wishlist"
                element={<Wishlist />}
              />

              {/* Authentication */}
              <Route
                path="/login"
                element={<Login />}
              />

              <Route
                path="/register"
                element={<Register />}
              />

              {/* Customer Protected Pages */}
              <Route
                path="/cart"
                element={
                  <PrivateRoute customerOnly>
                    <Cart />
                  </PrivateRoute>
                }
              />

              <Route
                path="/checkout"
                element={
                  <PrivateRoute customerOnly>
                    <Checkout />
                  </PrivateRoute>
                }
              />

              <Route
                path="/orders"
                element={
                  <PrivateRoute customerOnly>
                    <Orders />
                  </PrivateRoute>
                }
              />

              <Route
                path="/order/:id"
                element={
                  <PrivateRoute>
                    <OrderDetails />
                  </PrivateRoute>
                }
              />

              <Route
                path="/profile"
                element={
                  <PrivateRoute>
                    <Profile />
                  </PrivateRoute>
                }
              />

              {/* Admin */}
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <AdminLayout />
                  </AdminRoute>
                }
              >
                <Route
                  index
                  element={<Dashboard />}
                />

                <Route
                  path="products"
                  element={<AdminProducts />}
                />

                <Route
                  path="orders"
                  element={<AdminOrders />}
                />

                <Route
                  path="users"
                  element={<AdminUsers />}
                />
              </Route>

              {/* 404 */}
              <Route
                path="*"
                element={
                  <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
                    <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">

                      <h1 className="text-3xl text-slate-900">
                        Page not found
                      </h1>

                      <p className="mt-2 text-slate-600">
                        The page you are looking for does not exist.
                      </p>

                    </div>
                  </div>
                }
              />

            </Routes>

          </main>

          <Footer />

        </div>

      </BrowserRouter>

    </CartProvider>
  </AuthProvider>
);

export default App;