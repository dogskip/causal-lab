import { ContractError } from "../crdt.js";
import { sha256Bytes } from "../sha256.js";
import type { Packet } from "./types.js";

export function encodeBase64(bytes: Uint8Array): string {
  let text = "";
  for (let at = 0; at < bytes.length; at += 8192)
    text += String.fromCharCode(...bytes.subarray(at, at + 8192));
  return btoa(text);
}
export function decodeBase64(text: string): Uint8Array {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      text,
    )
  )
    throw new ContractError("packet is not canonical base64");
  const decoded = Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  if (encodeBase64(decoded) !== text)
    throw new ContractError("packet padding is not canonical");
  return decoded;
}
export function packetOf(input: Uint8Array): Packet {
  const bytes = Uint8Array.from(input);
  return Object.freeze({
    packet_id: sha256Bytes(bytes),
    encoding: "base64",
    byteLength: bytes.length,
    bytes: encodeBase64(bytes),
  });
}

export function decodePacket(packet: Packet): Uint8Array {
  const bytes = decodeBase64(packet.bytes);
  if (
    packet.encoding !== "base64" ||
    bytes.length !== packet.byteLength ||
    sha256Bytes(bytes) !== packet.packet_id
  )
    throw new ContractError("packet content does not match its identity");
  return bytes;
}
