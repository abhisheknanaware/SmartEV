import React from 'react';
import { Coffee, Bath, Wifi, Sofa, Cctv, Utensils, Gauge, Accessibility, Baby, Landmark, Sparkles, ShoppingBag, Banknote } from 'lucide-react';

// Maps an amenity label (e.g. "Cafe Coffee Day", "Free Wi-Fi") to a line icon.
const RULES = [
  [/cafe|coffee|starbucks/i, Coffee],
  [/restroom|toilet|washroom/i, Bath],
  [/wi-?fi|internet/i, Wifi],
  [/lounge|waiting|co-?working/i, Sofa],
  [/security|cctv/i, Cctv],
  [/food|dining|restaurant|court/i, Utensils],
  [/tyre|tire|air/i, Gauge],
  [/wheelchair|access/i, Accessibility],
  [/kids|play/i, Baby],
  [/prayer/i, Landmark],
  [/mall|shop|market/i, ShoppingBag],
  [/atm|bank/i, Banknote],
];

export default function AmenityIcon({ label = '', className = 'w-4 h-4' }) {
  const Icon = RULES.find(([re]) => re.test(label))?.[1] || Sparkles;
  return <Icon className={className} aria-hidden="true" />;
}
