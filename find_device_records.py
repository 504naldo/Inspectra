import pandas as pd
import json

# Load the Excel file
file_path = '/home/ubuntu/fire-inspect/inspection_data.xlsm'

# Get all sheet names
xl = pd.ExcelFile(file_path)
print("All sheet names:")
for i, name in enumerate(xl.sheet_names):
    print(f"  {i}: {name}")

# Look for sheets with "Individual" or similar names
print("\n\nSearching for Individual device record sheet...")
for sheet_name in xl.sheet_names:
    if 'individual' in sheet_name.lower() or 'device record' in sheet_name.lower():
        print(f"\nFound: {sheet_name}")
        df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)
        print(f"Shape: {df.shape}")
        print("\nAll rows:")
        for i in range(min(100, df.shape[0])):
            row_data = df.iloc[i].tolist()
            row_data = [str(x) if pd.notna(x) else '' for x in row_data]
            non_empty = [x for x in row_data if x.strip()]
            if non_empty:
                print(f"Row {i}: {non_empty}")

# Also check sheets that might have device test results
print("\n\n=== Checking for Fire Alarm device records ===")
for sheet_name in xl.sheet_names:
    if 'fire alarm' in sheet_name.lower() or 'alarm' in sheet_name.lower():
        print(f"\nSheet: {sheet_name}")
        df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)
        print(f"Shape: {df.shape}")
        # Show all content
        for i in range(min(50, df.shape[0])):
            row_data = df.iloc[i].tolist()
            row_data = [str(x) if pd.notna(x) else '' for x in row_data]
            non_empty = [x for x in row_data if x.strip()]
            if non_empty:
                print(f"Row {i}: {non_empty}")
