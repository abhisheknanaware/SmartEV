import { PlugZap as EmPlug, Sun as EmSun, TrendingUp as EmTrending } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { 
  BatteryCharging, Zap, Thermometer, Activity, Gauge, TrendingDown, 
  CheckCircle2, AlertTriangle, Info, ChevronDown, ChevronUp, Layers, 
  HelpCircle, Sparkles, ShieldCheck, Clock, RefreshCw, Sliders,
  BarChart3, Cpu, ArrowUpRight, Flame, RotateCcw
} from 'lucide-react';
import { 
  ResponsiveContainer, XAxis, YAxis, Tooltip, 
  CartesianGrid, AreaChart, Area, BarChart, Bar, Cell 
} from 'recharts';
import { batteryApi } from '../services/api';
import batteryDatasets from '../data/batteryDatasets.json';

const BatteryDashboard = () => {
  // Navigation Tabs: 'overview' (User-friendly SOH) | 'simulator' (Interactive Showcase) | 'benchmarks' (Model Metrics)
  const [activeTab, setActiveTab] = useState('overview');

  // Pre-loaded verified research records from CALCE and Kaggle datasets
  const calceRecords = batteryDatasets.calceRecords || [];
  const evFleetRecords = batteryDatasets.evFleetRecords || [];

  // Options list for dropdown in Overview tab
  const allRecordOptions = [
    {
      id: 'batt_00491',
      label: 'EV Pack BATT_00491 — 61.5 kWh LFP (VoltaCore Sedan-E1, 1,535 Cycles)',
      category: 'Kaggle EV Battery Health Fleet Dataset',
      data: evFleetRecords.find(r => r.id === 'BATT_00491') || evFleetRecords[0]
    },
    {
      id: 'calce_cs2_33',
      label: 'CALCE Laboratory Cell CS2_33 (University of Maryland, LCO 1.1 Ah - 660 Cycles)',
      category: 'CALCE Laboratory Research Datasets',
      data: calceRecords.find(r => r.id === 'CALCE_CS2_33') || calceRecords[0]
    },
    {
      id: 'calce_cs2_34',
      label: 'CALCE Laboratory Cell CS2_34 (University of Maryland, LCO 1.1 Ah - 632 Cycles)',
      category: 'CALCE Laboratory Research Datasets',
      data: calceRecords.find(r => r.id === 'CALCE_CS2_34') || calceRecords[1]
    },
    {
      id: 'batt_00011',
      label: 'EV Pack BATT_00011 — 73.1 kWh LFP (IonFlux Van-E4, 407 Cycles)',
      category: 'Kaggle EV Battery Health Fleet Dataset',
      data: evFleetRecords.find(r => r.id === 'BATT_00011') || evFleetRecords[1]
    },
    {
      id: 'batt_02054',
      label: 'EV Pack BATT_02054 — 92.7 kWh NCA (VoltaCore Hatch-E3, 324 Cycles)',
      category: 'Kaggle EV Battery Health Fleet Dataset',
      data: evFleetRecords.find(r => r.id === 'BATT_02054') || evFleetRecords[2]
    },
    {
      id: 'batt_01748',
      label: 'EV Pack BATT_01748 — 48.5 kWh LMO (High Aging Pack, 991 Cycles)',
      category: 'Kaggle EV Battery Health Fleet Dataset',
      data: evFleetRecords.find(r => r.id === 'BATT_01748') || evFleetRecords[3]
    },
    {
      id: 'live_model_prediction',
      label: 'SmartEV LightGBM Production ML Model (Integrated Backend Prediction)',
      category: 'Integrated Machine Learning Models',
      isModel: true
    }
  ];

  const [selectedRecordId, setSelectedRecordId] = useState('batt_00491');
  const [liveModelData, setLiveModelData] = useState(null);
  const [loadingModel, setLoadingModel] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [modelEval, setModelEval] = useState(null);

  // ==================== SIMULATOR STATE ====================
  // What-if inputs: only conditions the real training data varies.
  const [simChemistry, setSimChemistry] = useState('LFP');
  const [simCycles, setSimCycles] = useState(500);
  const [simTemp, setSimTemp] = useState(25);
  const [simChargeC, setSimChargeC] = useState(1);
  const [simDischargeC, setSimDischargeC] = useState(1);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [simInfo, setSimInfo] = useState(null); // real evaluation of the simulator model
  useEffect(() => {
    if (activeTab !== 'benchmarks' || simInfo) return;
    batteryApi.getSimulatorInfo()
      .then((r) => setSimInfo(r.data))
      .catch((e) => setSimInfo({ error: e.response?.data?.message || 'Model details are unavailable right now.' }));
  }, [activeTab, simInfo]);

  useEffect(() => {
    fetchLiveModelTelemetry();
    batteryApi.getModelEvaluation()
      .then(res => setModelEval(res.data))
      .catch(() => console.warn('Model evaluation endpoint fallback'));
  }, []);

  // The model option runs the trained model on a stated reference pack (inputs shown on the page).
  // If the model is unreachable we show "unavailable" rather than placeholder numbers.
  const MODEL_REFERENCE = { chemistry: 'NMC', capacity: 75.0, charge_cycles: 450, voltage: 395.4, current: 45.2, temperature: 31.5, internal_resistance: 18.2 };
  const fetchLiveModelTelemetry = async () => {
    const base = {
      id: 'LIVE_MODEL_PREDICTION',
      name: 'SmartEV LightGBM SOH regressor',
      sourceName: 'SmartEV LightGBM model (reference NMC pack, 450 cycles)',
      sourceType: 'Machine-learning model prediction',
      sourceDescription: 'Gradient-boosted model run on a reference 75 kWh NMC pack at 450 cycles, 31.5 °C, 18.2 mΩ.',
      chemistry: 'NMC (Nickel Manganese Cobalt)',
      nominalCapacity: '75.0 kWh',
      cycleCount: MODEL_REFERENCE.charge_cycles,
      voltageV: MODEL_REFERENCE.voltage,
      currentA: MODEL_REFERENCE.current,
      resistanceMohm: MODEL_REFERENCE.internal_resistance,
      temperatureC: MODEL_REFERENCE.temperature,
      hasHistoricalGraph: false,
    };
    setLoadingModel(true);
    try {
      const res = await batteryApi.runDiagnostics(MODEL_REFERENCE);
      const d = res.data || {};
      setLiveModelData({ ...base, soh: typeof d.soh === 'number' ? d.soh : null, rulCycles: typeof d.rul_cycles === 'number' ? d.rul_cycles : null, modelName: d.model_name });
    } catch (e) {
      setLiveModelData({ ...base, soh: null, rulCycles: null, unavailable: true });
    } finally {
      setLoadingModel(false);
    }
  };

  // Determine active record for Overview
  const currentOption = allRecordOptions.find(o => o.id === selectedRecordId) || allRecordOptions[0];
  const activeRecord = currentOption.isModel ? liveModelData : currentOption.data;

  // Derive Health Status & Theme
  const getHealthStatus = (soh) => {
    if (soh === undefined || soh === null || isNaN(soh)) {
      return {
        label: 'Unknown',
        badgeBg: 'bg-slate-800 text-slate-300 ring-slate-600',
        progressBarBg: 'bg-slate-500',
        summary: 'Battery health estimate unavailable from currently loaded data.'
      };
    }
    if (soh >= 90) {
      return {
        label: 'Excellent',
        badgeBg: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
        progressBarBg: 'bg-gradient-to-r from-emerald-500 to-teal-400',
        summary: 'Excellent battery condition. The battery retains over 90% of its original factory capacity, delivering near-original driving range.'
      };
    }
    if (soh >= 80) {
      return {
        label: 'Good',
        badgeBg: 'bg-teal-500/15 text-teal-200 ring-teal-500/30',
        progressBarBg: 'bg-gradient-to-r from-teal-500 to-cyan-400',
        summary: 'Good normal condition. Expected gradual capacity loss due to routine driving cycles. Full daily vehicle usability is maintained.'
      };
    }
    return {
      label: 'Needs Attention',
      badgeBg: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
      progressBarBg: 'bg-gradient-to-r from-amber-500 to-orange-400',
      summary: 'Notable capacity reduction below 80%. Driving range may be noticeably lower. Review charging habits or schedule an authorized battery inspection.'
    };
  };

  const currentSoh = activeRecord?.soh;
  const statusInfo = getHealthStatus(currentSoh);

  // ==================== SIMULATOR HANDLER ====================
  const handleRunSimulation = async (e, override = {}) => {
    if (e) e.preventDefault();
    setSimulating(true);
    try {
      const res = await batteryApi.simulate({
        chemistry: override.chemistry ?? simChemistry,
        cycles: Math.round(override.cycles ?? simCycles),
        ambient_temp_c: override.temp ?? simTemp,
        charge_c_rate: override.chargeC ?? simChargeC,
        discharge_c_rate: override.dischargeC ?? simDischargeC,
      });
      setSimResult(res.data);
    } catch (err) {
      setSimResult({ error: err.response?.data?.message || 'The battery model is unavailable right now. Please try again shortly.' });
    } finally {
      setSimulating(false);
    }
  };

  // Presets mirror real test conditions in the training data.
  const PRESETS = {
    gentle: { label: 'Gentle commute', chemistry: 'LFP', cycles: 600, temp: 25, chargeC: 0.5, dischargeC: 1 },
    fast: { label: 'Daily fast charging', chemistry: 'LFP', cycles: 800, temp: 30, chargeC: 6, dischargeC: 4 },
    heat: { label: 'Hot climate NCA', chemistry: 'NCA', cycles: 900, temp: 35, chargeC: 0.5, dischargeC: 2 },
  };
  const applyPreset = (key) => {
    const p = PRESETS[key];
    setSimChemistry(p.chemistry); setSimCycles(p.cycles); setSimTemp(p.temp); setSimChargeC(p.chargeC); setSimDischargeC(p.dischargeC);
    handleRunSimulation(null, p);
  };

  const sohValid = typeof currentSoh === 'number' && !Number.isNaN(currentSoh);
  const sohTone = !sohValid ? '#64748b' : currentSoh >= 90 ? '#34d399' : currentSoh >= 80 ? '#2dd4bf' : currentSoh >= 70 ? '#fbbf24' : '#fb7185';
  const RING = 2 * Math.PI * 52;
  const TABS = [['overview', 'Battery health', Activity], ['simulator', 'What-if simulator', Sliders], ['benchmarks', 'Model benchmarks', BarChart3]];

  return (
    <div className="min-h-screen bg-ink-950 text-slate-100 py-8 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-5">
          <div className="flex items-start gap-4">
            <span className="hidden sm:flex shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-brand-500 text-ink-950 items-center justify-center shadow-glow">
              <BatteryCharging className="w-6 h-6" aria-hidden="true" />
            </span>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Battery AI lab</div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Battery health & diagnostics</h1>
              <p className="mt-1 text-sm sm:text-[15px] text-slate-400 max-w-2xl">
                Explore real degradation data from NASA, CALCE and fleet datasets, and test what-if scenarios on our trained model.
              </p>
            </div>
          </div>

          <div role="tablist" aria-label="Battery lab sections" className="flex gap-1 p-1 rounded-xl bg-ink-900 ring-1 ring-white/10 w-full xl:w-auto shrink-0 overflow-x-auto">
            {TABS.map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => {
                  setActiveTab(id);
                  if (id === 'simulator' && !simResult) handleRunSimulation();
                }}
                className={`flex-1 xl:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition ${
                  activeTab === id ? 'bg-white text-ink-950 shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </header>

        <p className="flex items-start gap-2.5 rounded-xl bg-sky-500/10 ring-1 ring-sky-400/20 px-4 py-3 text-sm text-sky-100">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-sky-300" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-white">Not connected to your car.</strong> Results come from public research datasets and our trained model, not live vehicle telemetry.
          </span>
        </p>

        {activeTab === 'overview' && (
          <div className="space-y-6">

            {/* Dataset picker */}
            <section className="panel p-5 sm:p-6">
              <div className="flex flex-col md:flex-row md:items-end gap-4">
                <label htmlFor="dataset-record-select" className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-white">Battery record</span>
                  <span className="block text-xs text-slate-400 mb-2">Pick a laboratory cell, a fleet pack, or the live model prediction.</span>
                  <select
                    id="dataset-record-select"
                    value={selectedRecordId}
                    onChange={(e) => setSelectedRecordId(e.target.value)}
                    className="w-full bg-ink-900 ring-1 ring-white/10 border-0 rounded-xl py-3 px-4 text-sm font-medium text-white cursor-pointer"
                  >
                    {['Kaggle EV Battery Health Fleet Dataset', 'CALCE Laboratory Research Datasets', 'Integrated Machine Learning Models'].map((cat) => (
                      <optgroup key={cat} label={cat}>
                        {allRecordOptions.filter((o) => o.category === cat).map((opt) => (
                          <option key={opt.id} value={opt.id} className="bg-ink-900 text-white">{opt.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                {currentOption.isModel && (
                  <button
                    onClick={fetchLiveModelTelemetry}
                    disabled={loadingModel}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-sm font-semibold text-slate-100 disabled:opacity-60"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingModel ? 'animate-spin' : ''}`} /> Re-run model
                  </button>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
                {['CALCE (Univ. of Maryland)', 'Kaggle EV fleet packs', 'NASA prognostics benchmark'].map((d) => (
                  <span key={d} className="px-2.5 py-1 rounded-full bg-white/5 ring-1 ring-white/10">{d}</span>
                ))}
              </div>
            </section>

            {/* SOH hero */}
            <section className="panel p-6 sm:p-8 relative overflow-hidden">
              <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-25 pointer-events-none" style={{ background: sohTone }} aria-hidden="true" />
              <div className="relative grid md:grid-cols-[auto_1fr] gap-8 items-center">
                {/* Gauge */}
                <div className="relative w-52 h-52 mx-auto">
                  <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" aria-hidden="true">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="10" />
                    <circle
                      cx="60" cy="60" r="52" fill="none" stroke={sohTone} strokeWidth="10" strokeLinecap="round"
                      strokeDasharray={RING}
                      strokeDashoffset={RING * (1 - (sohValid ? Math.min(100, currentSoh) : 0) / 100)}
                      style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    {loadingModel && currentOption.isModel ? (
                      <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
                    ) : sohValid ? (
                      <>
                        <span className="text-5xl font-extrabold font-display tabular-nums text-white">{currentSoh.toFixed(1)}<span className="text-2xl" style={{ color: sohTone }}>%</span></span>
                        <span className="text-xs text-slate-400 mt-1">state of health</span>
                      </>
                    ) : (
                      <span className="text-sm text-slate-400 px-6">Estimate unavailable</span>
                    )}
                  </div>
                </div>

                {/* Summary */}
                <div className="space-y-5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ring-1 ${statusInfo.badgeBg}`}>{statusInfo.label}</span>
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/5 ring-1 ring-white/10 text-slate-300">
                      {currentOption.isModel ? 'Model prediction' : 'From research dataset'}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-white truncate">{activeRecord?.name || currentOption.label}</h2>
                    <p className="mt-1 text-sm text-slate-300 max-w-xl">{statusInfo.summary}</p>
                  </div>

                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      ['Remaining life', activeRecord?.rulCycles > 0 ? `${activeRecord.rulCycles.toLocaleString()} cycles` : activeRecord?.rulCycles === 0 ? 'End of life' : '—'],
                      ['Cycles so far', activeRecord?.cycleCount != null ? activeRecord.cycleCount.toLocaleString() : '—'],
                      ['Chemistry', (activeRecord?.chemistry || '—').split(' (')[0]],
                      ['Capacity', activeRecord?.nominalCapacity || '—'],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-xl bg-white/[0.04] ring-1 ring-white/10 px-3.5 py-3">
                        <dt className="text-xs text-slate-400">{k}</dt>
                        <dd className="mt-0.5 font-semibold text-white truncate">{v}</dd>
                      </div>
                    ))}
                  </dl>

                  {/* Health scale with industry thresholds */}
                  <div>
                    <div className="relative h-2.5 rounded-full bg-gradient-to-r from-rose-500/70 via-amber-400/70 via-[75%] to-emerald-400/80">
                      <span className="absolute -top-1 -bottom-1 w-px bg-white/50" style={{ left: '70%' }} aria-hidden="true" />
                      <span className="absolute -top-1 -bottom-1 w-px bg-white/50" style={{ left: '80%' }} aria-hidden="true" />
                      {sohValid && (
                        <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white ring-4 ring-ink-950 shadow" style={{ left: `${Math.max(0, Math.min(100, currentSoh))}%` }} aria-hidden="true" />
                      )}
                    </div>
                    <div className="relative mt-2 h-4 text-[11px] text-slate-400">
                      <span className="absolute left-0">0%</span>
                      <span className="absolute -translate-x-full pr-1.5" style={{ left: '70%' }}>70% end of life</span>
                      <span className="absolute pl-1.5 hidden sm:inline" style={{ left: '80%' }}>80% warranty</span>
                      <span className="absolute right-0">100%</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* EXPLAIN THE DATA SOURCE SECTION */}
            <div className="panel p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold border border-emerald-500/20">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Where Does This Estimate Come From?
                  </h3>
                  <p className="text-xs text-slate-400">
                    Transparent verification of the research dataset supporting this estimate
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <p className="bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20 text-emerald-200 font-medium">
                  “We use battery test data from public research datasets, such as NASA and CALCE, to analyze battery degradation and estimate battery health.”
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 space-y-1.5">
                    <span className="text-[11px] font-medium text-slate-400 block">
                      Active Research Dataset
                    </span>
                    <span className="text-xs font-extrabold text-white block">
                      {activeRecord?.sourceName || 'CALCE Laboratory Battery Degradation Dataset'}
                    </span>
                    <p className="text-[11px] text-slate-400 leading-normal">
                      {activeRecord?.sourceDescription || 'Empirical battery aging measurements collected under controlled experimental conditions.'}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 space-y-1.5">
                    <span className="text-[11px] font-medium text-slate-400 block">
                      Classification & Data Pipeline
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px] font-bold border border-slate-700">
                        {activeRecord?.sourceType || 'Dataset-Based Estimate'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal">
                      {currentOption.isModel
                        ? 'Evaluated via LightGBM Fast-Gradient Boosting Regressor trained on 50,000 empirical cycle records.'
                        : 'Extracted directly from recorded laboratory cycle discharge capacity data without synthetic inflation.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* REMAINING BATTERY LIFE SECTION */}
            <div className="panel p-6 sm:p-8 space-y-3">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold border border-cyan-500/20">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Estimated Remaining Battery Life
                  </h3>
                  <p className="text-xs text-slate-400">
                    Projected endurance until 70% automotive retirement threshold
                  </p>
                </div>
              </div>

              {activeRecord?.rulCycles !== null && activeRecord?.rulCycles !== undefined && activeRecord?.rulCycles > 0 ? (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs text-emerald-300 font-bold block">
                      Estimated Remaining Cycles:
                    </span>
                    <span className="text-3xl font-extrabold font-display tabular-nums text-emerald-300">
                      ~{activeRecord.rulCycles.toLocaleString()} <span className="text-lg font-semibold text-emerald-200/80">full charge cycles</span>
                    </span>
                    <p className="text-[11px] text-emerald-200/80 mt-1">
                      Based on cycle test observations from {activeRecord?.sourceName?.split('(')[0] || 'the benchmark dataset'}.
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-xs shrink-0">
                    From dataset
                  </span>
                </div>
              ) : activeRecord?.rulCycles === 0 ? (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs">
                  <strong className="font-bold text-amber-200">End-of-Life Threshold Reached: </strong>
                  This benchmark battery pack has concluded its primary automotive service life (0 remaining cycles to 70% threshold).
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 text-slate-300 text-xs leading-relaxed">
                  <span className="font-semibold text-white block mb-0.5">
                    Remaining battery life cannot be reliably estimated from the currently available data.
                  </span>
                  <p className="text-[11px] text-slate-400">
                    We do not invent fabricated years, remaining kilometers, or cycle estimates when the underlying dataset does not provide verified remaining useful life logs.
                  </p>
                </div>
              )}
            </div>

            {/* BATTERY HEALTH HISTORY GRAPH */}
            <div className="panel p-6 sm:p-8 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 pb-2 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-lg font-bold text-white">
                      Battery Health History & Degradation Trajectory
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Calculated SOH = (Current measured capacity / Initial reference capacity) × 100
                  </p>
                </div>
                {activeRecord?.history && activeRecord.history.length > 0 && (
                  <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/30 shrink-0">
                    {activeRecord.history.length} Actual Test Points
                  </span>
                )}
              </div>

              {activeRecord?.history && activeRecord.history.length > 0 ? (
                <div className="space-y-3">
                  <div className="h-64 sm:h-72 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={activeRecord.history} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="sohDarkGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis 
                          dataKey="cycle" 
                          tick={{ fontSize: 11, fill: '#94a3b8' }}
                          stroke="#475569"
                          unit=" cyc"
                        />
                        <YAxis 
                          domain={[(dataMin) => Math.max(0, Math.floor((dataMin - 5) / 5) * 5), 100]} 
                          tick={{ fontSize: 11, fill: '#94a3b8' }}
                          stroke="#475569"
                          unit="%"
                        />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const pt = payload[0].payload;
                              return (
                                <div className="bg-slate-900 border border-slate-700 text-white p-2.5 rounded-xl text-xs shadow-2xl space-y-1">
                                  <span className="font-bold text-emerald-400 block">Cycle #{pt.cycle}</span>
                                  <div className="font-mono">SOH: <strong>{pt.soh}%</strong></div>
                                  {pt.measuredCapacityAh && (
                                    <div className="text-[11px] text-slate-400 font-mono">
                                      Measured Capacity: {pt.measuredCapacityAh} Ah (Ref: 1.1 Ah)
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="soh" 
                          stroke="#10b981" 
                          strokeWidth={2.5} 
                          fillOpacity={1} 
                          fill="url(#sohDarkGrad)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[11px] text-slate-400 text-center">
                    Graph depicts actual measured capacity retention plotted against recorded test cycles.
                  </p>
                </div>
              ) : (
                <div className="py-12 px-6 text-center rounded-2xl bg-white/[0.04] ring-1 ring-white/10 space-y-2">
                  <TrendingDown className="w-8 h-8 text-slate-600 mx-auto" />
                  <h4 className="text-xs font-bold text-slate-300">Continuous History Not Recorded for This Record</h4>
                  <p className="text-[11px] text-slate-500 max-w-md mx-auto leading-relaxed">
                    This fleet snapshot does not include cycle-by-cycle telemetry points. To inspect continuous laboratory cycle-by-cycle degradation curves, select one of the <strong>CALCE Laboratory Cell</strong> datasets from the dropdown above.
                  </p>
                </div>
              )}
            </div>

            {/* BATTERY CONDITION AND EVERYDAY TIPS */}
            <div className="panel p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
                <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center font-bold border border-teal-500/20">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Battery Condition & Healthy Habits for EV Owners
                  </h3>
                  <p className="text-xs text-slate-400">
                    Simple, actionable practices to maximize the lifespan of your electric car's battery
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 space-y-2">
                  <span className="text-xl"><EmPlug className="w-4 h-4 inline-block align-[-2px]" aria-hidden="true" /></span>
                  <h4 className="text-xs font-bold text-white">Follow Manufacturer Charging Habits</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    For routine daily commuting, keeping your state-of-charge between <strong>20% and 80%</strong> significantly slows chemical degradation compared to charging to 100% every night.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 space-y-2">
                  <span className="text-xl"><EmSun className="w-4 h-4 inline-block align-[-2px]" aria-hidden="true" /></span>
                  <h4 className="text-xs font-bold text-white">Avoid Prolonged Exposure to Excessive Heat</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Extreme ambient heat accelerates internal resistance growth. Whenever possible, park in shaded spots, covered carports, or garages during high summer temperatures.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 space-y-2">
                  <span className="text-xl"><EmTrending className="w-4 h-4 inline-block align-[-2px]" aria-hidden="true" /></span>
                  <h4 className="text-xs font-bold text-white">Monitor Battery Health Over Time</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Periodically check capacity estimates at major service milestones to track trends and ensure your pack remains safely above warranty replacement thresholds.
                  </p>
                </div>
              </div>

              {/* Valid Temperature Indicator (ONLY shown if present in the selected record) */}
              {activeRecord?.temperatureC !== undefined && activeRecord?.temperatureC !== null && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.04] ring-1 ring-white/10 text-xs text-slate-300">
                  <Thermometer className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>Recorded Test Temperature:</strong> {activeRecord.temperatureC}°C ({activeRecord.temperatureC > 40 ? 'Elevated thermal condition in test' : 'Within normal operational temperature range'}).
                  </span>
                </div>
              )}
            </div>

            {/* MORE BATTERY DETAILS (COLLAPSIBLE ACCORDION) */}
            <div className="panel border border-slate-800 shadow-xl overflow-hidden">
              <button
                onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                className="w-full p-6 sm:p-8 flex items-center justify-between text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-900 text-slate-300 flex items-center justify-center font-bold border border-slate-800">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      More Battery Details & Technical Measurements
                    </h3>
                    <p className="text-xs text-slate-400">
                      Non-technical explanations for available engineering metrics
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <span>{showTechnicalDetails ? 'Hide Details' : 'Show Details'}</span>
                  {showTechnicalDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {showTechnicalDetails && (
                <div className="p-6 sm:p-8 pt-0 border-t border-slate-800 space-y-4">
                  <p className="text-xs text-slate-400">
                    Displaying only measurements recorded in the selected dataset ({activeRecord?.sourceName || 'Benchmark'}). Missing measurements are omitted.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                    {/* 1. Capacity */}
                    <div className="p-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 space-y-1">
                      <span className="text-[11px] font-bold uppercase text-slate-500 block">Battery Capacity</span>
                      <div className="font-extrabold text-sm text-white font-mono">
                        {activeRecord?.nominalCapacity || (activeRecord?.pack_capacity_kwh ? `${activeRecord.pack_capacity_kwh} kWh` : 'Not recorded in this test')}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        The total amount of electrical energy the battery pack or cell can store when fully charged.
                      </p>
                    </div>

                    {/* 2. Cycle Count */}
                    <div className="p-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 space-y-1">
                      <span className="text-[11px] font-bold uppercase text-slate-500 block">Charge / Discharge Cycles</span>
                      <div className="font-extrabold text-sm text-white font-mono">
                        {activeRecord?.cycleCount !== undefined ? `${activeRecord.cycleCount.toLocaleString()} Cycles` : 'Not recorded in this test'}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        A complete cycle represents using 100% of the battery's capacity, whether in one go or over multiple trips.
                      </p>
                    </div>

                    {/* 3. Voltage */}
                    <div className="p-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 space-y-1">
                      <span className="text-[11px] font-bold uppercase text-slate-500 block">Voltage</span>
                      <div className="font-extrabold text-sm text-white font-mono">
                        {activeRecord?.voltageV ? `${activeRecord.voltageV} V` : 'Not recorded in this test'}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        The electrical pressure of the battery pack. Normal operational range for modern EVs is 350V - 450V.
                      </p>
                    </div>

                    {/* 4. Current */}
                    <div className="p-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 space-y-1">
                      <span className="text-[11px] font-bold uppercase text-slate-500 block">Current</span>
                      <div className="font-extrabold text-sm text-white font-mono">
                        {activeRecord?.currentA ? `${activeRecord.currentA} A` : 'Not recorded in this test'}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        The rate of electrical charge flow delivered to the motor during driving or absorbed during charging.
                      </p>
                    </div>

                    {/* 5. Temperature */}
                    <div className="p-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 space-y-1">
                      <span className="text-[11px] font-bold uppercase text-slate-500 block">Temperature</span>
                      <div className="font-extrabold text-sm text-white font-mono">
                        {activeRecord?.temperatureC !== undefined ? `${activeRecord.temperatureC} °C` : 'Not recorded in this test'}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        The cell or pack temperature during the test observation. Optimal operating range is between 15°C and 35°C.
                      </p>
                    </div>

                    {/* 6. Internal Resistance */}
                    <div className="p-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 space-y-1">
                      <span className="text-[11px] font-bold uppercase text-slate-500 block">Internal Resistance</span>
                      <div className="font-extrabold text-sm text-white font-mono">
                        {activeRecord?.resistanceMohm ? `${activeRecord.resistanceMohm} mΩ` : 'Not recorded in this test'}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Opposition to electrical flow inside cells. Naturally increases over time as batteries age.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* FINAL SUMMARY CARD: ANSWERING THE 3 CORE QUESTIONS */}
            <div className="glass-card text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl space-y-5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-400">
                  Executive Summary: The 3 Core Questions Answered
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-1">
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    1. What is the estimated health of this battery?
                  </span>
                  <p className="text-sm font-bold text-white">
                    {currentSoh !== undefined ? `${currentSoh.toFixed(1)}% State of Health (${statusInfo.label})` : 'Estimate Unavailable'}
                  </p>
                  <p className="text-xs text-slate-400 leading-normal">
                    Reflects available usable capacity relative to original factory capacity.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    2. Which dataset supports this estimate?
                  </span>
                  <p className="text-sm font-bold text-white">
                    {activeRecord?.sourceName?.split('(')[0] || 'CALCE & Kaggle Research Benchmarks'}
                  </p>
                  <p className="text-xs text-slate-400 leading-normal">
                    {currentOption.isModel
                      ? 'LightGBM model trained on 50,000 multi-chemistry records.'
                      : 'Empirical laboratory cell discharge capacity cycle measurements.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    3. What does this mean for the user?
                  </span>
                  <p className="text-sm font-bold text-white">
                    {currentSoh >= 90 
                      ? 'Near-Original Range Preserved' 
                      : currentSoh >= 80 
                        ? 'Normal Expected Aging' 
                        : 'Degraded Capacity (Review Pack)'}
                  </p>
                  <p className="text-xs text-slate-400 leading-normal">
                    {statusInfo.summary}
                  </p>
                </div>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'simulator' && (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-6 items-start">
            {/* Inputs */}
            <form onSubmit={handleRunSimulation} className="panel p-6 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2"><Sliders className="w-5 h-5 text-brand-300" /> What-if simulator</h2>
                <p className="text-sm text-slate-400 mt-1">Change how a battery is used and see its predicted health, from a model trained on real laboratory cycling data.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {Object.entries(PRESETS).map(([k, p]) => (
                  <button key={k} type="button" onClick={() => applyPreset(k)} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-slate-200">
                    {p.label}
                  </button>
                ))}
              </div>

              <fieldset>
                <legend className="text-sm font-semibold text-slate-200 mb-2">Chemistry</legend>
                <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-ink-900 ring-1 ring-white/10">
                  {['LFP', 'NMC', 'NCA', 'LCO'].map((c) => (
                    <button key={c} type="button" onClick={() => setSimChemistry(c)} aria-pressed={simChemistry === c}
                      className={`py-2 rounded-lg text-sm font-semibold transition ${simChemistry === c ? 'bg-white text-ink-950' : 'text-slate-400 hover:text-white'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </fieldset>

              {[
                ['Charge cycles so far', simCycles, setSimCycles, 0, 3000, 50, (v) => `${v.toLocaleString()} cycles`, 'New', '3,000'],
                ['Ambient temperature', simTemp, setSimTemp, 5, 45, 1, (v) => `${v} °C`, '5 °C', '45 °C'],
                ['Charging speed', simChargeC, setSimChargeC, 0.5, 8, 0.5, (v) => `${v}C${v >= 3 ? ' (fast DC)' : v <= 1 ? ' (slow AC)' : ''}`, '0.5C', '8C'],
                ['Driving load (discharge rate)', simDischargeC, setSimDischargeC, 0.5, 5, 0.5, (v) => `${v}C`, '0.5C gentle', '5C aggressive'],
              ].map(([label, val, set, min, max, step, fmt, lo, hi]) => (
                <label key={label} className="block">
                  <span className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-200">{label}</span>
                    <span className="font-semibold text-brand-300 tabular-nums">{fmt(val)}</span>
                  </span>
                  <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => set(Number(e.target.value))} className="w-full mt-2 accent-[#1fdcc5]" />
                  <span className="flex justify-between text-[11px] text-slate-500"><span>{lo}</span><span>{hi}</span></span>
                </label>
              ))}

              <button type="submit" disabled={simulating} className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-bold text-ink-950 bg-gradient-to-r from-brand-300 to-sky-400 shadow-glow disabled:opacity-60">
                {simulating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {simulating ? 'Predicting…' : 'Predict battery health'}
              </button>
            </form>

            {/* Results */}
            <section className="space-y-4" aria-live="polite">
              {!simResult && (
                <div className="panel p-10 text-center text-sm text-slate-400">Choose conditions and press <strong className="text-white">Predict battery health</strong>.</div>
              )}
              {simResult?.error && (
                <div role="alert" className="panel p-6 text-sm text-amber-200">{simResult.error}</div>
              )}
              {simResult && !simResult.error && (
                <>
                  <div className="panel p-6">
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div className="rounded-xl bg-white/[0.04] ring-1 ring-white/10 p-4">
                        <div className="text-xs text-slate-400">Predicted health</div>
                        <div className="text-3xl font-extrabold font-display tabular-nums text-white">{simResult.soh.toFixed(1)}<span className="text-lg text-brand-300">%</span></div>
                        <div className="text-xs text-slate-400 mt-0.5 tabular-nums">likely {simResult.soh_lo.toFixed(0)}–{simResult.soh_hi.toFixed(0)}%</div>
                      </div>
                      <div className="rounded-xl bg-white/[0.04] ring-1 ring-white/10 p-4">
                        <div className="text-xs text-slate-400">Cycles left to 80%</div>
                        <div className="text-3xl font-extrabold font-display tabular-nums text-white">
                          {simResult.remaining_cycles_to_80 == null
                            ? <span className="text-xl">Beyond {simResult.curve[simResult.curve.length - 1].cycle.toLocaleString()}</span>
                            : simResult.soh < 80
                              ? <span className="text-xl text-amber-300">Already below</span>
                              : simResult.remaining_cycles_to_80.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">80% is the usual warranty line</div>
                      </div>
                      <div className="rounded-xl bg-white/[0.04] ring-1 ring-white/10 p-4">
                        <div className="text-xs text-slate-400">Condition</div>
                        <div className={`text-xl font-bold mt-1 ${simResult.soh >= 90 ? 'text-emerald-300' : simResult.soh >= 80 ? 'text-teal-200' : simResult.soh >= 70 ? 'text-amber-300' : 'text-rose-300'}`}>
                          {simResult.status.charAt(0) + simResult.status.slice(1).toLowerCase()}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{simChemistry} · {simTemp} °C · {simChargeC}C charge</div>
                      </div>
                    </div>

                    <h3 className="text-sm font-semibold text-slate-200 mt-6">Predicted health over the battery’s life</h3>
                    <p className="text-xs text-slate-400">Line: model prediction for these conditions. Shaded: 10th–90th percentile of errors on batteries the model never saw.</p>
                    <div className="h-64 mt-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={simResult.curve.map((p) => ({ ...p, range: [p.lo, p.hi] }))} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                          <defs>
                            <linearGradient id="simLine" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#1fdcc5" stopOpacity={0.35} />
                              <stop offset="100%" stopColor="#1fdcc5" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                          <XAxis dataKey="cycle" type="number" domain={[0, 'dataMax']} tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#334155" tickFormatter={(v) => v.toLocaleString()} />
                          <YAxis domain={[(m) => Math.max(0, Math.floor((m - 5) / 10) * 10), 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#334155" unit="%" />
                          <Tooltip
                            contentStyle={{ background: '#0a1122', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, fontSize: 12 }}
                            formatter={(v, name) => (name === 'range' ? [`${v[0].toFixed(1)}–${v[1].toFixed(1)}%`, 'Likely range'] : [`${Number(v).toFixed(1)}%`, 'Predicted SOH'])}
                            labelFormatter={(c) => `${Number(c).toLocaleString()} cycles`}
                          />
                          <Area type="monotone" dataKey="range" stroke="none" fill="#38bdf8" fillOpacity={0.15} isAnimationActive={false} />
                          <Area type="monotone" dataKey="soh" stroke="#1fdcc5" strokeWidth={2.5} fill="url(#simLine)" isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {simResult.warnings?.length > 0 && (
                    <div className="panel p-5">
                      <div className="text-sm font-semibold text-amber-200 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Outside the tested range</div>
                      <ul className="mt-2 space-y-1.5 text-sm text-slate-300 list-disc pl-5">
                        {simResult.warnings.map((w) => <li key={w}>{w}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="panel p-5 text-sm text-slate-300">
                    <div className="font-semibold text-white flex items-center gap-2"><Cpu className="w-4 h-4 text-brand-300" /> About this model</div>
                    <p className="mt-1.5">
                      {simResult.model.name}, trained on {simResult.model.trained_on} from CALCE, Sandia, HUST and MATR test data.
                      On batteries it had never seen, its average error was <strong className="text-white">{simResult.model.heldout_mae_pct} points</strong> of SOH (RMSE {simResult.model.heldout_rmse_pct}, R² {simResult.model.heldout_r2}).
                    </p>
                    <p className="mt-1.5 text-slate-400">These are lab cells under controlled cycling, not your car. Real packs also age with time and storage, which this model does not include.</p>
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {/* =========================================================================
            TAB 3: RESEARCH DATASETS & MODEL BENCHMARKS
            ========================================================================= */}
        {activeTab === 'benchmarks' && (
          <div className="space-y-6">
            {!simInfo && <div className="panel p-10 text-center text-sm text-slate-400"><RefreshCw className="w-5 h-5 animate-spin inline mr-2" />Loading model evaluation…</div>}
            {simInfo?.error && <div role="alert" className="panel p-6 text-sm text-amber-200">{simInfo.error}</div>}
            {simInfo && !simInfo.error && (() => {
              const ev = simInfo.evaluation;
              const fmt = (m) => ({ mae: m.mae.toFixed(2), rmse: m.rmse.toFixed(2), r2: m.r2.toFixed(3) });
              const model = fmt(ev.model), base = fmt(ev.baseline_cycles_chemistry_only);
              const improvement = Math.round((1 - ev.model.rmse / ev.baseline_cycles_chemistry_only.rmse) * 100);
              return (
                <>
                  {simInfo.benchmark && (() => {
                    const bm = simInfo.benchmark;
                    const rows = bm.results;
                    const bestRmse = rows[0].rmse;
                    const famTone = { 'Deep learning': 'bg-violet-400/15 text-violet-200', Boosting: 'bg-brand-400/15 text-brand-200', 'Bagging ensemble': 'bg-sky-400/15 text-sky-200' };
                    return (
                      <section className="panel p-6 sm:p-8">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2"><Cpu className="w-5 h-5 text-brand-300" /> Machine-learning vs deep-learning models</h2>
                        <p className="text-sm text-slate-400 mt-1 max-w-3xl">
                          {rows.length} models trained on the same {bm.cells} cells and scored the same way: whole batteries held out, 5 folds.
                          “Curve rises” is how often a model predicts a battery getting healthier with more cycles, which a simulator must never do.
                        </p>

                        <div className="mt-5 h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={rows.map((r) => ({ name: r.name.replace(/ \(.*\)/, ''), rmse: +r.rmse.toFixed(2), deep: r.family === 'Deep learning' }))} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" horizontal={false} />
                              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#334155" unit=" pts" />
                              <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11, fill: '#cbd5e1' }} stroke="#334155" />
                              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: '#0a1122', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, fontSize: 12 }} formatter={(v) => [`${v} pts`, 'RMSE on unseen cells']} />
                              <Bar dataKey="rmse" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                                {rows.map((r) => (
                                  <Cell key={r.name} fill={r.name === bm.in_production ? '#1fdcc5' : r.family === 'Deep learning' ? '#a78bfa' : '#475569'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-slate-400 mt-2">
                          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#1fdcc5]" /> Used by the simulator</span>
                          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#a78bfa]" /> Deep learning</span>
                          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#475569]" /> Other ML</span>
                        </div>

                        <div className="overflow-x-auto mt-6">
                          <table className="w-full text-sm tabular-nums">
                            <thead>
                              <tr className="text-left text-xs text-slate-400 border-b border-white/10">
                                <th className="py-2.5 pr-3 font-medium">#</th>
                                <th className="py-2.5 pr-4 font-medium">Model</th>
                                <th className="py-2.5 px-3 font-medium">Family</th>
                                <th className="py-2.5 px-3 font-medium text-right">MAE</th>
                                <th className="py-2.5 px-3 font-medium text-right">RMSE</th>
                                <th className="py-2.5 px-3 font-medium text-right">R²</th>
                                <th className="py-2.5 px-3 font-medium text-right">Curve rises</th>
                                <th className="py-2.5 pl-3 font-medium text-right">Train time</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {rows.map((r, i) => (
                                <tr key={r.name} className={r.name === bm.in_production ? 'bg-brand-400/[0.07]' : ''}>
                                  <td className="py-2.5 pr-3 text-slate-500">{i + 1}</td>
                                  <td className="py-2.5 pr-4 font-semibold text-white whitespace-nowrap">
                                    {r.name}
                                    {r.name === bm.in_production && <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-400/15 text-brand-200">in use</span>}
                                    {r.train_subsample && <span className="ml-2 text-[11px] text-slate-500">({r.train_subsample.toLocaleString()} rows)</span>}
                                  </td>
                                  <td className="py-2.5 px-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${famTone[r.family] || 'bg-white/5 text-slate-300'}`}>{r.family}</span></td>
                                  <td className="py-2.5 px-3 text-right text-slate-200">{r.mae.toFixed(2)}</td>
                                  <td className={`py-2.5 px-3 text-right ${r.rmse === bestRmse ? 'text-white font-semibold' : 'text-slate-200'}`}>{r.rmse.toFixed(2)}</td>
                                  <td className="py-2.5 px-3 text-right text-slate-200">{r.r2.toFixed(3)}</td>
                                  <td className={`py-2.5 px-3 text-right ${r.monotonic_violation_rate === 0 ? 'text-emerald-300' : 'text-amber-300'}`}>{r.monotonic_violation_rate === 0 ? 'Never' : `${Math.round(r.monotonic_violation_rate * 100)}%`}</td>
                                  <td className="py-2.5 pl-3 text-right text-slate-400">{r.fit_seconds < 1 ? '<1 s' : `${r.fit_seconds.toFixed(0)} s`}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-4 rounded-xl bg-white/[0.04] ring-1 ring-white/10 p-4 text-sm text-slate-300 space-y-1.5">
                          <p><strong className="text-white">Why {bm.in_production.replace(/ \(.*\)/, '')}?</strong> {bm.best_overall} scores lowest overall, but its curves rise with more cycles in {Math.round(rows.find((r) => r.name === bm.best_overall).monotonic_violation_rate * 100)}% of scenarios, which a what-if simulator cannot show. Among models whose curves never rise, {bm.tied_with_best_monotone.join(' and ')} are tied within {bm.tie_tolerance_rmse} points of RMSE; LightGBM is kept as it trains fastest.</p>
                          <p>Deep learning did not beat gradient boosting on this small tabular dataset ({bm.cells} cells, 8 inputs), which is typical; the physics-informed network is guaranteed physically consistent but less accurate.</p>
                        </div>
                        <p className="mt-3 text-xs text-slate-500">Errors in percentage points of SOH. Deep-learning models trained on {bm.device_for_deep_learning === 'cuda' ? 'GPU' : 'CPU'}.</p>
                      </section>
                    );
                  })()}

                  <section className="panel p-6 sm:p-8">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2"><BarChart3 className="w-5 h-5 text-brand-300" /> How accurate is the simulator?</h2>
                    <p className="text-sm text-slate-400 mt-1 max-w-3xl">
                      Measured with 5-fold cross-validation grouped by cell: every battery is predicted by a model that never saw any of its cycles. Errors are in percentage points of state of health.
                    </p>

                    <div className="grid sm:grid-cols-3 gap-3 mt-5">
                      {[['Average error (MAE)', `${model.mae} pts`], ['RMSE', `${model.rmse} pts`], ['R²', model.r2]].map(([k, v]) => (
                        <div key={k} className="rounded-xl bg-white/[0.04] ring-1 ring-white/10 p-4">
                          <div className="text-xs text-slate-400">{k}</div>
                          <div className="text-2xl font-extrabold font-display tabular-nums text-white mt-0.5">{v}</div>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-x-auto mt-6">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-slate-400 border-b border-white/10">
                            <th className="py-2.5 pr-4 font-medium">Model</th>
                            <th className="py-2.5 px-4 font-medium">Inputs</th>
                            <th className="py-2.5 px-4 font-medium text-right">MAE</th>
                            <th className="py-2.5 px-4 font-medium text-right">RMSE</th>
                            <th className="py-2.5 pl-4 font-medium text-right">R²</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 tabular-nums">
                          <tr>
                            <td className="py-3 pr-4 text-slate-300">Baseline</td>
                            <td className="py-3 px-4 text-slate-400">Cycles, chemistry</td>
                            <td className="py-3 px-4 text-right text-slate-300">{base.mae}</td>
                            <td className="py-3 px-4 text-right text-slate-300">{base.rmse}</td>
                            <td className="py-3 pl-4 text-right text-slate-300">{base.r2}</td>
                          </tr>
                          <tr className="bg-brand-400/[0.06]">
                            <td className="py-3 pr-4 font-semibold text-white">LightGBM simulator <span className="ml-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-400/15 text-brand-200">in use</span></td>
                            <td className="py-3 px-4 text-slate-300">+ temperature, charge and discharge rate</td>
                            <td className="py-3 px-4 text-right font-semibold text-white">{model.mae}</td>
                            <td className="py-3 px-4 text-right font-semibold text-white">{model.rmse}</td>
                            <td className="py-3 pl-4 text-right font-semibold text-white">{model.r2}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-3 text-sm text-slate-400">Adding the usage conditions cuts the error by about <strong className="text-white">{improvement}%</strong> compared with knowing only the cycle count and chemistry.</p>
                  </section>

                  <div className="grid lg:grid-cols-2 gap-6">
                    <section className="panel p-6">
                      <h3 className="text-base font-bold text-white">Accuracy by chemistry</h3>
                      <table className="w-full text-sm mt-3 tabular-nums">
                        <thead><tr className="text-left text-xs text-slate-400 border-b border-white/10"><th className="py-2 font-medium">Chemistry</th><th className="py-2 font-medium text-right">Cells</th><th className="py-2 font-medium text-right">MAE</th><th className="py-2 font-medium text-right">R²</th></tr></thead>
                        <tbody className="divide-y divide-white/5">
                          {Object.entries(ev.by_chemistry).map(([c, m]) => (
                            <tr key={c}>
                              <td className="py-2.5 font-semibold text-white">{c}</td>
                              <td className="py-2.5 text-right text-slate-300">{simInfo.training.cells_by_chemistry[c]}</td>
                              <td className="py-2.5 text-right text-slate-300">{m.mae.toFixed(2)}</td>
                              <td className="py-2.5 text-right text-slate-300">{m.r2.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>

                    <section className="panel p-6">
                      <h3 className="text-base font-bold text-white">How the uncertainty grows with age</h3>
                      <p className="text-xs text-slate-400 mt-1">80% of held-out predictions fall inside this range around the predicted value.</p>
                      <div className="mt-4 space-y-2.5">
                        {ev.band_10_90.map((b, i, arr) => {
                          const from = i === 0 ? 0 : arr[i - 1].max_cycle;
                          const width = b.hi - b.lo;
                          return (
                            <div key={b.max_cycle} className="flex items-center gap-3 text-sm">
                              <span className="w-32 shrink-0 text-slate-400 tabular-nums">{b.max_cycle > 1e8 ? `${from.toLocaleString()}+ cycles` : `${from.toLocaleString()}–${b.max_cycle.toLocaleString()}`}</span>
                              <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-sky-400" style={{ width: `${Math.min(100, width * 7)}%` }} /></div>
                              <span className="w-24 text-right tabular-nums text-slate-200">{b.lo.toFixed(1)} / +{b.hi.toFixed(1)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  </div>

                  <section className="panel p-6">
                    <h3 className="text-base font-bold text-white">Training data and tested conditions</h3>
                    <p className="text-sm text-slate-400 mt-1">
                      {simInfo.training.cells} laboratory cells, {simInfo.training.rows.toLocaleString()} cycles. Sources:{' '}
                      {Object.entries(simInfo.training.cells_by_source).map(([k, v]) => `${({ SNL: 'Sandia', OXFORD: 'Oxford' })[k] || k} ${v}`).join(', ')}.
                      Predictions outside these conditions are flagged in the simulator.
                    </p>
                    <div className="overflow-x-auto mt-4">
                      <table className="w-full text-sm tabular-nums">
                        <thead><tr className="text-left text-xs text-slate-400 border-b border-white/10"><th className="py-2 pr-4 font-medium">Chemistry</th><th className="py-2 px-4 font-medium">Temperatures tested</th><th className="py-2 px-4 font-medium">Charge rate</th><th className="py-2 px-4 font-medium">Discharge rate</th><th className="py-2 pl-4 font-medium text-right">Longest test</th></tr></thead>
                        <tbody className="divide-y divide-white/5 text-slate-300">
                          {Object.entries(simInfo.support).map(([c, sp]) => {
                            const rng = ([a, b]) => (a === b ? `${a}C` : `${a}–${b}C`);
                            return (
                              <tr key={c}>
                                <td className="py-2.5 pr-4 font-semibold text-white">{c}</td>
                                <td className="py-2.5 px-4">{sp.ambient_temp_C.join(', ')} °C</td>
                                <td className="py-2.5 px-4">{rng(sp.max_charge_rate_C)}</td>
                                <td className="py-2.5 px-4">{rng(sp.max_discharge_rate_C)}</td>
                                <td className="py-2.5 pl-4 text-right">{sp.max_cycles.toLocaleString()} cycles</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-4 text-xs text-slate-500">Model trained {new Date(simInfo.created).toLocaleDateString()} with LightGBM {simInfo.lightgbm}. Lab cells under controlled cycling; calendar ageing and real-vehicle conditions are not included.</p>
                  </section>
                </>
              );
            })()}
          </div>
        )}

      </div>
    </div>
  );
};

export default BatteryDashboard;
