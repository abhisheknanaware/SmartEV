import { stationPhoto } from '../utils/stationPhoto';
import { Lightbulb as EmLightbulb, MapPin as EmMapPin, X as EmX } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Navigation, Zap, Battery, Car, Star, ShieldCheck, ArrowRight, Sparkles, Filter, Clock, MapPin, AlertTriangle, CheckCircle2, Compass, Layers, Search, RefreshCw } from 'lucide-react';
import { navigationApi, stationApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

// Custom Leaflet Icons for EV charging hubs
const createCustomIcon = (isRecommended, isSelected, isNew = false) => {
  let bg = '#0d9488';
  if (isNew) bg = '#059669'; // Vibrant emerald for newly deployed stations
  if (isRecommended) bg = '#06bfab';
  if (isSelected) bg = '#0284c7';

  const border = isNew ? '3px solid #fde047' : '3px solid #ffffff';
  const badgeHtml = isNew ? `<div style="position:absolute; top:-24px; left:50%; transform:translateX(-50%); background:#059669; color:#fef08a; font-size:9px; font-weight:900; border-radius:6px; padding:1px 5px; border:1px solid #fde047; white-space:nowrap; box-shadow:0 2px 6px rgba(0,0,0,0.3);">NEW</div>` : '';

  return L.divIcon({
    className: 'custom-ev-marker',
    html: `
      <div style="position:relative; width:36px; height:36px;">
        ${badgeHtml}
        <div style="
          background: ${bg};
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: ${border};
          box-shadow: 0 4px 14px ${isNew ? 'rgba(5, 150, 105, 0.6)' : 'rgba(0, 168, 150, 0.4)'};
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-weight: bold;
          font-size: 16px;
          transform: translate(-18px, -18px);
          cursor: pointer;
        ">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M13.5 2 5 13.2h5.6L9.8 22l8.7-11.6h-5.7L13.5 2Z" fill="#ffffff"/></svg>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
};

const createUserLocationIcon = () => {
  return L.divIcon({
    className: 'user-gps-marker',
    html: `
      <div style="position:relative; width:34px; height:34px;">
        <div style="position:absolute; width:100%; height:100%; border-radius:50%; background:rgba(2,132,199,0.35); animation:ping 1.8s cubic-bezier(0,0,0.2,1) infinite;"></div>
        <div style="position:relative; width:22px; height:22px; top:6px; left:6px; border-radius:50%; background:#0284c7; border:3px solid #ffffff; box-shadow:0 3px 12px rgba(2,132,199,0.6); display:flex; align-items:center; justify-content:center; color:white; font-size:11px;">
          <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="#ffffff"/></svg>
        </div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
};

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c * 10) / 10;
}

// Component to dynamically fit map bounds to route or coordinates
function MapAutoBounds({ polyline, stations, userLocation }) {
  const map = useMap();
  useEffect(() => {
    if (userLocation) {
      map.flyTo([userLocation.lat, userLocation.lng], 13, { duration: 1.5 });
    } else if (polyline && polyline.length > 0) {
      const bounds = L.latLngBounds(polyline);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    } else if (stations && stations.length > 0) {
      const bounds = L.latLngBounds(stations.map(s => [s.latitude, s.longitude]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [polyline, stations, userLocation, map]);
  return null;
}

// Pre-defined Pan-India High-Traffic Corridors
const PAN_INDIA_CORRIDORS = [
  { label: 'Delhi ⇄ Agra', from: 'Delhi', to: 'Agra', badge: 'Yamuna Exp.' },
  { label: 'Delhi ⇄ Jaipur', from: 'Delhi', to: 'Jaipur', badge: 'NH 48' },
  { label: 'Bengaluru ⇄ Chennai', from: 'Bengaluru', to: 'Chennai', badge: 'NH 48' },
  { label: 'Bengaluru ⇄ Mysuru', from: 'Bengaluru', to: 'Mysuru', badge: 'Exp.' },
  { label: 'Pune ⇄ Mumbai', from: 'Pune', to: 'Mumbai', badge: 'NH 48' },
  { label: 'Mumbai ⇄ Goa', from: 'Mumbai', to: 'Goa', badge: 'NH 66' },
  { label: 'Hyderabad ⇄ Bengaluru', from: 'Hyderabad', to: 'Bengaluru', badge: 'NH 44' },
  { label: 'Ahmedabad ⇄ Vadodara', from: 'Ahmedabad', to: 'Vadodara', badge: 'NE 1' },
];

const Dashboard = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [origin, setOrigin] = useState(searchParams.get('from') || 'Delhi');
  const [destination, setDestination] = useState(searchParams.get('to') || 'Agra');
  const [batteryPct, setBatteryPct] = useState(38);
  const [vehicleModel, setVehicleModel] = useState('Tata Nexon EV Max');

  const [loading, setLoading] = useState(false);
  const [routePlan, setRoutePlan] = useState(null);
  const [allStations, setAllStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [viewScope, setViewScope] = useState('CORRIDOR'); // 'CORRIDOR', 'ALL', 'NEW'
  const [refreshing, setRefreshing] = useState(false);

  // Live GPS Location State
  const [userLocation, setUserLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');
  const [isNearbyMode, setIsNearbyMode] = useState(false);

  const fetchAllStations = async () => {
    try {
      setRefreshing(true);
      const res = await stationApi.getAll();
      setAllStations(res.data || []);
    } catch (err) {
      console.error('Error fetching stations:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Load initial stations & setup focus auto-sync
  useEffect(() => {
    fetchAllStations();
    triggerRoutePlanning(origin, destination);

    const onFocus = () => fetchAllStations();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const triggerRoutePlanning = async (fromCity = origin, toCity = destination) => {
    setLoading(true);
    try {
      const res = await navigationApi.planRoute({
        origin: fromCity,
        destination: toCity,
        currentBatteryPct: batteryPct,
        batteryCapacityKwh: 40.5,
        vehicleModel,
        connectorType: 'CCS2'
      });
      setRoutePlan(res.data);
      if (res.data.recommendedStationId) {
        setSelectedStation(res.data.recommendedStationId);
      }
    } catch (err) {
      console.error('Route plan error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-detect location if URL requested it
  useEffect(() => {
    if (searchParams.get('gps') === 'auto' || searchParams.get('mode') === 'nearby') {
      handleShareLiveLocation();
    }
  }, [searchParams]);

  const applyCoordinates = async (latitude, longitude, cityName = '') => {
    let resolvedCity = cityName;
    if (!resolvedCity) {
      if (latitude >= 18.4 && latitude <= 18.7 && longitude >= 73.6 && longitude <= 74.05) {
        resolvedCity = 'Pune (Wakad / Hinjewadi)';
      } else if (latitude >= 18.9 && latitude <= 19.3 && longitude >= 72.7 && longitude <= 73.15) {
        resolvedCity = 'Mumbai (ISP Gateway)';
      }
    }

    const userLoc = { lat: latitude, lng: longitude, city: resolvedCity };
    setUserLocation(userLoc);
    setIsNearbyMode(true);
    setLocating(false);

    let nearbyList = [];
    try {
      const res = await stationApi.getNearby(latitude, longitude, 100.0);
      if (res.data && res.data.length > 0) {
        nearbyList = res.data;
      }
    } catch (err) {
      console.warn('Backend nearby fallback:', err);
    }

    // Merge or fallback to all stations and sort by distance
    if (nearbyList.length === 0) {
      const stationsRes = allStations.length > 0 ? allStations : (await stationApi.getAll()).data || [];
      nearbyList = [...stationsRes];
    }

    nearbyList.sort((a, b) => {
      const distA = calculateDistanceKm(latitude, longitude, a.latitude, a.longitude) ?? 9999;
      const distB = calculateDistanceKm(latitude, longitude, b.latitude, b.longitude) ?? 9999;
      return distA - distB;
    });

    if (nearbyList.length > 0) {
      setAllStations(nearbyList);
      setSelectedStation(nearbyList[0].id);
      const closestDist = calculateDistanceKm(latitude, longitude, nearbyList[0].latitude, nearbyList[0].longitude);
      setLocationStatus(`${resolvedCity || `${latitude.toFixed(2)}°N, ${longitude.toFixed(2)}°E`} • Nearest: ${nearbyList[0].name} (${closestDist} km)`);
    } else {
      setLocationStatus(`Live: ${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E`);
    }
  };

  const handleShareLiveLocation = () => {
    setLocating(true);
    setLocationStatus('Detecting live location via Wi-Fi/GPS...');

    const onResolvedCoords = (lat, lng, cityLabel) => {
      let resolved = cityLabel;
      if (!resolved) {
        if (lat >= 18.4 && lat <= 18.7 && lng >= 73.6 && lng <= 74.05) {
          resolved = 'Pune (Wakad / Hinjewadi)';
        } else if (lat >= 18.9 && lat <= 19.3 && lng >= 72.7 && lng <= 73.15) {
          resolved = 'Mumbai (ISP Gateway)';
        }
      }
      applyCoordinates(lat, lng, resolved);
    };

    if (navigator.geolocation) {
      // Step 1: Attempt high accuracy first (uses Wi-Fi BSSID triangulation if available)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          onResolvedCoords(latitude, longitude);
        },
        (highAccErr) => {
          console.warn('High accuracy geolocation timed out/failed, trying standard accuracy:', highAccErr);
          // Step 2: Try standard accuracy
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude, longitude } = pos.coords;
              onResolvedCoords(latitude, longitude);
            },
            async (stdErr) => {
              console.warn('Browser GPS permission not granted/failed, checking IP geolocation:', stdErr);
              try {
                const ipRes = await fetch('https://ipapi.co/json/');
                const ipData = await ipRes.json();
                if (ipData && ipData.latitude && ipData.longitude) {
                  const isMumbai = (ipData.city || '').toLowerCase().includes('mumbai') || 
                                   (ipData.latitude >= 18.9 && ipData.latitude <= 19.3);
                  const displayCity = isMumbai ? 'Mumbai (ISP Gateway)' : (ipData.city || 'Detected Location');
                  onResolvedCoords(ipData.latitude, ipData.longitude, displayCity);
                  return;
                }
              } catch (ipErr) {
                console.warn('IP lookup fallback failed, defaulting to Pune EV corridor hub:', ipErr);
              }
              // Default fallback to Pune EV Hub
              onResolvedCoords(18.5987, 73.7634, 'Pune (Wakad / Hinjewadi)');
            },
            { enableHighAccuracy: false, timeout: 5000 }
          );
        },
        { enableHighAccuracy: true, timeout: 7000, maximumAge: 10000 }
      );
    } else {
      fetch('https://ipapi.co/json/')
        .then(r => r.json())
        .then(ipData => {
          if (ipData?.latitude && ipData?.longitude) {
            const isMumbai = (ipData.city || '').toLowerCase().includes('mumbai') || 
                             (ipData.latitude >= 18.9 && ipData.latitude <= 19.3);
            const displayCity = isMumbai ? 'Mumbai (ISP Gateway)' : (ipData.city || 'Detected Location');
            onResolvedCoords(ipData.latitude, ipData.longitude, displayCity);
          } else {
            onResolvedCoords(18.5987, 73.7634, 'Pune (Wakad / Hinjewadi)');
          }
        })
        .catch(() => onResolvedCoords(18.5987, 73.7634, 'Pune (Wakad / Hinjewadi)'));
    }
  };

  const handleResetLocationMode = () => {
    setUserLocation(null);
    setIsNearbyMode(false);
    setLocationStatus('');
    stationApi.getAll().then(res => setAllStations(res.data || []));
    triggerRoutePlanning(origin, destination);
  };

  const handleCorridorClick = (from, to) => {
    setOrigin(from);
    setDestination(to);
    setIsNearbyMode(false);
    triggerRoutePlanning(from, to);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setIsNearbyMode(false);
    triggerRoutePlanning(origin, destination);
  };

  // Extract display stations along route or fallback to all stations
  const routeStations = (!routePlan?.allStationsAlongRoute || routePlan.allStationsAlongRoute.length === 0)
    ? []
    : routePlan.allStationsAlongRoute.map(item => item.station || item);

  const routeStationIds = new Set(routeStations.map(s => s.id));

  // Newly added stations (created from admin side)
  const newlyAddedStations = allStations.filter(s => s.isNewlyAdded || s.id > 50 || s.corridor === 'Custom-Admin');

  // Select base stations based on viewScope, nearby mode, or search query
  let baseStations = [];
  if (isNearbyMode || viewScope === 'ALL' || searchFilter.trim() !== '') {
    baseStations = allStations;
  } else if (viewScope === 'NEW') {
    baseStations = newlyAddedStations.length > 0 ? newlyAddedStations : allStations;
  } else {
    // CORRIDOR Mode: Show corridor stations + automatically include any newly deployed admin stations!
    const nonRouteNewStations = newlyAddedStations.filter(s => !routeStationIds.has(s.id));
    baseStations = [...routeStations, ...nonRouteNewStations];
    if (baseStations.length === 0) baseStations = allStations;
  }

  // If user location is active, sort stations by proximity to the user!
  let rawStations = baseStations;
  if (userLocation) {
    rawStations = [...baseStations].sort((a, b) => {
      const distA = calculateDistanceKm(userLocation.lat, userLocation.lng, a.latitude, a.longitude) ?? 9999;
      const distB = calculateDistanceKm(userLocation.lat, userLocation.lng, b.latitude, b.longitude) ?? 9999;
      return distA - distB;
    });
  }

  const displayStations = rawStations.filter(st => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (st.name && st.name.toLowerCase().includes(q)) || 
           (st.city && st.city.toLowerCase().includes(q)) ||
           (st.address && st.address.toLowerCase().includes(q));
  });

  const polylineCoords = routePlan?.routeCoordinates || [
    [28.6139, 77.2090],
    [28.1750, 77.5850],
    [27.4924, 77.6737],
    [27.1767, 78.0081]
  ];

  const topRec = routePlan?.topRecommendation;

  const slotsOf = (st) => ({
    free: st.available_slots ?? st.availableSlots ?? null,
    total: st.total_slots ?? st.totalSlots ?? null,
  });
  const CITY_HUBS = [
    { label: 'Pune', lat: 18.5987, lng: 73.7634, name: 'Pune (Wakad / Hinjewadi)', match: 'pune' },
    { label: 'Mumbai', lat: 19.06, lng: 72.8656, name: 'Mumbai (BKC)', match: 'mumbai' },
    { label: 'Delhi NCR', lat: 28.6139, lng: 77.209, name: 'Delhi NCR', match: 'delhi' },
    { label: 'Bengaluru', lat: 12.9716, lng: 77.5946, name: 'Bengaluru', match: 'bengaluru' },
  ];
  const listTitle = isNearbyMode
    ? 'Nearest to you'
    : viewScope === 'ALL' || searchFilter.trim() ? 'All stations' : viewScope === 'NEW' ? 'Newly added' : 'Along your route';

  return (
    <div className="relative lg:h-[calc(100svh-4rem)] w-full lg:overflow-hidden flex flex-col lg:flex-row">

      {/* Sidebar */}
      <div className="order-2 lg:order-1 w-full lg:w-[460px] xl:w-[500px] lg:h-full lg:overflow-y-auto bg-slate-50/80 backdrop-blur border-r border-slate-200/80 p-4 sm:p-6 z-20 flex flex-col gap-5 [&>*]:shrink-0">

        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Stations</div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">Find a charger</h1>
            <p className="text-sm text-slate-600 mt-0.5">Bay availability, tariffs and stops along your route.</p>
          </div>
          <button
            onClick={() => { fetchAllStations(); triggerRoutePlanning(origin, destination); }}
            disabled={refreshing}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:ring-brand-300 hover:text-brand-700"
            aria-label="Refresh stations"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-brand-600' : ''}`} />
            <span className="hidden sm:inline">{refreshing ? 'Refreshing' : 'Refresh'}</span>
          </button>
        </div>

        {/* Route planner */}
        <section className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 p-4 sm:p-5 shadow-card">
          <div className="absolute -right-16 -top-20 w-56 h-56 rounded-full bg-brand-200/40 blur-3xl" aria-hidden="true" />
          <form onSubmit={handleSearchSubmit} className="relative space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Navigation className="w-4 h-4 text-brand-600" /> Plan a trip</h2>
            </div>
            <div className="relative rounded-2xl bg-slate-50 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-500">
              <span className="absolute left-[19px] top-7 bottom-7 w-px bg-slate-300" aria-hidden="true" />
              <label className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-500 ring-4 ring-brand-500/15 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-500">From</span>
                  <input type="text" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. Delhi, Pune" className="w-full bg-transparent text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none" />
                </span>
              </label>
              <div className="mx-3.5 border-t border-slate-200" />
              <label className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 ring-4 ring-amber-400/20 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-500">To</span>
                  <input type="text" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Agra, Mumbai" className="w-full bg-transparent text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none" />
                </span>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-brand-500">
                <Battery className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="sr-only">Battery charge</span>
                <input type="number" value={batteryPct} min="5" max="100" onChange={(e) => setBatteryPct(Number(e.target.value))} className="w-full bg-transparent text-sm font-semibold text-slate-900 focus:outline-none tabular-nums" />
                <span className="text-xs text-slate-500">%</span>
              </label>
              <label className="flex items-center gap-2 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-brand-500">
                <Car className="w-4 h-4 text-sky-600 shrink-0" />
                <span className="sr-only">EV model</span>
                <select value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-900 focus:outline-none">
                  <option value="Tata Nexon EV Max">Tata Nexon EV</option>
                  <option value="MG ZS EV">MG ZS EV</option>
                  <option value="Hyundai Ioniq 5">Hyundai Ioniq 5</option>
                  <option value="Mahindra XUV400">Mahindra XUV400</option>
                  <option value="BYD Atto 3">BYD Atto 3</option>
                </select>
              </label>
            </div>
            <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-300 to-sky-400 text-ink-950 font-bold text-sm flex items-center justify-center gap-2 shadow-glow hover:brightness-105 disabled:opacity-70">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? 'Planning route…' : 'Find stops on this route'}
            </button>
          </form>
          <div className="relative mt-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-2">Popular routes</div>
            <div className="flex flex-wrap gap-1.5">
              {PAN_INDIA_CORRIDORS.map((c, idx) => {
                const isActive = origin.toLowerCase().includes(c.from.toLowerCase()) && destination.toLowerCase().includes(c.to.toLowerCase());
                return (
                  <button key={idx} type="button" onClick={() => handleCorridorClick(c.from, c.to)} aria-pressed={isActive}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${isActive ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Near me */}
        <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-3.5 space-y-3">
          {!userLocation ? (
            <button type="button" onClick={handleShareLiveLocation} disabled={locating}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-sm font-semibold text-sky-800 ring-1 ring-sky-200 hover:bg-sky-100">
              {locating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Compass className="w-4 h-4" />}
              {locating ? 'Finding your location…' : 'Stations near me'}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 inline-flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 ring-1 ring-sky-200">
                <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                <span className="truncate">{locationStatus}</span>
              </span>
              <button type="button" onClick={handleResetLocationMode} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Clear</button>
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-500 mr-0.5">Or a city:</span>
            {CITY_HUBS.map((h) => {
              const on = userLocation?.city?.toLowerCase().includes(h.match);
              return (
                <button key={h.label} type="button" onClick={() => applyCoordinates(h.lat, h.lng, h.name)} aria-pressed={!!on}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  {h.label}
                </button>
              );
            })}
          </div>
          {userLocation && (userLocation.city?.toLowerCase().includes('mumbai') || locationStatus.toLowerCase().includes('mumbai')) && (
            <p className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
              <span>Desktop locations often resolve to Mumbai. Actually in Pune?</span>
              <button type="button" onClick={() => applyCoordinates(18.5987, 73.7634, 'Pune (Wakad / Hinjewadi)')} className="shrink-0 font-semibold text-amber-800 underline underline-offset-2">Use Pune</button>
            </p>
          )}
        </section>

        {/* Suggested stop */}
        {topRec && topRec.station && (
          <section className="rounded-2xl bg-gradient-to-br from-brand-50 to-sky-50 ring-1 ring-brand-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-brand-800"><Sparkles className="w-3.5 h-3.5" /> Suggested stop</span>
              {topRec.aiRecommendationScore != null && <span className="text-xs font-semibold text-slate-600">Match {topRec.aiRecommendationScore.toFixed(0)}%</span>}
            </div>
            <h3 className="mt-1.5 font-bold text-slate-900">{topRec.station.name}</h3>
            <p className="text-xs text-slate-600 truncate">{[topRec.station.address, topRec.station.city].filter(Boolean).join(', ')}</p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {topRec.station.maxChargingSpeedKw && <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 ring-1 ring-slate-200"><Zap className="inline w-3 h-3 mr-0.5 text-amber-500" />{topRec.station.maxChargingSpeedKw} kW</span>}
              {topRec.station.chargingPricePerKwh && <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 ring-1 ring-slate-200">₹{topRec.station.chargingPricePerKwh}/kWh</span>}
              {slotsOf(topRec.station).free != null && <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-emerald-700 ring-1 ring-slate-200">{slotsOf(topRec.station).free} free</span>}
            </div>
            <Link to={user ? `/stations/${topRec.station.id}` : '/login'} className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
              {user ? 'View and book' : 'Log in to book'} <ArrowRight className="w-4 h-4" />
            </Link>
          </section>
        )}

        {/* Search and scope */}
        <div className="space-y-2.5">
          <label className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-500">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="sr-only">Search stations</span>
            <input type="text" value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} placeholder="Search by name, area or city" className="w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none" />
            {searchFilter && <button type="button" onClick={() => setSearchFilter('')} className="text-slate-400 hover:text-slate-600" aria-label="Clear search"><EmX className="w-4 h-4" /></button>}
          </label>
          <div className="flex gap-1 p-1 bg-slate-200/60 rounded-xl text-sm font-semibold" role="tablist">
            {[
              ['CORRIDOR', `Route · ${routeStations.length}`],
              ['ALL', `All · ${allStations.length}`],
              ...(newlyAddedStations.length ? [['NEW', `New · ${newlyAddedStations.length}`]] : []),
            ].map(([key, label]) => {
              const on = searchFilter.trim() ? key === 'ALL' : viewScope === key;
              return (
                <button key={key} type="button" role="tab" aria-selected={on} onClick={() => setViewScope(key)}
                  className={`flex-1 rounded-lg py-1.5 transition ${on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Station list */}
        <div className="flex-1">
          <div className="flex items-baseline justify-between mb-2.5">
            <h2 className="text-sm font-bold text-slate-900">{listTitle} <span className="font-normal text-slate-500">({displayStations.length})</span></h2>
            {isNearbyMode && <span className="text-xs text-slate-500">Sorted by distance</span>}
          </div>

          {displayStations.length === 0 && (
            <p className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 text-center text-sm text-slate-500">No stations match. Try another route or clear the search.</p>
          )}

          <ul className="space-y-2.5">
            {displayStations.map((st, idx) => {
              const { free, total } = slotsOf(st);
              const isSelected = selectedStation === st.id;
              const isNewlyAdded = Boolean(st.isNewlyAdded || st.id > 50 || st.corridor === 'Custom-Admin');
              const distanceKm = userLocation ? calculateDistanceKm(userLocation.lat, userLocation.lng, st.latitude, st.longitude) : (st.distanceFromRouteKm ?? null);
              const share = free != null && total ? free / total : null;
              return (
                <li key={st.id}>
                  <div onClick={() => setSelectedStation(st.id)}
                    className={`group rounded-2xl bg-white p-3 transition cursor-pointer ring-1 ${isSelected ? 'ring-2 ring-brand-500 shadow-card' : 'ring-slate-200 hover:ring-slate-300 hover:shadow-card'}`}>
                    <div className="flex gap-3">
                      <img src={stationPhoto(st)} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-bold text-slate-900 truncate">{st.name}</h3>
                          {st.rating > 0 && (
                            <span className="shrink-0 inline-flex items-center gap-0.5 text-xs font-semibold text-slate-700"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{st.rating.toFixed(1)}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{[st.address, st.city].filter(Boolean).join(', ')}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                          {isNearbyMode && idx === 0 && <span className="rounded-full bg-sky-600 px-2 py-0.5 text-white">Closest</span>}
                          {isNewlyAdded && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700 ring-1 ring-violet-200">New</span>}
                          {distanceKm != null && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">{distanceKm} km</span>}
                          {st.maxChargingSpeedKw && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800"><Zap className="inline w-3 h-3 -mt-0.5" /> {st.maxChargingSpeedKw} kW</span>}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      {share != null ? (
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-[11px] font-medium text-slate-500 mb-1">
                            <span className={free > 0 ? 'text-emerald-700' : 'text-rose-600'}>{free > 0 ? `${free} of ${total} bays free` : 'All bays busy'}</span>
                            {st.chargingPricePerKwh && <span className="text-slate-700 font-semibold">₹{st.chargingPricePerKwh}/kWh</span>}
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full rounded-full ${share > 0.3 ? 'bg-emerald-500' : share > 0 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${Math.max(4, share * 100)}%` }} />
                          </div>
                        </div>
                      ) : (
                        <span className="flex-1 text-xs font-semibold text-slate-700">{st.chargingPricePerKwh ? `₹${st.chargingPricePerKwh}/kWh` : ''}</span>
                      )}
                      <Link to={user ? `/stations/${st.id}` : '/login'} onClick={(e) => e.stopPropagation()}
                        className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition ${user ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                        {user ? 'Book' : 'Log in'}
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* RIGHT LEAFLET MAP VIEWPORT - CLEAN & CRISP */}
      <div className="order-1 lg:order-2 shrink-0 lg:shrink lg:flex-1 h-[52svh] lg:h-full w-full relative">
        <MapContainer
          center={polylineCoords[0] || [28.6139, 77.2090]}
          zoom={8}
          className="h-full w-full"
          scrollWheelZoom={true}
        >
          {/* Standard OpenStreetMap tiles matching user request */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />

          <MapAutoBounds polyline={polylineCoords} stations={displayStations} userLocation={userLocation} />

          {/* User Live GPS Marker */}
          {userLocation && (
            <Marker
              position={[userLocation.lat, userLocation.lng]}
              icon={createUserLocationIcon()}
            >
              <Popup>
                <div className="p-1.5 text-center font-sans">
                  <div className="text-xs font-black text-sky-800">You Are Here</div>
                  <div className="text-[11px] text-slate-500 font-medium">Live GPS Location Active</div>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Expressway Highway Polyline */}
          <Polyline
            positions={polylineCoords}
            pathOptions={{
              color: '#009a8c',
              weight: 5,
              opacity: 0.85
            }}
          />

          {/* Markers for all corridor stations */}
          {displayStations.map((st) => {
            const isRec = topRec?.station?.id === st.id;
            const isSel = selectedStation === st.id;
            const { free: freeSlots, total: totalSlots } = slotsOf(st);

            const isNew = Boolean(st.isNewlyAdded || st.id > 50 || st.corridor === 'Custom-Admin');

            return (
              <Marker
                key={st.id}
                position={[st.latitude, st.longitude]}
                icon={createCustomIcon(isRec, isSel, isNew)}
                eventHandlers={{
                  click: () => setSelectedStation(st.id)
                }}
              >
                <Popup className="custom-popup">
                  <div className="p-2 text-slate-800 max-w-[240px]">
                    <div className="flex items-center gap-1.5 mb-1 justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <h4 className="font-bold text-sm text-slate-900 leading-tight truncate">{st.name}</h4>
                      </div>
                      {isNew && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-black border border-emerald-300 shrink-0">
                          NEW
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mb-2">{st.address}, {st.city}</p>
                    <div className="flex items-center justify-between text-xs mb-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <span className="font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded text-[11px]">
                        {freeSlots != null ? `${freeSlots} / ${totalSlots} free` : 'Availability unknown'}
                      </span>
                      <span className="text-slate-700 font-bold">
                        {st.maxChargingSpeedKw ? `${st.maxChargingSpeedKw} kW` : ''}
                      </span>
                      <span className="text-brand-600 font-bold">
                        {st.chargingPricePerKwh ? `₹${st.chargingPricePerKwh}/kWh` : ''}
                      </span>
                    </div>
                    <button
                      onClick={() => navigate(user ? `/stations/${st.id}` : '/login')}
                      className="w-full py-1.5 px-3 bg-brand-600 text-white rounded-lg text-xs font-bold hover:bg-brand-700 transition-colors shadow-sm"
                    >
                      {user ? 'View and book' : 'Log in to book'}
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Route summary over the map */}
        <div className="absolute top-4 right-4 z-[400] max-w-[calc(100%-5rem)] inline-flex items-center gap-2.5 rounded-full bg-white/95 backdrop-blur-md px-4 py-2 text-xs text-slate-900 shadow-lg ring-1 ring-slate-200">
          <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0" />
          <span className="font-semibold truncate">{origin} to {destination}</span>
          <span className="text-slate-500 shrink-0">{displayStations.length} stations</span>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
