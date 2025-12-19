#!/usr/bin/env python3
"""Extract all relevant inspection data from the Excel file to JSON."""

import pandas as pd
import json
import re
from datetime import datetime

file_path = '/home/ubuntu/fire-inspect/inspection_data.xlsm'
xl = pd.ExcelFile(file_path)

data = {
    "site": {},
    "devices": [],
    "deficiencies": [],
    "inspection": {}
}

# Extract site info from Work Site Info
print("Extracting site info...")
work_site_df = pd.read_excel(file_path, sheet_name='Work Site Info', header=None)

# Parse Work Site Info - looking at the structure
for i, row in work_site_df.iterrows():
    row_vals = [str(x) if pd.notna(x) else '' for x in row.values]
    row_str = ' '.join(row_vals)
    
    if 'SITE ADDRESS' in row_str.upper() or 'ADDRESS' in row_str.upper():
        # Look for address in next columns
        for j, val in enumerate(row_vals):
            if val and 'ADDRESS' not in val.upper() and len(val) > 5:
                data['site']['address'] = val.strip()
                break
    
    if 'BUILDING' in row_str.upper() and 'NAME' in row_str.upper():
        for j, val in enumerate(row_vals):
            if val and 'BUILDING' not in val.upper() and 'NAME' not in val.upper() and len(val) > 2:
                data['site']['name'] = val.strip()
                break

# Extract from Cover Sheet for more details
cover_df = pd.read_excel(file_path, sheet_name='Cover Sheet', header=None)
for i, row in cover_df.iterrows():
    row_vals = [str(x) if pd.notna(x) else '' for x in row.values]
    row_str = ' '.join(row_vals)
    
    if '12500' in row_str and 'TRITES' in row_str.upper():
        data['site']['address'] = '12500 Trites Road, Richmond'
    if 'GERALD' in row_str.upper() or 'PHANG' in row_str.upper():
        data['site']['contact_name'] = 'Gerald Phang'

# Set site info based on filename
data['site']['name'] = '12500 Trites Road'
data['site']['address'] = '12500 Trites Road'
data['site']['city'] = 'Richmond'
data['site']['state'] = 'BC'
data['site']['building_id'] = '#0313'

# Extract Fire Alarm devices
print("Extracting fire alarm devices...")
fa_df = pd.read_excel(file_path, sheet_name='Fire Alarm', header=None)

# Find the header row for devices
device_start = None
for i, row in fa_df.iterrows():
    row_vals = [str(x).lower() if pd.notna(x) else '' for x in row.values]
    if 'device type' in row_vals or 'device' in row_vals:
        device_start = i
        break

if device_start:
    # Parse devices starting from header row
    headers = fa_df.iloc[device_start].values
    for i in range(device_start + 1, len(fa_df)):
        row = fa_df.iloc[i]
        if pd.notna(row.iloc[0]) and str(row.iloc[0]).strip():
            device = {
                'device_type': 'Fire Alarm Device',
                'location': str(row.iloc[1]) if pd.notna(row.iloc[1]) else '',
                'notes': ''
            }
            # Try to get more specific type
            for j, val in enumerate(row.values):
                if pd.notna(val):
                    val_str = str(val).lower()
                    if 'smoke' in val_str:
                        device['device_type'] = 'Smoke Detector'
                    elif 'heat' in val_str:
                        device['device_type'] = 'Heat Detector'
                    elif 'pull' in val_str:
                        device['device_type'] = 'Pull Station'
                    elif 'horn' in val_str or 'strobe' in val_str:
                        device['device_type'] = 'Horn/Strobe'
                    elif 'panel' in val_str:
                        device['device_type'] = 'Fire Alarm Panel'
            
            if device['location']:
                data['devices'].append(device)

# Extract Emergency Lights
print("Extracting emergency lights...")
emerg_df = pd.read_excel(file_path, sheet_name='Emergency Lights', header=None)

for i in range(2, len(emerg_df)):  # Skip header rows
    row = emerg_df.iloc[i]
    if pd.notna(row.iloc[0]) and str(row.iloc[0]).strip():
        try:
            unit_num = int(row.iloc[0]) if pd.notna(row.iloc[0]) else i
        except:
            continue
            
        location = str(row.iloc[1]) if pd.notna(row.iloc[1]) else ''
        battery_year = str(row.iloc[5]) if pd.notna(row.iloc[5]) else ''
        battery_size = str(row.iloc[6]) if pd.notna(row.iloc[6]) else ''
        passed = row.iloc[9] if pd.notna(row.iloc[9]) else None
        
        device = {
            'device_type': 'Emergency Light',
            'location': location,
            'serial_number': f'EL-{unit_num:03d}',
            'notes': f'Battery: {battery_size} ({battery_year})',
            'manufacturer': '',
            'model': str(row.iloc[4]) if pd.notna(row.iloc[4]) else ''
        }
        
        if location:
            data['devices'].append(device)

# Extract Extinguishers
print("Extracting extinguishers...")
ext_df = pd.read_excel(file_path, sheet_name='Extinguishers', header=None)

for i in range(2, len(ext_df)):  # Skip header rows
    row = ext_df.iloc[i]
    if pd.notna(row.iloc[0]) and str(row.iloc[0]).strip():
        try:
            unit_num = int(row.iloc[0]) if pd.notna(row.iloc[0]) else i
        except:
            continue
            
        location = str(row.iloc[1]) if pd.notna(row.iloc[1]) else ''
        type_size = str(row.iloc[2]) if pd.notna(row.iloc[2]) else ''
        serial = str(row.iloc[3]) if pd.notna(row.iloc[3]) else ''
        mfg_date = str(row.iloc[4]) if pd.notna(row.iloc[4]) else ''
        
        device = {
            'device_type': 'Fire Extinguisher',
            'location': location,
            'serial_number': serial,
            'model': type_size,
            'notes': f'MFG: {mfg_date}'
        }
        
        if location:
            data['devices'].append(device)

# Extract Sprinkler Devices
print("Extracting sprinkler devices...")
sprinkler_df = pd.read_excel(file_path, sheet_name='Sprinkler Devices', header=None)

for i in range(2, min(len(sprinkler_df), 50)):  # Skip header rows
    row = sprinkler_df.iloc[i]
    if pd.notna(row.iloc[0]) and str(row.iloc[0]).strip():
        device_type = str(row.iloc[1]) if pd.notna(row.iloc[1]) else 'Sprinkler Device'
        location = str(row.iloc[2]) if pd.notna(row.iloc[2]) else ''
        
        device = {
            'device_type': f'Sprinkler - {device_type}' if device_type else 'Sprinkler Device',
            'location': location,
            'notes': ''
        }
        
        if device_type or location:
            data['devices'].append(device)

# Extract Deficiencies
print("Extracting deficiencies...")
def_df = pd.read_excel(file_path, sheet_name='Deficiency List DEC 2024', header=None)

# Find header row
for i, row in def_df.iterrows():
    row_vals = [str(x).lower() if pd.notna(x) else '' for x in row.values]
    if 'deficiency' in ' '.join(row_vals) or 'description' in ' '.join(row_vals):
        # Parse deficiencies from next rows
        for j in range(i+1, len(def_df)):
            def_row = def_df.iloc[j]
            if pd.notna(def_row.iloc[0]) and str(def_row.iloc[0]).strip():
                deficiency = {
                    'description': str(def_row.iloc[1]) if pd.notna(def_row.iloc[1]) else str(def_row.iloc[0]),
                    'location': str(def_row.iloc[2]) if len(def_row) > 2 and pd.notna(def_row.iloc[2]) else '',
                    'severity': 'medium',
                    'status': 'open'
                }
                if deficiency['description'] and len(deficiency['description']) > 3:
                    data['deficiencies'].append(deficiency)
        break

# Set inspection info
data['inspection'] = {
    'job_number': '#0313-2025ANNUAL',
    'inspection_type': 'Annual',
    'scheduled_date': '2024-12-19',
    'status': 'in_progress'
}

# Output summary
print("\n" + "="*60)
print("EXTRACTION SUMMARY")
print("="*60)
print(f"Site: {data['site']}")
print(f"Total devices: {len(data['devices'])}")
print(f"Total deficiencies: {len(data['deficiencies'])}")
print(f"Inspection: {data['inspection']}")

# Device type breakdown
device_types = {}
for d in data['devices']:
    dt = d['device_type']
    device_types[dt] = device_types.get(dt, 0) + 1

print("\nDevice breakdown:")
for dt, count in sorted(device_types.items()):
    print(f"  {dt}: {count}")

# Save to JSON
with open('/home/ubuntu/fire-inspect/extracted_data.json', 'w') as f:
    json.dump(data, f, indent=2, default=str)

print("\nData saved to extracted_data.json")
