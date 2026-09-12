import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Shield,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  Copy,
  Check,
  Server,
  RefreshCw,
  QrCode,
  Search,
  ChevronRight,
  Database,
  Clock,
  Lock,
  Cpu,
  Wifi,
  WifiOff,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import GeminiIcon from './icons/GeminiIcon.tsx';

export interface UtxoItem {
  txid: string;
  vout: number;
  quanta: number;
  blockHeight: number;
  status: 'CONFIRMED' | 'PENDING';
  scriptPubKey?: string;
  confirmations?: number;
}

export interface MutationItem {
  id: string;
  timestamp: string;
  type: 'INBOUND' | 'OUTBOUND' | 'REWARD';
  txHash: string;
  quantaDelta: number;
  runningBalanceQuanta: number;
  note?: string;
}

export interface PassbookData {
  accountNumber: string;
  passbookId: string;
  derivationPath: string;
  nodeUrl: string;
  blockTip: number;
  totalQuanta: number;
  isSynced: boolean;
  mempoolTxs: number;
  p2pkhAddress: string;
}

const DEFAULT_NODE = "http://127.0.0.1:8332";
const FALLBACK_NODE = "https://explorer.myratu.com";
const DEFAULT_ADDRESS = "scy19kf72spzrs8v6e54tvcq48aeanzr3ux63r4x062h0e7rge3kad0s4v5cna";

export default function DesktopPassbook() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INBOUND' | 'OUTBOUND' | 'REWARD'>('ALL');
  const [showQrModal, setShowQrModal] = useState(false);
  const [billingAmount, setBillingAmount] = useState('');
  const [selectedUtxo, setSelectedUtxo] = useState<UtxoItem | null>(null);
  const [selectedMutationForQr, setSelectedMutationForQr] = useState<MutationItem | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [networkPing, setNetworkPing] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [nodeUrl, setNodeUrl] = useState(DEFAULT_NODE);
  const [walletAddress, setWalletAddress] = useState(DEFAULT_ADDRESS);
  const [addressInput, setAddressInput] = useState(DEFAULT_ADDRESS);

  // Synchronized node state
  const [passbookData, setPassbookData] = useState<PassbookData>({
    accountNumber: "SCY-004812",
    passbookId: DEFAULT_ADDRESS,
    derivationPath: "m/44'/999'/0'/0/0",
    nodeUrl: DEFAULT_NODE,
    blockTip: 0,
    totalQuanta: 0,
    isSynced: true,
    mempoolTxs: 0,
    p2pkhAddress: DEFAULT_ADDRESS
  });

  const [utxos, setUtxos] = useState<UtxoItem[]>([]);
  const [mutations, setMutations] = useState<MutationItem[]>([]);

  const formatSCY = (quanta: number) => (quanta / 100000000).toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 8
  });

  const formatQuanta = (quanta: number) => quanta.toLocaleString('en-US');

  // Dynamic QR Code URI generator for receiving transfers
  const requestedQuanta = useMemo(() => {
    const parsed = parseFloat(billingAmount);
    return !isNaN(parsed) && parsed > 0 ? Math.round(parsed * 100000000) : 0;
  }, [billingAmount]);

  const receiveUri = useMemo(() => {
    if (requestedQuanta > 0) {
      return `scytale:${passbookData.p2pkhAddress}?amount=${requestedQuanta}`;
    }
    return `scytale:${passbookData.p2pkhAddress}`;
  }, [passbookData.p2pkhAddress, requestedQuanta]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const fetchLiveData = useCallback(async (addr: string = walletAddress, url: string = nodeUrl) => {
    setIsRefreshing(true);
    setErrorMsg(null);
    const startTime = performance.now();

    try {
      // 1. Fetch Node Status
      const statusRes = await fetch(`${url}/api/v1/status`, { signal: AbortSignal.timeout(3500) });
      if (!statusRes.ok) throw new Error(`HTTP ${statusRes.status} on status`);
      const statusJson = await statusRes.json();
      const ping = Math.round(performance.now() - startTime);

      // 2. Fetch Passbook Balances & Mutations
      const pbRes = await fetch(`${url}/api/v1/passbook?address=${encodeURIComponent(addr)}`, { signal: AbortSignal.timeout(4000) });
      if (!pbRes.ok) throw new Error(`HTTP ${pbRes.status} on passbook`);
      const pbJson = await pbRes.json();

      // 3. Fetch UTXOs (tolerant to 404 or missing endpoints)
      let utxoList: any[] = [];
      try {
        const utxoRes = await fetch(`${url}/api/v1/utxos?address=${encodeURIComponent(addr)}`, { signal: AbortSignal.timeout(4000) });
        if (utxoRes.ok) {
          const rawUtxos = await utxoRes.json();
          utxoList = Array.isArray(rawUtxos) ? rawUtxos : (rawUtxos.utxos || []);
        }
      } catch {
        utxoList = [];
      }

      const confirmed = Number(pbJson.confirmed_native_balance_quanta ?? pbJson.balance_quanta ?? pbJson.balance ?? 0);
      const tip = Number(statusJson.block_height ?? statusJson.canonical_height ?? 0);
      const mempool = Number(statusJson.mempool_count ?? statusJson.pending_tx_count ?? statusJson.mempool_tx_count ?? 0);
      const synced = statusJson.is_synced ?? (statusJson.runtime_state === 'Running');

      setPassbookData(prev => ({
        ...prev,
        p2pkhAddress: addr,
        passbookId: pbJson.passbook_id || addr,
        nodeUrl: url,
        blockTip: tip,
        mempoolTxs: mempool,
        totalQuanta: confirmed,
        isSynced: synced
      }));

      setNetworkPing(ping);
      setIsOnline(true);

      const parsedMutations: MutationItem[] = (pbJson.entries || []).map((e: any, idx: number) => ({
        id: e.id || e.txid || e.tx_hash || `entry-${idx}`,
        timestamp: e.timestamp
          ? (typeof e.timestamp === 'number' ? new Date(e.timestamp * 1000).toISOString() : String(e.timestamp))
          : new Date().toISOString(),
        type: e.type || (Number(e.quanta_delta ?? e.amount ?? 0) >= 0 ? 'INBOUND' : 'OUTBOUND'),
        txHash: e.tx_hash || e.txid || e.hash || '-',
        quantaDelta: Number(e.quanta_delta ?? e.amount ?? 0),
        runningBalanceQuanta: Number(e.balance_after ?? e.running_balance ?? confirmed),
        note: e.note || e.memo || (e.type === 'REWARD' ? 'Mining Subsidy' : undefined)
      }));
      setMutations(parsedMutations);

      const parsedUtxos: UtxoItem[] = utxoList.map((u: any) => ({
        txid: u.txid || u.tx_hash || '0000000000000000000000000000000000000000000000000000000000000000',
        vout: Number(u.vout ?? 0),
        quanta: Number(u.quanta ?? u.value ?? 0),
        blockHeight: Number(u.block_height ?? u.height ?? 0),
        status: (u.confirmations && u.confirmations > 0) ? 'CONFIRMED' : 'PENDING',
        scriptPubKey: u.script_pubkey || u.scriptPubKey,
        confirmations: Number(u.confirmations ?? 1)
      }));
      setUtxos(parsedUtxos);

    } catch (err: any) {
      // Fallback ke gateway publik jika node lokal gagal
      if (url !== FALLBACK_NODE) {
        console.warn(`Node lokal ${url} tidak merespons, beralih ke ${FALLBACK_NODE}...`);
        setNodeUrl(FALLBACK_NODE);
        return fetchLiveData(addr, FALLBACK_NODE);
      }
      setIsOnline(false);
      setErrorMsg(`Gagal memuat data dari node: ${err.message}`);
    } finally {
      setIsRefreshing(false);
    }
  }, [walletAddress, nodeUrl]);

  useEffect(() => {
    void fetchLiveData(walletAddress, nodeUrl);
  }, [fetchLiveData, walletAddress]);

  const handleQueryAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (addressInput.trim()) {
      setWalletAddress(addressInput.trim());
    }
  };

  const filteredMutations = useMemo(() => {
    return mutations.filter(m => {
      const matchesType = typeFilter === 'ALL' || m.type === typeFilter;
      const matchesSearch =
        m.txHash.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.note && m.note.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesType && matchesSearch;
    });
  }, [mutations, typeFilter, searchQuery]);

  return (
    <div className="w-full min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 md:p-8 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Viewport Control Bar & Network Telemetry */}
      <header className="max-w-7xl mx-auto mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <span className={`w-3 h-3 rounded-full animate-ping absolute opacity-75 ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span className={`w-2.5 h-2.5 rounded-full relative ${isOnline ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          </div>
          <GeminiIcon className="w-6 h-6 rounded-md shrink-0 shadow-lg shadow-cyan-950/50" size={24} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono tracking-widest text-emerald-400 font-bold uppercase">
                Scytale Desktop Passbook
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
                Tauri v2 Native Runtime
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/40 border border-cyan-800/40 text-cyan-400 font-mono">
                Gemini Core
              </span>
            </div>
            <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1">
                {isOnline ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-rose-400" />}
                <span>{passbookData.nodeUrl}</span>
              </span>
              <span className="text-zinc-700">•</span>
              <span className={isOnline ? "text-emerald-400/90" : "text-rose-400/90"}>
                {isOnline ? `${networkPing}ms latency` : 'OFFLINE'}
              </span>
              <span className="text-zinc-700">•</span>
              <span className="text-cyan-400/90">mempool: {passbookData.mempoolTxs} txs</span>
            </div>
          </div>
        </div>

        {/* Quick Actions & Live Refresh */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            id="receive-qr-header-btn"
            onClick={() => {
              setBillingAmount('');
              setShowQrModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold rounded-lg bg-cyan-950/50 hover:bg-cyan-900/70 text-cyan-300 border border-cyan-800/50 transition active:scale-95"
            title="Terima Transfer / Scytale Payment Request"
          >
            <QrCode className="w-3.5 h-3.5 text-cyan-400" />
            <span>Terima / QR Code</span>
          </button>
          <button
            id="refresh-network-btn"
            onClick={() => void fetchLiveData(walletAddress, nodeUrl)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50 transition active:scale-95 disabled:opacity-50"
            title="Muat Ulang Data dari Node Scytale"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Memuat...' : 'Refresh Jaringan'}</span>
          </button>
        </div>
      </header>

      {/* Error Alert Banner */}
      {errorMsg && (
        <div className="max-w-7xl mx-auto mb-4 p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-mono flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => void fetchLiveData(walletAddress, FALLBACK_NODE)}
            className="px-2.5 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-100 transition text-[11px] font-semibold"
          >
            Coba Gateway Explorer
          </button>
        </div>
      )}

      {/* Wallet Address Inspector Toolbar */}
      <div className="max-w-7xl mx-auto mb-6 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-3">
        <form onSubmit={handleQueryAddress} className="flex items-center gap-2 w-full flex-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="Masukkan alamat Scytale (scy1...)"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500/50"
            />
          </div>
          <button
            type="submit"
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold font-mono text-xs transition active:scale-95 shrink-0"
          >
            Query
          </button>
        </form>

        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 shrink-0">
          <span className="text-[11px] text-zinc-500">Target Node:</span>
          <select
            value={nodeUrl}
            onChange={(e) => {
              const newUrl = e.target.value;
              setNodeUrl(newUrl);
              void fetchLiveData(walletAddress, newUrl);
            }}
            className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-300 text-xs focus:outline-none focus:border-emerald-500"
          >
            <option value="http://127.0.0.1:8332">Lokal (127.0.0.1:8332)</option>
            <option value="https://explorer.myratu.com">Publik (explorer.myratu.com)</option>
          </select>
        </div>
      </div>

      {/* Main 100% Window Desktop Canvas */}
      <main className="max-w-7xl mx-auto">
        {/* HOLOGRAPHIC PASSBOOK CARD */}
        <section
          id="passbook-certificate-card"
          className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 p-6 sm:p-7 shadow-2xl shadow-emerald-950/20 mb-6 group"
        >
          {/* Cybernetic Ambient Glow & Grid Accent */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Card Top Metadata */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-zinc-800/80 pb-5 relative z-10">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] tracking-wider uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono font-semibold border border-emerald-500/30">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  Cryptographic Passbook
                </span>
                <span className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded bg-zinc-800/90 text-zinc-300 font-mono border border-zinc-700/50">
                  {passbookData.derivationPath}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-400 font-mono border border-cyan-800/40">
                  UTXO Ledger
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-mono font-bold tracking-tight text-white mt-1 flex items-center gap-2">
                <span>{passbookData.accountNumber}</span>
                <button
                  onClick={() => copyToClipboard(passbookData.accountNumber, 'acc')}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                  title="Copy Account Number"
                >
                  {copiedKey === 'acc' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </h1>
            </div>

            <div className="flex md:flex-col items-center md:items-end justify-between md:justify-start gap-1">
              <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 px-2.5 py-1 rounded-full font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Node Synced #{passbookData.blockTip}</span>
              </div>
              <div className="text-[11px] font-mono text-zinc-400 truncate max-w-[260px] mt-1 flex items-center gap-1">
                <Server className="w-3 h-3 text-zinc-400" />
                <span>{passbookData.nodeUrl}</span>
              </div>
            </div>
          </div>

          {/* Passbook ID Banner */}
          <div className="my-4 p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between gap-3 relative z-10">
            <div className="truncate flex-1">
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-zinc-400 font-mono">
                <Lock className="w-2.5 h-2.5 text-emerald-400" />
                <span>passbook_id (Canonical Derivation)</span>
              </div>
              <div className="text-xs font-mono text-zinc-300 truncate mt-0.5 font-medium">
                {passbookData.passbookId}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                id="show-qr-btn"
                onClick={() => setShowQrModal(true)}
                className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition border border-zinc-800"
                title="Display QR code"
              >
                <QrCode className="w-3.5 h-3.5 text-cyan-400" />
              </button>
              <button
                id="copy-passbook-id-btn"
                onClick={() => copyToClipboard(passbookData.passbookId, 'pb')}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition border border-zinc-700"
              >
                {copiedKey === 'pb' ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Dual Balance Display: SCY & Quanta */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 relative z-10">
            <div className="p-4 rounded-xl bg-zinc-950/50 border border-zinc-800/60 hover:border-emerald-500/40 transition">
              <div className="flex items-center justify-between text-xs text-zinc-400 uppercase tracking-wider font-mono mb-1">
                <span>Available Balance</span>
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                  8 DECIMALS
                </span>
              </div>
              <div className="text-2xl md:text-3xl font-mono font-black text-white tracking-tight break-all">
                {formatSCY(passbookData.totalQuanta)}{' '}
                <span className="text-sm font-semibold text-emerald-400 ml-1">SCY</span>
              </div>
              <div className="text-[11px] font-mono text-zinc-400 mt-1">
                Canonical Coins: {(passbookData.totalQuanta / 100000000).toFixed(4)} SCY Coin Standard
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950/50 border border-zinc-800/60 hover:border-cyan-500/40 transition">
              <div className="flex items-center justify-between text-xs text-zinc-400 uppercase tracking-wider font-mono mb-1">
                <span>Quanta Integer</span>
                <span className="text-[10px] text-cyan-400 font-bold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                  1 SCY = 10⁸ quanta
                </span>
              </div>
              <div className="text-xl md:text-2xl font-mono font-bold text-zinc-200 tracking-tight break-all">
                {formatQuanta(passbookData.totalQuanta)}{' '}
                <span className="text-xs font-mono text-cyan-400 ml-1">quanta</span>
              </div>
              <div className="text-[11px] font-mono text-zinc-400 mt-1">
                Deterministic integer for zero rounding discrepancies
              </div>
            </div>
          </div>

          {/* Quick Info Bar on Card Footer */}
          <div className="mt-4 pt-3 border-t border-zinc-800/60 flex flex-wrap items-center justify-between text-[11px] font-mono text-zinc-400 gap-2">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span>Consensus: P2PKH Hash-Time Verification</span>
            </div>
            <div className="flex items-center gap-3">
              <span>UTXO Count: <strong className="text-zinc-200">{utxos.length}</strong></span>
              <span>Ledger Mutations: <strong className="text-zinc-200">{mutations.length}</strong></span>
            </div>
          </div>
        </section>

        {/* DESKTOP SPLIT VIEW: UTXO VAULT & MUTATION JOURNAL */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* UTXO VAULT BREAKDOWN */}
          <div
            id="utxo-vault-panel"
            className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-5 shadow-xl lg:col-span-1"
          >
            <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded bg-cyan-400 animate-pulse" />
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-100 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-cyan-400" />
                  UTXO Vault
                </h2>
              </div>
              <span className="text-xs font-mono text-zinc-400 px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
                {utxos.length} Outputs
              </span>
            </div>

            <p className="text-[11px] font-mono text-zinc-400 mb-3">
              Unspent Transaction Outputs ready for cryptographic spending script execution.
            </p>

            <div className="space-y-3">
              {utxos.length === 0 ? (
                <div className="p-6 text-center text-zinc-500 font-mono text-xs rounded-xl bg-zinc-950/40 border border-dashed border-zinc-800">
                  Tidak ada output UTXO belum terpakai untuk alamat ini.
                </div>
              ) : utxos.map((utxo) => (
                <div
                  key={`${utxo.txid}-${utxo.vout}`}
                  onClick={() => setSelectedUtxo(utxo)}
                  className="p-3.5 rounded-xl bg-zinc-950/90 border border-zinc-800/80 hover:border-cyan-500/50 transition cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                    <span className="text-cyan-400 font-semibold group-hover:text-cyan-300 transition truncate max-w-[155px]" title={`${utxo.txid}:${utxo.vout}`}>
                      {utxo.txid.slice(0, 6)}...{utxo.txid.slice(-6)}:{utxo.vout}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-400 border border-emerald-800/40">
                        Block #{utxo.blockHeight}
                      </span>
                      <span className="text-zinc-500 group-hover:text-cyan-400 transition" title="Pindai Outpoint QR">
                        <QrCode className="w-3 h-3" />
                      </span>
                    </div>
                  </div>

                  <div className="text-sm font-mono font-bold text-white flex items-center justify-between">
                    <span>{formatSCY(utxo.quanta)} SCY</span>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition" />
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mt-1">
                    <span>{formatQuanta(utxo.quanta)} quanta</span>
                    <span className="text-zinc-400">{utxo.confirmations ?? 1} conf</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 rounded-xl bg-cyan-950/20 border border-cyan-900/30 text-[11px] font-mono text-zinc-400 flex items-center justify-between">
              <span>Vault Aggregate:</span>
              <span className="text-cyan-300 font-bold">
                {formatSCY(utxos.reduce((acc, u) => acc + u.quanta, 0))} SCY
              </span>
            </div>
          </div>

          {/* SYNCHRONIZED MUTATION JOURNAL */}
          <div
            id="mutations-journal-panel"
            className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-5 shadow-xl lg:col-span-2"
          >
            {/* Header & Filter Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded bg-emerald-400 animate-pulse" />
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-100 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  Synchronized Mutations
                </h2>
                <span className="text-xs font-mono text-emerald-400/90 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                  Live Ledger
                </span>
              </div>

              {/* Filter and Search Bar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-44">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Filter hash or memo..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-emerald-500/60"
                  />
                </div>

                <div className="flex bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 text-[10px] font-mono">
                  {(['ALL', 'INBOUND', 'OUTBOUND', 'REWARD'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setTypeFilter(type)}
                      className={`px-2 py-1 rounded transition ${
                        typeFilter === type
                          ? 'bg-zinc-800 text-white font-bold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table for Desktop */}
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="text-zinc-400 border-b border-zinc-800 text-[11px] uppercase tracking-wider">
                    <th className="pb-3 font-semibold">Timestamp</th>
                    <th className="pb-3 font-semibold">Type</th>
                    <th className="pb-3 font-semibold">Tx Hash</th>
                    <th className="pb-3 font-semibold text-right">Quanta Delta</th>
                    <th className="pb-3 font-semibold text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {filteredMutations.map((m) => (
                    <tr key={m.id} className="hover:bg-zinc-800/30 transition group">
                      <td className="py-3 text-zinc-400 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-zinc-400" />
                          <span>{m.timestamp}</span>
                        </div>
                        {m.note && <div className="text-[10px] text-zinc-400 mt-0.5">{m.note}</div>}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                            m.type === 'INBOUND'
                              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
                              : m.type === 'OUTBOUND'
                              ? 'bg-rose-950/60 text-rose-400 border-rose-800/50'
                              : 'bg-cyan-950/60 text-cyan-400 border-cyan-800/50'
                          }`}
                        >
                          {m.type === 'INBOUND' && <ArrowDownLeft className="w-3 h-3" />}
                          {m.type === 'OUTBOUND' && <ArrowUpRight className="w-3 h-3" />}
                          {m.type === 'REWARD' && <Gift className="w-3 h-3" />}
                          {m.type}
                        </span>
                      </td>
                      <td className="py-3 text-zinc-300">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="truncate max-w-[130px]" title={m.txHash}>{m.txHash}</span>
                          <button
                            onClick={() => copyToClipboard(m.txHash, m.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                            title="Salin Hash Transaksi"
                          >
                            {copiedKey === m.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            onClick={() => setSelectedMutationForQr(m)}
                            className="p-1 rounded hover:bg-cyan-950/60 text-zinc-500 hover:text-cyan-400 transition"
                            title="Lihat Receipt QR & Audit Explorer"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td
                        className={`py-3 text-right font-bold whitespace-nowrap ${
                          m.quantaDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        <div>
                          {m.quantaDelta >= 0 ? '+' : ''}
                          {formatSCY(m.quantaDelta)} SCY
                        </div>
                        <div className="text-[10px] font-normal text-zinc-400">
                          {m.quantaDelta >= 0 ? '+' : ''}
                          {formatQuanta(m.quantaDelta)} quanta
                        </div>
                      </td>
                      <td className="py-3 text-right text-zinc-200 whitespace-nowrap">
                        <div className="font-semibold">{formatSCY(m.runningBalanceQuanta)} SCY</div>
                        <div className="text-[10px] text-zinc-400">
                          {formatQuanta(m.runningBalanceQuanta)} quanta
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredMutations.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-zinc-400">
                        No ledger mutations match filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* 1. RECEIVE & PAYMENT REQUEST DYNAMIC QR MODAL */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative font-sans text-xs">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-mono font-bold uppercase text-white">Terima Transfer / Scytale Payment Request</h3>
              </div>
              <button
                onClick={() => {
                  setShowQrModal(false);
                  setBillingAmount('');
                }}
                className="text-zinc-400 hover:text-white text-xs font-mono p-1 transition"
              >
                ✕ Close
              </button>
            </div>

            {/* Dynamic QR Code Canvas/SVG */}
            <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 flex flex-col items-center justify-center mb-4 shadow-inner">
              <div className="bg-white p-3.5 rounded-xl shadow-lg flex items-center justify-center">
                <QRCodeSVG
                  value={receiveUri}
                  size={200}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <span className="text-[11px] font-mono text-zinc-400 mt-3 text-center">
                Pindai dengan Scytale Wallet atau kamera ponsel
              </span>
            </div>

            {/* Billing Amount (SCY) Input */}
            <div className="mb-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <label htmlFor="billing-amount-input" className="text-zinc-300 font-semibold">
                  Nominal Tagihan (Opsional - SCY):
                </label>
                <span className="text-[11px] text-emerald-400 font-bold">
                  {requestedQuanta > 0 ? `${formatQuanta(requestedQuanta)} quanta` : 'Bebas Nominal'}
                </span>
              </div>
              <div className="relative">
                <input
                  id="billing-amount-input"
                  type="number"
                  step="any"
                  min="0"
                  value={billingAmount}
                  onChange={(e) => setBillingAmount(e.target.value)}
                  placeholder="Contoh: 1.5 (kosongkan untuk transfer terbuka)"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-3 pr-12 py-2 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-400 font-bold">
                  SCY
                </span>
              </div>
            </div>

            {/* Monospace Payload Preview */}
            <div className="mb-4">
              <span className="text-[10px] font-mono uppercase text-zinc-500 block mb-1">Generated Scytale URI:</span>
              <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-cyan-300 break-all select-all">
                {receiveUri}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 font-mono text-xs">
              <button
                onClick={() => copyToClipboard(passbookData.p2pkhAddress, 'recv-addr')}
                className="py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition font-medium flex items-center justify-center gap-1.5 active:scale-95"
              >
                {copiedKey === 'recv-addr' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'recv-addr' ? 'Tersalin!' : 'Salin Alamat'}</span>
              </button>
              <button
                onClick={() => copyToClipboard(receiveUri, 'recv-uri')}
                className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold transition flex items-center justify-center gap-1.5 active:scale-95"
              >
                {copiedKey === 'recv-uri' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'recv-uri' ? 'URI Tersalin!' : 'Salin URI Transfer'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. TRANSACTION RECEIPT & AUDIT DYNAMIC QR MODAL */}
      {selectedMutationForQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative font-sans text-xs">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-cyan-400" />
                <h3 className="font-mono font-bold uppercase text-white">Receipt QR & Ledger Audit</h3>
              </div>
              <button
                onClick={() => setSelectedMutationForQr(null)}
                className="text-zinc-400 hover:text-white font-mono p-1 transition"
              >
                ✕ Close
              </button>
            </div>

            {/* QR Code */}
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col items-center justify-center mb-4">
              <div className="bg-white p-3 rounded-xl shadow-lg flex items-center justify-center">
                <QRCodeSVG
                  value={
                    selectedMutationForQr.txHash && selectedMutationForQr.txHash !== '-'
                      ? `https://explorer.myratu.com/tx/${selectedMutationForQr.txHash}`
                      : `scytale:mutation/${selectedMutationForQr.id}`
                  }
                  size={180}
                  level="M"
                />
              </div>
              <span className="text-[10px] font-mono text-zinc-400 mt-2 text-center">
                Pindai untuk verifikasi langsung di Scytale Explorer
              </span>
            </div>

            {/* Details */}
            <div className="space-y-2.5 font-mono mb-4">
              <div className="flex items-center justify-between p-2.5 rounded bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-400 text-[11px]">Tipe & Nilai:</span>
                <div className="text-right">
                  <span className={`font-bold ${selectedMutationForQr.quantaDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {selectedMutationForQr.quantaDelta >= 0 ? '+' : ''}{formatSCY(selectedMutationForQr.quantaDelta)} SCY
                  </span>
                  <div className="text-[10px] text-zinc-500">
                    ({formatQuanta(selectedMutationForQr.quantaDelta)} quanta)
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block uppercase">Status</span>
                  <span className="text-emerald-400 font-bold text-[11px] flex items-center gap-1 mt-0.5">
                    <Check className="w-3 h-3" /> CONFIRMED
                  </span>
                </div>
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block uppercase">Waktu</span>
                  <span className="text-zinc-300 text-[10px] truncate block mt-0.5" title={selectedMutationForQr.timestamp}>
                    {selectedMutationForQr.timestamp.slice(0, 19).replace('T', ' ')}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase text-zinc-500 block mb-1">Transaction Hash (TxID):</span>
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-[11px] text-cyan-300 break-all select-all">
                  {selectedMutationForQr.txHash}
                </div>
              </div>

              {selectedMutationForQr.note && (
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300">
                  <span className="text-[10px] text-zinc-500 block uppercase mb-0.5">Memo:</span>
                  {selectedMutationForQr.note}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 font-mono">
              <button
                onClick={() => copyToClipboard(selectedMutationForQr.txHash, 'mut-tx-copy')}
                className="flex-1 py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition font-medium flex items-center justify-center gap-1.5 active:scale-95"
              >
                {copiedKey === 'mut-tx-copy' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'mut-tx-copy' ? 'Tersalin!' : 'Salin Hash'}</span>
              </button>
              {selectedMutationForQr.txHash && selectedMutationForQr.txHash !== '-' && (
                <a
                  href={`https://explorer.myratu.com/tx/${selectedMutationForQr.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-bold transition flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka Explorer</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. UTXO DETAILS INSPECTOR & OUTPOINT QR MODAL */}
      {selectedUtxo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-md w-full shadow-2xl relative font-mono text-xs">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold uppercase text-white">UTXO Output Inspector & QR</h3>
              </div>
              <button
                onClick={() => setSelectedUtxo(null)}
                className="text-zinc-400 hover:text-white p-1 transition"
              >
                ✕ Close
              </button>
            </div>

            {/* Outpoint QR Code */}
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col items-center justify-center mb-4">
              <div className="bg-white p-2.5 rounded-xl shadow-lg flex items-center justify-center">
                <QRCodeSVG
                  value={`scytale:outpoint/${selectedUtxo.txid}:${selectedUtxo.vout}?amount=${selectedUtxo.quanta}`}
                  size={160}
                  level="M"
                />
              </div>
              <span className="text-[10px] font-mono text-zinc-400 mt-2 text-center">
                Outpoint: {selectedUtxo.txid.slice(0, 8)}...:{selectedUtxo.vout}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] uppercase text-zinc-400 block mb-1">Transaction Hash (TxID)</span>
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-cyan-300 break-all text-[11px] select-all">
                  {selectedUtxo.txid}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] uppercase text-zinc-400 block mb-1">vOut Index</span>
                  <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-white font-bold">
                    Index #{selectedUtxo.vout}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-zinc-400 block mb-1">Mined Block Height</span>
                  <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-emerald-400 font-bold">
                    Height #{selectedUtxo.blockHeight}
                  </div>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase text-zinc-400 block mb-1">Value Breakdown</span>
                <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                  <span className="text-white font-bold text-sm">{formatSCY(selectedUtxo.quanta)} SCY</span>
                  <span className="text-cyan-400">{formatQuanta(selectedUtxo.quanta)} quanta</span>
                </div>
              </div>

              {selectedUtxo.scriptPubKey && (
                <div>
                  <span className="text-[10px] uppercase text-zinc-400 block mb-1">scriptPubKey (P2PKH)</span>
                  <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 break-all select-all">
                    {selectedUtxo.scriptPubKey}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-zinc-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => copyToClipboard(selectedUtxo.txid, 'utxo-copy')}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition text-xs flex items-center gap-1.5 active:scale-95"
                  title="Salin TxID"
                >
                  {copiedKey === 'utxo-copy' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'utxo-copy' ? 'Tersalin!' : 'Copy TxID'}</span>
                </button>
                <button
                  onClick={() => copyToClipboard(`${selectedUtxo.txid}:${selectedUtxo.vout}`, 'outpoint-copy')}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition text-xs flex items-center gap-1.5 active:scale-95"
                  title="Salin Outpoint txid:vout"
                >
                  {copiedKey === 'outpoint-copy' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'outpoint-copy' ? 'Tersalin!' : 'Copy Outpoint'}</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {selectedUtxo.txid && !selectedUtxo.txid.startsWith('00000000') && (
                  <a
                    href={`https://explorer.myratu.com/tx/${selectedUtxo.txid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-800/50 transition text-xs flex items-center gap-1.5 active:scale-95"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Explorer</span>
                  </a>
                )}
                <button
                  onClick={() => setSelectedUtxo(null)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold transition text-xs active:scale-95"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
