import pandas as pd
import json

# Load the Excel file
file_path = '/home/ubuntu/fire-inspect/inspection_data.xlsm'

# Get all sheet names
xl = pd.ExcelFile(file_path)
print("All sheet names:")
for name in xl.sheet_names:
    print(f"  - {name}")

# Find sheets that might contain individual device records
device_sheets = [name for name in xl.sheet_names if 'device' in name.lower() or 'individual' in name.lower() or 'record' in name.lower()]
print(f"\nPotential device record sheets: {device_sheets}")

# Try to read each potential sheet
for sheet_name in xl.sheet_names:
    print(f"\n\n=== Sheet: {sheet_name} ===")
    try:
        df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)
        print(f"Shape: {df.shape}")
        
        # Show first 30 rows to understand structure
        if df.shape[0] > 0:
            print("\nFirst 30 rows:")
            for i in range(min(30, df.shape[0])):
                row_data = df.iloc[i].tolist()
                # Filter out NaN values for cleaner output
                row_data = [str(x) if pd.notna(x) else '' for x in row_data]
                non_empty = [x for x in row_data if x.strip()]
                if non_empty:
                    print(f"Row {i}: {non_empty[:10]}")  # Show first 10 non-empty values
    except Exception as e:
        print(f"Error reading sheet: {e}")
