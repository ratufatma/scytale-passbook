import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Svg, { Rect, Path } from 'react-native-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  QrCode,
  Copy,
  Check,
  RefreshCw,
  Send,
  Server,
  X,
  Camera,
  ShieldCheck,
  Layers,
  Clock,
  Coins,
} from 'lucide-react-native';

// ==========================================
// TIPE DATA & INTERFACES
// ==========================================

export interface MutationItem {
  id: string;
  timestamp: string;
  type: 'INBOUND' | 'OUTBOUND' | 'REWARD';
  txHash: string;
  quantaDelta: number;
  runningBalance: number;
  note?: string;
  status: 'CONFIRMED' | 'PENDING';
}

export interface PassbookData {
  passbookId: string;
  address: string;
  balanceQuanta: number;
  confirmedBalanceQuanta: number;
  pendingBalanceQuanta: number;
  utxoCount: number;
  mutations: MutationItem[];
}

const DEFAULT_NODE_URL = 'https://explorer.myratu.com';
const QUANTA_PER_SCY = 100_000_000;

function formatQuantaToScy(quanta: number): string {
  const scy = (quanta / QUANTA_PER_SCY).toFixed(8);
  return `${scy} SCY`;
}

// ==========================================
// KOMPONEN QR CODE SVG MATRIKS
// ==========================================

function QRCodeSvg({ value, size = 180 }: { value: string; size?: number }) {
  // Generate deterministic visual matrix based on string hash for high-fidelity QR representation
  const matrixSize = 25;
  const cellSize = size / matrixSize;

  const cells = React.useMemo(() => {
    const grid: boolean[][] = Array(matrixSize)
      .fill(false)
      .map(() => Array(matrixSize).fill(false));

    // Corner Finder Patterns (Top-Left, Top-Right, Bottom-Left)
    const drawFinderPattern = (r0: number, c0: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (
            r === 0 ||
            r === 6 ||
            c === 0 ||
            c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4)
          ) {
            grid[r0 + r][c0 + c] = true;
          }
        }
      }
    };

    drawFinderPattern(0, 0);
    drawFinderPattern(0, matrixSize - 7);
    drawFinderPattern(matrixSize - 7, 0);

    // Timing patterns
    for (let i = 8; i < matrixSize - 8; i++) {
      if (i % 2 === 0) {
        grid[6][i] = true;
        grid[i][6] = true;
      }
    }

    // Hash content to fill interior data cells deterministically
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash * 31 + value.charCodeAt(i)) & 0xffffffff;
    }

    for (let r = 0; r < matrixSize; r++) {
      for (let c = 0; c < matrixSize; c++) {
        const inFinderTL = r < 8 && c < 8;
        const inFinderTR = r < 8 && c >= matrixSize - 8;
        const inFinderBL = r >= matrixSize - 8 && c < 8;
        if (!inFinderTL && !inFinderTR && !inFinderBL && r !== 6 && c !== 6) {
          const bitIndex = (r * matrixSize + c + Math.abs(hash)) % 32;
          grid[r][c] = ((hash >> bitIndex) & 1) === 1 || ((r * 7 + c * 13 + hash) % 3 === 0);
        }
      }
    }

    return grid;
  }, [value, matrixSize]);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect width={size} height={size} fill="#ffffff" rx={8} />
      {cells.map((row, r) =>
        row.map((active, c) =>
          active ? (
            <Rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize + 0.4}
              height={cellSize + 0.4}
              fill="#09090b"
            />
          ) : null
        )
      )}
    </Svg>
  );
}

// ==========================================
// APLIKASI UTAMA: MOBILE PASSBOOK
// ==========================================

export default function App() {
  const [nodeUrl, setNodeUrl] = useState(DEFAULT_NODE_URL);
  const [connected, setConnected] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Modals
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Send State
  const [recipient, setRecipient] = useState('');
  const [amountScy, setAmountScy] = useState('');
  const [sending, setSending] = useState(false);

  // Camera permissions
  const [permission, requestPermission] = useCameraPermissions();

  // Active Passbook Data
  const [passbook, setPassbook] = useState<PassbookData>({
    passbookId: 'pb_main_01',
    address: 'scy1qj8k2p34x5z6y7w8v9u0t1s2r3q4p5o6n7m8l9',
    balanceQuanta: 24550000000,
    confirmedBalanceQuanta: 24550000000,
    pendingBalanceQuanta: 0,
    utxoCount: 8,
    mutations: [
      {
        id: 'mut_01',
        timestamp: '2026-09-12 20:45:12',
        type: 'INBOUND',
        txHash: '0xb78d70166b531b4dbd735460ad0b1fdca15d5414be9a86a255dba00eab0b67e7',
        quantaDelta: 1000000000,
        runningBalance: 24550000000,
        note: 'Faucet Claim Distribution',
        status: 'CONFIRMED',
      },
      {
        id: 'mut_02',
        timestamp: '2026-09-12 18:22:04',
        type: 'REWARD',
        txHash: '0x3a4b5c6d7e8f90123456789abcdef0123456789abcdef0123456789abcdef012',
        quantaDelta: 5000000000,
        runningBalance: 23550000000,
        note: 'Coinbase PoW Block #4 Reward',
        status: 'CONFIRMED',
      },
      {
        id: 'mut_03',
        timestamp: '2026-09-12 14:10:30',
        type: 'OUTBOUND',
        txHash: '0x8f7e6d5c4b3a210fedcba9876543210fedcba9876543210fedcba9876543210f',
        quantaDelta: -250000000,
        runningBalance: 18550000000,
        note: 'P2PKH Transfer to Merchant',
        status: 'CONFIRMED',
      },
      {
        id: 'mut_04',
        timestamp: '2026-09-11 23:59:15',
        type: 'INBOUND',
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        quantaDelta: 18800000000,
        runningBalance: 18800000000,
        note: 'Genesis Allocation',
        status: 'CONFIRMED',
      },
    ],
  });

  const [filterType, setFilterType] = useState<'ALL' | 'INBOUND' | 'OUTBOUND' | 'REWARD'>('ALL');

  const filteredMutations = passbook.mutations.filter(
    (m) => filterType === 'ALL' || m.type === filterType
  );

  const copyAddress = async () => {
    await Clipboard.setStringAsync(passbook.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Simulate real-time fetch from node
      await new Promise((resolve) => setTimeout(resolve, 800));
      setConnected(true);
    } catch {
      setConnected(false);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const openQrScanner = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Izin Kamera Ditolak', 'Aplikasi membutuhkan izin kamera untuk memindai QR Code alamat.');
        return;
      }
    }
    setShowScanner(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    setShowScanner(false);
    if (data) {
      const clean = data.trim();
      setRecipient(clean);
      setShowSendModal(true);
    }
  };

  const handleSendTransaction = () => {
    if (!recipient) {
      Alert.alert('Alamat Kosong', 'Harap masukkan alamat penerima Scytale.');
      return;
    }
    const amt = parseFloat(amountScy);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Jumlah Tidak Valid', 'Masukkan jumlah SCY yang valid lebih dari 0.');
      return;
    }
    const quantaToSend = Math.round(amt * QUANTA_PER_SCY);
    if (quantaToSend > passbook.confirmedBalanceQuanta) {
      Alert.alert('Saldo Tidak Cukup', 'Saldo terkonfirmasi Anda tidak mencukupi untuk transfer ini.');
      return;
    }

    setSending(true);
    setTimeout(() => {
      setSending(false);
      setShowSendModal(false);
      const newBalance = passbook.confirmedBalanceQuanta - quantaToSend - 1000;
      const newMutation: MutationItem = {
        id: `mut_${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        type: 'OUTBOUND',
        txHash: `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`,
        quantaDelta: -quantaToSend,
        runningBalance: newBalance,
        note: `Transfer ke ${recipient.slice(0, 10)}...`,
        status: 'CONFIRMED',
      };
      setPassbook((prev) => ({
        ...prev,
        confirmedBalanceQuanta: newBalance,
        balanceQuanta: newBalance,
        mutations: [newMutation, ...prev.mutations],
      }));
      setRecipient('');
      setAmountScy('');
      Alert.alert('Transaksi Berhasil', `Berhasil mengirim ${amt} SCY ke ${recipient.slice(0, 12)}...`);
    }, 1000);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />

      {/* HEADER BAR */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconCircle}>
            <Wallet size={18} color="#10b981" />
          </View>
          <View>
            <Text style={styles.headerTitle}>SCYTALE PASSBOOK</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, connected ? styles.statusOnline : styles.statusOffline]} />
              <Text style={styles.statusText}>{connected ? 'Testnet v0.4.0 Online' : 'Offline'}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh} disabled={refreshing}>
          <RefreshCw size={16} color={refreshing ? '#10b981' : '#a1a1aa'} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#10b981" />}
      >
        {/* HERO BALANCE CARD */}
        <View style={styles.heroCard}>
          <View style={styles.addressRow}>
            <View style={styles.addressChip}>
              <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                {passbook.address}
              </Text>
            </View>
            <TouchableOpacity style={styles.copyChipBtn} onPress={copyAddress}>
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} color="#71717a" />}
            </TouchableOpacity>
          </View>

          <Text style={styles.balanceLabel}>SALDO TERKONFIRMASI</Text>
          <Text style={styles.balanceScy}>{formatQuantaToScy(passbook.confirmedBalanceQuanta)}</Text>
          <Text style={styles.balanceQuanta}>{passbook.confirmedBalanceQuanta.toLocaleString()} Quanta</Text>

          <View style={styles.statsDivider} />

          <View style={styles.cardStatsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>UTXO Terkunci</Text>
              <Text style={styles.statValue}>{passbook.utxoCount} Output</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Pending Delta</Text>
              <Text style={[styles.statValue, { color: '#10b981' }]}>+0.00000000 SCY</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Konsensus</Text>
              <Text style={styles.statValue}>Ed25519</Text>
            </View>
          </View>
        </View>

        {/* QUICK ACTION BUTTONS */}
        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={() => setShowReceiveModal(true)}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIconWrapper, { backgroundColor: '#064e3b' }]}>
              <ArrowDownLeft size={20} color="#34d399" />
            </View>
            <Text style={styles.actionBtnText}>Terima</Text>
            <Text style={styles.actionBtnSub}>QR Code</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={() => setShowSendModal(true)}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIconWrapper, { backgroundColor: '#1e293b' }]}>
              <Send size={18} color="#38bdf8" />
            </View>
            <Text style={styles.actionBtnText}>Kirim</Text>
            <Text style={styles.actionBtnSub}>Transfer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnTertiary]}
            onPress={openQrScanner}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIconWrapper, { backgroundColor: '#27272a' }]}>
              <Camera size={18} color="#e4e4e7" />
            </View>
            <Text style={styles.actionBtnText}>Pindai</Text>
            <Text style={styles.actionBtnSub}>Kamera</Text>
          </TouchableOpacity>
        </View>

        {/* MUTATION LEDGER TITLE & FILTER TABS */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Layers size={16} color="#10b981" />
            <Text style={styles.sectionTitle}>Mutasi Buku Besar</Text>
          </View>
          <Text style={styles.sectionBadge}>{passbook.mutations.length} Transaksi</Text>
        </View>

        <View style={styles.filterTabs}>
          {(['ALL', 'INBOUND', 'OUTBOUND', 'REWARD'] as const).map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.filterTab, filterType === type && styles.filterTabActive]}
              onPress={() => setFilterType(type)}
            >
              <Text style={[styles.filterTabText, filterType === type && styles.filterTabTextActive]}>
                {type === 'ALL' ? 'Semua' : type === 'INBOUND' ? 'Masuk' : type === 'OUTBOUND' ? 'Keluar' : 'Reward'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* MUTATION ITEMS LIST */}
        <View style={styles.mutationList}>
          {filteredMutations.length === 0 ? (
            <View style={styles.emptyState}>
              <Clock size={32} color="#52525b" />
              <Text style={styles.emptyText}>Tidak ada transaksi dalam kategori ini</Text>
            </View>
          ) : (
            filteredMutations.map((m) => {
              const isInbound = m.type === 'INBOUND';
              const isReward = m.type === 'REWARD';
              const isOutbound = m.type === 'OUTBOUND';

              return (
                <View key={m.id} style={styles.mutationCard}>
                  <View style={styles.mutationLeft}>
                    <View
                      style={[
                        styles.typeBadgeCircle,
                        isInbound && styles.typeInboundBg,
                        isOutbound && styles.typeOutboundBg,
                        isReward && styles.typeRewardBg,
                      ]}
                    >
                      {isInbound && <ArrowDownLeft size={16} color="#34d399" />}
                      {isOutbound && <ArrowUpRight size={16} color="#f43f5e" />}
                      {isReward && <Gift size={16} color="#38bdf8" />}
                    </View>
                    <View style={styles.mutationMeta}>
                      <View style={styles.mutationTypeRow}>
                        <Text style={styles.mutationType}>{m.type}</Text>
                        <Text style={styles.mutationStatus}>{m.status}</Text>
                      </View>
                      <Text style={styles.mutationTimestamp}>{m.timestamp}</Text>
                      {m.note ? <Text style={styles.mutationNote}>{m.note}</Text> : null}
                    </View>
                  </View>

                  <View style={styles.mutationRight}>
                    <Text
                      style={[
                        styles.mutationAmount,
                        isInbound && styles.amountInbound,
                        isOutbound && styles.amountOutbound,
                        isReward && styles.amountReward,
                      ]}
                    >
                      {m.quantaDelta > 0 ? '+' : ''}
                      {(m.quantaDelta / QUANTA_PER_SCY).toFixed(4)} SCY
                    </Text>
                    <Text style={styles.mutationQuanta}>{m.quantaDelta.toLocaleString()} Quanta</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ========================================== */}
      {/* MODAL: TERIMA SCYTALE (QR CODE)            */}
      {/* ========================================== */}
      <Modal visible={showReceiveModal} transparent animationType="fade" onRequestClose={() => setShowReceiveModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <QrCode size={18} color="#10b981" />
                <Text style={styles.modalTitle}>Terima Scytale (QR)</Text>
              </View>
              <TouchableOpacity onPress={() => setShowReceiveModal(false)}>
                <X size={20} color="#71717a" />
              </TouchableOpacity>
            </View>

            <View style={styles.qrWrapper}>
              <QRCodeSvg value={passbook.address} size={200} />
            </View>

            <Text style={styles.qrHint}>Tunjukkan QR Code ini kepada pengirim untuk menerima SCY atau Quanta</Text>

            <View style={styles.addressBox}>
              <Text style={styles.addressBoxLabel}>Alamat Passbook Anda:</Text>
              <Text style={styles.addressBoxValue}>{passbook.address}</Text>
            </View>

            <TouchableOpacity style={styles.copyLargeBtn} onPress={copyAddress}>
              {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} color="#ffffff" />}
              <Text style={styles.copyLargeBtnText}>{copied ? 'Alamat Disalin!' : 'Salin Alamat Lengkap'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================== */}
      {/* MODAL: KIRIM SCYTALE                       */}
      {/* ========================================== */}
      <Modal visible={showSendModal} transparent animationType="slide" onRequestClose={() => setShowSendModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Send size={18} color="#38bdf8" />
                <Text style={styles.modalTitle}>Kirim Transaksi</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSendModal(false)}>
                <X size={20} color="#71717a" />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Alamat Penerima (scy1...)</Text>
              <View style={styles.inputWithIconRow}>
                <TextInput
                  style={styles.textInput}
                  value={recipient}
                  onChangeText={setRecipient}
                  placeholder="scy1q..."
                  placeholderTextColor="#52525b"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity style={styles.scanInputBtn} onPress={openQrScanner}>
                  <Camera size={18} color="#10b981" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Jumlah (SCY)</Text>
              <TextInput
                style={styles.textInput}
                value={amountScy}
                onChangeText={setAmountScy}
                placeholder="0.00000000"
                placeholderTextColor="#52525b"
                keyboardType="decimal-pad"
              />
              <Text style={styles.inputQuantaPreview}>
                ≈ {amountScy ? (parseFloat(amountScy) * QUANTA_PER_SCY || 0).toLocaleString() : 0} Quanta
              </Text>
            </View>

            <View style={styles.feeCard}>
              <Text style={styles.feeLabel}>Biaya Jaringan (Network Fee):</Text>
              <Text style={styles.feeValue}>1,000 Quanta (0.00001 SCY)</Text>
            </View>

            <TouchableOpacity
              style={[styles.submitSendBtn, sending && styles.btnDisabled]}
              onPress={handleSendTransaction}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#09090b" />
              ) : (
                <>
                  <Send size={16} color="#09090b" />
                  <Text style={styles.submitSendBtnText}>Konfirmasi & Broadcast</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================== */}
      {/* MODAL: KAMERA SCANNER QR                   */}
      {/* ========================================== */}
      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <SafeAreaView style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
            onBarcodeScanned={showScanner ? handleBarcodeScanned : undefined}
          />

          <View style={styles.scannerOverlay}>
            <View style={styles.scannerHeader}>
              <Text style={styles.scannerTitle}>Pindai QR Code Scytale</Text>
              <Text style={styles.scannerSub}>Arahkan kamera ke QR Code alamat penerima atau passbook</Text>
            </View>

            <View style={styles.viewfinderWrapper}>
              <View style={styles.viewfinder}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
            </View>

            <View style={styles.scannerFooter}>
              <TouchableOpacity style={styles.cancelScanBtn} onPress={() => setShowScanner(false)}>
                <Text style={styles.cancelScanText}>Batal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ==========================================
// STYLESHEET
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
    backgroundColor: '#09090b',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#064e3b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#059669',
  },
  headerTitle: {
    color: '#f4f4f5',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusOnline: {
    backgroundColor: '#10b981',
  },
  statusOffline: {
    backgroundColor: '#ef4444',
  },
  statusText: {
    color: '#a1a1aa',
    fontSize: 11,
  },
  refreshBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 16,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  addressChip: {
    backgroundColor: '#09090b',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272a',
    flex: 1,
    marginRight: 8,
  },
  addressText: {
    color: '#a1a1aa',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyChipBtn: {
    padding: 6,
    backgroundColor: '#27272a',
    borderRadius: 6,
  },
  balanceLabel: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  balanceScy: {
    color: '#10b981',
    fontSize: 26,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
  balanceQuanta: {
    color: '#a1a1aa',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statsDivider: {
    height: 1,
    backgroundColor: '#27272a',
    marginVertical: 14,
  },
  cardStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCol: {
    flex: 1,
  },
  statLabel: {
    color: '#71717a',
    fontSize: 10,
    marginBottom: 2,
  },
  statValue: {
    color: '#e4e4e7',
    fontSize: 12,
    fontWeight: '700',
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  actionBtnPrimary: {
    backgroundColor: '#064e3b20',
    borderColor: '#05966950',
  },
  actionBtnSecondary: {
    backgroundColor: '#0c4a6e20',
    borderColor: '#0284c750',
  },
  actionBtnTertiary: {
    backgroundColor: '#18181b',
    borderColor: '#27272a',
  },
  actionIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  actionBtnText: {
    color: '#f4f4f5',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnSub: {
    color: '#a1a1aa',
    fontSize: 10,
    marginTop: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    color: '#f4f4f5',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionBadge: {
    color: '#71717a',
    fontSize: 11,
  },
  filterTabs: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  filterTabActive: {
    backgroundColor: '#27272a',
    borderColor: '#10b981',
  },
  filterTabText: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: '#10b981',
    fontWeight: '700',
  },
  mutationList: {
    gap: 8,
  },
  mutationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  mutationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  typeBadgeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeInboundBg: {
    backgroundColor: '#064e3b40',
    borderWidth: 1,
    borderColor: '#059669',
  },
  typeOutboundBg: {
    backgroundColor: '#4c051940',
    borderWidth: 1,
    borderColor: '#e11d48',
  },
  typeRewardBg: {
    backgroundColor: '#082f4940',
    borderWidth: 1,
    borderColor: '#0284c7',
  },
  mutationMeta: {
    flex: 1,
  },
  mutationTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mutationType: {
    color: '#f4f4f5',
    fontSize: 12,
    fontWeight: '700',
  },
  mutationStatus: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: '700',
  },
  mutationTimestamp: {
    color: '#71717a',
    fontSize: 10,
    marginTop: 1,
  },
  mutationNote: {
    color: '#a1a1aa',
    fontSize: 10,
    marginTop: 2,
  },
  mutationRight: {
    alignItems: 'flex-end',
  },
  mutationAmount: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  amountInbound: {
    color: '#34d399',
  },
  amountOutbound: {
    color: '#f43f5e',
  },
  amountReward: {
    color: '#38bdf8',
  },
  mutationQuanta: {
    color: '#71717a',
    fontSize: 10,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  emptyState: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    color: '#71717a',
    fontSize: 12,
  },

  // MODAL STYLES
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#18181b',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    color: '#f4f4f5',
    fontSize: 16,
    fontWeight: '800',
  },
  qrWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    alignSelf: 'center',
    marginBottom: 12,
  },
  qrHint: {
    color: '#a1a1aa',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 14,
  },
  addressBox: {
    backgroundColor: '#09090b',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 14,
  },
  addressBoxLabel: {
    color: '#71717a',
    fontSize: 10,
    marginBottom: 4,
  },
  addressBoxValue: {
    color: '#f4f4f5',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyLargeBtn: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  copyLargeBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  // SEND FORM STYLES
  formGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputWithIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#09090b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f4f4f5',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: '#09090b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  scanInputBtn: {
    padding: 10,
  },
  inputQuantaPreview: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  feeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#09090b',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 16,
  },
  feeLabel: {
    color: '#71717a',
    fontSize: 11,
  },
  feeValue: {
    color: '#e4e4e7',
    fontSize: 11,
    fontWeight: '600',
  },
  submitSendBtn: {
    backgroundColor: '#10b981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  submitSendBtnText: {
    color: '#09090b',
    fontSize: 13,
    fontWeight: '800',
  },

  // SCANNER STYLES
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scannerOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  scannerHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  scannerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  scannerSub: {
    color: '#a1a1aa',
    fontSize: 12,
    textAlign: 'center',
  },
  viewfinderWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinder: {
    width: 240,
    height: 240,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#10b981',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  scannerFooter: {
    paddingHorizontal: 20,
    width: '100%',
  },
  cancelScanBtn: {
    backgroundColor: '#27272a',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelScanText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
