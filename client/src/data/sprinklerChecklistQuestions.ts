// Default NFPA 25 / Vancouver Fire By-law Sprinkler ITM Checklist Questions

export interface ChecklistQuestion {
  section: string;
  questionText: string;
  questionOrder: number;
  hasNumberField?: boolean;
  hasDateField?: boolean;
  hasTempField?: boolean;
  hasTextField?: boolean;
  fieldLabel?: string;
}

export const defaultChecklistQuestions: ChecklistQuestion[] = [
  // General Section
  { section: "General", questionText: "Have changes been made to the fire protection system since the last inspection?", questionOrder: 1 },
  { section: "General", questionText: "Has the system piping been checked for obstructive material?", questionOrder: 2 },
  { section: "General", questionText: "In areas protected by wet systems, does building appear to be adequately heated?", questionOrder: 3 },
  { section: "General", questionText: "Are dry pipe valves and wet system piping adequately protected from freezing?", questionOrder: 4 },
  { section: "General", questionText: "Are all sprinkler systems in service?", questionOrder: 5 },
  { section: "General", questionText: "Is the building completely sprinklered?", questionOrder: 6 },
  { section: "General", questionText: "Do all sprinkler heads have at least 18\" clearance from storage?", questionOrder: 7 },
  { section: "General", questionText: "Has the dry system(s) been checked for proper pitch?", questionOrder: 8 },
  { section: "General", questionText: "Fire department connection free of obvious obstructions?", questionOrder: 9 },
  { section: "General", questionText: "Is the fire department connection check valve not leaking?", questionOrder: 10 },
  { section: "General", questionText: "Does the fire department connection have proper signage and caps?", questionOrder: 11 },

  // Dry Systems Section
  { section: "Dry Systems", questionText: "Number of systems", questionOrder: 12, hasNumberField: true, fieldLabel: "Number of systems" },
  { section: "Dry Systems", questionText: "Is the dry pipe valve in service and in good condition?", questionOrder: 13 },
  { section: "Dry Systems", questionText: "Is the air pressure and priming water level normal?", questionOrder: 14 },
  { section: "Dry Systems", questionText: "Is the air compressor in good condition and oil level satisfactory?", questionOrder: 15 },
  { section: "Dry Systems", questionText: "Were all low points drained?", questionOrder: 16 },
  { section: "Dry Systems", questionText: "Are dry valves adequately protected from freezing?", questionOrder: 17 },
  { section: "Dry Systems", questionText: "Does this system require winterization?", questionOrder: 18 },
  { section: "Dry Systems", questionText: "Is the valve house and heater condition satisfactory?", questionOrder: 19 },
  { section: "Dry Systems", questionText: "Is the ball drip operational?", questionOrder: 20 },
  { section: "Dry Systems", questionText: "Were all valves tested as required?", questionOrder: 21 },
  { section: "Dry Systems", questionText: "Was the dry valve full trip test complete?", questionOrder: 22 },
  { section: "Dry Systems", questionText: "If no, date of last trip", questionOrder: 23, hasDateField: true, fieldLabel: "Date of last trip" },
  { section: "Dry Systems", questionText: "Total number of low points", questionOrder: 24, hasNumberField: true, fieldLabel: "Total low points" },
  { section: "Dry Systems", questionText: "Total number of low points drained", questionOrder: 25, hasNumberField: true, fieldLabel: "Low points drained" },

  // Control Valves Section
  { section: "Control Valves", questionText: "Are all sprinkler system control valves in the appropriate position?", questionOrder: 26 },
  { section: "Control Valves", questionText: "Are all main valves indicating type?", questionOrder: 27 },
  { section: "Control Valves", questionText: "Are all other valves in proper position?", questionOrder: 28 },
  { section: "Control Valves", questionText: "Are all control valves in good condition?", questionOrder: 29 },

  // Water Supplies Section
  { section: "Water Supplies", questionText: "Was a 2\" main drain test performed and results satisfactory?", questionOrder: 30 },
  { section: "Water Supplies", questionText: "Is there a Fire Pump?", questionOrder: 31 },

  // Wet System Section
  { section: "Wet System", questionText: "Number of alarm valves", questionOrder: 32, hasNumberField: true, fieldLabel: "Number of alarm valves" },
  { section: "Wet System", questionText: "Number of water flow switches", questionOrder: 33, hasNumberField: true, fieldLabel: "Number of flow switches" },
  { section: "Wet System", questionText: "System pressure", questionOrder: 34, hasTextField: true, fieldLabel: "System pressure (psi)" },
  { section: "Wet System", questionText: "Cold water valves open or closed as necessary?", questionOrder: 35 },
  { section: "Wet System", questionText: "Antifreeze #1", questionOrder: 36, hasTempField: true, fieldLabel: "Antifreeze #1 temp (°F)" },
  { section: "Wet System", questionText: "Antifreeze #2", questionOrder: 37, hasTempField: true, fieldLabel: "Antifreeze #2 temp (°F)" },
  { section: "Wet System", questionText: "Antifreeze #3", questionOrder: 38, hasTempField: true, fieldLabel: "Antifreeze #3 temp (°F)" },
  { section: "Wet System", questionText: "Antifreeze #4", questionOrder: 39, hasTempField: true, fieldLabel: "Antifreeze #4 temp (°F)" },
  { section: "Wet System", questionText: "Is the excess pressure pump operational?", questionOrder: 40 },
  { section: "Wet System", questionText: "Are alarm valves, water flow indicators and retard chambers in good condition?", questionOrder: 41 },
  { section: "Wet System", questionText: "Is/are the system(s) anti-freeze operational and satisfactory?", questionOrder: 42 },

  // Alarms Section
  { section: "Alarms", questionText: "Water motor gong operational?", questionOrder: 43 },
  { section: "Alarms", questionText: "Flow/Pressure switch(es) operate properly?", questionOrder: 44 },
  { section: "Alarms", questionText: "Tamper/low air/low water switch(es) operate properly?", questionOrder: 45 },
  { section: "Alarms", questionText: "Central alarm signal sent and confirmed", questionOrder: 46 },
  { section: "Alarms", questionText: "Trouble/supervisory sent & confirmed", questionOrder: 47 },
  { section: "Alarms", questionText: "Are the sprinklers less than 50 years old?", questionOrder: 48 },
  { section: "Alarms", questionText: "If no, date last tested?", questionOrder: 49, hasDateField: true, fieldLabel: "Date last tested" },
  { section: "Alarms", questionText: "Is the condition of piping, drain valves, check valves, etc. satisfactory?", questionOrder: 50 },

  // Sprinkler Piping Section
  { section: "Sprinkler Piping", questionText: "Are all sprinkler heads in good condition?", questionOrder: 51 },
  { section: "Sprinkler Piping", questionText: "Are spare sprinkler heads available?", questionOrder: 52 },
  { section: "Sprinkler Piping", questionText: "Is the sprinkler piping in good condition?", questionOrder: 53 },
];
