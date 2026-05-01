const os = require('os');
const fs = require('fs');
const path = require('path');

function getIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}

const ip = getIPAddress();
const config = { backendIp: ip };
fs.writeFileSync(path.join(__dirname, 'src', 'backend-config.json'), JSON.stringify(config, null, 2));
console.log(`\n\x1b[32m[PyRun] Local IP Detected: ${ip}\x1b[0m`);
console.log(`\x1b[36m[PyRun] Access on mobile: http://${ip}:5173\x1b[0m\n`);
