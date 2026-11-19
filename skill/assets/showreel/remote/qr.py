"""A tiny QR code encoder for the terminal: byte mode, error correction level M, versions 1-10
(up to 213 bytes, plenty for a link). Standard library only.

    from qr import qr_matrix, qr_terminal
    print(qr_terminal("https://example.trycloudflare.com/remote?k=abc"))
"""

import sys as _sys
for _stream in (_sys.stdout, _sys.stderr):  # a Windows console in cp1252 must not crash on arrows or Kazakh text
    try:
        _stream.reconfigure(errors="replace")
    except Exception:
        pass
# (ec codewords per block, [(blocks, data codewords per block), ...]) for level M
_M = {
    1: (10, [(1, 16)]), 2: (16, [(1, 28)]), 3: (26, [(1, 44)]), 4: (18, [(2, 32)]), 5: (24, [(2, 43)]),
    6: (16, [(4, 27)]), 7: (18, [(4, 31)]), 8: (22, [(2, 38), (2, 39)]), 9: (22, [(3, 36), (2, 37)]),
    10: (26, [(4, 43), (1, 44)]),
}
_ALIGN = {1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42],
          9: [6, 26, 46], 10: [6, 28, 50]}

# GF(256) with the QR polynomial 0x11D
_EXP = [0] * 512
_LOG = [0] * 256
_x = 1
for _i in range(255):
    _EXP[_i] = _x
    _LOG[_x] = _i
    _x <<= 1
    if _x & 0x100:
        _x ^= 0x11D
for _i in range(255, 512):
    _EXP[_i] = _EXP[_i - 255]


def _mul(a, b):
    return 0 if a == 0 or b == 0 else _EXP[_LOG[a] + _LOG[b]]


def _rs(data, n):
    gen = [1]
    for i in range(n):
        gen = [a ^ _mul(b, _EXP[i]) for a, b in zip(gen + [0], [0] + gen)]
    res = [0] * n
    g = gen[1:]  # highest degree first; drop the leading 1 of the monic generator
    for d in data:
        f = d ^ res[0]
        res = res[1:] + [0]
        for j in range(n):
            res[j] ^= _mul(g[j], f)
    return res


def _bits(value, length):
    return [(value >> i) & 1 for i in range(length - 1, -1, -1)]


def _bch(value, poly, length):
    v = value << (poly.bit_length() - 1)
    while v.bit_length() >= poly.bit_length():
        v ^= poly << (v.bit_length() - poly.bit_length())
    return (value << (poly.bit_length() - 1)) | v


def qr_matrix(text):
    data = text.encode("utf-8")
    for ver in range(1, 11):
        ec, groups = _M[ver]
        cap = sum(b * d for b, d in groups)
        need = 4 + (8 if ver < 10 else 16) + 8 * len(data)
        if need <= cap * 8:
            break
    else:
        raise ValueError("text too long for a version 1-10 QR code")
    size = 17 + 4 * ver

    # data bits: mode 0100 (byte), count, bytes, terminator, pad
    bits = _bits(4, 4) + _bits(len(data), 8 if ver < 10 else 16)
    for b in data:
        bits += _bits(b, 8)
    bits += [0] * min(4, cap * 8 - len(bits))
    bits += [0] * (-len(bits) % 8)
    words = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
    pad = [0xEC, 0x11]
    while len(words) < cap:
        words.append(pad[(len(words) - len(bits) // 8) % 2])

    # blocks, error correction, interleaving
    blocks, k = [], 0
    for count, n in groups:
        for _ in range(count):
            blocks.append(words[k:k + n])
            k += n
    ecs = [_rs(b, ec) for b in blocks]
    final = []
    for i in range(max(len(b) for b in blocks)):
        final += [b[i] for b in blocks if i < len(b)]
    for i in range(ec):
        final += [e[i] for e in ecs]
    stream = []
    for w in final:
        stream += _bits(w, 8)

    m = [[None] * size for _ in range(size)]
    func = [[False] * size for _ in range(size)]

    def put(r, c, v):
        if 0 <= r < size and 0 <= c < size:
            m[r][c] = v
            func[r][c] = True

    for r0, c0 in ((0, 0), (0, size - 7), (size - 7, 0)):
        for r in range(-1, 8):
            for c in range(-1, 8):
                inner = 0 <= r <= 6 and 0 <= c <= 6
                v = inner and (r in (0, 6) or c in (0, 6) or (2 <= r <= 4 and 2 <= c <= 4))
                put(r0 + r, c0 + c, 1 if v else 0)
    for i in range(8, size - 8):
        put(6, i, 1 if i % 2 == 0 else 0)
        put(i, 6, 1 if i % 2 == 0 else 0)
    al = _ALIGN[ver]
    for r in al:
        for c in al:
            if (r, c) in ((6, 6), (6, al[-1]), (al[-1], 6)):
                continue
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    put(r + dr, c + dc, 1 if max(abs(dr), abs(dc)) != 1 else 0)
    # reserve format and version areas
    for i in range(9):
        for (r, c) in ((8, i), (i, 8)):
            if not func[r][c]:
                put(r, c, 0)
    for i in range(8):
        put(8, size - 1 - i, 0)
        put(size - 1 - i, 8, 0)
    if ver >= 7:
        for i in range(18):
            put(size - 11 + i % 3, i // 3, 0)
            put(i // 3, size - 11 + i % 3, 0)
    put(size - 8, 8, 1)  # the dark module

    # place the data in the zigzag
    k = 0
    c = size - 1
    up = True
    while c > 0:
        if c == 6:
            c -= 1
        rows = range(size - 1, -1, -1) if up else range(size)
        for r in rows:
            for cc in (c, c - 1):
                if not func[r][cc]:
                    m[r][cc] = stream[k] if k < len(stream) else 0
                    k += 1
        up = not up
        c -= 2

    masks = [
        lambda r, c: (r + c) % 2 == 0, lambda r, c: r % 2 == 0, lambda r, c: c % 3 == 0,
        lambda r, c: (r + c) % 3 == 0, lambda r, c: (r // 2 + c // 3) % 2 == 0,
        lambda r, c: (r * c) % 2 + (r * c) % 3 == 0, lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0,
        lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0,
    ]

    def with_mask(mi):
        g = [row[:] for row in m]
        for r in range(size):
            for c in range(size):
                if not func[r][c] and masks[mi](r, c):
                    g[r][c] ^= 1
        fmt = _bch((0b00 << 3) | mi, 0b10100110111, 15) ^ 0b101010000010010  # level M = 00
        fb = [(fmt >> i) & 1 for i in range(15)]  # bit 0 first
        # (row, col) of bit i: around the top-left finder, then split between the other two
        pos1 = [(i, 8) for i in range(6)] + [(7, 8), (8, 8), (8, 7)] + [(8, 14 - i) for i in range(9, 15)]
        pos2 = [(8, size - 1 - i) for i in range(8)] + [(size - 15 + i, 8) for i in range(8, 15)]
        for i in range(15):
            g[pos1[i][0]][pos1[i][1]] = fb[i]
            g[pos2[i][0]][pos2[i][1]] = fb[i]
        if ver >= 7:
            vb = _bch(ver, 0b1111100100101, 18)
            for i in range(18):
                bit = (vb >> i) & 1
                g[size - 11 + i % 3][i // 3] = bit
                g[i // 3][size - 11 + i % 3] = bit
        return g

    def penalty(g):
        p = 0
        for lines in (g, list(zip(*g))):
            for line in lines:
                run, prev = 0, None
                for v in line:
                    if v == prev:
                        run += 1
                    else:
                        if run >= 5:
                            p += run - 2
                        run, prev = 1, v
                if run >= 5:
                    p += run - 2
                s = "".join(map(str, line))
                p += 40 * (s.count("10111010000") + s.count("00001011101"))
        for r in range(size - 1):
            for c in range(size - 1):
                if g[r][c] == g[r + 1][c] == g[r][c + 1] == g[r + 1][c + 1]:
                    p += 3
        dark = sum(map(sum, g))
        p += 10 * (abs(dark * 20 - size * size * 10) // (size * size))
        return p

    return min((with_mask(i) for i in range(8)), key=penalty)


def qr_terminal(text, invert=False):
    """Half-block characters, two modules per character row, with a quiet zone."""
    g = qr_matrix(text)
    n = len(g)
    q = 2
    full = [[0] * (n + 2 * q) for _ in range(q)] + [[0] * q + row + [0] * q for row in g] + [[0] * (n + 2 * q) for _ in range(q + 1)]
    out = []
    for r in range(0, n + 2 * q, 2):
        line = ""
        for c in range(n + 2 * q):
            top, bot = full[r][c], full[r + 1][c]
            if invert:
                top, bot = 1 - top, 1 - bot
            # light-on-dark terminals: print dark modules as spaces, light as blocks
            line += {(0, 0): "█", (0, 1): "▀", (1, 0): "▄", (1, 1): " "}[(top, bot)]
        out.append(line)
    return "\n".join(out)


if __name__ == "__main__":
    import sys
    print(qr_terminal(sys.argv[1] if len(sys.argv) > 1 else "https://example.com"))
