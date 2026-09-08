/**
 * Authentication Store - Zustand state management for User and Admin Auth.
 */
import { create } from 'zustand';
import api from '../api/client';
import usePlayerStore from './playerStore';

let initialToken = null;
let initialUser = null;
try {
  initialToken = localStorage.getItem('homeify_token');
  const userStr = localStorage.getItem('homeify_user');
  if (userStr) {
    initialUser = JSON.parse(userStr);
  }
} catch {}

const useAuthStore = create((set, get) => ({
  token: initialToken,
  user: initialUser,
  isAuthenticated: Boolean(initialToken),
  isAdmin: Boolean(initialUser?.role === 'admin'),
  isLoading: false,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.login(username, password);
      const token = data.access_token;
      const user = data.user;

      localStorage.setItem('homeify_token', token);
      localStorage.setItem('homeify_user', JSON.stringify(user));

      set({
        token,
        user,
        isAuthenticated: true,
        isAdmin: user?.role === 'admin',
        isLoading: false,
        error: null,
      });

      // Reload user's personal favorites after login
      try {
        usePlayerStore.getState().fetchFavorites();
      } catch {}

      return { success: true, user };
    } catch (err) {
      const msg = err.message || 'התחברות נכשלה';
      set({ isLoading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  logout: () => {
    localStorage.removeItem('homeify_token');
    localStorage.removeItem('homeify_user');
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      isLoading: false,
      error: null,
    });
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  },

  checkAuth: async () => {
    const { token } = get();
    if (!token) {
      set({ isAuthenticated: false, isAdmin: false, user: null });
      return;
    }

    try {
      const data = await api.getMe();
      if (data?.user) {
        localStorage.setItem('homeify_user', JSON.stringify(data.user));
        set({
          user: data.user,
          isAuthenticated: true,
          isAdmin: data.user?.role === 'admin',
        });
      }
    } catch (err) {
      console.warn('Token validation failed:', err);
      get().logout();
    }
  },

  updateUser: (updatedUser) => {
    localStorage.setItem('homeify_user', JSON.stringify(updatedUser));
    set({
      user: updatedUser,
      isAdmin: updatedUser?.role === 'admin',
    });
  },
}));

export default useAuthStore;
