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

app = Engine("CompilerLite")
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

const app = new Engine("CompilerLite");
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
    Engine app("CompilerLite");
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
        Engine app = new Engine("CompilerLite");
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
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [leftWidth, setLeftWidth] = useState(60); // percentage
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

  const runCode = async () => {
    if (isRunning) return;
    
    setIsRunning(true);
    setExitCode(null);
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    setOutput([]);
    
    try {
      // Helper to encode string to base64 safely (handles UTF-8 characters like ₹)
      const encodeBase64 = (str: string) => {
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
          return String.fromCharCode(parseInt(p1, 16));
        }));
      };

      const response = await axios.post('https://ce.judge0.com/submissions?wait=true&base64_encoded=true', {
        source_code: encodeBase64(code),
        language_id: parseInt(selectedLang.pistonId),
        stdin: encodeBase64(stdin),
      }, {
        timeout: 15000, // 15s timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const { stdout, stderr, compile_output, status } = response.data;
      
      // Helper to decode base64 safely
      const decodeBase64 = (str: string | null) => {
        if (!str) return '';
        try {
          return decodeURIComponent(Array.prototype.map.call(atob(str), (c) => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
        } catch (e) {
          return atob(str); // Fallback to plain atob if it's not a valid UTF-8 sequence
        }
      };

      const decodedStdout = decodeBase64(stdout);
      const decodedStderr = decodeBase64(stderr);
      const decodedCompileOutput = decodeBase64(compile_output);

      const newLines: OutputLine[] = [];
      const stdinLines = stdin.split('\n');
      let stdinIndex = 0;

      if (decodedStdout) {
        const stdoutLines = decodedStdout.split('\n');
        // Limit output lines to 1000 to prevent browser crash
        const limitedStdoutLines = stdoutLines.slice(0, 1000);
        
        limitedStdoutLines.forEach((line: string) => {
          if (line.trim() !== '' || line === '') {
            newLines.push({ timestamp, text: line, type: 'stdout' });
            
            const isPrompt = /[:?]\s*$/.test(line) || (line.toLowerCase().includes('enter') && line.length < 100);
            
            if (isPrompt && stdinIndex < stdinLines.length) {
              newLines.push({ 
                timestamp, 
                text: stdinLines[stdinIndex], 
                type: 'user-input' 
              });
              stdinIndex++;
            }
          }
        });

        if (stdoutLines.length > 1000) {
          newLines.push({ timestamp, text: `... output truncated (${stdoutLines.length - 1000} more lines)`, type: 'system' });
        }
      }
      
      if (decodedStderr || decodedCompileOutput) {
        const errorText = decodedStderr || decodedCompileOutput;
        errorText.split('\n').filter((l: string) => l !== null).slice(0, 500).forEach((line: string) => {
          newLines.push({ timestamp, text: line, type: 'stderr' });
        });
      }

      if (newLines.length === 0 && status.id === 3) {
        newLines.push({ timestamp, text: 'Program executed successfully (no output).', type: 'system' });
      }

      setOutput(newLines);
      setExitCode(status.id === 3 ? 0 : status.id);
    } catch (error: any) {
      console.error('Execution Error:', error);
      let errorMsg = 'Error: Could not connect to code execution server.';
      
      if (error.response) {
        if (error.response.status === 429) {
          errorMsg = 'Error: Server is busy (Rate limit exceeded). Please wait a few seconds and try again.';
        } else if (error.response.status >= 500) {
          errorMsg = 'Error: Code execution server is currently unavailable. Please try again later.';
        }
      } else if (error.code === 'ECONNABORTED') {
        errorMsg = 'Error: Request timed out. Your code might be taking too long to run.';
      }
      
      setOutput([{ timestamp, text: errorMsg, type: 'stderr' }]);
    } finally {
      setIsRunning(false);
    }
  };


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
            <span className="logo-text">CompilerLite</span>
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
                disabled={isRunning}
                title="Run Code"
                style={{ color: isRunning ? '#888' : '#eab308' }}
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
            <button className="icon-btn" onClick={() => setOutput([])} title="Clear Output"><Trash2 size={16} color="#666" /></button>
          </div>

          <div className="output-body">
            <div className="stdin-container">
              <label className="stdin-label">Input for the program (optional):</label>
              <textarea 
                className="stdin-textarea"
                placeholder="Enter input for your program..."
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
              />
              <p className="stdin-tip">Tip: Enter each input value on a new line.</p>
            </div>

            <div className="output-status-text">
              {output.length === 0 && !isRunning && "Click Run to execute your code"}
              {isRunning && "Running..."}
            </div>

            <div className="output-log">
              {output.map((line, i) => (
                <div key={i} className="output-line">
                    <span className="output-text" style={{ 
                      color: line.type === 'stderr' ? '#f87171' : line.type === 'system' ? 'var(--text-muted)' : line.type === 'user-input' ? 'var(--accent)' : 'var(--text-primary)',
                      fontStyle: line.type === 'system' ? 'italic' : 'normal',
                      fontWeight: line.type === 'user-input' ? '600' : '400'
                    }}>
                    {line.type === 'user-input' ? `> ${line.text}` : line.text}
                  </span>
                </div>
              ))}
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
        <div className="footer-left">
          <p>© 2025 CompilerLite. All rights reserved.</p>
        </div>
        <div className="footer-right">
          <div className="footer-status-item">
            <Wifi size={12} color="#22c55e" />
            <span>Connected</span>
          </div>
          <HelpCircle size={18} className="help-icon" />
        </div>
      </footer>
    </div>
  );
}

export default App;
