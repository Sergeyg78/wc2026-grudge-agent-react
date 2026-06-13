// Walrus Mainnet client using official @mysten/walrus SDK
// Docs: https://sdk.mystenlabs.com/walrus

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { WalrusClient } from '@mysten/walrus'
import walrusWasmUrl from '@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url'

// ── Mainnet config ────────────────────────────────────────────────────────────
const MAINNET_AGGREGATOR = 'https://aggregator.walrus-mainnet.walrus.space'
const WALRUS_EXPLORER    = 'https://walruscan.com/mainnet/blob'
export const STORAGE_EPOCHS = 5  // 5 × 2 weeks = ~10 weeks storage

// ── Sui mainnet client ────────────────────────────────────────────────────────
export const suiClient = new SuiClient({
  url: getFullnodeUrl('mainnet'),
})

// ── Walrus mainnet client ─────────────────────────────────────────────────────
export const walrusClient = new WalrusClient({
  network: 'mainnet',
  suiClient,
  wasmUrl: walrusWasmUrl,
  uploadRelay: {
    host: 'https://upload-relay.mainnet.walrus.space',
    sendTip: { max: 10_000_000 }, // max 0.01 SUI tip per write
  },
})

// ── Store JSON blob on Walrus Mainnet ─────────────────────────────────────────
// Prompts wallet TWICE: register (pay WAL) + certify (finalise on Sui)
export async function storeBlob(data, signAndExecuteTransaction, currentAccount) {
  if (!currentAccount) throw new Error('No wallet connected')

  const encoded = new TextEncoder().encode(JSON.stringify(data))

  const flow = walrusClient.writeFilesFlow({
    files: [{
      contents:   encoded,
      identifier: 'grudge-memory.json',
      tags:       { 'content-type': 'application/json' },
    }],
  })

  // Step 1: Encode blob into slivers
  await flow.encode()

  // Step 2: Register on Sui — wallet signs (pays WAL for storage)
  const registerTx = flow.register({
    epochs:   STORAGE_EPOCHS,
    owner:    currentAccount.address,
    deletable: false,
  })

  const regResult = await signAndExecuteTransaction({ transaction: registerTx })

  if (regResult.effects?.status?.status === 'failure') {
    throw new Error(`Register failed: ${regResult.effects.status.error}`)
  }

  // Step 3: Upload slivers to storage nodes via relay
  await flow.upload({
    digest: regResult.digest || regResult.Transaction?.digest,
  })

  // Step 4: Certify on Sui — wallet signs again (finalises storage)
  const certifyTx  = flow.certify()
  const certResult = await signAndExecuteTransaction({ transaction: certifyTx })

  if (certResult.effects?.status?.status === 'failure') {
    throw new Error(`Certify failed: ${certResult.effects.status.error}`)
  }

  // Step 5: Get the blob ID
  const files  = await flow.listFiles()
  const blobId = files[0]?.blobId

  if (!blobId) throw new Error('No blob ID returned — upload may have failed')
  return blobId
}

// ── Read JSON blob from Walrus Mainnet ────────────────────────────────────────
// Free — uses public aggregator, no wallet needed
export async function readBlob(blobId) {
  if (!blobId || typeof blobId !== 'string') {
    throw new Error('Invalid blob ID')
  }
  const res = await fetch(`${MAINNET_AGGREGATOR}/v1/blobs/${blobId.trim()}`)
  if (!res.ok) throw new Error(`Blob not found (${res.status})`)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Blob content is not valid JSON')
  }
}

// ── Helper: WalrusScan explorer URL ──────────────────────────────────────────
export function getExplorerUrl(blobId) {
  return `${WALRUS_EXPLORER}/${blobId}`
}
