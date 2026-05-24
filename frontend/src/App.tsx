import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, CheckCircle2, ArrowLeft, Settings, LayoutDashboard, Search, X, WifiOff, Bell, BellOff, User } from 'lucide-react';
import { Service, Booking, BookingStep, Attendant, UserMode, AttendantSession } from './types';
import { FALLBACK_SERVICES, FALLBACK_TIME_SLOTS } from './data/mockData';
import * as api from './api/client';
import { InstallPrompt } from './components/InstallPrompt';
import { NotificationPrompt } from './components/NotificationPrompt';
import { useAdminPushNotifications } from './hooks/useAdminPushNotifications';
import { useNotificationSound } from './hooks/useNotificationSound';

export default function App() {
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
  const [pinError, setPinError] = useState(false);
  const ADMIN_PIN = process.env.OWNER_PIN ?? '1234'; // Keep for client-side gate
  // Staff login
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPin, setStaffPin] = useState('');
  const [staffPinError, setStaffPinError] = useState(false);
  const [staffLoginLoading, setStaffLoginLoading] = useState(false);

  const [activeStep, setActiveStep] = useState<BookingStep>('service');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  // Data from API
  const [services, setServices] = useState<Service[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Booking State
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedAttendant, setSelectedAttendant] = useState<Attendant | null>(null); // null = "Any Available"
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientInfo, setClientInfo] = useState({ name: '', phone: '', email: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);

  const dateCtaRef = useRef<HTMLButtonElement>(null);

  // ── Session restore on mount ───────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('attendantToken');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          setUserMode('attendant');
          setAttendantSession({ _id: payload.sub, name: payload.name, token });
        } else {
          localStorage.removeItem('attendantToken');
        }
      } catch {
        localStorage.removeItem('attendantToken');
      }
    }
  }, []);

  // Initial Data Fetch & Offline Listeners
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const fetchInitialData = async () => {
      try {
        setIsLoading(true);
        const fetchedServices = await api.getServices();
        setServices(fetchedServices);
        
        if (isAdmin) {
            const fetchedBookings = await api.getBookings();
            setBookings(fetchedBookings);
        }
        setApiError(null);
      } catch (err) {
        console.error('Failed to fetch data, falling back to mock data', err);
        setServices(FALLBACK_SERVICES);
        setApiError('Unable to connect to server. Showing offline data.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isAdmin]);

  // Fetch slots when date, service, or attendant changes
  useEffect(() => {
    const fetchSlots = async () => {
      if (!selectedService || !selectedDate) return;
      
      try {
        // Use per-attendant availability when a specific attendant is chosen;
        // fall back to global availability for "Any Available" (selectedAttendant === null)
        const slots = await api.getAvailability(
          selectedDate,
          selectedService._id,
          selectedAttendant?._id ?? null
        );
        setTimeSlots(slots);
      } catch (err) {
        console.error('Failed to fetch slots', err);
        setTimeSlots(FALLBACK_TIME_SLOTS);
      }
    };
    
    if (activeStep === 'time') {
        fetchSlots();
    }
  }, [selectedDate, selectedService, selectedAttendant, activeStep]);

  // Fetch attendants when entering the attendant step
  useEffect(() => {
    const fetchAttendants = async () => {
      if (!selectedService) return;
      try {
        const data = await api.getAttendantsForService(selectedService._id);
        setAttendants(data);
      } catch (err) {
        console.error('Failed to fetch attendants', err);
        setAttendants([]);
      }
    };
    if (activeStep === 'attendant') {
      fetchAttendants();
    }
  }, [activeStep, selectedService]);


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
    if (!selectedService || !selectedTime || !clientInfo.name || !clientInfo.phone || !clientInfo.email || isOffline) return;

    try {
        const newBooking = await api.createBooking({
            customerName: clientInfo.name,
            phone: clientInfo.phone,
            email: clientInfo.email,
            serviceId: selectedService._id,
            date: selectedDate,
            startTime: selectedTime,
            attendantId: selectedAttendant?._id ?? null,
        });
        
        setBookings(prev => [...prev, newBooking]);
        setActiveStep('confirmation');
        setTimeout(() => setShowNotificationPrompt(true), 800);
    } catch (err: any) {
        alert(err.message || 'Failed to create booking. Please try again.');
    }
  };

  const resetFlow = () => {
    setActiveStep('service');
    setSelectedService(null);
    setSelectedAttendant(null);
    setSelectedTime(null);
    setSelectedDate(new Date().toISOString().split('T')[0]);
    setClientInfo({ name: '', phone: '', email: '' });
    setShowNotificationPrompt(false);
  };

  const handleStepBack = () => {
    if (activeStep === 'date') setActiveStep('service');
    if (activeStep === 'attendant') setActiveStep('date');
    if (activeStep === 'time') setActiveStep('attendant');
    if (activeStep === 'contact') setActiveStep('time');
  };

  if (isLoading) {
      return <div className="min-h-screen flex items-center justify-center bg-brand-white font-serif italic text-brand-gray-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen max-w-lg mx-auto bg-brand-white relative flex flex-col font-sans tracking-tight">
      <AnimatePresence>
        {apiError && (
          <motion.div 
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-[85%] max-w-sm"
          >
            <div className="bg-brand-black/95 backdrop-blur-xl text-white px-4 py-3 flex items-center gap-3 shadow-2xl border border-white/10">
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

      <InstallPrompt />

      {showNotificationPrompt && (
        <NotificationPrompt
          customerPhone={clientInfo.phone}
          onDismiss={() => setShowNotificationPrompt(false)}
        />
      )}

      {/* ── Login Modal (Owner + Staff tabs) ───────────────── */}
      <AnimatePresence>
        {showPinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-brand-black/60 backdrop-blur-sm"
            onClick={() => setShowPinModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              onClick={e => e.stopPropagation()}
              className="bg-brand-white w-[88%] max-w-xs border-2 border-brand-black overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-8 pt-8 pb-4 space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-gray-400">Studio Access</p>
                <h2 className="text-3xl font-serif italic tracking-tight leading-none">Sign In</h2>
              </div>

              {/* Tab Switcher */}
              <div className="flex border-b border-brand-gray-100 mx-8">
                {(['owner', 'staff'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => { setLoginTab(tab); setPin(''); setPinError(false); setStaffPin(''); setStaffPinError(false); }}
                    className={`py-3 flex-1 text-[11px] font-black uppercase tracking-[0.2em] relative transition-colors ${
                      loginTab === tab ? 'text-brand-black' : 'text-brand-gray-400'
                    }`}
                  >
                    {tab === 'owner' ? 'Owner' : 'Staff'}
                    {loginTab === tab && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-black" />}
                  </button>
                ))}
              </div>

              <div className="px-8 py-6 space-y-6">
                {loginTab === 'owner' ? (
                  <>
                    {/* PIN dots */}
                    <motion.div
                      animate={pinError ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : {}}
                      transition={{ duration: 0.4 }}
                      className="flex justify-center gap-4 pt-2"
                    >
                      {[0, 1, 2, 3].map(i => (
                        <div
                          key={i}
                          className={`w-4 h-4 border-2 transition-all duration-200 ${
                            i < pin.length ? 'bg-brand-black border-brand-black' : 'bg-transparent border-brand-gray-300'
                          }`}
                        />
                      ))}
                    </motion.div>
                    {pinError && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="text-center text-[11px] font-black uppercase tracking-widest text-red-500">
                        Incorrect PIN
                      </motion.p>
                    )}
                    {/* Number pad */}
                    <div className="grid grid-cols-3 gap-2">
                      {[1,2,3,4,5,6,7,8,9].map(n => (
                        <button key={n}
                          onClick={() => {
                            if (pin.length >= 4) return;
                            const next = pin + String(n);
                            setPin(next); setPinError(false);
                            if (next.length === 4) {
                              if (next === ADMIN_PIN) {
                                setUserMode('owner'); setShowPinModal(false); setPin('');
                              } else { setPinError(true); setTimeout(() => setPin(''), 600); }
                            }
                          }}
                          className="py-4 text-xl font-black border border-brand-gray-100 hover:border-brand-black hover:bg-brand-gray-50 transition-all active:scale-95"
                        >{n}</button>
                      ))}
                      <button onClick={() => { setPin(''); setPinError(false); }}
                        className="py-4 text-[11px] font-black uppercase tracking-widest border border-brand-gray-100 hover:border-brand-black hover:bg-brand-gray-50 transition-all text-brand-gray-500"
                      >Clear</button>
                      <button
                        onClick={() => {
                          if (pin.length >= 4) return;
                          const next = pin + '0';
                          setPin(next); setPinError(false);
                          if (next.length === 4) {
                            if (next === ADMIN_PIN) {
                              setUserMode('owner'); setShowPinModal(false); setPin('');
                            } else { setPinError(true); setTimeout(() => setPin(''), 600); }
                          }
                        }}
                        className="py-4 text-xl font-black border border-brand-gray-100 hover:border-brand-black hover:bg-brand-gray-50 transition-all active:scale-95"
                      >0</button>
                      <button onClick={() => { setPin(p => p.slice(0, -1)); setPinError(false); }}
                        className="py-4 text-[11px] font-black uppercase tracking-widest border border-brand-gray-100 hover:border-brand-black hover:bg-brand-gray-50 transition-all text-brand-gray-500"
                      >⌫</button>
                    </div>
                  </>
                ) : (
                  /* ── Staff Login ── */
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-[0.3em] text-brand-gray-600">Username</label>
                      <input
                        type="text"
                        value={staffUsername}
                        onChange={e => setStaffUsername(e.target.value)}
                        placeholder="your username"
                        autoCapitalize="none"
                        className="w-full border-b-2 border-brand-gray-100 focus:border-brand-black focus:outline-none py-3 font-black text-sm bg-transparent transition-colors tracking-wider"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-[0.3em] text-brand-gray-600">PIN</label>
                      {/* Mini PIN dot display */}
                      <motion.div
                        animate={staffPinError ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : {}}
                        transition={{ duration: 0.4 }}
                        className="flex gap-3"
                      >
                        {[0,1,2,3,4,5].map(i => (
                          <div key={i} className={`w-3 h-3 border-2 transition-all duration-200 ${
                            i < staffPin.length ? 'bg-brand-black border-brand-black' : 'bg-transparent border-brand-gray-200'
                          }`} />
                        ))}
                      </motion.div>
                      {staffPinError && (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className="text-[11px] font-black uppercase tracking-widest text-red-500">
                          Invalid credentials
                        </motion.p>
                      )}
                      {/* Number pad */}
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        {[1,2,3,4,5,6,7,8,9].map(n => (
                          <button key={n}
                            onClick={() => {
                              if (staffPin.length >= 6) return;
                              setStaffPin(p => p + String(n));
                              setStaffPinError(false);
                            }}
                            className="py-3 text-lg font-black border border-brand-gray-100 hover:border-brand-black hover:bg-brand-gray-50 transition-all active:scale-95"
                          >{n}</button>
                        ))}
                        <button onClick={() => { setStaffPin(''); setStaffPinError(false); }}
                          className="py-3 text-[10px] font-black uppercase tracking-widest border border-brand-gray-100 hover:border-brand-black transition-all text-brand-gray-500"
                        >Clear</button>
                        <button onClick={() => {
                            if (staffPin.length >= 6) return;
                            setStaffPin(p => p + '0');
                            setStaffPinError(false);
                          }}
                          className="py-3 text-lg font-black border border-brand-gray-100 hover:border-brand-black hover:bg-brand-gray-50 transition-all active:scale-95"
                        >0</button>
                        <button onClick={() => { setStaffPin(p => p.slice(0, -1)); setStaffPinError(false); }}
                          className="py-3 text-[10px] font-black uppercase tracking-widest border border-brand-gray-100 hover:border-brand-black transition-all text-brand-gray-500"
                        >⌫</button>
                      </div>
                    </div>
                    <button
                      disabled={staffLoginLoading || !staffUsername || staffPin.length < 4}
                      onClick={async () => {
                        setStaffLoginLoading(true);
                        setStaffPinError(false);
                        try {
                          const result = await api.loginAttendant(staffUsername, staffPin);
                          localStorage.setItem('attendantToken', result.token);
                          setAttendantSession({ _id: result.attendant._id, name: result.attendant.name, token: result.token });
                          setUserMode('attendant');
                          setShowPinModal(false);
                          setStaffUsername('');
                          setStaffPin('');
                        } catch {
                          setStaffPinError(true);
                          setStaffPin('');
                        } finally {
                          setStaffLoginLoading(false);
                        }
                      }}
                      className="w-full bg-brand-black text-white py-4 font-black uppercase tracking-[0.3em] text-xs transition-all hover:bg-brand-gray-800 disabled:opacity-30"
                    >
                      {staffLoginLoading ? 'Signing in...' : 'Sign In'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <header className="px-8 py-10 flex justify-between items-center bg-brand-white sticky top-0 z-40 border-b border-brand-gray-100">
        <div className="flex items-center gap-5 cursor-pointer group" onClick={resetFlow}>
          <div className="h-16 w-16 bg-brand-black rounded-full flex items-center justify-center p-3 transition-transform duration-500 group-hover:scale-105">
            <img 
              src="/logo-transparent.png" 
              alt="Flobooking Logo" 
              className="h-full w-auto object-contain" 
            />
          </div>
          {/* Show attendant name badge when in staff mode */}
          {userMode === 'attendant' && attendantSession && (
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-brand-black" />
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-gray-600">{attendantSession.name}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a href="tel:0721530120" className="p-3 bg-brand-gray-50 rounded-full hover:bg-brand-black hover:text-white transition-all duration-500">
            <Phone size={18} />
          </a>
          <button 
            onClick={() => {
              if (userMode === 'owner') {
                setUserMode('customer');
              } else if (userMode === 'attendant') {
                // Attendant logout — clear token
                localStorage.removeItem('attendantToken');
                setAttendantSession(null);
                setUserMode('customer');
              } else {
                // Customer — open login modal
                setPin('');
                setPinError(false);
                setStaffPin('');
                setStaffPinError(false);
                setStaffUsername('');
                setLoginTab('owner');
                setShowPinModal(true);
              }
            }}
            className="p-3 bg-brand-gray-50 rounded-full hover:bg-brand-black hover:text-white transition-all duration-500"
          >
            {userMode === 'owner' ? <LayoutDashboard size={18} /> : userMode === 'attendant' ? <User size={18} /> : <Settings size={18} />}
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {userMode === 'owner' ? (
          <AdminView bookings={bookings} />
        ) : userMode === 'attendant' && attendantSession ? (
          <AttendantView session={attendantSession} />
        ) : (
          <div className="flex-1 flex flex-col">
            {activeStep !== 'confirmation' && (
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
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-gray-300 group-focus-within:text-brand-black transition-colors" size={16} />
                        <input 
                          type="text"
                          placeholder="SEARCH SERVICE"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-brand-gray-50 border-b border-brand-gray-100 py-4 pl-12 pr-10 focus:outline-none focus:border-brand-black transition-all font-black text-[16px] tracking-[0.2em] uppercase placeholder:text-brand-gray-400"
                        />
                        {searchQuery && (
                          <button 
                            onClick={() => setSearchQuery('')}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-gray-300 hover:text-brand-black"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      {filteredServices.length > 0 ? (
                        filteredServices.map(service => (
                          <ServiceSelectionCard 
                            key={service._id} 
                            service={service} 
                            isSelected={selectedService?._id === service._id}
                            onSelect={() => setSelectedService(service)} 
                          />
                        ))
                      ) : (
                        <div className="col-span-3 py-12 text-center border-2 border-dashed border-brand-gray-100">
                          <p className="font-serif italic text-brand-gray-300">No services found matching your criteria.</p>
                        </div>
                      )}
                    </div>
                    <div className="pt-4">
                      <button 
                        disabled={!selectedService}
                        onClick={() => setActiveStep('date')}
                        className="w-full bg-brand-black text-brand-white py-6 rounded-none font-bold uppercase tracking-[0.3em] text-xs transition-all disabled:opacity-20 hover:tracking-[0.4em] active:scale-[0.98]"
                      >
                        Next
                      </button>
                    </div>
                  </motion.div>
                )}

                {activeStep === 'date' && (
                  <motion.div 
                    key="date"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-12"
                  >
                      <button onClick={handleStepBack} className="flex items-center gap-3 text-brand-black hover:translate-x-[-4px] transition-all duration-300">
                        <ArrowLeft size={16} strokeWidth={3} />
                        <span className="text-sm font-black uppercase tracking-[0.2em]">Previous</span>
                      </button>
                    <div className="space-y-8">
                      <div>
                        <h2 className="text-4xl font-serif font-black tracking-tight mb-8">Calendar</h2>
                        <DateScroller selectedDate={selectedDate} onDateSelect={handleDateSelect} />
                      </div>
                      
                      <div className="border-t border-brand-gray-100 pt-8 flex items-center justify-between">
                         <div className="space-y-1">
                            <p className="text-[11px] uppercase tracking-widest font-bold text-brand-gray-400">Selected Selection</p>
                            <p className="font-serif italic text-2xl">{selectedService?.name}</p>
                         </div>
                         <div className="text-right">
                            <p className="text-lg font-black tracking-tighter">KES {selectedService?.price.toLocaleString()}</p>
                         </div>
                      </div>
                    </div>
                    <button 
                      ref={dateCtaRef}
                      onClick={() => setActiveStep('attendant')}
                      className="w-full bg-brand-black text-brand-white py-6 rounded-none font-bold uppercase tracking-[0.3em] text-xs transition-all hover:tracking-[0.4em] active:scale-[0.98]"
                    >
                      Continue
                    </button>
                  </motion.div>
                )}

                {activeStep === 'attendant' && (
                  <motion.div 
                    key="attendant"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-12"
                  >
                    <button onClick={handleStepBack} className="flex items-center gap-3 text-brand-black hover:translate-x-[-4px] transition-all duration-300">
                      <ArrowLeft size={16} strokeWidth={3} />
                      <span className="text-sm font-black uppercase tracking-[0.2em]">Previous</span>
                    </button>
                    <div className="space-y-8">
                      <div className="space-y-2">
                        <h2 className="text-4xl font-serif font-black tracking-tight leading-none">Choose<br/>Artist</h2>
                        <div className="w-12 h-1 bg-brand-black"></div>
                      </div>
                      <div className="flex flex-col gap-3">
                        {/* "Any Available" option */}
                        <button
                          onClick={() => setSelectedAttendant(null)}
                          className={`flex items-center justify-between p-6 border-2 transition-all duration-300 ${
                            selectedAttendant === null
                              ? 'bg-brand-black text-white border-brand-black'
                              : 'bg-brand-white border-brand-gray-100 hover:border-brand-black text-brand-black'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-sm font-serif italic border-2 ${
                              selectedAttendant === null ? 'border-white/40 bg-white/10 text-white' : 'border-brand-gray-200 text-brand-gray-400'
                            }`}>
                              ✦
                            </div>
                            <div className="text-left">
                              <p className="font-serif italic text-xl leading-none">Any Available</p>
                              <p className={`text-[11px] font-black uppercase tracking-widest mt-1 ${
                                selectedAttendant === null ? 'text-white/70' : 'text-brand-gray-400'
                              }`}>First available slot</p>
                            </div>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            selectedAttendant === null ? 'border-white bg-white' : 'border-brand-gray-200'
                          }`}>
                            {selectedAttendant === null && <CheckCircle2 size={14} strokeWidth={3} className="text-brand-black" />}
                          </div>
                        </button>

                        {/* Per-attendant cards */}
                        {attendants.map(attendant => {
                          const isSelected = selectedAttendant?._id === attendant._id;
                          const initials = attendant.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                          return (
                            <button
                              key={attendant._id}
                              onClick={() => setSelectedAttendant(attendant)}
                              className={`flex items-center justify-between p-6 border-2 transition-all duration-300 ${
                                isSelected
                                  ? 'bg-brand-black text-white border-brand-black'
                                  : 'bg-brand-white border-brand-gray-100 hover:border-brand-black text-brand-black'
                              }`}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-sm font-serif italic border-2 ${
                                  isSelected ? 'border-white/40 bg-white/10 text-white' : 'border-brand-gray-200 text-brand-black'
                                }`}>
                                  {initials}
                                </div>
                                <div className="text-left">
                                  <p className="font-serif italic text-xl leading-none">{attendant.name}</p>
                                  <p className={`text-[11px] font-black uppercase tracking-widest mt-1 ${
                                    isSelected ? 'text-white/70' : 'text-brand-gray-400'
                                  }`}>Certified Artist</p>
                                </div>
                              </div>
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                isSelected ? 'border-white bg-white' : 'border-brand-gray-200 group-hover:border-brand-black'
                              }`}>
                                {isSelected && <CheckCircle2 size={14} strokeWidth={3} className="text-brand-black" />}
                              </div>
                            </button>
                          );
                        })}

                        {attendants.length === 0 && (
                          <div className="py-8 text-center border border-brand-gray-100 font-serif italic text-brand-gray-300">
                            Loading artists...
                          </div>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={() => setActiveStep('time')}
                      className="w-full bg-brand-black text-brand-white py-6 rounded-none font-bold uppercase tracking-[0.3em] text-xs transition-all hover:tracking-[0.4em] active:scale-[0.98]"
                    >
                      {selectedAttendant ? `Continue with ${selectedAttendant.name}` : 'Continue — Any Artist'}
                    </button>
                  </motion.div>
                )}

                {activeStep === 'time' && (
                  <motion.div 
                    key="time"
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
                      <div className="flex items-center justify-between border-b border-brand-gray-100 pb-8">
                        <div>
                          <p className="text-[13px] text-brand-gray-600 uppercase font-bold tracking-widest mb-1">Date</p>
                          <p className="font-serif text-2xl font-black">
                            {new Date(selectedDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
                          </p>
                        </div>
                        {/* Show chosen attendant in time step header */}
                        <div className="text-right">
                          <p className="text-[13px] text-brand-gray-600 uppercase font-bold tracking-widest mb-1">Artist</p>
                          <p className="font-serif italic text-xl leading-none">
                            {selectedAttendant ? selectedAttendant.name : 'Any'}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <h2 className="text-3xl font-serif font-black tracking-tight">Timeline</h2>
                        <div className="grid grid-cols-2 gap-4">
                          {timeSlots.length > 0 ? timeSlots.map(time => {
                            const isSelected = selectedTime === time;
                            return (
                              <button
                                key={time}
                                onClick={() => setSelectedTime(time)}
                                className={`
                                  py-5 text-xs font-black tracking-[0.2em] transition-all duration-500 rounded-none border-2
                                  ${isSelected ? 'bg-brand-black text-brand-white border-brand-black shadow-xl ring-4 ring-brand-black/5' : 'bg-brand-white border-brand-gray-100 hover:border-brand-black text-brand-black'}
                                `}
                              >
                                {time}
                              </button>
                            );
                          }) : (
                              <div className="col-span-2 py-8 text-center text-brand-gray-400 italic font-serif text-sm border border-brand-gray-100">
                                  No available slots for this date.
                              </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <button 
                      disabled={!selectedTime}
                      onClick={() => setActiveStep('contact')}
                      className="w-full bg-brand-black text-brand-white py-6 rounded-none font-bold uppercase tracking-[0.3em] text-xs transition-all disabled:opacity-20 hover:tracking-[0.4em] active:scale-[0.98]"
                    >
                      Confirm Selection
                    </button>
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
                      <section className="bg-brand-gray-50 p-8 flex items-center justify-between">
                          <div className="space-y-1">
                           <div className="space-y-1">
                             <p className="text-[13px] uppercase font-black tracking-widest text-brand-gray-600">Appointment Detail</p>
                             <p className="font-serif italic text-2xl leading-none">{selectedService?.name}</p>
                            <p className="text-xs font-bold text-brand-black/40 mt-2">
                               {new Date(selectedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at {selectedTime}
                            </p>
                          </div>
                          <div className="text-right">
                             <p className="text-2xl font-black tracking-tighter">KES {selectedService?.price.toLocaleString()}</p>
                           </div>
                         </div>
                       </section>

                      <section className="space-y-8">
                        <div className="space-y-2">
                          <h2 className="text-4xl font-serif font-black tracking-tight leading-none">Register</h2>
                          <div className="w-12 h-1 bg-brand-black"></div>
                        </div>
                        <div className="space-y-8">
                          <div className="space-y-2 group">
                             <label className="text-[12px] font-black uppercase tracking-[0.3em] text-brand-gray-600 group-focus-within:text-brand-black transition-colors">Identification</label>
                            <div className="relative">
                              <input 
                                type="text" 
                                placeholder="FULL NAME"
                                value={clientInfo.name}
                                onChange={e => setClientInfo(prev => ({...prev, name: e.target.value}))}
                                className="w-full bg-brand-white border-b-2 border-brand-gray-100 py-5 focus:outline-none focus:border-brand-black transition-all font-black text-base uppercase tracking-widest placeholder:text-brand-gray-200 placeholder:font-normal"
                              />
                            </div>
                          </div>
                          <div className="space-y-2 group">
                             <label className="text-[12px] font-black uppercase tracking-[0.3em] text-brand-gray-600 group-focus-within:text-brand-black transition-colors">Telecommunication</label>
                            <div className="relative">
                              <input 
                                type="tel" 
                                placeholder="MOBILE NUMBER"
                                value={clientInfo.phone}
                                onChange={e => setClientInfo(prev => ({...prev, phone: e.target.value}))}
                                className="w-full bg-brand-white border-b-2 border-brand-gray-100 py-5 focus:outline-none focus:border-brand-black transition-all font-black text-base uppercase tracking-widest placeholder:text-brand-gray-200 placeholder:font-normal"
                              />
                            </div>
                          </div>
                          <div className="space-y-2 group">
                             <label className="text-[12px] font-black uppercase tracking-[0.3em] text-brand-gray-600 group-focus-within:text-brand-black transition-colors">Electronic Mail</label>
                            <div className="relative">
                              <input 
                                type="email" 
                                placeholder="email@example.com"
                                value={clientInfo.email}
                                onChange={e => setClientInfo(prev => ({...prev, email: e.target.value}))}
                                className="w-full bg-brand-white border-b-2 border-brand-gray-100 py-5 focus:outline-none focus:border-brand-black transition-all font-black text-base lowercase tracking-normal placeholder:text-brand-gray-200 placeholder:font-normal"
                              />
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>

                    <button 
                      disabled={!clientInfo.name || !clientInfo.phone || !clientInfo.email || isOffline}
                      onClick={handleConfirmBooking}
                      className="w-full bg-brand-black text-brand-white py-6 rounded-none font-bold uppercase tracking-[0.3em] text-xs transition-all disabled:opacity-20 hover:tracking-[0.4em] active:scale-[0.98]"
                    >
                      {isOffline ? 'Offline - Booking Disabled' : 'Finalize Booking'}
                    </button>
                  </motion.div>
                )}

                {activeStep === 'confirmation' && (
                  <motion.div 
                    key="confirmation"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center py-12 text-center space-y-12"
                   >
                    <div className="space-y-4">
                      <h2 className="text-5xl font-serif font-black tracking-tight leading-none uppercase">Confirmed</h2>
                      <div className="w-20 h-1.5 bg-brand-black mx-auto"></div>
                      <p className="text-brand-gray-400 font-bold tracking-[0.1em] text-sm max-w-[240px] mx-auto pt-4 leading-relaxed">
                        YOUR APPOINTMENT AT THE STUDIO HAS BEEN SUCCESSFULLY LOGGED.
                      </p>
                    </div>
                    
                    <div className="bg-brand-gray-50 w-full p-10 text-left space-y-8 border-2 border-brand-black">
                      <div className="flex justify-between items-baseline border-b border-brand-black/10 pb-6">
                         <p className="text-[13px] uppercase tracking-[0.4em] font-black text-brand-gray-600">Service Ref</p>
                        <p className="font-black text-xs uppercase italic">#LMN-{Math.random().toString(36).substr(2, 5).toUpperCase()}</p>
                      </div>
                      <div className="space-y-6">
                        <div className="flex justify-between items-center">
                           <span className="text-[13px] uppercase tracking-[0.2em] font-bold text-brand-gray-600">Artist</span>
                          <span className="font-serif italic text-lg leading-none">
                            {selectedAttendant ? selectedAttendant.name : 'Any Available'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                           <span className="text-[13px] uppercase tracking-[0.2em] font-bold text-brand-gray-600">Service</span>
                          <span className="font-black text-sm leading-none uppercase">{selectedService?.name}</span>
                        </div>
                        <div className="flex justify-between items-center">
                           <span className="text-[13px] uppercase tracking-[0.2em] font-bold text-brand-gray-600">Cost</span>
                          <span className="font-black text-sm leading-none">KES {selectedService?.price.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                           <span className="text-[13px] uppercase tracking-[0.2em] font-bold text-brand-gray-600">Time</span>
                          <span className="font-black text-sm leading-none">{selectedTime}</span>
                        </div>
                         <div className="flex justify-between items-center">
                           <span className="text-[13px] uppercase tracking-[0.2em] font-bold text-brand-gray-600">Date</span>
                          <span className="font-black text-sm leading-none">
                            {new Date(selectedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={resetFlow}
                      className="w-full bg-transparent border-2 border-brand-black text-brand-black py-6 rounded-none font-bold uppercase tracking-[0.3em] text-xs transition-all hover:bg-brand-black hover:text-white"
                    >
                      Return to Menu
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
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
}

function StepIndicator({ activeStep }: { activeStep: BookingStep }) {
  const steps: { key: BookingStep, label: string }[] = [
    { key: 'service', label: 'Service' },
    { key: 'date', label: 'Date' },
    { key: 'attendant', label: 'Artist' },
    { key: 'time', label: 'Time' },
    { key: 'contact', label: 'Identity' },
    { key: 'confirmation', label: 'Confirm' }
  ];
  const activeIndex = steps.findIndex(s => s.key === activeStep);

  return (
    <div className="flex items-center justify-between relative max-w-[320px] mx-auto">
      <div className="absolute top-[8px] left-0 right-0 h-[1px] bg-brand-gray-100 -z-10">
        <div 
          className="h-full bg-brand-black transition-all duration-1000 ease-out" 
          style={{ width: `${(Math.min(activeIndex, 4) / (steps.length - 1)) * 100}%` }}
        />
      </div>
      {steps.map((step, idx) => {
        const isCompleted = idx < activeIndex;
        const isActive = idx === activeIndex;
        return (
          <div key={idx} className="flex flex-col items-center gap-3">
            <div className={`w-4 h-4 transition-all duration-700 ${isCompleted || isActive ? 'bg-brand-black scale-110 shadow-lg' : 'bg-brand-gray-100'}`}></div>
             <span className={`text-[11px] uppercase tracking-widest transition-colors duration-500 font-black ${isActive ? 'text-brand-black' : isCompleted ? 'text-brand-black/40' : 'text-brand-gray-400'}`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ServiceSelectionCard({ service, isSelected, onSelect }: { service: Service, isSelected: boolean, onSelect: () => void }) {
  return (
    <motion.div 
      whileTap={{ scale: 0.98 }}
      className={`
        flex flex-row items-center justify-between p-6 gap-4 cursor-pointer transition-all duration-500 border relative group
        ${isSelected ? 'bg-brand-black text-brand-white border-brand-black shadow-luxury' : 'bg-brand-white border-brand-gray-100 hover:border-brand-black text-brand-black'}
      `}
      onClick={onSelect}
    >
      <div className="flex-1">
        <h3 className="font-serif italic text-lg leading-tight uppercase group-hover:translate-x-1 transition-transform duration-500 break-words">{service.name}</h3>
        <p className={`mt-2 text-[11px] font-black tracking-widest uppercase ${isSelected ? 'text-white/80' : 'text-brand-gray-600'}`}>
          {service.duration > 60 ? `${Math.round(service.duration/60)} HR` : `${service.duration} MIN`}
        </p>
      </div>
      <div className="flex flex-col items-end gap-3">
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'border-brand-white bg-brand-white' : 'border-brand-gray-200 group-hover:border-brand-black'}`}>
          {isSelected && <CheckCircle2 size={14} strokeWidth={3} className="text-brand-black" />}
        </div>
        <p className="font-black text-xs tracking-tighter whitespace-nowrap">KES {service.price.toLocaleString()}</p>
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
           <h3 className="text-[13px] font-black uppercase tracking-[0.4em] text-brand-gray-600 border-b border-brand-gray-100 pb-2">{month}</h3>
          <div className="grid grid-cols-4 gap-3">
            {monthDates.map((d, j) => {
              const dateStr = d.toISOString().split('T')[0];
              const isSelected = selectedDate === dateStr;
              const dayName = d.toLocaleDateString(undefined, { weekday: 'short' });
              const dayNum = d.toLocaleDateString(undefined, { day: 'numeric' });
              return (
                <button
                  key={j}
                  onClick={() => onDateSelect(dateStr)}
                  className={`flex flex-col items-center justify-center p-4 transition-all duration-500 border ${isSelected ? 'bg-brand-black text-brand-white scale-105 border-brand-black shadow-xl z-10' : 'bg-brand-white border-brand-gray-100 hover:border-brand-black text-brand-black'}`}
                >
                   <span className={`text-[11px] uppercase font-black tracking-tighter leading-none mb-1 ${isSelected ? 'opacity-80' : 'text-brand-gray-600'}`}>{dayName}</span>
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

function AdminView({ bookings: initialBookings }: { bookings: Booking[] }) {
  const [activeTab, setActiveTab] = useState<'ledger' | 'pending' | 'services' | 'staff'>('ledger');
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
  const [confirmedBookings, setConfirmedBookings] = useState<Booking[]>(initialBookings);
  const [services, setServices] = useState<Service[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Admin push notifications
  const adminPush = useAdminPushNotifications();

  // Add service form state
  const [addForm, setAddForm] = useState({ name: '', duration: '', price: '', description: '' });
  const [addLoading, setAddLoading] = useState(false);

  // Edit price state: { [serviceId]: editedPrice }
  const [editPrices, setEditPrices] = useState<Record<string, string>>({});
  const [savingPrice, setSavingPrice] = useState<string | null>(null);

  // Staff management form state
  const [ownerPin, setOwnerPin] = useState('');
  const [ownerPinInput, setOwnerPinInput] = useState('');
  const [ownerPinConfirmed, setOwnerPinConfirmed] = useState(false);
  const [staffForm, setStaffForm] = useState({ name: '', username: '', pin: '', serviceIds: [] as string[] });
  const [staffAddLoading, setStaffAddLoading] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const todaysConfirmed = confirmedBookings.filter(b => b.date === todayStr && b.status === 'confirmed');
  const sortedToday = [...todaysConfirmed].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const currentTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  // Always load services on mount so they're available in the Staff tab's service picker
  useEffect(() => {
    api.getServices()
      .then(data => {
        setServices(data);
        const prices: Record<string, string> = {};
        data.forEach((s: Service) => { prices[s._id] = String(s.price); });
        setEditPrices(prices);
      })
      .catch(console.error);
  }, []);

  // Fetch pending bookings when tab opens
  useEffect(() => {
    if (activeTab === 'pending') {
      setLoadingPending(true);
      api.getAdminBookings('pending')
        .then(data => setPendingBookings(data))
        .catch(console.error)
        .finally(() => setLoadingPending(false));
    }
    if (activeTab === 'services') {
      setLoadingServices(true);
      api.getServices()
        .then(data => {
          setServices(data);
          const prices: Record<string, string> = {};
          data.forEach((s: Service) => { prices[s._id] = String(s.price); });
          setEditPrices(prices);
        })
        .catch(console.error)
        .finally(() => setLoadingServices(false));
    }
    if (activeTab === 'staff' && ownerPinConfirmed) {
      setLoadingStaff(true);
      api.getAttendants(ownerPin)
        .then(data => setAttendants(data))
        .catch(console.error)
        .finally(() => setLoadingStaff(false));
    }
  }, [activeTab, ownerPinConfirmed]);

  const handleStatusUpdate = async (bookingId: string, status: 'confirmed' | 'cancelled') => {
    setActionLoading(bookingId);
    try {
      const updated = await api.updateBookingStatus(bookingId, status);
      // Remove from pending queue
      setPendingBookings(prev => prev.filter(b => b._id !== bookingId));
      // If confirmed, add to daily ledger
      if (status === 'confirmed') {
        setConfirmedBookings(prev => [...prev, updated]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePriceEdit = async (serviceId: string) => {
    const newPrice = Number(editPrices[serviceId]);
    if (isNaN(newPrice) || newPrice <= 0) return;
    setSavingPrice(serviceId);
    try {
      const updated = await api.updateService(serviceId, { price: newPrice });
      setServices(prev => prev.map(s => s._id === serviceId ? updated : s));
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPrice(null);
    }
  };

  const handleAddService = async () => {
    if (!addForm.name || !addForm.duration || !addForm.price) return;
    setAddLoading(true);
    try {
      const newService = await api.createService({
        name: addForm.name,
        duration: Number(addForm.duration),
        price: Number(addForm.price),
        description: addForm.description,
      });
      setServices(prev => [...prev, newService]);
      setEditPrices(prev => ({ ...prev, [newService._id]: String(newService.price) }));
      setAddForm({ name: '', duration: '', price: '', description: '' });
    } catch (err) {
      console.error(err);
    } finally {
      setAddLoading(false);
    }
  };

  const tabs: { key: 'ledger' | 'pending' | 'services' | 'staff'; label: string }[] = [
    { key: 'ledger', label: 'Ledger' },
    { key: 'pending', label: 'Pending' },
    { key: 'services', label: 'Services' },
    { key: 'staff', label: 'Staff' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Tab Navigation + Admin Notification Toggle */}
      <nav className="px-8 border-b border-brand-gray-100 flex items-center gap-8">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`py-4 text-[13px] font-black uppercase tracking-[0.2em] relative transition-all ${
              activeTab === tab.key ? 'text-brand-black' : 'text-brand-gray-400 hover:text-brand-black'
            }`}
          >
            {tab.label}
            {tab.key === 'pending' && pendingBookings.length > 0 && (
              <span className="ml-2 bg-brand-black text-brand-white text-[9px] font-black px-1.5 py-0.5 tracking-widest">
                {pendingBookings.length}
              </span>
            )}
            {activeTab === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-black" />
            )}
          </button>
        ))}

        {/* Admin push notification toggle — sits at far right of the tab bar */}
        {adminPush.permission !== 'unsupported' && adminPush.permission !== 'denied' && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => adminPush.isSubscribed ? adminPush.unsubscribe() : adminPush.subscribe()}
              disabled={adminPush.isLoading}
              title={adminPush.isSubscribed ? 'Disable booking notifications' : 'Enable booking notifications'}
              className={`flex items-center gap-2 py-2 px-3 text-[11px] font-black uppercase tracking-[0.2em] transition-all border ${
                adminPush.isSubscribed
                  ? 'bg-brand-black text-white border-brand-black'
                  : 'bg-transparent text-brand-gray-400 border-brand-gray-200 hover:border-brand-black hover:text-brand-black'
              } disabled:opacity-40`}
            >
              {adminPush.isSubscribed
                ? <><Bell size={13} /> Notifs On</>
                : <><BellOff size={13} /> Notifs Off</>
              }
            </button>
            {adminPush.isSubscribed && (
              <select
                value={adminPush.soundPreference}
                onChange={e => adminPush.updateSound(e.target.value)}
                className="text-[11px] font-black uppercase tracking-widest border border-brand-gray-200 bg-white text-brand-black py-2 px-2 focus:border-brand-black focus:outline-none cursor-pointer"
              >
                <option value="default">Default</option>
                <option value="chime">Chime</option>
                <option value="bell">Bell</option>
                <option value="ding">Ding</option>
                <option value="silent">Silent</option>
              </select>
            )}
          </div>
        )}
      </nav>

      <div className="flex-1 overflow-y-auto px-8 py-10 space-y-12 scrollbar-hide">

        {/* ── TAB 1: Daily Ledger ─────────────────────────── */}
        {activeTab === 'ledger' && (
          <>
            <header className="space-y-4">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <h2 className="text-4xl font-serif font-black tracking-tight leading-none uppercase">Studio <br/>Management</h2>
                  <p className="text-brand-gray-600 font-bold uppercase tracking-[0.3em] text-[12px] pt-2">
                    Operations // {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-black uppercase tracking-widest text-brand-gray-600 mb-1">Local Time</p>
                  <p className="text-3xl font-black tracking-tighter">{currentTime}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="bg-brand-black p-6 flex flex-col justify-between h-28">
                  <p className="text-[11px] text-white/70 font-black uppercase tracking-[0.2em]">Confirmed Today</p>
                  <h3 className="text-4xl font-black text-white">{sortedToday.length}</h3>
                </div>
                <div className="border border-brand-gray-100 p-6 flex flex-col justify-between h-28">
                  <p className="text-[11px] text-brand-gray-600 font-black uppercase tracking-[0.2em]">Certified Artist</p>
                  <h3 className="text-xl font-serif italic text-brand-black">Flo Sisterlocks</h3>
                </div>
              </div>
            </header>

            <div className="space-y-6">
              {sortedToday.length === 0 ? (
                <div className="p-20 text-center border-2 border-dashed border-brand-gray-100 italic font-serif text-brand-gray-300">
                  <p>No confirmed appointments for today.</p>
                </div>
              ) : (
                sortedToday.map((booking, idx) => {
                  const isPassed = booking.startTime < currentTime;
                  return (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      key={booking._id}
                      className={`p-8 flex items-center justify-between border transition-all group ${isPassed ? 'opacity-30 grayscale border-brand-gray-50' : 'border-brand-gray-100 hover:border-brand-black hover:shadow-luxury'}`}
                    >
                      <div className="flex flex-col space-y-4">
                        <div className="flex items-center gap-6">
                          <div className="w-14 h-14 bg-brand-black flex items-center justify-center font-black text-white text-xs italic tracking-tighter">
                            {booking.customerName.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <p className="font-serif italic text-2xl leading-none">{booking.customerName}</p>
                            <p className="text-[13px] font-black uppercase text-brand-gray-600 mt-2 tracking-widest">{booking.phone}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 border-t border-brand-gray-50 pt-4">
                          <span className="w-2 h-2 rounded-full bg-brand-black"></span>
                          <p className="text-[13px] font-black tracking-[0.2em] text-brand-black uppercase">{booking.startTime}</p>
                          <span className="opacity-10 font-bold">—</span>
                          <p className="text-[13px] font-bold text-brand-gray-600 uppercase tracking-widest">
                            {typeof booking.serviceId === 'object' ? booking.serviceId.name : 'Unknown'}
                          </p>
                          <span className="opacity-10 font-bold">—</span>
                          <p className="text-[12px] font-bold text-brand-gray-400 italic">
                            {booking.attendantId && typeof booking.attendantId === 'object'
                              ? (booking.attendantId as Attendant).name
                              : 'Unassigned'}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* ── TAB 2: Pending Requests ─────────────────────── */}
        {activeTab === 'pending' && (
          <>
            <header className="space-y-1">
              <h2 className="text-4xl font-serif font-black tracking-tight leading-none uppercase">Pending<br/>Requests</h2>
              <p className="text-brand-gray-600 font-bold uppercase tracking-[0.3em] text-[12px] pt-2">
                Awaiting confirmation — {pendingBookings.length} request{pendingBookings.length !== 1 ? 's' : ''}
              </p>
            </header>

            <div className="space-y-4">
              {loadingPending ? (
                <div className="p-20 text-center border border-brand-gray-100 font-serif italic text-brand-gray-300">
                  Loading requests...
                </div>
              ) : pendingBookings.length === 0 ? (
                <div className="p-20 text-center border-2 border-dashed border-brand-gray-100 italic font-serif text-brand-gray-300">
                  <p>All clear — no pending requests.</p>
                </div>
              ) : (
                <AnimatePresence>
                  {pendingBookings.map((booking, idx) => {
                    const serviceName = typeof booking.serviceId === 'object' ? booking.serviceId.name : 'Unknown';
                    const servicePrice = typeof booking.serviceId === 'object' ? (booking.serviceId as Service).price : null;
                    const isActing = actionLoading === booking._id;
                    return (
                      <motion.div
                        key={booking._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -40, height: 0, marginBottom: 0 }}
                        transition={{ delay: idx * 0.04, exit: { duration: 0.25 } }}
                        className="border border-brand-gray-100 relative overflow-hidden"
                      >
                        {/* Request header */}
                        <div className="p-6 border-b border-brand-gray-50">
                          <div className="flex items-center gap-5">
                            <div className="w-12 h-12 bg-brand-black flex-shrink-0 flex items-center justify-center font-black text-white text-sm italic font-serif">
                              {booking.customerName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-serif italic text-2xl leading-none truncate">{booking.customerName}</p>
                              <p className="text-[11px] font-black uppercase tracking-widest text-brand-gray-600 mt-1.5">{booking.phone}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-[10px] font-black uppercase tracking-widest text-brand-gray-400">Requested</p>
                              <p className="text-[12px] font-black mt-0.5">
                                {booking.createdAt ? new Date(booking.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Booking details */}
                        <div className="px-6 py-4 grid grid-cols-4 gap-4 border-b border-brand-gray-50">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-brand-gray-400 mb-1">Service</p>
                            <p className="text-[13px] font-black uppercase">{serviceName}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-brand-gray-400 mb-1">Date</p>
                            <p className="text-[13px] font-black">
                              {new Date(booking.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-brand-gray-400 mb-1">Time</p>
                            <p className="text-[13px] font-black">{booking.startTime}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-brand-gray-400 mb-1">Artist</p>
                            <p className="text-[13px] font-black italic">
                              {booking.attendantId && typeof booking.attendantId === 'object'
                                ? (booking.attendantId as Attendant).name
                                : 'Any'}
                            </p>
                          </div>
                        </div>

                        {/* Price + Actions */}
                        <div className="px-6 py-4 flex items-center justify-between gap-4">
                          <p className="font-black text-lg tracking-tight">
                            {servicePrice ? `KES ${servicePrice.toLocaleString()}` : '—'}
                          </p>
                          <div className="flex gap-3">
                            <button
                              disabled={isActing}
                              onClick={() => handleStatusUpdate(booking._id, 'cancelled')}
                              className="px-5 py-3 text-[11px] font-black uppercase tracking-[0.2em] border border-brand-gray-200 hover:border-brand-black transition-all disabled:opacity-40"
                            >
                              Decline
                            </button>
                            <button
                              disabled={isActing}
                              onClick={() => handleStatusUpdate(booking._id, 'confirmed')}
                              className="px-5 py-3 text-[11px] font-black uppercase tracking-[0.2em] bg-brand-black text-white hover:bg-brand-gray-800 transition-all disabled:opacity-40 flex items-center gap-2"
                            >
                              {isActing ? (
                                <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : null}
                              Confirm
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </>
        )}

        {/* ── TAB 3: Service Management ───────────────────── */}
        {activeTab === 'services' && (
          <>
            <header className="space-y-1">
              <h2 className="text-4xl font-serif font-black tracking-tight leading-none uppercase">Service<br/>Management</h2>
              <p className="text-brand-gray-600 font-bold uppercase tracking-[0.3em] text-[12px] pt-2">
                Edit prices // add new services
              </p>
            </header>

            {/* Services list */}
            <div className="space-y-3">
              {loadingServices ? (
                <div className="p-16 text-center border border-brand-gray-100 font-serif italic text-brand-gray-300">Loading...</div>
              ) : services.map(service => {
                const isSaving = savingPrice === service._id;
                const currentEdit = editPrices[service._id] ?? String(service.price);
                const isDirty = currentEdit !== String(service.price);
                return (
                  <div key={service._id} className="border border-brand-gray-100 p-5 hover:border-brand-black transition-all">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-serif italic text-lg leading-none">{service.name}</p>
                        <p className="text-[11px] font-black uppercase tracking-widest text-brand-gray-600 mt-1.5">
                          {service.duration > 60 ? `${Math.round(service.duration / 60)} HR` : `${service.duration} MIN`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px] font-black text-brand-gray-600 uppercase tracking-widest">KES</span>
                        <input
                          type="number"
                          value={currentEdit}
                          onChange={e => setEditPrices(prev => ({ ...prev, [service._id]: e.target.value }))}
                          className="w-24 text-right font-black text-sm border-b-2 border-brand-gray-200 focus:border-brand-black focus:outline-none py-1 bg-transparent transition-colors"
                        />
                        {isDirty && (
                          <button
                            disabled={isSaving}
                            onClick={() => handlePriceEdit(service._id)}
                            className="px-3 py-1.5 bg-brand-black text-white text-[10px] font-black uppercase tracking-widest hover:bg-brand-gray-800 transition-all disabled:opacity-40"
                          >
                            {isSaving ? '...' : 'Save'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Service Form */}
            <div className="border-2 border-brand-black p-6 space-y-5">
              <p className="text-[11px] font-black uppercase tracking-[0.4em] text-brand-gray-600 border-b border-brand-gray-100 pb-4">New Service</p>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-black uppercase tracking-[0.3em] text-brand-gray-600">Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Deep Conditioning"
                    value={addForm.name}
                    onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full border-b-2 border-brand-gray-100 focus:border-brand-black focus:outline-none py-3 font-black text-base uppercase tracking-widest placeholder:text-brand-gray-200 placeholder:font-normal placeholder:normal-case bg-transparent transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-black uppercase tracking-[0.3em] text-brand-gray-600">Duration (min)</label>
                    <input
                      type="number"
                      placeholder="60"
                      value={addForm.duration}
                      onChange={e => setAddForm(p => ({ ...p, duration: e.target.value }))}
                      className="w-full border-b-2 border-brand-gray-100 focus:border-brand-black focus:outline-none py-3 font-black text-base bg-transparent transition-colors"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-black uppercase tracking-[0.3em] text-brand-gray-600">Price (KES)</label>
                    <input
                      type="number"
                      placeholder="2000"
                      value={addForm.price}
                      onChange={e => setAddForm(p => ({ ...p, price: e.target.value }))}
                      className="w-full border-b-2 border-brand-gray-100 focus:border-brand-black focus:outline-none py-3 font-black text-base bg-transparent transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-black uppercase tracking-[0.3em] text-brand-gray-600">Description (optional)</label>
                  <input
                    type="text"
                    placeholder="Brief description"
                    value={addForm.description}
                    onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))}
                    className="w-full border-b-2 border-brand-gray-100 focus:border-brand-black focus:outline-none py-3 font-black text-sm bg-transparent transition-colors placeholder:font-normal"
                  />
                </div>
              </div>
              <button
                disabled={!addForm.name || !addForm.duration || !addForm.price || addLoading}
                onClick={handleAddService}
                className="w-full bg-brand-black text-white py-5 font-black uppercase tracking-[0.3em] text-xs transition-all hover:bg-brand-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {addLoading ? 'Adding...' : '+ Add Service'}
              </button>
            </div>
          </>
        )}

        {/* ── TAB 4: Staff Management ──────────────────────────────── */}
        {activeTab === 'staff' && (
          <>
            <header className="space-y-1">
              <h2 className="text-4xl font-serif font-black tracking-tight leading-none uppercase">Staff<br/>Management</h2>
              <p className="text-brand-gray-600 font-bold uppercase tracking-[0.3em] text-[12px] pt-2">
                Attendant accounts // login credentials
              </p>
            </header>

            {/* Owner PIN gate for staff management */}
            {!ownerPinConfirmed ? (
              <div className="border-2 border-brand-black p-6 space-y-5">
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-brand-gray-600">Confirm Owner PIN to manage staff</p>
                <input
                  type="password"
                  maxLength={6}
                  placeholder="PIN"
                  value={ownerPinInput}
                  onChange={e => setOwnerPinInput(e.target.value)}
                  className="w-full border-b-2 border-brand-gray-100 focus:border-brand-black focus:outline-none py-3 font-black text-center text-xl tracking-[1em] bg-transparent"
                />
                <button
                  onClick={() => {
                    setOwnerPin(ownerPinInput);
                    setOwnerPinConfirmed(true);
                  }}
                  disabled={!ownerPinInput}
                  className="w-full bg-brand-black text-white py-4 font-black uppercase tracking-[0.3em] text-xs disabled:opacity-30"
                >
                  Confirm
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Staff list */}
                <div className="space-y-3">
                  {loadingStaff ? (
                    <div className="p-16 text-center border border-brand-gray-100 font-serif italic text-brand-gray-300">Loading...</div>
                  ) : attendants.length === 0 ? (
                    <div className="p-16 text-center border border-brand-gray-100 font-serif italic text-brand-gray-300">No staff accounts yet.</div>
                  ) : attendants.map(a => (
                    <div key={a._id} className={`border p-5 flex items-center justify-between gap-4 transition-all ${
                      a.isActive !== false ? 'border-brand-gray-100' : 'border-brand-gray-50 opacity-40'
                    }`}>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-brand-black flex items-center justify-center text-white font-black text-xs font-serif italic">
                          {a.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-serif italic text-lg leading-none">{a.name}</p>
                          <p className="text-[11px] font-black uppercase tracking-widest text-brand-gray-600 mt-0.5">@{a.username}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          api.updateAttendant(ownerPin, a._id, { isActive: !a.isActive })
                            .then(updated => setAttendants(prev => prev.map(x => x._id === a._id ? updated : x)))
                            .catch(console.error);
                        }}
                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-all ${
                          a.isActive !== false
                            ? 'border-brand-gray-200 text-brand-gray-600 hover:border-brand-black hover:text-brand-black'
                            : 'border-brand-black bg-brand-black text-white'
                        }`}
                      >
                        {a.isActive !== false ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add staff form */}
                <div className="border-2 border-brand-black p-6 space-y-5">
                  <p className="text-[11px] font-black uppercase tracking-[0.4em] text-brand-gray-600 border-b border-brand-gray-100 pb-4">New Staff Account</p>
                  {staffError && (
                    <p className="text-red-500 text-[11px] font-black uppercase tracking-widest">{staffError}</p>
                  )}
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[11px] font-black uppercase tracking-[0.3em] text-brand-gray-600">Display Name</label>
                        <input
                          type="text" placeholder="Florence"
                          value={staffForm.name}
                          onChange={e => setStaffForm(p => ({ ...p, name: e.target.value }))}
                          className="w-full border-b-2 border-brand-gray-100 focus:border-brand-black focus:outline-none py-2 font-black text-sm bg-transparent"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-black uppercase tracking-[0.3em] text-brand-gray-600">Username</label>
                        <input
                          type="text" placeholder="flo" autoCapitalize="none"
                          value={staffForm.username}
                          onChange={e => setStaffForm(p => ({ ...p, username: e.target.value }))}
                          className="w-full border-b-2 border-brand-gray-100 focus:border-brand-black focus:outline-none py-2 font-black text-sm bg-transparent"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-black uppercase tracking-[0.3em] text-brand-gray-600">PIN (4–6 digits)</label>
                      <input
                        type="password" maxLength={6} placeholder="••••"
                        value={staffForm.pin}
                        onChange={e => setStaffForm(p => ({ ...p, pin: e.target.value.replace(/\D/g, '') }))}
                        className="w-full border-b-2 border-brand-gray-100 focus:border-brand-black focus:outline-none py-2 font-black text-sm bg-transparent tracking-[0.5em]"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-[0.3em] text-brand-gray-600">Services</label>
                      <div className="flex flex-wrap gap-2">
                        {services.map(s => (
                          <button
                            key={s._id}
                            onClick={() => setStaffForm(p => ({
                              ...p,
                              serviceIds: p.serviceIds.includes(s._id)
                                ? p.serviceIds.filter(id => id !== s._id)
                                : [...p.serviceIds, s._id]
                            }))}
                            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-all ${
                              staffForm.serviceIds.includes(s._id)
                                ? 'bg-brand-black text-white border-brand-black'
                                : 'border-brand-gray-200 text-brand-gray-600 hover:border-brand-black'
                            }`}
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button
                    disabled={!staffForm.name || !staffForm.username || staffForm.pin.length < 4 || staffAddLoading}
                    onClick={async () => {
                      setStaffAddLoading(true);
                      setStaffError(null);
                      try {
                        const created = await api.createAttendant(ownerPin, staffForm);
                        setAttendants(prev => [...prev, created]);
                        setStaffForm({ name: '', username: '', pin: '', serviceIds: [] });
                      } catch (err: any) {
                        setStaffError(err.message || 'Failed to create staff account');
                      } finally {
                        setStaffAddLoading(false);
                      }
                    }}
                    className="w-full bg-brand-black text-white py-5 font-black uppercase tracking-[0.3em] text-xs transition-all hover:bg-brand-gray-800 disabled:opacity-30"
                  >
                    {staffAddLoading ? 'Creating...' : '+ Add Staff Member'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}

// ── AttendantView ────────────────────────────────────────────────────────────

function AttendantView({ session }: { session: { _id: string; name: string; token: string } }) {
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'completed'>('today');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
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
  }, [activeTab, session.token]);

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
      <nav className="px-8 border-b border-brand-gray-100 flex items-center gap-6">
        {(['today', 'upcoming', 'completed'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-4 text-[13px] font-black uppercase tracking-[0.2em] relative transition-all ${
              activeTab === tab ? 'text-brand-black' : 'text-brand-gray-400 hover:text-brand-black'
            }`}
          >
            {tab}
            {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-black" />}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-8 py-10 space-y-8 scrollbar-hide">
        <header className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-brand-gray-400">Signed in as</p>
          <h2 className="text-4xl font-serif font-black tracking-tight leading-none">{session.name}</h2>
          <p className="text-brand-gray-600 font-bold uppercase tracking-[0.2em] text-[12px]">
            {activeTab === 'today' && `Today's Appointments — ${new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`}
            {activeTab === 'upcoming' && 'Upcoming Appointments'}
            {activeTab === 'completed' && 'Completed Appointments'}
          </p>
        </header>

        <div className="space-y-4">
          {loading ? (
            <div className="p-20 text-center border border-brand-gray-100 font-serif italic text-brand-gray-300">Loading...</div>
          ) : bookings.length === 0 ? (
            <div className="p-20 text-center border-2 border-dashed border-brand-gray-100 italic font-serif text-brand-gray-300">
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
                className="border border-brand-gray-100 hover:border-brand-black transition-all"
              >
                {/* Booking header */}
                <div className="p-6 border-b border-brand-gray-50">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-brand-black flex items-center justify-center font-black text-white text-sm italic font-serif">
                        {booking.customerName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-serif italic text-xl leading-none">{booking.customerName}</p>
                        <p className="text-[11px] font-black uppercase tracking-widest text-brand-gray-600 mt-1">{booking.phone}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-3xl font-black tracking-tight leading-none">{booking.startTime}</p>
                      <p className="text-[11px] font-bold text-brand-gray-400 uppercase tracking-widest mt-1">
                        {new Date(booking.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Booking details + actions */}
                <div className="px-6 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-serif italic text-base leading-none">{serviceName}</p>
                    {servicePrice && (
                      <p className="text-[11px] font-black uppercase tracking-widest text-brand-gray-600 mt-1">
                        KES {servicePrice.toLocaleString()}
                      </p>
                    )}
                  </div>
                  {activeTab !== 'completed' && (
                    <button
                      disabled={isMarking}
                      onClick={() => handleMarkComplete(booking._id)}
                      className="flex items-center gap-2 px-5 py-3 text-[11px] font-black uppercase tracking-[0.2em] bg-brand-black text-white hover:bg-brand-gray-800 transition-all disabled:opacity-40"
                    >
                      {isMarking ? (
                        <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <CheckCircle2 size={13} />
                      )}
                      Done
                    </button>
                  )}
                  {activeTab === 'completed' && (
                    <span className="text-[11px] font-black uppercase tracking-widest text-brand-gray-400 flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-brand-gray-400" /> Completed
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
