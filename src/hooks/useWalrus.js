// Custom hook for Walrus Mainnet storage operations
// Wraps storeBlob and readBlob with loading/error state

import { useState, useCallback } from 'react'
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit'
import { storeBlob, readBlob, getExplorerUrl } from '../lib/walrus'

export function useWalrus() {
  const currentAccount          = useCurrentAccount()
  const { mutateAsync: signTx } = useSignAndExecuteTransaction()
  const [saving,  setSaving]    = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error,   setError]     = useState(null)

  // Wrap signTx so walrus.js can call it
  const signAndExecute = useCallback(async ({ transaction }) => {
    return signTx({
      transaction,
      options: {
        showEffects:       true,
        showObjectChanges: true,
      },
    })
  }, [signTx])

  // ── Save state to Walrus Mainnet ──────────────────────────────────────────
  // Triggers two wallet popups: register + certify
  const save = useCallback(async (data) => {
    if (!currentAccount) {
      throw new Error('No wallet connected — connect your Sui wallet first')
    }
    setError(null)
    setSaving(true)
    try {
      const blobId = await storeBlob(data, signAndExecute, currentAccount)
      return blobId
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }, [currentAccount, signAndExecute])

  // ── Load state from Walrus Mainnet ────────────────────────────────────────
  // Free read — no wallet needed
  const load = useCallback(async (blobId) => {
    setError(null)
    setLoading(true)
    try {
      const data = await readBlob(blobId)
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    save,
    load,
    saving,
    loading,
    error,
    getExplorerUrl,
    isConnected: !!currentAccount,
    address:     currentAccount?.address || null,
  }
}
