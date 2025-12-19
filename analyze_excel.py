#!/usr/bin/env python3
"""Analyze the structure of the inspection Excel file."""

import pandas as pd
import json

# Read the Excel file
file_path = '/home/ubuntu/fire-inspect/inspection_data.xlsm'

# Get all sheet names
xl = pd.ExcelFile(file_path)
print("=" * 60)
print("SHEET NAMES:")
print("=" * 60)
for i, sheet in enumerate(xl.sheet_names):
    print(f"{i+1}. {sheet}")

print("\n" + "=" * 60)
print("ANALYZING EACH SHEET:")
print("=" * 60)

# Analyze each sheet
for sheet_name in xl.sheet_names:
    print(f"\n--- Sheet: {sheet_name} ---")
    try:
        df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)
        print(f"Shape: {df.shape[0]} rows x {df.shape[1]} columns")
        
        # Show first 20 rows to understand structure
        if df.shape[0] > 0:
            print("\nFirst 20 rows preview:")
            pd.set_option('display.max_columns', None)
            pd.set_option('display.width', None)
            pd.set_option('display.max_colwidth', 50)
            print(df.head(20).to_string())
    except Exception as e:
        print(f"Error reading sheet: {e}")

print("\n" + "=" * 60)
print("DONE")
print("=" * 60)
