import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, CheckCircle2, ArrowLeft, Settings, LayoutDashboard, Search, X } from 'lucide-react';
import { Service, Booking, BookingStep } from './types';
import { FALLBACK_SERVICES, FALLBACK_TIME_SLOTS } from './data/mockData';
import * as api from './api/client';

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeStep, setActiveStep] = useState<BookingStep>('service');
  
  // Data from API
  const [services, setServices] = useState<Service[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Booking State
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientInfo, setClientInfo] = useState({ name: '', phone: '' });
  const [searchQuery, setSearchQuery] = useState('');

  const dateCtaRef = useRef<HTMLButtonElement>(null);

  // Initial Data Fetch
  useEffect(() => {
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
  }, [isAdmin]);

  // Fetch slots when date or service changes
  useEffect(() => {
    const fetchSlots = async () => {
      if (!selectedService || !selectedDate) return;
      
      try {
        const slots = await api.getAvailability(selectedDate, selectedService._id);
        setTimeSlots(slots);
      } catch (err) {
        console.error('Failed to fetch slots', err);
        setTimeSlots(FALLBACK_TIME_SLOTS);
      }
    };
    
    if (activeStep === 'time') {
        fetchSlots();
    }
  }, [selectedDate, selectedService, activeStep]);


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
    if (!selectedService || !selectedTime || !clientInfo.name || !clientInfo.phone) return;

    try {
        const newBooking = await api.createBooking({
            customerName: clientInfo.name,
            phone: clientInfo.phone,
            serviceId: selectedService._id,
            date: selectedDate,
            startTime: selectedTime,
        });
        
        setBookings(prev => [...prev, newBooking]);
        setActiveStep('confirmation');
    } catch (err: any) {
        alert(err.message || 'Failed to create booking. Please try again.');
    }
  };

  const resetFlow = () => {
    setActiveStep('service');
    setSelectedService(null);
    setSelectedTime(null);
    setSelectedDate(new Date().toISOString().split('T')[0]);
    setClientInfo({ name: '', phone: '' });
  };

  const handleStepBack = () => {
    if (activeStep === 'date') setActiveStep('service');
    if (activeStep === 'time') setActiveStep('date');
    if (activeStep === 'contact') setActiveStep('time');
  };

  if (isLoading) {
      return <div className="min-h-screen flex items-center justify-center bg-brand-white font-serif italic text-brand-gray-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen max-w-lg mx-auto bg-brand-white relative flex flex-col font-sans tracking-tight">
      {apiError && (
          <div className="bg-red-50 text-red-600 text-xs text-center py-2 font-bold uppercase tracking-widest border-b border-red-100">
              {apiError}
          </div>
      )}
      
      <header className="px-8 py-10 flex justify-between items-center bg-brand-white sticky top-0 z-40 border-b border-brand-gray-100">
        <div className="flex items-center gap-5 cursor-pointer" onClick={resetFlow}>
          <div className="w-12 h-12 bg-brand-black flex items-center justify-center p-2 relative overflow-hidden group">
            <div className="text-brand-white flex flex-col items-center z-10 transition-transform duration-500 group-hover:scale-110">
              <span className="text-[14px] font-black leading-none tracking-tighter italic font-serif">F</span>
              <div className="h-[1px] w-4 bg-brand-white/30 my-0.5"></div>
              <span className="text-[4px] font-black tracking-[0.4em] uppercase opacity-60">LO</span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-tr from-brand-black to-brand-gray-900"></div>
          </div>
          <div className="flex flex-col">
            <h1 className="text-3xl font-serif italic tracking-tight leading-none text-brand-black lowercase">flo sisterlocks</h1>
            <p className="text-[7px] uppercase tracking-[0.4em] text-brand-gray-400 font-black mt-1.5 leading-none italic opacity-80">Certified consultant // eldoret</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href="tel:0721530120" className="p-3 bg-brand-gray-50 rounded-full hover:bg-brand-black hover:text-white transition-all duration-500">
            <Phone size={18} />
          </a>
          <button 
            onClick={() => setIsAdmin(!isAdmin)}
            className="p-3 bg-brand-gray-50 rounded-full hover:bg-brand-black hover:text-white transition-all duration-500"
          >
            {isAdmin ? <LayoutDashboard size={18} /> : <Settings size={18} />}
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {isAdmin ? (
          <AdminView bookings={bookings} />
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
                          placeholder="SEARCH TREATMENT"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-brand-gray-50 border-b border-brand-gray-100 py-4 pl-12 pr-10 focus:outline-none focus:border-brand-black transition-all font-black text-[10px] tracking-[0.2em] uppercase placeholder:text-brand-gray-300"
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

                    <div className="grid grid-cols-3 gap-3">
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
                          <p className="font-serif italic text-brand-gray-300">No treatments found matching your criteria.</p>
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
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">Previous</span>
                    </button>
                    <div className="space-y-8">
                      <div>
                        <h2 className="text-4xl font-serif font-black tracking-tight mb-8">Calendar</h2>
                        <DateScroller selectedDate={selectedDate} onDateSelect={handleDateSelect} />
                      </div>
                      
                      <div className="border-t border-brand-gray-100 pt-8 flex items-center justify-between">
                         <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-brand-gray-400">Selected Selection</p>
                            <p className="font-serif italic text-2xl">{selectedService?.name}</p>
                         </div>
                         <div className="text-right">
                            <p className="text-lg font-black tracking-tighter">KES {selectedService?.price.toLocaleString()}</p>
                         </div>
                      </div>
                    </div>
                    <button 
                      ref={dateCtaRef}
                      onClick={() => setActiveStep('time')}
                      className="w-full bg-brand-black text-brand-white py-6 rounded-none font-bold uppercase tracking-[0.3em] text-xs transition-all hover:tracking-[0.4em] active:scale-[0.98]"
                    >
                      Continue
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
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">Previous</span>
                    </button>
                    <div className="space-y-10">
                      <div className="flex items-center justify-between border-b border-brand-gray-100 pb-8">
                        <div>
                          <p className="text-[10px] text-brand-gray-400 uppercase font-bold tracking-widest mb-1">Date</p>
                          <p className="font-serif text-2xl font-black">
                            {new Date(selectedDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
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
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">Previous</span>
                    </button>

                    <div className="space-y-10">
                      <section className="bg-brand-gray-50 p-8 flex items-center justify-between">
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase font-black tracking-widest text-brand-gray-400">Appointment Detail</p>
                            <p className="font-serif italic text-2xl leading-none">{selectedService?.name}</p>
                            <p className="text-xs font-bold text-brand-black/40 mt-2">
                               {new Date(selectedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at {selectedTime}
                            </p>
                          </div>
                          <div className="text-right">
                             <p className="text-2xl font-black tracking-tighter">KES {selectedService?.price.toLocaleString()}</p>
                          </div>
                      </section>

                      <section className="space-y-8">
                        <div className="space-y-2">
                          <h2 className="text-4xl font-serif font-black tracking-tight leading-none">Register</h2>
                          <div className="w-12 h-1 bg-brand-black"></div>
                        </div>
                        <div className="space-y-8">
                          <div className="space-y-2 group">
                            <label className="text-[9px] font-black uppercase tracking-[0.3em] text-brand-gray-400 group-focus-within:text-brand-black transition-colors">Identification</label>
                            <div className="relative">
                              <input 
                                type="text" 
                                placeholder="FULL NAME"
                                value={clientInfo.name}
                                onChange={e => setClientInfo(prev => ({...prev, name: e.target.value}))}
                                className="w-full bg-brand-white border-b-2 border-brand-gray-100 py-5 focus:outline-none focus:border-brand-black transition-all font-black text-sm uppercase tracking-widest placeholder:text-brand-gray-200 placeholder:font-normal"
                              />
                            </div>
                          </div>
                          <div className="space-y-2 group">
                            <label className="text-[9px] font-black uppercase tracking-[0.3em] text-brand-gray-400 group-focus-within:text-brand-black transition-colors">Telecommunication</label>
                            <div className="relative">
                              <input 
                                type="tel" 
                                placeholder="MOBILE NUMBER"
                                value={clientInfo.phone}
                                onChange={e => setClientInfo(prev => ({...prev, phone: e.target.value}))}
                                className="w-full bg-brand-white border-b-2 border-brand-gray-100 py-5 focus:outline-none focus:border-brand-black transition-all font-black text-sm uppercase tracking-widest placeholder:text-brand-gray-200 placeholder:font-normal"
                              />
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>

                    <button 
                      disabled={!clientInfo.name || !clientInfo.phone}
                      onClick={handleConfirmBooking}
                      className="w-full bg-brand-black text-brand-white py-6 rounded-none font-bold uppercase tracking-[0.3em] text-xs transition-all disabled:opacity-20 hover:tracking-[0.4em] active:scale-[0.98]"
                    >
                      Finalize Booking
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
                        <p className="text-[10px] uppercase tracking-[0.4em] font-black text-brand-gray-400">Order Ref</p>
                        <p className="font-black text-xs uppercase italic">#LMN-{Math.random().toString(36).substr(2, 5).toUpperCase()}</p>
                      </div>
                      <div className="space-y-6">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-gray-400">Artist</span>
                          <span className="font-serif italic text-lg leading-none">Studio Lead</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-gray-400">Treatment</span>
                          <span className="font-black text-sm leading-none uppercase">{selectedService?.name}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-gray-400">Cost</span>
                          <span className="font-black text-sm leading-none">KES {selectedService?.price.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-gray-400">Time</span>
                          <span className="font-black text-sm leading-none">{selectedTime}</span>
                        </div>
                         <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-gray-400">Date</span>
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
      <div className="h-1 w-full bg-brand-black mt-auto"></div>
    </div>
  );
}

function StepIndicator({ activeStep }: { activeStep: BookingStep }) {
  const steps: { key: BookingStep, label: string }[] = [
    { key: 'service', label: 'Service' },
    { key: 'date', label: 'Date' },
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
            <span className={`text-[8px] uppercase tracking-widest transition-colors duration-500 font-black ${isActive ? 'text-brand-black' : isCompleted ? 'text-brand-black opacity-30' : 'text-brand-gray-300'}`}>
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
        flex flex-col h-40 p-5 cursor-pointer transition-all duration-500 border relative group
        ${isSelected ? 'bg-brand-black text-brand-white border-brand-black shadow-luxury' : 'bg-brand-white border-brand-gray-100 hover:border-brand-black text-brand-black'}
      `}
      onClick={onSelect}
    >
      <div className="flex-1 flex flex-col justify-between">
        <h3 className="font-serif italic text-lg leading-tight uppercase group-hover:translate-y-[-2px] transition-transform duration-500 line-clamp-2">{service.name}</h3>
        <div className="space-y-1">
          <p className={`text-[8px] font-black tracking-widest uppercase ${isSelected ? 'text-white/40' : 'text-brand-gray-400'}`}>
            {service.duration > 60 ? `${Math.round(service.duration/60)} HR` : `${service.duration} MIN`}
          </p>
          <p className="font-black text-xs tracking-tighter">KES {service.price.toLocaleString()}</p>
        </div>
      </div>
      {isSelected && (
        <div className="absolute top-2 right-2">
          <CheckCircle2 size={12} className="text-white" />
        </div>
      )}
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
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-gray-400 border-b border-brand-gray-100 pb-2">{month}</h3>
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
                  <span className={`text-[8px] uppercase font-black tracking-tighter leading-none mb-1 ${isSelected ? 'opacity-50' : 'text-brand-gray-400'}`}>{dayName}</span>
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

function AdminView({ bookings }: { bookings: Booking[] }) {
  const todayStr = new Date().toISOString().split('T')[0];
  const todaysBookings = bookings.filter(b => b.date === todayStr);
  const sortedBookings = [...todaysBookings].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const currentTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <nav className="px-8 border-b border-brand-gray-100 flex gap-8">
        <button className="py-4 text-[10px] font-black uppercase tracking-[0.2em] relative transition-all text-brand-black">
          Daily Ledger
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-black" />
        </button>
      </nav>

      <div className="flex-1 overflow-y-auto px-8 py-10 space-y-12 scrollbar-hide">
        <header className="space-y-4">
          <div className="flex justify-between items-end">
            <div className="space-y-1">
              <h2 className="text-4xl font-serif font-black tracking-tight leading-none uppercase">Studio <br/>Management</h2>
              <p className="text-brand-gray-400 font-bold uppercase tracking-[0.3em] text-[9px] pt-2">
                Operations // {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-brand-gray-400 mb-1">Local Time</p>
              <p className="text-3xl font-black tracking-tighter">{currentTime}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="bg-brand-black p-6 flex flex-col justify-between h-28">
              <p className="text-[8px] text-white/50 font-black uppercase tracking-[0.2em]">Total Sessions Today</p>
              <h3 className="text-4xl font-black text-white">{todaysBookings.length}</h3>
            </div>
            <div className="border border-brand-gray-100 p-6 flex flex-col justify-between h-28">
              <p className="text-[8px] text-brand-gray-400 font-black uppercase tracking-[0.2em]">Certified Artist</p>
              <h3 className="text-xl font-serif italic text-brand-black">Flo Sisterlocks</h3>
            </div>
          </div>
        </header>

        <div className="space-y-6">
          <div className="grid gap-6">
            {sortedBookings.length === 0 ? (
              <div className="p-20 text-center border-2 border-dashed border-brand-gray-100 italic font-serif text-brand-gray-300">
                <p>The ledger is currently empty for today.</p>
              </div>
            ) : (
              sortedBookings.map((booking, idx) => {
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
                            {booking.customerName.split(' ').map(n=>n[0]).join('')}
                          </div>
                          <div>
                            <p className="font-serif italic text-2xl leading-none">{booking.customerName}</p>
                            <p className="text-[10px] font-black uppercase text-brand-gray-400 mt-2 tracking-widest">{booking.phone}</p>
                          </div>
                       </div>
                       <div className="flex items-center gap-4 border-t border-brand-gray-50 pt-4">
                          <span className="w-2 h-2 rounded-full bg-brand-black"></span>
                          <p className="text-[11px] font-black tracking-[0.2em] text-brand-black uppercase">{booking.startTime}</p>
                          <span className="opacity-10 font-bold">—</span>
                          <p className="text-[10px] font-bold text-brand-gray-400 uppercase tracking-widest">Service: {typeof booking.serviceId === 'object' ? booking.serviceId.name : 'Unknown'}</p>
                       </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
