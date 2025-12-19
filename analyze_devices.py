#!/usr/bin/env python3
"""Analyze the device/inspection data from the Excel file."""

import pandas as pd
import json

file_path = '/home/ubuntu/fire-inspect/inspection_data.xlsm'
xl = pd.ExcelFile(file_path)

print("Sheet names:", xl.sheet_names)

# Look for sheets that might contain device inspection data
device_sheets = ['Devices', 'DEVICES', 'Device List', 'Inspection', 'INSPECTION', 'FA Devices', 'Fire Alarm']

# Check each sheet for device-like data
for sheet_name in xl.sheet_names:
    print(f"\n{'='*60}")
    print(f"SHEET: {sheet_name}")
    print('='*60)
    
    try:
        df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)
        
        # Look for device-related keywords in the first 30 rows
        sample = df.head(30).to_string()
        keywords = ['device', 'detector', 'smoke', 'heat', 'pull station', 'horn', 'strobe', 
                   'panel', 'annunciator', 'pass', 'fail', 'location', 'zone', 'loop',
                   'serial', 'model', 'manufacturer', 'type', 'address']
        
        found_keywords = [kw for kw in keywords if kw.lower() in sample.lower()]
        
        if found_keywords:
            print(f"Found keywords: {found_keywords}")
            print(f"\nFirst 40 rows:")
            print(df.head(40).to_string())
            print(f"\nShape: {df.shape}")
    except Exception as e:
        print(f"Error: {e}")
