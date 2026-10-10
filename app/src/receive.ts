import { getAddress, isAddress, type Address } from "viem";

const HOST = "portionly-three.vercel.app";
const BAD = "That is not a valid address or Portionly pay link. Paste a 0x address or a link that starts with " + HOST + "/pay/.";

function checksum(value: string): Address {
  // Strict: all lower or upper case passes, mixed case must carry a correct checksum.
  if (!isAddress(value, { strict: true })) throw new Error(BAD);
  return getAddress(value);
}

const LINK = new RegExp(
  String.raw`(?:^|\s)(?:https?://)?` + HOST.replaceAll(".", String.raw`\.`) + String.raw`/pay/(0x[0-9a-fA-F]{40})/?(?:[?#]\S*)?(?:\s|$)`,
  "i",
);

export function receiveLink(address: string): string {
  return `https://${HOST}/pay/${checksum(address)}`;
}

export function parseRecipientInput(text: string): Address {
  const trimmed = text.trim();
  if (trimmed === "") throw new Error("Paste an address or a Portionly pay link first.");

  if (/^0x/i.test(trimmed) && !/\s/.test(trimmed)) return checksum(trimmed.replace(/^0X/, "0x"));

  const uri = /^ethereum:(?:pay-)?(0x[0-9a-fA-F]{40})(?:@[0-9A-Za-z.]+)?(?:[/?].*)?$/i.exec(trimmed);
  if (uri) return checksum(uri[1]);

  const link = LINK.exec(trimmed);
  if (link) return checksum(link[1]);

  throw new Error(BAD);
}
