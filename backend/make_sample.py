import pandas as pd
import os

print("⏳ Loading the massive CSV file... This might take a minute...")

# Aapne file ka naam .json rakha hua hai, isliye hum wahi path de rahe hain 
# lekin pandas isko CSV ki tarah read karega
big_file_path = 'dataset/release_train_patients.json'
sample_file_path = 'dataset/ddxplus_sample.csv'

try:
    df = pd.read_csv(big_file_path)
    
    # Sirf pehli 10,000 rows ka sample
    df_sample = df.head(10000)
    
    # Ab naye sample ko proper .csv extension ke sath save karenge
    df_sample.to_csv(sample_file_path, index=False)
    print(f"✅ Success! Nayi choti file '{sample_file_path}' ban gayi hai!")
except Exception as e:
    print(f"Error: {e}")