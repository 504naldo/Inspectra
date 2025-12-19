#!/usr/bin/env python3
"""Extract full inspection data from the Excel file."""

import pandas as pd
import json
import re

file_path = '/home/ubuntu/fire-inspect/inspection_data.xlsm'

# Read Fire Alarm sheet to get device details
print("="*80)
print("FIRE ALARM SHEET - Looking for device data")
print("="*80)

fa_df = pd.read_excel(file_path, sheet_name='Fire Alarm', header=None)
pd.set_option('display.max_columns', None)
pd.set_option('display.width', None)
pd.set_option('display.max_colwidth', 80)

# Print first 100 rows to find device data
print(fa_df.head(100).to_string())

# Read Inspection Summary for device counts
print("\n" + "="*80)
print("INSPECTION SUMMARY - Device counts and results")
print("="*80)

summary_df = pd.read_excel(file_path, sheet_name='Inspection Summary', header=None)
print(summary_df.to_string())

# Read Summary Sheet
print("\n" + "="*80)
print("SUMMARY SHEET")
print("="*80)

sum_sheet_df = pd.read_excel(file_path, sheet_name='Summary Sheet', header=None)
print(sum_sheet_df.head(60).to_string())
