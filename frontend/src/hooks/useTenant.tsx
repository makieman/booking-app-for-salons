import React, { createContext, useContext, useState, useEffect } from 'react';
import { Tenant } from '../types';
import * as api from '../api/client';

interface TenantContextProps {
  tenant: Tenant | null;
  loading: boolean;
  error: string | null;
  tenantSlug: string | null;
  viewMode: 'customer' | 'admin' | 'staff' | 'register' | 'select';
  setTenant: (tenant: Tenant | null) => void;
  navigate: (view: 'customer' | 'admin' | 'staff' | 'register' | 'select', newSlug?: string) => void;
}

const TenantContext = createContext<TenantContextProps | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenant, setTenantState] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parse path-based route:
  // e.g. /flo-sisterlocks        -> slug = flo-sisterlocks, view = customer
  //      /flo-sisterlocks/admin  -> slug = flo-sisterlocks, view = admin
  //      /flo-sisterlocks/staff  -> slug = flo-sisterlocks, view = staff
  //      /register               -> slug = null, view = register
  //      /                       -> slug = null, view = select
  const parseUrl = () => {
    const path = window.location.pathname;
    const segments = path.split('/').filter(Boolean);

    if (segments.length === 0) {
      return { slug: null, view: 'select' as const };
    }

    if (segments[0] === 'register') {
      return { slug: null, view: 'register' as const };
    }

    if (segments[0] === 'owner') {
      const storedSlug = localStorage.getItem('ownerTenantSlug');
      return { slug: storedSlug, view: 'admin' as const };
    }

    if (segments[0] === 'staff') {
      const storedSlug = localStorage.getItem('staffTenantSlug');
      return { slug: storedSlug, view: 'staff' as const };
    }

    const slug = segments[0];
    const view = 'customer' as const;

    return { slug, view };
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

  const navigate = (view: 'customer' | 'admin' | 'staff' | 'register' | 'select', newSlug?: string) => {
    let path = '/';
    const slug = newSlug || route.slug;

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
      path = '/';
    } else if (view === 'admin') {
      path = '/owner';
    } else if (view === 'staff') {
      path = '/staff';
    } else if (slug) {
      path = `/${slug}`;
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
