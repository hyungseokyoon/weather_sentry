#!/usr/bin/env python3
import subprocess
import time
import urllib.request
import urllib.error
import sys

IMAGE_NAME = "weather-tracker-test"
CONTAINER_NAME = "weather-sentry-test"
TEST_PORT = "6544"

def run_cmd(cmd, check=True):
    print(f"Executing: {' '.join(cmd)}")
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if check and result.returncode != 0:
        print(f"Error executing command: {' '.join(cmd)}")
        print(f"STDOUT:\n{result.stdout}")
        print(f"STDERR:\n{result.stderr}")
        raise RuntimeError(f"Command failed: {result.stderr}")
    return result

def main():
    passed = False
    print("=== Starting NimbusShield Build & Deployment Test ===")
    
    try:
        # 1. Clean up any leftover test containers from previous runs
        print("Cleaning up existing test container if any...")
        subprocess.run(["docker", "rm", "-f", CONTAINER_NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # 2. Build the Docker image
        print("Step 1: Building Docker image...")
        run_cmd(["docker", "build", "-t", IMAGE_NAME, "."])
        print("Image built successfully.")
        
        # 3. Run the container on the test port
        print(f"Step 2: Starting container '{CONTAINER_NAME}' on port {TEST_PORT}...")
        run_cmd([
            "docker", "run", "-d", 
            "-p", f"{TEST_PORT}:6543", 
            "--name", CONTAINER_NAME, 
            IMAGE_NAME
        ])
        
        # 4. Wait for Nginx to initialize inside the container
        print("Waiting for container startup...")
        time.sleep(3)
        
        # 5. Send HTTP request to verify server is up and serving index.html
        print(f"Step 3: Probing http://localhost:{TEST_PORT}...")
        url = f"http://localhost:{TEST_PORT}"
        req = urllib.request.Request(url)
        
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                html = response.read().decode('utf-8')
                status = response.status
                
                print(f"Received HTTP Status: {status}")
                if status != 200:
                    raise AssertionError(f"Expected status 200, got {status}")
                
                # Check for critical keywords in index.html to ensure correctness
                if "NimbusShield" not in html:
                    raise AssertionError("Verification failed: 'NimbusShield' title/brand not found in response HTML")
                if "app.js" not in html:
                    raise AssertionError("Verification failed: 'app.js' script dependency not found in response HTML")
                if "style.css" not in html:
                    raise AssertionError("Verification failed: 'style.css' stylesheet dependency not found in response HTML")
                if "leaflet.js" not in html.lower():
                    raise AssertionError("Verification failed: Leaflet.js script dependency not found in response HTML")
                
                # Check for weather sandbox simulator interface elements
                if "simToggle" not in html:
                    raise AssertionError("Verification failed: 'simToggle' checkbox not found in response HTML")
                if "simTargetSelect" not in html:
                    raise AssertionError("Verification failed: 'simTargetSelect' dropdown not found in response HTML")
                if "simTempMin" not in html:
                    raise AssertionError("Verification failed: 'simTempMin' slider not found in response HTML")
                
                print("Content verification succeeded!")
                passed = True
                
        except urllib.error.URLError as e:
            print(f"HTTP connection failed: {e}")
            raise RuntimeError(f"Could not connect to test server: {e}")
            
    except Exception as ex:
        print(f"\n[FAIL] Test encountered an error: {ex}")
        sys.exit(1)
        
    finally:
        # 6. Cleanup container and image
        print("\nStep 4: Cleaning up test container and image...")
        subprocess.run(["docker", "rm", "-f", CONTAINER_NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["docker", "rmi", IMAGE_NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("Cleanup completed.")
        
    if passed:
        print("\n[PASS] Build and deployment verification test SUCCESSFUL!")
        sys.exit(0)
    else:
        print("\n[FAIL] Test did not pass successfully.")
        sys.exit(1)

if __name__ == "__main__":
    main()
