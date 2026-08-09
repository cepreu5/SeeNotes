const http = require('http');
const crypto = require('crypto');
const fs = require('fs');

const TARGET_ID = '6D21B39D31D6620AB54DDFAB68597B73';

function connectWS() {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: 'localhost',
      port: 9222,
      path: `/devtools/page/${TARGET_ID}`,
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13'
      }
    });

    req.on('upgrade', (res, socket) => {
      resolve(socket);
    });
    req.on('error', reject);
    req.end();
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

function sendFrame(socket, data) {
  const payload = Buffer.from(data);
  const mask = crypto.randomBytes(4);
  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(6);
    header[0] = 0x81;
    header[1] = 0x80 | payload.length;
    mask.copy(header, 2);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(8);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
    mask.copy(header, 4);
  } else {
    header = Buffer.alloc(14);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
    mask.copy(header, 10);
  }
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    masked[i] = payload[i] ^ mask[i % 4];
  }
  socket.write(Buffer.concat([header, masked]));
}

function readMessages(socket, timeout = 10000) {
  return new Promise((resolve) => {
    let buf = Buffer.alloc(0);
    let messages = [];

    const timer = setTimeout(() => {
      socket.removeAllListeners('data');
      resolve(messages);
    }, timeout);

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      // Try to extract text frames
      while (buf.length > 2) {
        const opcode = buf[0] & 0x0f;
        const isMasked = (buf[1] & 0x80) !== 0;
        let payloadLen = buf[1] & 0x7f;
        let offset = 2;

        if (payloadLen === 126) {
          if (buf.length < 4) break;
          payloadLen = buf.readUInt16BE(2);
          offset = 4;
        } else if (payloadLen === 127) {
          if (buf.length < 10) break;
          payloadLen = Number(buf.readBigUInt64BE(2));
          offset = 10;
        }

        if (isMasked) offset += 4;
        if (buf.length < offset + payloadLen) break;

        const data = buf.slice(offset, offset + payloadLen);
        buf = buf.slice(offset + payloadLen);

        if (opcode === 1) { // text frame
          try {
            const parsed = JSON.parse(data.toString('utf8'));
            messages.push(parsed);
          } catch(e) {}
        }
      }
    });
  });
}

async function sendCommand(method, params = {}, id = 1) {
  const socket = await connectWS();
  const msg = JSON.stringify({ id, method, params });

  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Response timeout'));
    }, 15000);

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length > 2) {
        const opcode = buf[0] & 0x0f;
        let payloadLen = buf[1] & 0x7f;
        let offset = 2;

        if (payloadLen === 126) {
          if (buf.length < 4) break;
          payloadLen = buf.readUInt16BE(2);
          offset = 4;
        } else if (payloadLen === 127) {
          if (buf.length < 10) break;
          payloadLen = Number(buf.readBigUInt64BE(2));
          offset = 10;
        }

        if (buf.length < offset + payloadLen) break;

        const data = buf.slice(offset, offset + payloadLen);
        buf = buf.slice(offset + payloadLen);

        if (opcode === 1) {
          try {
            const parsed = JSON.parse(data.toString('utf8'));
            if (parsed.id === id) {
              clearTimeout(timer);
              socket.destroy();
              resolve(parsed);
            }
          } catch(e) {}
        }
      }
    });

    sendFrame(socket, msg);
  });
}

async function evaluate(expression) {
  const res = await sendCommand('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.result && res.result.result) {
    return res.result.result.value;
  }
  return res;
}

async function click(x, y) {
  await sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, 1);
  await sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, 2);
}

async function screenshot(filename) {
  const res = await sendCommand('Page.captureScreenshot', { format: 'png' });
  if (res.result && res.result.data) {
    fs.writeFileSync(filename, Buffer.from(res.result.data, 'base64'));
    return true;
  }
  return false;
}

async function type(text) {
  for (const char of text) {
    await sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', text: char, key: char }, 1);
    await sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: char }, 2);
  }
}

module.exports = { sendCommand, evaluate, click, screenshot, type };

// CLI mode
if (require.main === module) {
  const cmd = process.argv[2];
  const arg = process.argv.slice(3).join(' ');

  (async () => {
    try {
      if (cmd === 'eval') {
        const result = await evaluate(arg);
        console.log(JSON.stringify(result, null, 2));
      } else if (cmd === 'click') {
        const [x, y] = arg.split(',').map(Number);
        await click(x, y);
        console.log(`Clicked at ${x},${y}`);
      } else if (cmd === 'screenshot') {
        await screenshot(arg || 'test-screenshot.png');
        console.log('Screenshot saved to ' + (arg || 'test-screenshot.png'));
      } else if (cmd === 'type') {
        await type(arg);
        console.log('Typed: ' + arg);
      } else {
        console.log('Usage: node cdp.js <eval|click|screenshot|type> <arg>');
      }
    } catch(e) {
      console.error(e.message);
    }
  })();
}
