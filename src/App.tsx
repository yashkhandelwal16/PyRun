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
import { motion } from 'framer-motion';
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

app = Engine("Compiler")
app.execute()`,
};

const CPP: Language = {
  id: 'cpp',
  name: 'C++',
  version: 'GCC 14.2.0',
  pistonId: '101',
  emoji: '🚀',
  ext: 'cpp',
  snippet: `#include <iostream>
#include <string>

int main() {
    std::string name;
    std::cout << "Enter your name: " << std::flush;
    if (std::getline(std::cin, name)) {
        std::cout << "Hello, " << name << "!" << std::endl;
    }
    return 0;
}`,
};

const LANGUAGES: Language[] = [PYTHON, CPP];

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
  const [selectedLang, setSelectedLang] = useState<Language>(PYTHON);
  const [files, setFiles] = useState<FileTab[]>([
    { id: 'main', name: `main.${PYTHON.ext}`, content: PYTHON.snippet, isMain: true }
  ]);
  const [activeFileId, setActiveFileId] = useState<string>('main');

  const [stdin, setStdin] = useState<string>('');
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null); // use ref so closures always see the live socket
  const [leftWidth, setLeftWidth] = useState(60); // percentage
  const [outputFontSize, setOutputFontSize] = useState(() => {
    return typeof window !== 'undefined' && window.innerWidth <= 1024 ? 13 : 16;
  });
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
  const lastRunTimeRef = useRef<number>(0);

  const activeFile = files.find(f => f.id === activeFileId) || files[0];

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output, isRunning]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('compiler_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const handleLanguageChange = (langId: string) => {
    const lang = LANGUAGES.find(l => l.id === langId);
    if (!lang) return;
    setSelectedLang(lang);
    setFiles(prev => prev.map(f => f.isMain ? { ...f, name: `main.${lang.ext}`, content: lang.snippet } : f));
  };

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
    if (files.length <= 1) return; // Must keep at least one tab
    
    const newFiles = files.filter(f => f.id !== id);
    if (activeFileId === id) {
      const closedIndex = files.findIndex(f => f.id === id);
      const prevFile = files[closedIndex - 1] || files[0];
      setActiveFileId(prevFile.id);
    }
    setFiles(newFiles);
  };


  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((event: MouseEvent | TouchEvent) => {
    if (isResizing && containerRef.current) {
      const e = 'touches' in event ? event.touches[0] : event;
      window.requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const isMobile = window.innerWidth <= 1024;
        if (isMobile) {
          const containerHeight = containerRef.current.clientHeight;
          const rect = containerRef.current.getBoundingClientRect();
          const relativeY = e.clientY - rect.top;
          const newTopHeight = (relativeY / containerHeight) * 100;
          if (newTopHeight > 15 && newTopHeight < 85) {
            setLeftWidth(newTopHeight);
          }
        } else {
          const containerWidth = containerRef.current.clientWidth;
          const newLeftWidth = (e.clientX / containerWidth) * 100;
          if (newLeftWidth > 15 && newLeftWidth < 85) {
            setLeftWidth(newLeftWidth);
          }
        }
      });
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      window.addEventListener('touchmove', resize, { passive: false });
      window.addEventListener('touchend', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('touchmove', resize);
      window.removeEventListener('touchend', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('touchmove', resize);
      window.removeEventListener('touchend', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const stopCode = () => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'stop' }));
      socket.close();
    }
    wsRef.current = null;
    setIsRunning(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  const runCode = () => {
    const now = Date.now();
    if (now - lastRunTimeRef.current < 1000) return; // 1s cooldown
    lastRunTimeRef.current = now;

    if (isConnecting) return; // Ignore clicks while connecting

    if (isRunning) {
      stopCode();
      return;
    }

    // Close any existing socket first
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnecting(true);
    setExitCode(null);
    setOutput([]);
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Use backend URL from env var for production, fallback to localhost for dev
    const backendUrl = import.meta.env.VITE_BACKEND_URL || (window.location.hostname === 'localhost' ? 'http://localhost:8000' : `${window.location.protocol}//${window.location.host}`);
    const backendUrlObj = new URL(backendUrl);
    const protocol = backendUrlObj.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = backendUrlObj.host;
    const socket = new WebSocket(`${protocol}//${host}/ws`);
    wsRef.current = socket; // store immediately so input handler can use it right away

    socket.onopen = () => {
      setIsConnecting(false);
      setIsRunning(true);
      socket.send(JSON.stringify({ type: 'run', language: selectedLang.id, code: activeFile.content }));
    };

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const MAX_LINES = 500;

      if (msg.type === 'output' || msg.type === 'error') {
        setOutput(prev => {
          const type = msg.type === 'error' ? 'stderr' : 'stdout';
          const lines = msg.data.split('\n');
          let newOut = [...prev];
          
          lines.forEach((l: string, i: number) => {
            if (i === 0 && newOut.length > 0 && !newOut[newOut.length - 1].text.endsWith('\n') && newOut[newOut.length - 1].type === type) {
              newOut[newOut.length - 1].text += l;
            } else if (l !== '' || i < lines.length - 1) {
              newOut.push({ timestamp, text: l, type });
            }
          });

          // Limit number of lines to prevent browser freeze
          if (newOut.length > MAX_LINES) {
            newOut = newOut.slice(newOut.length - MAX_LINES);
          }
          return newOut;
        });
      } else if (msg.type === 'exit') {
        setExitCode(msg.code);
        setIsRunning(false);
        wsRef.current = null;
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket Connection Error:", error);
      const ts = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setOutput(prev => {
        const newOut = [...prev, {
          timestamp: ts,
          text: `\u26a0 WebSocket error: Could not connect to backend.\n1. Make sure the backend is running.\n2. Check your connection.`,
          type: 'stderr'
        }];
        return newOut.slice(-500);
      });
      setIsConnecting(false);
      setIsRunning(false);
      wsRef.current = null;
    };

    socket.onclose = () => {
      setIsConnecting(false);
      setIsRunning(false);
      wsRef.current = null;
    };
  };

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

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 1024;

  return (
    <div className="app-container" ref={containerRef}>
      {/* Resizer Overlay to prevent mouse capture during drag */}
      {isResizing && (
        <div 
          className="resizer-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            cursor: isMobile ? 'row-resize' : 'col-resize',
            pointerEvents: 'all'
          }}
        />
      )}
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <motion.div 
            className="logo-container"
            initial="initial"
            whileHover="hover"
          >
            <motion.span 
              className="logo-icon"
              variants={{
                initial: { x: -10, opacity: 0 },
                animate: { x: 0, opacity: 0.85 },
                hover: { x: -3, color: 'var(--accent)', scale: 1.1 }
              }}
              initial="initial"
              animate="animate"
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              {'>>>'}
            </motion.span>
            
            <motion.div className="logo-text-wrapper" style={{ display: 'flex' }}>
              {"PyRun".split("").map((char, index) => (
                <motion.span
                  key={index}
                  className="logo-text"
                  variants={{
                    initial: { y: 10, opacity: 0 },
                    animate: { y: 0, opacity: 1 },
                    hover: { 
                      y: -2,
                      color: 'var(--accent)',
                      transition: { duration: 0.2 }
                    }
                  }}
                  initial="initial"
                  animate="animate"
                  transition={{ 
                    duration: 0.4, 
                    delay: index * 0.1,
                    ease: "easeOut"
                  }}
                  style={{ display: 'inline-block' }}
                >
                  {char}
                </motion.span>
              ))}
            </motion.div>

            <motion.span 
              className="logo-icon"
              variants={{
                initial: { x: 10, opacity: 0 },
                animate: { x: 0, opacity: 0.85 },
                hover: { x: 3, color: 'var(--accent)', scale: 1.1 }
              }}
              initial="initial"
              animate="animate"
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              {'<<<'}
            </motion.span>
          </motion.div>
        </div>
        <div className="header-right">
          {/* Static Python badge — no dropdown needed */}
          {/* Language Selector styled as a Badge */}
          <div className="lang-badge-selector">
            <span className="lang-emoji">{selectedLang.emoji}</span>
            <div className="lang-info">
              <select 
                className="lang-select-ghost" 
                value={selectedLang.id}
                onChange={(e) => handleLanguageChange(e.target.value)}
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.id} value={lang.id}>{lang.name}</option>
                ))}
              </select>
              <span className="lang-version">{selectedLang.version}</span>
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
      <main className="main-content" style={{ cursor: isResizing ? (isMobile ? 'row-resize' : 'col-resize') : 'default' }}>
        {/* Editor Part */}
        <div className="editor-part" style={{ 
          width: isMobile ? '100%' : `${leftWidth}%`,
          height: isMobile ? `${leftWidth}%` : '100%',
          pointerEvents: isResizing ? 'none' : 'auto'
        }}>
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
                id="run-button"
                title="Run Code"
                style={{ 
                  color: (isRunning || isConnecting) ? '#94a3b8' : '#eab308',
                  cursor: (isRunning || isConnecting) ? 'not-allowed' : 'pointer',
                  opacity: (isRunning || isConnecting) ? 0.6 : 1
                }}
                disabled={isRunning || isConnecting}
              >
                {isConnecting ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Play size={18} fill="currentColor" />
                    </motion.div>
                    <span className="run-btn-text">Connecting...</span>
                  </>
                ) : (
                  <>
                    <Play size={18} fill="currentColor" />
                    <span className="run-btn-text">Run</span>
                  </>
                )}
              </button>

              {isRunning && (
                <button
                  className="icon-btn stop-icon-btn"
                  onClick={stopCode}
                  title="Stop Code"
                  style={{ 
                    color: '#ef4444',
                    background: 'rgba(239, 68, 68, 0.1)',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    gap: '6px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <Square size={18} fill="currentColor" />
                  <span className="run-btn-text">Stop</span>
                </button>
              )}
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
                  {file.isMain ? selectedLang.emoji : <FileCode2 size={14} />}
                </span>
                <span className="tab-name">{file.name}</span>
                {/* Show close button on hover for all tabs as long as there are multiple */}
                {files.length > 1 && (
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
              onMount={(editor, monaco) => {
                editorRef.current = editor;

                // Custom Enter key handler for Python-style smart indentation
                // This replaces Monaco's autoIndent while keeping it 'none' to avoid mobile paste issues
                editor.onKeyDown((e) => {
                  if (e.keyCode === monaco.KeyCode.Enter) {
                    const model = editor.getModel();
                    const position = editor.getPosition();
                    if (!model || !position) return;

                    const lineContent = model.getLineContent(position.lineNumber);
                    const indentation = lineContent.match(/^\s*/)?.[0] || "";
                    
                    // Determine if we need an extra level of indentation (Python colon rule)
                    let extraIndent = "";
                    if (lineContent.trim().endsWith(':')) {
                      extraIndent = "    "; // Use 4 spaces for Python
                    }

                    const textToInsert = "\n" + indentation + extraIndent;

                    // Execute edit and move cursor manually
                    editor.executeEdits('smart-indent', [{
                      range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                      text: textToInsert,
                      forceMoveMarkers: true
                    }]);

                    // Update cursor position to the end of the new indentation
                    editor.setPosition({
                      lineNumber: position.lineNumber + 1,
                      column: indentation.length + extraIndent.length + 1
                    });

                    e.preventDefault();
                    e.stopPropagation();
                  }
                });

                // Custom Paste Normalization System (Requirement 7)
                editor.onDidPaste((e) => {
                  const model = editor.getModel();
                  if (!model) return;

                  const range = e.range;
                  const originalText = model.getValueInRange(range);
                  
                  // 1. Convert tabs to 4 spaces (Requirement 8)
                  let processedText = originalText.replace(/\t/g, '    ');

                  // 2. Prevent duplicate indentation on pasted code (Requirement 9)
                  // Check if we are pasting into a line that only has leading whitespace
                  const lineBefore = model.getLineContent(range.startLineNumber).substring(0, range.startColumn - 1);
                  
                  if (/^\s*$/.test(lineBefore)) {
                    const existingIndent = lineBefore;
                    const pastedIndentMatch = processedText.match(/^ +/);
                    
                    if (pastedIndentMatch) {
                      const pastedIndent = pastedIndentMatch[0];
                      // If the pasted text repeats the existing indentation, trim the overlap
                      if (pastedIndent.startsWith(existingIndent) && existingIndent.length > 0) {
                        processedText = processedText.substring(existingIndent.length);
                      }
                    }
                  }

                  if (processedText !== originalText) {
                    editor.executeEdits('paste-normalization', [{
                      range: range,
                      text: processedText,
                      forceMoveMarkers: true
                    }]);
                  }
                });
              }}
              options={{
                fontSize: editorFontSize,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                tabSize: 4,
                insertSpaces: true,
                autoIndent: 'none', // Critical fix for mobile indentation
                formatOnPaste: false, // Critical fix for mobile indentation
                trimAutoWhitespace: false,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                minimap: { enabled: false },
                lineNumbers: 'on',
                folding: true,
                automaticLayout: true,
                padding: { top: 16, bottom: 16 },
                renderLineHighlight: 'all',
                suggestOnTriggerCharacters: false,
                acceptSuggestionOnEnter: 'off',
                quickSuggestions: false,
                wordBasedSuggestions: "off",
                parameterHints: { enabled: false },
                suggest: { showWords: false },
                unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false },
              }}
            />
          </div>
        </div>

        {/* Resizer */}
        <div className="resizer" 
          onMouseDown={startResizing} 
          onTouchStart={() => {
            // No preventDefault here to allow scrolling if needed, but start resize
            setIsResizing(true);
          }}
        >
          <div className="resizer-line"></div>
          <div className="resizer-handle">
            <span>•</span>
            <span>•</span>
            <span>•</span>
          </div>
        </div>

        {/* Output Part */}
        <div className="output-part" style={{ 
          width: isMobile ? '100%' : 'auto',
          height: isMobile ? '0' : '100%', // Use 0 + flex: 1 to ensure it stays in container
          flex: 1,
          pointerEvents: isResizing ? 'none' : 'auto'
        }}>
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
                
                if (!isMobile && isRunning && stdinRef.current) {
                  stdinRef.current.focus();
                }
              }}
            >
              <div className="output-status-text">
                {output.length === 0 && !isRunning && !isConnecting && "Click Run to see output"}
                {isConnecting && "Connecting to execution engine..."}
                {isRunning && "Process started..."}
              </div>

              {output.map((line, i) => (
                <div key={i} className="output-line">
                  <span className="output-text" style={{
                    color: line.type === 'stderr' ? '#f87171' : line.type === 'system' ? 'var(--text-muted)' : 'var(--text-primary)',
                    fontStyle: line.type === 'system' ? 'italic' : 'normal',
                    fontWeight: line.type === 'user-input' ? '600' : 'inherit'
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
                        const socket = wsRef.current; // always read the live ref, never a stale closure
                        if (socket && socket.readyState === WebSocket.OPEN) {
                          socket.send(JSON.stringify({ type: 'input', input: stdin + '\n' }));
                          setOutput(prev => [...prev, { timestamp: '', text: stdin, type: 'user-input' }]);
                          setStdin('');
                        } else {
                          // socket not ready — show a clear diagnostic instead of silently failing
                          setOutput(prev => [...prev, {
                            timestamp: '',
                            text: '⚠ Input not sent: the process is no longer running.',
                            type: 'stderr'
                          }]);
                        }
                      }
                    }}
                    autoFocus={!isMobile}
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
        <p>© 2026 PyRun. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default App;
