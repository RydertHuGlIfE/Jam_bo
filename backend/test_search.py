from youtubesearchpython import VideosSearch as vss
import sys

try:
    query = "test"
    print(f"Searching for: {query}")
    vsearch = vss(query, limit=10)
    print("Search object created.")
    result = vsearch.result()
    print("Result retrieved:")
    print(result)
except Exception as e:
    print(f"Error occurred: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
