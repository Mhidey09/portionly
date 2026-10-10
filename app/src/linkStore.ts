import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";
import type { Hex } from "viem";
import { addLink, parseLinks, type StoredLink } from "./linkRecords";

// Kept on this phone only. No fingerprint prompt, so the sender can always find and share a link again.
// One item per link plus a small index: a single item holding every link would outgrow what the
// secure store accepts after about ten links.
const INDEX_KEY = "portionly.links.index.v1";
const LEGACY_KEY = "portionly.links.v1";
const itemKey = (address: string) => `portionly.link.${address.toLowerCase()}`;

async function readIndex(): Promise<string[]> {
  const raw = await getItemAsync(INDEX_KEY);
  if (raw === null) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((a): a is string => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a)) : [];
  } catch {
    return [];
  }
}

/** Links saved by an earlier build lived in one item. Move them across once, and only drop the old item after every link is safely rewritten. */
async function migrateLegacy(): Promise<void> {
  const raw = await getItemAsync(LEGACY_KEY);
  if (raw === null) return;
  const index = await readIndex();
  for (const entry of parseLinks(raw)) {
    await setItemAsync(itemKey(entry.address), JSON.stringify([entry]));
    if (!index.some((a) => a.toLowerCase() === entry.address.toLowerCase())) index.push(entry.address);
  }
  await setItemAsync(INDEX_KEY, JSON.stringify(index));
  await deleteItemAsync(LEGACY_KEY);
}

async function loadLinks(): Promise<StoredLink[]> {
  await migrateLegacy();
  let list: StoredLink[] = [];
  for (const address of await readIndex()) {
    const [entry] = parseLinks(await getItemAsync(itemKey(address)));
    if (entry) list = addLink(list, entry);
  }
  return list;
}

/** Saves one more link and returns the full list. Call this and wait for it BEFORE any money moves. */
async function rememberLink(entry: StoredLink): Promise<StoredLink[]> {
  await migrateLegacy();
  // The link itself is written first: an index that points at nothing is harmless, a key that was never saved is not.
  await setItemAsync(itemKey(entry.address), JSON.stringify([entry]));
  const index = await readIndex();
  if (!index.some((a) => a.toLowerCase() === entry.address.toLowerCase())) {
    index.push(entry.address);
    await setItemAsync(INDEX_KEY, JSON.stringify(index));
  }
  return loadLinks();
}

async function forgetLink(key: Hex): Promise<StoredLink[]> {
  const target = (await loadLinks()).find((entry) => entry.key.toLowerCase() === key.toLowerCase());
  if (target) {
    const index = (await readIndex()).filter((a) => a.toLowerCase() !== target.address.toLowerCase());
    await setItemAsync(INDEX_KEY, JSON.stringify(index));
    await deleteItemAsync(itemKey(target.address));
  }
  return loadLinks();
}

export { forgetLink, loadLinks, rememberLink };
