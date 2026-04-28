import React, { useState, useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  Play,
  Square,
  Monitor,
  X,
  Plus,
  Copy,
  Download,
  Sun,
  Moon,
  FileCode2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';

interface Language {
  id: string;
  name: string;
  version: string;
  snippet: string;
  pistonId: string;
  emoji: string;
  ext: string;
}

const PYTHON: Language = {
  id: 'python',
  name: 'Python',
  version: '3.12.5',
  pistonId: '100',
  emoji: '🐍',
  ext: 'py',
  snippet: `import math
import random

# Define a class for the core logic
class Engine:
    def __init__(self, name):
        self.name = name
        self.version = "1.0.4"
    
    def execute(self):
        print(f"Initializing {self.name} v{self.version}...")
        print("Hello, World!")

app = Engine("CompilerHub")
app.execute()`,
};

const LANGUAGES: Language[] = [PYTHON];

interface OutputLine {
  timestamp: string;
  text: string;
  type: 'stdout' | 'stderr' | 'system' | 'user-input';
}

interface FileTab {
  id: string;
  name: string;
  content: string;
  isMain: boolean;
}

function App() {
  const [selectedLang] = useState<Language>(PYTHON);
  const [files, setFiles] = useState<FileTab[]>([
    { id: 'main', name: `main.${PYTHON.ext}`, content: PYTHON.snippet, isMain: true }
  ]);
  const [activeFileId, setActiveFileId] = useState<string>('main');

  const [stdin, setStdin] = useState<string>('');
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [leftWidth, setLeftWidth] = useState(60); // percentage
  const [outputFontSize, setOutputFontSize] = useState(16);
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [isResizing, setIsResizing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('compiler_theme');
    return saved !== 'light';
  });

  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stdinRef = useRef<HTMLInputElement>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  const activeFile = files.find(f => f.id === activeFileId) || files[0];

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output, isRunning]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('compiler_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const updateActiveFileCode = (value: string) => {
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: value } : f));
  };

  const addFile = () => {
    const newId = `file-${Date.now()}`;
    const newName = `untitled-${files.length}.${selectedLang.ext}`;
    const newFile = { id: newId, name: newName, content: '', isMain: false };
    
    const activeIndex = files.findIndex(f => f.id === activeFileId);
    const newFiles = [...files];
    newFiles.splice(activeIndex + 1, 0, newFile); // Open to the right
    
    setFiles(newFiles);
    setActiveFileId(newId);
  };

  const closeFile = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (id === 'main') return;
    
    const newFiles = files.filter(f => f.id !== id);
    if (activeFileId === id) {
      const closedIndex = files.findIndex(f => f.id === id);
      const prevFile = files[closedIndex - 1] || files[0];
      setActiveFileId(prevFile.id);
    }
    setFiles(newFiles);
  };

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing && containerRef.current) {
      window.requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const containerWidth = containerRef.current.clientWidth;
        const newLeftWidth = (e.clientX / containerWidth) * 100;
        if (newLeftWidth > 15 && newLeftWidth < 85) {
          setLeftWidth(newLeftWidth);
        }
      });
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const stopCode = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }));
    }
    setIsRunning(false);
  };

  const runCode = () => {
    if (isRunning) {
      stopCode();
      return;
    }
    
    setIsRunning(true);
    setExitCode(null);
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    setOutput([]);
    
    if (ws) {
      ws.close();
    }

    const socket = new WebSocket('ws://localhost:8000/ws');
    
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'run', language: selectedLang.id, code: activeFile.content }));
    };

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'output') {
        setOutput(prev => {
          const lines = msg.data.split('\n');
          const newOut = [...prev];
          lines.forEach((l: string, i: number) => {
             if (i === 0 && newOut.length > 0 && !newOut[newOut.length-1].text.endsWith('\n') && newOut[newOut.length-1].type === 'stdout') {
                 newOut[newOut.length-1].text += l;
             } else if (l !== '') {
                 newOut.push({ timestamp, text: l, type: 'stdout' });
             } else if (l === '' && i < lines.length - 1) {
                 newOut.push({ timestamp, text: '', type: 'stdout' });
             }
          });
          return newOut;
        });
      } else if (msg.type === 'error') {
        setOutput(prev => [...prev, { timestamp, text: msg.data, type: 'stderr' }]);
      } else if (msg.type === 'exit') {
        setExitCode(msg.code);
        setIsRunning(false);
      }
    };

    socket.onerror = (error) => {
      setOutput(prev => [...prev, { timestamp, text: 'WebSocket error: Could not connect to the Python backend on port 8000.\nMake sure you are running `npm run dev` which starts the FastAPI backend.', type: 'stderr' }]);
      setIsRunning(false);
    };

    socket.onclose = () => {
      setIsRunning(false);
    };

    setWs(socket);
  };

  useEffect(() => {
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [ws]);

  const copyCode = () => {
    navigator.clipboard.writeText(activeFile.content);
  };

  const downloadCode = () => {
    const blob = new Blob([activeFile.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-container" ref={containerRef}>
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo-container">
            <span className="logo-icon">{'<'}</span>
            <span className="logo-text">CompilerHub</span>
            <span className="logo-icon">{'>'}</span>
          </div>
        </div>
        <div className="header-right">
          {/* Static Python badge — no dropdown needed */}
          <div className="python-badge">
            <span className="lang-emoji">{PYTHON.emoji}</span>
            <div className="lang-info">
              <span className="lang-name">{PYTHON.name}</span>
              <span className="lang-version">{PYTHON.version}</span>
            </div>
          </div>

          <button
            className="icon-btn theme-toggle"
            onClick={toggleTheme}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content" style={{ cursor: isResizing ? 'col-resize' : 'default' }}>
        {/* Editor Part */}
        <div className="editor-part" style={{ width: `${leftWidth}%` }}>
          <div className="section-header">
            <h2 className="section-title">Editor</h2>
            <div className="action-icons">
              <div className="font-size-control">
                <Monitor size={14} />
                <input
                  type="range"
                  min="10"
                  max="24"
                  value={editorFontSize}
                  onChange={(e) => setEditorFontSize(parseInt(e.target.value))}
                  className="font-slider"
                  title="Editor Font Size"
                />
              </div>
              <button className="icon-btn add-tab-btn" title="New File" onClick={addFile}><Plus size={18} /></button>
              <button className="icon-btn" onClick={copyCode} title="Copy Code"><Copy size={18} /></button>
              <button className="icon-btn" onClick={downloadCode} title="Download Code"><Download size={18} /></button>
              <button
                className="icon-btn run-icon-btn"
                onClick={runCode}
                title={isRunning ? "Stop Code" : "Run Code"}
                style={{ color: isRunning ? '#ef4444' : '#eab308' }}
              >
                {isRunning ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              </button>
            </div>
          </div>

          <div className="editor-tabs">
            {files.map(file => (
              <div 
                key={file.id}
                className={`editor-tab ${activeFileId === file.id ? 'active' : ''} ${files.length > 1 ? 'closeable' : ''}`}
                onClick={() => setActiveFileId(file.id)}
              >
                <span className="tab-icon">
                  {file.isMain ? PYTHON.emoji : <FileCode2 size={14} />}
                </span>
                <span className="tab-name">{file.name}</span>
                {/* Show close button only when there are multiple tabs AND it's not the main file */}
                {!file.isMain && files.length > 1 && (
                  <button 
                    className="tab-close-btn" 
                    onClick={(e) => closeFile(e, file.id)}
                  >
                    <X size={12} />
                  </button>
                )}
                {activeFileId === file.id && <span className="tab-indicator"></span>}
              </div>
            ))}
          </div>

          <div className="editor-wrapper">
            <Editor
              height="100%"
              language={selectedLang.id === 'cpp' ? 'cpp' : selectedLang.id}
              value={activeFile.content}
              theme={isDarkMode ? "vs-dark" : "light"}
              onChange={(value) => updateActiveFileCode(value || '')}
              onMount={handleEditorDidMount}
              options={{
                fontSize: editorFontSize,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                minimap: { enabled: false },
                scrollbar: {
                  vertical: 'visible',
                  horizontal: 'visible',
                  verticalScrollbarSize: 10,
                  horizontalScrollbarSize: 10,
                },
                lineNumbers: 'on',
                glyphMargin: false,
                folding: true,
                lineDecorationsWidth: 10,
                lineNumbersMinChars: 3,
                automaticLayout: true,
                backgroundColor: '#0e0e0e',
                padding: { top: 16 },
                renderLineHighlight: 'all',
              }}
            />
          </div>
        </div>

        {/* Resizer */}
        <div className="resizer" onMouseDown={startResizing}>
          <div className="resizer-line"></div>
          <div className="resizer-handle">
            <span>•</span>
            <span>•</span>
            <span>•</span>
          </div>
        </div>

        {/* Output Part */}
        <div className="output-part" style={{ width: `${100 - leftWidth}%` }}>
          <div className="section-header">
            <h2 className="section-title">Terminal Output</h2>
            <div className="section-header-right">
              <div className="font-size-control">
                <Monitor size={14} />
                <input
                  type="range"
                  min="10"
                  max="24"
                  value={outputFontSize}
                  onChange={(e) => setOutputFontSize(parseInt(e.target.value))}
                  className="font-slider"
                  title="Output Font Size"
                />
              </div>
              <button className="icon-btn clear-btn" onClick={() => setOutput([])} title="Clear Output">
                Clear
              </button>
            </div>
          </div>

          <div className="output-body">
            <div 
              className="output-log" 
              style={{ fontSize: `${outputFontSize}px` }}
              onClick={() => {
                const selection = window.getSelection();
                if (selection && selection.toString().length > 0) return; // Prevent focus if user is selecting text
                
                if (isRunning && stdinRef.current) {
                  stdinRef.current.focus();
                }
              }}
            >
              <div className="output-status-text">
                {output.length === 0 && !isRunning && "Click Run to see output"}
                {isRunning && "Running process..."}
              </div>

              {output.map((line, i) => (
                <div key={i} className="output-line">
                  <span className="output-text" style={{
                    color: line.type === 'stderr' ? '#f87171' : line.type === 'system' ? 'var(--text-muted)' : 'var(--text-primary)',
                    fontStyle: line.type === 'system' ? 'italic' : 'normal',
                    fontWeight: line.type === 'user-input' ? '600' : '400'
                  }}>
                    {line.text}
                  </span>
                </div>
              ))}

              {isRunning && (
                <div className="output-line seamless-input-wrapper" style={{ display: 'flex' }}>
                  <input 
                    ref={stdinRef}
                    className="seamless-stdin"
                    value={stdin}
                    onChange={(e) => setStdin(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (ws && ws.readyState === WebSocket.OPEN) {
                          ws.send(JSON.stringify({ type: 'input', input: stdin + '\n' }));
                          setOutput(prev => [...prev, { timestamp: '', text: stdin + '\n', type: 'user-input' }]);
                          setStdin('');
                        }
                      }
                    }}
                    autoFocus
                  />
                </div>
              )}

              {exitCode !== null && (
                <div className="output-exit-code" style={{ color: exitCode === 0 ? '#22c55e' : '#ef4444' }}>
                  {exitCode === 0 ? '✓ Process finished successfully' : `⚠ Process finished with error (Exit code: ${exitCode})`}
                </div>
              )}
              <div ref={endOfMessagesRef} />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>© 2026 CompilerHub. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default App;
