# PyRun Project Workflow

PyRun is a high-performance, responsive online Python compiler and IDE. It allows users to write, compile, and execute code in real-time with a professional-grade interface. While optimized for Python, it also provides a robust environment for Python.

## 🚀 Technology Stack

### Frontend
- **Framework**: React.js with TypeScript
- **Bundler**: Vite
- **Editor**: Monaco Editor (`@monaco-editor/react`)
- **Styling**: Vanilla CSS with CSS Variables for Theme Support
- **Animations**: Framer Motion
- **Icons**: Lucide React

### Backend
- **Framework**: FastAPI (Python)
- **Communication**: WebSockets (real-time streaming)
- **Task Management**: `asyncio` for non-blocking process execution
- **Execution**: Local subprocess execution with  `Python` .

---

## 🎨 Key UI Features

### 1. Install Most of the Packages
In this Project, there are most of the Pythpn Library and modules are installed already.

### 2. High-Contrast Terminal
The terminal output is optimized for both light and dark modes:
- **Light Mode**: Features pure black text (`#000000`) with a bold font weight (**600**) to ensure every character is as sharp as user input.
- **Dark Mode**: Uses a custom dark palette with high-contrast variables.

### 3. Smart Tab Management
- **Hover-to-Close**: Tabs display a close (X) button only when hovered, keeping the interface clean.
- **Protection Logic**: You can close any tab (including `main.py`) as long as at least one other tab remains open.

---

## 🏗️ Architecture & Workflow

### 1. Execution Flow
1. **Code Submission**: When the user clicks "Run", the frontend sends a JSON payload containing the `language`, `code`, and `type: "run"` over a WebSocket.
2. **Backend Processing**:
   - `main.py` creates a temporary file for the code.
3. **Real-time Streaming**:
   - Output is captured in chunks and streamed back to the frontend immediately.
   - The frontend uses an "inherit" font-weight strategy to match the terminal's theme.
---

## 📱 Responsive Strategy
The project implements a comprehensive responsive design:
- **Desktop (>1024px)**: Side-by-side view with a vertical resizer bar.
- **Mobile & Tablet (<1024px)**: Vertical stacking where the Editor takes the top section and the Terminal takes the bottom. The resizer is hidden to ensure a smooth scrolling experience.

---

## 🛠️ Development Setup

### Prerequisites
- **Node.js**: v18+ 
- **Python**: 3.10+

### Running the Project
1. **Start the Development Server**:
   ```bash
   npm run dev
   ```
2. **Access the App**:
   Open `http://localhost:5173` in your browser.

---

## 📜 Recent Enhancements Summary
- **Vertical Layout**: Optimized stacking for mobile/tablet users.
- **Terminal Polish**: Increased default font weight and contrast for light theme visibility.
- **Header Spacing**: Increased gaps between UI elements for a more premium feel.
- **Hover Actions**: Fixed close button visibility on the main file tab.

---

## ⚖️ License
© 2026 PyRun. All rights reserved.
