import React, { useEffect, useState, useRef } from 'react';
import { ethers } from 'ethers';
import { Upload, CheckCircle, XCircle, Wallet, Loader2 } from 'lucide-react';

const CONTRACT_ABI = [
  "function mintDiploma(address student, string memory metadataURI, string memory pdfHash) external",
  "function ownerOf(uint256 tokenId) public view returns (address)",
  "function getPdfHash(uint256 tokenId) public view returns (string)",
  "function nextId() external view returns (uint256)",
  "function hasRole(bytes32 role, address account) external view returns (bool)"
];

const CONTRACT_ADDRESS = "0x81083cfad5c2f24f27dfa39265340f433da0ea91";
const DEFAULT_METADATA = "https://violet-patient-tiger-874.mypinata.cloud/ipfs/bafkreieetfhppak5kdnuljt45hy462yvoghlawzovobtm32m7ifhiqcmtq";

export default function SepoliaDiplomaDapp() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [status, setStatus] = useState('idle');
  const [txHash, setTxHash] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [roles, setRoles] = useState({ isAdmin: false, isMinter: false, isRevoker: false });
  const [recipient, setRecipient] = useState('');
  const [metadataURI, setMetadataURI] = useState(DEFAULT_METADATA);
  const [mintPdfHash, setMintPdfHash] = useState('');
  const [uploadedPdfHash, setUploadedPdfHash] = useState('');
  const [verifyUploadedMatch, setVerifyUploadedMatch] = useState(null);

  useEffect(() => {
    document.body.style.fontFamily = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    if (!window.ethereum) return;
    let p = ethers?.providers?.Web3Provider
      ? new ethers.providers.Web3Provider(window.ethereum, 'any')
      : new ethers.BrowserProvider(window.ethereum);
    setProvider(p);

    function handleClickOutside(e){
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const MINTER_ROLE = ethers.id("MINTER_ROLE");
  const REVOKER_ROLE = ethers.id("REVOKER_ROLE");
  // Default admin role in OpenZeppelin is bytes32(0)
  const ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';

  async function connectWallet() {
    if (!window.ethereum) return alert('Please install MetaMask or another web3 wallet');
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const s = await provider.getSigner();
      const addr = await s.getAddress();
      setSigner(s);
      setAccount(addr);
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, s);
      setContract(c);
      await fetchRoles(c, addr);
      setStatus('connected');
      if (uploadedPdfHash) retriggerVerification();
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }

  function disconnectWallet() {
    setSigner(null);
    setAccount(null);
    setContract(null);
    setStatus('disconnected');
    setVerifyUploadedMatch(null);
    setMenuOpen(false);
  }

  async function copyAddress() {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account);
      setStatus('Address copied');
    } catch {
      setStatus('Copy failed');
    }
    setMenuOpen(false);
  }

  function viewOnEtherscan() {
    if (!account) return;
    const url = `https://sepolia.etherscan.io/address/${account}`;
    window.open(url, '_blank');
    setMenuOpen(false);
  }

  async function fetchRoles(c, addr) {
    if (!c || !addr) return;
    try {
      const [isMinter, isRevoker, isAdmin] = await Promise.all([
        c.hasRole(MINTER_ROLE, addr),
        c.hasRole(REVOKER_ROLE, addr),
        c.hasRole(ADMIN_ROLE, addr),
      ]);
      setRoles({ isAdmin, isMinter, isRevoker });
    } catch (e) {
      console.error('fetchRoles error', e);
    }
  }

  async function scanDiplomasAndCompare(hash) {
    if (!contract || !account) return null;
    try {
      const last = await contract.nextId();
      const lastNum = Number(last);
      for (let tokenId = 1; tokenId <= lastNum; tokenId++) {
        try {
          const owner = await contract.ownerOf(tokenId);
          if (owner && owner.toLowerCase() === account.toLowerCase()) {
            const chainHash = await contract.getPdfHash(tokenId);
            if (chainHash.toLowerCase() === hash.toLowerCase()) return tokenId;
          }
        } catch {}
      }
    } catch (err) {
      console.error('Error scanning diplomas:', err);
    }
    return false;
  }

  async function handlePdfUpload(e, type = 'verify') {
    const file = e.target.files[0];
    if (!file) return;

    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    const localHash = '0x' + hex;

    if (type === 'mint') setMintPdfHash(localHash);
    else {
      setUploadedPdfHash(localHash);
      if (contract && account) await retriggerVerification(localHash);
    }
  }

  async function retriggerVerification(forcedHash = null) {
    const hash = forcedHash || uploadedPdfHash;
    if (!hash) return;
    setStatus('Rescanning NFTs...');
    const match = await scanDiplomasAndCompare(hash);
    setVerifyUploadedMatch(match);
    setStatus('Scan complete');
  }

  async function mintDiploma(e) {
    e.preventDefault();
    if (!contract) return alert('Connect your wallet first');
    if (!recipient || !metadataURI || !mintPdfHash) return alert('Please select a PDF, recipient and metadata URI');
    try {
      setStatus('sending');
      setTxHash(null);
      const tx = await contract.mintDiploma(recipient, metadataURI, mintPdfHash);
      setTxHash(tx.hash);
      setStatus('Transaction pending...');
      await tx.wait();
      setStatus('Transaction confirmed ✅');
      // Auto-hide confirmation after 10 seconds
      setTimeout(() => {
        setStatus('idle');
        setTxHash(null);
      }, 10000);
    } catch (err) {
      console.error(err);
      setStatus('Transaction failed: ' + (err.message || String(err)));
      setTimeout(() => setStatus('idle'), 10000);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f7f8fa] to-[#e9ecf2] flex flex-col items-center font-sans">
      <header className="w-full bg-white shadow-md flex items-center justify-between px-8 py-4">
        <div className="flex items-center space-x-3">
          <img src="/NovaPrincipalV2.png" alt="NOVA SBE Logo" className="h-8" />
          <h1 className="text-xl font-semibold text-black">NOVA SBE Diploma Verification</h1>
        </div>

        <div className="relative flex items-center gap-3" ref={menuRef}>
          {account && (
            <div className="hidden md:flex gap-2 text-xs">
              {roles.isAdmin && <span className="border border-black px-2 py-1 rounded">ADMIN</span>}
              {roles.isMinter && <span className="border border-green-600 text-green-600 px-2 py-1 rounded">MINTER</span>}
              {roles.isRevoker && <span className="border border-red-600 text-red-600 px-2 py-1 rounded">REVOKER</span>}
            </div>
          )}
          <button
            onClick={() => (account ? setMenuOpen(!menuOpen) : connectWallet())}
            className="flex items-center space-x-2 px-4 py-2 rounded-none border-2 border-black text-black bg-transparent uppercase font-semibold tracking-wide hover:bg-black hover:text-white transition"
          >
            <Wallet size={18} />
            <span>{account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Connect Wallet'}</span>
          </button>

          {account && menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-black rounded-md shadow-lg z-50">
              <div className="px-3 py-2 text-xs text-gray-600 border-b break-all">{account}</div>
              <div className="px-3 py-2 flex flex-wrap gap-2 border-b text-xs">
                {roles.isAdmin && <span className="border border-black px-2 py-0.5 rounded">ADMIN</span>}
                {roles.isMinter && <span className="border border-green-600 text-green-600 px-2 py-0.5 rounded">MINTER</span>}
                {roles.isRevoker && <span className="border border-red-600 text-red-600 px-2 py-0.5 rounded">REVOKER</span>}
                {!roles.isAdmin && !roles.isMinter && !roles.isRevoker && <span className="text-gray-500">No special roles</span>}
              </div>
              <button onClick={copyAddress} className="w-full text-left px-4 py-2 hover:bg-gray-100">Copy address</button>
              <button onClick={viewOnEtherscan} className="w-full text-left px-4 py-2 hover:bg-gray-100">View on Etherscan (Sepolia)</button>
              <button onClick={disconnectWallet} className="w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600">Disconnect</button>
            </div>
          )}
        </div>
      </header>

      <main className="w-full max-w-4xl bg-white shadow-lg rounded-2xl p-10 mt-10 mb-10">
        <h2 className="text-3xl font-semibold text-center text-black mb-8">Diploma Minting & Verification Portal</h2>

        <section className="mb-10">
          <h3 className="text-xl font-medium mb-4 text-black">Mint Diploma</h3>
          <form onSubmit={mintDiploma} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-black">Recipient Address</label>
              <input type="text" className="w-full border rounded-lg p-2 mt-1 focus:ring-[#004b87] focus:border-[#004b87]" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="0x..." />
            </div>
            <div>
              <label className="text-sm font-medium text-black">Metadata URI (IPFS JSON)</label>
              <input type="text" className="w-full border rounded-lg p-2 mt-1 focus:ring-[#004b87] focus:border-[#004b87]" value={metadataURI} onChange={e => setMetadataURI(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-black flex items-center space-x-2"><Upload size={16} /> <span>Upload Diploma PDF</span></label>
              <input type="file" accept="application/pdf" className="w-full border rounded-lg p-2 mt-2" onChange={e => handlePdfUpload(e, 'mint')} />
              {mintPdfHash && <div className="p-2 bg-gray-100 rounded-lg text-xs mt-2 break-all">Generated Hash: {mintPdfHash}</div>}
            </div>
            <button type="submit" className="mt-2 px-5 py-2 border-2 border-black text-black bg-transparent rounded-none uppercase font-semibold tracking-wide hover:bg-black hover:text-white transition">Mint Diploma</button>
          </form>

          {status.startsWith('Transaction') || status.startsWith('sending') ? (
            <div className="mt-4 p-3 border rounded bg-gray-50 flex items-center space-x-2 text-sm">
              <Loader2 className="animate-spin" size={16} />
              <span>{status}</span>
              {txHash && <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-blue-600 underline ml-2">View on Etherscan</a>}
            </div>
          ) : status.includes('confirmed') ? (
            <div className="mt-4 p-3 border rounded bg-green-50 text-green-700 text-sm">✅ {status} {txHash && <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-green-800 underline ml-1">View Tx</a>}</div>
          ) : status.includes('failed') ? (
            <div className="mt-4 p-3 border rounded bg-red-50 text-red-700 text-sm">❌ {status}</div>
          ) : null}
        </section>

        <section>
          <h3 className="text-xl font-medium mb-4 text-black">Verify Diploma by PDF Upload</h3>
          <div className="space-y-4">
            <label className="text-sm font-medium text-black flex items-center space-x-2"><Upload size={16} /> <span>Upload PDF for Verification</span></label>
            <input type="file" accept="application/pdf" className="w-full border rounded-lg p-2" onChange={handlePdfUpload} />

            {uploadedPdfHash && <div className="p-2 bg-gray-100 rounded-lg text-xs break-all">Local PDF Hash: {uploadedPdfHash}</div>}

            {uploadedPdfHash && (
              <button onClick={() => retriggerVerification()} className="px-4 py-2 border-2 border-black text-black bg-transparent rounded-none text-sm uppercase font-semibold tracking-wide hover:bg-black hover:text-white transition">Re-run Verification</button>
            )}

            {verifyUploadedMatch !== null && uploadedPdfHash && (
              <div className={`p-4 rounded-lg text-sm border flex items-center space-x-2 ${verifyUploadedMatch === false ? 'bg-red-50 border-red-300 text-red-700' : 'bg-green-50 border-green-300 text-green-700'}`}>
                {verifyUploadedMatch === false ? <XCircle size={18} /> : <CheckCircle size={18} />}
                <span>{verifyUploadedMatch === false ? 'No diploma NFT in your connected wallet matches this PDF' : `PDF matches your Diploma NFT — Token ID #${verifyUploadedMatch}`}</span>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="text-center text-sm text-black mb-6">
        © 2025 NOVA School of Business and Economics — Diploma Verification Demo on Sepolia
      </footer>
    </div>
  );
}