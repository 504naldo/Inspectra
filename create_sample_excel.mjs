import XLSX from 'xlsx';

// Create Fire Extinguishers data
const fireExtinguishers = [
  { Location: "Main Lobby", Tag: "EXT-001", Type: "ABC 10lb", Status: "Good", Notes: "Near front entrance" },
  { Location: "Kitchen", Tag: "EXT-002", Type: "K-Class 6L", Status: "Good", Notes: "Next to stove" },
  { Location: "Electrical Room", Tag: "EXT-003", Type: "CO2 15lb", Status: "Good", Notes: "Wall mounted" },
  { Location: "Warehouse", Tag: "EXT-004", Type: "ABC 20lb", Status: "Good", Notes: "South wall" },
  { Location: "Warehouse", Tag: "EXT-005", Type: "ABC 20lb", Status: "Good", Notes: "North wall" },
  { Location: "Office Area", Tag: "EXT-006", Type: "ABC 5lb", Status: "Good", Notes: "Near exit door" },
  { Location: "Parking Garage", Tag: "EXT-007", Type: "ABC 10lb", Status: "Good", Notes: "Level 1" },
  { Location: "Parking Garage", Tag: "EXT-008", Type: "ABC 10lb", Status: "Good", Notes: "Level 2" },
  { Location: "Mechanical Room", Tag: "EXT-009", Type: "ABC 20lb", Status: "Good", Notes: "East side" },
  { Location: "Stairwell A", Tag: "EXT-010", Type: "ABC 10lb", Status: "Good", Notes: "Floor 1" },
  { Location: "Stairwell A", Tag: "EXT-011", Type: "ABC 10lb", Status: "Good", Notes: "Floor 2" },
  { Location: "Stairwell B", Tag: "EXT-012", Type: "ABC 10lb", Status: "Good", Notes: "Floor 1" },
  { Location: "Server Room", Tag: "EXT-013", Type: "CO2 10lb", Status: "Good", Notes: "Wall mounted" },
  { Location: "Loading Dock", Tag: "EXT-014", Type: "ABC 20lb", Status: "Good", Notes: "Near door" },
  { Location: "Break Room", Tag: "EXT-015", Type: "ABC 5lb", Status: "Good", Notes: "Above sink" },
];

// Create Emergency Lights data
const emergencyLights = [
  { Location: "Main Entrance", Tag: "LIGHT-001", Type: "Exit Sign LED", Status: "Good", Notes: "Above door" },
  { Location: "Main Entrance", Tag: "LIGHT-002", Type: "Emergency Light LED", Status: "Good", Notes: "Left side" },
  { Location: "Main Entrance", Tag: "LIGHT-003", Type: "Emergency Light LED", Status: "Good", Notes: "Right side" },
  { Location: "Corridor 1", Tag: "LIGHT-004", Type: "Exit Sign LED", Status: "Good", Notes: "End of hallway" },
  { Location: "Corridor 1", Tag: "LIGHT-005", Type: "Emergency Light LED", Status: "Good", Notes: "Mid hallway" },
  { Location: "Corridor 2", Tag: "LIGHT-006", Type: "Exit Sign LED", Status: "Good", Notes: "End of hallway" },
  { Location: "Corridor 2", Tag: "LIGHT-007", Type: "Emergency Light LED", Status: "Good", Notes: "Mid hallway" },
  { Location: "Stairwell A", Tag: "LIGHT-008", Type: "Exit Sign LED", Status: "Good", Notes: "Floor 1 entrance" },
  { Location: "Stairwell A", Tag: "LIGHT-009", Type: "Emergency Light LED", Status: "Good", Notes: "Floor 1 landing" },
  { Location: "Stairwell A", Tag: "LIGHT-010", Type: "Exit Sign LED", Status: "Good", Notes: "Floor 2 entrance" },
  { Location: "Stairwell A", Tag: "LIGHT-011", Type: "Emergency Light LED", Status: "Good", Notes: "Floor 2 landing" },
  { Location: "Stairwell B", Tag: "LIGHT-012", Type: "Exit Sign LED", Status: "Good", Notes: "Floor 1 entrance" },
  { Location: "Stairwell B", Tag: "LIGHT-013", Type: "Emergency Light LED", Status: "Good", Notes: "Floor 1 landing" },
  { Location: "Emergency Exit - East", Tag: "LIGHT-014", Type: "Exit Sign LED", Status: "Good", Notes: "Above door" },
  { Location: "Emergency Exit - East", Tag: "LIGHT-015", Type: "Emergency Light LED", Status: "Good", Notes: "Left side" },
  { Location: "Emergency Exit - West", Tag: "LIGHT-016", Type: "Exit Sign LED", Status: "Good", Notes: "Above door" },
  { Location: "Emergency Exit - West", Tag: "LIGHT-017", Type: "Emergency Light LED", Status: "Good", Notes: "Right side" },
  { Location: "Parking Garage Exit", Tag: "LIGHT-018", Type: "Exit Sign LED", Status: "Good", Notes: "Above door" },
  { Location: "Parking Garage", Tag: "LIGHT-019", Type: "Emergency Light LED", Status: "Good", Notes: "Level 1 center" },
  { Location: "Parking Garage", Tag: "LIGHT-020", Type: "Emergency Light LED", Status: "Good", Notes: "Level 2 center" },
  { Location: "Loading Dock", Tag: "LIGHT-021", Type: "Emergency Light LED", Status: "Good", Notes: "Near door" },
  { Location: "Warehouse", Tag: "LIGHT-022", Type: "Emergency Light LED", Status: "Good", Notes: "North section" },
  { Location: "Warehouse", Tag: "LIGHT-023", Type: "Emergency Light LED", Status: "Good", Notes: "South section" },
];

// Create workbook
const wb = XLSX.utils.book_new();

// Add Fire Extinguishers sheet
const wsExt = XLSX.utils.json_to_sheet(fireExtinguishers);
XLSX.utils.book_append_sheet(wb, wsExt, "Fire Extinguishers");

// Add Emergency Lights sheet
const wsLight = XLSX.utils.json_to_sheet(emergencyLights);
XLSX.utils.book_append_sheet(wb, wsLight, "Emergency Lights");

// Write file
XLSX.writeFile(wb, "/home/ubuntu/fire-inspect/sample_assets.xlsx");

console.log("✅ Sample Excel file created: /home/ubuntu/fire-inspect/sample_assets.xlsx");
console.log("   - Fire Extinguishers: 15 devices");
console.log("   - Emergency Lights: 23 devices");
