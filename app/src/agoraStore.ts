import { getItemAsync, setItemAsync } from "expo-secure-store";
import { addSettled, parseSettledList, type SettledTransfer } from "./agora";

const SETTLED_KEY = "portionly.settled.v1";

/** Recent testnet transfers. Not secret (hashes and addresses), so no requireAuthentication. */
async function loadSettled(): Promise<SettledTransfer[]> {
  return parseSettledList(await getItemAsync(SETTLED_KEY));
}

async function saveSettled(current: readonly SettledTransfer[], record: SettledTransfer): Promise<SettledTransfer[]> {
  const next = addSettled(current, record);
  await setItemAsync(SETTLED_KEY, JSON.stringify(next));
  return next;
}

export { loadSettled, saveSettled };
