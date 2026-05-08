import asyncio
import json
import os
import uuid
import tempfile
import re
import shutil
import time
from collections import defaultdict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware

def format_error_message(err_str: str, language: str) -> str:
    # Python
    if language == "python":
        if 'ModuleNotFoundError' in err_str or 'ImportError' in err_str:
            match = re.search(r"No module named '([^']+)'", err_str)
            if match:
                return f"\n⚠️ Required dependency is not available in this environment\n📦 Missing package: {match.group(1)}\n💡 Suggestion: Run locally or install dependencies\n\nOriginal Error:\n{err_str}"
    # Node.js
    elif language == "javascript":
        if "Error: Cannot find module" in err_str:
            match = re.search(r"Cannot find module '([^']+)'", err_str)
            if match:
                return f"\n⚠️ Required dependency is not available in this environment\n📦 Missing package: {match.group(1)}\n💡 Suggestion: Run locally or install dependencies\n\nOriginal Error:\n{err_str}"
    # C/C++
    elif language in ["c", "cpp"]:
        if "fatal error:" in err_str and "No such file or directory" in err_str:
            match = re.search(r"fatal error: (.*?): No such file", err_str)
            if match:
                return f"\n⚠️ Required dependency is not available in this environment\n📦 Missing package: {match.group(1)}\n💡 Suggestion: Run locally or install dependencies\n\nOriginal Error:\n{err_str}"
    # Java
    elif language == "java":
        if "error: package" in err_str and "does not exist" in err_str:
            match = re.search(r"error: package (.*?) does not exist", err_str)
            if match:
                return f"\n⚠️ Required dependency is not available in this environment\n📦 Missing package: {match.group(1)}\n💡 Suggestion: Run locally or install dependencies\n\nOriginal Error:\n{err_str}"
    return err_str

# Global state for scalability
MAX_CONCURRENT_CONNECTIONS = 50
active_connections = 0
MAX_CONCURRENT_EXECUTIONS = 5
execution_semaphore = asyncio.Semaphore(MAX_CONCURRENT_EXECUTIONS)
rate_limit_data = defaultdict(float) # ip -> last_run_timestamp
RATE_LIMIT_COOLDOWN = 1.0 # seconds between runs per IP

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "online", "message": "PyRun Backend is running successfully!"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global active_connections
    if active_connections >= MAX_CONCURRENT_CONNECTIONS:
        await websocket.close(code=1008, reason="Server busy: Too many connections")
        return

    active_connections += 1
    print(f"New connection attempt from: {websocket.client}. Active: {active_connections}")
    await websocket.accept()
    print("Connection accepted")
    
    process = None
    files_to_cleanup = []
    current_task = None
    client_ip = websocket.client.host

    async def run_execution(language, code):
        nonlocal process, files_to_cleanup
        filename = f"code_{uuid.uuid4().hex}"
        temp_dir = tempfile.gettempdir()
        
        try:
            # 1. Prepare Command
            if language == "python":
                temp_file_path = os.path.join(temp_dir, f"{filename}.py")
                with open(temp_file_path, "w", encoding="utf-8") as f: f.write(code)
                files_to_cleanup.append(temp_file_path)
                cmd = ["python", "-u", temp_file_path]
            elif language == "javascript":
                temp_file_path = os.path.join(temp_dir, f"{filename}.js")
                with open(temp_file_path, "w", encoding="utf-8") as f: f.write(code)
                files_to_cleanup.append(temp_file_path)
                cmd = ["node", temp_file_path]
            elif language == "cpp":
                temp_file_path = os.path.join(temp_dir, f"{filename}.cpp")
                exe_path = os.path.join(temp_dir, f"{filename}.exe" if os.name == 'nt' else filename)
                with open(temp_file_path, "w", encoding="utf-8") as f: f.write(code)
                files_to_cleanup.extend([temp_file_path, exe_path])
                compile_process = await asyncio.create_subprocess_exec("g++", temp_file_path, "-o", exe_path, stderr=asyncio.subprocess.PIPE)
                _, stderr = await compile_process.communicate()
                if compile_process.returncode != 0:
                    await websocket.send_json({"type": "error", "data": format_error_message(stderr.decode(), language)})
                    await websocket.send_json({"type": "exit", "code": compile_process.returncode}); return
                cmd = [exe_path]
            elif language == "c":
                temp_file_path = os.path.join(temp_dir, f"{filename}.c")
                exe_path = os.path.join(temp_dir, f"{filename}.exe" if os.name == 'nt' else filename)
                with open(temp_file_path, "w", encoding="utf-8") as f: f.write(code)
                files_to_cleanup.extend([temp_file_path, exe_path])
                compile_process = await asyncio.create_subprocess_exec("gcc", temp_file_path, "-o", exe_path, stderr=asyncio.subprocess.PIPE)
                _, stderr = await compile_process.communicate()
                if compile_process.returncode != 0:
                    await websocket.send_json({"type": "error", "data": format_error_message(stderr.decode(), language)})
                    await websocket.send_json({"type": "exit", "code": compile_process.returncode}); return
                cmd = [exe_path]
            elif language == "java":
                java_dir = tempfile.mkdtemp()
                temp_file_path = os.path.join(java_dir, "Main.java")
                with open(temp_file_path, "w", encoding="utf-8") as f: f.write(code)
                files_to_cleanup.append(java_dir)
                compile_process = await asyncio.create_subprocess_exec("javac", temp_file_path, stderr=asyncio.subprocess.PIPE)
                _, stderr = await compile_process.communicate()
                if compile_process.returncode != 0:
                    await websocket.send_json({"type": "error", "data": format_error_message(stderr.decode(), language)})
                    await websocket.send_json({"type": "exit", "code": compile_process.returncode}); return
                cmd = ["java", "-cp", java_dir, "Main"]
            else:
                await websocket.send_json({"type": "error", "data": f"Language {language} not supported."})
                await websocket.send_json({"type": "exit", "code": 1}); return

            # 2. Execute with Semaphore
            if execution_semaphore.locked():
                await websocket.send_json({"type": "output", "data": "⏳ Server at capacity. Waiting for slot...\n"})
            
            async with execution_semaphore:
                process = await asyncio.create_subprocess_exec(
                    *cmd, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )

                async def read_pipe(pipe, type):
                    try:
                        while True:
                            chunk = await pipe.read(4096)
                            if not chunk: break
                            data = chunk.decode('utf-8', errors='replace')
                            if type == "error": data = format_error_message(data, language)
                            await websocket.send_json({"type": "output" if type == "stdout" else "error", "data": data})
                    except: pass

                await asyncio.gather(read_pipe(process.stdout, "stdout"), read_pipe(process.stderr, "error"), process.wait())
                await websocket.send_json({"type": "exit", "code": process.returncode})

        except asyncio.CancelledError:
            if process and process.returncode is None:
                try: process.kill()
                except: pass
        except Exception as e:
            await websocket.send_json({"type": "error", "data": f"Execution Error: {str(e)}"})
            await websocket.send_json({"type": "exit", "code": 1})
        finally:
            process = None
            for p in files_to_cleanup:
                if os.path.exists(p):
                    if os.path.isdir(p): shutil.rmtree(p, ignore_errors=True)
                    else: os.remove(p)
            files_to_cleanup.clear()

    try:
        while True:
            message = await websocket.receive_text()
            data = json.loads(message)
            msg_type = data.get("type")

            if msg_type == "run":
                # Rate limit
                now = time.time()
                if now - rate_limit_data[client_ip] < RATE_LIMIT_COOLDOWN:
                    await websocket.send_json({"type": "error", "data": "⚠️ Rate limit exceeded.\n"})
                    await websocket.send_json({"type": "exit", "code": 1}); continue
                rate_limit_data[client_ip] = now

                # Cancel previous
                if current_task and not current_task.done():
                    current_task.cancel()
                    if process and process.returncode is None:
                        try: process.kill()
                        except: pass
                
                current_task = asyncio.create_task(run_execution(data.get("language"), data.get("code")))

            elif msg_type == "input":
                if process and process.returncode is None and process.stdin:
                    try:
                        process.stdin.write(data.get("input", "").encode())
                        await process.stdin.drain()
                    except: pass

            elif msg_type == "stop":
                if current_task and not current_task.done():
                    current_task.cancel()
                if process and process.returncode is None:
                    try: process.kill()
                    except: pass

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WS Error: {e}")
    finally:
        active_connections -= 1
        if current_task and not current_task.done(): current_task.cancel()
        if process and process.returncode is None:
            try: process.kill()
            except: pass
        print(f"Connection closed. Active: {active_connections}")

@app.get("/health")
def health():
    return {"status": "healthy"}