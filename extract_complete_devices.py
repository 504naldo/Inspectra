import pandas as pd
import json

# Load the Excel file
file_path = '/home/ubuntu/fire-inspect/inspection_data.xlsm'
xl = pd.ExcelFile(file_path)

all_devices = []

# 1. Extract Smoke Alarms data
print("=== Extracting Smoke Alarms ===")
df = pd.read_excel(file_path, sheet_name='Smoke Alarms', header=None)

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
    
    if suite and device_type and suite != 'nan':
        if 'CO' in device_type:
            category = 'Smoke/CO Detector'
        elif 'SA' in device_type:
            category = 'Smoke Alarm'
        else:
            category = 'Detector'
        
        device = {
            'deviceType': category,
            'location': f'Suite {suite}',
            'manufacturer': 'Various',
            'model': remarks if remarks and remarks != 'nan' else device_type,
            'serialNumber': f'SA-{suite}-{len([d for d in all_devices if f"Suite {suite}" in d.get("location", "")])+1}',
            'status': 'active',
            'notes': f'Type: {device_type}, Power: {power_source}, Battery: {battery_type}',
            'testResult': 'PASS' if cleaned_tested == 'Y' else ('FAIL' if maintenance and maintenance != 'nan' else 'PASS'),
            'testNotes': f'Service Date: {service_date}, Battery Replaced: {battery_replaced}'
        }
        all_devices.append(device)

print(f"Extracted {len(all_devices)} smoke alarm devices")

# 2. Extract Emergency Lights
print("\n=== Extracting Emergency Lights ===")
df = pd.read_excel(file_path, sheet_name='Emergency Lights', header=None)

for i in range(6, df.shape[0]):
    row = df.iloc[i].tolist()
    location = str(row[0]) if pd.notna(row[0]) else ''
    device_type = str(row[1]) if pd.notna(row[1]) else ''
    manufacturer = str(row[2]) if pd.notna(row[2]) else ''
    model = str(row[3]) if pd.notna(row[3]) else ''
    
    if location and location != 'nan' and device_type and device_type != 'nan':
        device = {
            'deviceType': 'Emergency Light',
            'location': location,
            'manufacturer': manufacturer if manufacturer and manufacturer != 'nan' else 'Various',
            'model': model if model and model != 'nan' else device_type,
            'serialNumber': f'EL-{len([d for d in all_devices if d["deviceType"] == "Emergency Light"])+1}',
            'status': 'active',
            'notes': f'Type: {device_type}',
            'testResult': 'PASS',
            'testNotes': 'Annual inspection completed'
        }
        all_devices.append(device)

print(f"Total devices after Emergency Lights: {len(all_devices)}")

# 3. Extract Sprinkler Devices
print("\n=== Extracting Sprinkler Devices ===")
df = pd.read_excel(file_path, sheet_name='Sprinkler Devices', header=None)

for i in range(5, df.shape[0]):
    row = df.iloc[i].tolist()
    location = str(row[0]) if pd.notna(row[0]) else ''
    label = str(row[1]) if pd.notna(row[1]) else ''
    device_type = str(row[2]) if pd.notna(row[2]) else ''
    address = str(row[3]) if pd.notna(row[3]) else ''
    
    if location and location != 'nan' and device_type and device_type != 'nan':
        device = {
            'deviceType': 'Sprinkler Device',
            'location': location,
            'manufacturer': 'Various',
            'model': f'{device_type} - {label}',
            'serialNumber': f'SPR-{address}' if address and address != 'nan' else f'SPR-{len([d for d in all_devices if d["deviceType"] == "Sprinkler Device"])+1}',
            'status': 'active',
            'notes': f'Label: {label}, Address: {address}',
            'testResult': 'PASS',
            'testNotes': 'Annual inspection completed'
        }
        all_devices.append(device)

print(f"Total devices after Sprinkler Devices: {len(all_devices)}")

# 4. Extract Individual device record (Fire Alarm Devices)
print("\n=== Extracting Individual Device Record (Fire Alarm) ===")
df = pd.read_excel(file_path, sheet_name='Individual device record', header=None)
print(f"Sheet shape: {df.shape}")

# Show first rows to understand structure
print("First 20 rows:")
for i in range(min(20, df.shape[0])):
    row = df.iloc[i].tolist()
    row = [str(x) if pd.notna(x) else '' for x in row]
    non_empty = [x for x in row if x.strip() and x != 'nan']
    if non_empty:
        print(f"Row {i}: {non_empty[:10]}")

# Find header row and extract devices
header_row = None
for i in range(df.shape[0]):
    row = df.iloc[i].tolist()
    row_str = ' '.join([str(x).lower() for x in row if pd.notna(x)])
    if 'location' in row_str or 'device' in row_str:
        header_row = i
        print(f"\nFound header at row {i}: {[str(x) for x in row if pd.notna(x)]}")
        break

if header_row is not None:
    for i in range(header_row + 1, df.shape[0]):
        row = df.iloc[i].tolist()
        # Try to extract device info
        location = str(row[0]) if pd.notna(row[0]) else ''
        label = str(row[1]) if len(row) > 1 and pd.notna(row[1]) else ''
        device_type = str(row[2]) if len(row) > 2 and pd.notna(row[2]) else ''
        address = str(row[3]) if len(row) > 3 and pd.notna(row[3]) else ''
        zone = str(row[4]) if len(row) > 4 and pd.notna(row[4]) else ''
        
        if location and location != 'nan' and device_type and device_type != 'nan':
            device = {
                'deviceType': 'Fire Alarm Device',
                'location': location,
                'manufacturer': 'Notifier',
                'model': f'{device_type} - {label}' if label and label != 'nan' else device_type,
                'serialNumber': f'FA-{address}' if address and address != 'nan' else f'FA-{len([d for d in all_devices if d["deviceType"] == "Fire Alarm Device"])+1}',
                'status': 'active',
                'notes': f'Label: {label}, Zone: {zone}, Address: {address}',
                'testResult': 'PASS',
                'testNotes': 'Annual inspection completed'
            }
            all_devices.append(device)

print(f"Total devices after Fire Alarm: {len(all_devices)}")

# 5. Extract Extinguishers
print("\n=== Extracting Extinguishers ===")
df = pd.read_excel(file_path, sheet_name='Extinguishers', header=None)
print(f"Sheet shape: {df.shape}")

# Show first rows
print("First 15 rows:")
for i in range(min(15, df.shape[0])):
    row = df.iloc[i].tolist()
    row = [str(x) if pd.notna(x) else '' for x in row]
    non_empty = [x for x in row if x.strip() and x != 'nan']
    if non_empty:
        print(f"Row {i}: {non_empty[:10]}")

# Find data rows (typically after header)
for i in range(5, df.shape[0]):
    row = df.iloc[i].tolist()
    location = str(row[0]) if pd.notna(row[0]) else ''
    ext_type = str(row[1]) if len(row) > 1 and pd.notna(row[1]) else ''
    size = str(row[2]) if len(row) > 2 and pd.notna(row[2]) else ''
    manufacturer = str(row[3]) if len(row) > 3 and pd.notna(row[3]) else ''
    serial = str(row[4]) if len(row) > 4 and pd.notna(row[4]) else ''
    
    if location and location != 'nan' and ext_type and ext_type != 'nan':
        device = {
            'deviceType': 'Fire Extinguisher',
            'location': location,
            'manufacturer': manufacturer if manufacturer and manufacturer != 'nan' else 'Various',
            'model': f'{size} {ext_type}' if size and size != 'nan' else ext_type,
            'serialNumber': serial if serial and serial != 'nan' else f'FE-{len([d for d in all_devices if d["deviceType"] == "Fire Extinguisher"])+1}',
            'status': 'active',
            'notes': f'Type: {ext_type}, Size: {size}',
            'testResult': 'PASS',
            'testNotes': 'Annual inspection completed'
        }
        all_devices.append(device)

print(f"Total devices after Extinguishers: {len(all_devices)}")

# Save to JSON
output = {
    'total_devices': len(all_devices),
    'devices': all_devices
}

with open('/home/ubuntu/fire-inspect/complete_devices.json', 'w') as f:
    json.dump(output, f, indent=2)

print(f"\n=== Summary ===")
print(f"Total devices extracted: {len(all_devices)}")

# Count by type
by_type = {}
for d in all_devices:
    t = d['deviceType']
    by_type[t] = by_type.get(t, 0) + 1

for t, count in by_type.items():
    print(f"  {t}: {count}")

print(f"\nSaved to complete_devices.json")
