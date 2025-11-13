import React, { useEffect, useState, useRef } from 'react';
import { ethers } from 'ethers';
import { Upload, CheckCircle, XCircle, Wallet, Loader2 } from 'lucide-react';

const CONTRACT_ABI = [
  "function mintDiploma(address student, string memory metadataURI, string memory pdfHash) external",
  "function ownerOf(uint256 tokenId) public view returns (address)",
  "function getPdfHash(uint256 tokenId) public view returns (string)",
  "function nextId() external view returns (uint256)",
  "function hasRole(bytes32 role, address account) external view returns (bool)",
  "function hasMinterRole(address account) external view returns (bool)",
  "function hasRevokerRole(address account) external view returns (bool)"
];

const DEFAULT_METADATA =
  "https://violet-patient-tiger-874.mypinata.cloud/ipfs/bafkreieetfhppak5kdnuljt45hy462yvoghlawzovobtm32m7ifhiqcmtq";

export default function SepoliaDiplomaDapp({ provider, signer, account, roles, contractAddress }) {

  // Local wallet state
  const [localProvider, setLocalProvider] = useState(provider);
  const [localSigner, setLocalSigner] = useState(signer);
  const [localAccount, setLocalAccount] = useState(account);
  const [walletModal, setWalletModal] = useState(false);
  const [wallets, setWallets] = useState({});

  // Contract instance
  const [contract, setContract] = useState(null);

  // Mint inputs
  const [recipient, setRecipient] = useState('');
  const [metadataURI, setMetadataURI] = useState(DEFAULT_METADATA);
  const [mintPdfHash, setMintPdfHash] = useState('');

  // Verification
  const [uploadedPdfHash, setUploadedPdfHash] = useState('');
  const [verifyUploadedMatch, setVerifyUploadedMatch] = useState(null);

  // Tx handling
  const [txState, setTxState] = useState(null);
  const [txMessage, setTxMessage] = useState("");
  const [txHash, setTxHash] = useState(null);

  // UI
  const [status, setStatus] = useState('idle');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // -------------------------------
  // Wallet detection (MetaMask / Coinbase / fallback)
  // -------------------------------
  useEffect(() => {
    if (!window.ethereum) return;

    const injected = window.ethereum.providers || [window.ethereum];

    const metaMask = injected.find((p) => p.isMetaMask);
    const coinbase = injected.find((p) => p.isCoinbaseWallet);

    setWallets({
      metaMask: metaMask || null,
      coinbase: coinbase || null,
      fallback: window.ethereum
    });
  }, []);

  async function openWalletModal() {
    if (!window.ethereum) {
      alert("No compatible wallet found. Install MetaMask or Coinbase Wallet.");
      return;
    }
    setWalletModal(true);
  }

  async function connectWallet(providerObject) {
    try {
      setWalletModal(false);

      const browserProvider = new ethers.BrowserProvider(providerObject);
      setLocalProvider(browserProvider);

      await providerObject.request({ method: "eth_requestAccounts" });

      const s = await browserProvider.getSigner();
      const addr = await s.getAddress();

      setLocalSigner(s);
      setLocalAccount(addr);

    } catch (err) {
      console.error(err);
      alert("Wallet connection failed.");
    }
  }

  // -------------------------------
  // Instantiate contract
  // -------------------------------
  useEffect(() => {
    if (!localSigner || !contractAddress) return;
    setContract(new ethers.Contract(contractAddress, CONTRACT_ABI, localSigner));
  }, [localSigner, contractAddress]);

  // -------------------------------
  // Close dropdown on outside click
  // -------------------------------
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // -------------------------------
  // Dropdown actions
  // -------------------------------
  async function copyAddress() {
    if (!localAccount) return;
    try {
      await navigator.clipboard.writeText(localAccount);
      alert("Address copied to clipboard!");
    } catch {
      alert("Failed to copy address.");
    }
  }

  function viewOnEtherscan() {
    if (!localAccount) return;
    window.open(`https://sepolia.etherscan.io/address/${localAccount}`, "_blank");
  }

  function disconnectWallet() {
    window.location.href = "/adminprotected";
  }

  // -------------------------------
  // HASHING PDF
  // -------------------------------
  async function handlePdfUpload(e, type = 'verify') {
    const file = e.target.files[0];
    if (!file) return;

    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);

    const hex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const localHash = "0x" + hex;

    if (type === "mint") {
      setMintPdfHash(localHash);
    } else {
      setUploadedPdfHash(localHash);
      if (contract && localAccount) retriggerVerification(localHash);
    }
  }

  // -------------------------------
  // VERIFICATION LOGIC
  // -------------------------------
  async function scanDiplomasAndCompare(hash) {
    if (!contract || !localAccount) return null;

    try {
      const last = Number(await contract.nextId());

      for (let tokenId = 1; tokenId <= last; tokenId++) {
        try {
          const owner = await contract.ownerOf(tokenId);

          if (owner.toLowerCase() === localAccount.toLowerCase()) {
            const chainHash = await contract.getPdfHash(tokenId);

            if (chainHash.toLowerCase() === hash.toLowerCase()) {
              return tokenId;
            }
          }
        } catch { }
      }
    } catch (e) {
      console.error("scanDiplomas:", e);
    }
    return false;
  }

  async function retriggerVerification(forcedHash = null) {
    const hash = forcedHash || uploadedPdfHash;
    if (!hash) return;

    setStatus("Rescanning NFTs...");
    const match = await scanDiplomasAndCompare(hash);
    setVerifyUploadedMatch(match);
    setStatus("Scan complete");
  }

  // -------------------------------
  // MINT DIPLOMA
  // -------------------------------
  async function mintDiploma(e) {
    e.preventDefault();

    if (!roles.isAdmin && !roles.isMinter) {
      alert("You do not have permission to mint.");
      return;
    }

    if (!contract) return alert("Contract not ready.");
    if (!recipient || !metadataURI || !mintPdfHash) {
      return alert("Please fill all fields.");
    }

    try {
      setTxState("pending");
      setTxMessage("Sending transaction…");
      setTxHash(null);

      const tx = await contract.mintDiploma(recipient, metadataURI, mintPdfHash);

      setTxHash(tx.hash);
      setTxMessage("Waiting for blockchain confirmation…");

      await tx.wait();

      setTxState("confirmed");
      setTxMessage("Transaction confirmed!");

    } catch (err) {
      console.error(err);
      setTxState("failed");
      setTxMessage(err.message || "Transaction failed.");
    }
  }

  // -------------------------------
  // UI RENDER
  // -------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f7f8fa] to-[#e9ecf2] flex flex-col items-center font-sans">

      {/* Wallet Modal */}
      {walletModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-xl w-80 space-y-4">
            <h2 className="text-lg font-semibold text-center mb-2">Choose a Wallet</h2>

            {wallets.metaMask && (
              <button
                onClick={() => connectWallet(wallets.metaMask)}
                className="w-full px-4 py-2 border-2 border-black rounded-md hover:bg-black hover:text-white transition"
              >
                MetaMask
              </button>
            )}

            {wallets.coinbase && (
              <button
                onClick={() => connectWallet(wallets.coinbase)}
                className="w-full px-4 py-2 border-2 border-blue-600 text-blue-700 rounded-md hover:bg-blue-700 hover:text-white transition"
              >
                Coinbase Wallet
              </button>
            )}

            {!wallets.metaMask && !wallets.coinbase && wallets.fallback && (
              <button
                onClick={() => connectWallet(wallets.fallback)}
                className="w-full px-4 py-2 border border-gray-400 rounded-md hover:bg-gray-200"
              >
                Default Wallet
              </button>
            )}

            <button
              onClick={() => setWalletModal(false)}
              className="w-full mt-2 text-sm text-gray-600 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* TOP BAR */}
      <div className="w-full bg-white/90 backdrop-blur border-b flex justify-end px-6 py-2">
        <div className="relative flex items-center gap-3" ref={menuRef}>

          {localAccount && (
            <div className="hidden md:flex gap-2 text-[11px]">
              {roles.isAdmin && <span className="border border-black px-2 py-0.5 rounded">ADMIN</span>}
              {roles.isMinter && <span className="border border-green-600 text-green-600 px-2 py-0.5 rounded">MINTER</span>}
              {roles.isRevoker && <span className="border border-red-600 text-red-600 px-2 py-0.5 rounded">REVOKER</span>}
            </div>
          )}

          <button
            onClick={() => {
              if (!localAccount) openWalletModal();
              else setMenuOpen(!menuOpen);
            }}
            className="flex items-center space-x-2 px-3 py-1.5 border-2 border-black rounded-none text-black font-semibold text-xs hover:bg-black hover:text-white transition"
          >
            <Wallet size={16} />
            <span>{localAccount ? `${localAccount.slice(0, 6)}...${localAccount.slice(-4)}` : "Connect"}</span>
          </button>

          {/* DROPDOWN */}
          {menuOpen && localAccount && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-black rounded-md shadow-lg z-50">

              <div className="px-3 py-2 text-xs text-gray-600 border-b break-all">{localAccount}</div>

              <div className="px-3 py-2 flex gap-2 border-b text-xs">
                {roles.isAdmin && <span className="border border-black px-2 py-0.5 rounded">ADMIN</span>}
                {roles.isMinter && <span className="border border-green-600 text-green-600 px-2 py-0.5 rounded">MINTER</span>}
                {roles.isRevoker && <span className="border border-red-600 text-red-600 px-2 py-0.5 rounded">REVOKER</span>}
              </div>

              <button onClick={copyAddress} className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
                Copy address
              </button>

              <button onClick={viewOnEtherscan} className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
                View on Etherscan (Sepolia)
              </button>

              <button onClick={disconnectWallet} className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-red-600">
                Disconnect
              </button>
            </div>
          )}

        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className="w-full max-w-4xl bg-white shadow-lg rounded-2xl p-10 mt-10 mb-10">

        <h2 className="text-3xl font-semibold text-center text-black mb-8">
          Diploma Minting & Verification Portal
        </h2>

        {/* MINT DIPLOMA */}
        <section className="mb-10">
          <h3 className="text-xl font-medium mb-4 text-black">Mint Diploma</h3>

          {!roles.isAdmin && !roles.isMinter && (
            <p className="text-red-600 text-sm mb-4">You do not have mint permissions.</p>
          )}

          <form onSubmit={mintDiploma} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-black">Recipient Address</label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full border rounded-lg p-2 mt-1"
                placeholder="0x..."
              />
            </div>

            <div>
              <label className="text-sm font-medium text-black">Metadata URI (IPFS JSON)</label>
              <input
                type="text"
                value={metadataURI}
                onChange={(e) => setMetadataURI(e.target.value)}
                className="w-full border rounded-lg p-2 mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-black flex items-center gap-2">
                <Upload size={16} /> Upload Diploma PDF
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => handlePdfUpload(e, 'mint')}
                className="w-full border rounded-lg p-2 mt-2"
              />
              {mintPdfHash && (
                <div className="p-2 bg-gray-100 rounded-lg text-xs mt-2 break-all">
                  PDF Hash: {mintPdfHash}
                </div>
              )}
            </div>

            {(roles.isAdmin || roles.isMinter) && (
              <button
                type="submit"
                className="px-5 py-2 border-2 border-black rounded-none text-black uppercase font-semibold tracking-wide hover:bg-black hover:text-white transition"
              >
                Mint Diploma
              </button>
            )}
          </form>

          {/* TRANSACTION FEEDBACK */}
          {txState && (
            <div
              className={`mt-4 p-3 border rounded text-sm flex items-center gap-2 ${
                txState === "pending"
                  ? "bg-gray-50 border-gray-300 text-gray-700"
                  : txState === "confirmed"
                  ? "bg-green-50 border-green-300 text-green-700"
                  : "bg-red-50 border-red-300 text-red-700"
              }`}
            >
              {txState === "pending" && <Loader2 className="animate-spin" size={16} />}
              {txState === "confirmed" && <CheckCircle size={16} />}
              {txState === "failed" && <XCircle size={16} />}

              <span>{txMessage}</span>

              {txHash && (
                <a
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline ml-2"
                >
                  View Transaction
                </a>
              )}
            </div>
          )}

        </section>

        {/* VERIFICATION */}
        <section>
          <h3 className="text-xl font-medium mb-4 text-black">Verify Diploma by PDF Upload</h3>

          <label className="text-sm font-medium text-black flex items-center gap-2">
            <Upload size={16} /> Upload PDF
          </label>
          <input
            type="file"
            accept="application/pdf"
            onChange={handlePdfUpload}
            className="w-full border rounded-lg p-2 mt-2"
          />

          {uploadedPdfHash && (
            <div className="p-2 bg-gray-100 rounded-lg text-xs mt-2 break-all">
              Local PDF Hash: {uploadedPdfHash}
            </div>
          )}

          {uploadedPdfHash && (
            <button
              onClick={() => retriggerVerification()}
              className="mt-3 px-4 py-2 border-2 border-black rounded-none text-sm uppercase font-semibold tracking-wide hover:bg-black hover:text-white transition"
            >
              Re-run Verification
            </button>
          )}

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
                  : `Diploma verified — match found (Token ID #${verifyUploadedMatch})`}
              </span>
            </div>
          )}
        </section>

      </main>

      <footer className="text-center text-sm text-black mb-6">
        © 2025 NOVA School of Business and Economics — Diploma Verification Demo on Sepolia
      </footer>
    </div>
  );
}
