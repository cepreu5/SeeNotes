// Чете PNG от buffer и връща { width, height, at(x, y) -> [r, g, b, a] }.
// Нужно е, за да се провери КАКВО НАИСТИНА СЕ ВИЖДА на екрана (X-ът върху плочката), а не само
// какво пише в CSS. Chromium снима 8-битов RGBA (тип 6) или RGB (тип 2), без палитра.
import zlib from 'node:zlib';

export function decodePng(buffer) {
    if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('не е PNG');
    let pos = 8;
    let width = 0, height = 0, depth = 0, colorType = 0;
    const idat = [];
    while (pos < buffer.length) {
        const length = buffer.readUInt32BE(pos);
        const type = buffer.toString('ascii', pos + 4, pos + 8);
        const data = buffer.subarray(pos + 8, pos + 8 + length);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            depth = data[8];
            colorType = data[9];
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') break;
        pos += 12 + length;
    }
    if (depth !== 8) throw new Error('очаква се 8-битова дълбочина, дойде ' + depth);
    const channels = colorType === 6 ? 4 : (colorType === 2 ? 3 : 0);
    if (!channels) throw new Error('неподдържан тип цвят ' + colorType);
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const out = Buffer.alloc(height * stride);
    let rp = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[rp++];
        const row = raw.subarray(rp, rp + stride);
        rp += stride;
        const cur = out.subarray(y * stride, (y + 1) * stride);
        const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
        for (let x = 0; x < stride; x++) {
            const a = x >= channels ? cur[x - channels] : 0;
            const b = prev ? prev[x] : 0;
            const c = (prev && x >= channels) ? prev[x - channels] : 0;
            const v = row[x];
            let value;
            switch (filter) {
                case 0: value = v; break;
                case 1: value = v + a; break;
                case 2: value = v + b; break;
                case 3: value = v + ((a + b) >> 1); break;
                case 4: {
                    const p = a + b - c;
                    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                    value = v + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c));
                    break;
                }
                default: throw new Error('непознат филтър ' + filter);
            }
            cur[x] = value & 0xff;
        }
    }
    return {
        width, height,
        at(x, y) {
            const i = y * stride + x * channels;
            return [out[i], out[i + 1], out[i + 2], channels === 4 ? out[i + 3] : 255];
        }
    };
}
