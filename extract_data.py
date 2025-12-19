#!/usr/bin/env python3
"""Extract all relevant inspection data from the Excel file."""

import pandas as pd
import json
import re

file_path = '/home/ubuntu/fire-inspect/inspection_data.xlsm'
xl = pd.ExcelFile(file_path)

print("All sheets:", xl.sheet_names)

# Extract site/customer info from Work Site Info
print("\n" + "="*60)
print("EXTRACTING FROM WORK SITE INFO")
print("="*60)

work_site_df = pd.read_excel(file_path, sheet_name='Work Site Info', header=None)
print(work_site_df.head(40).to_string())

# Extract from Cover Sheet
print("\n" + "="*60)
print("EXTRACTING FROM COVER SHEET")
print("="*60)

cover_df = pd.read_excel(file_path, sheet_name='Cover Sheet', header=None)
print(cover_df.head(40).to_string())

# Extract from Inspection Summary
print("\n" + "="*60)
print("EXTRACTING FROM INSPECTION SUMMARY")
print("="*60)

summary_df = pd.read_excel(file_path, sheet_name='Inspection Summary', header=None)
print(summary_df.head(50).to_string())

# Extract from Fire Alarm sheet (likely has devices)
print("\n" + "="*60)
print("EXTRACTING FROM FIRE ALARM SHEET")
print("="*60)

fa_df = pd.read_excel(file_path, sheet_name='Fire Alarm', header=None)
print(fa_df.head(80).to_string())
print(f"\nShape: {fa_df.shape}")

# Extract from Deficiency List
print("\n" + "="*60)
print("EXTRACTING FROM DEFICIENCY LIST DEC 2024")
print("="*60)

def_df = pd.read_excel(file_path, sheet_name='Deficiency List DEC 2024', header=None)
print(def_df.head(50).to_string())
print(f"\nShape: {def_df.shape}")

# Extract from Sprinkler Devices
print("\n" + "="*60)
print("EXTRACTING FROM SPRINKLER DEVICES")
print("="*60)

sprinkler_df = pd.read_excel(file_path, sheet_name='Sprinkler Devices', header=None)
print(sprinkler_df.head(50).to_string())

# Extract from Emergency Lights
print("\n" + "="*60)
print("EXTRACTING FROM EMERGENCY LIGHTS")
print("="*60)

emerg_df = pd.read_excel(file_path, sheet_name='Emergency Lights', header=None)
print(emerg_df.head(50).to_string())

# Extract from Extinguishers
print("\n" + "="*60)
print("EXTRACTING FROM EXTINGUISHERS")
print("="*60)

ext_df = pd.read_excel(file_path, sheet_name='Extinguishers', header=None)
print(ext_df.head(50).to_string())
