import React, { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { Upload, CheckCircle, XCircle, Wallet, Loader2 } from 'lucide-react'

const CONTRACT_ABI = [
  "function ownerOf(uint256 tokenId) public view returns (address)",
  "function getPdfHash(uint256 tokenId) public view returns (string)",
  "function nextId() external view returns (uint256)"
]

const CONTRACT_ADDRESS = "0x1E0AA66Ad5B46e2af5a5587BEcf7Fb15b6E043fc"

export default function VerificationPortal() {
  const [formData, setFormData] = useState({ name: '', email: '', address: '' })
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [account, setAccount] = useState(null)
  const [contract, setContract] = useState(null)

  const [uploadedPdfHash, setUploadedPdfHash] = useState('')
  const [verifyUploadedMatch, setVerifyUploadedMatch] = useState(null)
  const [status, setStatus] = useState('idle')
  const [submitted, setSubmitted] = useState(false)

  // Wallet selector state
  const [availableWallets, setAvailableWallets] = useState({})
  const [showWalletModal, setShowWalletModal] = useState(false)

  // Detect available injected wallets
  useEffect(() => {
    if (!window.ethereum) return;

    const injected = window.ethereum.providers || [window.ethereum]

    const metaMask = injected.find((p) => p.isMetaMask)
    const coinbase = injected.find((p) => p.isCoinbaseWallet)

    setAvailableWallets({
      metaMask: metaMask || null,
      coinbase: coinbase || null,
      fallback: window.ethereum,
    })
  }, [])

  function openWalletModal() {
    if (!window.ethereum) {
      alert("No wallet found. Please install MetaMask or Coinbase Wallet.")
      return
    }
    setShowWalletModal(true)
  }

  async function connectWithSelected(providerObject) {
    try {
      setShowWalletModal(false)
      setStatus('connecting')

      const browserProv = new ethers.BrowserProvider(providerObject)
      setProvider(browserProv)

      await providerObject.request({ method: "eth_requestAccounts" })

      const s = await browserProv.getSigner()
      const addr = await s.getAddress()

      setSigner(s)
      setAccount(addr)

      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, s)
      setContract(c)

      setStatus('done')
    } catch (err) {
      console.error(err)
      setStatus('error')
    }
  }

  // Re-run verification when needed
  useEffect(() => {
    if (account && uploadedPdfHash && contract) {
      retriggerVerification(uploadedPdfHash)
    }
  }, [account, uploadedPdfHash, contract])

  async function scanDiplomasAndCompare(hash) {
    if (!contract || !account) return null
    try {
      const last = await contract.nextId()
      const lastNum = Number(last)
      for (let tokenId = 1; tokenId <= lastNum; tokenId++) {
        try {
          const owner = await contract.ownerOf(tokenId)
          if (owner && owner.toLowerCase() === account.toLowerCase()) {
            const chainHash = await contract.getPdfHash(tokenId)
            if (chainHash.toLowerCase() === hash.toLowerCase()) return tokenId
          }
        } catch {}
      }
    } catch (err) {
      console.error('Error scanning diplomas:', err)
    }
    return false
  }

  async function handlePdfUpload(e) {
    const file = e.target.files[0]
    if (!file) return

    const arrayBuffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer)
    const hex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    const localHash = '0x' + hex

    setUploadedPdfHash(localHash)
  }

  async function retriggerVerification(hash) {
    if (!hash) return
    setStatus('Verifying...')
    const match = await scanDiplomasAndCompare(hash)
    setVerifyUploadedMatch(match)
    setStatus('done')
  }

  function handleInputChange(e) {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  function handleSubmit() {
    setSubmitted(true)
  }

  const allFilled =
    formData.name.trim().length > 0 &&
    formData.email.trim().length > 0 &&
    formData.address.trim().length > 0

  const verifiedOk = verifyUploadedMatch && verifyUploadedMatch !== false
  const canSubmit = verifiedOk && allFilled

  // ----------------------------------------
  //  Submission Success View
  // ----------------------------------------
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f7f8fa] to-[#e9ecf2] flex justify-center items-center font-sans">
        <div className="bg-white rounded-2xl shadow-lg p-10 text-center max-w-md">
          <CheckCircle size={48} className="mx-auto text-green-600 mb-4" />
          <h2 className="text-2xl font-semibold text-black mb-2">Thanks for submitting your application!</h2>
          <p className="text-gray-600">We’ve received your details and verified your diploma.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f7f8fa] to-[#e9ecf2] flex justify-center py-10 px-4 font-sans">

      {/* WALLET SELECTOR MODAL */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-xl w-80 space-y-4">
            <h2 className="text-lg font-semibold text-center mb-2">
              Choose a Wallet
            </h2>

            {availableWallets.metaMask && (
              <button
                onClick={() => connectWithSelected(availableWallets.metaMask)}
                className="w-full px-4 py-2 border-2 border-black rounded-md hover:bg-black hover:text-white transition"
              >
                MetaMask
              </button>
            )}

            {availableWallets.coinbase && (
              <button
                onClick={() => connectWithSelected(availableWallets.coinbase)}
                className="w-full px-4 py-2 border-2 border-blue-600 text-blue-700 rounded-md hover:bg-blue-700 hover:text-white transition"
              >
                Coinbase Wallet
              </button>
            )}

            {!availableWallets.metaMask &&
              !availableWallets.coinbase &&
              availableWallets.fallback && (
                <button
                  onClick={() => connectWithSelected(availableWallets.fallback)}
                  className="w-full px-4 py-2 border border-gray-400 rounded-md hover:bg-gray-200"
                >
                  Default Wallet
                </button>
              )}

            <button
              onClick={() => setShowWalletModal(false)}
              className="w-full mt-2 text-sm text-gray-600 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-3xl font-semibold text-center text-black mb-6">Diploma Verification Form</h2>
        <p className="text-gray-600 text-center mb-8">
          Please fill in your details and upload your diploma PDF to verify its authenticity.
        </p>

        {/* FORM */}
        <form className="space-y-5">
          <div>
            <label className="text-sm font-medium text-black">Full Name</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className="w-full border rounded-lg p-2 mt-1 focus:ring-[#004b87]"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-black">Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className="w-full border rounded-lg p-2 mt-1 focus:ring-[#004b87]"
              placeholder="john@example.com"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-black">Street Address</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              className="w-full border rounded-lg p-2 mt-1 focus:ring-[#004b87]"
              placeholder="123 Main Street"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-black flex items-center space-x-2">
              <Upload size={16} /> <span>Upload Diploma PDF</span>
            </label>
            <input
              type="file"
              accept="application/pdf"
              className="w-full border rounded-lg p-2 mt-2"
              onChange={handlePdfUpload}
            />
            {uploadedPdfHash && (
              <div className="p-2 bg-gray-100 rounded-lg text-xs mt-2 break-all">
                Local PDF Hash: {uploadedPdfHash}
              </div>
            )}
          </div>

          {!account && (
            <button
              type="button"
              onClick={openWalletModal}
              className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 border-2 border-black text-black bg-transparent uppercase font-semibold hover:bg-black hover:text-white transition"
            >
              <Wallet size={18} /> Connect Wallet to Verify
            </button>
          )}
        </form>

        {/* VERIFYING MESSAGE */}
        {status === 'Verifying...' && (
          <div className="mt-6 p-4 border rounded bg-gray-50 flex items-center justify-center space-x-2 text-sm">
            <Loader2 className="animate-spin" size={18} />
            <span>Verifying diploma on-chain...</span>
          </div>
        )}

        {/* VERIFICATION RESULT */}
        {verifyUploadedMatch !== null && uploadedPdfHash && (
          <div
            className={`mt-4 p-4 rounded-lg text-sm flex gap-2 border ${
              verifyUploadedMatch === false
                ? "bg-red-50 border-red-300 text-red-700"
                : "bg-green-50 border-green-300 text-green-700"
            }`}
          >
            {verifyUploadedMatch === false ? <XCircle size={18} /> : <CheckCircle size={18} />}
            <span>
              {verifyUploadedMatch === false
                ? "No diploma NFT in your wallet matches this PDF."
                : `Diploma verified – match found (Token ID #${verifyUploadedMatch})`}
            </span>
          </div>
        )}

        {/* SUBMIT */}
        <div className="mt-6">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`w-full px-4 py-2 border-2 border-black text-black bg-transparent uppercase font-semibold tracking-wide transition
              ${!canSubmit ? 'opacity-50 cursor-not-allowed' : 'hover:bg-black hover:text-white'}`}
          >
            Submit Application
          </button>
          {!canSubmit && (
            <p className="mt-2 text-xs text-gray-500 text-center">
              Please complete all fields and verify your diploma.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
