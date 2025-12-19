#!/usr/bin/env python3
"""Extract deficiencies with full details from the Excel file."""

import pandas as pd
import json

file_path = '/home/ubuntu/fire-inspect/inspection_data.xlsm'

# Read deficiency list with more detail
print("Reading Deficiency List DEC 2024...")
def_df = pd.read_excel(file_path, sheet_name='Deficiency List DEC 2024', header=None)

print(f"Shape: {def_df.shape}")
print("\nFull content:")
pd.set_option('display.max_columns', None)
pd.set_option('display.width', None)
pd.set_option('display.max_colwidth', 100)
pd.set_option('display.max_rows', 100)
print(def_df.to_string())

# Also check the other deficiency list
print("\n" + "="*80)
print("Reading Deficiency List (other sheet)...")
def_df2 = pd.read_excel(file_path, sheet_name='Deficiency List', header=None)
print(f"Shape: {def_df2.shape}")
print("\nFull content:")
print(def_df2.to_string())
