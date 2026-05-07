import asyncio
import json
import os
import uuid
import tempfile
import re
import shutil
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI

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
    print(f"New connection attempt from: {websocket.client}")
    await websocket.accept()
    print("Connection accepted")
    process = None
    temp_file_path = None

    async def read_stream(stream, stream_type):
        try:
            while True:
                data = await stream.read(1024)
                if not data:
                    break
                await websocket.send_json({"type": stream_type, "data": data.decode('utf-8')})
        except Exception:
            pass

    try:
        while True:
            message_text = await websocket.receive_text()
            data = json.loads(message_text)

            if data.get("type") == "run":
                if process and process.returncode is None:
                    try:
                        process.kill()
                    except: pass

                language = data.get("language")
                code = data.get("code")

                # Generate temp file
                temp_dir = tempfile.gettempdir()
                filename = f"code_{uuid.uuid4().hex}"
                files_to_cleanup = []

                try:
                    if language == "python":
                        temp_file_path = os.path.join(temp_dir, f"{filename}.py")
                        with open(temp_file_path, "w", encoding="utf-8") as f:
                            f.write(code)
                        files_to_cleanup.append(temp_file_path)
                        cmd = ["python", "-u", temp_file_path]
                    elif language == "javascript":
                        temp_file_path = os.path.join(temp_dir, f"{filename}.js")
                        with open(temp_file_path, "w", encoding="utf-8") as f:
                            f.write(code)
                        files_to_cleanup.append(temp_file_path)
                        cmd = ["node", temp_file_path]
                    elif language == "cpp":
                        temp_file_path = os.path.join(temp_dir, f"{filename}.cpp")
                        exe_path = os.path.join(temp_dir, f"{filename}.exe" if os.name == 'nt' else filename)
                        with open(temp_file_path, "w", encoding="utf-8") as f:
                            f.write(code)
                        files_to_cleanup.extend([temp_file_path, exe_path])
                        compile_process = await asyncio.create_subprocess_exec(
                            "g++", temp_file_path, "-o", exe_path,
                            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                        )
                        stdout, stderr = await compile_process.communicate()
                        if compile_process.returncode != 0:
                            err_msg = format_error_message(stderr.decode('utf-8'), language)
                            await websocket.send_json({"type": "error", "data": err_msg})
                            await websocket.send_json({"type": "exit", "code": compile_process.returncode})
                            continue
                        cmd = [exe_path]
                    elif language == "c":
                        temp_file_path = os.path.join(temp_dir, f"{filename}.c")
                        exe_path = os.path.join(temp_dir, f"{filename}.exe" if os.name == 'nt' else filename)
                        with open(temp_file_path, "w", encoding="utf-8") as f:
                            f.write(code)
                        files_to_cleanup.extend([temp_file_path, exe_path])
                        compile_process = await asyncio.create_subprocess_exec(
                            "gcc", temp_file_path, "-o", exe_path,
                            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                        )
                        stdout, stderr = await compile_process.communicate()
                        if compile_process.returncode != 0:
                            err_msg = format_error_message(stderr.decode('utf-8'), language)
                            await websocket.send_json({"type": "error", "data": err_msg})
                            await websocket.send_json({"type": "exit", "code": compile_process.returncode})
                            continue
                        cmd = [exe_path]
                    elif language == "java":
                        java_temp_dir = tempfile.mkdtemp()
                        temp_file_path = os.path.join(java_temp_dir, "Main.java")
                        class_file_path = os.path.join(java_temp_dir, "Main.class")
                        with open(temp_file_path, "w", encoding="utf-8") as f:
                            f.write(code)
                        files_to_cleanup.extend([temp_file_path, class_file_path, java_temp_dir])
                        compile_process = await asyncio.create_subprocess_exec(
                            "javac", temp_file_path,
                            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                        )
                        stdout, stderr = await compile_process.communicate()
                        if compile_process.returncode != 0:
                            err_msg = format_error_message(stderr.decode('utf-8'), language)
                            await websocket.send_json({"type": "error", "data": err_msg})
                            await websocket.send_json({"type": "exit", "code": compile_process.returncode})
                            continue
                        cmd = ["java", "-cp", java_temp_dir, "Main"]
                    elif language == "r":
                        temp_file_path = os.path.join(temp_dir, f"{filename}.R")
                        with open(temp_file_path, "w", encoding="utf-8") as f:
                            f.write(code)
                        files_to_cleanup.append(temp_file_path)
                        cmd = ["Rscript", temp_file_path]
                    else:
                        await websocket.send_json({"type": "error", "data": f"Language {language} not supported yet.\n"})
                        await websocket.send_json({"type": "exit", "code": 1})
                        continue

                    # Timeout and Output Limit Logic
                    EXECUTION_TIMEOUT = 5.0
                    MAX_OUTPUT_BYTES = 100 * 1024
                    output_bytes_count = 0
                    execution_terminated = False

                    process = await asyncio.create_subprocess_exec(
                        *cmd,
                        stdin=asyncio.subprocess.PIPE,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                except FileNotFoundError as e:
                    tool_name = str(e).split()[-1]
                    await websocket.send_json({"type": "error", "data": f"\n⚠️ Command not found: {tool_name}\nMake sure the compiler/runtime for {language} is installed and added to your system PATH.\n"})
                    await websocket.send_json({"type": "exit", "code": 1})
                    continue

                async def read_stream(stream, stream_type):
                    nonlocal output_bytes_count, execution_terminated
                    try:
                        while not execution_terminated:
                            data = await stream.read(1024)
                            if not data:
                                break
                            
                            output_bytes_count += len(data)
                            if output_bytes_count > MAX_OUTPUT_BYTES:
                                execution_terminated = True
                                if process.returncode is None:
                                    try:
                                        process.kill()
                                    except: pass
                                await websocket.send_json({"type": "error", "data": "\n\n⚠️ Execution halted: Output limit exceeded (too much data printed)\n"})
                                break
                                
                            await websocket.send_json({"type": stream_type, "data": data.decode('utf-8', errors='replace')})
                    except Exception:
                        pass

                async def read_stderr():
                    nonlocal output_bytes_count, execution_terminated
                    try:
                        while not execution_terminated:
                            chunk = await process.stderr.read(1024)
                            if not chunk:
                                break
                            
                            output_bytes_count += len(chunk)
                            if output_bytes_count > MAX_OUTPUT_BYTES:
                                execution_terminated = True
                                if process.returncode is None:
                                    try:
                                        process.kill()
                                    except: pass
                                await websocket.send_json({"type": "error", "data": "\n\n⚠️ Execution halted: Output limit exceeded\n"})
                                break

                            err_str = chunk.decode('utf-8', errors='replace')
                            formatted_err = format_error_message(err_str, language)
                            await websocket.send_json({"type": "error", "data": formatted_err})
                    except Exception:
                        pass

                async def timeout_watcher():
                    nonlocal execution_terminated
                    await asyncio.sleep(EXECUTION_TIMEOUT)
                    if process.returncode is None:
                        execution_terminated = True
                        try:
                            process.kill()
                        except: pass
                        await websocket.send_json({"type": "error", "data": "\n\n⚠️ Execution halted: Time limit exceeded (5s)\n"})

                # Start tasks
                stdout_task = asyncio.create_task(read_stream(process.stdout, "output"))
                stderr_task = asyncio.create_task(read_stderr())
                timeout_task = asyncio.create_task(timeout_watcher())

                async def wait_for_exit():
                    code = await process.wait()
                    # Cancel timeout watcher if process finished naturally
                    if not timeout_task.done():
                        timeout_task.cancel()
                    
                    await websocket.send_json({"type": "exit", "code": code})
                    for p in files_to_cleanup:
                        if os.path.exists(p):
                            try:
                                if os.path.isdir(p):
                                    shutil.rmtree(p, ignore_errors=True)
                                else:
                                    os.remove(p)
                            except: pass
                
                asyncio.create_task(wait_for_exit())

            elif data.get("type") == "input":
                if process and process.returncode is None and process.stdin:
                    user_input = data.get("input", "")
                    process.stdin.write(user_input.encode('utf-8'))
                    await process.stdin.drain()
            
            elif data.get("type") == "stop":
                if process and process.returncode is None:
                    try:
                        process.kill()
                    except: pass

    except WebSocketDisconnect:
        if process and process.returncode is None:
            try:
                process.kill()
            except: pass
        try:
            for p in files_to_cleanup:
                if os.path.exists(p):
                    if os.path.isdir(p):
                        shutil.rmtree(p, ignore_errors=True)
                    else:
                        os.remove(p)
        except: pass
    except Exception as e:
        print("WS Error:", e)

@app.get("/")
def home():
    return {"message": "Backend running"}

@app.get("/health")
def health():
    return {"status": "ok"}