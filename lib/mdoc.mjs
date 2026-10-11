/**
 * Read-only inspector for ISO 18013-5 DeviceRequests (CBOR), no dependencies.
 * Used by the Developer View to show what the wallet is actually asked for and
 * whether the request carries reader authentication, which Apple Wallet requires
 * for website requests (signed with an Apple-issued certificate for the domain).
 */
import { X509Certificate } from "node:crypto";

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

// Decodes one CBOR item into plain JS: maps become Map, tags become { tag, value }.
export function decode(buf, pos = 0) {
  const { major, info, value, offset } = readHead(buf, pos);
  switch (major) {
    case 0: return { value, end: offset };
    case 1: return { value: -1 - value, end: offset };
    case 2: return { value: buf.subarray(offset, offset + value), end: offset + value };
    case 3: return { value: buf.toString("utf8", offset, offset + value), end: offset + value };
    case 4: {
      const items = [];
      let p = offset;
      for (let i = 0; i < value; i++) { const item = decode(buf, p); items.push(item.value); p = item.end; }
      return { value: items, end: p };
    }
    case 5: {
      const map = new Map();
      let p = offset;
      for (let i = 0; i < value; i++) { const k = decode(buf, p); const v = decode(buf, k.end); map.set(k.value, v.value); p = v.end; }
      return { value: map, end: p };
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

const embedded = (item) => (item?.tag === 24 ? decode(Buffer.from(item.value)).value : null);

function describeCertificate(der) {
  const cert = new X509Certificate(Buffer.from(der));
  const field = (dn, key) => dn.split("\n").find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1) ?? null;
  return {
    domains: (cert.subjectAltName || "").split(", ").filter((s) => s.startsWith("DNS:")).map((s) => s.slice(4)),
    issuer: field(cert.issuer, "CN"),
    validTo: new Date(cert.validTo).toISOString(),
  };
}

// readerAuth is a COSE_Sign1: [protected, unprotected { 33: x5chain }, payload, signature].
function describeReaderAuth(sign1) {
  const x5chain = sign1?.[1]?.get?.(33);
  const certs = Array.isArray(x5chain) ? x5chain : x5chain ? [x5chain] : [];
  return certs.length ? describeCertificate(certs[0]) : { domains: [], issuer: null, validTo: null };
}

/**
 * Summarizes a base64url DeviceRequest. Never throws: returns { error } instead,
 * so the inspector can't break the verification flow.
 */
export function inspectDeviceRequest(deviceRequestB64url) {
  try {
    const top = decode(Buffer.from(deviceRequestB64url, "base64url")).value;
    const docRequests = (top.get("docRequests") || []).map((docRequest) => {
      const items = embedded(docRequest.get("itemsRequest"));
      return {
        docType: items?.get("docType") ?? "unknown",
        elements: [...(items?.get("nameSpaces")?.values() ?? [])].flatMap((ns) => [...ns.keys()]),
        signed: docRequest.has("readerAuth"),
      };
    });
    const readerAuthAll = top.get("readerAuthAll");
    const signer = readerAuthAll?.length
      ? describeReaderAuth(readerAuthAll[0])
      : docRequests.some((d) => d.signed)
        ? describeReaderAuth(top.get("docRequests").find((d) => d.has("readerAuth")).get("readerAuth"))
        : null;
    return {
      version: top.get("version") ?? null,
      docRequests,
      signed: Boolean(signer),
      signer,
    };
  } catch (error) {
    return { error: `Could not decode DeviceRequest: ${error.message}` };
  }
}
