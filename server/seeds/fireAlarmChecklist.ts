/**
 * CAN/ULC-S536:2019-REV1 Fire Alarm Verification Checklist Template
 * Source of truth for all fire alarm checklist items.
 * The SQL migration 0020_seed_fire_alarm_checklist_template.sql is derived from this.
 */

export const FIRE_ALARM_CHECKLIST_TEMPLATE = [
  // === DOCUMENTATION (items A-J) ===
  {
    section: "Documentation",
    sectionOrder: 1,
    items: [
      { itemId: "A", description: "Instructions for resetting the system and silencing alarm signals." },
      { itemId: "B", description: "Instructions for silencing the trouble signal and action to be taken when the trouble signal sounds." },
      { itemId: "C", description: "Description of the function of each operating control and indicator on the fire alarm unit." },
      { itemId: "D", description: "Description of the area or fire zone protected by each alarm detection circuit (this may be in the form of a table in the fire alarm system documentation, as detailed in Annex D)." },
      { itemId: "E", description: "Description of the alarm signal operation." },
      { itemId: "F", description: "Description of ancillary equipment controlled by the fire alarm system." },
      { itemId: "G", description: "In systems that provide local control of smoke control system documentation is on site and includes operation and maintenance instructions." },
      { itemId: "H", description: "Building diagrams are on site that clearly indicate the type and location of all smoke control equipment." },
      { itemId: "I", description: "Description of fire alarm system:", hasSubItems: true, subItems: [
        "i) Sequence of operation (See Annex D)",
        "ii) Operating instructions (see Annex D)",
        "iii) Description of each type of field device",
        "iv) Details of input to programmed output functions for programmed systems",
        "v) Connection to a fire signal receiving centre, if required by applicable codes and regulations",
        "vi) Previous verification report(s) and all documentation related to any modification showing approval by a P.Eng. or equivalent",
        "vii) The as-built drawings of the building fire alarm system (see Annex D)",
        "viii) Copy of the site specific software (if applicable)",
      ]},
      { itemId: "J", description: "Indicate location(s) and media type of documentation." },
    ],
  },

  // === CONTROL UNIT OR TRANSPONDER INSPECTION (items A-J) ===
  {
    section: "Control Unit or Transponder Inspection",
    sectionOrder: 2,
    headerFields: ["Control Unit/Transponder Field Location", "Control Unit/Transponder Identification"],
    items: [
      { itemId: "A", description: "Input circuit designations, correctly identified in relation to connected field devices." },
      { itemId: "B", description: "Output circuit designations, correctly identified in relation to connected field devices." },
      { itemId: "C", description: "Correct designations for common control functions and indicators." },
      { itemId: "D", description: "Plug-in components and modules securely in place." },
      { itemId: "E", description: "Plug-in cables securely in place." },
      { itemId: "F", description: "Record the date, revision and version of firmware/software.", hasSubItems: true, subItems: [
        "(i) Record the date, revision and version of firmware",
        "(ii) Record the date, revision and version of software program",
      ], hasNumericField: true, numericLabel: "Date: Rev: Ver:" },
      { itemId: "G", description: "Clean and free of dust and dirt." },
      { itemId: "H", description: "Fuses in accordance with manufacturer's specification." },
      { itemId: "I", description: "Control unit or transponder lock functional." },
      { itemId: "J", description: "Termination points from wiring to field devices secure." },
    ],
  },

  // === CONTROL UNIT OR TRANSPONDER TEST (items A-DD) ===
  {
    section: "Control Unit or Transponder Test",
    sectionOrder: 3,
    headerFields: ["Control Unit/Transponder Field Location", "Control Unit/Transponder Identification"],
    items: [
      { itemId: "A", description: "Power 'ON' visual indicator." },
      { itemId: "B", description: "Time and date indication corresponds with local time and date." },
      { itemId: "C", description: "Common visual trouble signal operates." },
      { itemId: "D", description: "Common audible trouble signal operates." },
      { itemId: "E", description: "Trouble signal silence switch operates." },
      { itemId: "F", description: "Main power supply failure trouble signal operates." },
      { itemId: "G", description: "Trouble signal operates during positive and negative ground fault tests." },
      { itemId: "H", description: "Alert signal operates." },
      { itemId: "I", description: "Alarm signal operates." },
      { itemId: "J", description: "Automatic transfer from alert signal to alarm signal operates.", hasNumericField: true, numericLabel: "Time:" },
      { itemId: "K", description: "Manual transfer from alert signal to alarm signal operates." },
      { itemId: "L", description: "Automatic transfer from alert signal to alarm signal cancel (acknowledge) feature operates on a two-stage system." },
      { itemId: "M", description: "Alarm signal silence inhibit function operates." },
      { itemId: "N", description: "Alarm signal manual silence operates." },
      { itemId: "O", description: "Alarm signal silence visual indication operates." },
      { itemId: "P", description: "Alarm signals when silenced, automatically reinitiate only upon subsequent alarm from another NBC required fire alarm zone." },
      { itemId: "Q", description: "Duration of alarm signal prior to automatic silence." },
      { itemId: "R", description: "Audible and visual alert signals and alarm signals programmed and operate per design and specification; or documentation.", hasNumericField: true, numericLabel: "Time:" },
      { itemId: "S", description: "Input circuit, alarm and supervisory operation, including audible and visual indication operates." },
      { itemId: "T", description: "Input circuit supervision fault causes a trouble indication." },
      { itemId: "U", description: "Output circuit alarm indicators operate." },
      { itemId: "V", description: "Output circuit supervision fault causes a trouble indication." },
      { itemId: "W", description: "Visual indicator test (lamp test) operates." },
      { itemId: "X", description: "Coded signal sequences operate not less than the required number of times and the correct alarm signal operates thereafter." },
      { itemId: "Y", description: "Coded signal sequences are not interrupted by subsequent alarms." },
      { itemId: "Z", description: "Ancillary device by-pass results in a trouble signal." },
      { itemId: "AA", description: "Input circuit to output circuit operation, including ancillary device circuits, for correct program operation, as per design and specification; or documentation." },
      { itemId: "BB", description: "System Reset operates." },
      { itemId: "CC", description: "Main power supply to emergency power supply transfer operates." },
      { itemId: "DD", description: "Smoke detector alarm verification (status change confirmation) verified." },
    ],
  },

  // === VOICE COMMUNICATION TEST (items A-Q) ===
  {
    section: "Voice Communication Test",
    sectionOrder: 4,
    notApplicableNote: "There are no Voice Communication Capabilities on this system.",
    items: [
      { itemId: "A", description: "Power 'ON' indicator." },
      { itemId: "B", description: "Common visual trouble signal operates." },
      { itemId: "C", description: "Common audible trouble signal operates." },
      { itemId: "D", description: "Trouble signal silence switch operates." },
      { itemId: "E", description: "All-call voice paging, including visual indicator, operates." },
      { itemId: "F", description: "Output circuits for selective voice paging, including visual indication." },
      { itemId: "G", description: "Output circuits for selective voice paging trouble operation, including visual indication, operates." },
      { itemId: "H", description: "Microphone, including press to talk switch, operates." },
      { itemId: "I", description: "Operation of voice paging does not interfere with initial inhibit time of alert signal or alarm signal." },
      { itemId: "J", description: "All-call voice paging operates (on emergency power supply)." },
      { itemId: "K", description: "Where systems use back-up amplifiers, the automatic transfer feature operates." },
      { itemId: "L", description: "Circuits for emergency telephone call-in operation, including audible and visual indication, operates." },
      { itemId: "M", description: "Circuits for emergency telephones for operation, including two-way voice communication, operates." },
      { itemId: "N", description: "Circuits for emergency telephone trouble operation, including visual indication, operates." },
      { itemId: "O", description: "Emergency telephone verbal communication operates." },
      { itemId: "P", description: "Emergency telephone operable or in-use tone at handset operates." },
      { itemId: "Q", description: "In standby mode, a short, or open on a paging, alert, alarm, or emergency telephone voice communication buss results in a trouble condition." },
    ],
  },

  // === POWER SUPPLY INSPECTION (items A-H) ===
  {
    section: "Power Supply Inspection",
    sectionOrder: 5,
    headerFields: ["Control unit or transponder location", "Control unit or transponder identification", "Circuit disconnect means or breaker location", "Circuit disconnect means or breaker identification"],
    items: [
      { itemId: "A", description: "Fused in accordance with the manufacturer's marked rating of the system." },
      { itemId: "B", description: "The primary supply is equipped with the identified disconnect means." },
      { itemId: "C", description: "Adequate to meet the requirements of the system." },
      { itemId: "D", description: "A short on the isolated side of each power isolation module results in a trouble condition." },
      { itemId: "E", description: "Operation of a device on the source side of each shorted power isolation module is confirmed." },
      { itemId: "F", description: "Power for ancillary devices is taken from a source separate from the fire alarm system control unit or transponder power supply." },
      { itemId: "G", description: "Power for ancillary devices is taken from the control unit or transponder that is designed to provide such power." },
      { itemId: "H", description: "Ancillary devices, which are powered from control unit or transponder, are recorded." },
    ],
  },

  // === EMERGENCY POWER SUPPLY / BATTERY TESTS (items A-S) ===
  {
    section: "Emergency Power Supply Test and Inspection",
    sectionOrder: 6,
    headerFields: ["Emergency power supply field location", "Emergency power supply identification", "Emergency Power supply provided by", "NBC required full load alarm operation time", "Batteries (as installed): V / Ah / Quantity"],
    items: [
      { itemId: "A", description: "Correct battery type as recommended by manufacturer." },
      { itemId: "B", description: "Correct battery rating as determined by battery calculations based on full system load." },
      { itemId: "C", description: "Battery voltage with main power supply 'ON'.", hasNumericField: true, numericLabel: "Voltage:" },
      { itemId: "D", description: "Battery voltage and current with main power supply 'OFF' and fire alarm system in supervisory condition.", hasNumericField: true, numericLabel: "Voltage: / Current:" },
      { itemId: "E", description: "Battery voltage and current with main power supply 'OFF' and fire alarm system in full load alarm condition.", hasNumericField: true, numericLabel: "Voltage: / Current:" },
      { itemId: "F", description: "Battery free of physical damage." },
      { itemId: "G", description: "Battery terminals cleaned and lubricated." },
      { itemId: "H", description: "Battery terminals clamped tightly." },
      { itemId: "I", description: "Correct electrolyte level." },
      { itemId: "J", description: "Specific gravity of electrolyte is within manufacturer's specifications." },
      { itemId: "K", description: "Battery free of Electrolyte leakage." },
      { itemId: "L", description: "Adequately ventilated." },
      { itemId: "M", description: "Battery manufacturer's date code.", hasNumericField: true, numericLabel: "Date:" },
      { itemId: "N", description: "Disconnection of battery causes trouble signal at the fire alarm control unit." },
      { itemId: "O", description: "Indicate type of battery tests performed:", hasSubItems: true, subItems: [
        "(i) Required supervisory load for 24 h followed by the required full load operation; or",
        "(ii) Silent accelerated test. (Refer to Annex C1, New Silent Accelerated Test Method); or",
        "(iii) Battery manufacturer's method. Specify:",
      ]},
      { itemId: "P", description: "Record calculated battery capacity.", hasNumericField: true, numericLabel: "A\u2022h" },
      { itemId: "Q", description: "Record battery terminal voltage after completion of tests.", hasNumericField: true, numericLabel: "V dc" },
      { itemId: "R", description: "Confirm battery voltage not less than 85% of its rating after the tests." },
      { itemId: "S", description: "Battery Charging Current.", hasNumericField: true, numericLabel: "A" },
    ],
  },

  // === EMERGENCY POWER GENERATOR TESTS (items A-C) ===
  {
    section: "Emergency Power Generator Tests",
    sectionOrder: 7,
    items: [
      { itemId: "A", description: "Generator provides power to the AC circuit serving the fire alarm system." },
      { itemId: "B", description: "Trouble condition at the emergency generator shall result in an audible common trouble signal and a visual indication at the control unit." },
      { itemId: "C", description: "Generator Run condition at the emergency generator shall result in an audible common trouble signal and a visual indication at the control unit." },
    ],
  },

  // === ANNUNCIATOR TEST (items A-M) ===
  {
    section: "Annunciator, Remote Trouble Signal Unit, Display and Control Centre Test and Inspection",
    sectionOrder: 8,
    headerFields: ["Annunciator or remote trouble signal unit location", "Annunciator or remote trouble signal identification"],
    items: [
      { itemId: "A", description: "Power 'on' indicator operates." },
      { itemId: "B", description: "Individual alarm and supervisory zone designation labels are properly identified." },
      { itemId: "C", description: "Where individual devices are annunciated confirm the individual alarm and supervisory indications are properly identified." },
      { itemId: "D", description: "Where active and supporting field devices are utilized, the device location and programmed device label/descriptor shall be confirmed." },
      { itemId: "E", description: "Common trouble signal operates." },
      { itemId: "F", description: "Visual indicator test (lamp test) operates." },
      { itemId: "G", description: "Input wiring from control unit or transponder is supervised." },
      { itemId: "H", description: "Alarm signal silence visual indicator operates." },
      { itemId: "I", description: "Switches for ancillary functions operate as per design and specification, or in accordance with documentation as detailed in Annex D." },
      { itemId: "J", description: "Other ancillary function visual indicators operate." },
      { itemId: "K", description: "Manual activation of alarm signal and indication operates." },
      { itemId: "L", description: "Displays are visible in installed location." },
      { itemId: "M", description: "Operates on emergency power." },
    ],
  },

  // === ANNUNCIATOR OR SEQUENTIAL DISPLAY (items A-M) ===
  {
    section: "Annunciator or Sequential Display",
    sectionOrder: 9,
    notApplicableNote: "There are no annunciators or sequential displays on this system.",
    headerFields: ["Annunciator/Sequential display location", "Annunciator/Sequential display identification"],
    items: [
      { itemId: "A", description: "Power 'on' indicator operates." },
      { itemId: "B", description: "Individual alarm and supervisory zone designation labels are properly identified." },
      { itemId: "C", description: "Where individual devices are also annunciated confirm the individual alarm and supervisory indications are properly identified." },
      { itemId: "D", description: "Where active and supporting field devices are utilized, the device location and programmed device label/descriptor shall be confirmed." },
      { itemId: "E", description: "Common trouble signal operates." },
      { itemId: "F", description: "Visual indicator test (lamp test) operates." },
      { itemId: "G", description: "Input wiring from control unit or transponder is supervised." },
      { itemId: "H", description: "Alarm signal silence visual indicator operates." },
      { itemId: "I", description: "Switches for ancillary functions operate as per design and specification, or in accordance with documentation as detailed in Annex D." },
      { itemId: "J", description: "Ancillary function visual indicators operate." },
      { itemId: "K", description: "Manual activation of alarm signal and indication operates." },
      { itemId: "L", description: "Displays are visible in installed location." },
      { itemId: "M", description: "Multi-line sequential display operates as per 10.2, where utilized." },
    ],
  },

  // === REMOTE TROUBLE UNIT (items A-D) ===
  {
    section: "Remote Trouble Unit and Inspection",
    sectionOrder: 10,
    notApplicableNote: "There are no remote trouble signal units on this system.",
    headerFields: ["Remote trouble signal unit location", "Remote trouble signal unit identification"],
    items: [
      { itemId: "A", description: "Input wiring from control unit or transponder is supervised." },
      { itemId: "B", description: "Visual trouble signal operates." },
      { itemId: "C", description: "Audible trouble signal operates." },
      { itemId: "D", description: "Audible trouble signal silence operates." },
    ],
  },

  // === PRINTER TEST (item A) ===
  {
    section: "Printer Test",
    sectionOrder: 11,
    notApplicableNote: "There are no printers on this system.",
    headerFields: ["Printer location", "Printer identification"],
    items: [
      { itemId: "A", description: "Operates as per design and specification, or in accordance with documentation as detailed in Annex D, Description of Fire Alarm System." },
    ],
  },
] as const;
