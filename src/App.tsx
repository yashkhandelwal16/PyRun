import React, { useState, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Square, Settings, Monitor, X, Trash2, Wifi } from 'lucide-react';
import axios from 'axios';
import './App.css';

interface Language {
  id: string;
  name: string;
  version: string;
  snippet: string;
  pistonId: string;
}

const LANGUAGES: Language[] = [
  {
    id: 'python',
    name: 'Python',
    version: '3.12.5',
    pistonId: '100',
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
  type: 'stdout' | 'stderr' | 'system';
}

function App() {
  const [selectedLang, setSelectedLang] = useState<Language>(LANGUAGES[0]);
  const [code, setCode] = useState<string>(LANGUAGES[0].snippet);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  
  const editorRef = useRef<any>(null);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = LANGUAGES.find(l => l.id === e.target.value) || LANGUAGES[0];
    setSelectedLang(lang);
    setCode(lang.snippet);
  };

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
    editor.onDidChangeCursorPosition((e: any) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
    });
  };

  const runCode = async () => {
    if (isRunning) return;
    
    setIsRunning(true);
    setExitCode(null);
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    setOutput([]);
    
    try {
      const response = await axios.post('https://ce.judge0.com/submissions?wait=true', {
        source_code: code,
        language_id: parseInt(selectedLang.pistonId),
        stdin: "",
      });

      const { stdout, stderr, compile_output, status } = response.data;
      
      const newLines: OutputLine[] = [];
      
      if (stdout) {
        stdout.split('\n').filter((l: string) => l).forEach((line: string) => {
          newLines.push({ timestamp, text: line, type: 'stdout' });
        });
      }
      
      if (stderr || compile_output) {
        const errorText = stderr || compile_output;
        errorText.split('\n').filter((l: string) => l).forEach((line: string) => {
          newLines.push({ timestamp, text: line, type: 'stderr' });
        });
      }

      setOutput(newLines);
      setExitCode(status.id === 3 ? 0 : status.id); // 3 is "Accepted" in Judge0
    } catch (error) {
      setOutput([{ timestamp, text: 'Error executing code. The public Judge0 instance may be busy or restricted.', type: 'stderr' }]);
    } finally {
      setIsRunning(false);
    }
  };


  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">CompilerLite</div>
          <div className="language-select-wrapper">
            <select 
              className="language-select" 
              value={selectedLang.id} 
              onChange={handleLanguageChange}
            >
              {LANGUAGES.map(lang => (
                <option key={lang.id} value={lang.id}>{lang.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="header-right">
          <button className="icon-btn"><Monitor size={18} /></button>
          <button className="icon-btn"><Settings size={18} /></button>
          <button 
            className="run-btn" 
            onClick={runCode}
            disabled={isRunning}
          >
            {isRunning ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            {isRunning ? 'Stop' : 'Run'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="editor-container">
          <Editor
            height="100%"
            language={selectedLang.id === 'cpp' ? 'cpp' : selectedLang.id}
            value={code}
            theme="vs-dark"
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
            }}
          />
        </div>

        {/* Output Panel */}
        <div className="output-panel">
          <div className="output-header">
            <div className="output-tabs">
              <div className="output-tab active">Output</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {exitCode === 0 && (
                <div className="output-status">
                  <span className="status-dot"></span>
                  Success
                </div>
              )}
              {exitCode !== null && exitCode !== 0 && (
                <div className="output-status" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                  <span className="status-dot"></span>
                  Error
                </div>
              )}
              <button className="icon-btn" onClick={() => setOutput([])} title="Clear"><Trash2 size={14} /></button>
              <button className="icon-btn" title="Close"><X size={14} /></button>
            </div>
          </div>
          <div className="output-content">
            {output.length === 0 && !isRunning && (
              <div style={{ color: '#444' }}>Press "Run" to see the output...</div>
            )}
            {output.map((line, i) => (
              <div key={i} className="output-line">
                <span className="output-timestamp">[{line.timestamp}]</span>
                <span className="output-text" style={{ color: line.type === 'stderr' ? '#f87171' : '#e0e0e0', fontWeight: line.type === 'stdout' ? '600' : '400' }}>
                  {line.text}
                </span>
              </div>
            ))}
            {exitCode !== null && (
              <div className="output-exit-code" style={{ color: exitCode === 0 ? '#22c55e' : '#ef4444' }}>
                Process finished with exit code {exitCode}.
              </div>
            )}
            {isRunning && (
              <div className="output-line">
                <span className="output-text" style={{ color: '#888' }}>Running...</span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-left">
          <div className="footer-item">UTF-8</div>
          <div className="footer-item">Line {cursorPos.line}, Col {cursorPos.col}</div>
        </div>
        <div className="footer-right">
          <div className="footer-item"><Wifi size={12} color="#22c55e" /> Connected</div>
          <div className="footer-item">CompilerLite v1.2.0-stable</div>
        </div>
      </footer>
    </div>
  );
}

export default App;
