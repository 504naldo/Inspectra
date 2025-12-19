import pandas as pd
import json

# Load the Excel file
file_path = '/home/ubuntu/fire-inspect/inspection_data.xlsm'
xl = pd.ExcelFile(file_path)

all_devices = []

# Extract Smoke Alarms data
print("=== Extracting Smoke Alarms ===")
df = pd.read_excel(file_path, sheet_name='Smoke Alarms', header=None)

# Headers are in row 11
for i in range(12, df.shape[0]):
    row = df.iloc[i].tolist()
    suite = str(row[0]) if pd.notna(row[0]) else ''
    device_type = str(row[1]) if pd.notna(row[1]) else ''
    power_source = str(row[2]) if pd.notna(row[2]) else ''
    battery_type = str(row[3]) if pd.notna(row[3]) else ''
    battery_replaced = str(row[4]) if pd.notna(row[4]) else ''
    num_batts = str(row[5]) if pd.notna(row[5]) else ''
    cleaned_tested = str(row[6]) if pd.notna(row[6]) else ''
    service_date = str(row[7]) if pd.notna(row[7]) else ''
    maintenance = str(row[8]) if pd.notna(row[8]) else ''
    remarks = str(row[9]) if pd.notna(row[9]) else ''
    
    if suite and device_type:
        # Determine device category
        if 'CO' in device_type:
            category = 'Smoke/CO Detector'
        elif 'SA' in device_type:
            category = 'Smoke Alarm'
        else:
            category = 'Detector'
        
        device = {
            'location': f'Suite {suite}',
            'type': category,
            'subtype': device_type,
            'manufacturer': '',
            'model': remarks if remarks else '',
            'serial': '',
            'power_source': power_source,
            'battery_type': battery_type,
            'battery_replaced': battery_replaced,
            'service_date': service_date,
            'status': 'PASS' if cleaned_tested == 'Y' else 'FAIL',
            'notes': f'Power: {power_source}, Battery: {battery_type}, Replaced: {battery_replaced}'
        }
        all_devices.append(device)
        print(f"Suite {suite}: {device_type} - {category}")

print(f"\nTotal Smoke Alarms: {len(all_devices)}")

# Check for Emergency Lights sheet
print("\n=== Checking Emergency Lights ===")
for sheet_name in xl.sheet_names:
    if 'emergency' in sheet_name.lower() or 'light' in sheet_name.lower():
        print(f"Found sheet: {sheet_name}")
        df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)
        print(f"Shape: {df.shape}")
        for i in range(min(30, df.shape[0])):
            row = df.iloc[i].tolist()
            row = [str(x) if pd.notna(x) else '' for x in row]
            non_empty = [x for x in row if x.strip()]
            if non_empty:
                print(f"Row {i}: {non_empty}")

# Check for Fire Extinguisher sheet
print("\n=== Checking Fire Extinguishers ===")
for sheet_name in xl.sheet_names:
    if 'extinguisher' in sheet_name.lower():
        print(f"Found sheet: {sheet_name}")
        df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)
        print(f"Shape: {df.shape}")
        for i in range(min(30, df.shape[0])):
            row = df.iloc[i].tolist()
            row = [str(x) if pd.notna(x) else '' for x in row]
            non_empty = [x for x in row if x.strip()]
            if non_empty:
                print(f"Row {i}: {non_empty}")

# Check for Sprinkler sheet
print("\n=== Checking Sprinkler ===")
for sheet_name in xl.sheet_names:
    if 'sprinkler' in sheet_name.lower() and 'letter' not in sheet_name.lower():
        print(f"Found sheet: {sheet_name}")
        df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)
        print(f"Shape: {df.shape}")
        for i in range(min(50, df.shape[0])):
            row = df.iloc[i].tolist()
            row = [str(x) if pd.notna(x) else '' for x in row]
            non_empty = [x for x in row if x.strip()]
            if non_empty:
                print(f"Row {i}: {non_empty}")

# Save all devices to JSON
output = {
    'smoke_alarms': all_devices
}

with open('/home/ubuntu/fire-inspect/individual_devices.json', 'w') as f:
    json.dump(output, f, indent=2)

print(f"\n\nSaved {len(all_devices)} smoke alarm devices to individual_devices.json")
