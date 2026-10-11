/**
 * Minimal ISO 18013-5 DeviceRequest helper (CBOR), no dependencies.
 *
 * Workaround: the Credence profile issued with this license requests two documents
 * (org.iso.18013.5.1.mDL and aamva.pdf417) in one DeviceRequest. Apple Wallet only
 * holds the mDL and reports "no eligible IDs". This keeps only the doc types we want.
 * The DeviceRequest is unsigned (no readerAuth) and encryptionInfo is untouched.
 */

function readHead(buf, pos) {
  const initial = buf[pos];
  const major = initial >> 5;
  const info = initial & 31;
  let offset = pos + 1;
  let value;
  if (info < 24) value = info;
  else if (info === 24) { value = buf[offset]; offset += 1; }
  else if (info === 25) { value = buf.readUInt16BE(offset); offset += 2; }
  else if (info === 26) { value = buf.readUInt32BE(offset); offset += 4; }
  else if (info === 27) { value = Number(buf.readBigUInt64BE(offset)); offset += 8; }
  else throw new Error("Indefinite-length CBOR is not supported.");
  return { major, info, value, offset };
}

// Decodes one CBOR item; returns { value, end }. Tags are returned as { tag, value }.
function decode(buf, pos = 0) {
  const { major, info, value, offset } = readHead(buf, pos);
  switch (major) {
    case 0: return { value, end: offset };
    case 1: return { value: -1 - value, end: offset };
    case 2: return { value: buf.subarray(offset, offset + value), end: offset + value };
    case 3: return { value: buf.toString("utf8", offset, offset + value), end: offset + value };
    case 4: {
      const items = [];
      let p = offset;
      for (let i = 0; i < value; i++) {
        const item = decode(buf, p);
        items.push({ ...item, start: p });
        p = item.end;
      }
      return { value: items, end: p };
    }
    case 5: {
      const entries = [];
      let p = offset;
      for (let i = 0; i < value; i++) {
        const key = decode(buf, p);
        const val = decode(buf, key.end);
        entries.push({ key: key.value, val, start: key.end });
        p = val.end;
      }
      return { value: entries, end: p };
    }
    case 6: {
      const inner = decode(buf, offset);
      return { value: { tag: value, value: inner.value }, end: inner.end };
    }
    default:
      if (info === 20) return { value: false, end: offset };
      if (info === 21) return { value: true, end: offset };
      if (info === 22) return { value: null, end: offset };
      throw new Error("Unsupported CBOR simple/float value.");
  }
}

function head(major, length) {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 256) return Buffer.from([(major << 5) | 24, length]);
  if (length < 65536) { const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(length, 1); return b; }
  const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(length, 1); return b;
}

const text = (s) => Buffer.concat([head(3, Buffer.byteLength(s)), Buffer.from(s, "utf8")]);

function docTypeOf(buf, docRequest) {
  const itemsRequest = docRequest.value.find((e) => e.key === "itemsRequest")?.val.value;
  // itemsRequest is #6.24(bstr .cbor ItemsRequest)
  const bytes = itemsRequest?.tag === 24 ? itemsRequest.value : null;
  if (!bytes) return null;
  return decode(Buffer.from(bytes)).value.find((e) => e.key === "docType")?.val.value ?? null;
}

/**
 * Returns { deviceRequest, kept, removed }. On anything unexpected, returns the
 * original request unchanged so the documented flow is never broken by this helper.
 */
export function filterDocTypes(deviceRequestB64url, allowedDocTypes) {
  try {
    const buf = Buffer.from(deviceRequestB64url, "base64url");
    const top = decode(buf);
    if (top.end !== buf.length || !Array.isArray(top.value)) throw new Error("Unexpected DeviceRequest shape.");

    const parts = [];
    const kept = [];
    const removed = [];
    for (const entry of top.value) {
      const keyBytes = text(entry.key);
      if (entry.key !== "docRequests") {
        parts.push(keyBytes, buf.subarray(entry.start, entry.val.end));
        continue;
      }
      const keptRaw = [];
      for (const docRequest of entry.val.value) {
        const docType = docTypeOf(buf, docRequest);
        if (docType && allowedDocTypes.includes(docType)) {
          kept.push(docType);
          keptRaw.push(buf.subarray(docRequest.start, docRequest.end));
        } else {
          removed.push(docType ?? "unknown");
        }
      }
      if (keptRaw.length === 0) throw new Error("No allowed doc types in DeviceRequest.");
      parts.push(keyBytes, head(4, keptRaw.length), ...keptRaw);
    }

    if (removed.length === 0) return { deviceRequest: deviceRequestB64url, kept, removed };
    const rebuilt = Buffer.concat([head(5, top.value.length), ...parts]);
    return { deviceRequest: rebuilt.toString("base64url"), kept, removed };
  } catch (error) {
    return { deviceRequest: deviceRequestB64url, kept: [], removed: [], error: error.message };
  }
}

export { decode };
