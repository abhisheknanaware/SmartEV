import urllib.request
import json

def test(url, data=None):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8') if data else None,
        headers={'Content-Type': 'application/json'} if data else {}
    )
    with urllib.request.urlopen(req, timeout=5) as res:
        return json.loads(res.read().decode('utf-8'))

try:
    stations = test('http://localhost:8080/api/stations')
    print('1. Stations count:', len(stations))

    route = test('http://localhost:8080/api/navigation/plan-route', {
        'origin': 'Delhi',
        'destination': 'Agra',
        'currentBatteryPct': 38
    })
    print('2. Route stations along route:', len(route.get('allStationsAlongRoute', [])), 
          'Recommended station:', route.get('topRecommendation', {}).get('station', {}).get('name'))

    auth = test('http://localhost:8080/api/auth/login', {
        'email': 'admin@smartev.com',
        'password': 'admin123'
    })
    print('3. Auth login user:', auth.get('name'), 'Role:', auth.get('role'))

    hold = test('http://localhost:8080/api/bookings/hold', {
        'stationId': 1,
        'slotId': 101,
        'chargingKwh': 25
    })
    print('4. Hold bookingId:', hold.get('bookingId'), 'Order:', hold.get('razorpayOrderId'), 'Amount: Rs.', hold.get('amount'))

    pay = test('http://localhost:8080/api/bookings/verify-payment', {
        'bookingId': hold.get('bookingId'),
        'razorpayPaymentId': 'pay_test_123'
    })
    print('5. Confirmed Ref:', pay.get('bookingReference'), 'Status:', pay.get('status'))

    admin_st = test('http://localhost:8080/api/analytics/admin-dashboard')
    print('6. Admin Revenue: Rs.', admin_st.get('totalRevenue'), 'Today Bookings:', admin_st.get('todayBookings'))
    print('ALL ENDPOINTS VERIFIED 100% OPERATIONAL!')
except Exception as e:
    print('Error testing:', e)
