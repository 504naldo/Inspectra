# Sprinkler ITM Module - Database Schema Design

## Overview
Based on Excel template tabs: "Sprinkler Systems", "Sprinkler Report", "Sprinkler Devices"

## Tables

### 1. sprinklerInspections
Main inspection record linking to a job

```typescript
{
  id: number (PK)
  jobId: number (FK → jobs.id)
  inspectionDate: timestamp
  buildingId: string
  status: enum('draft', 'finalized')
  finalizedAt: timestamp | null
  finalizedBy: number | null (FK → users.id)
  createdAt: timestamp
  updatedAt: timestamp
}
```

### 2. sprinklerSystems
System summary grid (up to 6 systems per inspection)

```typescript
{
  id: number (PK)
  inspectionId: number (FK → sprinklerInspections.id)
  systemNumber: number (1-6)
  
  // System type (one of these will be true)
  isWet: boolean
  isDryPipePartialTest: boolean
  isDryPipeFullFlowTest: boolean
  isDeluge: boolean
  isPreaction: boolean
  isOther: boolean
  otherDescription: string | null
  
  // Dates
  dateOfLastFullFlowTest: date | null
  dateOfLast5YearInternal: date | null
  
  // System details
  areaOfCoverage: string | null
  size: string | null
  manufacturer: string | null
  model: string | null
  
  // Pressures
  systemWaterPressure: string | null
  supplyWaterPressure: string | null
  residualPressure: string | null
  systemAirPressure: string | null
  lowAirSwitchCutIn: string | null
  tripPressure: string | null
  
  createdAt: timestamp
  updatedAt: timestamp
}
```

### 3. sprinklerChecklistItems
Checklist questions with YES/NO/NA responses

```typescript
{
  id: number (PK)
  inspectionId: number (FK → sprinklerInspections.id)
  section: string ('General', 'Dry Systems', 'Control Valves', 'Water Supplies', 'Wet System', 'Alarms', 'Sprinkler Piping')
  questionText: text
  questionOrder: number
  
  // Response
  response: enum('YES', 'NO', 'NA', null)
  comment: text | null
  
  // Special fields for specific questions
  numberValue: number | null  // For "Number of systems", "Number of alarm valves", etc.
  dateValue: date | null  // For "If no, date of last trip", "If no, date last tested"
  tempValue: string | null  // For antifreeze temps
  textValue: string | null  // For "System pressure", etc.
  
  createdAt: timestamp
  updatedAt: timestamp
}
```

### 4. sprinklerDevices
Device list table

```typescript
{
  id: number (PK)
  inspectionId: number (FK → sprinklerInspections.id)
  deviceOrder: number
  
  // Required fields
  location: string (REQUIRED - validation enforced)
  
  // Device details
  labelText: string | null
  deviceType: string | null  // TS, FS, FPS, LA, etc.
  address: string | null
  zone: string | null
  
  // Checks (A-F)
  checkA: boolean | null  // Correctly installed
  checkB: boolean | null  // Alarm/Activation confirmed
  checkC: boolean | null  // Annunciator indication
  checkD: boolean | null  // Supervised circuit trouble signal
  checkE: boolean | null  // Requires service/missing
  checkF: boolean | null  // Measurements
  
  remarks: text | null
  
  createdAt: timestamp
  updatedAt: timestamp
}
```

## Validation Rules

### Devices
- **Location is REQUIRED**: Block finalize if any device row is missing location
- All other fields are optional

### Checklist Items
- **NA is allowed**: No comment required for NA
- **NO requires comment**: When response is NO (deficiency), comment is REQUIRED
- **NA may require comment**: When NA needs explanation (business logic)

### Finalize Workflow
- **Draft state**: All fields editable, can save partial data
- **Finalize**: 
  - Validates all devices have location
  - Validates all NO responses have comments
  - Sets status to 'finalized'
  - Records finalizedAt timestamp and finalizedBy user
  - Locks editing (frontend enforcement)
  - Enables PDF export

## Default Checklist Questions

Based on Excel template "Sprinkler Report" tab:

### General Section
1. Have changes been made to the fire protection system since the last inspection?
2. Has the system piping been checked for obstructive material?
3. In areas protected by wet systems, does building appear to be adequately heated?
4. Are dry pipe valves and wet system piping adequately protected from freezing?
5. Are all sprinkler systems in service?
6. Is the building completely sprinklered?
7. Do all sprinkler heads have at least 18" clearance from storage?
8. Has the dry system(s) been checked for proper pitch?
9. Fire department connection free of obvious obstructions?
10. Is the fire department connection check valve not leaking?
11. Does the fire department connection have proper signage and caps?

### Dry Systems Section
1. Number of systems (number field)
2. Is the dry pipe valve in service and in good condition?
3. Is the air pressure and priming water level normal?
4. Is the air compressor in good condition and oil level satisfactory?
5. Were all low points drained?
6. Are dry valves adequately protected from freezing?
7. Does this system require winterization?
8. Is the valve house and heater condition satisfactory?
9. Is the ball drip operational?
10. Were all valves tested as required?
11. Was the dry valve full trip test complete?
12. If no, date of last trip (date field)
13. Total number of low points: (number field)
14. Total number of low points drained: (number field)

### Control Valves Section
1. Are all sprinkler system control valves in the appropriate position?
2. Are all main valves indicating type?
3. Are all other valves in proper position?
4. Are all control valves in good condition?

### Water Supplies Section
1. Was a 2" main drain test performed and results satisfactory?
2. Is there a Fire Pump?

### Wet System Section
1. Number of alarm valves (number field)
2. Number of water flow switches (number field)
3. System pressure (text field)
4. Cold water valves open or closed as necessary?
5. Antifreeze #1 (text + temp field)
6. Antifreeze #2 (text + temp field)
7. Antifreeze #3 (text + temp field)
8. Antifreeze #4 (text + temp field)
9. Is the excess pressure pump operational?
10. Are alarm valves, water flow indicators and retard chambers in good condition?
11. Is/are the system(s) anti-freeze operational and satisfactory?

### Alarms Section
1. Water motor gong operational?
2. Flow/Pressure switch(es) operate properly?
3. Tamper/low air/low water switch(es) operate properly?
4. Central alarm signal sent and confirmed
5. Trouble/supervisory sent & confirmed
6. Are the sprinklers less than 50 years old?
7. If no, date last tested? (date field)
8. Is the condition of piping, drain valves, check valves, etc. satisfactory?

### Sprinkler Piping Section
1. Are all sprinkler heads in good condition?
2. Are spare sprinkler heads available?
3. Is the sprinkler piping in good condition?

## PDF Output Structure

### Page Header (all pages)
- EWF logo
- Site name and address
- Building ID
- Inspection date
- Technician name

### Section 1: Sprinkler Systems Summary
- Table showing systems #1-#6
- All system details (type, dates, pressures, etc.)

### Section 2: Sprinkler Report Checklist
- Grouped by section
- Show YES/NO/NA clearly
- Include date/temp/number fields where applicable
- Show comments for NO responses

### Section 3: Sprinkler Devices Table
- Columns: Location, Label, Device Type, Address, Zone, Checks A-F, Remarks
- All devices listed

### Section 4: Deficiencies Summary
- Only items marked NO/deficient
- Include device rows with check failures
- Show Location for all deficiencies
- Include comments/remarks

### Page Footer (all pages)
- Company info
- Page numbers
- Compliance statement: "Inspection, testing, and maintenance performed in alignment with NFPA 25 and applicable City of Vancouver Fire By-law requirements."
