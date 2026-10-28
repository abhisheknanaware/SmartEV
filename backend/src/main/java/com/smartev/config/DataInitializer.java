package com.smartev.config;

import com.smartev.battery.BatteryRepository;
import com.smartev.battery.BatteryTelemetry;
import com.smartev.review.Review;
import com.smartev.review.ReviewRepository;
import com.smartev.slot.ParkingSlot;
import com.smartev.slot.SlotRepository;
import com.smartev.slot.SlotStatus;
import com.smartev.station.Station;
import com.smartev.station.StationRepository;
import com.smartev.user.Role;
import com.smartev.user.User;
import com.smartev.user.UserRepository;
import com.smartev.vehicle.Vehicle;
import com.smartev.vehicle.VehicleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Component
@org.springframework.context.annotation.Profile("!prod") // demo accounts (admin123/user123) must never be seeded in production
@RequiredArgsConstructor
@Slf4j
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final VehicleRepository vehicleRepository;
    private final StationRepository stationRepository;
    private final SlotRepository slotRepository;
    private final BatteryRepository batteryRepository;
    private final ReviewRepository reviewRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        try {
            log.info("Starting SmartEV database schema verification and seed pipeline...");

        // 1. Seed Users
        User admin = userRepository.findByEmail("admin@smartev.com").orElseGet(() -> {
            User u = User.builder()
                    .name("SmartEV Administrator")
                    .email("admin@smartev.com")
                    .password(passwordEncoder.encode("admin123"))
                    .phone("+91 98765 43210")
                    .role(Role.ROLE_ADMIN)
                    .build();
            return userRepository.save(u);
        });

        User user = userRepository.findByEmail("user@smartev.com").orElseGet(() -> {
            User u = User.builder()
                    .name("Rohit Sharma (EV Driver)")
                    .email("user@smartev.com")
                    .password(passwordEncoder.encode("user123"))
                    .phone("+91 91234 56789")
                    .role(Role.ROLE_USER)
                    .build();
            return userRepository.save(u);
        });

        // 2. Seed Vehicle
        Vehicle vehicle;
        List<Vehicle> existingVehicles = vehicleRepository.findByUserIdOrderByCreatedAtDesc(user.getId());
        if (existingVehicles.isEmpty()) {
            vehicle = Vehicle.builder()
                    .user(user)
                    .vehicleNumber("MH 12 EV 8899")
                    .model("Tata Nexon EV Max")
                    .batteryCapacityKwh(40.5)
                    .connectorType("CCS2")
                    .manufacturingYear(2023)
                    .currentBatteryPct(38.0)
                    .currentSoh(91.4)
                    .build();
            vehicle = vehicleRepository.save(vehicle);
        } else {
            vehicle = existingVehicles.get(0);
        }

        // 3. Seed Stations across Whole India (Pan-India Highways & Metros)
        List<Station> panIndiaStations = List.of(
                // Pune - Mumbai Expressway
                Station.builder().name("GreenCharge Wakad").address("Sayaji Hotel Campus, Wakad Flyover, Pune").city("Pune").latitude(18.5987).longitude(73.7634).parkingPricePerHour(40.0).chargingPricePerKwh(14.00).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(10).rating(4.6).reviewCount(54).imageUrl("https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Restrooms, Cafe Coffee Day, Free Wi-Fi, Lounge").active(true).build(),
                Station.builder().name("VoltPoint Baner").address("High Street Balewadi, Baner, Pune").city("Pune").latitude(18.5590).longitude(73.7868).parkingPricePerHour(30.0).chargingPricePerKwh(12.50).maxChargingSpeedKw(60.0).chargerTypes("CCS2, Type 2").totalSlots(8).rating(4.4).reviewCount(38).imageUrl("https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Shopping Mall, Food Court, ATM").active(true).build(),
                Station.builder().name("ElectriHub Hinjewadi IT Park").address("Phase 1 Hinjewadi Tech Park, Pune").city("Pune").latitude(18.5912).longitude(73.7389).parkingPricePerHour(50.0).chargingPricePerKwh(15.00).maxChargingSpeedKw(150.0).chargerTypes("CCS2, CHAdeMO").totalSlots(10).rating(4.8).reviewCount(82).imageUrl("https://images.unsplash.com/photo-1571127236794-81c0bbfe1ce3?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Co-working Lounge, Starbucks, Supermarket").active(true).build(),
                Station.builder().name("Expressway SuperCharger Talegaon").address("Somatane Toll Expressway Junction, Talegaon").city("Talegaon").latitude(18.7320).longitude(73.6450).parkingPricePerHour(30.0).chargingPricePerKwh(13.00).maxChargingSpeedKw(90.0).chargerTypes("CCS2, Type 2").totalSlots(8).rating(4.3).reviewCount(29).imageUrl("https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Highway Dhaba, Clean Restrooms, Tire Air").active(true).build(),
                Station.builder().name("GreenCharge Lonavala (Expressway Hub)").address("Expressway Food Mall, Milestone 62, Lonavala").city("Lonavala").latitude(18.7557).longitude(73.4091).parkingPricePerHour(40.0).chargingPricePerKwh(13.50).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(10).rating(4.7).reviewCount(128).imageUrl("https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("McDonald's, Starbucks, Chikki Stores, AC Waiting Room").active(true).build(),
                Station.builder().name("Zeon Khalapur High-Speed Hub").address("Khalapur Toll Plaza Reststop, NH 48").city("Khalapur").latitude(18.8120).longitude(73.2340).parkingPricePerHour(40.0).chargingPricePerKwh(14.50).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(8).rating(4.5).reviewCount(47).imageUrl("https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Food Plaza, Restrooms, EV Service Center").active(true).build(),
                Station.builder().name("VoltHub Vashi (Navi Mumbai)").address("Inorbit Mall EV Zone, Sector 30A, Vashi, Navi Mumbai").city("Navi Mumbai").latitude(19.0657).longitude(72.9985).parkingPricePerHour(50.0).chargingPricePerKwh(13.00).maxChargingSpeedKw(60.0).chargerTypes("CCS2, Type 2").totalSlots(10).rating(4.4).reviewCount(64).imageUrl("https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80").openingHours("08:00 AM - 11:30 PM").amenities("Inorbit Mall, Cinema, Food Court").active(true).build(),
                Station.builder().name("Tata Power MegaCharger BKC").address("G Block, Bandra Kurla Complex, Mumbai").city("Mumbai").latitude(19.0600).longitude(72.8656).parkingPricePerHour(80.0).chargingPricePerKwh(16.00).maxChargingSpeedKw(150.0).chargerTypes("CCS2, CHAdeMO").totalSlots(12).rating(4.9).reviewCount(175).imageUrl("https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Jio World Drive, Premium Lounge, High-Speed Wi-Fi").active(true).build(),

                // Delhi NCR
                Station.builder().name("Connaught Place Supercharger").address("Inner Circle, Block B, Connaught Place, New Delhi").city("Delhi").latitude(28.6304).longitude(77.2177).parkingPricePerHour(60.0).chargingPricePerKwh(16.50).maxChargingSpeedKw(150.0).chargerTypes("CCS2, Type 2").totalSlots(10).rating(4.8).reviewCount(110).imageUrl("https://images.unsplash.com/photo-1588724398354-45feb7e324c4?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Café, Metro Access, Lounge").active(true).build(),
                Station.builder().name("Aerocity EV Grand Central").address("Worldmark 1, Hospitality District, Aerocity, New Delhi").city("Delhi").latitude(28.5535).longitude(77.1215).parkingPricePerHour(70.0).chargingPricePerKwh(17.00).maxChargingSpeedKw(150.0).chargerTypes("CCS2, Type 2").totalSlots(12).rating(4.9).reviewCount(142).imageUrl("https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Airport Transit, Food Hall, Premium Lounge").active(true).build(),
                Station.builder().name("CyberHub FastCharge").address("DLF Cyber City, Sector 24, Gurugram").city("Gurugram").latitude(28.4950).longitude(77.0895).parkingPricePerHour(50.0).chargingPricePerKwh(15.00).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(10).rating(4.7).reviewCount(96).imageUrl("https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Restaurants, Cinepolis, Wi-Fi").active(true).build(),
                Station.builder().name("Noida Sector 18 Expressway Station").address("Wave Silver Tower, Sector 18, Noida").city("Noida").latitude(28.5708).longitude(77.3260).parkingPricePerHour(40.0).chargingPricePerKwh(14.00).maxChargingSpeedKw(60.0).chargerTypes("CCS2, Type 2").totalSlots(8).rating(4.5).reviewCount(58).imageUrl("https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Mall of India, Food Court, Parking").active(true).build(),

                // Yamuna Expressway & Delhi-Agra
                Station.builder().name("Jewar Airport Express EV Hub").address("Yamuna Expressway Interchange, Mile 38, Jewar").city("Jewar").latitude(28.1750).longitude(77.5850).parkingPricePerHour(40.0).chargingPricePerKwh(14.50).maxChargingSpeedKw(150.0).chargerTypes("CCS2, Type 2").totalSlots(10).rating(4.8).reviewCount(76).imageUrl("https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Highway Food Plaza, Highway Assistance, Restrooms").active(true).build(),
                Station.builder().name("Mathura Expressway Milestone 65").address("Expressway Rest Area Mile 65, Mathura").city("Mathura").latitude(27.4924).longitude(77.6737).parkingPricePerHour(35.0).chargingPricePerKwh(14.00).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(8).rating(4.6).reviewCount(64).imageUrl("https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Dhaba, EV Helpdesk, Clean Washrooms").active(true).build(),
                Station.builder().name("Agra Heritage HyperCharge").address("Fatehabad Road, Taj East Gate, Agra").city("Agra").latitude(27.1767).longitude(78.0081).parkingPricePerHour(50.0).chargingPricePerKwh(15.50).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(10).rating(4.7).reviewCount(91).imageUrl("https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Taj View Point, Cafe, Restrooms").active(true).build(),

                // Delhi - Jaipur (NH 48)
                Station.builder().name("Neemrana Highway King Hub").address("NH 48 Mile 122, Neemrana Industrial Area").city("Neemrana").latitude(27.9888).longitude(76.3883).parkingPricePerHour(35.0).chargingPricePerKwh(14.00).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(10).rating(4.6).reviewCount(85).imageUrl("https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Highway King Food Court, AC Lounge").active(true).build(),
                Station.builder().name("Behror Supercharger Plaza").address("NH 48 Highway Reststop, Behror").city("Behror").latitude(27.8860).longitude(76.2810).parkingPricePerHour(30.0).chargingPricePerKwh(13.50).maxChargingSpeedKw(60.0).chargerTypes("CCS2, Type 2").totalSlots(8).rating(4.4).reviewCount(42).imageUrl("https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Midway Motel, Food Plaza").active(true).build(),
                Station.builder().name("Pink City HyperCharge").address("MI Road, Near Panch Batti, Jaipur").city("Jaipur").latitude(26.9124).longitude(75.7873).parkingPricePerHour(50.0).chargingPricePerKwh(15.00).maxChargingSpeedKw(150.0).chargerTypes("CCS2, Type 2").totalSlots(12).rating(4.9).reviewCount(130).imageUrl("https://images.unsplash.com/photo-1571127236794-81c0bbfe1ce3?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Heritage Shopping, Lounge, Wi-Fi").active(true).build(),

                // Bengaluru - Chennai (NH 48)
                Station.builder().name("Electronic City Tech Oasis").address("Phase 1, Hosur Main Road, Bengaluru").city("Bengaluru").latitude(12.8452).longitude(77.6602).parkingPricePerHour(50.0).chargingPricePerKwh(15.50).maxChargingSpeedKw(150.0).chargerTypes("CCS2, Type 2").totalSlots(12).rating(4.9).reviewCount(180).imageUrl("https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Tech Park, Cafeteria, High-Speed Wi-Fi").active(true).build(),
                Station.builder().name("Hosur Expressway EV Plaza").address("Sipcot Industrial Complex, Hosur").city("Hosur").latitude(12.7409).longitude(77.8253).parkingPricePerHour(35.0).chargingPricePerKwh(13.50).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(8).rating(4.5).reviewCount(62).imageUrl("https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Food Court, Restrooms").active(true).build(),
                Station.builder().name("Krishnagiri SuperHub").address("NH 48 Toll Plaza Reststop, Krishnagiri").city("Krishnagiri").latitude(12.5186).longitude(78.2138).parkingPricePerHour(40.0).chargingPricePerKwh(14.00).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(10).rating(4.7).reviewCount(105).imageUrl("https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Saravana Bhavan, A2B Restaurant, Clean Restrooms").active(true).build(),
                Station.builder().name("Vellore Fort Reststop").address("Katpadi Main Road, Near Fort, Vellore").city("Vellore").latitude(12.9165).longitude(79.1325).parkingPricePerHour(35.0).chargingPricePerKwh(13.50).maxChargingSpeedKw(60.0).chargerTypes("CCS2, Type 2").totalSlots(8).rating(4.4).reviewCount(47).imageUrl("https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Coffee Shop, Restrooms").active(true).build(),
                Station.builder().name("Guindy MegaCharge").address("GST Road, Guindy Industrial Estate, Chennai").city("Chennai").latitude(13.0067).longitude(80.2023).parkingPricePerHour(60.0).chargingPricePerKwh(16.00).maxChargingSpeedKw(150.0).chargerTypes("CCS2, Type 2").totalSlots(12).rating(4.8).reviewCount(165).imageUrl("https://images.unsplash.com/photo-1571127236794-81c0bbfe1ce3?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Metro Hub, Lounge, Starbucks").active(true).build(),

                // Bengaluru - Mysuru Expressway
                Station.builder().name("Kengeri Metro EV Plaza").address("Mysore Road, Kengeri Satellite Town, Bengaluru").city("Bengaluru").latitude(12.9081).longitude(77.4842).parkingPricePerHour(40.0).chargingPricePerKwh(14.00).maxChargingSpeedKw(60.0).chargerTypes("CCS2, Type 2").totalSlots(8).rating(4.5).reviewCount(55).imageUrl("https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Metro Station, Restrooms").active(true).build(),
                Station.builder().name("Bidadi Express Foodstop").address("Bengaluru-Mysuru Expressway Km 32, Bidadi").city("Bidadi").latitude(12.7954).longitude(77.3828).parkingPricePerHour(40.0).chargingPricePerKwh(14.50).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(8).rating(4.6).reviewCount(88).imageUrl("https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Bidadi Thatte Idli, Coffee Hub, Lounge").active(true).build(),
                Station.builder().name("Mandya Sugar Corridor Charger").address("Expressway Reststop Km 85, Mandya").city("Mandya").latitude(12.5218).longitude(76.8951).parkingPricePerHour(35.0).chargingPricePerKwh(13.50).maxChargingSpeedKw(60.0).chargerTypes("CCS2, Type 2").totalSlots(8).rating(4.4).reviewCount(40).imageUrl("https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Highway Food Court, Restrooms").active(true).build(),
                Station.builder().name("Mysuru Palace EV Terminal").address("Mirza Road, Nazarbad, Mysuru").city("Mysuru").latitude(12.3051).longitude(76.6551).parkingPricePerHour(45.0).chargingPricePerKwh(15.00).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(10).rating(4.8).reviewCount(92).imageUrl("https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Palace View, Tourist Lounge, Cafeteria").active(true).build(),

                // Hyderabad - Bengaluru (NH 44)
                Station.builder().name("Gachibowli Cyber Hub").address("Financial District, Gachibowli, Hyderabad").city("Hyderabad").latitude(17.4401).longitude(78.3489).parkingPricePerHour(50.0).chargingPricePerKwh(15.50).maxChargingSpeedKw(150.0).chargerTypes("CCS2, Type 2").totalSlots(12).rating(4.8).reviewCount(140).imageUrl("https://images.unsplash.com/photo-1571127236794-81c0bbfe1ce3?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("IT Hub, Cafe, Premium Lounge").active(true).build(),
                Station.builder().name("Kurnool Highway Supercharger").address("NH 44 Bypass Toll, Kurnool").city("Kurnool").latitude(15.8281).longitude(78.0373).parkingPricePerHour(35.0).chargingPricePerKwh(14.00).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(8).rating(4.5).reviewCount(60).imageUrl("https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Express Food Court, Restrooms").active(true).build(),
                Station.builder().name("Anantapur EV Waypoint").address("NH 44 Highway Junction, Anantapur").city("Anantapur").latitude(14.6819).longitude(77.6006).parkingPricePerHour(35.0).chargingPricePerKwh(13.50).maxChargingSpeedKw(60.0).chargerTypes("CCS2, Type 2").totalSlots(8).rating(4.3).reviewCount(35).imageUrl("https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Highway Dhaba, Clean Restrooms").active(true).build(),
                Station.builder().name("Hebbal Expressway Hub").address("Bellary Road, Hebbal Flyover, Bengaluru").city("Bengaluru").latitude(13.0358).longitude(77.5970).parkingPricePerHour(50.0).chargingPricePerKwh(15.00).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(10).rating(4.7).reviewCount(118).imageUrl("https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Airport Expressway, Coffee Day").active(true).build(),

                // Western (Mumbai-Goa & Ahmedabad-Vadodara)
                Station.builder().name("Panvel Highway Fast Hub").address("Old Mumbai-Pune Highway, Panvel").city("Panvel").latitude(18.9890).longitude(73.1170).parkingPricePerHour(40.0).chargingPricePerKwh(14.00).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(10).rating(4.6).reviewCount(78).imageUrl("https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Food Plaza, EV Spares, Restrooms").active(true).build(),
                Station.builder().name("Chiplun Ghats Oasis").address("NH 66 Konkan Highway, Chiplun").city("Chiplun").latitude(17.5323).longitude(73.5189).parkingPricePerHour(35.0).chargingPricePerKwh(13.50).maxChargingSpeedKw(60.0).chargerTypes("CCS2, Type 2").totalSlots(8).rating(4.5).reviewCount(45).imageUrl("https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Valley View Restaurant, Restrooms").active(true).build(),
                Station.builder().name("Panaji Central EV Terminal").address("Patto Plaza, Panaji, Goa").city("Goa").latitude(15.4909).longitude(73.8278).parkingPricePerHour(50.0).chargingPricePerKwh(15.00).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(10).rating(4.8).reviewCount(120).imageUrl("https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Mandovi Riverfront, Beach Access, Cafes").active(true).build(),
                Station.builder().name("SG Highway EV Plaza").address("SG Highway, Thaltej, Ahmedabad").city("Ahmedabad").latitude(23.0338).longitude(72.5126).parkingPricePerHour(45.0).chargingPricePerKwh(14.50).maxChargingSpeedKw(150.0).chargerTypes("CCS2, Type 2").totalSlots(12).rating(4.8).reviewCount(115).imageUrl("https://images.unsplash.com/photo-1571127236794-81c0bbfe1ce3?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Shopping Mall, Multiplex, Wi-Fi").active(true).build(),
                Station.builder().name("Anand Express Food Hub").address("National Expressway 1, Anand Interchange").city("Anand").latitude(22.5645).longitude(72.9289).parkingPricePerHour(35.0).chargingPricePerKwh(13.50).maxChargingSpeedKw(60.0).chargerTypes("CCS2, Type 2").totalSlots(8).rating(4.5).reviewCount(52).imageUrl("https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Amul Dairy Lounge, Express Foodstop").active(true).build(),
                Station.builder().name("Sayajigunj HyperCharge").address("Station Road, Sayajigunj, Vadodara").city("Vadodara").latitude(22.3072).longitude(73.1812).parkingPricePerHour(40.0).chargingPricePerKwh(14.00).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(10).rating(4.7).reviewCount(84).imageUrl("https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Sayaji Baug, Commercial Hub, Restrooms").active(true).build(),

                // Eastern & Northern Metros
                Station.builder().name("Salt Lake Sector V TechCharge").address("College More, Sector V, Salt Lake, Kolkata").city("Kolkata").latitude(22.5867).longitude(88.4312).parkingPricePerHour(45.0).chargingPricePerKwh(14.50).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(10).rating(4.7).reviewCount(95).imageUrl("https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("IT Hub, Metro Gate 2, Cafe").active(true).build(),
                Station.builder().name("Durgapur Expressway Oasis").address("NH 19 Dankuni-Durgapur Expressway, Durgapur").city("Durgapur").latitude(23.5204).longitude(87.3119).parkingPricePerHour(35.0).chargingPricePerKwh(13.50).maxChargingSpeedKw(60.0).chargerTypes("CCS2, Type 2").totalSlots(8).rating(4.4).reviewCount(38).imageUrl("https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Highway Food Plaza, Restrooms").active(true).build(),
                Station.builder().name("Chandigarh Tribune Chowk EV Hub").address("Dakshin Marg, Industrial Area Phase 2, Chandigarh").city("Chandigarh").latitude(30.7046).longitude(76.8016).parkingPricePerHour(45.0).chargingPricePerKwh(14.00).maxChargingSpeedKw(120.0).chargerTypes("CCS2, Type 2").totalSlots(10).rating(4.8).reviewCount(88).imageUrl("https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80").openingHours("24/7 Open").amenities("Elante Mall Vicinity, Clean Washrooms, Wi-Fi").active(true).build()
        );

        for (Station st : panIndiaStations) {
            seedStationIfAbsent(st, user);
        }
        log.info("Verified and seeded Pan-India EV charging network stations with physical slots.");

        // 4. Seed Battery Telemetry
        if (batteryRepository.count() == 0) {
            BatteryTelemetry tel = BatteryTelemetry.builder()
                    .vehicle(vehicle)
                    .voltage(395.4)
                    .current(45.2)
                    .temperature(31.5)
                    .capacity(68.5)
                    .internalResistance(18.2)
                    .chargeCycles(340)
                    .chargingTime(65.0)
                    .dischargingTime(210.0)
                    .energyThroughput(2450.0)
                    .predictedSoh(91.4)
                    .predictedRulCycles(1240)
                    .healthStatus("GOOD")
                    .build();
            batteryRepository.save(tel);
            log.info("Seeded baseline EV battery telemetry for vehicle MH 12 EV 8899.");
        }

            log.info("SmartEV database initialization completed successfully.");
        } catch (Exception e) {
            log.warn("Database initialization check handled: {}", e.getMessage());
        }
    }

    private void seedStationIfAbsent(Station st, User user) {
        if (!stationRepository.existsByName(st.getName())) {
            Station savedSt = stationRepository.save(st);
            int slotCount = savedSt.getTotalSlots() != null ? savedSt.getTotalSlots() : 8;
            for (int i = 1; i <= slotCount; i++) {
                ParkingSlot slot = ParkingSlot.builder()
                        .station(savedSt)
                        .slotNumber("A" + i)
                        .chargerType(i <= Math.max(1, (int)(slotCount * 0.7)) ? "CCS2" : "Type 2")
                        .maxKw(i <= 2 ? savedSt.getMaxChargingSpeedKw() : Math.min(60.0, savedSt.getMaxChargingSpeedKw()))
                        .status(SlotStatus.AVAILABLE)
                        .build();
                slotRepository.save(slot);
            }
            Review rev = Review.builder()
                    .station(savedSt)
                    .user(user)
                    .rating(savedSt.getRating())
                    .comment("Excellent charging speed and clean facilities. App slot booking worked seamlessly!")
                    .aiSentiment("POSITIVE")
                    .build();
            reviewRepository.save(rev);
        }
    }
}
