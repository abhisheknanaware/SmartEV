import React, { useEffect, useState } from 'react';
import { Leaf, Timer } from 'lucide-react';
import { batteryApi } from '../services/api';

const EFF = 0.93;          // charger-to-battery efficiency
const AC_ONBOARD_KW = 7.2; // typical onboard AC charger
// Average power as a share of peak: DC tapers hard above ~80%, AC barely tapers.
const AVG_SHARE = { FAST: { to80: 0.85, above80: 0.35 }, NORMAL: { to80: 0.95, above80: 0.85 } };

const minutes = (kwhIntoBattery, kw) => (kw > 0 ? Math.round((kwhIntoBattery / EFF / kw) * 60) : 0);

/** Battery-friendly charging tip for the selected car and charger, shown before booking. */
export default function ChargingAdvice({ vehicle, chargerKw, mode }) {
  const [impact, setImpact] = useState(null);
  const cap = vehicle?.batteryCapacityKwh;
  const soc = Math.min(95, Math.max(0, Number(vehicle?.currentSocPercent ?? 20)));
  const peak = mode === 'FAST' ? Math.min(chargerKw || 50, vehicle?.maxChargingPowerKw || 50) : Math.min(22, AC_ONBOARD_KW);
  const chem = vehicle?.chemistry ? vehicle.chemistry.toUpperCase() : null; // unknown -> no battery-impact estimate
  const cRate = cap ? peak / cap : 0;

  useEffect(() => {
    setImpact(null);
    if (!cap || mode !== 'FAST' || chem !== 'LFP' || cRate <= 1) return;
    const base = { chemistry: 'LFP', cycles: 1000, ambient_temp_c: 25, discharge_c_rate: 1 };
    Promise.all([
      batteryApi.simulate({ ...base, charge_c_rate: Math.min(8, Math.round(cRate * 2) / 2) }),
      batteryApi.simulate({ ...base, charge_c_rate: 0.5 }),
    ]).then(([fast, slow]) => setImpact({ fast: fast.data.soh, slow: slow.data.soh })).catch(() => setImpact(null));
  }, [cap, mode, chem, cRate]);

  if (!cap) return null;
  const s = AVG_SHARE[mode] || AVG_SHARE.FAST;
  const to80 = soc >= 80 ? 0 : minutes(((80 - soc) / 100) * cap, peak * s.to80);
  const last20 = minutes(((100 - Math.max(80, soc)) / 100) * cap, peak * s.above80);

  return (
    <div className="rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 p-4 text-sm text-emerald-950 space-y-2">
      <div className="font-semibold flex items-center gap-2"><Leaf className="w-4 h-4 text-emerald-600" /> Battery-friendly tip for your {vehicle.model}</div>
      <p className="flex items-start gap-2">
        <Timer className="w-4 h-4 mt-0.5 text-emerald-700 shrink-0" />
        {soc >= 80 ? (
          <span>
            Your car is already at about {Math.round(soc)}%. At {Math.round(peak)} kW the rest takes about <strong>{last20} min</strong>
            {mode === 'FAST' ? ', because fast charging slows down near full.' : '.'}
          </span>
        ) : (
          <span>
            From {Math.round(soc)}% at about {Math.round(peak)} kW: <strong>{to80} min to 80%</strong>
            {mode === 'FAST' ? <>, then about <strong>{last20} more min</strong> for the last 20%, as fast charging slows down near full.</> : <>, and {last20} min more to reach 100%.</>}
          </span>
        )}
      </p>
      {mode === 'FAST' && (
        <p className="text-emerald-900/90">
          Stopping at 80% saves that time and keeps the battery out of the high-voltage end of the charge, which wears it fastest.
          {impact && impact.slow - impact.fast >= 0.5 && (
            <> Our model of real LFP test cells predicts about <strong>{impact.fast.toFixed(0)}%</strong> health after 1,000 charges at this speed, against <strong>{impact.slow.toFixed(0)}%</strong> with slow charging, so mix in AC charging when you can.</>
          )}
          {chem && chem !== 'LFP' && <> (The effect of charging speed on {chem} batteries isn’t in our training data, so we don’t estimate it.)</>}
          {!chem && <> Add your battery chemistry in My vehicles to see the predicted long-term impact.</>}
        </p>
      )}
      <p className="text-xs text-emerald-800/80">Based on your car’s {cap} kWh battery and {Math.round(soc)}% charge in My vehicles. Real times vary with temperature and the charger.</p>
    </div>
  );
}
