import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wallet, XCircle, Loader2 } from 'lucide-react';
import SepoliaDiplomaDapp from './SepoliaDiplomaDapp';

// Contract address on Sepolia
const CONTRACT_ADDRESS = '0x1E0AA66Ad5B46e2af5a5587BEcf7Fb15b6E043fc';

// Minimal ABI with exactly what the contract exposes
const CONTRACT_ABI = [
  'function hasMinterRole(address account) external view returns (bool)',
  'function hasRevokerRole(address account) external view returns (bool)',
  'function hasRole(bytes32 role, address account) external view returns (bool)',
];

export default function AdminProtected() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [roles, setRoles] = useState({ isAdmin: false, isMinter: false, isRevoker: false });
  const [status, setStatus] = useState('idle');

  const [availableWallets, setAvailableWallets] = useState({});
  const [showWalletModal, setShowWalletModal] = useState(false);

  // Detect wallets — PHANTOM REMOVED
  useEffect(() => {
    if (!window.ethereum) return;

    const injected = window.ethereum.providers || [window.ethereum];

    const metaMask = injected.find((p) => p.isMetaMask);
    const coinbase = injected.find((p) => p.isCoinbaseWallet);

    // PHANTOM REMOVED HERE
    setAvailableWallets({
      metaMask: metaMask || null,
      coinbase: coinbase || null,
      fallback: window.ethereum,
    });
  }, []);

  async function connectWallet() {
    if (!window.ethereum) {
      alert('No wallet found. Please install MetaMask or Coinbase Wallet.');
      return;
    }
    setShowWalletModal(true);
  }

  async function connectWithSelected(providerObject) {
    try {
      setShowWalletModal(false);
      setStatus('connecting');

      const selected = new ethers.BrowserProvider(providerObject);
      setProvider(selected);

      await providerObject.request({ method: 'eth_requestAccounts' });

      const s = await selected.getSigner();
      const addr = await s.getAddress();

      setSigner(s);
      setAccount(addr);

      await checkRoles(s, addr);
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }

  async function checkRoles(signer, addr) {
    try {
      setStatus('checking');

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      // DEFAULT_ADMIN_ROLE is always 0x00 in AccessControl
      const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

      const [isMinter, isRevoker, isAdmin] = await Promise.all([
        contract.hasMinterRole(addr),
        contract.hasRevokerRole(addr),
        contract.hasRole(DEFAULT_ADMIN_ROLE, addr),
      ]);

      console.log('Role check for', addr, {
        isMinter,
        isRevoker,
        isAdmin,
      });

      setRoles({ isMinter, isRevoker, isAdmin });
      setStatus('done');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }

  const hasAccess = roles.isAdmin || roles.isMinter || roles.isRevoker;

  // Loading
  if (status === 'connecting' || status === 'checking') {
    return (
      <div className="min-h-screen flex justify-center items-center bg-[#f7f8fa]">
        <div className="text-center text-gray-700">
          <Loader2 size={24} className="animate-spin mx-auto mb-3" />
          Checking wallet access...
        </div>
      </div>
    );
  }

  // Not connected
  if (!account) {
    return (
      <>
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

        <div className="min-h-screen flex justify-center items-center bg-[#f7f8fa] font-sans">
          <div className="bg-white shadow-lg rounded-xl p-10 text-center">
            <h2 className="text-xl font-semibold mb-3 text-black">Admin Login Required</h2>
            <p className="text-gray-600 mb-6">
              Please connect your wallet to continue.
            </p>
            <button
              onClick={connectWallet}
              className="px-5 py-2 border-2 border-black text-black uppercase font-semibold tracking-wide hover:bg-black hover:text-white transition flex items-center gap-2 mx-auto"
            >
              <Wallet size={18} /> Connect Wallet
            </button>
          </div>
        </div>
      </>
    );
  }

  // Permission denied
  if (!hasAccess && (status === 'done' || status === 'error')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f7f8fa] font-sans">
        <div className="bg-white shadow-lg rounded-xl p-8 border border-red-300 max-w-md w-full text-center">
          <div className="w-full flex justify-center mb-4">
            <XCircle size={55} className="text-red-600" />
          </div>

          <h2 className="text-xl font-semibold text-red-700 mb-2">
            Permission Denied
          </h2>

          <p className="text-gray-700 mb-4">
            This wallet does not have Admin, Minter, or Revoker privileges.
          </p>

          <p className="text-xs text-gray-500 break-all mb-6">
            Connected wallet:<br />
            {account}
          </p>

          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 border border-red-500 text-red-600 rounded-md hover:bg-red-50 transition"
          >
            Try another wallet
          </button>
        </div>
      </div>
    );
  }

  // Authorized
  return (
    <SepoliaDiplomaDapp
      provider={provider}
      signer={signer}
      account={account}
      roles={roles}
      contractAddress={CONTRACT_ADDRESS}
    />
  );
}
