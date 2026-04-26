import asyncio
import json
import os
import uuid
import tempfile
import re
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
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
                    process.terminate()

                language = data.get("language")
                code = data.get("code")

                # Generate temp file
                temp_dir = tempfile.gettempdir()
                filename = f"code_{uuid.uuid4().hex}"

                if language == "python":
                    temp_file_path = os.path.join(temp_dir, f"{filename}.py")
                    with open(temp_file_path, "w", encoding="utf-8") as f:
                        f.write(code)
                    # Use -u for unbuffered output
                    cmd = ["python", "-u", temp_file_path]
                elif language == "javascript":
                    temp_file_path = os.path.join(temp_dir, f"{filename}.js")
                    with open(temp_file_path, "w", encoding="utf-8") as f:
                        f.write(code)
                    cmd = ["node", temp_file_path]
                else:
                    await websocket.send_json({"type": "error", "data": f"Language {language} not supported yet.\n"})
                    await websocket.send_json({"type": "exit", "code": 1})
                    continue

                # No timeout logic -> Unlimited Execution Time as requested!
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )

                asyncio.create_task(read_stream(process.stdout, "output"))
                
                async def read_stderr():
                    try:
                        while True:
                            chunk = await process.stderr.read(1024)
                            if not chunk:
                                break
                            err_str = chunk.decode('utf-8')
                            if 'ModuleNotFoundError' in err_str or 'ImportError' in err_str:
                                match = re.search(r"No module named '([^']+)'", err_str)
                                module_name = match.group(1) if match else 'unknown'
                                custom_err = f"\n⚠️ This program requires external dependencies that are not available in this environment.\n📦 Missing package: {module_name}\n💡 Suggestion: Try running locally or install required packages.\n\nOriginal Error:\n{err_str}"
                                await websocket.send_json({"type": "error", "data": custom_err})
                            else:
                                await websocket.send_json({"type": "error", "data": err_str})
                    except Exception:
                        pass
                
                asyncio.create_task(read_stderr())

                async def wait_for_exit():
                    code = await process.wait()
                    await websocket.send_json({"type": "exit", "code": code})
                    if temp_file_path and os.path.exists(temp_file_path):
                        try: os.remove(temp_file_path)
                        except: pass
                
                asyncio.create_task(wait_for_exit())

            elif data.get("type") == "input":
                if process and process.returncode is None and process.stdin:
                    user_input = data.get("input", "")
                    process.stdin.write(user_input.encode('utf-8'))
                    await process.stdin.drain()
            
            elif data.get("type") == "stop":
                if process and process.returncode is None:
                    process.terminate()

    except WebSocketDisconnect:
        if process and process.returncode is None:
            process.terminate()
        if temp_file_path and os.path.exists(temp_file_path):
            try: os.remove(temp_file_path)
            except: pass
    except Exception as e:
        print("WS Error:", e)
