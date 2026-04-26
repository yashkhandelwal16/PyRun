import React, { useState, useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  Play,
  Square,
  Settings,
  Monitor,
  X,
  Trash2,
  Wifi,
  Plus,
  Copy,
  Download,
  ChevronDown,
  Sun,
  Moon,
  HelpCircle
} from 'lucide-react';
import axios from 'axios';
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

const LANGUAGES: Language[] = [
  {
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
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    version: '20.17.0',
    pistonId: '97',
    emoji: 'js',
    ext: 'js',
    snippet: `// Define a class for the core logic
class Engine {
  constructor(name) {
    this.name = name;
    this.version = "1.0.4";
  }

  execute() {
    console.log(\`Initializing \${this.name} v\${this.version}...\`);
    console.log("Hello, World!");
  }
}

const app = new Engine("CompilerHub");
app.execute();`,
  },
  {
    id: 'cpp',
    name: 'C++',
    version: '14.1.0',
    pistonId: '105',
    emoji: 'C+',
    ext: 'cpp',
    snippet: `#include <iostream>
#include <string>

class Engine {
public:
    Engine(std::string name) : name(name), version("1.0.4") {}
    
    void execute() {
        std::cout << "Initializing " << name << " v" << version << "..." << std::endl;
        std::cout << "Hello, World!" << std::endl;
    }

private:
    std::string name;
    std::string version;
};

int main() {
    Engine app("CompilerHub");
    app.execute();
    return 0;
}`,
  },
  {
    id: 'java',
    name: 'Java',
    version: '17.0.6',
    pistonId: '91',
    emoji: '☕',
    ext: 'java',
    snippet: `public class Main {
    public static void main(String[] args) {
        Engine app = new Engine("CompilerHub");
        app.execute();
    }
}

class Engine {
    private String name;
    private String version = "1.0.4";

    public Engine(String name) {
        this.name = name;
    }

    public void execute() {
        System.out.println("Initializing " + name + " v" + version + "...");
        System.out.println("Hello, World!");
    }
}`,
  }
];

interface OutputLine {
  timestamp: string;
  text: string;
  type: 'stdout' | 'stderr' | 'system' | 'user-input';
}

function App() {
  const [selectedLang, setSelectedLang] = useState<Language>(LANGUAGES[0]);
  const [code, setCode] = useState<string>(LANGUAGES[0].snippet);
  const [stdin, setStdin] = useState<string>('');
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [leftWidth, setLeftWidth] = useState(60); // percentage
  const [outputFontSize, setOutputFontSize] = useState(13);
  const [isResizing, setIsResizing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('compiler_theme');
    return saved !== 'light';
  });

  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('compiler_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = LANGUAGES.find(l => l.id === e.target.value) || LANGUAGES[0];
    setSelectedLang(lang);

    // Load from localStorage if exists, otherwise use snippet
    const savedCode = localStorage.getItem(`compiler_code_${lang.id}`);
    setCode(savedCode || lang.snippet);

    setOutput([]);
    setExitCode(null);
  };

  // Persist code to localStorage
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      localStorage.setItem(`compiler_code_${selectedLang.id}`, code);
    }, 500); // Debounce 500ms
    return () => clearTimeout(timeoutId);
  }, [code, selectedLang.id]);

  // Initial load
  useEffect(() => {
    const savedCode = localStorage.getItem(`compiler_code_${selectedLang.id}`);
    if (savedCode) {
      setCode(savedCode);
    }
  }, []);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
    editor.onDidChangeCursorPosition((e: any) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
    });
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
      socket.send(JSON.stringify({ type: 'run', language: selectedLang.id, code }));
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [ws]);


  const copyCode = () => {
    navigator.clipboard.writeText(code);
  };

  const downloadCode = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `main.${selectedLang.ext}`;
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
          <div className="language-dropdown-container">
            <Wifi size={14} color="#888" className="wifi-icon" />
            <select
              className="language-select-overlay"
              value={selectedLang.id}
              onChange={handleLanguageChange}
            >
              {LANGUAGES.map(lang => (
                <option key={lang.id} value={lang.id}>{lang.name}</option>
              ))}
            </select>
            <div className="language-display">
              <span>{selectedLang.name}</span>
              <ChevronDown size={14} color="#888" />
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
              <button className="icon-btn" title="New File" onClick={() => setCode('')}><Plus size={18} /></button>
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
            <div className="editor-tab active">
              <span className="tab-icon">{selectedLang.emoji}</span>
              <span className="tab-name">main.{selectedLang.ext}</span>
              <span className="tab-dot">•</span>
            </div>
          </div>

          <div className="editor-wrapper">
            <Editor
              height="100%"
              language={selectedLang.id === 'cpp' ? 'cpp' : selectedLang.id}
              value={code}
              theme={isDarkMode ? "vs-dark" : "light"}
              onChange={(value) => setCode(value || '')}
              onMount={handleEditorDidMount}
              options={{
                fontSize: 14,
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
            <h2 className="section-title">Output</h2>
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
            <div className="output-log" style={{ fontSize: `${outputFontSize}px` }}>
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

              {/* Only show input if running */}
              {isRunning && (
                <div className="terminal-input-wrapper">
                  <span className="terminal-prompt">{'>'}</span>
                  <input 
                    className="integrated-stdin"
                    placeholder="Type program input..."
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
