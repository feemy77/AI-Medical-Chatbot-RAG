import os
import sys

# Backend folder ko system path mein add karna
sys.path.append(os.path.join(os.path.dirname(__file__), '../backend'))

# FastAPI app ko import karna
from main import app