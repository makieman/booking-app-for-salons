import React, { createContext, useContext, useState, useEffect } from 'react';
import { Tenant } from '../types';
import * as api from '../api/client';

interface TenantContextProps {
  tenant: Tenant | null;
  loading: boolean;
  error: string | null;
  tenantSlug: string | null;
  viewMode: 'customer' | 'admin' | 'staff' | 'register' | 'select';
  bookingRef: string | null;
  queryParams: URLSearchParams;
  setTenant: (tenant: Tenant | null) => void;
  navigate: (
    view: 'customer' | 'admin' | 'staff' | 'register' | 'select',
    newSlug?: string,
    params?: Record<string, string>
  ) => void;
}

const TenantContext = createContext<TenantContextProps | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenant, setTenantState] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parse path-based route and query params:
  // e.g. /                       -> slug = flo-sisterlocks, view = customer
  //      /?ref=LMN-XXXXX         -> slug = flo-sisterlocks, view = customer, bookingRef = LMN-XXXXX
  //      /flo-sisterlocks        -> slug = flo-sisterlocks, view = customer
  //      /select                 -> slug = null, view = select
  //      /register               -> slug = null, view = register
  //      /admin                  -> slug = storedSlug || flo-sisterlocks, view = admin
  //      /:slug/admin            -> slug = :slug, view = admin
  //      /staff                  -> slug = storedSlug || flo-sisterlocks, view = staff
  //      /:slug/staff            -> slug = :slug, view = staff
  const parseUrl = () => {
    const path = window.location.pathname;
    const search = window.location.search;
    const queryParams = new URLSearchParams(search);
    const bookingRef = queryParams.get('ref') || queryParams.get('reference') || null;

    const segments = path.split('/').filter(Boolean);

    if (segments.length === 0) {
      const storedSlug = localStorage.getItem('lastTenantSlug') || 'flo-sisterlocks';
      return { slug: storedSlug, view: 'customer' as const, bookingRef, queryParams };
    }

    const first = segments[0];

    if (first === 'select') {
      return { slug: null, view: 'select' as const, bookingRef, queryParams };
    }

    if (first === 'register') {
      return { slug: null, view: 'register' as const, bookingRef, queryParams };
    }

    if (first === 'admin' || first === 'owner') {
      const storedSlug = localStorage.getItem('ownerTenantSlug') || localStorage.getItem('lastTenantSlug') || 'flo-sisterlocks';
      return { slug: storedSlug, view: 'admin' as const, bookingRef, queryParams };
    }

    if (first === 'staff' || first === 'attendant') {
      const storedSlug = localStorage.getItem('staffTenantSlug') || localStorage.getItem('lastTenantSlug') || 'flo-sisterlocks';
      return { slug: storedSlug, view: 'staff' as const, bookingRef, queryParams };
    }

    // Check nested routes: e.g. /:slug/admin, /:slug/staff
    const slug = first;
    if (segments.length > 1) {
      const sub = segments[1];
      if (sub === 'admin' || sub === 'owner') {
        localStorage.setItem('ownerTenantSlug', slug);
        return { slug, view: 'admin' as const, bookingRef, queryParams };
      }
      if (sub === 'staff' || sub === 'attendant') {
        localStorage.setItem('staffTenantSlug', slug);
        return { slug, view: 'staff' as const, bookingRef, queryParams };
      }
    }

    localStorage.setItem('lastTenantSlug', slug);
    const view = 'customer' as const;

    return { slug, view, bookingRef, queryParams };
  };

  const [route, setRoute] = useState(parseUrl());

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setTenant = (t: Tenant | null) => {
    setTenantState(t);
    if (t) {
      api.setApiTenantSlug(t.slug);

      // Update CSS variables for branding colors
      const primary = t.branding?.primaryColor || '#B08968';
      document.documentElement.style.setProperty('--brand-color', primary);
      document.documentElement.style.setProperty('--color-primary', primary);
      document.documentElement.style.setProperty('--color-brand-sage', primary);
      document.documentElement.style.setProperty('--color-brand-gray-300', primary);

      // Update favicon dynamically
      const faviconUrl = t.branding?.faviconUrl || '/favicon.ico';
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = faviconUrl;

      // Update document title
      document.title = t.name;
    } else {
      api.setApiTenantSlug(null);
    }
  };

  useEffect(() => {
    const fetchTenant = async () => {
      if (!route.slug) {
        setTenantState(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        api.setApiTenantSlug(route.slug);
        const data = await api.getPublicTenant();
        setTenant(data);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to load salon details');
        setTenantState(null);
      } finally {
        setLoading(false);
      }
    };

    fetchTenant();
  }, [route.slug]);

  const navigate = (
    view: 'customer' | 'admin' | 'staff' | 'register' | 'select',
    newSlug?: string,
    params?: Record<string, string>
  ) => {
    let path = '/';
    const slug = newSlug || route.slug || localStorage.getItem('lastTenantSlug') || 'flo-sisterlocks';

    if (newSlug) {
      if (view === 'admin') {
        localStorage.setItem('ownerTenantSlug', newSlug);
      } else if (view === 'staff') {
        localStorage.setItem('staffTenantSlug', newSlug);
      }
    }

    if (view === 'register') {
      path = '/register';
    } else if (view === 'select') {
      path = '/select';
    } else if (view === 'admin') {
      path = slug ? `/${slug}/admin` : '/admin';
    } else if (view === 'staff') {
      path = slug ? `/${slug}/staff` : '/staff';
    } else if (slug && slug !== 'flo-sisterlocks') {
      path = `/${slug}`;
    } else {
      path = '/';
    }

    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams(params).toString();
      path += `?${qs}`;
    }

    window.history.pushState({}, '', path);
    setRoute(parseUrl());
  };

  return (
    <TenantContext.Provider value={{
      tenant,
      loading,
      error,
      tenantSlug: route.slug,
      viewMode: route.view,
      bookingRef: route.bookingRef,
      queryParams: route.queryParams,
      setTenant,
      navigate
    }}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
