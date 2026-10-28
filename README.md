# SmartEV: Intelligent EV Charging, Parking, Navigation & Battery Intelligence Platform

[![Platform](https://img.shields.io/badge/Platform-Spring%20Boot%203%20%7C%20FastAPI%20%7C%20React%2018-0284c7.svg)](#)
[![AIML Core](https://img.shields.io/badge/AIML%20Core-XGBoost%20%7C%20RandomForest%20%7C%20RUL%20%7C%20Demand%20Forecast-00e699.svg)](#)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%20(Neon)%20%7C%20Redis%20Cache-emerald.svg)](#)
[![Security & Payments](https://img.shields.io/badge/Payments-Razorpay%20HMAC--SHA256%20%7C%20ZXing%20QR-purple.svg)](#)

> **Final-Year AIML Engineering Capstone Project**  
> An autonomous end-to-end electric vehicle mobility ecosystem combining expressway navigation, multi-factor AI station recommendations, date/time physical slot reservations with Redis concurrency locks, Razorpay payments with cryptographic digital QR gate passes, machine learning battery State of Health (SOH) & Remaining Useful Life (RUL) prediction, 24-hour station demand forecasting, and SaaS Admin analytics.

---

## ⚡ High-Level System Architecture

```text
                                 +---------------------------------------+
                                 |          SmartEV React 18 UI          |
                                 |    (Vite + Tailwind + Leaflet Map)    |
                                 +-------------------+-------------------+
                                                     |  REST + JWT
                                                     v
                                 +---------------------------------------+
                                 |     Spring Boot 3.3.4 REST Core       |
                                 |  - Auth & Role Security (User/Admin)  |
                                 |  - Stations & Corridor Hub Management |
                                 |  - Slot Allocation & Verification     |
                                 |  - Razorpay HMAC Payment Verification |
                                 |  - ZXing Base64 QR Code Pass Engine   |
                                 +---------+-------------------+---------+
                                           |                   |
                     +---------------------+                   +---------------------+
                     v                                                               v
      +-----------------------------+                                 +-----------------------------+
      |      Redis 7.2 Cache        |                                 |    Python FastAPI ML Core   |
      |  - 10-Minute Temporary      |                                 |  - XGBoost SOH Regressor    |
      |    Distributed Slot Locks   |                                 |  - Cycle-based RUL Engine   |
      |  - Concurrency Protection   |                                 |  - Multi-factor Recommender |
      |  - Key TTL: 600 seconds     |                                 |  - 24-hr Demand Forecaster  |
      +-----------------------------+                                 |  - Autonomous Copilot Tool  |
                     |                                                +-----------------------------+
                     v
      +-----------------------------+
      |  Neon Cloud PostgreSQL DB   |
      |  - Users & Fleet Vehicles   |
      |  - NH 48 Corridor Stations  |
      |  - Bays & Charging Slots    |
      |  - Bookings & Transactions  |
      |  - Battery Pack Telemetry   |
      +-----------------------------+
```

---

## 🧠 Core AIML Pillars

### 1. Battery State of Health (SOH) & RUL Degradation Prediction
- **Algorithm**: XGBoost Regressor trained on 10,000 synthetic & empirical lithium NMC battery discharge cycles.
- **Academic Benchmark Comparison**:
  | Model | Mean Absolute Error (MAE) | Root Mean Squared Error (RMSE) | R² Variance Score | Status |
  | :--- | :--- | :--- | :--- | :--- |
  | **Linear Regression** | 1.84% SOH | 2.31% SOH | 0.892 | Baseline |
  | **Random Forest** | 0.92% SOH | 1.24% SOH | 0.963 | Candidate |
  | **XGBoost (Ours)** | **0.61% SOH** | **0.84% SOH** | **0.985** | **Production Deployed** |
- **Feature Importance**:
  - Cycle Count: **38%**
  - Internal Impedance / Resistance ($m\Omega$): **29%**
  - Peak Operating Temperature ($^\circ C$): **18%**
  - Average C-rate Fast-Charging Intensity: **15%**
- **RUL Remaining Useful Life**: Automatically estimates remaining charge cycles and equivalent highway kilometer range before hitting the 80% EOL (End of Life) degradation ceiling.

### 2. Multi-Factor AI Charging Station Recommendation
When traveling along the Pune–Mumbai Expressway (NH 48 corridor), the AI ranks waypoint charging hubs using a multi-criteria utility score:
$$\text{Score} = w_1 \cdot \text{SpeedScore} + w_2 \cdot \text{SlotRatio} - w_3 \cdot \text{RouteDeviation} - w_4 \cdot \text{Tariff} + w_5 \cdot \text{Rating}$$
- Prioritizes 120 kW+ DC fast chargers.
- Penalizes detours and heavily congested stations.
- Considers vehicle State of Charge (SOC) to prevent stranding.

### 3. AI Travel Copilot with Autonomous Function Calling
An intelligent floating assistant that accepts natural language queries (e.g., *"I'm driving Pune to Mumbai, where should I stop?"*), autonomously executes backend tools (`recommendStation`, `getBatteryHealth`, `planRoute`), and renders interactive navigation cards with 1-click booking.

### 4. 24-Hour Station Demand & Congestion Forecasting
FastAPI time-series demand model predicting station utilization percentages based on time of day, day of week, and historical corridor traffic volume, surfacing proactive dynamic tariff discounts during off-peak windows.

---

## 🛡️ Anti-Concurrency Slot Reservation (Redis Lock)

To eliminate double-booking race conditions during high-demand expressway peak hours:
1. When a driver selects an available bay (e.g., Bay A3), a **10-minute temporary Redis key** is atomically set:
   `booking:hold:{stationId}:{slotId}:{date}:{startTime}` with a TTL of 600 seconds.
2. Concurrent booking requests from other drivers for the same slot and timeframe are rejected with HTTP 409 Conflict.
3. The driver sees a live countdown timer with progress bar to complete payment.
4. If payment is verified via Razorpay HMAC signature within 10 minutes, the booking is permanently saved in PostgreSQL as `CONFIRMED`.
5. If the timer elapses, the Redis key automatically expires and the bay returns to the public availability pool.

---

## 💳 Razorpay Payment & Digital QR Access Pass

- Integrated with Razorpay test credentials (`rzp_test_S8ap03anBQzz4i`).
- Server-side cryptographic HMAC-SHA256 signature verification guarantees tamper-proof transactions.
- Upon successful checkout, ZXing generates a high-resolution base64 QR code pass containing:
  - Unique booking reference (e.g., `BK-LON-4821`)
  - Station ID and Bay number
  - Scheduled time window
  - Vehicle registration plate
- Drivers can display the pass on their phone or print it for barrier scanner entry.

---

## 📍 Expressway Corridor Stations (NH 48 Pune–Mumbai)

The platform comes pre-seeded with 8 expressway hubs equipped with 10 physical bays each:
1. **GreenCharge Wakad Expressway Hub** (18.5987, 73.7631) • 120 kW Dual CCS2
2. **VoltPoint Baner Tech Park** (18.5590, 73.7868) • 60 kW CCS2
3. **ElectriHub Hinjewadi Phase 1** (18.5913, 73.7389) • 120 kW Fast DC
4. **Shell Recharge Talegaon Tollway** (18.7290, 73.6740) • 150 kW Ultra-Fast
5. **GreenCharge Lonavala Expressway Hub** (18.7557, 73.4091) • 120 kW Dual CCS2 *(Recommended Midway Stop)*
6. **Zeon Khalapur High-Speed Station** (18.8286, 73.2842) • 180 kW Supercharger
7. **Jio-BP Pulse Vashi Express Hub** (19.0770, 72.9986) • 120 kW Fast DC
8. **Tata Power MegaCharger BKC** (19.0657, 72.8687) • 150 kW Ultra-Fast

---

## 🚀 Quick Start & Local Execution

### 1. Prerequisites
- **Java 17+** & Maven
- **Python 3.10+** (with virtual environment)
- **Node.js 18+** & npm
- **Redis Server** (or portable binary provided in `/redis`)

### 2. Start Redis Server
```powershell
cd d:\EVFINAL\redis
.\redis-server.exe --port 6379
```

### 3. Start Python ML Microservice
```powershell
cd d:\EVFINAL\ml-service
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
- Interactive Swagger docs: `http://localhost:8000/docs`

### 4. Start Spring Boot Backend
```powershell
cd d:\EVFINAL\backend
mvn spring-boot:run
```
- Swagger API Docs: `http://localhost:8080/swagger-ui.html`
- Connected to cloud Neon PostgreSQL (`ep-quiet-poetry-b5k9zebc`) and local Redis.

### 5. Start React Frontend
```powershell
cd d:\EVFINAL\frontend
npm run dev
```
- Application UI: `http://localhost:5173`

---

## 🔑 Demo Evaluation Credentials

| Role | Email | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **EV Driver** | `user@smartev.com` | `user123` | Route planning, slot reservations, battery AI, garage |
| **Admin Operator** | `admin@smartev.com` | `admin123` | SaaS analytics, revenue trends, station management |

*(The navigation bar includes a 1-click Driver/Admin role switcher for rapid examiner testing.)*

---

## 📁 Repository Structure

```text
EVFINAL/
├── backend/                   # Spring Boot 3.3.4 REST Core
│   ├── src/main/java/com/smartev/
│   │   ├── analytics/         # SaaS KPI and AI insights service
│   │   ├── battery/           # SOH and RUL telemetry endpoints
│   │   ├── booking/           # Redis holds, ZXing QR generation, Razorpay
│   │   ├── navigation/        # Route planner and waypoint scorer
│   │   ├── security/          # Spring Security 6 & JWT utilities
│   │   ├── slot/              # Physical bay entities and matrix
│   │   ├── station/           # Expressway stations & review sentiment
│   │   └── user/              # User accounts & auth controller
│   └── src/main/resources/    # application.yml configuration
├── frontend/                  # React 18 + Vite + Tailwind CSS
│   ├── src/
│   │   ├── components/        # Navbar, AiChatModal
│   │   ├── context/           # AuthContext (JWT provider)
│   │   ├── pages/             # LandingPage, Dashboard, StationDetails,
│   │   │                      # BatteryDashboard, BookingsPage, VehiclesPage,
│   │   │                      # AdminDashboard, Login, Register
│   │   └── services/          # Axios API client modules
├── ml-service/                # Python FastAPI Microservice
│   ├── app/
│   │   ├── main.py            # FastAPI entry & CORS
│   │   ├── battery_model.py   # XGBoost / RF / LR model inference
│   │   ├── recommender.py     # Multi-factor station ranking
│   │   ├── demand_model.py    # 24-hr station demand forecast
│   │   └── ai_copilot.py      # Autonomous tool calling copilot
│   ├── train_models.py        # Model training & joblib persistence
│   └── requirements.txt
├── redis/                     # Portable Redis 64-bit Windows binary
├── docker-compose.yml         # Container orchestration manifest
└── README.md                  # Project submission documentation
```
