// Static demo data: a fictional Indian facility-services company. Every person, business,
// phone number and email here is invented; emails use example.com and phone numbers follow
// the Indian format with obviously fake digits.

export const organizationName = "Kaveri Facility Services Pvt Ltd";
export const demoPassword = "Password123!"; // same demo password as the base seed

export const staff = {
  admin: { name: "Meera Iyer", email: "meera.iyer@example.com" },
  ops: [
    { name: "Rohan Mehta", email: "rohan.mehta@example.com", cities: ["Bengaluru", "Hyderabad"] },
    { name: "Priya Nair", email: "priya.nair@example.com", cities: ["Mumbai", "Pune"] },
  ],
} as const;

export type City = "Bengaluru" | "Mumbai" | "Pune" | "Hyderabad";
export const states: Record<City, string> = {
  Bengaluru: "Karnataka",
  Mumbai: "Maharashtra",
  Pune: "Maharashtra",
  Hyderabad: "Telangana",
};

export const serviceAreas = [
  { name: "Bengaluru East", city: "Bengaluru", postalCodes: ["560066", "560037", "560048", "560103", "560087"] },
  { name: "Bengaluru South", city: "Bengaluru", postalCodes: ["560034", "560068", "560076", "560102", "560041"] },
  { name: "Mumbai Western Suburbs", city: "Mumbai", postalCodes: ["400053", "400058", "400050", "400064", "400076"] },
  { name: "Mumbai City", city: "Mumbai", postalCodes: ["400013", "400018", "400021", "400001"] },
  { name: "Pune", city: "Pune", postalCodes: ["411045", "411057", "411014", "411001", "411038"] },
  { name: "Hyderabad West", city: "Hyderabad", postalCodes: ["500081", "500032", "500033", "500034"] },
] as const;

export const skills = ["AC & HVAC", "Refrigeration", "Electrical & DG", "Plumbing & water", "Lifts & escalators", "Fire safety"] as const;
export type SkillName = (typeof skills)[number];

export const serviceTypes = [
  { key: "ac-repair", name: "AC breakdown repair", skill: "AC & HVAC", serviceCharge: "599.00", labourRatePerHour: "500.00", sacCode: "998719", description: "Cooling, leakage, noise or error-code faults on split and cassette ACs." },
  { key: "ac-service", name: "AC preventive service", skill: "AC & HVAC", serviceCharge: "799.00", labourRatePerHour: "400.00", sacCode: "998719", description: "Wet wash, coil cleaning, gas pressure and drain check." },
  { key: "hvac", name: "Chiller & VRF maintenance", skill: "AC & HVAC", serviceCharge: "2500.00", labourRatePerHour: "900.00", sacCode: "998717", description: "Central plant, VRF outdoor units and AHUs." },
  { key: "refrigeration", name: "Refrigeration repair", skill: "Refrigeration", serviceCharge: "999.00", labourRatePerHour: "650.00", sacCode: "998717", description: "Cold rooms, commercial and medical refrigerators." },
  { key: "dg", name: "DG set service", skill: "Electrical & DG", serviceCharge: "1500.00", labourRatePerHour: "800.00", sacCode: "998717", description: "Diesel generator breakdowns and periodic service." },
  { key: "electrical", name: "UPS & electrical repair", skill: "Electrical & DG", serviceCharge: "699.00", labourRatePerHour: "600.00", sacCode: "998719", description: "UPS, panels, MCB tripping and wiring faults." },
  { key: "lift-breakdown", name: "Lift breakdown call", skill: "Lifts & escalators", serviceCharge: "1999.00", labourRatePerHour: "1000.00", sacCode: "998718", description: "Stuck cars, door faults and controller errors." },
  { key: "lift-pm", name: "Lift preventive maintenance", skill: "Lifts & escalators", serviceCharge: "1499.00", labourRatePerHour: "800.00", sacCode: "998718", description: "Monthly safety and lubrication round." },
  { key: "plumbing", name: "Plumbing & water system repair", skill: "Plumbing & water", serviceCharge: "399.00", labourRatePerHour: "350.00", sacCode: "998719", description: "Pumps, geysers, leaks and pressure problems." },
  { key: "ro", name: "RO purifier service", skill: "Plumbing & water", serviceCharge: "349.00", labourRatePerHour: "300.00", sacCode: "998715", description: "Filter and membrane change, TDS check." },
  { key: "fire", name: "Fire system inspection", skill: "Fire safety", serviceCharge: "1800.00", labourRatePerHour: "700.00", sacCode: "998719", description: "Fire pumps, hydrants, sprinklers and alarm panels." },
] as const;
export type ServiceTypeKey = (typeof serviceTypes)[number]["key"];

export const technicians = [
  { name: "Suresh Kumar", email: "suresh.kumar@example.com", city: "Bengaluru", areas: ["Bengaluru East", "Bengaluru South"], skills: ["AC & HVAC", "Refrigeration"], van: "KA-03-MX-1101" },
  { name: "Manjunath Gowda", email: "manjunath.gowda@example.com", city: "Bengaluru", areas: ["Bengaluru East", "Bengaluru South"], skills: ["Electrical & DG", "Lifts & escalators"], van: "KA-03-MX-1102" },
  { name: "Imran Pasha", email: "imran.pasha@example.com", city: "Bengaluru", areas: ["Bengaluru East"], skills: ["Plumbing & water", "Fire safety", "AC & HVAC"], van: "KA-03-MX-1103" },
  { name: "Deepa Shetty", email: "deepa.shetty@example.com", city: "Bengaluru", areas: ["Bengaluru South"], skills: ["AC & HVAC", "Electrical & DG", "Plumbing & water"], van: "KA-03-MX-1104" },
  { name: "Vikram Patil", email: "vikram.patil@example.com", city: "Mumbai", areas: ["Mumbai Western Suburbs", "Mumbai City"], skills: ["AC & HVAC", "Refrigeration", "Electrical & DG"], van: "MH-02-QX-2201" },
  { name: "Sachin Pawar", email: "sachin.pawar@example.com", city: "Mumbai", areas: ["Mumbai Western Suburbs", "Mumbai City"], skills: ["Lifts & escalators", "Fire safety", "Electrical & DG"], van: "MH-02-QX-2202" },
  { name: "Anil Gaikwad", email: "anil.gaikwad@example.com", city: "Mumbai", areas: ["Mumbai Western Suburbs", "Mumbai City"], skills: ["Plumbing & water", "AC & HVAC", "Refrigeration"], van: "MH-02-QX-2203" },
  { name: "Rohit Jadhav", email: "rohit.jadhav@example.com", city: "Pune", areas: ["Pune"], skills: ["AC & HVAC", "Plumbing & water", "Refrigeration"], van: "MH-12-PX-3301" },
  { name: "Ganesh More", email: "ganesh.more@example.com", city: "Pune", areas: ["Pune"], skills: ["Electrical & DG", "Lifts & escalators", "Fire safety"], van: "MH-12-PX-3302" },
  { name: "Ravi Teja", email: "ravi.teja@example.com", city: "Hyderabad", areas: ["Hyderabad West"], skills: ["AC & HVAC", "Refrigeration", "Plumbing & water"], van: "TS-09-HX-4401" },
  { name: "Abdul Rahman", email: "abdul.rahman@example.com", city: "Hyderabad", areas: ["Hyderabad West"], skills: ["Electrical & DG", "Lifts & escalators", "Fire safety"], van: "TS-09-HX-4402" },
] as const;
export type TechnicianSeed = (typeof technicians)[number] & { city: City; skills: readonly SkillName[] };

export type Equipment = {
  type: string;
  serviceTypes: ServiceTypeKey[];
  models: string[];
  serialPrefix: string;
  parts: string[];
  problems: string[];
  diagnosis: string[];
  work: string[];
};

export const equipment: Record<string, Equipment> = {
  splitAc: {
    type: "Split AC",
    serviceTypes: ["ac-repair", "ac-repair", "ac-service"],
    models: ["Daikin FTKF50 1.5T Inverter", "Voltas 183V Vectra 1.5T", "Blue Star IC318 1.5T", "LG RS-Q19 2T Dual Inverter"],
    serialPrefix: "SAC",
    parts: ["FLT-AC-STD", "CAP-35UF", "GAS-R32-1KG", "MTR-FAN-IDU", "PCB-AC-INV"],
    problems: [
      "AC is running but not cooling; room stays at 29°C.",
      "Water dripping from the indoor unit onto the wall.",
      "Indoor unit shows error code U4 and switches off.",
      "Loud rattling noise from the outdoor unit at night.",
      "AC trips the MCB a few minutes after starting.",
    ],
    diagnosis: [
      "Low refrigerant pressure; flare joint leak at the outdoor unit.",
      "Drain pipe choked with algae; indoor coil dirty.",
      "Communication fault between indoor and outdoor PCB.",
      "Run capacitor weak (18 µF against 35 µF rated).",
      "Outdoor fan mounting loose, blade touching the guard.",
    ],
    work: [
      "Fixed the flare leak, vacuumed and recharged R32; outlet air now 12°C.",
      "Cleared the drain line, jet-washed the coil and filters, tested for 30 minutes.",
      "Replaced the run capacitor and verified compressor current.",
      "Tightened the fan mount, balanced the blade and cleaned the condenser.",
      "Reseated the interconnect cable, replaced the indoor PCB and checked all modes.",
    ],
  },
  cassetteAc: {
    type: "Cassette AC",
    serviceTypes: ["ac-repair", "ac-service"],
    models: ["Daikin FCQ60 Cassette 5T", "Blue Star 4-way Cassette 3T"],
    serialPrefix: "CAC",
    parts: ["FLT-AC-STD", "CAP-35UF", "GAS-R32-1KG", "CNT-32A"],
    problems: ["Cassette unit in the reception is blowing warm air.", "Condensate pump alarm on the cassette unit; water marks on the false ceiling."],
    diagnosis: ["Contactor contacts pitted; compressor not engaging.", "Condensate pump float stuck."],
    work: ["Replaced the contactor, checked the compressor and gas pressure.", "Cleaned the condensate tray and freed the float switch; tested drainage."],
  },
  vrf: {
    type: "VRF system",
    serviceTypes: ["hvac", "hvac", "ac-repair"],
    models: ["Daikin VRV X 16HP", "Mitsubishi City Multi 12HP", "Hitachi Set Free Sigma 14HP"],
    serialPrefix: "VRF",
    parts: ["FLT-AC-STD", "CNT-32A", "GAS-R32-1KG"],
    problems: ["Third-floor indoor units not cooling; VRF outdoor shows E3.", "High head pressure alarm on the VRF outdoor unit during afternoons."],
    diagnosis: ["Expansion valve on the 3F branch stuck closed.", "Condenser coils clogged with dust; fan motor drawing high current."],
    work: ["Freed and tested the EEV, rebalanced the branch and checked superheat.", "Chemical-cleaned the condenser coils and replaced the fan contactor."],
  },
  chiller: {
    type: "Chiller",
    serviceTypes: ["hvac"],
    models: ["Carrier 30XW 250TR Screw Chiller", "Trane RTWD 180TR"],
    serialPrefix: "CHL",
    parts: ["CNT-32A", "FLT-AC-STD"],
    problems: ["Chilled water outlet at 11°C instead of 7°C; OT temperatures rising.", "Chiller tripping on low refrigerant pressure at night."],
    diagnosis: ["Condenser tubes scaled; approach temperature 6°C.", "Low-pressure switch faulty; refrigerant level normal."],
    work: ["Brushed the condenser tubes and treated the water; approach now 2°C.", "Replaced the LP switch and logged readings for two hours."],
  },
  dg: {
    type: "DG set",
    serviceTypes: ["dg"],
    models: ["Kirloskar KG1-125 125 kVA", "Cummins C62.5D5 62.5 kVA", "Mahindra Powerol 82.5 kVA"],
    serialPrefix: "DG",
    parts: ["DG-FF-01", "DG-OF-01", "DG-OIL-15W40"],
    problems: [
      "DG set not starting during the power cut; battery seems fine.",
      "DG is smoking black under load and the society is complaining.",
      "Periodic 250-hour service due on the DG set.",
    ],
    diagnosis: ["Fuel filter clogged; air in the fuel line.", "Air filter choked and injectors need cleaning.", "250-hour service: oil and filters at end of life."],
    work: ["Replaced the fuel filter, bled the line and ran a 30-minute load test.", "Cleaned the air filter and injectors; smoke clear at 70% load.", "Changed engine oil, oil and fuel filters; checked coolant and belts."],
  },
  ups: {
    type: "UPS",
    serviceTypes: ["electrical"],
    models: ["APC Smart-UPS SRT 10kVA", "Eaton 9E 20kVA", "Microtek Online 6kVA"],
    serialPrefix: "UPS",
    parts: ["UPS-BAT-12V", "CNT-32A"],
    problems: ["UPS is beeping and backup lasts only five minutes.", "Server room UPS switched to bypass on its own."],
    diagnosis: ["Four batteries in the string below 10.5 V under load.", "Inverter overheating; cooling fan seized."],
    work: ["Replaced the weak batteries and ran a discharge test.", "Replaced the cooling fan, cleaned the cabinet and returned the UPS to online mode."],
  },
  panel: {
    type: "Electrical panel",
    serviceTypes: ["electrical"],
    models: ["Schneider Main LT Panel 800A", "L&T Distribution Board 250A"],
    serialPrefix: "PNL",
    parts: ["CNT-32A"],
    problems: ["Common-area lights MCB tripping every evening.", "Burning smell near the main LT panel."],
    diagnosis: ["Earth leakage on the basement lighting circuit.", "Loose busbar connection causing heat."],
    work: ["Isolated and repaired the damaged basement cable; IR values normal.", "Re-torqued the busbar connections and replaced the scorched contactor."],
  },
  lift: {
    type: "Passenger lift",
    serviceTypes: ["lift-breakdown", "lift-breakdown", "lift-pm"],
    models: ["Otis Gen2 8-passenger", "Schindler 3300 10-passenger", "Kone MonoSpace 500", "Johnson Lifts 13-passenger"],
    serialPrefix: "LFT",
    parts: ["LFT-DS-01", "LFT-RL-01"],
    problems: [
      "Lift stuck between the 3rd and 4th floor; alarm bell works, nobody inside now.",
      "Lift doors reopen repeatedly and the car does not move.",
      "Jerk while stopping at the ground floor.",
      "Monthly lift maintenance visit due.",
    ],
    diagnosis: ["Door lock contact misaligned on 4F landing.", "Door safety edge sensor faulty.", "Brake lining worn; levelling off by 3 cm.", "Monthly round: rollers worn, guide rails need lubrication."],
    work: ["Realigned the landing door lock and tested all floors.", "Replaced the door safety sensor and tested 20 cycles.", "Adjusted the brake and levelling; ride quality normal.", "Lubricated the rails, replaced the door rollers and checked safety circuits."],
  },
  pump: {
    type: "Water pump",
    serviceTypes: ["plumbing"],
    models: ["Kirloskar Star-1 1HP", "CRI 3HP Openwell", "Grundfos CM5 Booster"],
    serialPrefix: "PMP",
    parts: ["PMP-SEAL-01", "CNT-32A"],
    problems: ["Overhead tank not filling; pump runs but no water.", "Booster pump leaking from the shaft."],
    diagnosis: ["Foot valve stuck; pump losing prime.", "Mechanical seal worn."],
    work: ["Replaced the foot valve and primed the pump; tank filled in 40 minutes.", "Replaced the mechanical seal and tested pressure at 3 bar."],
  },
  geyser: {
    type: "Water heater",
    serviceTypes: ["plumbing"],
    models: ["Racold Omnis 25L", "AO Smith HSE-VAS 15L", "Bajaj New Shakti 25L"],
    serialPrefix: "GYS",
    parts: ["GYS-ELM-2KW", "GYS-THM"],
    problems: ["Geyser not heating at all since yesterday.", "Geyser trips the MCB when switched on."],
    diagnosis: ["Heating element burnt out.", "Thermostat shorted to body."],
    work: ["Replaced the heating element and descaled the tank.", "Replaced the thermostat and checked earthing."],
  },
  ro: {
    type: "RO purifier",
    serviceTypes: ["ro"],
    models: ["Kent Grand Plus 8L", "Aquaguard Aura RO+UV", "Livpure Glo Star"],
    serialPrefix: "RO",
    parts: ["RO-SED-10", "RO-MEM-80"],
    problems: ["RO water tastes salty; TDS meter shows 240.", "RO purifier makes noise but very slow output."],
    diagnosis: ["RO membrane exhausted.", "Sediment filter choked."],
    work: ["Replaced the RO membrane and sediment filter; output TDS 45.", "Replaced the sediment pre-filter and sanitised the tank."],
  },
  fridgeCommercial: {
    type: "Commercial refrigerator",
    serviceTypes: ["refrigeration"],
    models: ["Western 4-door Upright Chiller", "Elanpro Visi Cooler 600L", "Blue Star Deep Freezer 500L"],
    serialPrefix: "CRF",
    parts: ["REF-THM-DIG", "CAP-35UF", "GAS-R32-1KG"],
    problems: ["Kitchen chiller is at 12°C; stock at risk.", "Deep freezer compressor clicking on and off."],
    diagnosis: ["Digital controller probe faulty.", "Start capacitor failed."],
    work: ["Replaced the controller and probe; holding 3°C.", "Replaced the start capacitor and checked amperage."],
  },
  medicalFridge: {
    type: "Medical refrigerator",
    serviceTypes: ["refrigeration"],
    models: ["Haier HYC-390 Pharmacy Refrigerator", "Vestfrost MKS 144 Vaccine Fridge"],
    serialPrefix: "MRF",
    parts: ["REF-THM-DIG"],
    problems: ["Vaccine fridge alarm: temperature 9°C.", "Pharmacy refrigerator display blank."],
    diagnosis: ["Door gasket torn; controller drifting.", "Controller board power supply failed."],
    work: ["Replaced the gasket and recalibrated the controller to 2–8°C.", "Replaced the controller and verified the logger for an hour."],
  },
  coldRoom: {
    type: "Cold room",
    serviceTypes: ["refrigeration"],
    models: ["Blue Star Cold Room 12 m³", "Rinac Walk-in Chiller"],
    serialPrefix: "CLD",
    parts: ["REF-THM-DIG", "GAS-R32-1KG"],
    problems: ["Cold room temperature rising above 8°C in the afternoon."],
    diagnosis: ["Evaporator iced up; defrost heater not working."],
    work: ["Replaced the defrost timer, cleared the ice and topped up refrigerant."],
  },
  firePump: {
    type: "Fire pump",
    serviceTypes: ["fire"],
    models: ["Kirloskar Fire Hydrant Pump 50HP", "Mather+Platt Jockey Pump 10HP"],
    serialPrefix: "FPM",
    parts: ["FIRE-PG-01", "PMP-SEAL-01"],
    problems: ["Jockey pump starting every few minutes; pressure dropping overnight.", "Quarterly fire system inspection due before the fire NOC renewal."],
    diagnosis: ["Pressure gauge faulty and a hydrant valve passing.", "Inspection: two sprinkler heads painted over."],
    work: ["Replaced the pressure gauge, serviced the hydrant valve; pressure steady.", "Replaced two sprinkler heads and completed the inspection checklist."],
  },
  fireAlarm: {
    type: "Fire alarm panel",
    serviceTypes: ["fire"],
    models: ["Honeywell Notifier NFS2", "Ravel RE-108 8-zone"],
    serialPrefix: "FAP",
    parts: ["FIRE-SPK-68"],
    problems: ["Fire alarm panel showing a zone 4 fault."],
    diagnosis: ["Smoke detector in the 4F corridor contaminated."],
    work: ["Cleaned and tested the detectors on zone 4; panel healthy."],
  },
};

export const parts = [
  { sku: "FLT-AC-STD", name: "AC air filter (split/cassette)", unitPrice: "350.00", reorderLevel: 12 },
  { sku: "CAP-35UF", name: "Run capacitor 35 µF", unitPrice: "450.00", reorderLevel: 10 },
  { sku: "GAS-R32-1KG", name: "R32 refrigerant, 1 kg", unitPrice: "1800.00", reorderLevel: 8 },
  { sku: "PCB-AC-INV", name: "Inverter AC indoor PCB", unitPrice: "6500.00", reorderLevel: 2 },
  { sku: "MTR-FAN-IDU", name: "Indoor fan motor", unitPrice: "3200.00", reorderLevel: 3 },
  { sku: "CNT-32A", name: "Contactor 32 A", unitPrice: "1150.00", reorderLevel: 6 },
  { sku: "RO-MEM-80", name: "RO membrane 80 GPD", unitPrice: "2400.00", reorderLevel: 6 },
  { sku: "RO-SED-10", name: "Sediment filter 10 in", unitPrice: "250.00", reorderLevel: 15 },
  { sku: "GYS-ELM-2KW", name: "Geyser heating element 2 kW", unitPrice: "650.00", reorderLevel: 6 },
  { sku: "GYS-THM", name: "Geyser thermostat", unitPrice: "480.00", reorderLevel: 6 },
  { sku: "DG-FF-01", name: "DG fuel filter", unitPrice: "950.00", reorderLevel: 6 },
  { sku: "DG-OF-01", name: "DG oil filter", unitPrice: "780.00", reorderLevel: 6 },
  { sku: "DG-OIL-15W40", name: "Engine oil 15W-40, 5 L", unitPrice: "2350.00", reorderLevel: 5 },
  { sku: "UPS-BAT-12V", name: "UPS SMF battery 12 V 26 Ah", unitPrice: "5400.00", reorderLevel: 8 },
  { sku: "LFT-DS-01", name: "Lift door safety sensor", unitPrice: "8500.00", reorderLevel: 2 },
  { sku: "LFT-RL-01", name: "Lift door roller set", unitPrice: "1600.00", reorderLevel: 4 },
  { sku: "FIRE-SPK-68", name: "Sprinkler head 68 °C", unitPrice: "420.00", reorderLevel: 20 },
  { sku: "FIRE-PG-01", name: "Fire line pressure gauge", unitPrice: "1250.00", reorderLevel: 4 },
  { sku: "REF-THM-DIG", name: "Digital temperature controller", unitPrice: "2900.00", reorderLevel: 3 },
  { sku: "PMP-SEAL-01", name: "Pump mechanical seal", unitPrice: "1100.00", reorderLevel: 5 },
] as const;

type Kind = "home" | "apartments" | "hospital" | "office" | "restaurant" | "school" | "lab" | "retail";

export type CustomerSeed = {
  name: string;
  kind: Kind;
  city: City;
  postalCode: string;
  line1: string;
  line2: string;
  contact: string;
  secondContact?: string;
  assets: (keyof typeof equipment)[];
};

// Asset mixes by kind of site; a customer gets the listed equipment (with counts).
export const customers: CustomerSeed[] = [
  { name: "Greenwood Heights Apartment Owners' Association", kind: "apartments", city: "Bengaluru", postalCode: "560066", line1: "Greenwood Heights, ITPL Main Road", line2: "Whitefield", contact: "Ananya Rao", secondContact: "Venkatesh Murthy", assets: ["lift", "lift", "dg", "pump", "firePump"] },
  { name: "Sanjeevani Multispeciality Hospital", kind: "hospital", city: "Bengaluru", postalCode: "560034", line1: "14, 80 Feet Road, 4th Block", line2: "Koramangala", contact: "Dr. Kavitha Menon", secondContact: "Naveen Hegde", assets: ["chiller", "vrf", "dg", "ups", "medicalFridge"] },
  { name: "Nimbus Tech Park — Block B", kind: "office", city: "Bengaluru", postalCode: "560103", line1: "Nimbus Tech Park, Outer Ring Road", line2: "Bellandur", contact: "Arjun Krishnan", assets: ["vrf", "ups", "dg", "lift"] },
  { name: "Ananya & Vivek Rao", kind: "home", city: "Bengaluru", postalCode: "560102", line1: "221, 17th Cross, Sector 7", line2: "HSR Layout", contact: "Vivek Rao", assets: ["splitAc", "splitAc", "geyser", "ro"] },
  { name: "Lakshmi Iyer", kind: "home", city: "Bengaluru", postalCode: "560041", line1: "36, 9th Main, 4th T Block", line2: "Jayanagar", contact: "Lakshmi Iyer", assets: ["splitAc", "geyser", "ro"] },
  { name: "Filter Kaapi Café", kind: "restaurant", city: "Bengaluru", postalCode: "560034", line1: "7, 5th Block, 1st Cross", line2: "Koramangala", contact: "Prakash Shenoy", assets: ["fridgeCommercial", "coldRoom", "splitAc"] },
  { name: "Brightpath International School", kind: "school", city: "Bengaluru", postalCode: "560087", line1: "Survey No. 42, Gunjur Road", line2: "Varthur", contact: "Sunita D'Souza", assets: ["splitAc", "ro", "dg", "firePump"] },
  { name: "Orchid Residency RWA", kind: "apartments", city: "Bengaluru", postalCode: "560068", line1: "Orchid Residency, Hosur Road", line2: "Bommanahalli", contact: "Ramesh Babu", assets: ["lift", "pump", "dg"] },
  { name: "Vriksha Diagnostics Lab", kind: "lab", city: "Bengaluru", postalCode: "560037", line1: "2nd Floor, Marathahalli Bridge Road", line2: "Marathahalli", contact: "Shalini Prasad", assets: ["medicalFridge", "ups", "splitAc"] },
  { name: "Karthik Reddy", kind: "home", city: "Bengaluru", postalCode: "560048", line1: "Flat 1204, Tower 3, Sunrise Meadows", line2: "Mahadevapura", contact: "Karthik Reddy", assets: ["splitAc", "ro"] },
  { name: "Raghav Menon", kind: "home", city: "Bengaluru", postalCode: "560076", line1: "18, Arekere Main Road", line2: "BTM 4th Stage", contact: "Raghav Menon", assets: ["splitAc", "geyser"] },
  { name: "Sea Breeze Co-operative Housing Society", kind: "apartments", city: "Mumbai", postalCode: "400050", line1: "Sea Breeze CHS, Carter Road", line2: "Bandra West", contact: "Farhan Merchant", secondContact: "Nandini Kapoor", assets: ["lift", "lift", "pump", "firePump"] },
  { name: "Arogya Heart Institute", kind: "hospital", city: "Mumbai", postalCode: "400053", line1: "Plot 9, Veera Desai Road", line2: "Andheri West", contact: "Dr. Sameer Kulkarni", secondContact: "Jyoti Sawant", assets: ["chiller", "vrf", "dg", "ups", "medicalFridge"] },
  { name: "Meridian Business Centre", kind: "office", city: "Mumbai", postalCode: "400013", line1: "Meridian House, Senapati Bapat Marg", line2: "Lower Parel", contact: "Neha Agarwal", assets: ["vrf", "ups", "lift", "fireAlarm"] },
  { name: "Harbourview Towers CHS", kind: "apartments", city: "Mumbai", postalCode: "400018", line1: "Harbourview Towers, Dr. Annie Besant Road", line2: "Worli", contact: "Cyrus Batliwala", assets: ["lift", "dg", "pump"] },
  { name: "Rahul & Sneha Kulkarni", kind: "home", city: "Mumbai", postalCode: "400076", line1: "B-702, Lakeside Enclave, Hiranandani Gardens", line2: "Powai", contact: "Sneha Kulkarni", assets: ["splitAc", "geyser", "ro"] },
  { name: "Spice Route Restaurant", kind: "restaurant", city: "Mumbai", postalCode: "400001", line1: "12, Kala Ghoda, Rampart Row", line2: "Fort", contact: "Joseph Fernandes", assets: ["coldRoom", "fridgeCommercial", "cassetteAc"] },
  { name: "Fatima Sheikh", kind: "home", city: "Mumbai", postalCode: "400064", line1: "C-11, Evershine Nagar", line2: "Malad West", contact: "Fatima Sheikh", assets: ["splitAc", "ro"] },
  { name: "Zenith Coworking", kind: "office", city: "Mumbai", postalCode: "400021", line1: "9th Floor, Maker Chambers", line2: "Nariman Point", contact: "Aditi Bhatt", assets: ["cassetteAc", "cassetteAc", "ups"] },
  { name: "Shree Ganesh Textiles", kind: "office", city: "Mumbai", postalCode: "400058", line1: "Unit 4, Andheri Industrial Estate", line2: "Andheri", contact: "Mahesh Shah", assets: ["panel", "splitAc", "dg"] },
  { name: "Tranquil Spa & Wellness", kind: "retail", city: "Mumbai", postalCode: "400050", line1: "Shop 3, Hill Road", line2: "Bandra West", contact: "Rhea D'Mello", assets: ["splitAc", "geyser", "geyser"] },
  { name: "Riverside Greens Society", kind: "apartments", city: "Pune", postalCode: "411045", line1: "Riverside Greens, Baner–Pashan Link Road", line2: "Baner", contact: "Sanjay Deshmukh", secondContact: "Pooja Kale", assets: ["lift", "lift", "dg", "firePump"] },
  { name: "Sahyadri Care Hospital", kind: "hospital", city: "Pune", postalCode: "411038", line1: "Karve Road", line2: "Kothrud", contact: "Dr. Anjali Phadke", assets: ["vrf", "dg", "ups", "medicalFridge"] },
  { name: "Infinity IT Park — Tower 3", kind: "office", city: "Pune", postalCode: "411057", line1: "Phase 2, Rajiv Gandhi Infotech Park", line2: "Hinjewadi", contact: "Nikhil Joshi", assets: ["chiller", "ups", "dg", "lift"] },
  { name: "Aditya Deshpande", kind: "home", city: "Pune", postalCode: "411014", line1: "A-5, Konark Nagar", line2: "Viman Nagar", contact: "Aditya Deshpande", assets: ["splitAc", "geyser", "ro"] },
  { name: "Hotel Deccan Residency", kind: "restaurant", city: "Pune", postalCode: "411001", line1: "5, Moledina Road", line2: "Camp", contact: "Farokh Irani", assets: ["coldRoom", "splitAc", "geyser", "lift"] },
  { name: "Kavya Joshi", kind: "home", city: "Pune", postalCode: "411045", line1: "Flat 803, Sai Srishti", line2: "Baner", contact: "Kavya Joshi", assets: ["splitAc", "ro"] },
  { name: "Pune Fresh Mart", kind: "retail", city: "Pune", postalCode: "411014", line1: "Ground Floor, Phoenix Road", line2: "Viman Nagar", contact: "Amit Bhosale", assets: ["fridgeCommercial", "coldRoom", "dg"] },
  { name: "Lotus Pond Residency", kind: "apartments", city: "Hyderabad", postalCode: "500033", line1: "Road No. 36", line2: "Jubilee Hills", contact: "Padma Reddy", secondContact: "Kiran Varma", assets: ["lift", "dg", "firePump"] },
  { name: "Nizam Care Hospital", kind: "hospital", city: "Hyderabad", postalCode: "500034", line1: "Road No. 12", line2: "Banjara Hills", contact: "Dr. Farah Hussain", assets: ["chiller", "dg", "ups", "medicalFridge", "lift"] },
  { name: "Cyberpearl Office Suites", kind: "office", city: "Hyderabad", postalCode: "500081", line1: "Cyber Towers Lane, Hitec City", line2: "Madhapur", contact: "Sravani Chowdary", assets: ["vrf", "ups", "lift"] },
  { name: "Srinivas Rao", kind: "home", city: "Hyderabad", postalCode: "500032", line1: "Villa 22, Silver Oaks", line2: "Gachibowli", contact: "Srinivas Rao", assets: ["splitAc", "splitAc", "ro"] },
  { name: "Biryani House Kitchens", kind: "restaurant", city: "Hyderabad", postalCode: "500034", line1: "8-2-293, Road No. 3", line2: "Banjara Hills", contact: "Syed Azhar", assets: ["coldRoom", "fridgeCommercial", "splitAc"] },
  { name: "Mohammed Imran", kind: "home", city: "Hyderabad", postalCode: "500081", line1: "Flat 506, My Home Abhra", line2: "Madhapur", contact: "Mohammed Imran", assets: ["splitAc", "geyser"] },
  { name: "Deccan Pharma R&D Lab", kind: "lab", city: "Hyderabad", postalCode: "500032", line1: "Plot 31, Financial District", line2: "Gachibowli", contact: "Dr. Raghunath Sastry", assets: ["medicalFridge", "medicalFridge", "ups", "dg"] },
];

export const rejectReasons = [
  "Duplicate of a request already being handled.",
  "This equipment is under the manufacturer's warranty; please contact the brand service centre.",
  "Site is outside our service area.",
];

export const needInfoMessages = [
  "Please share the model number and a photo of the error code on the display.",
  "Which tower and floor is the lift in? Please confirm a contact on site.",
  "Is the unit completely dead or does the display come on?",
];

export const customerReplies = [
  "Model is on the sticker: see photo. Error shows E4 and the unit switches off after 2 minutes.",
  "Tower B, lift 2. Security supervisor Mr. Gupta will be on site from 9 am.",
];

export const feedbackComments = {
  great: [
    "Very professional, explained the problem clearly and cleaned up afterwards.",
    "Came on time and fixed it in one visit. Thank you!",
    "Excellent service. The technician wore shoe covers and was very polite.",
    "Quick response for an emergency call. Much appreciated.",
    "Good work, the AC is cooling much better now.",
  ],
  ok: ["Work was fine but the technician arrived an hour late.", "Problem solved, though it needed two visits."],
  poor: ["Had to wait three days for the part. Please keep common parts on the van.", "Issue came back after a week; not happy."],
};

export const followUpReasons = [
  "Customer not available; flat locked when I reached.",
  "Society needs written permission for terrace access to the outdoor unit.",
  "Power shutdown in the building; could not test after the repair.",
];

export const cancelReasons = ["Customer asked to cancel — issue resolved itself.", "Customer travelling; will raise a new request.", "Duplicate visit booked by mistake."];
export const rescheduleReasons = ["Customer requested an evening slot.", "Technician pulled into an emergency call nearby.", "Society allows contractor entry only after 11 am."];
export const declineReasons = ["On leave that day; please reassign.", "Not trained on this lift model."];
export const reassignReasons = ["Better skill match for this equipment.", "Original technician on sick leave."];
