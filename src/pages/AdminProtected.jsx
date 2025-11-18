import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wallet, XCircle, Loader2 } from 'lucide-react';
import SepoliaDiplomaDapp from './SepoliaDiplomaDapp';

// ✅ Import the full ABI
import DiplomaNFT from '../abi/DiplomaNFT.json';

// Contract address on Sepolia
const CONTRACT_ADDRESS = '0x1E0AA66Ad5B46e2af5a5587BEcf7Fb15b6E043fc';

// ABI from JSON
const CONTRACT_ABI = DiplomaNFT;

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
    if (!window.ethereum) {
      console.warn('[wallet-detect] No window.ethereum found');
      return;
    }

    const injected = window.ethereum.providers || [window.ethereum];
    console.log('[wallet-detect] Injected providers:', injected);

    const metaMask = injected.find((p) => p.isMetaMask);
    const coinbase = injected.find((p) => p.isCoinbaseWallet);

    console.log('[wallet-detect] Detected MetaMask:', !!metaMask);
    console.log('[wallet-detect] Detected Coinbase:', !!coinbase);

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

      console.log('[connectWithSelected] Provider flags:', {
        isMetaMask: providerObject.isMetaMask,
        isCoinbaseWallet: providerObject.isCoinbaseWallet,
      });

      const selected = new ethers.BrowserProvider(providerObject);
      setProvider(selected);

      await providerObject.request({ method: 'eth_requestAccounts' });

      const s = await selected.getSigner();
      const addr = await s.getAddress();
      const network = await selected.getNetwork();

      console.log('[connectWithSelected] Connected address:', addr);
      console.log('[connectWithSelected] Network:', {
        chainId: network.chainId?.toString?.() ?? network.chainId,
        name: network.name,
      });

      // Optional: enforce Sepolia
      const SEPOLIA_CHAIN_ID = 11155111;
      if (Number(network.chainId) !== SEPOLIA_CHAIN_ID) {
        console.error(
          '[connectWithSelected] Wrong network. Expected Sepolia (11155111), got:',
          network.chainId
        );
        alert('Please switch your wallet network to Sepolia and try again.');
        setStatus('error');
        return;
      }

      setSigner(s);
      setAccount(addr);

      await checkRoles(s, addr);
    } catch (err) {
      console.error('[connectWithSelected] Error:', err);
      setStatus('error');
    }
  }

  async function checkRoles(signer, addr) {
    try {
      setStatus('checking');

      const provider = signer.provider;
      const network = await provider.getNetwork();

      console.log('[checkRoles] Start');
      console.log('[checkRoles] Address:', addr);
      console.log('[checkRoles] Network:', {
        chainId: network.chainId?.toString?.() ?? network.chainId,
        name: network.name,
      });

      // Check if there is actually a contract at this address
      const code = await provider.getCode(CONTRACT_ADDRESS);
      console.log('[checkRoles] Contract code at', CONTRACT_ADDRESS, '=>', code);

      if (code === '0x') {
        console.error(
          '[checkRoles] No contract deployed at this address on the current network. ' +
          'Likely wrong network in wallet (should be Sepolia) or wrong address.'
        );
        setStatus('error');
        return;
      }

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      // Sanity check: is hasMinterRole in the ABI?
      try {
        const frag = contract.interface.getFunction('hasMinterRole');
        console.log('[checkRoles] hasMinterRole fragment:', frag);
      } catch (e) {
        console.error('[checkRoles] hasMinterRole not found in ABI!', e);
      }

      const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

      console.log('[checkRoles] Calling role functions…');

      const results = await Promise.allSettled([
        contract.hasMinterRole(addr),
        contract.hasRevokerRole(addr),
        contract.hasRole(DEFAULT_ADMIN_ROLE, addr),
      ]);

      const labels = ['isMinter', 'isRevoker', 'isAdmin'];

      results.forEach((r, i) => {
        const label = labels[i];
        if (r.status === 'fulfilled') {
          console.log(`[checkRoles] ${label} =>`, r.value);
        } else {
          console.error(`[checkRoles] ${label} call failed:`, r.reason);
        }
      });

      if (results.some((r) => r.status === 'rejected')) {
        console.error('[checkRoles] One or more role calls failed, not updating roles.');
        setStatus('error');
        return;
      }

      const [isMinter, isRevoker, isAdmin] = results.map((r) => r.value);

      console.log('[checkRoles] Final roles:', { isMinter, isRevoker, isAdmin });

      setRoles({ isMinter, isRevoker, isAdmin });
      setStatus('done');
    } catch (err) {
      console.error('[checkRoles] Unexpected error:', err);
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
