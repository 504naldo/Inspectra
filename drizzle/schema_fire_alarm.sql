-- Fire Alarm Inspection Tables for CAN/ULC-S536 Compliance

-- Fire Alarm System Information (one per site)
CREATE TABLE fire_alarm_systems (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id INT NOT NULL,
  manufacturer VARCHAR(255),
  model_number VARCHAR(255),
  operation_type ENUM('single_stage', 'two_stage', 'other') DEFAULT 'single_stage',
  operation_description TEXT,
  connected_to_monitoring BOOLEAN DEFAULT FALSE,
  monitoring_centre_name VARCHAR(255),
  monitoring_centre_phone VARCHAR(50),
  system_fully_functional BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

-- Fire Alarm Inspection Checklist Template
CREATE TABLE fire_alarm_checklist_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  section_name VARCHAR(255) NOT NULL,
  section_order INT NOT NULL,
  item_letter VARCHAR(10), -- A, B, C, etc.
  item_description TEXT NOT NULL,
  requirement_type ENUM('inspection', 'test', 'both') DEFAULT 'both',
  is_required BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fire Alarm Inspection Results (per job)
CREATE TABLE fire_alarm_inspection_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  fire_alarm_system_id INT NOT NULL,
  checklist_item_id INT NOT NULL,
  result ENUM('pass', 'fail', 'na', 'not_tested') DEFAULT 'not_tested',
  notes TEXT,
  tested_by INT, -- user_id of technician
  tested_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (fire_alarm_system_id) REFERENCES fire_alarm_systems(id) ON DELETE CASCADE,
  FOREIGN KEY (checklist_item_id) REFERENCES fire_alarm_checklist_templates(id),
  FOREIGN KEY (tested_by) REFERENCES users(id)
);

-- Control Units/Transponders
CREATE TABLE fire_alarm_control_units (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fire_alarm_system_id INT NOT NULL,
  location VARCHAR(255),
  identification VARCHAR(255),
  unit_type ENUM('control_unit', 'transponder') DEFAULT 'control_unit',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fire_alarm_system_id) REFERENCES fire_alarm_systems(id) ON DELETE CASCADE
);

-- Annunciators
CREATE TABLE fire_alarm_annunciators (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fire_alarm_system_id INT NOT NULL,
  location VARCHAR(255),
  identification VARCHAR(255),
  annunciator_type ENUM('standard', 'sequential_display', 'remote_trouble') DEFAULT 'standard',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fire_alarm_system_id) REFERENCES fire_alarm_systems(id) ON DELETE CASCADE
);
