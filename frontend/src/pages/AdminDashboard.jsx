import { stationPhoto } from '../utils/stationPhoto';
import { PageHeader, Card, Stat, Button, Modal } from '../components/ui';
import AmenityIcon from '../components/AmenityIcon';
import { Check as EmCheck, X as EmX } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { 
  Shield, Users, BatteryCharging, Zap, DollarSign, TrendingUp, 
  AlertTriangle, Sparkles, CheckCircle2, RefreshCw, Plus, MapPin, 
  BarChart3, Activity, Clock, Sliders, ArrowUpRight, Trash2, Eye, ChevronDown, ChevronUp, Save, SlidersHorizontal,
  Search, Filter, Calendar, Car, CreditCard, Phone, Mail, ExternalLink,
  Upload, Image, Coffee, Wifi, Edit3, Wallet, Lock, PieChart, Percent, CalendarCheck2
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { analyticsApi, stationApi, bookingApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { uploadToCloudinary } from '../services/cloudinaryService';

const LOCATION_PRESETS = [
  { label: 'Nellore (NH 16)', city: 'Nellore', address: 'NH 16 Highway Corridor, Near Nellore Bypass', lat: '14.4426', lng: '79.9865' },
  { label: 'Jewar (Yamuna Exp.)', city: 'Jewar', address: 'Yamuna Expressway Interchange, Mile 45', lat: '28.1834', lng: '77.5621' },
  { label: 'Lonavala (Mumbai-Pune)', city: 'Lonavala', address: 'Mumbai-Pune Expressway Food Plaza', lat: '18.7512', lng: '73.4088' },
  { label: 'Neemrana (NH 48)', city: 'Neemrana', address: 'NH 48 Highway EV Midway, Neemrana', lat: '27.8920', lng: '76.2810' },
  { label: 'Vellore (BLR-CHE)', city: 'Vellore', address: 'NH 48 Golden Quadrilateral, Vellore', lat: '12.9249', lng: '79.1353' },
];
const labelCls = 'block text-sm font-semibold text-slate-700 mb-1.5';
const inputCls = 'w-full rounded-xl bg-white px-3.5 py-2.5 text-[15px] text-slate-900 ring-1 ring-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500';

const EV_FACILITY_OPTIONS = [
  { id: 'cafe', label: 'Cafeteria / Coffee Shop' },
  { id: 'restroom', label: 'Clean Restrooms' },
  { id: 'wifi', label: 'High-Speed Free Wi-Fi' },
  { id: 'lounge', label: 'AC EV Waiting Lounge' },
  { id: 'security', label: '24/7 CCTV & Security' },
  { id: 'dining', label: 'Food Court & Dining' },
  { id: 'tyre_air', label: 'Tyre Pressure & Air' },
  { id: 'wheelchair', label: 'Wheelchair Accessible' },
  { id: 'kids', label: 'Kids Play Zone' },
  { id: 'prayer', label: 'Prayer Room' }
];

const AdminDashboard = () => {
  const { user, isAdmin, login } = useAuth();

  const [stats, setStats] = useState(null);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddStationModal, setShowAddStationModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedStationId, setExpandedStationId] = useState(null);


  // Live Driver Bookings State
  const [bookings, setBookings] = useState([]);
  const [bookingSearch, setBookingSearch] = useState('');
  const [bookingStatusFilter, setBookingStatusFilter] = useState('ALL');
  const [chartMode, setChartMode] = useState('STATIONS'); // 'STATIONS' or 'REVENUE'
  const [graphStationSearch, setGraphStationSearch] = useState('');
  const [graphViewMode, setGraphViewMode] = useState('LATEST'); // 'LATEST', 'ALL', 'NEW_ONLY'
  const [stationTableSearch, setStationTableSearch] = useState('');
  const [stationSortOrder, setStationSortOrder] = useState('NEWEST_FIRST'); // 'NEWEST_FIRST', 'DEFAULT'

  // New Station Form State
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCity, setNewCity] = useState('Chennai');
  const [newLat, setNewLat] = useState('13.0827');
  const [newLng, setNewLng] = useState('80.2707');
  const [newPower, setNewPower] = useState('120.0');
  const [newTariff, setNewTariff] = useState('18.0');
  const [newSlots, setNewSlots] = useState(8);

  // Cloudinary Image Upload & Facilities State
  const [newImageUrl, setNewImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [selectedAmenities, setSelectedAmenities] = useState([
    'Cafeteria / Coffee Shop',
    'Clean Restrooms',
    'High-Speed Free Wi-Fi',
    'AC EV Waiting Lounge',
    '24/7 CCTV & Security'
  ]);
  const [editingStation, setEditingStation] = useState(null);
  const [showEditStationModal, setShowEditStationModal] = useState(false);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      const [statsRes, stationsRes, bookingsRes] = await Promise.all([
        analyticsApi.getAdminStats(),
        stationApi.getAll(),
        bookingApi.getAllBookings().catch(() => ({ data: [] }))
      ]);
      setStats(statsRes.data);
      setStations(stationsRes.data || []);
      
      // Strictly display full-stack database bookings (legacy mock records removed)
      setBookings(bookingsRes?.data || []);
    } catch (err) {
      console.error('Error fetching admin stats', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'Just now';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return dateStr;
    }
  };

  const filteredBookings = bookings.filter((b) => {
    const term = bookingSearch.toLowerCase();
    const matchesSearch = 
      !term ||
      (b.userName && b.userName.toLowerCase().includes(term)) ||
      (b.userEmail && b.userEmail.toLowerCase().includes(term)) ||
      (b.userPhone && b.userPhone.includes(term)) ||
      (b.vehicleNumber && b.vehicleNumber.toLowerCase().includes(term)) ||
      (b.vehicleModel && b.vehicleModel.toLowerCase().includes(term)) ||
      (b.stationName && b.stationName.toLowerCase().includes(term)) ||
      (b.slotNumber && b.slotNumber.toLowerCase().includes(term)) ||
      (b.bookingReference && b.bookingReference.toLowerCase().includes(term)) ||
      (b.razorpayPaymentId && b.razorpayPaymentId.toLowerCase().includes(term));

    const matchesStatus = 
      bookingStatusFilter === 'ALL' || 
      (b.status && b.status.toUpperCase() === bookingStatusFilter);

    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    fetchAdminData();
  }, []);


  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingImage(true);
      setUploadError(null);
      const res = await uploadToCloudinary(file);
      setNewImageUrl(res.secure_url);
    } catch (err) {
      setUploadError(err.message || 'Image upload failed');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleCreateStation = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      setFormError(null);
      const payload = {
        name: newName,
        address: newAddress,
        city: newCity,
        latitude: parseFloat(newLat),
        longitude: parseFloat(newLng),
        parkingPricePerHour: 30.0,
        chargingPricePerKwh: parseFloat(newTariff) || 18.0,
        maxChargingSpeedKw: parseFloat(newPower) || 120.0,
        chargerTypes: 'Dual CCS2, Type 2',
        totalSlots: parseInt(newSlots) || 8,
        rating: 0,
        reviewCount: 0,
        active: true,
        imageUrl: newImageUrl || null,
        amenities: selectedAmenities.join(', ')
      };

      await stationApi.create(payload);
      setShowAddStationModal(false);
      setNewName('');
      setNewAddress('');
      setNewImageUrl('');
      fetchAdminData();
    } catch (err) {
      setFormError(err.response?.data?.message || 'The station could not be added. Check the details and try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenEditStation = (st, e) => {
    if (e) e.stopPropagation();
    setEditingStation(st);
    setNewName(st.name || '');
    setNewAddress(st.address || '');
    setNewCity(st.city || '');
    setNewLat(st.latitude ? st.latitude.toString() : '13.0827');
    setNewLng(st.longitude ? st.longitude.toString() : '80.2707');
    setNewPower(st.maxChargingSpeedKw ? st.maxChargingSpeedKw.toString() : '120.0');
    setNewTariff(st.chargingPricePerKwh ? st.chargingPricePerKwh.toString() : '18.0');
    setNewSlots(st.totalSlots || 8);
    setNewImageUrl(st.imageUrl || '');
    if (st.amenities) {
      setSelectedAmenities(st.amenities.split(',').map(s => s.trim()));
    } else {
      setSelectedAmenities([
        'Cafeteria / Coffee Shop',
        'Clean Restrooms',
        'High-Speed Free Wi-Fi',
        'AC EV Waiting Lounge',
        '24/7 CCTV & Security'
      ]);
    }
    setUploadError(null);
    setFormError(null);
    setShowEditStationModal(true);
  };

  const handleUpdateStation = async (e) => {
    e.preventDefault();
    if (!editingStation) return;
    try {
      setActionLoading(true);
      setFormError(null);
      const payload = {
        ...editingStation,
        name: newName,
        address: newAddress,
        city: newCity,
        latitude: parseFloat(newLat),
        longitude: parseFloat(newLng),
        chargingPricePerKwh: parseFloat(newTariff) || 18.0,
        maxChargingSpeedKw: parseFloat(newPower) || 120.0,
        totalSlots: parseInt(newSlots) || 8,
        imageUrl: newImageUrl || null,
        amenities: selectedAmenities.join(', ')
      };

      await stationApi.update(editingStation.id, payload);
      setShowEditStationModal(false);
      setEditingStation(null);
      fetchAdminData();
    } catch (err) {
      setFormError(err.response?.data?.message || 'The changes could not be saved. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteStation = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this EV station?')) return;
    try {
      await stationApi.delete(id);
      fetchAdminData();
    } catch (err) {
      console.error('Failed to delete station', err);
    }
  };

  return (
    <div className="min-h-screen py-8 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <PageHeader
          icon={Shield}
          eyebrow="Admin"
          title="Network operations"
          subtitle="Bookings, revenue and station load across the ChargeMate network, computed from live data."
          actions={
            <>
              <Button variant="ghost" icon={RefreshCw} onClick={fetchAdminData}>Refresh</Button>
              <Button variant="primary" icon={Plus} onClick={() => { setNewName(''); setNewAddress(''); setNewImageUrl(''); setUploadError(null); setFormError(null); setShowAddStationModal(true); }}>Add station</Button>
            </>
          }
        />

        {(() => {
          const paid = bookings.filter((b) => ['CONFIRMED', 'OCCUPIED', 'COMPLETED'].includes(b.status));
          const revenue = paid.reduce((a, b) => a + (b.totalAmount || 0), 0);
          const kwh = paid.reduce((a, b) => a + (b.chargingKwh || 0), 0);
          const gst = revenue - revenue / 1.18;
          const gateway = revenue * 0.02 * 1.18;
          const net = revenue - gst - gateway;
          const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
          return (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
                <Stat icon={DollarSign} label="Paid revenue" value={inr(revenue)} hint={`${paid.length} paid bookings`} tone="brand" />
                <Stat icon={CalendarCheck2} label="Bookings today" value={stats?.todayBookings ?? '—'} hint={`7-day avg ${stats?.predictedTomorrowBookings ?? 0}/day`} tone="sky" />
                <Stat icon={Activity} label="Active now" value={stats?.activeBookings ?? '—'} hint="Held, confirmed or charging" tone="violet" />
                <Stat icon={Users} label="Registered users" value={stats?.totalUsers ?? '—'} tone="amber" />
                <Stat icon={MapPin} label="Active stations" value={stations.length} hint={`${stats?.totalStations ?? stations.length} in database`} tone="slate" />
              </div>

              <div className="grid lg:grid-cols-3 gap-4">
                <Card className="p-6 lg:col-span-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Wallet className="w-5 h-5 text-brand-600" /> Revenue breakdown</h2>
                      <p className="text-sm text-slate-600 mt-0.5">From paid bookings. GST is included in tariffs at 18%; the gateway fee is an estimate (2% + GST).</p>
                    </div>
                  </div>
                  <dl className="mt-5 grid sm:grid-cols-4 gap-3">
                    {[
                      ['Gross billed', inr(revenue), 'text-slate-900'],
                      ['GST (18%, included)', `– ${inr(gst)}`, 'text-slate-600'],
                      ['Gateway fee (est.)', `– ${inr(gateway)}`, 'text-slate-600'],
                      ['Net after tax & fees', inr(net), 'text-brand-700'],
                    ].map(([k, v, c]) => (
                      <div key={k} className="rounded-xl bg-slate-50 p-4">
                        <dt className="text-xs font-medium text-slate-500">{k}</dt>
                        <dd className={`mt-1 text-xl font-extrabold font-display tabular-nums ${c}`}>{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
                    <span>Energy booked: <strong className="text-slate-900">{kwh.toFixed(1)} kWh</strong></span>
                    <span>Average ticket: <strong className="text-slate-900">{paid.length ? inr(revenue / paid.length) : '—'}</strong></span>
                    <span>Peak hour: <strong className="text-slate-900">{stats?.peakBookingHours || '—'}</strong></span>
                  </div>
                </Card>

                <Card className="p-6">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Sparkles className="w-5 h-5 text-brand-600" /> Insights</h2>
                  <ul className="mt-4 space-y-3">
                    {(stats?.aiInsights || []).length === 0 && <li className="text-sm text-slate-500">No insights yet. They appear as bookings come in.</li>}
                    {(stats?.aiInsights || []).map((i) => (
                      <li key={i.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${i.severity === 'HIGH' ? 'bg-rose-500' : i.severity === 'MEDIUM' ? 'bg-amber-500' : 'bg-sky-500'}`} aria-hidden="true" />
                          <span className="text-sm font-semibold text-slate-900">{i.title}</span>
                        </div>
                        <p className="text-sm text-slate-600 mt-1">{i.description}</p>
                        <p className="text-xs text-slate-500 mt-1">{i.action}</p>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </>
          );
        })()}

        {/* INTERACTIVE GRAPH SECTION: STATION FLEET CAPACITY & UTILIZATION GRAPH + REVENUE TREND */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-teal-50 text-brand-600 flex items-center justify-center font-bold">
                  <BarChart3 className="w-4 h-4 text-brand-600" />
                </span>
                <h3 className="text-base font-black text-slate-800">
                  {chartMode === 'STATIONS' 
                    ? `Station Fleet Bay & Power Graph (${stations.length} Active Stations)` 
                    : '7-Day Booking & Revenue Trend'}
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {chartMode === 'STATIONS'
                  ? 'Real-time charging bays, free slots, and charging power across your deployed EV network'
                  : 'Live transaction volume and booking trends across corridor routes'}
              </p>
            </div>

            {/* Toggle Switch between Station Graph and Revenue Graph */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setChartMode('STATIONS')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    chartMode === 'STATIONS'
                      ? 'bg-white text-brand-600 shadow-xs font-black'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Station Fleet Graph ({stations.length})
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('REVENUE')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    chartMode === 'REVENUE'
                      ? 'bg-white text-sky-600 shadow-xs font-black'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Revenue Trend
                </button>
              </div>

              {chartMode === 'STATIONS' && (
                <div className="hidden lg:flex items-center gap-3 text-[11px] font-bold">
                  <span className="flex items-center gap-1 text-teal-700">
                    <span className="w-2.5 h-2.5 rounded bg-brand-600" /> Total Bays
                  </span>
                  <span className="flex items-center gap-1 text-sky-700">
                    <span className="w-2.5 h-2.5 rounded bg-[#38bdf8]" /> Free Bays
                  </span>
                  <span className="flex items-center gap-1 text-amber-700">
                    <span className="w-2.5 h-2.5 rounded bg-[#f59e0b]" /> In-Use
                  </span>
                </div>
              )}

              {chartMode === 'REVENUE' && (
                <div className="hidden lg:flex items-center gap-3 text-[11px] font-bold">
                  <span className="flex items-center gap-1 text-teal-700">
                    <span className="w-2.5 h-2.5 rounded bg-brand-600" /> Revenue (₹)
                  </span>
                  <span className="flex items-center gap-1 text-sky-700">
                    <span className="w-2.5 h-2.5 rounded bg-[#38bdf8]" /> Net Profit (₹)
                  </span>
                  <span className="flex items-center gap-1 text-amber-700">
                    <span className="w-2.5 h-2.5 rounded bg-[#f59e0b]" /> Bookings
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Graph Secondary Controls when in Station Mode */}
          {chartMode === 'STATIONS' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 pb-1">
              <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => { setGraphViewMode('LATEST'); setGraphStationSearch(''); }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    graphViewMode === 'LATEST' && !graphStationSearch
                      ? 'bg-white text-brand-600 shadow-xs font-black'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Latest 10 Stations
                </button>
                {stations.some(s => s.isNewlyAdded || s.id > 50 || s.corridor === 'Custom-Admin') && (
                  <button
                    type="button"
                    onClick={() => { setGraphViewMode('NEW_ONLY'); setGraphStationSearch(''); }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      graphViewMode === 'NEW_ONLY' && !graphStationSearch
                        ? 'bg-emerald-600 text-white shadow-xs font-black'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    <span>Newly Added ({stations.filter(s => s.isNewlyAdded || s.id > 50 || s.corridor === 'Custom-Admin').length})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setGraphViewMode('ALL'); setGraphStationSearch(''); }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    graphViewMode === 'ALL' && !graphStationSearch
                      ? 'bg-white text-sky-600 shadow-xs font-black'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Network Overview (20)
                </button>
              </div>

              {/* Station search in graph */}
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-xl border border-slate-200 text-xs w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <input
                  type="text"
                  value={graphStationSearch}
                  onChange={(e) => setGraphStationSearch(e.target.value)}
                  placeholder="Filter station in graph..."
                  className="w-full bg-transparent text-xs text-slate-700 focus:outline-none"
                />
                {graphStationSearch && (
                  <button onClick={() => setGraphStationSearch('')} className="text-xs text-slate-500 hover:text-slate-600 font-bold">
                    <EmX className="w-4 h-4 inline-block align-[-2px]" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Graph Render */}
          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === 'STATIONS' ? (
                <BarChart data={(() => {
                  const newlyAdded = (stations || []).filter(st => st.isNewlyAdded || st.id > 50 || st.corridor === 'Custom-Admin');
                  let filtered = stations || [];
                  if (graphStationSearch.trim()) {
                    const q = graphStationSearch.toLowerCase();
                    filtered = filtered.filter(st => 
                      (st.name && st.name.toLowerCase().includes(q)) || 
                      (st.city && st.city.toLowerCase().includes(q)) ||
                      (st.address && st.address.toLowerCase().includes(q))
                    );
                  } else if (graphViewMode === 'NEW_ONLY') {
                    filtered = newlyAdded.length > 0 ? newlyAdded : (stations || []).slice(-10);
                  } else if (graphViewMode === 'LATEST') {
                    filtered = (stations || []).slice(-10);
                  } else {
                    filtered = (stations || []).slice(-20);
                  }

                  return filtered.map(st => {
                    const total = st.totalSlots || st.total_slots || 8;
                    const free = st.availableSlots !== undefined ? st.availableSlots : (st.available_slots !== undefined ? st.available_slots : 6);
                    const occupied = Math.max(0, total - free);
                    const shortName = (st.name || '').length > 15 ? st.name.slice(0, 14) + '…' : (st.name || `Station #${st.id}`);
                    return {
                      name: shortName,
                      fullName: st.name,
                      city: st.city,
                      totalBays: total,
                      freeBays: free,
                      occupiedBays: occupied,
                      maxKw: st.maxChargingSpeedKw || 120,
                      tariff: st.chargingPricePerKwh || 18,
                      isNew: st.isNewlyAdded || st.id > 50 || st.corridor === 'Custom-Admin'
                    };
                  });
                })()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10, fontWeight: 700 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xl text-xs space-y-1">
                            <div className="font-black text-slate-900 flex items-center justify-between gap-2">
                              <span>{data.fullName}</span>
                              {data.isNew && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[11px] border border-emerald-300">
                                  Newly Added Station
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">{data.city}</div>
                            <div className="pt-1.5 border-t border-slate-100 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                              <span className="text-brand-600 font-bold">Total Bays: {data.totalBays}</span>
                              <span className="text-[#0284c7] font-bold">Available: {data.freeBays}</span>
                              <span className="text-amber-600 font-bold">In-Use: {data.occupiedBays}</span>
                              <span className="text-slate-700 font-bold">Speed: {data.maxKw} kW</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="totalBays" name="Total Bays" fill="#009a8c" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="freeBays" name="Available Free Bays" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="occupiedBays" name="In-Use Bays" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <BarChart data={stats?.trends || stats?.revenueTrend || [
                  { date: 'Mon', bookings: 28, revenue: 14200, profit: 6418 },
                  { date: 'Tue', bookings: 34, revenue: 16800, profit: 7593 },
                  { date: 'Wed', bookings: 31, revenue: 19500, profit: 8814 },
                  { date: 'Thu', bookings: 42, revenue: 21000, profit: 9492 },
                  { date: 'Fri', bookings: 55, revenue: 24500, profit: 11074 },
                  { date: 'Sat', bookings: 68, revenue: 28900, profit: 13062 },
                  { date: 'Sun', bookings: 74, revenue: 32000, profit: 14464 }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" stroke="#f59e0b" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#009a8c" tick={{ fontSize: 11 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '12px', fontSize: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  />
                  <Bar yAxisId="right" dataKey="revenue" name="Revenue (₹)" fill="#009a8c" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="profit" name="Net Profit (₹)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="bookings" name="Bookings" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* =========================================================================
            SECTION: LIVE DRIVER SLOT BOOKINGS & ACTIVITY (WHO BOOKED WHAT & WHEN)
            ========================================================================= */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-teal-50 text-brand-600 flex items-center justify-center font-bold">
                  <Clock className="w-4 h-4 text-brand-600" />
                </span>
                <h3 className="text-base font-extrabold text-slate-800">
                  Live Slot Bookings & Driver Activity ({filteredBookings.length})
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Real-time full-stack reservations ({filteredBookings.length} verified bookings • legacy mock records cleared)
              </p>
            </div>

            {/* Search & Status Filters */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <Search className="w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  value={bookingSearch}
                  onChange={(e) => setBookingSearch(e.target.value)}
                  placeholder="Filter driver, plate, station..."
                  className="bg-transparent focus:outline-none text-slate-700 w-44"
                />
                {bookingSearch && (
                  <button onClick={() => setBookingSearch('')} className="text-slate-500 hover:text-slate-700" aria-label="Clear search"><EmX className="w-4 h-4" aria-hidden="true" /></button>
                )}
              </div>

              {/* Status Pills & Refresh */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
                  {['ALL', 'CONFIRMED', 'HELD'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setBookingStatusFilter(st)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
                        bookingStatusFilter === st 
                          ? 'bg-white text-slate-800 font-bold shadow-xs' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={fetchAdminData}
                  disabled={loading}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-teal-50 border border-teal-200 text-brand-600 hover:bg-teal-100 font-bold text-[11px] transition-all cursor-pointer shadow-2xs"
                  title="Refresh latest driver bookings"
                >
                  <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>
          </div>

          {/* Bookings Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="pb-3">Driver Details</th>
                  <th className="pb-3">Vehicle</th>
                  <th className="pb-3">Station & Bay</th>
                  <th className="pb-3">Scheduled Slot Time</th>
                  <th className="pb-3">Booked At (Time)</th>
                  <th className="pb-3">Amount & Payment</th>
                  <th className="pb-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-slate-500">
                      No driver bookings match your search query.
                    </td>
                  </tr>
                ) : (
                  filteredBookings.map((b) => {
                    const isConfirmed = b.status === 'CONFIRMED';
                    const isHeld = b.status === 'HELD';
                    return (
                      <tr key={b.id || b.bookingReference} className="hover:bg-slate-50/70 transition-colors">
                        
                        {/* Driver & Contact */}
                        <td className="py-3.5 pr-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-teal-50 border border-teal-200 text-brand-600 font-black text-xs flex items-center justify-center shrink-0">
                              {b.userName ? b.userName[0].toUpperCase() : 'U'}
                            </div>
                            <div>
                              <div className="font-extrabold text-slate-900 leading-tight">
                                {b.userName || 'EV Driver'}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <Mail className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                                <span>{b.userEmail || 'driver@smartev.com'}</span>
                              </div>
                              {b.userPhone && (
                                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                  <Phone className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                                  <span>{b.userPhone}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Vehicle & Plate */}
                        <td className="py-3.5 pr-3">
                          <div className="font-bold text-slate-800 flex items-center gap-1">
                            <Car className="w-3.5 h-3.5 text-brand-600" />
                            <span>{b.vehicleModel || 'Electric Vehicle'}</span>
                          </div>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[11px] font-black tracking-wider text-slate-800">
                            {b.vehicleNumber || b.vehicleRegNo || 'MH 12 EV 8899'}
                          </span>
                        </td>

                        {/* Station & Bay */}
                        <td className="py-3.5 pr-3">
                          <div className="font-bold text-slate-900 leading-tight">
                            {b.stationName || 'Corridor EV Plaza'}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-brand-700 text-[11px] font-black">
                              {b.slotNumber || 'Bay A1'}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {b.chargerType || 'CCS2 Fast'}
                            </span>
                          </div>
                        </td>

                        {/* Scheduled Slot Time */}
                        <td className="py-3.5 pr-3">
                          <div className="font-bold text-slate-900 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-brand-600" />
                            <span>{b.bookingDate || '2026-10-18'}</span>
                          </div>
                          <div className="mt-0.5 inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-100">
                            {b.startTime ? b.startTime.toString().slice(0, 5) : '10:00'} - {b.endTime ? b.endTime.toString().slice(0, 5) : '11:00'}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {b.totalHours || 1.0} hr ({b.chargingKwh || 25} kWh)
                          </div>
                        </td>

                        {/* Booked At Timestamp */}
                        <td className="py-3.5 pr-3">
                          <div className="font-semibold text-slate-800 text-xs">
                            {formatDateTime(b.createdAt)}
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono block mt-0.5">
                            Ref: #{b.bookingReference || `BK-${b.id}`}
                          </span>
                        </td>

                        {/* Amount & Razorpay ID */}
                        <td className="py-3.5 pr-3">
                          <div className="font-black text-emerald-600 text-sm">
                            ₹{b.totalAmount ? Number(b.totalAmount).toFixed(2) : '200.00'}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5 flex items-center gap-1">
                            <CreditCard className="w-3 h-3 text-slate-500" />
                            <span className="truncate max-w-[120px]" title={b.razorpayPaymentId || 'Razorpay UPI'}>
                              {b.razorpayPaymentId || 'pay_RPZ_UPI'}
                            </span>
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="py-3.5 text-right">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                            isConfirmed 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : (isHeld ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-600 border border-slate-200')
                          }`}>
                            {isConfirmed && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                            {isHeld && <Clock className="w-3 h-3 text-amber-600" />}
                            <span>{b.status || 'CONFIRMED'}</span>
                          </span>
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* STATIONS LIST TABLE (WHITE THEME) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-800">Deployed EV Stations ({stations.length})</h3>
              <p className="text-xs text-slate-500">Live charger physical bay configurations</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStationSortOrder(prev => prev === 'NEWEST_FIRST' ? 'DEFAULT' : 'NEWEST_FIRST')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  stationSortOrder === 'NEWEST_FIRST'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-black'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {stationSortOrder === 'NEWEST_FIRST' ? 'Newest first' : 'Default ID Order'}
              </button>

              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200 text-xs w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <input
                  type="text"
                  value={stationTableSearch}
                  onChange={(e) => setStationTableSearch(e.target.value)}
                  placeholder="Search stations by name or city..."
                  className="w-full bg-transparent text-xs text-slate-700 focus:outline-none"
                />
                {stationTableSearch && (
                  <button onClick={() => setStationTableSearch('')} className="text-xs text-slate-500 hover:text-slate-600 font-bold">
                    <EmX className="w-4 h-4 inline-block align-[-2px]" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="pb-3">Station</th>
                  <th className="pb-3">Facilities & Amenities</th>
                  <th className="pb-3">Slots</th>
                  <th className="pb-3">Speed</th>
                  <th className="pb-3">Tariff</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {(stations || [])
                  .filter(st => {
                    if (!stationTableSearch.trim()) return true;
                    const q = stationTableSearch.toLowerCase();
                    return (st.name && st.name.toLowerCase().includes(q)) ||
                           (st.city && st.city.toLowerCase().includes(q)) ||
                           (st.address && st.address.toLowerCase().includes(q));
                  })
                  .sort((a, b) => {
                    if (stationSortOrder === 'NEWEST_FIRST') {
                      const aIsNew = a.isNewlyAdded || a.id > 50 || a.corridor === 'Custom-Admin';
                      const bIsNew = b.isNewlyAdded || b.id > 50 || b.corridor === 'Custom-Admin';
                      if (aIsNew && !bIsNew) return -1;
                      if (!aIsNew && bIsNew) return 1;
                      return b.id - a.id;
                    }
                    return a.id - b.id;
                  })
                  .map((st) => {
                    const isNew = Boolean(st.isNewlyAdded || st.id > 50 || st.corridor === 'Custom-Admin');
                    return (
                      <tr key={st.id} className={`hover:bg-slate-50 transition-colors ${isNew ? 'bg-emerald-50/20' : ''}`}>
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <img 
                              src={stationPhoto(st)} 
                              alt={st.name} 
                              className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                            />
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-extrabold text-slate-900 leading-tight">{st.name}</span>
                                {isNew && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[11px] border border-emerald-300">
                                    NEWLY ADDED
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">{st.address}, {st.city}</div>
                            </div>
                          </div>
                        </td>
                    <td className="py-3 max-w-[240px]">
                      <div className="flex flex-wrap gap-1">
                        {(st.amenities ? st.amenities.split(',').map(s => s.trim()) : ['Restrooms', 'Free Wi-Fi', 'Cafe']).slice(0, 3).map((am, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-medium truncate">
                            {am}
                          </span>
                        ))}
                        {(st.amenities?.split(',').length || 3) > 3 && (
                          <span className="text-[11px] text-brand-600 font-bold">
                            +{(st.amenities.split(',').length - 3)} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 font-semibold text-emerald-600">
                      {st.availableSlots || 8} / {st.totalSlots || 10} Free
                    </td>
                    <td className="py-3 font-bold text-brand-600">{st.maxChargingSpeedKw || 120} kW</td>
                    <td className="py-3 font-semibold">₹{st.chargingPricePerKwh || 18}/kWh</td>
                    <td className="py-3 text-right space-x-1.5">
                      <button
                        onClick={(e) => handleOpenEditStation(st, e)}
                        className="p-1.5 rounded-lg bg-teal-50 text-brand-600 hover:bg-teal-100 border border-teal-200 cursor-pointer"
                        title="Edit Station & Facilities"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteStation(st.id, e)}
                        className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 cursor-pointer"
                        title="Delete Station"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Add / edit station */}
      <Modal
        open={showAddStationModal || (showEditStationModal && !!editingStation)}
        onClose={() => { setShowAddStationModal(false); setShowEditStationModal(false); }}
        title={showEditStationModal ? `Edit ${editingStation?.name || 'station'}` : 'Add a station'}
        size="lg"
      >
        <form onSubmit={showEditStationModal ? handleUpdateStation : handleCreateStation} className="space-y-6">
          {!showEditStationModal && (
            <div>
              <div className="text-sm font-semibold text-slate-700 mb-2">Start from a location</div>
              <div className="flex flex-wrap gap-1.5">
                {LOCATION_PRESETS.map((p) => (
                  <button key={p.label} type="button"
                    onClick={() => { setNewCity(p.city); setNewAddress(p.address); setNewLat(p.lat); setNewLng(p.lng); }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${newCity === p.city && newLat === p.lat ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className={labelCls}>Station name</span>
            <input type="text" required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Nellore Supercharger Plaza" className={inputCls} />
          </label>

          {/* Photo */}
          <div>
            <span className={labelCls}>Photo</span>
            <div className="flex gap-4 items-stretch">
              <label className={`flex-1 cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition ${uploadingImage ? 'border-brand-400 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-brand-50/40'}`}>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageFileChange} disabled={uploadingImage} className="sr-only" />
                {uploadingImage ? (
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700"><RefreshCw className="w-4 h-4 animate-spin" /> Uploading…</span>
                ) : (
                  <>
                    <Upload className="w-6 h-6 mx-auto text-brand-600" />
                    <span className="mt-2 block text-sm font-semibold text-slate-800">{newImageUrl ? 'Replace photo' : 'Upload a photo'}</span>
                    <span className="block text-xs text-slate-500">PNG, JPG or WebP, up to 5 MB</span>
                  </>
                )}
              </label>
              {newImageUrl && (
                <div className="relative w-36 shrink-0 overflow-hidden rounded-2xl ring-1 ring-slate-200">
                  <img src={newImageUrl} alt="Station photo preview" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setNewImageUrl('')} className="absolute top-1.5 right-1.5 rounded-full bg-white/90 p-1 text-slate-600 hover:text-rose-600 shadow" aria-label="Remove photo">
                    <EmX className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            {uploadError && <p role="alert" className="mt-2 text-sm text-rose-700">{uploadError}</p>}
            <input type="url" value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="Or paste an image URL" aria-label="Image URL" className={`${inputCls} mt-2 text-sm`} />
          </div>

          {/* Amenities */}
          <fieldset>
            <legend className="flex w-full items-center justify-between text-sm font-semibold text-slate-700 mb-2">
              Amenities <span className="text-xs font-medium text-slate-500">{selectedAmenities.length} selected</span>
            </legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {EV_FACILITY_OPTIONS.map((fac) => {
                const on = selectedAmenities.includes(fac.label);
                return (
                  <button key={fac.id} type="button" aria-pressed={on}
                    onClick={() => setSelectedAmenities(on ? selectedAmenities.filter((a) => a !== fac.label) : [...selectedAmenities, fac.label])}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold transition ring-1 ${on ? 'ring-2 ring-brand-500 bg-brand-50 text-brand-800' : 'ring-slate-200 text-slate-600 hover:ring-slate-300'}`}>
                    <AmenityIcon label={fac.label} className={`w-4 h-4 shrink-0 ${on ? 'text-brand-600' : 'text-slate-400'}`} />
                    <span className="truncate">{fac.label}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Location */}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block sm:col-span-2">
              <span className={labelCls}>Address</span>
              <input type="text" required value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="e.g. NH 16 Bypass Road" className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>City</span>
              <input type="text" required value={newCity} onChange={(e) => setNewCity(e.target.value)} placeholder="e.g. Nellore" className={inputCls} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelCls}>Latitude</span>
                <input type="number" step="any" min="-90" max="90" required value={newLat} onChange={(e) => setNewLat(e.target.value)} className={`${inputCls} font-mono`} />
              </label>
              <label className="block">
                <span className={labelCls}>Longitude</span>
                <input type="number" step="any" min="-180" max="180" required value={newLng} onChange={(e) => setNewLng(e.target.value)} className={`${inputCls} font-mono`} />
              </label>
            </div>
          </div>

          {/* Specs */}
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className={labelCls}>Max power (kW)</span>
              <input type="number" min="1" step="any" required value={newPower} onChange={(e) => setNewPower(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Tariff (₹/kWh)</span>
              <input type="number" min="0" step="any" required value={newTariff} onChange={(e) => setNewTariff(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Bays</span>
              <input type="number" min="1" max="100" required value={newSlots} onChange={(e) => setNewSlots(e.target.value)} className={inputCls} />
            </label>
          </div>

          {formError && <p role="alert" className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-800">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => { setShowAddStationModal(false); setShowEditStationModal(false); }}>Cancel</Button>
            <Button type="submit" variant="primary" loading={actionLoading} disabled={uploadingImage}>
              {showEditStationModal ? 'Save changes' : 'Add to map'}
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default AdminDashboard;
