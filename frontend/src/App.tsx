import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, CheckCircle2, ArrowLeft, Shield, LayoutDashboard, Search, X, WifiOff, Bell, BellOff, User, CircleUserRound, Clock, Lock, Unlock, Volume2, Plus, Trash2, Key, ChevronRight, ArrowUpDown, Copy, Check, MessageCircle, LogOut, Calendar, AlertCircle, Scissors, Users, Settings, UserPlus, Eye, EyeOff, ChevronDown, Loader2, Sparkles, UserCheck } from 'lucide-react';
import { Service, Booking, BookingStep, Attendant, UserMode, AttendantSession, MAX_SERVICES, MultiSlotOption } from './types';
import { FALLBACK_SERVICES, FALLBACK_TIME_SLOTS } from './data/mockData';
import * as api from './api/client';
import { InstallPrompt } from './components/InstallPrompt';
import { NotificationPrompt } from './components/NotificationPrompt';
import { NotificationCenter } from './components/NotificationCenter';
import { useAdminPushNotifications } from './hooks/useAdminPushNotifications';
import { useAttendantPushNotifications } from './hooks/useAttendantPushNotifications';
import { useNotificationSound } from './hooks/useNotificationSound';
import { playNotificationSound } from './utils/notificationSound';
import { useTenant } from './hooks/useTenant';
import { SalonDashboard } from './components/SalonDashboard';
import { AdminPortal } from './components/AdminPortal';
import { CustomerAccountModal } from './components/CustomerAccountModal';
import { DateTimeSelectionScreen } from './components/DateTimeSelectionScreen';
import { AdminView } from './components/admin/AdminView';
import { getTodayDateString, formatDateInTimezone } from './utils/dateUtils';

/** Formats a service price as a fixed price or a range.
 *  e.g. formatPrice(2000)        → "KES 2,000"
 *       formatPrice(2000, 5000)  → "KES 2,000 – 5,000"
 */
function formatPrice(price: number, priceMax?: number): string {
  if (priceMax && priceMax > price) {
    return `KES ${price.toLocaleString()} – ${priceMax.toLocaleString()}`;
  }
  return `KES ${price.toLocaleString()}`;
}


export default function App() {
  const [renderError, setRenderError] = useState<Error | null>(null);

  // ── Tenant Context and Routing ──────────────────────────────────────────
  const { tenant, loading: tenantLoading, error: tenantError, tenantSlug, viewMode, bookingRef, navigate, setTenant } = useTenant();

  // ── Owner Token Session ──────────────────────────────────────────────────
  const [ownerToken, setOwnerToken] = useState<string | null>(localStorage.getItem('ownerToken'));
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerLoginLoading, setOwnerLoginLoading] = useState(false);
  const [ownerLoginError, setOwnerLoginError] = useState<string | null>(null);
  const [ownerLoginRemainingAttempts, setOwnerLoginRemainingAttempts] = useState<number | null>(null);
  const [ownerLoginLockoutMinutes, setOwnerLoginLockoutMinutes] = useState<number | null>(null);
  // Forgot password
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);
  // URL Reset Token flow
  const [urlResetToken, setUrlResetToken] = useState<string | null>(null);
  const [urlResetSlug, setUrlResetSlug] = useState<string | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('resetToken');
    const slug = params.get('slug');
    if (token && slug) {
      setUrlResetToken(token);
      setUrlResetSlug(slug);
    }
  }, []);
  const [loginSlug, setLoginSlug] = useState(tenantSlug || '');
  const [staffSlug, setStaffSlug] = useState(tenantSlug || '');

  useEffect(() => {
    if (tenantSlug) {
      setLoginSlug(tenantSlug);
      setStaffSlug(tenantSlug);
    }
  }, [tenantSlug]);

  // ── Tenant Registration State ───────────────────────────────────────────
  const [regSalonName, setRegSalonName] = useState('');
  const [regSlug, setRegSlug] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const handleOwnerLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginSlug) return;
    setOwnerLoginLoading(true);
    setOwnerLoginError(null);
    setOwnerLoginRemainingAttempts(null);
    setOwnerLoginLockoutMinutes(null);
    try {
      const result = await api.loginOwner({
        slug: loginSlug,
        email: ownerEmail,
        password: ownerPassword,
      });
      localStorage.setItem('ownerToken', result.token);
      localStorage.setItem('ownerTenantSlug', result.tenant.slug);
      setOwnerToken(result.token);
      api.setApiTenantSlug(result.tenant.slug);
      api.setApiAuthToken(result.token);
      setTenant(result.tenant);
      setUserMode('owner');
      setShowPinModal(false);
      setOwnerEmail('');
      setOwnerPassword('');
      navigate('admin', result.tenant.slug);
    } catch (err: any) {
      setOwnerLoginError(err.message || 'Invalid credentials');
      setOwnerLoginRemainingAttempts(err.remainingAttempts ?? null);
      setOwnerLoginLockoutMinutes(err.lockoutMinutes ?? null);
    } finally {
      setOwnerLoginLoading(false);
    }
  };

  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      setRenderError(event.error || new Error(event.message));
    };
    window.addEventListener('error', handleGlobalError);
    return () => window.removeEventListener('error', handleGlobalError);
  }, []);

  // Play custom push notification sound in active app windows
  useNotificationSound();

  // ── User mode: 'customer' | 'attendant' | 'owner' ─────────────────────────
  const [userMode, setUserMode] = useState<UserMode>('customer');
  // Backward-compat alias used by AdminView
  const isAdmin = userMode === 'owner';

  // ── Attendant session ─────────────────────────────────────────────────────
  const [attendantSession, setAttendantSession] = useState<AttendantSession | null>(null);

  // ── Login modal state ─────────────────────────────────────────────────────
  const [showPinModal, setShowPinModal] = useState(false);
  const [loginTab, setLoginTab] = useState<'owner' | 'staff'>('owner');
  // Owner PIN
  const [pin, setPin] = useState('');
  const [ownerSessionPin, setOwnerSessionPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const ADMIN_PIN = import.meta.env.VITE_OWNER_PIN ?? '1234'; // Keep for client-side gate
  // Staff login
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPin, setStaffPin] = useState('');
  const [staffPinError, setStaffPinError] = useState(false);
  const [staffLoginLoading, setStaffLoginLoading] = useState(false);

  const [activeStep, setActiveStep] = useState<BookingStep>('service');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Sync browser back/forward buttons with activeStep while keeping booking state intact
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state && e.state.step) {
        setActiveStep(e.state.step);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateStep = useCallback((step: BookingStep) => {
    setActiveStep(step);
    try {
      window.history.pushState({ step }, '', window.location.href);
    } catch { }
  }, []);

  // Data from API
  // Initialize with cached services or top 3 default services so they appear on top instantly
  const [services, setServices] = useState<Service[]>(() => {
    try {
      const cached = localStorage.getItem('cachedServices');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return FALLBACK_SERVICES.slice(0, 3);
  });
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingServices, setIsSyncingServices] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // System status toast notifications (e.g., success, info, warning)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const triggerToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Multi-Service Booking State
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [serviceAttendants, setServiceAttendants] = useState<Record<string, Attendant | null>>({});
  const [serviceAttendantsMap, setServiceAttendantsMap] = useState<Record<string, Attendant[]>>({});
  const [multiSlotOptions, setMultiSlotOptions] = useState<MultiSlotOption[]>([]);

  // Backward-compatibility aliases
  const selectedService = selectedServices[0] || null;
  const setSelectedService = (s: Service | null) => {
    if (!s) setSelectedServices([]);
    else setSelectedServices([s]);
  };

  const selectedAttendant = selectedServices[0] ? (serviceAttendants[selectedServices[0]._id] ?? null) : null;
  const setSelectedAttendant = (att: Attendant | null) => {
    if (selectedServices[0]) {
      setServiceAttendants(prev => ({ ...prev, [selectedServices[0]._id]: att }));
    }
  };

  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const handleToggleService = (service: Service) => {
    setSelectedServices(prev => {
      const exists = prev.some(s => s._id === service._id);
      if (exists) {
        return prev.filter(s => s._id !== service._id);
      }
      if (prev.length >= MAX_SERVICES) {
        triggerToast(`You can select up to ${MAX_SERVICES} services`, 'error');
        return prev;
      }
      return [...prev, service];
    });
  };

  const handleSwapServices = () => {
    if (selectedServices.length === 2) {
      setSelectedServices([selectedServices[1], selectedServices[0]]);
    }
  };

  const totalServiceDuration = useMemo(() => {
    return selectedServices.reduce((sum, s) => sum + s.duration, 0);
  }, [selectedServices]);

  const totalServicePrice = useMemo(() => {
    return selectedServices.reduce((sum, s) => sum + s.price, 0);
  }, [selectedServices]);
  const [clientInfo, setClientInfo] = useState(() => {
    try {
      const saved = localStorage.getItem('customerProfile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            name: parsed.name || '',
            phone: parsed.phone || '',
            email: parsed.email || '',
          };
        }
      }
    } catch { }
    return { name: '', phone: '', email: '' };
  });
  const [showCustomerAccountModal, setShowCustomerAccountModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);

  // Created booking (for real reference rendering on confirmation screen)
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);

  // Confirmation screen state & accessibility ref
  const [copiedReference, setCopiedReference] = useState(false);
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (activeStep === 'confirmation') {
      confirmationHeadingRef.current?.focus();
    }
  }, [activeStep]);

  // Auto-restore confirmation screen when ?ref=... is in URL or saved in localStorage
  useEffect(() => {
    if (tenantLoading) return;
    const refToRestore = bookingRef || (!createdBooking && activeStep === 'service' ? localStorage.getItem('lastBookingReference') : null);
    if (!refToRestore) return;

    const phoneToRestore = api.findStoredPhone(refToRestore, clientInfo.phone);
    if (!phoneToRestore) return;

    if (!createdBooking || createdBooking.reference !== refToRestore) {
      api.lookupBookings({ reference: refToRestore, phone: phoneToRestore })
        .then(results => {
          if (results && results.length > 0) {
            const found = results[0];
            setCreatedBooking(found);
            if (found.date) setSelectedDate(found.date);
            if (found.startTime) setSelectedTime(found.startTime);
            if (found.customerName || found.phone || found.email) {
              setClientInfo(prev => ({
                name: found.customerName || prev.name,
                phone: phoneToRestore || found.phone || prev.phone,
                email: found.email || prev.email,
              }));
            }
            if (typeof found.serviceId === 'object' && found.serviceId) {
              setSelectedServices([found.serviceId as Service]);
            }
            if (!bookingRef) {
              const url = new URL(window.location.href);
              url.searchParams.set('ref', refToRestore);
              window.history.replaceState({}, '', url.toString());
            }
            setActiveStep('confirmation');
          }
        })
        .catch(err => {
          console.warn('[App] Failed to auto-restore booking reference:', err);
        });
    }
  }, [bookingRef, tenantLoading, clientInfo.phone]);

  // Live polling for booking status updates when on confirmation screen
  useEffect(() => {
    if (activeStep !== 'confirmation' || !createdBooking?.reference) return;

    const bookingPhone = api.findStoredPhone(createdBooking.reference, clientInfo.phone);
    if (!bookingPhone) return;

    let isCancelled = false;
    const checkBookingStatus = async () => {
      try {
        const results = await api.lookupBookings({ reference: createdBooking.reference, phone: bookingPhone });
        if (!isCancelled && results && results.length > 0) {
          const latest = results[0];
          const statusChanged = latest.status !== createdBooking.status;
          const prevAttId = typeof createdBooking.attendantId === 'object' ? (createdBooking.attendantId as any)?._id : createdBooking.attendantId;
          const nextAttId = typeof latest.attendantId === 'object' ? (latest.attendantId as any)?._id : latest.attendantId;
          const attendantChanged = prevAttId !== nextAttId;

          if (statusChanged || attendantChanged) {
            setCreatedBooking(latest);
            if (typeof latest.serviceId === 'object' && latest.serviceId) {
              setSelectedServices([latest.serviceId as Service]);
            }
            if (latest.status === 'confirmed' && createdBooking.status === 'pending') {
              triggerToast('Your appointment has been confirmed!', 'success');
              try {
                playNotificationSound('chime');
              } catch { }
            }
          }
        }
      } catch {
        // Silently retry on next interval
      }
    };

    const interval = setInterval(checkBookingStatus, 4000);

    const handleFocus = () => {
      checkBookingStatus();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      isCancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [activeStep, createdBooking?.reference, createdBooking?.status, createdBooking?.attendantId]);

  // Lookup Booking State (requires both reference and phone)
  const [lookupReference, setLookupReference] = useState('');
  const [lookupPhone, setLookupPhone] = useState(() => clientInfo.phone || localStorage.getItem('lastBookingPhone') || '');
  const [lookupResults, setLookupResults] = useState<Booking[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    if (activeStep === 'lookup' && !lookupReference) {
      try {
        const savedRef = localStorage.getItem('lastBookingReference');
        if (savedRef) setLookupReference(savedRef);
        const savedPhone = localStorage.getItem('lastBookingPhone') || clientInfo.phone;
        if (savedPhone) setLookupPhone(savedPhone);
      } catch { }
    }
  }, [activeStep, lookupReference, clientInfo.phone]);

  // Customer Cancellation
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Customer Rescheduling
  const [reschedulingBooking, setReschedulingBooking] = useState<Booking | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>(getTodayDateString());
  const [rescheduleTime, setRescheduleTime] = useState<string | null>(null);
  const [rescheduleSlots, setRescheduleSlots] = useState<string[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);

  const dateCtaRef = useRef<HTMLButtonElement>(null);

  // Synchronize userMode with viewMode
  useEffect(() => {
    if (viewMode === 'admin') {
      setUserMode('owner');
    } else if (viewMode === 'staff') {
      setUserMode('attendant');
    } else if (viewMode === 'customer') {
      setUserMode('customer');
    }
  }, [viewMode]);

  // ── Session restore on mount ───────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('attendantToken');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          setUserMode('attendant');
          setAttendantSession({ _id: payload.sub, name: payload.name, token });
          api.setApiAuthToken(token);
        } else {
          localStorage.removeItem('attendantToken');
        }
      } catch {
        localStorage.removeItem('attendantToken');
      }
    }

    const ownerTok = localStorage.getItem('ownerToken');
    if (ownerTok) {
      try {
        const payload = JSON.parse(atob(ownerTok.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          setOwnerToken(ownerTok);
          api.setApiAuthToken(ownerTok);
          if (viewMode === 'admin') {
            setUserMode('owner');
          }
        } else {
          localStorage.removeItem('ownerToken');
        }
      } catch {
        localStorage.removeItem('ownerToken');
      }
    }
  }, [viewMode]);

  // ── Keyboard support for PIN Modal ─────────────────────────────────────────
  useEffect(() => {
    if (!showPinModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // If user is focusing on username input, let them type normally
      if (document.activeElement?.tagName === 'INPUT') {
        if (e.key === 'Enter') {
          (document.activeElement as HTMLElement).blur();
        }
        return;
      }

      if (e.key === 'Escape') {
        setShowPinModal(false);
        return;
      }

      if (loginTab === 'owner') {
        // Owner login uses standard email & password form inputs, no PIN pad listener needed
      } else {
        if (/^[0-9]$/.test(e.key)) {
          setStaffPin(prev => {
            if (prev.length >= 6) return prev;
            return prev + e.key;
          });
          setStaffPinError(false);
        } else if (e.key === 'Backspace') {
          setStaffPin(prev => prev.slice(0, -1));
          setStaffPinError(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPinModal, loginTab, ADMIN_PIN]);


  // Initial Data Fetch & Offline Listeners
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // If on generic multi-tenant selector or registration screen, skip service fetch
    if (viewMode === 'select' || viewMode === 'register') {
      setIsLoading(false);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    // If tenant resolution failed with an error, fall back to mock data
    if (tenantError) {
      setServices(FALLBACK_SERVICES);
      setApiError('Unable to connect to server. Showing offline data.');
      setIsLoading(false);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    // Parallel fetch: As long as we have a tenant slug (from URL, localStorage, or resolved tenant),
    // start fetching services immediately without waiting for tenant details to finish loading.
    const effectiveSlug = tenantSlug || tenant?.slug || api.getEffectiveTenantSlug();
    if (!effectiveSlug) {
      if (!tenantLoading) setIsLoading(false);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    // Keep backend warm on app open and periodically while browsing
    api.pingBackendKeepWarm();
    const keepWarmTimer = setInterval(() => {
      api.pingBackendKeepWarm();
    }, 10 * 60 * 1000);

    const fetchInitialData = async () => {
      try {
        if (services.length <= 3) {
          setIsSyncingServices(true);
        }
        const fetchedServices = await api.getServices();
        if (Array.isArray(fetchedServices) && fetchedServices.length > 0) {
          setServices(fetchedServices);
        }

        if (isAdmin) {
          const fetchedBookings = await api.getBookings();
          setBookings(fetchedBookings);
        }
        setApiError(null);
      } catch (err) {
        console.warn('Sync notice: using cached/offline data', err);
        setServices(prev => (prev.length > 0 ? prev : FALLBACK_SERVICES));
        if (services.length === 0) {
          setApiError('Unable to connect to server. Showing offline data.');
        }
      } finally {
        setIsLoading(false);
        setIsSyncingServices(false);
      }
    };
    fetchInitialData();

    return () => {
      clearInterval(keepWarmTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [tenantSlug, tenant?._id, tenantError, isAdmin, viewMode]);

  // Fetch slots when date, services, or attendants change
  useEffect(() => {
    if (tenantLoading || !tenant) return;

    const fetchSlots = async () => {
      if (selectedServices.length === 0 || !selectedDate) return;

      setIsLoadingSlots(true);
      try {
        const items = selectedServices.map(s => ({
          serviceId: s._id,
          attendantId: serviceAttendants[s._id]?._id ?? null,
        }));

        const result = await api.getMultiAvailability(selectedDate, items);
        setTimeSlots(result.slots);
        setMultiSlotOptions(result.options || []);
      } catch (err) {
        console.error('Failed to fetch multi slots, falling back', err);
        setTimeSlots(FALLBACK_TIME_SLOTS);
        setMultiSlotOptions([]);
      } finally {
        setIsLoadingSlots(false);
      }
    };

    if (activeStep === 'date') {
      fetchSlots();
    }
  }, [tenantLoading, tenant?._id, selectedDate, selectedServices, serviceAttendants, activeStep]);

  // Fetch attendants for each selected service when entering the date or service step
  useEffect(() => {
    if (tenantLoading || !tenant) return;

    const fetchAttendants = async () => {
      if (selectedServices.length === 0) {
        setAttendants([]);
        return;
      }
      try {
        const map: Record<string, Attendant[]> = {};
        const allAtts: Attendant[] = [];
        for (const s of selectedServices) {
          const data = await api.getAttendantsForService(s._id);
          map[s._id] = data;
          for (const a of data) {
            if (!allAtts.some(existing => existing._id === a._id)) {
              allAtts.push(a);
            }
          }
        }
        setServiceAttendantsMap(map);
        setAttendants(allAtts);
      } catch (err) {
        console.error('Failed to fetch attendants', err);
      }
    };

    if (activeStep === 'date' || activeStep === 'service') {
      fetchAttendants();
    }
  }, [tenantLoading, tenant?._id, activeStep, selectedServices]);


  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setTimeout(() => {
      dateCtaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const filteredServices = useMemo(() => {
    return services.filter(service =>
      service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      service.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, services]);

  const handleConfirmBooking = async () => {
    if (selectedServices.length === 0 || !selectedTime || !clientInfo.name || !clientInfo.phone || !clientInfo.email || isOffline || isSubmittingBooking) return;

    setIsSubmittingBooking(true);
    try {
      const newBooking = await api.createBooking({
        customerName: clientInfo.name,
        phone: clientInfo.phone,
        email: clientInfo.email,
        date: selectedDate,
        startTime: selectedTime,
        items: selectedServices.map(s => ({
          serviceId: s._id,
          attendantId: serviceAttendants[s._id]?._id ?? null,
        })),
      });

      setCreatedBooking(newBooking);
      setBookings(prev => [...prev, newBooking]);
      try {
        if (newBooking?.reference) {
          api.saveStoredBookingRef(newBooking.reference, clientInfo.phone);
        }
        localStorage.setItem('customerProfile', JSON.stringify(clientInfo));
      } catch { }
      // Sync URL with ?ref=... so a page refresh immediately restores the confirmation screen
      if (newBooking?.reference) {
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('ref', newBooking.reference);
          window.history.pushState({}, '', url.toString());
        } catch { }
      }
      setActiveStep('confirmation');
      setTimeout(() => setShowNotificationPrompt(true), 800);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to create booking. Please try again.';
      if (
        errorMsg.toLowerCase().includes('already booked') ||
        errorMsg.toLowerCase().includes('not available') ||
        errorMsg.toLowerCase().includes('no attendant is available')
      ) {
        setSelectedTime(null);
        setActiveStep('date');
        triggerToast('That time slot was just taken by another client. Please choose another slot.', 'error');
      } else {
        triggerToast(errorMsg, 'error');
      }
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const resetFlow = () => {
    setIsSubmittingBooking(false);
    setActiveStep('service');
    setSelectedServices([]);
    setServiceAttendants({});
    setMultiSlotOptions([]);
    setSelectedTime(null);
    setSelectedDate(getTodayDateString());
    try {
      const saved = localStorage.getItem('customerProfile');
      if (saved) {
        setClientInfo(JSON.parse(saved));
      } else {
        setClientInfo({ name: '', phone: '', email: '' });
      }
    } catch {
      setClientInfo({ name: '', phone: '', email: '' });
    }
    setShowNotificationPrompt(false);
    setCreatedBooking(null);
    setCopiedReference(false);
    setLookupReference('');
    setLookupPhone(clientInfo.phone || '');
    setLookupResults([]);
    setLookupError(null);
    setReschedulingBooking(null);
    setCancellingBookingId(null);
    // Clear ?ref= from URL and localStorage so starting a new booking starts cleanly
    try {
      localStorage.removeItem('lastBookingReference');
      const url = new URL(window.location.href);
      if (url.searchParams.has('ref') || url.searchParams.has('reference')) {
        url.searchParams.delete('ref');
        url.searchParams.delete('reference');
        window.history.pushState({}, '', url.pathname + (url.search ? url.search : ''));
      }
    } catch { }
  };

  const handleLogoClick = () => {
    resetFlow();
    setShowCustomerAccountModal(false);
    setShowPinModal(false);
    if (viewMode !== 'customer') {
      setUserMode('customer');
      navigate('customer', tenantSlug || undefined);
    } else {
      try {
        window.history.pushState({ step: 'service' }, '', window.location.pathname);
      } catch { }
    }
  };

  // ── Confirmation Screen Helpers & Action Handlers
  const handleCopyReference = async () => {
    const ref = createdBooking?.reference;
    if (!ref) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(ref);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = ref;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedReference(true);
      setTimeout(() => setCopiedReference(false), 2000);
    } catch {
      setCopiedReference(true);
      setTimeout(() => setCopiedReference(false), 2000);
    }
  };

  const handleCheckBookingStatus = (ref?: string) => {
    const referenceToSearch = ref || createdBooking?.reference || '';
    setLookupReference(referenceToSearch);
    setLookupError(null);
    setLookupResults([]);
    setActiveStep('lookup');
    if (referenceToSearch) {
      try {
        localStorage.setItem('lastBookingReference', referenceToSearch);
      } catch { }
      const phone = api.findStoredPhone(referenceToSearch, clientInfo.phone);
      if (phone) {
        setLookupPhone(phone);
        setLookupLoading(true);
        api.lookupBookings({ reference: referenceToSearch, phone })
          .then(results => {
            setLookupResults(results);
            if (results.length === 0) {
              setLookupError('No bookings found matching your search.');
            }
          })
          .catch((err: any) => {
            setLookupError(err?.message || 'Failed to search bookings.');
          })
          .finally(() => {
            setLookupLoading(false);
          });
      }
    }
  };

  const handleViewBookingDetails = (reference: string) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('ref', reference);
      window.history.pushState({}, '', url.toString());
    } catch { }
    const phone = api.findStoredPhone(reference, clientInfo.phone);
    if (!phone) {
      setLookupReference(reference);
      setActiveStep('lookup');
      return;
    }
    api.lookupBookings({ reference, phone }).then(results => {
      if (results && results.length > 0) {
        const b = results[0];
        setCreatedBooking(b);
        if (b.date) setSelectedDate(b.date);
        if (b.startTime) setSelectedTime(b.startTime);
        if (b.customerName || b.phone || b.email) {
          setClientInfo({
            name: b.customerName || clientInfo.name,
            phone: phone || b.phone || clientInfo.phone,
            email: b.email || clientInfo.email,
          });
        }
        if (typeof b.serviceId === 'object' && b.serviceId) {
          setSelectedServices([b.serviceId as Service]);
        }
        setActiveStep('confirmation');
      }
    }).catch(err => {
      console.error('Failed to view booking details:', err);
    });
  };

  const whatsAppUrl = useMemo(() => {
    const rawPhone = tenant?.supportPhone;
    if (!rawPhone || !rawPhone.trim()) return null;

    let digits = rawPhone.replace(/\D/g, '');
    if (!digits) return null;

    if (digits.startsWith('0')) {
      digits = '254' + digits.slice(1);
    } else if (!digits.startsWith('254') && digits.length === 9) {
      digits = '254' + digits;
    } else if (!digits.startsWith('254')) {
      digits = '254' + digits;
    }

    const bookingRef = createdBooking?.reference;
    const message = bookingRef
      ? `Hello, I'm reaching out regarding my booking request #${bookingRef}.`
      : `Hello, I'm reaching out regarding my booking request.`;

    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }, [tenant?.supportPhone, createdBooking?.reference]);

  const confirmationFriendlyDate = useMemo(() => {
    const raw = createdBooking?.date || selectedDate;
    if (!raw) return '';
    try {
      const d = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
      if (isNaN(d.getTime())) return raw;
      return d.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return raw;
    }
  }, [createdBooking?.date, selectedDate]);

  const confirmationTimeRange = useMemo(() => {
    const start = createdBooking?.startTime || selectedTime || '';
    if (!start) return '';
    if (createdBooking?.endTime) {
      return `${start} – ${createdBooking.endTime}`;
    }
    const matchedOpt = multiSlotOptions.find(o => o.time === selectedTime);
    if (matchedOpt?.endTime) {
      return `${start} – ${matchedOpt.endTime}`;
    }
    if (totalServiceDuration > 0) {
      const parts = start.split(':').map(Number);
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const totalMinutes = parts[0] * 60 + parts[1] + totalServiceDuration;
        const endH = Math.floor(totalMinutes / 60) % 24;
        const endM = totalMinutes % 60;
        return `${start} – ${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      }
    }
    return start;
  }, [createdBooking?.startTime, createdBooking?.endTime, selectedTime, multiSlotOptions, totalServiceDuration]);


  const handleNotificationNavigate = (url: string) => {
    if (url.startsWith('/attendant') || url.startsWith('/staff')) {
      if (attendantSession) {
        setUserMode('attendant');
      }
      navigate('staff', tenantSlug || undefined);
    } else if (url.startsWith('/admin') || url.startsWith('/owner')) {
      if (ownerToken) {
        setUserMode('owner');
      }
      navigate('admin', tenantSlug || undefined);
    } else {
      setUserMode('customer');
      const bookingMatch = url.match(/\/bookings\/([A-Za-z0-9-]+)/);
      if (bookingMatch && bookingMatch[1]) {
        const queryVal = bookingMatch[1];
        setLookupReference(queryVal);
        setActiveStep('lookup');
        setLookupError(null);
        const phone = api.findStoredPhone(queryVal, clientInfo.phone);
        if (phone) {
          setLookupPhone(phone);
          setLookupLoading(true);
          api.lookupBookings({ reference: queryVal, phone })
            .then(data => {
              setLookupResults(data || []);
            })
            .catch(err => {
              setLookupError(err?.message || 'Booking lookup failed');
            })
            .finally(() => setLookupLoading(false));
        }
      } else {
        resetFlow();
      }
    }
  };

  const handleStepBack = () => {
    if (activeStep === 'date') setActiveStep('service');
    if (activeStep === 'contact') setActiveStep('date');
  };

  //Lookup Handlers (requires reference + phone)
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupReference.trim() || !lookupPhone.trim()) {
      setLookupError('Please enter both booking reference and phone number.');
      return;
    }

    setLookupLoading(true);
    setLookupError(null);
    setLookupResults([]);

    try {
      const results = await api.lookupBookings({
        reference: lookupReference.trim(),
        phone: lookupPhone.trim(),
      });
      setLookupResults(results);
      if (results.length === 0) {
        setLookupError('No bookings found matching your reference and phone number.');
      } else {
        api.saveStoredBookingRef(lookupReference.trim(), lookupPhone.trim());
      }
    } catch (err: any) {
      setLookupError(err.message || 'Failed to search bookings.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleCancelBooking = async (id: string) => {
    const confirmCancel = window.confirm('Are you sure you want to cancel this booking? This action cannot be undone.');
    if (!confirmCancel) return;

    const b = lookupResults.find(item => item._id === id);
    let phone = lookupPhone.trim() || api.findStoredPhone(b?.reference || '', clientInfo.phone);
    if (!phone) {
      const entered = window.prompt('Please enter the phone number used for this booking to confirm cancellation:');
      if (!entered) return;
      phone = entered.trim();
    }

    setCancelLoading(true);
    try {
      await api.cancelBookingCustomer(id, phone);
      setLookupResults(prev => prev.map(b => b._id === id ? { ...b, status: 'cancelled' as const } : b));
      alert('Your appointment has been successfully cancelled.');
    } catch (err: any) {
      alert(err.message || 'Failed to cancel booking.');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleStartReschedule = async (booking: Booking) => {
    setReschedulingBooking(booking);
    setRescheduleTime(null);
    const dateStr = formatDateInTimezone(Date.now() + 86400000);
    setRescheduleDate(dateStr);
    await fetchRescheduleSlots(dateStr, booking);
  };

  const fetchRescheduleSlots = async (dateStr: string, booking: Booking) => {
    setRescheduleSlotsLoading(true);
    setRescheduleSlots([]);
    try {
      const serviceId = typeof booking.serviceId === 'object' ? booking.serviceId._id : booking.serviceId;
      const attendantId = typeof booking.attendantId === 'object' ? booking.attendantId?._id : booking.attendantId;

      let slots: string[] = [];
      if (attendantId) {
        slots = await api.getAvailability(dateStr, serviceId, attendantId);
      } else {
        const data = await api.getAnyAvailability(dateStr, serviceId);
        slots = data.slots;
      }
      setRescheduleSlots(slots);
    } catch (err) {
      console.error('Failed to fetch slots for reschedule:', err);
    } finally {
      setRescheduleSlotsLoading(false);
    }
  };

  const handleRescheduleDateChange = async (dateStr: string) => {
    setRescheduleDate(dateStr);
    setRescheduleTime(null);
    if (reschedulingBooking) {
      await fetchRescheduleSlots(dateStr, reschedulingBooking);
    }
  };

  const handleConfirmReschedule = async () => {
    if (!reschedulingBooking || !rescheduleTime) return;

    let phone = lookupPhone.trim() || api.findStoredPhone(reschedulingBooking.reference, clientInfo.phone);
    if (!phone) {
      const entered = window.prompt('Please enter the phone number used for this booking to confirm reschedule:');
      if (!entered) return;
      phone = entered.trim();
    }

    setRescheduleSubmitting(true);
    try {
      const updated = await api.rescheduleBookingCustomer(reschedulingBooking._id, {
        date: rescheduleDate,
        startTime: rescheduleTime,
        phone,
      });

      // Update in lookup results list
      setLookupResults(prev => prev.map(b => b._id === reschedulingBooking._id ? {
        ...b,
        date: rescheduleDate,
        startTime: rescheduleTime,
        endTime: updated.endTime,
        status: 'pending' as const
      } : b));

      if (createdBooking && createdBooking._id === reschedulingBooking._id) {
        setCreatedBooking({
          ...createdBooking,
          date: rescheduleDate,
          startTime: rescheduleTime,
          endTime: updated.endTime,
          status: 'pending' as const
        });
      }

      alert('Appointment successfully rescheduled! It has been set to pending for review.');
      setReschedulingBooking(null);
    } catch (err: any) {
      alert(err.message || 'Failed to reschedule appointment.');
    } finally {
      setRescheduleSubmitting(false);
    }
  };

  // Auto-launch reschedule modal if URL has ?action=reschedule or ?reschedule=true
  useEffect(() => {
    if (!createdBooking) return;
    const params = new URLSearchParams(window.location.search);
    const wantsReschedule = params.get('action') === 'reschedule' || params.get('reschedule') === 'true';
    if (
      wantsReschedule &&
      !reschedulingBooking &&
      createdBooking.status !== 'cancelled' &&
      createdBooking.status !== 'completed'
    ) {
      void handleStartReschedule(createdBooking);
    }
  }, [createdBooking]);

  if (renderError) {
    return (
      <div className="p-6 bg-red-50 text-red-950 font-mono space-y-4 min-h-screen">
        <h1 className="text-xl font-bold uppercase tracking-widest text-red-800">⚠️ App Crash Alert</h1>
        <p className="font-bold border-b border-red-200 pb-2">{renderError.message}</p>
        <pre className="text-xs bg-red-100/50 p-4 overflow-auto max-h-[400px] whitespace-pre-wrap leading-relaxed">{renderError.stack}</pre>
      </div>
    );
  }



  if (tenantLoading) {
    return (
      <div className="min-h-screen bg-brand-white flex flex-col items-center justify-center font-sans">
        <div className="space-y-4 text-center">
          <div className="w-12 h-12 border-4 border-brand-black border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: 'var(--brand-color, #1F1F1F) transparent var(--brand-color, #1F1F1F) var(--brand-color, #1F1F1F)' }} />
          <p className="text-[11px] font-black uppercase tracking-widest text-brand-gray-500">Loading salon details...</p>
        </div>
      </div>
    );
  }

  if (viewMode === 'select') {
    return <TenantSelectView />;
  }

  if (viewMode === 'register') {
    return <TenantRegisterView />;
  }

  if (tenantError) {
    return (
      <div className="min-h-screen bg-brand-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="border border-brand-gray-100 bg-white p-8 space-y-6 shadow-2xl max-w-sm text-center rounded-xl">
          <div className="text-red-500 font-bold text-3xl">⚠️ Error</div>
          <p className="text-sm text-brand-gray-600 font-medium">{tenantError}</p>
          <button
            onClick={() => navigate('select')}
            className="w-full bg-brand-black text-white py-3 rounded-full font-semibold uppercase tracking-wider text-xs shadow-md hover:bg-brand-gray-800 transition-all cursor-pointer"
          >
            Go back to Selector
          </button>
        </div>
      </div>
    );
  }

  try {
    return (
      <div className={`min-h-screen ${viewMode === 'admin' && ownerToken ? 'w-full lg:max-w-none' : 'max-w-lg'} mx-auto bg-brand-white relative flex flex-col font-sans tracking-tight`}>
        <AnimatePresence>
          {apiError && (
            <motion.div
              initial={{ opacity: 0, y: -50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-[85%] max-w-sm"
            >
              <div className="bg-brand-black/95 backdrop-blur-xl text-white px-4 py-3 flex items-center gap-3 shadow-2xl border border-white/10 rounded-xl">
                <button
                  onClick={() => setApiError(null)}
                  className="w-8 h-8 bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center rounded-full shrink-0"
                >
                  <X size={14} className="text-white" />
                </button>
                <div className="flex-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-60 mb-0.5">System Alert</p>
                  <p className="text-xs font-medium tracking-tight leading-snug">{apiError}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="fixed top-6 left-1/2 -translate-x-1/2 z-[250] w-[85%] max-w-xs pointer-events-none"
            >
              <div className={`px-4 py-3 flex items-center gap-3 shadow-xl rounded-xl border text-white ${toast.type === 'success' ? 'bg-[#2E7D32]/95 border-[#4CAF50]/20' : 'bg-[#C62828]/95 border-[#EF5350]/20'
                }`}>
                {toast.type === 'success' ? (
                  <CheckCircle2 size={16} className="text-white shrink-0" />
                ) : (
                  <X size={16} className="text-white shrink-0" />
                )}
                <p className="text-xs font-bold tracking-tight leading-snug">{toast.message}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <InstallPrompt />

        {showNotificationPrompt && (
          <NotificationPrompt
            customerPhone={clientInfo.phone}
            onDismiss={() => setShowNotificationPrompt(false)}
            description="Get notified when your booking is approved or updated."
          />
        )}

        <CustomerAccountModal
          isOpen={showCustomerAccountModal}
          onClose={() => setShowCustomerAccountModal(false)}
          clientInfo={clientInfo}
          onUpdateClientInfo={info => setClientInfo(info)}
          onViewBookingDetails={handleViewBookingDetails}
          onRescheduleBooking={b => {
            handleStartReschedule(b);
            setActiveStep('lookup');
          }}
          formatPrice={formatPrice}
        />

        {/* ── Password Reset Overlay (when opened via email link) ── */}
        <AnimatePresence>
          {urlResetToken && urlResetSlug && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[300] flex items-center justify-center bg-brand-black/70 backdrop-blur-md px-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-brand-white w-full max-w-sm border-2 border-brand-black p-8 rounded-2xl space-y-6"
              >
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-gray-400">Security</p>
                  <h2 className="text-2xl font-serif font-black uppercase tracking-tight">Set New Password</h2>
                  <p className="text-[11px] font-bold text-brand-gray-500">Salon ID: <span className="text-brand-black">{urlResetSlug}</span></p>
                </div>

                <form
                  onSubmit={async e => {
                    e.preventDefault();
                    setResetError(null);
                    if (resetNewPassword !== resetConfirmPassword) {
                      setResetError('Passwords do not match');
                      return;
                    }
                    if (resetNewPassword.length < 8) {
                      setResetError('Password must be at least 8 characters');
                      return;
                    }
                    setResetLoading(true);
                    try {
                      const result = await api.resetOwnerPassword(urlResetSlug, urlResetToken, resetNewPassword);
                      localStorage.setItem('ownerToken', result.token);
                      localStorage.setItem('ownerTenantSlug', result.tenant.slug);
                      setOwnerToken(result.token);
                      api.setApiTenantSlug(result.tenant.slug);
                      api.setApiAuthToken(result.token);
                      setTenant(result.tenant);
                      setUserMode('owner');
                      setUrlResetToken(null);
                      setUrlResetSlug(null);
                      // Clear URL search params
                      window.history.replaceState({}, document.title, window.location.pathname);
                      navigate('admin', result.tenant.slug);
                    } catch (err: any) {
                      setResetError(err.message || 'Failed to reset password');
                    } finally {
                      setResetLoading(false);
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-gray-600">New Password</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={resetNewPassword}
                      onChange={e => { setResetNewPassword(e.target.value); setResetError(null); }}
                      placeholder="8+ characters"
                      className="w-full border-b-2 border-brand-gray-200 focus:border-brand-black focus:outline-none py-2.5 font-medium text-sm bg-transparent"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-gray-600">Confirm Password</label>
                    <input
                      type="password"
                      required
                      value={resetConfirmPassword}
                      onChange={e => { setResetConfirmPassword(e.target.value); setResetError(null); }}
                      placeholder="••••••••"
                      className="w-full border-b-2 border-brand-gray-200 focus:border-brand-black focus:outline-none py-2.5 font-medium text-sm bg-transparent"
                    />
                  </div>

                  {resetError && (
                    <p className="text-[11px] font-black uppercase tracking-widest text-red-500">{resetError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full py-4 text-xs font-black uppercase tracking-widest bg-brand-black text-white hover:bg-brand-gray-700 transition-all disabled:opacity-50"
                  >
                    {resetLoading ? 'Updating Password...' : 'Save New Password & Log In'}
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <header className={`px-4 sm:px-8 py-6 sm:py-10 flex justify-between items-center bg-brand-white sticky top-0 z-40 border-b border-brand-gray-100 ${viewMode === 'admin' && ownerToken ? 'lg:hidden' : ''}`}>
          <div className="flex items-center gap-5 cursor-pointer group" onClick={handleLogoClick} title="Go to Services Page">
            <div className="h-16 w-16 flex items-center justify-center transition-transform duration-500 group-hover:scale-105">
              <img
                src={tenant?.branding?.logoUrl || "/logo-bg.jpg"}
                alt={tenant?.name || "Salon Logo"}
                className="h-full w-auto object-contain rounded-full"
              />
            </div>
            {/* Show attendant name badge when in staff mode */}
            {userMode === 'attendant' && attendantSession && (
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-brand-black" />
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-gray-600">{attendantSession.name}</span>
              </div>
            )}
            {/* Show admin badge when in owner mode */}
            {userMode === 'owner' && (
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-gray-600">Admin Portal</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {userMode === 'customer' && activeStep !== 'lookup' && (
              <button
                onClick={() => {
                  if (!lookupReference) {
                    try {
                      const savedRef = localStorage.getItem('lastBookingReference');
                      if (savedRef) setLookupReference(savedRef);
                      const savedPhone = localStorage.getItem('lastBookingPhone') || clientInfo.phone;
                      if (savedPhone) setLookupPhone(savedPhone);
                    } catch { }
                  }
                  setActiveStep('lookup');
                }}
                title="Lookup your bookings"
                className="p-3 bg-brand-gray-50 rounded-full hover:bg-brand-black hover:text-white transition-all duration-500"
              >
                <Search size={18} />
              </button>
            )}
            {userMode === 'customer' && (
              <a href={`tel:${tenant?.supportPhone || "0721530120"}`} className="p-3 bg-brand-gray-50 rounded-full hover:bg-brand-black hover:text-white transition-all duration-500">
                <Phone size={18} />
              </a>
            )}
            <NotificationCenter
              onNavigate={handleNotificationNavigate}
              token={userMode === 'owner' ? (ownerToken || undefined) : userMode === 'attendant' ? (attendantSession?.token || undefined) : undefined}
              ownerPin={userMode === 'owner' ? ownerSessionPin : undefined}
            />
            {userMode !== 'customer' && (
              <>
                <button
                  type="button"
                  onClick={() => navigate('customer', tenantSlug || undefined)}
                  title="View Live Salon"
                  className="px-3.5 py-2 text-xs font-black uppercase tracking-wider rounded-full bg-brand-gray-50 border border-brand-gray-200 hover:bg-brand-black hover:text-white transition-all"
                >
                  Live Salon
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (userMode === 'attendant') {
                      localStorage.removeItem('attendantToken');
                      setAttendantSession(null);
                      navigate('staff', tenantSlug || undefined);
                    } else {
                      localStorage.removeItem('ownerToken');
                      setOwnerToken(null);
                      navigate('admin', tenantSlug || undefined);
                    }
                    api.setApiAuthToken(null);
                  }}
                  title="Sign Out"
                  className="p-3 bg-brand-gray-50 rounded-full hover:bg-red-600 hover:text-white transition-all duration-300"
                >
                  <LogOut size={16} />
                </button>
              </>
            )}
            {userMode === 'customer' && (
              <button
                type="button"
                onClick={() => setShowCustomerAccountModal(true)}
                title="My Account & Bookings"
                aria-label="My Account & Bookings"
                className="p-3 bg-brand-gray-50 rounded-full hover:bg-brand-black hover:text-white transition-all duration-500 relative"
              >
                <CircleUserRound size={19} />
                {clientInfo.name && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-brand-white" />
                )}
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 flex flex-col">
          {viewMode === 'admin' ? (
            ownerToken ? (
              <AdminView bookings={bookings} ownerPin={ownerSessionPin} ownerToken={ownerToken} triggerToast={triggerToast} />
            ) : (
              <AdminPortal
                initialTab="owner"
                onOwnerLoginSuccess={(token, t) => {
                  setOwnerToken(token);
                  setTenant(t);
                  setUserMode('owner');
                  navigate('admin', t.slug);
                }}
                onStaffLoginSuccess={(session) => {
                  setAttendantSession(session);
                  setUserMode('attendant');
                  navigate('staff');
                }}
              />
            )
          ) : viewMode === 'staff' ? (
            attendantSession ? (
              <AttendantView session={attendantSession} />
            ) : (
              <AdminPortal
                initialTab="staff"
                onOwnerLoginSuccess={(token, t) => {
                  setOwnerToken(token);
                  setTenant(t);
                  setUserMode('owner');
                  navigate('admin', t.slug);
                }}
                onStaffLoginSuccess={(session) => {
                  setAttendantSession(session);
                  setUserMode('attendant');
                  navigate('staff');
                }}
              />
            )
          ) : (
            <div className="flex-1 flex flex-col">
              {activeStep !== 'confirmation' && activeStep !== 'lookup' && (
                <div className="bg-brand-white px-8 pt-6 pb-12">
                  <StepIndicator activeStep={activeStep} />
                </div>
              )}

              <div className="flex-1 px-8 pb-12 overflow-x-hidden">
                <AnimatePresence mode="wait">
                  {activeStep === 'service' && (
                    <motion.div
                      key="service"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-8"
                    >
                      <div className="space-y-4">
                        <div className="relative group">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6E5660]" size={16} />
                          <input
                            type="text"
                            placeholder="Search services..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#FFF0F3] border border-[#F0D5DE] rounded-full py-3.5 pl-12 pr-10 focus:outline-none focus:border-[#C4466F] focus:bg-white transition-all font-semibold text-[15px] text-[#1A1215] placeholder:text-[#6E5660]/70"
                          />
                          {searchQuery && (
                            <button
                              onClick={() => setSearchQuery('')}
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6E5660] hover:text-[#1A1215]"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Category Chips */}
                      <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">
                        {['All Services', 'Hair Care', 'Sisterlocks', 'Treatments'].map((cat, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              if (cat === 'All Services') setSearchQuery('');
                              else setSearchQuery(cat.split(' ')[0]);
                            }}
                            className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300 border ${(cat === 'All Services' && !searchQuery) || (searchQuery && cat.toLowerCase().includes(searchQuery.toLowerCase()))
                              ? 'bg-[#C4466F] text-white border-[#C4466F] shadow-sm'
                              : 'bg-white text-[#523E46] border-[#F0D5DE] hover:border-[#C4466F]'
                              }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-col gap-3 pb-24">
                        {isLoading ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <ServiceSelectionCardSkeleton key={i} />
                          ))
                        ) : filteredServices.length > 0 ? (
                          <>
                            {filteredServices.map(service => {
                              const selectedIndex = selectedServices.findIndex(s => s._id === service._id);
                              const isSelected = selectedIndex !== -1;
                              const selectionOrder = isSelected ? selectedIndex + 1 : null;
                              return (
                                <ServiceSelectionCard
                                  key={service._id}
                                  service={service}
                                  isSelected={isSelected}
                                  selectionOrder={selectionOrder}
                                  onSelect={() => handleToggleService(service)}
                                />
                              );
                            })}

                            {/* Skeleton cards underneath cached top services while client internet is fetching fresh services */}
                            {isSyncingServices && !searchQuery && (
                              <div className="space-y-3 pt-2">
                                <div className="flex items-center gap-2 px-1 text-[11px] font-semibold text-[#8C6D77] animate-pulse">
                                  <Loader2 size={12} className="animate-spin text-[#C4466F]" />
                                  <span>Loading additional services...</span>
                                </div>
                                {Array.from({ length: 2 }).map((_, i) => (
                                  <ServiceSelectionCardSkeleton key={`sync-skel-${i}`} />
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="py-12 text-center border border-dashed border-[#F0D5DE] rounded-2xl bg-white">
                            <p className="text-[#523E46] text-sm font-medium">No services found matching your criteria.</p>
                          </div>
                        )}
                      </div>
                      <AnimatePresence>
                        {selectedServices.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 50, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 50, scale: 0.95 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                            className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-lg px-6 z-50"
                          >
                            <div className="bg-[#1A1215] text-white p-4.5 rounded-2xl shadow-2xl border border-white/10 backdrop-blur-md space-y-3">
                              {selectedServices.length === 2 && (
                                <div className="flex items-center justify-between text-xs border-b border-white/10 pb-2.5">
                                  <span className="text-white/80 truncate pr-2">
                                    <strong className="text-white">1st:</strong> {selectedServices[0].name} ➔ <strong className="text-white">2nd:</strong> {selectedServices[1].name}
                                  </span>
                                  <button
                                    onClick={handleSwapServices}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white font-medium transition-colors cursor-pointer shrink-0"
                                    title="Swap which service comes first"
                                  >
                                    <ArrowUpDown size={12} />
                                    <span>Swap Order</span>
                                  </button>
                                </div>
                              )}
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs text-white/60 uppercase tracking-wider font-semibold">
                                    {selectedServices.length === 1 ? '1 Service Selected' : '2 Services Selected'}
                                  </p>
                                  <p className="text-sm font-bold text-white mt-0.5">
                                    KES {totalServicePrice.toLocaleString()} • {Math.floor(totalServiceDuration / 60) > 0 ? `${Math.floor(totalServiceDuration / 60)}h ` : ''}{totalServiceDuration % 60 > 0 ? `${totalServiceDuration % 60}m` : ''}
                                  </p>
                                </div>
                                <button
                                  onClick={() => navigateStep('date')}
                                  className="bg-[#C4466F] text-white px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider hover:bg-[#A83257] active:scale-95 transition-all cursor-pointer shadow-lg"
                                >
                                  {selectedServices.length === 1 ? 'Continue (1)' : 'Continue (2)'}
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {activeStep === 'date' && (
                    <motion.div
                      key="datetime"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      <DateTimeSelectionScreen
                        selectedServices={selectedServices}
                        selectedAttendant={selectedAttendant}
                        onSelectAttendant={setSelectedAttendant}
                        selectedDate={selectedDate}
                        onSelectDate={setSelectedDate}
                        selectedTime={selectedTime}
                        onSelectTime={setSelectedTime}
                        timeSlots={timeSlots}
                        multiSlotOptions={multiSlotOptions}
                        totalPrice={totalServicePrice}
                        totalDuration={totalServiceDuration}
                        attendants={attendants}
                        isLoadingSlots={isLoadingSlots}
                        onContinue={() => navigateStep('contact')}
                        onBack={() => navigateStep('service')}
                      />
                    </motion.div>
                  )}




                  {activeStep === 'contact' && (
                    <motion.div
                      key="contact"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-12"
                    >
                      <button onClick={handleStepBack} className="flex items-center gap-3 text-brand-black hover:translate-x-[-4px] transition-all duration-300">
                        <ArrowLeft size={16} strokeWidth={3} />
                        <span className="text-sm font-black uppercase tracking-[0.2em]">Previous</span>
                      </button>

                      <div className="space-y-10">
                        <section className="bg-brand-gray-50 p-6 sm:p-8 flex items-center justify-between rounded-2xl border border-brand-gray-100 shadow-xs">
                          <div className="space-y-1">
                            <p className="text-xs uppercase font-bold tracking-wider text-brand-gray-600">Appointment Detail</p>
                            <p className="font-serif text-2xl font-bold leading-snug text-brand-black">
                              {selectedServices.map(s => s.name).join(' + ')}
                            </p>
                            <p className="text-xs font-semibold text-brand-gray-500 mt-2">
                              {new Date(selectedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at {selectedTime}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-black tracking-tight text-brand-black">
                              KES {totalServicePrice.toLocaleString()}
                            </p>
                            <p className="text-xs text-brand-gray-500 font-semibold mt-0.5">
                              {Math.floor(totalServiceDuration / 60) > 0 ? `${Math.floor(totalServiceDuration / 60)}h ` : ''}{totalServiceDuration % 60 > 0 ? `${totalServiceDuration % 60}m` : ''}
                            </p>
                          </div>
                        </section>

                        <section className="space-y-8">
                          <div className="space-y-2">
                            <h2 className="text-3xl sm:text-4xl font-serif font-black tracking-tight text-brand-black">Client Details</h2>
                            <div className="w-12 h-1 bg-primary rounded-full"></div>
                          </div>
                          <div className="space-y-6">
                            <div className="space-y-2 group">
                              <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600 group-focus-within:text-brand-black transition-colors">Full Name</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="e.g. Jane Doe"
                                  value={clientInfo.name}
                                  onChange={e => setClientInfo(prev => ({ ...prev, name: e.target.value }))}
                                  className="w-full bg-transparent border-b-2 border-brand-gray-100 py-3.5 focus:outline-none focus:border-primary transition-all font-semibold text-base text-brand-black placeholder:text-brand-gray-400/50"
                                />
                              </div>
                            </div>
                            <div className="space-y-2 group">
                              <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600 group-focus-within:text-brand-black transition-colors">Phone Number</label>
                              <div className="relative">
                                <input
                                  type="tel"
                                  placeholder="e.g. 0712 345 678"
                                  value={clientInfo.phone}
                                  onChange={e => setClientInfo(prev => ({ ...prev, phone: e.target.value }))}
                                  className="w-full bg-transparent border-b-2 border-brand-gray-100 py-3.5 focus:outline-none focus:border-primary transition-all font-semibold text-base text-brand-black placeholder:text-brand-gray-400/50"
                                />
                              </div>
                            </div>
                            <div className="space-y-2 group">
                              <label className="text-xs font-bold uppercase tracking-wider text-brand-gray-600 group-focus-within:text-brand-black transition-colors">Email Address</label>
                              <div className="relative">
                                <input
                                  type="email"
                                  placeholder="e.g. jane@example.com"
                                  value={clientInfo.email}
                                  onChange={e => setClientInfo(prev => ({ ...prev, email: e.target.value }))}
                                  className="w-full bg-transparent border-b-2 border-brand-gray-100 py-3.5 focus:outline-none focus:border-primary transition-all font-semibold text-base text-brand-black placeholder:text-brand-gray-400/50"
                                />
                              </div>
                            </div>
                          </div>
                        </section>
                      </div>

                      <button
                        disabled={!clientInfo.name || !clientInfo.phone || !clientInfo.email || isOffline || isSubmittingBooking}
                        onClick={handleConfirmBooking}
                        aria-busy={isSubmittingBooking}
                        className="w-full bg-brand-black hover:bg-black text-brand-white py-5 rounded-xl font-bold uppercase tracking-wider text-xs transition-all shadow-md disabled:opacity-30 active:scale-[0.99] flex items-center justify-center gap-3 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {isOffline ? (
                          'Offline - Booking Disabled'
                        ) : isSubmittingBooking ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-brand-white shrink-0" />
                            <span>Finalizing Booking...</span>
                          </>
                        ) : (
                          'Finalize Booking'
                        )}
                      </button>
                    </motion.div>
                  )}

                  {activeStep === 'confirmation' && (
                    <motion.div
                      key="confirmation"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center justify-center py-8 sm:py-12 text-center space-y-8 sm:space-y-10 max-w-xl mx-auto"
                    >
                      {/* 1. Status Seal, Heading, Badge & Concierge Subtitle */}
                      <div className="space-y-4">
                        {createdBooking?.status === 'confirmed' ? (
                          <div className="flex flex-col items-center space-y-3">
                            <div className="relative">
                              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/90 shadow-glass flex items-center justify-center">
                                <CheckCircle2 size={32} strokeWidth={2.2} />
                              </div>
                              <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#C4466F] text-white flex items-center justify-center shadow-xs">
                                <Sparkles size={12} />
                              </span>
                            </div>

                            <div
                              role="status"
                              aria-live="polite"
                              className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-[0.2em] bg-emerald-50 text-emerald-900 border border-emerald-200/80 shadow-2xs"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" aria-hidden="true" />
                              <span>Reserved & Confirmed</span>
                            </div>

                            <h2
                              ref={confirmationHeadingRef}
                              tabIndex={-1}
                              className="text-3xl sm:text-4xl font-serif font-black tracking-tight leading-tight text-[#231F1D] outline-none focus:outline-none"
                            >
                              Appointment Confirmed
                            </h2>

                            <div className="flex items-center justify-center gap-2 text-rose-300/80 my-1" aria-hidden="true">
                              <span className="w-8 h-[1px] bg-gradient-to-r from-transparent to-[#C4466F]/40" />
                              <Sparkles size={12} className="text-[#C4466F]" />
                              <span className="w-8 h-[1px] bg-gradient-to-l from-transparent to-[#C4466F]/40" />
                            </div>

                            <p className="text-[#6E655F] font-medium text-sm sm:text-base max-w-md mx-auto leading-relaxed">
                              Your appointment has been approved! We look forward to welcoming you to Flo Sisterlocks.
                            </p>
                          </div>
                        ) : createdBooking?.status === 'cancelled' ? (
                          <div className="flex flex-col items-center space-y-3">
                            <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-700 border border-rose-200/90 shadow-glass flex items-center justify-center">
                              <AlertCircle size={32} strokeWidth={2.2} />
                            </div>

                            <div
                              role="status"
                              aria-live="polite"
                              className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-[0.2em] bg-rose-50 text-rose-900 border border-rose-200/80 shadow-2xs"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-600" aria-hidden="true" />
                              <span>Cancelled</span>
                            </div>

                            <h2
                              ref={confirmationHeadingRef}
                              tabIndex={-1}
                              className="text-3xl sm:text-4xl font-serif font-black tracking-tight leading-tight text-[#231F1D] outline-none focus:outline-none"
                            >
                              Appointment Cancelled
                            </h2>

                            <div className="flex items-center justify-center gap-2 text-rose-300/80 my-1" aria-hidden="true">
                              <span className="w-8 h-[1px] bg-gradient-to-r from-transparent to-rose-400/40" />
                              <AlertCircle size={12} className="text-rose-500" />
                              <span className="w-8 h-[1px] bg-gradient-to-l from-transparent to-rose-400/40" />
                            </div>

                            <p className="text-[#6E655F] font-medium text-sm sm:text-base max-w-md mx-auto leading-relaxed">
                              This appointment has been cancelled or declined by the salon.
                            </p>
                          </div>
                        ) : createdBooking?.status === 'completed' ? (
                          <div className="flex flex-col items-center space-y-3">
                            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/90 shadow-glass flex items-center justify-center">
                              <Sparkles size={32} strokeWidth={2.2} />
                            </div>

                            <div
                              role="status"
                              aria-live="polite"
                              className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-[0.2em] bg-emerald-50 text-emerald-900 border border-emerald-200/80 shadow-2xs"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
                              <span>Completed</span>
                            </div>

                            <h2
                              ref={confirmationHeadingRef}
                              tabIndex={-1}
                              className="text-3xl sm:text-4xl font-serif font-black tracking-tight leading-tight text-[#231F1D] outline-none focus:outline-none"
                            >
                              Appointment Completed
                            </h2>

                            <div className="flex items-center justify-center gap-2 text-rose-300/80 my-1" aria-hidden="true">
                              <span className="w-8 h-[1px] bg-gradient-to-r from-transparent to-[#C4466F]/40" />
                              <Sparkles size={12} className="text-[#C4466F]" />
                              <span className="w-8 h-[1px] bg-gradient-to-l from-transparent to-[#C4466F]/40" />
                            </div>

                            <p className="text-[#6E655F] font-medium text-sm sm:text-base max-w-md mx-auto leading-relaxed">
                              Thank you for visiting Flo Sisterlocks! We look forward to seeing you again.
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center space-y-3">
                            <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-700 border border-amber-200/90 shadow-glass flex items-center justify-center">
                              <Clock size={32} strokeWidth={2.2} className="animate-pulse" />
                            </div>

                            <div
                              role="status"
                              aria-live="polite"
                              className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-[0.2em] bg-amber-50 text-amber-900 border border-amber-200/80 shadow-2xs"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" aria-hidden="true" />
                              <span>Pending Salon Approval</span>
                            </div>

                            <h2
                              ref={confirmationHeadingRef}
                              tabIndex={-1}
                              className="text-3xl sm:text-4xl font-serif font-black tracking-tight leading-tight text-[#231F1D] outline-none focus:outline-none"
                            >
                              Request Received
                            </h2>

                            <div className="flex items-center justify-center gap-2 text-rose-300/80 my-1" aria-hidden="true">
                              <span className="w-8 h-[1px] bg-gradient-to-r from-transparent to-[#C4466F]/40" />
                              <Sparkles size={12} className="text-[#C4466F]" />
                              <span className="w-8 h-[1px] bg-gradient-to-l from-transparent to-[#C4466F]/40" />
                            </div>

                            <p className="text-[#6E655F] font-medium text-sm sm:text-base max-w-md mx-auto leading-relaxed">
                              The salon team will review and confirm your appointment slot shortly.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* 2. Official Salon Pass / Reference Card */}
                      <div className="w-full relative overflow-hidden bg-white/90 backdrop-blur-md border border-[rgba(240,213,222,0.85)] rounded-2xl p-6 sm:p-7 text-left shadow-luxury transition-all duration-300">
                        {/* Decorative subtle luxury accent bar on top */}
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#C4466F] via-[#D4A359] to-[#C4466F] opacity-80" />

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md bg-[#C4466F]/10 text-[#C4466F] text-[9px] font-extrabold uppercase tracking-widest border border-[#C4466F]/20 flex items-center gap-1">
                                <Sparkles size={10} />
                                <span>Salon Pass</span>
                              </span>
                              <span className="text-[10px] uppercase tracking-[0.2em] font-extrabold text-[#6E655F]">
                                Booking Reference
                              </span>
                            </div>
                            <p className="text-2xl sm:text-3xl font-mono font-black tracking-wider text-[#231F1D]">
                              #{createdBooking?.reference || 'PENDING'}
                            </p>
                            <p className="text-xs text-[#6E655F]">
                              Present this pass code upon arrival or use it to view booking status.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={handleCopyReference}
                            className={`inline-flex items-center justify-center gap-2 self-start sm:self-auto px-5 py-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all duration-200 active:scale-95 shadow-2xs min-h-[44px] cursor-pointer ${
                              copiedReference
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-[#FAF8F5] text-[#231F1D] border-[rgba(240,213,222,0.9)] hover:bg-[#231F1D] hover:text-white hover:border-[#231F1D]'
                            }`}
                            aria-label={copiedReference ? 'Reference copied to clipboard' : 'Copy reference to clipboard'}
                          >
                            {copiedReference ? (
                              <>
                                <Check size={15} className="stroke-[2.5]" aria-hidden="true" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy size={15} aria-hidden="true" />
                                <span>Copy Pass</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* 3. Appointment Information & Next Steps */}
                      <div className="w-full bg-white/70 backdrop-blur-sm border border-[rgba(240,213,222,0.85)] rounded-2xl p-6 sm:p-7 text-left space-y-4 shadow-2xs">
                        <div className="flex items-center justify-between border-b border-[rgba(240,213,222,0.6)] pb-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-[#C4466F]/10 text-[#C4466F] flex items-center justify-center">
                              <Calendar size={14} />
                            </div>
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#231F1D]">
                              {createdBooking?.status === 'confirmed' ? 'Appointment Information' : 'What Happens Next'}
                            </h3>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[#C4466F] bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-100/80">
                            Concierge Guide
                          </span>
                        </div>

                        {createdBooking?.status === 'confirmed' ? (
                          <div className="grid gap-3 pt-1">
                            {/* Confirmed Slot */}
                            <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-[#FAF8F5]/80 border border-[rgba(240,213,222,0.6)] transition-all">
                              <div className="shrink-0 w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/90 flex items-center justify-center shadow-2xs">
                                <CheckCircle2 size={16} strokeWidth={2.2} />
                              </div>
                              <div className="text-xs sm:text-sm text-[#6E655F] leading-relaxed">
                                <span className="font-bold text-[#231F1D] block">Your appointment is officially confirmed.</span>
                                Your designated slot has been locked in our schedule.
                              </div>
                            </div>

                            {/* Assigned Stylist */}
                            {createdBooking?.attendantId && typeof createdBooking.attendantId === 'object' && (
                              <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-[#FAF8F5]/80 border border-[rgba(240,213,222,0.6)] transition-all">
                                <div className="shrink-0 w-8 h-8 rounded-xl bg-[#C4466F]/10 text-[#C4466F] border border-[#C4466F]/20 flex items-center justify-center shadow-2xs">
                                  <UserCheck size={16} strokeWidth={2.2} />
                                </div>
                                <div className="text-xs sm:text-sm text-[#6E655F] leading-relaxed">
                                  <span className="font-bold text-[#231F1D] block">Assigned Specialist Stylist</span>
                                  <span className="inline-flex items-center gap-1.5 font-bold text-[#C4466F] bg-white px-2.5 py-1 rounded-lg border border-rose-100/80 mt-1 shadow-2xs">
                                    <Sparkles size={12} />
                                    {(createdBooking.attendantId as any).name}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Early Arrival */}
                            <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-[#FAF8F5]/80 border border-[rgba(240,213,222,0.6)] transition-all">
                              <div className="shrink-0 w-8 h-8 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/90 flex items-center justify-center shadow-2xs">
                                <Clock size={16} strokeWidth={2.2} />
                              </div>
                              <div className="text-xs sm:text-sm text-[#6E655F] leading-relaxed">
                                <span className="font-bold text-[#231F1D] block">Arrival Guidance</span>
                                Please arrive <strong className="text-[#231F1D]">5 minutes early</strong> to relax and ensure a smooth start to your session.
                              </div>
                            </div>
                          </div>
                        ) : createdBooking?.status === 'cancelled' ? (
                          <div className="p-4 rounded-xl bg-rose-50/80 border border-rose-200/70 text-xs sm:text-sm text-rose-900 leading-relaxed flex items-start gap-3">
                            <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold block">This booking was cancelled.</span>
                              If you would like to reschedule or choose an alternative slot, please browse our available appointments below.
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-3 pt-1">
                            <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-[#FAF8F5]/80 border border-[rgba(240,213,222,0.6)]">
                              <div className="shrink-0 w-8 h-8 rounded-xl bg-[#231F1D] text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                                1
                              </div>
                              <div className="text-xs sm:text-sm text-[#6E655F] leading-relaxed">
                                <span className="font-bold text-[#231F1D] block">Salon Team Review</span>
                                Staff will check stylist availability and confirm your designated slot.
                              </div>
                            </div>

                            <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-[#FAF8F5]/80 border border-[rgba(240,213,222,0.6)]">
                              <div className="shrink-0 w-8 h-8 rounded-xl bg-[#C4466F] text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                                2
                              </div>
                              <div className="text-xs sm:text-sm text-[#6E655F] leading-relaxed">
                                <span className="font-bold text-[#231F1D] block">Email & WhatsApp Notification</span>
                                We'll send your confirmation pass{clientInfo.email || createdBooking?.email ? (
                                  <>
                                    {' '}to{' '}
                                    <strong className="text-[#231F1D] underline decoration-[rgba(196,70,111,0.4)] break-all font-semibold">
                                      {createdBooking?.email || clientInfo.email}
                                    </strong>
                                  </>
                                ) : null}{' '}
                                once approved (please check your spam folder).
                              </div>
                            </div>

                            <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-[#FAF8F5]/80 border border-[rgba(240,213,222,0.6)]">
                              <div className="shrink-0 w-8 h-8 rounded-xl bg-[#D4A359] text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                                3
                              </div>
                              <div className="text-xs sm:text-sm text-[#6E655F] leading-relaxed">
                                <span className="font-bold text-[#231F1D] block">Instant Push Alerts</span>
                                If notifications are enabled, you'll also get an instant alert the moment your appointment is approved.
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 4. Details Card */}
                      <div className="bg-white/80 backdrop-blur-md w-full p-6 sm:p-7 text-left space-y-6 border border-[rgba(240,213,222,0.85)] rounded-2xl shadow-luxury">
                        <div className="border-b border-[rgba(240,213,222,0.6)] pb-4 flex flex-row items-center justify-between gap-3">
                          <div>
                            <span className="text-[11px] uppercase tracking-[0.25em] font-black text-[#6E655F] block">
                              Scheduled Date & Time
                            </span>
                            <p className="font-serif font-black text-lg sm:text-xl text-[#231F1D] mt-1">
                              {confirmationFriendlyDate}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="inline-flex items-center justify-center whitespace-nowrap px-4 py-2 bg-[#231F1D] text-white text-xs font-mono font-bold tracking-wider rounded-xl transition-all duration-300 hover:bg-[#C4466F] cursor-default select-none shadow-xs">
                              {confirmationTimeRange}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <p className="text-[11px] uppercase tracking-[0.25em] font-black text-[#6E655F]">
                            Requested Services ({selectedServices.length > 0 ? selectedServices.length : 1})
                          </p>
                          <div className="space-y-3">
                            {selectedServices.length > 0 ? (
                              selectedServices.map((service, idx) => {
                                const selectedOpt = multiSlotOptions.find(o => o.time === selectedTime);
                                const seg = selectedOpt?.segments?.find(s => s.serviceId === service._id);
                                const attendantNameFromBooking = createdBooking?.attendantId && typeof createdBooking.attendantId === 'object'
                                  ? (createdBooking.attendantId as any).name
                                  : null;
                                const artistName = seg?.attendantName || serviceAttendants[service._id]?.name || attendantNameFromBooking || 'Any Available';
                                const serviceTime = seg ? `${seg.startTime} – ${seg.endTime}` : confirmationTimeRange;

                                return (
                                  <div
                                    key={service._id || idx}
                                    className="p-4 bg-[#FAF8F5]/90 border border-[rgba(240,213,222,0.7)] rounded-xl space-y-2 shadow-2xs"
                                  >
                                    <div className="flex justify-between items-start gap-3">
                                      <span className="font-black text-sm uppercase text-[#231F1D] leading-snug">
                                        {service.name}
                                      </span>
                                      <span className="font-bold text-xs text-[#231F1D] shrink-0">
                                        {formatPrice(service.price, service.priceMax)}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6E655F]">
                                      <span className="inline-flex items-center gap-1.5">
                                        <User size={13} className="text-[#C4466F]" />
                                        <span>Artist: <strong className="text-[#231F1D] font-semibold">{artistName}</strong></span>
                                      </span>
                                      <span className="inline-flex items-center gap-1.5">
                                        <Clock size={13} className="text-[#C4466F]" />
                                        <span>{serviceTime}</span>
                                      </span>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="p-4 bg-[#FAF8F5]/90 border border-[rgba(240,213,222,0.7)] rounded-xl space-y-2 shadow-2xs">
                                <div className="flex justify-between items-start gap-3">
                                  <span className="font-black text-sm uppercase text-[#231F1D] leading-snug">
                                    {typeof createdBooking?.serviceId === 'object' && createdBooking?.serviceId ? createdBooking.serviceId.name : 'Appointment'}
                                  </span>
                                  {createdBooking?.price !== undefined && (
                                    <span className="font-bold text-xs text-[#231F1D] shrink-0">
                                      KES {createdBooking.price.toLocaleString()}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6E655F]">
                                  <span className="inline-flex items-center gap-1.5">
                                    <User size={13} className="text-[#C4466F]" />
                                    <span>
                                      Artist:{' '}
                                      <strong className="text-[#231F1D] font-semibold">
                                        {typeof createdBooking?.attendantId === 'object' && createdBooking?.attendantId
                                          ? createdBooking.attendantId.name
                                          : 'Any Available'}
                                      </strong>
                                    </span>
                                  </span>
                                  <span className="inline-flex items-center gap-1.5">
                                    <Clock size={13} className="text-[#C4466F]" />
                                    <span>{confirmationTimeRange}</span>
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="border-t border-[rgba(240,213,222,0.6)] pt-5 flex justify-between items-center">
                          <span className="text-xs uppercase tracking-[0.25em] font-black text-[#6E655F]">
                            Total Cost
                          </span>
                          <span className="font-black text-base sm:text-lg text-[#231F1D]">
                            KES {(totalServicePrice || createdBooking?.price || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* 5. Clear Actions */}
                      <div className="w-full space-y-3 pt-2">
                        {/* Primary: Check booking status */}
                        <button
                          type="button"
                          onClick={() => handleCheckBookingStatus(createdBooking?.reference)}
                          className="w-full bg-[#231F1D] text-white py-4.5 rounded-xl font-black uppercase tracking-[0.2em] text-xs transition-all hover:bg-[#362F2B] active:scale-[0.98] shadow-md flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
                        >
                          <Search size={15} />
                          <span>Check booking status</span>
                        </button>

                        {/* Secondary: Message us on WhatsApp (hidden if supportPhone missing) */}
                        {whatsAppUrl && (
                          <a
                            href={whatsAppUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full bg-[#25D366] text-white py-4 rounded-xl font-black uppercase tracking-[0.2em] text-xs transition-all hover:bg-[#20ba59] active:scale-[0.98] shadow-2xs flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
                          >
                            <MessageCircle size={16} />
                            <span>Message us on WhatsApp</span>
                          </a>
                        )}

                        {/* Tertiary: Book another appointment */}
                        <button
                          type="button"
                          onClick={resetFlow}
                          className="w-full bg-white/80 border border-[rgba(240,213,222,0.9)] text-[#231F1D] py-4 rounded-xl font-black uppercase tracking-[0.2em] text-xs transition-all hover:bg-[#231F1D] hover:text-white active:scale-[0.98] cursor-pointer min-h-[48px]"
                        >
                          Book another appointment
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {activeStep === 'lookup' && (
                    <motion.div
                      key="lookup"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-8"
                    >
                      <div className="flex justify-between items-center border-b border-brand-black pb-4">
                        <h2 className="text-3xl font-serif font-black uppercase tracking-tight">Lookup Booking</h2>
                        <button
                          onClick={resetFlow}
                          className="text-xs font-black uppercase tracking-widest bg-brand-gray-50 border border-brand-gray-200 py-2 px-3 hover:bg-brand-black hover:text-white transition-all"
                        >
                          Back
                        </button>
                      </div>

                      {/* Reschedule Overlay Panel */}
                      {reschedulingBooking && (
                        <div className="border-2 border-brand-black bg-brand-white p-6 space-y-6 rounded-lg">
                          <div className="border-b border-brand-black/10 pb-3 flex justify-between items-center">
                            <h3 className="text-sm font-black uppercase tracking-[0.2em]">Reschedule Slot</h3>
                            <span className="text-xs font-serif italic">#{reschedulingBooking.reference}</span>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-widest text-brand-gray-600 mb-2">New Date</label>
                              <input
                                type="date"
                                value={rescheduleDate}
                                min={formatDateInTimezone(Date.now() + 86400000)} // from tomorrow
                                onChange={e => handleRescheduleDateChange(e.target.value)}
                                className="w-full bg-brand-white border-2 border-brand-black p-4 text-[13px] font-black uppercase tracking-widest focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-widest text-brand-gray-600 mb-2">New Time Slot</label>
                              {rescheduleSlotsLoading ? (
                                <div className="text-center py-6 text-xs font-serif italic text-brand-gray-400">Checking availability...</div>
                              ) : rescheduleSlots.length > 0 ? (
                                <div className="grid grid-cols-3 gap-2">
                                  {rescheduleSlots.map(slot => (
                                    <button
                                      key={slot}
                                      type="button"
                                      onClick={() => setRescheduleTime(slot)}
                                      className={`py-3 text-xs font-black tracking-widest border transition-all rounded-lg ${rescheduleTime === slot
                                        ? 'bg-brand-black text-white border-brand-black'
                                        : 'bg-transparent text-brand-black border-brand-gray-200 hover:border-brand-black'
                                        }`}
                                    >
                                      {slot}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-6 text-xs font-serif italic text-brand-gray-400 border border-dashed border-brand-gray-200">
                                  No available slots for this date.
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-2 pt-2">
                            <button
                              type="button"
                              disabled={!rescheduleTime || rescheduleSubmitting}
                              onClick={handleConfirmReschedule}
                              className="flex-1 bg-brand-black text-white py-4 font-black uppercase tracking-[0.2em] text-[11px] transition-all hover:bg-brand-gray-800 disabled:opacity-30 disabled:cursor-not-allowed rounded-[10px]"
                            >
                              {rescheduleSubmitting ? 'Updating...' : 'Confirm Reschedule'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setReschedulingBooking(null)}
                              className="flex-1 bg-transparent border-2 border-brand-black text-brand-black py-4 font-black uppercase tracking-[0.2em] text-[11px] transition-all hover:bg-brand-black hover:text-white rounded-[10px]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {!reschedulingBooking && (
                        <>
                          {/* Search Form (requires reference + phone) */}
                          <form onSubmit={handleLookup} className="space-y-4">
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-widest text-brand-gray-600 mb-2">
                                Booking Reference Number
                              </label>
                              <input
                                type="text"
                                value={lookupReference}
                                onChange={e => setLookupReference(e.target.value)}
                                placeholder="e.g. LMN-ABC123"
                                className="w-full bg-brand-white border-2 border-brand-black p-4 text-[13px] font-black uppercase tracking-widest focus:outline-none placeholder:text-brand-gray-300 animate-none rounded-[10px]"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-widest text-brand-gray-600 mb-2">
                                Phone Number (used during booking)
                              </label>
                              <input
                                type="tel"
                                value={lookupPhone}
                                onChange={e => setLookupPhone(e.target.value)}
                                placeholder="e.g. 0712 345 678"
                                className="w-full bg-brand-white border-2 border-brand-black p-4 text-[13px] font-black uppercase tracking-widest focus:outline-none placeholder:text-brand-gray-300 animate-none rounded-[10px]"
                              />
                            </div>

                            <button
                              type="submit"
                              disabled={lookupLoading || !lookupReference.trim() || !lookupPhone.trim()}
                              className="w-full bg-brand-black text-white py-5 font-black uppercase tracking-[0.2em] text-xs transition-all hover:bg-brand-gray-800 disabled:opacity-30 disabled:cursor-not-allowed rounded-[10px]"
                            >
                              {lookupLoading ? 'Searching...' : 'Find Booking'}
                            </button>
                          </form>

                          {/* Lookup Errors */}
                          {lookupError && (
                            <div className="p-5 border-2 border-dashed border-red-500 bg-red-50/50 text-center">
                              <p className="font-serif italic text-sm text-red-600">{lookupError}</p>
                            </div>
                          )}

                          {/* Results Listing */}
                          {lookupResults.length > 0 && (
                            <div className="space-y-6 pt-4">
                              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-brand-gray-500 border-b border-brand-black/5 pb-2">
                                Appointments Found ({lookupResults.length})
                              </h3>
                              <div className="space-y-4">
                                {lookupResults.map(booking => {
                                  const svc = typeof booking.serviceId === 'object' ? booking.serviceId : null;
                                  const attendant = typeof booking.attendantId === 'object' ? booking.attendantId : null;

                                  return (
                                    <div key={booking._id} className="border-2 border-brand-black p-6 space-y-4 bg-brand-gray-50 rounded-lg">
                                      <div className="flex justify-between items-center border-b border-brand-black/10 pb-3">
                                        <span className="font-black text-xs uppercase italic">#{booking.reference || 'LMN-LEGACY'}</span>
                                        <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 border ${booking.status === 'confirmed'
                                          ? 'bg-green-500 text-white border-green-500'
                                          : booking.status === 'cancelled'
                                            ? 'bg-red-500 text-white border-red-500'
                                            : booking.status === 'completed'
                                              ? 'bg-brand-gray-400 text-white border-brand-gray-400'
                                              : 'bg-yellow-500 text-white border-yellow-500'
                                          }`}>
                                          {booking.status}
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-2 gap-y-3 text-xs">
                                        <div>
                                          <p className="text-[10px] font-black uppercase tracking-widest text-brand-gray-600 mb-1">Service</p>
                                          <p className="font-bold uppercase">{svc ? svc.name : 'Unknown Service'}</p>
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-black uppercase tracking-widest text-brand-gray-600 mb-1">Cost</p>
                                          <p className="font-bold">{svc ? formatPrice(svc.price, svc.priceMax) : 'KES 0'}</p>
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-black uppercase tracking-widest text-brand-gray-600 mb-1">Stylist / Artist</p>
                                          <p className="font-serif italic text-sm">{attendant ? attendant.name : 'Any Available'}</p>
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-black uppercase tracking-widest text-brand-gray-600 mb-1">Schedule</p>
                                          <p className="font-bold">{booking.date} @ {booking.startTime}</p>
                                        </div>
                                      </div>

                                      {/* Action items for active bookings */}
                                      {booking.status !== 'cancelled' && booking.status !== 'completed' && (
                                        <div className="flex gap-2 pt-2 border-t border-brand-black/5">
                                          <button
                                            type="button"
                                            onClick={() => handleStartReschedule(booking)}
                                            className="flex-1 bg-brand-white border border-brand-black text-brand-black py-2.5 font-black uppercase tracking-[0.2em] text-[10px] transition-all hover:bg-brand-black hover:text-white rounded-[10px]"
                                          >
                                            Reschedule
                                          </button>
                                          <button
                                            type="button"
                                            disabled={cancelLoading}
                                            onClick={() => handleCancelBooking(booking._id)}
                                            className="flex-1 bg-transparent border border-red-500 text-red-500 py-2.5 font-black uppercase tracking-[0.2em] text-[10px] transition-all hover:bg-red-500 hover:text-white disabled:opacity-55 rounded-[10px]"
                                          >
                                            Cancel Appt
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Staff & Admin portal footer link */}
              <div className="pt-6 pb-4 text-center">
                <button
                  type="button"
                  onClick={() => navigate('admin', tenantSlug || undefined)}
                  className="text-[10px] font-black uppercase tracking-[0.25em] text-brand-gray-400 hover:text-brand-black transition-colors cursor-pointer"
                >
                  Staff & Admin Portal →
                </button>
              </div>
            </div>
          )}
        </main>

        <AnimatePresence>
          {isOffline && (
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="fixed bottom-0 left-0 right-0 bg-red-500 text-white p-3 flex justify-center items-center gap-2 text-sm font-bold z-50"
            >
              <WifiOff size={16} />
              You are currently offline. Booking is disabled.
            </motion.div>
          )}
        </AnimatePresence>

        <div className="h-1 w-full bg-brand-black mt-auto"></div>
      </div>
    );
  } catch (err: any) {
    return (
      <div className="p-6 bg-red-50 text-red-950 font-mono space-y-4 min-h-screen">
        <h1 className="text-xl font-bold uppercase tracking-widest text-red-800">⚠️ App Render Exception</h1>
        <p className="font-bold border-b border-red-200 pb-2">{err.message}</p>
        <pre className="text-xs bg-red-100/50 p-4 overflow-auto max-h-[400px] whitespace-pre-wrap leading-relaxed">{err.stack}</pre>
      </div>
    );
  }
}

function StepIndicator({ activeStep }: { activeStep: BookingStep }) {
  const steps: { key: BookingStep, label: string }[] = [
    { key: 'service', label: 'Services' },
    { key: 'date', label: 'Date & Time' },
    { key: 'contact', label: 'Details' },
    { key: 'confirmation', label: 'Confirm' }
  ];
  const activeIndex = steps.findIndex(s => s.key === activeStep);

  return (
    <div className="flex items-center justify-between relative max-w-[340px] mx-auto px-2">
      <div className="absolute top-[8px] left-4 right-4 h-[2px] bg-[#F0D5DE] -z-10">
        <div
          className="h-full bg-[#C4466F] transition-all duration-700 ease-out"
          style={{ width: `${(Math.max(0, Math.min(activeIndex, steps.length - 1)) / (steps.length - 1)) * 100}%` }}
        />
      </div>
      {steps.map((step, idx) => {
        const isCompleted = idx < activeIndex;
        const isActive = idx === activeIndex;
        return (
          <div key={idx} className="flex flex-col items-center gap-2">
            <div className={`w-[14px] h-[14px] rounded-full transition-all duration-500 ${isCompleted || isActive ? 'bg-[#C4466F] scale-110 shadow-sm' : 'bg-[#F0D5DE]'}`}></div>
            <span className={`text-[11px] tracking-normal transition-colors duration-500 ${isActive ? 'text-[#1A1215] font-bold' : 'text-[#523E46] font-medium'}`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ServiceSelectionCardSkeleton() {
  return (
    <div className="flex flex-row items-center justify-between p-5 gap-4 rounded-2xl border border-[#F0D5DE] bg-white overflow-hidden animate-pulse">
      <div className="flex-1 space-y-2.5">
        <div className="h-4 w-2/3 bg-[#FCE2EA] rounded-full" />
        <div className="h-3 w-1/3 bg-[#FCE2EA] rounded-full" />
      </div>
      <div className="flex flex-col items-end gap-3">
        <div className="w-5 h-5 rounded-full bg-[#FCE2EA]" />
        <div className="h-3.5 w-14 bg-[#FCE2EA] rounded-full" />
      </div>
    </div>
  );
}

function ServiceSelectionCard({
  service,
  isSelected,
  selectionOrder,
  onSelect,
}: {
  service: Service;
  isSelected: boolean;
  selectionOrder?: number | null;
  onSelect: () => void;
  key?: React.Key;
}) {
  return (
    <motion.div
      whileTap={{ scale: 0.99 }}
      className={`
        flex flex-row items-center justify-between p-5 gap-4 cursor-pointer transition-all duration-300 rounded-2xl border relative overflow-hidden backdrop-blur-md
        ${isSelected
          ? 'bg-[#FFF5F8]/90 border-[#C4466F] shadow-md ring-2 ring-[#C4466F]/25'
          : 'bg-white/80 border-[#F0D5DE] hover:bg-white hover:border-[#C4466F] hover:shadow-xs'}
      `}
      onClick={onSelect}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-sans font-semibold text-[16px] text-[#1A1215] leading-tight transition-transform duration-300">{service.name}</h3>
          {selectionOrder && (
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase text-white shadow-xs ${selectionOrder === 1 ? 'bg-[#C4466F]' : 'bg-[#4A2D35]'}`}>
              {selectionOrder === 1 ? '1st Service' : '2nd Service'}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-xs font-medium text-[#523E46]">
          {service.duration > 60 ? `${Math.round(service.duration / 60)} hrs` : `${service.duration} min`}
        </p>
      </div>
      <div className="flex flex-col items-end gap-3">
        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'border-[#C4466F] bg-[#C4466F]' : 'border-[#F0D5DE] group-hover:border-[#C4466F]'}`}>
          {isSelected && <CheckCircle2 size={12} strokeWidth={3} className="text-white" />}
        </div>
        <p className="font-bold text-sm text-[#1A1215] tracking-tight">{formatPrice(service.price, service.priceMax)}</p>
      </div>
    </motion.div>
  );
}


function DateScroller({ selectedDate, onDateSelect }: { selectedDate: string, onDateSelect: (d: string) => void }) {
  const dates = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, []);

  const months = useMemo(() => {
    const groups: { [key: string]: Date[] } = {};
    dates.forEach(d => {
      const m = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      if (!groups[m]) groups[m] = [];
      groups[m].push(d);
    });
    return Object.entries(groups);
  }, [dates]);

  return (
    <div className="space-y-8 h-[350px] overflow-y-auto pr-2 scrollbar-hide">
      {months.map(([month, monthDates], i) => (
        <div key={i} className="space-y-4">
          <h3 className="text-[13px] font-black uppercase tracking-[0.2em] text-[#3D2D34] border-b border-[#F0D5DE] pb-2">{month}</h3>
          <div className="grid grid-cols-4 gap-3">
            {monthDates.map((d, j) => {
              const dateStr = formatDateInTimezone(d);
              const isSelected = selectedDate === dateStr;
              const dayName = d.toLocaleDateString(undefined, { weekday: 'short' });
              const dayNum = d.toLocaleDateString(undefined, { day: 'numeric' });
              return (
                <button
                  key={j}
                  onClick={() => onDateSelect(dateStr)}
                  className={`flex flex-col items-center justify-center p-4 transition-all duration-300 border rounded-xl ${isSelected
                    ? 'bg-[#1A1215] text-[#FDF8F9] scale-105 border-[#1A1215] shadow-xl ring-2 ring-[#C4466F]/40 z-10'
                    : 'bg-white border-[#F0D5DE] hover:border-[#C4466F] text-[#1A1215]'
                    }`}
                >
                  <span className={`text-[11px] uppercase font-bold tracking-normal leading-none mb-1 ${isSelected ? 'text-[#FCE2EA]' : 'text-[#523E46]'}`}>{dayName}</span>
                  <span className="text-xl font-black italic font-serif leading-none">{dayNum}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── AttendantView ────────────────────────────────────────────────────────────

function AttendantView({ session }: { session: { _id: string; name: string; token: string } }) {
  const { tenant, loading: tenantLoading } = useTenant();
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'completed'>('today');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const attendantPush = useAttendantPushNotifications(session.token);

  const todayStr = getTodayDateString();

  useEffect(() => {
    if (tenantLoading || !tenant) return;

    const load = async () => {
      setLoading(true);
      try {
        let data: Booking[] = [];
        if (activeTab === 'today') {
          data = await api.getAttendantBookings(session.token, { date: todayStr, status: 'confirmed' });
        } else if (activeTab === 'upcoming') {
          data = await api.getAttendantBookings(session.token, { status: 'confirmed' });
          data = data.filter(b => b.date > todayStr);
        } else {
          data = await api.getAttendantBookings(session.token, { status: 'completed' });
        }
        setBookings(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tenantLoading, tenant?._id, activeTab, session.token]);

  const handleMarkComplete = async (bookingId: string) => {
    setMarkingId(bookingId);
    try {
      await api.markBookingCompleted(session.token, bookingId);
      setBookings(prev => prev.filter(b => b._id !== bookingId));
    } catch (err: any) {
      alert(err.message || 'Failed to mark complete');
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Tab Navigation */}
      <nav className="border-b border-brand-gray-100 bg-brand-white">
        <div className="flex overflow-x-auto scrollbar-hide px-4 sm:px-8 gap-6 sm:gap-8 flex-nowrap">
          {(['today', 'upcoming', 'completed'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3.5 sm:py-4 text-[12px] sm:text-[13px] font-black uppercase tracking-[0.2em] relative transition-all whitespace-nowrap ${activeTab === tab ? 'text-brand-black font-extrabold' : 'text-brand-gray-400 hover:text-brand-black'
                }`}
            >
              {tab}
              {activeTab === tab && (
                <motion.div
                  layoutId="activeAttendantTab"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-black"
                />
              )}
            </button>
          ))}
        </div>

        {/* Attendant push notification toggle */}
        {attendantPush.permission !== 'unsupported' && attendantPush.permission !== 'denied' && (
          <div className="ml-auto flex items-center justify-end gap-2 py-2 sm:py-0 px-4 sm:px-8 border-l border-brand-gray-50">
            <button
              onClick={() => attendantPush.isSubscribed ? attendantPush.unsubscribe(session.token) : attendantPush.subscribe(session.token)}
              disabled={attendantPush.isLoading}
              title={attendantPush.isSubscribed ? 'Disable notifications' : 'Enable notifications'}
              className={`flex items-center gap-1.5 py-2 px-2.5 sm:px-3 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em] transition-all border rounded-[10px] ${attendantPush.isSubscribed
                ? 'bg-brand-black text-white border-brand-black shadow-sm'
                : 'bg-transparent text-brand-gray-400 border-brand-gray-200 hover:border-brand-black hover:text-brand-black'
                } disabled:opacity-40 active:scale-95`}
            >
              {attendantPush.isSubscribed
                ? <><Bell size={12} className="text-white animate-bounce" /> <span className="hidden sm:inline">Notifs On</span></>
                : <><BellOff size={12} /> <span className="hidden sm:inline">Notifs Off</span></>
              }
            </button>
          </div>
        )}
      </nav>

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 sm:py-10 space-y-8 scrollbar-hide">
        <header className="space-y-2">
          <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.4em] text-brand-gray-400">Stylist Panel</p>
          <h2 className="text-3xl sm:text-4xl font-serif font-black tracking-tight leading-none text-brand-black">{session.name}</h2>
          <p className="text-brand-gray-600 font-bold uppercase tracking-[0.2em] text-[11px] sm:text-[12px] pt-1">
            {activeTab === 'today' && `Today's Queue — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' })}`}
            {activeTab === 'upcoming' && 'Upcoming Appointments'}
            {activeTab === 'completed' && 'Completed Work'}
          </p>
        </header>

        <div className="space-y-4">
          {loading ? (
            <div className="p-16 sm:p-20 text-center border border-brand-gray-100 bg-white font-serif italic text-brand-gray-300 shadow-sm">Loading...</div>
          ) : bookings.length === 0 ? (
            <div className="p-16 sm:p-20 text-center border-2 border-dashed border-brand-gray-100 bg-white/50 italic font-serif text-brand-gray-300 shadow-inner">
              {activeTab === 'today' ? 'No appointments today.' :
                activeTab === 'upcoming' ? 'No upcoming appointments.' :
                  'No completed appointments yet.'}
            </div>
          ) : bookings.map((booking, idx) => {
            const serviceName = typeof booking.serviceId === 'object' ? booking.serviceId.name : 'Unknown';
            const servicePrice = typeof booking.serviceId === 'object' ? (booking.serviceId as Service).price : null;
            const isMarking = markingId === booking._id;
            return (
              <motion.div
                key={booking._id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="border border-brand-gray-100 bg-white hover:border-brand-black transition-all rounded-xl shadow-sm"
              >
                {/* Booking header: Responsive Stack on mobile, row on desktop */}
                <div className="p-5 sm:p-6 border-b border-brand-gray-50 bg-brand-white/10">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-black flex-shrink-0 flex items-center justify-center font-black text-white text-xs sm:text-sm italic font-serif shadow-sm">
                        {booking.customerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-serif italic text-xl sm:text-2xl leading-none text-brand-black truncate">{booking.customerName}</p>
                        <p className="text-[11px] font-black uppercase tracking-widest text-brand-gray-500 mt-1.5">
                          <a href={`tel:${booking.phone}`} className="hover:text-brand-black transition-colors flex items-center gap-1">
                            <Phone size={10} />
                            {booking.phone}
                          </a>
                        </p>
                      </div>
                    </div>

                    {/* Time & Date Display Badge */}
                    <div className="flex items-center justify-between sm:justify-end sm:text-right border-t border-brand-gray-50 pt-3 sm:border-t-0 sm:pt-0">
                      <span className="text-[10px] font-black uppercase tracking-widest text-brand-gray-400 sm:hidden">Appointment Time</span>
                      <div>
                        <p className="text-2xl sm:text-3xl font-black tracking-tight leading-none text-brand-black">{booking.startTime}</p>
                        <p className="text-[10px] sm:text-[11px] font-bold text-brand-gray-400 uppercase tracking-widest mt-1">
                          {new Date(booking.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Booking details + actions: Full width block on mobile */}
                <div className="px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-brand-gray-50/10">
                  <div className="flex items-center justify-between sm:justify-start gap-2 border-b border-brand-gray-50 pb-2 sm:border-0 sm:pb-0">
                    <div>
                      <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-brand-gray-400 mb-0.5 sm:mb-1">Service Type</p>
                      <p className="font-serif italic text-base leading-none text-brand-black">{serviceName}</p>
                      {servicePrice && (
                        <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-brand-gray-500 mt-1">
                          KES {servicePrice.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Mark complete triggers stack on mobile, spans full width */}
                  <div className="w-full sm:w-auto">
                    {activeTab !== 'completed' && (
                      <button
                        disabled={isMarking}
                        onClick={() => handleMarkComplete(booking._id)}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] bg-brand-black text-white hover:bg-brand-gray-800 transition-all disabled:opacity-40 min-h-[44px] active:scale-95 shadow-sm rounded-[10px]"
                      >
                        {isMarking ? (
                          <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <CheckCircle2 size={12} />
                        )}
                        Done
                      </button>
                    )}
                    {activeTab === 'completed' && (
                      <div className="w-full sm:w-auto text-right">
                        <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-brand-gray-400 flex items-center justify-center sm:justify-end gap-1.5 py-2">
                          <CheckCircle2 size={12} className="text-green-600 animate-pulse" /> Completed Work
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── TenantSelectView Component (Path route target when not resolved) ─────────

function TenantSelectView() {
  const [slugInput, setSlugInput] = useState('');
  const { navigate } = useTenant();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (slugInput.trim()) {
      navigate('customer', slugInput.toLowerCase().trim());
    }
  };

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center p-6 font-sans">
      <div className="border border-brand-border bg-brand-white p-8 sm:p-10 space-y-8 shadow-luxury max-w-md w-full rounded-2xl">
        <div className="text-center space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-muted">Salon Portal</p>
          <h1 className="text-4xl font-serif italic font-black tracking-tight text-brand-charcoal">Select Your Salon</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-[0.3em] text-brand-muted">Salon Identifier (Slug)</label>
            <input
              type="text"
              required
              value={slugInput}
              onChange={e => setSlugInput(e.target.value)}
              placeholder="e.g. flo-sisterlocks"
              className="w-full border-b-2 border-brand-border focus:border-brand-charcoal focus:outline-none py-3 font-medium text-sm bg-transparent tracking-wide"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-brand-charcoal text-white py-4.5 rounded-full font-semibold uppercase tracking-wider text-xs shadow-2xl hover:bg-brand-muted active:scale-[0.98] transition-all cursor-pointer"
          >
            Enter Salon
          </button>
        </form>

        <div className="relative flex py-2 items-center">
          <div className="flex-grow border-t border-brand-border"></div>
          <span className="flex-shrink mx-4 text-brand-muted text-[10px] font-black uppercase tracking-widest">Or</span>
          <div className="flex-grow border-t border-brand-border"></div>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => navigate('customer', 'flo-sisterlocks')}
            className="w-full border border-brand-border text-brand-charcoal py-3.5 rounded-full font-semibold uppercase tracking-wider text-xs hover:border-brand-charcoal hover:text-brand-charcoal transition-all active:scale-[0.98] cursor-pointer bg-white"
          >
            Go to Flo Sisterlocks (Default)
          </button>

          <button
            type="button"
            onClick={() => navigate('register')}
            className="w-full bg-brand-border/30 text-brand-charcoal py-3.5 rounded-full font-semibold uppercase tracking-wider text-xs hover:bg-brand-border/60 transition-all active:scale-[0.98] cursor-pointer text-center block"
          >
            Register a New Salon
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TenantRegisterView Component (Owner Signup / Onboarding) ──────────────────

function TenantRegisterView() {
  const { navigate, setTenant } = useTenant();
  const [salonName, setSalonName] = useState('');
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.registerTenant({
        salonName,
        slug,
        ownerEmail: email,
        ownerPassword: password
      });

      localStorage.setItem('ownerToken', result.token);
      api.setApiAuthToken(result.token);
      setTenant(result.tenant);

      // Navigate to owner view (admin dashboard)
      navigate('admin', result.tenant.slug);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center p-6 font-sans">
      <div className="border border-brand-border bg-brand-white p-8 sm:p-10 space-y-8 shadow-luxury max-w-md w-full rounded-2xl">
        <div className="text-center space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-muted">Onboarding</p>
          <h1 className="text-4xl font-serif italic font-black tracking-tight text-brand-charcoal">Register Salon</h1>
        </div>

        {error && <p className="text-red-500 font-black uppercase text-xs tracking-widest text-center">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1">
            <label className="text-[11px] font-black uppercase tracking-[0.25em] text-brand-muted">Salon Name</label>
            <input
              type="text" required placeholder="e.g. Flo Sisterlocks"
              value={salonName}
              onChange={e => setSalonName(e.target.value)}
              className="w-full border-b-2 border-brand-border focus:border-brand-charcoal focus:outline-none py-2 font-medium text-sm bg-transparent"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-black uppercase tracking-[0.25em] text-brand-muted">URL Slug</label>
            <input
              type="text" required placeholder="e.g. flo-sisterlocks"
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="w-full border-b-2 border-brand-border focus:border-brand-charcoal focus:outline-none py-2 font-medium text-sm bg-transparent"
            />
            <p className="text-[9px] text-brand-muted mt-1 font-medium">Lowercase letters, numbers, and hyphens only.</p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-black uppercase tracking-[0.25em] text-brand-muted">Owner Email</label>
            <input
              type="email" required placeholder="owner@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border-b-2 border-brand-border focus:border-brand-charcoal focus:outline-none py-2 font-medium text-sm bg-transparent"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-black uppercase tracking-[0.25em] text-brand-muted">Password (8+ characters)</label>
            <input
              type="password" required placeholder="••••••••" minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border-b-2 border-brand-border focus:border-brand-charcoal focus:outline-none py-2 font-medium text-sm bg-transparent"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-charcoal text-white py-4.5 rounded-full font-semibold uppercase tracking-wider text-xs shadow-2xl hover:bg-brand-muted active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Creating Salon...' : 'Register & Start'}
            </button>
          </div>
        </form>

        <button
          type="button"
          onClick={() => navigate('select')}
          className="w-full text-center text-xs font-black uppercase tracking-widest text-brand-muted hover:text-brand-charcoal transition-colors"
        >
          ← Back to Selector
        </button>
      </div>
    </div>
  );
}
