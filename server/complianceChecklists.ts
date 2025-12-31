// CAN/ULC-S536 Checklist Templates
// This module provides the standard checklist items for each inspection section

export interface ChecklistItem {
  id: string;
  description: string;
  result: 'YES' | 'NO' | 'N/A';
}

export interface ChecklistSection {
  sectionNumber: string;
  sectionTitle: string;
  location?: string;
  identification?: string;
  items: ChecklistItem[];
  overallResult: 'PASS' | 'DEFICIENT' | 'N/A';
  comments?: string;
}

// Section 22.1: Control Unit or Transponder Inspection
export function getControlUnitInspectionChecklist(
  location: string,
  identification: string,
  overrideResults?: Partial<Record<string, 'YES' | 'NO' | 'N/A'>>
): ChecklistSection {
  const items: ChecklistItem[] = [
    { id: 'A', description: 'Input circuit designations correctly identified in relation to connected field devices.', result: 'YES' },
    { id: 'B', description: 'Output circuit designations correctly identified in relation to connected field devices.', result: 'YES' },
    { id: 'C', description: 'Correct designations for common control functions and indicators.', result: 'YES' },
    { id: 'D', description: 'Plug-in components and modules securely in place.', result: 'YES' },
    { id: 'E', description: 'Plug-in cables securely in place.', result: 'YES' },
    { id: 'F', description: 'Record the date, revision and version of firmware and software program.', result: 'YES' },
    { id: 'G', description: 'Clean and free of dust and dirt.', result: 'YES' },
    { id: 'H', description: 'Fuses in accordance with manufacturer\'s specification', result: 'YES' },
    { id: 'I', description: 'Control unit or transponder lock functional', result: 'YES' },
    { id: 'J', description: 'Termination points from wiring to field devices secure', result: 'YES' },
  ];
  
  // Apply overrides
  if (overrideResults) {
    items.forEach(item => {
      if (overrideResults[item.id]) {
        item.result = overrideResults[item.id]!;
      }
    });
  }
  
  const hasDeficiency = items.some(item => item.result === 'NO');
  
  return {
    sectionNumber: '22.1',
    sectionTitle: 'Control Unit or Transponder Inspection',
    location,
    identification,
    items,
    overallResult: hasDeficiency ? 'DEFICIENT' : 'PASS',
  };
}

// Section 22.2: Control Unit or Transponder Test
export function getControlUnitTestChecklist(
  location: string,
  identification: string,
  overrideResults?: Partial<Record<string, 'YES' | 'NO' | 'N/A'>>,
  comments?: string
): ChecklistSection {
  const items: ChecklistItem[] = [
    { id: 'A', description: 'Power \'ON\' visual indicator operates.', result: 'YES' },
    { id: 'B', description: 'Time and date indication corresponds with local time and date.', result: 'YES' },
    { id: 'C', description: 'Common visual trouble signal operates.', result: 'YES' },
    { id: 'D', description: 'Common audible trouble signal operates.', result: 'YES' },
    { id: 'E', description: 'Trouble signal silence switch operates.', result: 'YES' },
    { id: 'F', description: 'Main power supply failure trouble signal operates.', result: 'YES' },
    { id: 'G', description: 'Trouble signal operates during positive and negative ground fault tests', result: 'YES' },
    { id: 'H', description: 'Alert signal operates.', result: 'N/A' },
    { id: 'I', description: 'Alarm signal operates.', result: 'YES' },
    { id: 'J', description: 'Automatic transfer from alert signal to alarm signal operates.', result: 'N/A' },
    { id: 'K', description: 'Manual transfer from alert signal to alarm signal operates.', result: 'N/A' },
    { id: 'L', description: 'Automatic transfer from alert signal to alarm signal cancel (acknowledge) feature operates on a two-stage system.', result: 'N/A' },
    { id: 'M', description: 'Alarm signal silence inhibit function operates.', result: 'YES' },
    { id: 'N', description: 'Alarm signal manual silence operates.', result: 'YES' },
    { id: 'O', description: 'Alarm signal silence visual indication operates.', result: 'YES' },
    { id: 'P', description: 'Alarm signals when silenced, automatically reinitiate only upon subsequent alarm from another NBC required fire alarm zone.', result: 'YES' },
    { id: 'Q', description: 'Duration of alarm signal prior to automatic silence.', result: 'N/A' },
    { id: 'R', description: 'Audible and visual alert signals and alarm signals programmed and operate as per design and specification, or documentation as provided in Section 21.', result: 'N/A' },
    { id: 'S', description: 'Input circuit, alarm and supervisory operation, including audible and visual indication operates.', result: 'YES' },
    { id: 'T', description: 'Input circuit supervision fault causes a trouble indication.', result: 'YES' },
    { id: 'U', description: 'Output circuit alarm indicators operate.', result: 'YES' },
    { id: 'V', description: 'Output circuit supervision fault causes a trouble indication.', result: 'YES' },
    { id: 'W', description: 'Visual indicator test (lamp test) operates.', result: 'YES' },
    { id: 'X', description: 'Coded signal sequences operate not less than the required number of times and the correct signal operates thereafter.', result: 'N/A' },
    { id: 'Y', description: 'Coded signal sequences are not interrupted by subsequent alarms.', result: 'N/A' },
    { id: 'Z', description: 'Ancillary device by-pass results in a trouble signal.', result: 'YES' },
    { id: 'AA', description: 'Input circuit to output circuit operation, including ancillary device circuits, for correct program operation, as per design and specification, or documentation as detailed in D, Description of Fire Alarm System for Inspection and Test Procedures.', result: 'YES' },
    { id: 'BB', description: 'System Reset operates.', result: 'YES' },
    { id: 'CC', description: 'Main power supply to emergency power supply operates', result: 'YES' },
    { id: 'DD', description: 'Smoke detector alarm verification (status change confirmation) verified (Refer to 14.4.3, Smoke Detector Alarm Verification (Status Change Confirmation)', result: 'N/A' },
  ];
  
  // Apply overrides
  if (overrideResults) {
    items.forEach(item => {
      if (overrideResults[item.id]) {
        item.result = overrideResults[item.id]!;
      }
    });
  }
  
  const hasDeficiency = items.some(item => item.result === 'NO');
  
  return {
    sectionNumber: '22.2',
    sectionTitle: 'Control Unit or Transponder Test',
    location,
    identification,
    items,
    overallResult: hasDeficiency ? 'DEFICIENT' : 'PASS',
    comments,
  };
}

// Section 22.4: Power Supply Inspection
export function getPowerSupplyInspectionChecklist(
  location: string,
  identification: string,
  circuitDisconnectLocation: string,
  circuitDisconnectId: string,
  overrideResults?: Partial<Record<string, 'YES' | 'NO' | 'N/A'>>
): ChecklistSection {
  const items: ChecklistItem[] = [
    { id: 'A', description: 'Fused in accordance with the manufacturer\'s marked rating of the system.', result: 'YES' },
    { id: 'B', description: 'The primary supply is equipped with the identified disconnect means.', result: 'YES' },
    { id: 'C', description: 'Adequate to meet the requirements of the system.', result: 'YES' },
    { id: 'D', description: 'A short on the isolated side of each power isolation module results in a trouble condition', result: 'N/A' },
    { id: 'E', description: 'Operation of a device on the source side of each shorted power isolation module is confirmed', result: 'N/A' },
    { id: 'F', description: 'Power for ancillary devices is taken from a source separate from the fire alarm system control unit or transponder power supply', result: 'N/A' },
    { id: 'G', description: 'Power for ancillary devices is taken from the control unit or transponder that is designed to provide such power.', result: 'N/A' },
    { id: 'H', description: 'Ancillary devices, which are powered from control unit or transponder, are recorded.', result: 'N/A' },
  ];
  
  // Apply overrides
  if (overrideResults) {
    items.forEach(item => {
      if (overrideResults[item.id]) {
        item.result = overrideResults[item.id]!;
      }
    });
  }
  
  const hasDeficiency = items.some(item => item.result === 'NO');
  
  return {
    sectionNumber: '22.4',
    sectionTitle: 'Power Supply Inspection',
    location,
    identification,
    items,
    overallResult: hasDeficiency ? 'DEFICIENT' : 'PASS',
    comments: `Circuit disconnect location: ${circuitDisconnectLocation}, ID: ${circuitDisconnectId}`,
  };
}

// Section 22.5: Emergency Power Supply Test and Inspection
export function getEmergencyPowerSupplyChecklist(
  location: string,
  identification: string,
  batteryVoltageOn: number,
  batteryCurrentOn: number,
  batteryVoltageOffSuper: number,
  batteryCurrentOffSuper: number,
  batteryVoltageOffAlarm: number,
  batteryCurrentOffAlarm: number,
  overrideResults?: Partial<Record<string, 'YES' | 'NO' | 'N/A'>>
): ChecklistSection {
  const items: ChecklistItem[] = [
    { id: 'A', description: 'Correct battery type as recommended by manufacturer.', result: 'YES' },
    { id: 'B', description: 'Correct battery rating as determined by battery calculations based on full system load.', result: 'YES' },
    { id: 'C', description: `Battery voltage with main power supply 'ON'. Voltage: ${batteryVoltageOn} V dc, Current: ${batteryCurrentOn} A`, result: 'YES' },
    { id: 'D', description: `Battery voltage and current with main power supply 'OFF' and fire alarm system in supervisory condition. Voltage: ${batteryVoltageOffSuper} V dc, Current: ${batteryCurrentOffSuper} A`, result: 'YES' },
    { id: 'E', description: `Battery voltage and current with main power supply 'OFF' and fire alarm system in full load alarm condition. Voltage: ${batteryVoltageOffAlarm} V dc, Current: ${batteryCurrentOffAlarm} A`, result: 'YES' },
    { id: 'F', description: 'Battery free of physical damage.', result: 'YES' },
    { id: 'G', description: 'Battery terminals cleaned and lubricated.', result: 'YES' },
    { id: 'H', description: 'Battery terminals clamped tightly.', result: 'YES' },
    { id: 'I', description: 'Correct electrolyte level.', result: 'N/A' },
    { id: 'J', description: 'Specific gravity of electrolyte is within manufacturer\'s specifications.', result: 'N/A' },
    { id: 'K', description: 'Battery free of Electrolyte leakage.', result: 'N/A' },
    { id: 'L', description: 'Adequately ventilated.', result: 'N/A' },
    { id: 'M', description: 'Battery manufacturer\'s date code.', result: 'YES' },
    { id: 'N', description: 'Disconnection of battery causes trouble signal at the fire alarm control unit.', result: 'YES' },
    { id: 'O', description: 'Indicate type of battery tests performed.', result: 'YES' },
    { id: 'P', description: 'Record calculated battery capacity (Refer to Annex C2)', result: 'YES' },
    { id: 'Q', description: 'Record battery terminal voltage after completion of tests', result: 'YES' },
    { id: 'R', description: 'Confirm battery voltage not less than 85% of its rating after the tests.', result: 'YES' },
  ];
  
  // Apply overrides
  if (overrideResults) {
    items.forEach(item => {
      if (overrideResults[item.id]) {
        item.result = overrideResults[item.id]!;
      }
    });
  }
  
  const hasDeficiency = items.some(item => item.result === 'NO');
  
  return {
    sectionNumber: '22.5',
    sectionTitle: 'Emergency Power Supply Test and Inspection',
    location,
    identification,
    items,
    overallResult: hasDeficiency ? 'DEFICIENT' : 'PASS',
  };
}

// Section 22.6: Annunciator, Remote Trouble Signal Unit, Display and Control Centre Test and Inspection
export function getAnnunciatorTestChecklist(
  location: string,
  identification: string,
  overrideResults?: Partial<Record<string, 'YES' | 'NO' | 'N/A'>>,
  comments?: string
): ChecklistSection {
  const items: ChecklistItem[] = [
    { id: 'A', description: 'Power \'on\' indicator operates.', result: 'N/A' },
    { id: 'B', description: 'Individual alarm and supervisory zone designation labels are properly identified.', result: 'YES' },
    { id: 'C', description: 'Where individual devices are annunciated confirm the individual alarm and supervisory indications are properly identified', result: 'N/A' },
    { id: 'D', description: 'Where active and supporting field devices are utilized, the device location is programmed using label/descriptor shall be confirmed.', result: 'YES' },
    { id: 'E', description: 'Common trouble signal operates.', result: 'YES' },
    { id: 'F', description: 'Visual indicator test (lamp test) operates.', result: 'YES' },
    { id: 'G', description: 'Input wiring from control unit or transponder is supervised.', result: 'YES' },
    { id: 'H', description: 'Alarm signal silence visual indicator operates.', result: 'YES' },
    { id: 'I', description: 'Switches for ancillary functions operate as per design and specification, or in accordance with documentation as detailed in Annex D, Description of Fire Alarm System for Inspection and Test Procedures.', result: 'YES' },
    { id: 'J', description: 'Other ancillary function visual indicators operate.', result: 'YES' },
    { id: 'K', description: 'Manual activation of alarm signal and indication operates.', result: 'YES' },
    { id: 'L', description: 'Displays are visible in installed location.', result: 'YES' },
    { id: 'M', description: 'Operates on emergency power.', result: 'YES' },
  ];
  
  // Apply overrides
  if (overrideResults) {
    items.forEach(item => {
      if (overrideResults[item.id]) {
        item.result = overrideResults[item.id]!;
      }
    });
  }
  
  const hasDeficiency = items.some(item => item.result === 'NO');
  
  return {
    sectionNumber: '22.6',
    sectionTitle: 'Annunciator, Remote Trouble Signal Unit, Display and Control Centre Test and Inspection',
    location,
    identification,
    items,
    overallResult: hasDeficiency ? 'DEFICIENT' : 'PASS',
    comments,
  };
}

// Section 22.7: Circuit Supervision
export function getCircuitSupervisionChecklist(
  overrideResults?: Partial<Record<string, 'YES' | 'NO' | 'N/A'>>
): ChecklistSection {
  const items: ChecklistItem[] = [
    { id: 'A', description: 'Alarm initiating circuit supervision operates.', result: 'YES' },
    { id: 'B', description: 'Supervisory initiating circuit supervision operates.', result: 'YES' },
    { id: 'C', description: 'Trouble initiating circuit supervision operates.', result: 'YES' },
    { id: 'D', description: 'Alarm signal circuit supervision operates.', result: 'YES' },
    { id: 'E', description: 'Supervisory signal circuit supervision operates.', result: 'YES' },
    { id: 'F', description: 'Ancillary device circuit supervision operates.', result: 'YES' },
  ];
  
  if (overrideResults) {
    items.forEach(item => {
      if (overrideResults[item.id]) {
        item.result = overrideResults[item.id]!;
      }
    });
  }
  
  const hasDeficiency = items.some(item => item.result === 'NO');
  
  return {
    sectionNumber: '22.7',
    sectionTitle: 'Circuit Supervision',
    items,
    overallResult: hasDeficiency ? 'DEFICIENT' : 'PASS',
  };
}

// Section 22.8: Smoke Detectors
export function getSmokeDetectorsChecklist(
  sampleSize: number,
  overrideResults?: Partial<Record<string, 'YES' | 'NO' | 'N/A'>>
): ChecklistSection {
  const items: ChecklistItem[] = [
    { id: 'A', description: 'Detector is clean and free of dust and dirt.', result: 'YES' },
    { id: 'B', description: 'Detector is securely mounted.', result: 'YES' },
    { id: 'C', description: 'Detector alarm operation confirmed.', result: 'YES' },
    { id: 'D', description: 'Detector address/zone indication correct at control unit.', result: 'YES' },
    { id: 'E', description: 'Detector sensitivity within manufacturer specification.', result: 'YES' },
  ];
  
  if (overrideResults) {
    items.forEach(item => {
      if (overrideResults[item.id]) {
        item.result = overrideResults[item.id]!;
      }
    });
  }
  
  const hasDeficiency = items.some(item => item.result === 'NO');
  
  return {
    sectionNumber: '22.8',
    sectionTitle: `Smoke Detectors (Sample: ${sampleSize} devices)`,
    items,
    overallResult: hasDeficiency ? 'DEFICIENT' : 'PASS',
  };
}

// Section 22.9: Heat Detectors
export function getHeatDetectorsChecklist(
  sampleSize: number,
  overrideResults?: Partial<Record<string, 'YES' | 'NO' | 'N/A'>>
): ChecklistSection {
  const items: ChecklistItem[] = [
    { id: 'A', description: 'Detector is clean and free of dust and dirt.', result: 'YES' },
    { id: 'B', description: 'Detector is securely mounted.', result: 'YES' },
    { id: 'C', description: 'Detector alarm operation confirmed.', result: 'YES' },
    { id: 'D', description: 'Detector address/zone indication correct at control unit.', result: 'YES' },
  ];
  
  if (overrideResults) {
    items.forEach(item => {
      if (overrideResults[item.id]) {
        item.result = overrideResults[item.id]!;
      }
    });
  }
  
  const hasDeficiency = items.some(item => item.result === 'NO');
  
  return {
    sectionNumber: '22.9',
    sectionTitle: `Heat Detectors (Sample: ${sampleSize} devices)`,
    items,
    overallResult: hasDeficiency ? 'DEFICIENT' : 'PASS',
  };
}

// Section 22.10: Duct Detectors
export function getDuctDetectorsChecklist(
  sampleSize: number,
  overrideResults?: Partial<Record<string, 'YES' | 'NO' | 'N/A'>>
): ChecklistSection {
  const items: ChecklistItem[] = [
    { id: 'A', description: 'Detector is clean and free of dust and dirt.', result: 'YES' },
    { id: 'B', description: 'Detector is securely mounted.', result: 'YES' },
    { id: 'C', description: 'Detector alarm operation confirmed.', result: 'YES' },
    { id: 'D', description: 'Detector address/zone indication correct at control unit.', result: 'YES' },
    { id: 'E', description: 'Ancillary device circuit operation confirmed.', result: 'YES' },
    { id: 'F', description: 'Sampling tubes clean and unobstructed.', result: 'YES' },
  ];
  
  if (overrideResults) {
    items.forEach(item => {
      if (overrideResults[item.id]) {
        item.result = overrideResults[item.id]!;
      }
    });
  }
  
  const hasDeficiency = items.some(item => item.result === 'NO');
  
  return {
    sectionNumber: '22.10',
    sectionTitle: `Duct Detectors (Sample: ${sampleSize} devices)`,
    items,
    overallResult: hasDeficiency ? 'DEFICIENT' : 'PASS',
  };
}

// Section 22.11: Manual Pull Stations
export function getManualPullStationsChecklist(
  sampleSize: number,
  overrideResults?: Partial<Record<string, 'YES' | 'NO' | 'N/A'>>
): ChecklistSection {
  const items: ChecklistItem[] = [
    { id: 'A', description: 'Station is clean and free of damage.', result: 'YES' },
    { id: 'B', description: 'Station is securely mounted.', result: 'YES' },
    { id: 'C', description: 'Station alarm operation confirmed.', result: 'YES' },
    { id: 'D', description: 'Station address/zone indication correct at control unit.', result: 'YES' },
    { id: 'E', description: 'Station operating instructions visible and legible.', result: 'YES' },
  ];
  
  if (overrideResults) {
    items.forEach(item => {
      if (overrideResults[item.id]) {
        item.result = overrideResults[item.id]!;
      }
    });
  }
  
  const hasDeficiency = items.some(item => item.result === 'NO');
  
  return {
    sectionNumber: '22.11',
    sectionTitle: `Manual Pull Stations (Sample: ${sampleSize} devices)`,
    items,
    overallResult: hasDeficiency ? 'DEFICIENT' : 'PASS',
  };
}

// Section 22.12: Waterflow Devices
export function getWaterflowDevicesChecklist(
  overrideResults?: Partial<Record<string, 'YES' | 'NO' | 'N/A'>>
): ChecklistSection {
  const items: ChecklistItem[] = [
    { id: 'A', description: 'Device is clean and free of damage.', result: 'YES' },
    { id: 'B', description: 'Device is securely mounted.', result: 'YES' },
    { id: 'C', description: 'Device alarm operation confirmed.', result: 'YES' },
    { id: 'D', description: 'Device address/zone indication correct at control unit.', result: 'YES' },
    { id: 'E', description: 'Time delay setting verified.', result: 'YES' },
  ];
  
  if (overrideResults) {
    items.forEach(item => {
      if (overrideResults[item.id]) {
        item.result = overrideResults[item.id]!;
      }
    });
  }
  
  const hasDeficiency = items.some(item => item.result === 'NO');
  
  return {
    sectionNumber: '22.12',
    sectionTitle: 'Waterflow Devices',
    items,
    overallResult: hasDeficiency ? 'DEFICIENT' : 'PASS',
  };
}

// Section 22.13: Supervisory Devices
export function getSupervisoryDevicesChecklist(
  overrideResults?: Partial<Record<string, 'YES' | 'NO' | 'N/A'>>
): ChecklistSection {
  const items: ChecklistItem[] = [
    { id: 'A', description: 'Device is clean and free of damage.', result: 'YES' },
    { id: 'B', description: 'Device is securely mounted.', result: 'YES' },
    { id: 'C', description: 'Device supervisory signal operation confirmed.', result: 'YES' },
    { id: 'D', description: 'Device address/zone indication correct at control unit.', result: 'YES' },
  ];
  
  if (overrideResults) {
    items.forEach(item => {
      if (overrideResults[item.id]) {
        item.result = overrideResults[item.id]!;
      }
    });
  }
  
  const hasDeficiency = items.some(item => item.result === 'NO');
  
  return {
    sectionNumber: '22.13',
    sectionTitle: 'Supervisory Devices',
    items,
    overallResult: hasDeficiency ? 'DEFICIENT' : 'PASS',
  };
}

// Section 22.14: Interconnection to Fire Signal Receiving Centre
export function getFireSignalReceivingCentreChecklist(
  companyName?: string,
  telephone?: string,
  overrideResults?: Partial<Record<string, 'YES' | 'NO' | 'N/A'>>
): ChecklistSection {
  const items: ChecklistItem[] = [
    { id: 'A', description: 'The fire signal receiving centre transmitter is integral to the fire alarm control unit.', result: 'YES' },
    { id: 'B', description: 'Receipt of the alarm transmission to the fire signal receiving centre.', result: 'YES' },
    { id: 'C', description: 'Receipt of the supervisory transmission to the fire signal receiving centre.', result: 'YES' },
    { id: 'D', description: 'Receipt of the trouble transmission to the fire signal receiving centre.', result: 'YES' },
    { id: 'E', description: 'Disabling or disconnecting the fire signal receiving centre transmitter results in a specific trouble signal at the control unit or transmitter and also transmits a trouble signal to the fire signal receiving centre.', result: 'NO' },
    { id: 'F', description: 'Disabling or disconnecting the fire signal receiving centre transmitter transmits a trouble signal to the fire signal receiving centre.', result: 'NO' },
    { id: 'G', description: 'Record the company name and telephone number of the fire signal receiving centre.', result: 'YES' },
    { id: 'H', description: 'Operation of the fire signal receiving centre disconnect means transmits trouble to the fire signal receiving centre.', result: 'YES' },
  ];
  
  if (overrideResults) {
    items.forEach(item => {
      if (overrideResults[item.id]) {
        item.result = overrideResults[item.id]!;
      }
    });
  }
  
  const hasDeficiency = items.some(item => item.result === 'NO');
  
  const comments = companyName && telephone 
    ? `Name: ${companyName}\nTelephone: ${telephone}`
    : undefined;
  
  return {
    sectionNumber: '22.14',
    sectionTitle: 'Interconnection to the Fire Signal Receiving Centre',
    items,
    overallResult: hasDeficiency ? 'DEFICIENT' : 'PASS',
    comments,
  };
}

// Section 22.15: Audible Signaling Devices
export function getAudibleSignalingDevicesChecklist(
  sampleSize: number,
  overrideResults?: Partial<Record<string, 'YES' | 'NO' | 'N/A'>>
): ChecklistSection {
  const items: ChecklistItem[] = [
    { id: 'A', description: 'Device is clean and free of damage.', result: 'YES' },
    { id: 'B', description: 'Device is securely mounted.', result: 'YES' },
    { id: 'C', description: 'Device audible signal operation confirmed.', result: 'YES' },
    { id: 'D', description: 'Device sound level adequate for area.', result: 'YES' },
    { id: 'E', description: 'Device operates on correct signal circuit.', result: 'YES' },
  ];
  
  if (overrideResults) {
    items.forEach(item => {
      if (overrideResults[item.id]) {
        item.result = overrideResults[item.id]!;
      }
    });
  }
  
  const hasDeficiency = items.some(item => item.result === 'NO');
  
  return {
    sectionNumber: '22.15',
    sectionTitle: `Audible Signaling Devices (Sample: ${sampleSize} devices)`,
    items,
    overallResult: hasDeficiency ? 'DEFICIENT' : 'PASS',
  };
}

// Section 22.16: Visual Signaling Devices
export function getVisualSignalingDevicesChecklist(
  sampleSize: number,
  overrideResults?: Partial<Record<string, 'YES' | 'NO' | 'N/A'>>
): ChecklistSection {
  const items: ChecklistItem[] = [
    { id: 'A', description: 'Device is clean and free of damage.', result: 'YES' },
    { id: 'B', description: 'Device is securely mounted.', result: 'YES' },
    { id: 'C', description: 'Device visual signal operation confirmed.', result: 'YES' },
    { id: 'D', description: 'Device flash rate within specification.', result: 'YES' },
    { id: 'E', description: 'Device operates on correct signal circuit.', result: 'YES' },
  ];
  
  if (overrideResults) {
    items.forEach(item => {
      if (overrideResults[item.id]) {
        item.result = overrideResults[item.id]!;
      }
    });
  }
  
  const hasDeficiency = items.some(item => item.result === 'NO');
  
  return {
    sectionNumber: '22.16',
    sectionTitle: `Visual Signaling Devices (Sample: ${sampleSize} devices)`,
    items,
    overallResult: hasDeficiency ? 'DEFICIENT' : 'PASS',
  };
}
