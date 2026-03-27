/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
  query,
  orderBy,
  limit,
  getDoc,
  getDocs,
  where,
} from 'firebase/firestore';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  User as FirebaseUser,
} from 'firebase/auth';
import { db, auth } from './firebase';
import { UserProfile, UserRole, Club } from './types';
import {
  Users,
  Trophy,
  Settings,
  LogOut,
  Plus,
  UserPlus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── 픽셀 폰트 로드 ──────────────────────────────────────────
const fontLink = document.createElement('link');
fontLink.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Nanum+Gothic+Coding:wght@400;700&display=swap';
fontLink.rel = 'stylesheet';
document.head.appendChild(fontLink);

// ─── 상수 ────────────────────────────────────────────────────
const ADMIN_ID = '관리자0901';
const ADMIN_PW = '1925';
const DRAGON_MAX_HP = 5000;
const APP_DOMAIN = '@yongdu.app';
const APP_PASSWORD = 'yongdu2024';

const FEMALE_IMG = 'https://i.imgur.com/6T13I4G.png';
const MALE_IMG = 'https://i.imgur.com/J8xZmMB.png';

// ─── 용 이미지 (HP 구간별) ────────────────────────────────────
const DRAGON_IMG = 'https://i.imgur.com/fIBT70D.png';
const DRAGON_IMG_HEALTHY  = 'https://i.imgur.com/7BiEgJ2.png'; // 80%↑ & 60~80%
const DRAGON_IMG_WOUNDED  = 'https://i.imgur.com/Szhp83Z.png'; // 40~60%
const DRAGON_IMG_CRITICAL = 'https://i.imgur.com/BsixFPX.png'; // 20~40%
const DRAGON_IMG_DYING    = 'https://i.imgur.com/CkyY4nf.png'; // 20%↓
const DRAGON_IMG_DEAD     = 'https://i.imgur.com/O821V8v.png'; // 처치

// ─── 마리오 스타일 ────────────────────────────────────────────
const marioStyle = {
  fontFamily: "'Press Start 2P', 'Nanum Gothic Coding', monospace",
};

// ─── 유틸 ────────────────────────────────────────────────────
async function ensureDragonExists() {
  const ref = doc(db, 'dragon', 'state');
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { hp: DRAGON_MAX_HP }, { merge: true });
  }
}

// ─── ErrorBoundary ───────────────────────────────────────────
interface ErrorBoundaryProps { children?: React.ReactNode; }
interface ErrorBoundaryState { hasError: boolean; msg: string; }

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, msg: '' };
  }
  static getDerivedStateFromError(e: Error) {
    return { hasError: true, msg: e.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#5C94FC] p-4">
          <div className="bg-[#E52521] p-6 border-4 border-black shadow-[4px_4px_0px_black] max-w-md w-full">
            <h2 className="text-white mb-2 text-sm" style={marioStyle}>GAME OVER</h2>
            <p className="text-white mb-4 text-xs">{this.state.msg}</p>
            <button onClick={() => window.location.reload()}
              className="w-full py-2 bg-[#FFD700] text-black font-bold border-4 border-black shadow-[4px_4px_0px_black] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all text-xs"
              style={marioStyle}
            >
              CONTINUE?
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── 구름 컴포넌트 ────────────────────────────────────────────
function Cloud({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <div className="absolute pointer-events-none" style={{ left: `${x}%`, top: `${y}%`, transform: `scale(${scale})` }}>
      <div className="relative">
        <div className="w-16 h-8 bg-white rounded-full" />
        <div className="absolute -top-4 left-3 w-10 h-10 bg-white rounded-full" />
        <div className="absolute -top-2 left-7 w-8 h-8 bg-white rounded-full" />
      </div>
    </div>
  );
}

// ─── 블록 컴포넌트 ────────────────────────────────────────────
function MarioBlock({ children, color = '#C84B11' }: { children?: React.ReactNode; color?: string }) {
  return (
    <div
      className="w-10 h-10 flex items-center justify-center text-white font-bold text-lg border-4 border-black"
      style={{
        background: color,
        boxShadow: 'inset -4px -4px 0px rgba(0,0,0,0.3), inset 4px 4px 0px rgba(255,255,255,0.3)',
        imageRendering: 'pixelated',
      }}
    >
      {children}
    </div>
  );
}

// ─── HP 페이즈 헬퍼 ──────────────────────────────────────────
function getDragonPhase(hp: number, maxHp: number) {
  const ratio = hp / maxHp;
  if (hp <= 0)      return 'dead';
  if (ratio > 0.80) return 'healthy';  // 80%↑
  if (ratio > 0.60) return 'hurt';     // 60~80%
  if (ratio > 0.40) return 'wounded';  // 40~60%
  if (ratio > 0.20) return 'critical'; // 20~40%
  return 'dying';                       // 20%↓
}

function getDragonImage(phase: string): string {
  switch (phase) {
    case 'wounded':  return DRAGON_IMG_WOUNDED;
    case 'critical': return DRAGON_IMG_CRITICAL;
    case 'dying':    return DRAGON_IMG_DYING;
    case 'dead':     return DRAGON_IMG_DEAD;
    default:         return DRAGON_IMG_HEALTHY; // healthy + hurt 공통
  }
}

function getSkyGradient(phase: string): string {
  switch (phase) {
    case 'hurt':     return 'linear-gradient(to bottom, #6B8FD4 0%, #6B8FD4 70%, #5C7A3C 70%, #5C7A3C 100%)';
    case 'wounded':  return 'linear-gradient(to bottom, #8B6B4A 0%, #C4734A 70%, #4A3C1A 70%, #4A3C1A 100%)';
    case 'critical': return 'linear-gradient(to bottom, #6B2020 0%, #C43030 70%, #3C1A1A 70%, #3C1A1A 100%)';
    case 'dying':    return 'linear-gradient(to bottom, #3D0000 0%, #8B1010 70%, #2A0A0A 70%, #2A0A0A 100%)';
    case 'dead':     return 'linear-gradient(to bottom, #2A2A2A 0%, #4A4A4A 70%, #1A1A1A 70%, #1A1A1A 100%)';
    default:         return 'linear-gradient(to bottom, #5C94FC 0%, #5C94FC 70%, #5C7A3C 70%, #5C7A3C 100%)';
  }
}

function getGroundColor(phase: string): string {
  switch (phase) {
    case 'wounded':  return '#8B4A1A';
    case 'critical': return '#6B1A1A';
    case 'dying':    return '#4A0A0A';
    case 'dead':     return '#333';
    default:         return '#C84B11';
  }
}

function getPhaseLabel(phase: string): { text: string; color: string } | null {
  switch (phase) {
    case 'hurt':     return { text: '⚠️ BOSS HURT',     color: '#FFD700' };
    case 'wounded':  return { text: '🔥 BOSS WOUNDED',  color: '#FF9900' };
    case 'critical': return { text: '💀 BOSS CRITICAL', color: '#FF4400' };
    case 'dying':    return { text: '☠️ BOSS DYING...', color: '#FF0000' };
    default: return null;
  }
}

function getHpBarColor(phase: string): string {
  switch (phase) {
    case 'hurt':     return '#A8C800';
    case 'wounded':  return '#FFD700';
    case 'critical': return '#FF6600';
    case 'dying':    return '#E52521';
    default:         return '#00D800';
  }
}

// ─── 전투 씬 ─────────────────────────────────────────────────
function BattleScene({ dragonHp, attacking, superAttacking }: {
  dragonHp: number; attacking: boolean; superAttacking: boolean;
}) {
  const phase = getDragonPhase(dragonHp, DRAGON_MAX_HP);
  const phaseLabel = getPhaseLabel(phase);

  // 페이즈별 용 idle 흔들림
  const dragonIdleAnimate = attacking
    ? { x: [0, -6, 6, -4, 4, 0] }
    : phase === 'dying'
      ? { x: [0, -4, 4, -3, 3, -4, 4, 0], y: [0, -2, 2, -1, 1, 0] }
      : phase === 'critical'
        ? { x: [0, -3, 3, -2, 2, 0] }
        : phase === 'wounded'
          ? { x: [0, -1, 1, 0] }
          : {};

  const dragonIdleTransition = attacking
    ? { duration: 0.4 }
    : phase === 'dying'
      ? { duration: 0.5, repeat: Infinity, ease: 'easeInOut' as const }
      : phase === 'critical'
        ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' as const }
        : phase === 'wounded'
          ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const }
          : { duration: 0.4 };

  return (
    <div
      className="relative w-full aspect-video overflow-hidden border-4 border-black"
      style={{ background: getSkyGradient(phase), transition: 'background 2s ease' }}
    >
      {/* 빈사/위기 상태 화면 가장자리 붉은 맥박 */}
      {(phase === 'dying' || phase === 'critical') && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-[5]"
          animate={{ opacity: [0, 0.2, 0] }}
          transition={{ duration: phase === 'dying' ? 0.8 : 1.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ background: 'radial-gradient(ellipse at center, transparent 30%, #FF000077 100%)' }}
        />
      )}

      {/* 구름들 */}
      <Cloud x={5} y={5} scale={1.2} />
      <Cloud x={55} y={10} />
      <Cloud x={80} y={3} scale={0.8} />

      {/* 땅 블록들 */}
      <div className="absolute bottom-0 left-0 right-0 flex pointer-events-none z-0">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="flex-1 h-8 border-2 border-black"
            style={{
              background: getGroundColor(phase),
              boxShadow: 'inset -2px -2px 0px rgba(0,0,0,0.3), inset 2px 2px 0px rgba(255,255,255,0.2)',
              transition: 'background 2s ease',
            }}
          />
        ))}
      </div>

      {/* 여자 캐릭터 (왼쪽) */}
      <motion.div
        className="absolute z-20"
        style={{ left: '10%', bottom: '32px' }}
        animate={attacking
          ? { x: [0, 55, 55, 0], y: [0, -15, 0, 0] }
          : { x: 0, y: [0, -3, 0] }
        }
        transition={attacking
          ? { duration: 0.5, ease: 'easeInOut' }
          : { duration: 1, repeat: Infinity, ease: 'easeInOut' }
        }
      >
        <img src={FEMALE_IMG} className="w-20 h-20 object-contain" style={{ imageRendering: 'pixelated' }} />
      </motion.div>

      {/* 용 (가운데) — 페이즈별 CSS 필터 + 흔들림 */}
      <motion.div
        className="absolute z-10"
        style={{ left: '41%', bottom: '0px', marginLeft: '-56px' }}
        animate={dragonIdleAnimate}
        transition={dragonIdleTransition}
      >
        <img
          src={getDragonImage(phase)}
          className="w-40 h-40 object-contain"
          style={{
            imageRendering: 'pixelated',
            opacity: phase === 'dead' ? 0.85 : 1,
            transition: 'opacity 0.5s ease',
          }}
        />

        {/* 빈사 상태 불꽃 파티클 */}
        {phase === 'dying' && (
          <div className="absolute inset-0 pointer-events-none">
            {(['-8px', '28px', '52px', '12px'] as string[]).map((left, i) => (
              <motion.div
                key={i}
                className="absolute bottom-2 text-base"
                style={{ left }}
                animate={{ y: [0, -28, -56], opacity: [1, 0.6, 0], scale: [0.8, 1.2, 0.3] }}
                transition={{ duration: 0.8 + i * 0.2, repeat: Infinity, delay: i * 0.25, ease: 'easeOut' }}
              >
                {i % 2 === 0 ? '🔥' : '💢'}
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* 남자 캐릭터 (오른쪽) */}
      <motion.div
        className="absolute z-20"
        style={{ right: '12%', bottom: '32px' }}
        animate={attacking
          ? { x: [0, -55, -55, 0], y: [0, -15, 0, 0] }
          : { x: 0, y: [0, -3, 0] }
        }
        transition={attacking
          ? { duration: 0.5, ease: 'easeInOut' }
          : { duration: 1, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }
        }
      >
        <img src={MALE_IMG} className="w-20 h-20 object-contain" style={{ imageRendering: 'pixelated', transform: 'scaleX(1)' }} />
      </motion.div>

      {/* 일반 공격 이펙트 */}
      <AnimatePresence>
        {attacking && !superAttacking && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.4, 1.4, 0.5] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <span className="text-5xl">💥</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 번개 이펙트 (10배 공격) */}
      <AnimatePresence>
        {superAttacking && (
          <>
            {/* 화면 번쩍임 */}
            <motion.div
              className="absolute inset-0 z-40 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0, 1, 0, 0.8, 0, 0.6, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1 }}
              style={{ backgroundColor: '#FFFF00' }}
            />
            {/* 번개 여러 개 */}
            {[35, 50, 65].map((left, i) => (
              <motion.div
                key={i}
                className="absolute z-50 pointer-events-none"
                style={{ left: `${left}%`, top: 0, transform: 'translateX(-50%)' }}
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: [0, 1, 1, 0], scaleY: [0, 1, 1, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
              >
                <div style={{
                  width: '6px',
                  height: '140px',
                  background: 'linear-gradient(to bottom, #FFD700, #FFFF00, #FFF)',
                  boxShadow: '0 0 15px 6px #FFD700, 0 0 30px 12px #FFD70066',
                  clipPath: 'polygon(40% 0%, 60% 0%, 80% 40%, 55% 40%, 100% 100%, 15% 55%, 45% 55%, 0% 0%)',
                }} />
              </motion.div>
            ))}
            {/* 충격파 */}
            <motion.div
              className="absolute z-40 pointer-events-none rounded-full border-4 border-yellow-400"
              style={{
                left: '50%', top: '45%',
                transform: 'translate(-50%, -50%)',
                background: 'radial-gradient(circle, #FFD70044, transparent)',
              }}
              initial={{ opacity: 1, width: 0, height: 0 }}
              animate={{ opacity: [1, 0], width: ['0px', '250px'], height: ['0px', '250px'] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
            />
            {/* ⚡ 이펙트 */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none"
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 2.5, 2.5, 0.5] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
            >
              <span className="text-6xl">⚡</span>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* HP 바 */}
      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
        {dragonHp <= 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-[#FFD700] text-xs"
            style={marioStyle}
          >
            BOSS CLEAR! 🐉
          </motion.p>
        )}
      </div>
      <div className="absolute top-3 left-3 right-3 z-20">
        {dragonHp > 0 && (
          <div className="bg-black/60 p-2 border-2 border-black">
            <div className="flex justify-between items-center mb-1">
              <span className="text-white text-[8px]" style={marioStyle}>🐉 BOSS HP</span>
              <div className="flex items-center gap-2">
                {phaseLabel && (
                  <motion.span
                    className="text-[7px]"
                    style={{ ...marioStyle, color: phaseLabel.color }}
                    animate={{ opacity: [1, 0.2, 1] }}
                    transition={{ duration: phase === 'dying' ? 0.5 : 1, repeat: Infinity }}
                  >
                    {phaseLabel.text}
                  </motion.span>
                )}
                <span className="text-[#FFD700] text-[8px]" style={marioStyle}>
                  {Math.max(0, dragonHp)}/{DRAGON_MAX_HP}
                </span>
              </div>
            </div>
            <div className="h-4 bg-black border-2 border-black overflow-hidden">
              <motion.div
                animate={{ width: `${Math.max(0, (dragonHp / DRAGON_MAX_HP) * 100)}%` }}
                transition={{ duration: 0.5 }}
                className="h-full"
                style={{
                  background: getHpBarColor(phase),
                  transition: 'background 1.5s ease',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 메인 App ────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dragonHp, setDragonHp] = useState(DRAGON_MAX_HP);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'main' | 'ranking' | 'admin' | 'club'>('main');
  const [attacking, setAttacking] = useState(false);
  const [superAttacking, setSuperAttacking] = useState(false);

  const [loginName, setLoginName] = useState('');
  const [adminId, setAdminId] = useState('');
  const [adminPw, setAdminPw] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) { setProfile(null); setLoading(false); }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(ref,
      (snap) => {
        if (snap.exists()) setProfile({ id: snap.id, ...snap.data() } as UserProfile);
        else setProfile(null);
        setLoading(false);
      },
      (err) => { console.error(err); setLoading(false); }
    );
    return unsub;
  }, [user]);

  useEffect(() => {
    ensureDragonExists().catch(console.error);
    const unsub = onSnapshot(doc(db, 'dragon', 'state'),
      (snap) => { if (snap.exists()) setDragonHp(snap.data().hp); },
      (err) => console.error(err)
    );
    return unsub;
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginName.trim() || loginLoading) return;
    setLoginLoading(true);
    try {
      const trimmedName = loginName.trim();
      const nameQuery = query(collection(db, 'users'), where('name', '==', trimmedName), limit(1));
      const nameSnap = await getDocs(nameQuery);
      if (nameSnap.empty) {
        alert('등록되지 않은 사용자입니다.\n관리자에게 문의해주세요.');
        setLoginLoading(false);
        return;
      }
      const registeredDoc = nameSnap.docs[0];
      const registeredUid = registeredDoc.id;
      const encodedName = btoa(encodeURIComponent(trimmedName));
      const fakeEmail = `u${encodedName}${APP_DOMAIN}`.toLowerCase().replace(/[^a-z0-9@.]/g, 'x');
      let uid = '';
      try {
        const result = await signInWithEmailAndPassword(auth, fakeEmail, APP_PASSWORD);
        uid = result.user.uid;
      } catch {
        const result = await createUserWithEmailAndPassword(auth, fakeEmail, APP_PASSWORD);
        uid = result.user.uid;
      }
      if (uid !== registeredUid) {
        const oldData = registeredDoc.data();
        await setDoc(doc(db, 'users', uid), {
          name: oldData.name,
          role: oldData.role ?? 'member',
          clubId: oldData.clubId ?? null,
          hpReduced: oldData.hpReduced ?? 0,
          streak: oldData.streak ?? 0,
          lastAttackDate: oldData.lastAttackDate ?? '',
          lastLogin: new Date().toISOString(),
        });
        await deleteDoc(doc(db, 'users', registeredUid));
      } else {
        await updateDoc(doc(db, 'users', uid), { lastLogin: new Date().toISOString() });
      }
    } catch (err: any) {
      alert('로그인 중 오류가 발생했습니다.\n' + err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminId !== ADMIN_ID || adminPw !== ADMIN_PW) {
      alert('아이디 또는 비밀번호가 틀렸습니다.');
      return;
    }
    setLoginLoading(true);
    try {
      const fakeEmail = `admin${APP_DOMAIN}`;
      let uid = '';
      try {
        const result = await signInWithEmailAndPassword(auth, fakeEmail, APP_PASSWORD);
        uid = result.user.uid;
      } catch {
        const result = await createUserWithEmailAndPassword(auth, fakeEmail, APP_PASSWORD);
        uid = result.user.uid;
      }
      await setDoc(doc(db, 'users', uid), {
        name: '관리자', role: 'admin', hpReduced: 0, lastLogin: new Date().toISOString(),
      }, { merge: true });
      setShowAdminLogin(false);
    } catch (err: any) {
      alert('관리자 로그인 오류: ' + err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const reduceHP = async (amount: number, triple = false) => {
    if (!profile || !user || dragonHp <= 0 || attacking) return;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const lastAttack = profile.lastAttackDate ?? '';
    const currentStreak = profile.streak ?? 0;
    let newStreak = 1;
    if (lastAttack === today) newStreak = currentStreak;
    else if (lastAttack === yesterday) newStreak = currentStreak + 1;
    else newStreak = 1;
    const finalAmount = triple ? amount * 10 : amount;
    setAttacking(true);
    if (triple) {
      setSuperAttacking(true);
      setTimeout(() => setSuperAttacking(false), 1000);
    }
    setTimeout(() => setAttacking(false), 600);
    try {
      await updateDoc(doc(db, 'dragon', 'state'), { hp: increment(-finalAmount) });
      await updateDoc(doc(db, 'users', user.uid), {
        hpReduced: increment(finalAmount),
        lastAttackDate: today,
        streak: triple ? 0 : newStreak,
      });
    } catch (err) {
      alert('데미지 적용 중 오류가 발생했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#5C94FC]">
        <motion.div animate={{ y: [0, -20, 0] }} transition={{ repeat: Infinity, duration: 0.5 }}>
          <span className="text-5xl">🐉</span>
        </motion.div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ background: 'linear-gradient(to bottom, #5C94FC 60%, #5C7A3C 60%)' }}
      >
        {/* 구름 배경 */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <Cloud x={5} y={5} scale={1.2} />
          <Cloud x={55} y={10} />
          <Cloud x={75} y={3} scale={0.8} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md relative z-10"
        >
          {/* 타이틀 블록 */}
          <div className="bg-[#E52521] border-4 border-black p-6 shadow-[6px_6px_0px_black] mb-6">
            <div className="flex justify-center mb-4">
              <img src={DRAGON_IMG} className="w-16 h-16 object-contain" style={{ imageRendering: 'pixelated' }} />
            </div>
            <h1 className="text-white text-center text-lg mb-1" style={marioStyle}>용두백타</h1>
            <p className="text-[#FFD700] text-center text-[8px] mt-2" style={marioStyle}>INSERT COIN</p>
          </div>

          {/* 로그인 폼 */}
          <div className="bg-[#000080] border-4 border-black p-6 shadow-[6px_6px_0px_black]">
            {!showAdminLogin ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-white text-[8px] block mb-2" style={marioStyle}>PLAYER NAME</label>
                  <input
                    type="text"
                    value={loginName}
                    onChange={(e) => setLoginName(e.target.value)}
                    placeholder="이름 입력"
                    className="w-full px-3 py-2 bg-black text-white border-4 border-white text-sm focus:outline-none focus:border-[#FFD700]"
                    style={marioStyle}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full py-3 bg-[#FFD700] text-black border-4 border-black shadow-[4px_4px_0px_black] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all text-xs disabled:opacity-60"
                  style={marioStyle}
                >
                  {loginLoading ? 'LOADING...' : '▶ START'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdminLogin(true)}
                  className="w-full py-2 text-[#888] text-[8px] hover:text-white transition"
                  style={marioStyle}
                >
                  ADMIN LOGIN
                </button>
              </form>
            ) : (
              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <label className="text-white text-[8px] block mb-2" style={marioStyle}>ADMIN ID</label>
                  <input
                    type="text"
                    value={adminId}
                    onChange={(e) => setAdminId(e.target.value)}
                    className="w-full px-3 py-2 bg-black text-white border-4 border-white text-sm focus:outline-none focus:border-[#FFD700]"
                    style={marioStyle}
                    required
                  />
                </div>
                <div>
                  <label className="text-white text-[8px] block mb-2" style={marioStyle}>PASSWORD</label>
                  <input
                    type="password"
                    value={adminPw}
                    onChange={(e) => setAdminPw(e.target.value)}
                    className="w-full px-3 py-2 bg-black text-white border-4 border-white text-sm focus:outline-none focus:border-[#FFD700]"
                    style={marioStyle}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full py-3 bg-[#FFD700] text-black border-4 border-black shadow-[4px_4px_0px_black] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all text-xs disabled:opacity-60"
                  style={marioStyle}
                >
                  {loginLoading ? 'LOADING...' : '▶ ADMIN'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdminLogin(false)}
                  className="w-full py-2 text-[#888] text-[8px] hover:text-white transition"
                  style={marioStyle}
                >
                  ◀ BACK
                </button>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  const myStreak = profile.streak ?? 0;

  return (
    <ErrorBoundary>
      <div className="min-h-screen text-white pb-24"
        style={{ background: 'linear-gradient(to bottom, #5C94FC 0%, #5C94FC 80%, #5C7A3C 80%)' }}
      >
        {/* 구름 배경 */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <Cloud x={5} y={8} scale={1.2} />
          <Cloud x={55} y={12} />
          <Cloud x={78} y={5} scale={0.8} />
        </div>

        {/* Header */}
        <header className="relative z-10 px-4 py-3 flex justify-between items-center bg-[#E52521] border-b-4 border-black">
          <div style={marioStyle}>
            <p className="text-[#FFD700] text-[8px]">PLAYER</p>
            <p className="text-white text-[10px] mt-1">{profile.name}</p>
          </div>
          <div className="text-center" style={marioStyle}>
            <p className="text-[#FFD700] text-[8px]">SCORE</p>
            <p className="text-white text-[10px] mt-1">{String(profile.hpReduced).padStart(6, '0')}</p>
          </div>
          <div className="flex items-center gap-2">
            <div style={marioStyle}>
              <p className="text-[#FFD700] text-[8px]">🔥 {myStreak}</p>
            </div>
            <button onClick={() => auth.signOut()}
              className="p-1 bg-black/30 border-2 border-black"
            >
              <LogOut className="w-4 h-4 text-white" />
            </button>
          </div>
        </header>

        <main className="relative z-10 max-w-2xl mx-auto p-4">
          <AnimatePresence mode="wait">
            {activeTab === 'main' && (
              <motion.div key="main" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

                {/* 전투 씬 */}
                <BattleScene dragonHp={dragonHp} attacking={attacking} superAttacking={superAttacking} />

                {/* 일반 공격 버튼 */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => reduceHP(1)}
                    disabled={dragonHp <= 0 || attacking}
                    className="py-4 bg-[#00A800] text-white border-4 border-black shadow-[4px_4px_0px_black] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={marioStyle}
                  >
                    <div className="text-[10px]">1주제 발표</div>
                    <div className="text-[#FFD700] text-[10px] mt-1">-1 HP</div>
                  </button>
                  <button
                    onClick={() => reduceHP(2)}
                    disabled={dragonHp <= 0 || attacking}
                    className="py-4 bg-[#00A800] text-white border-4 border-black shadow-[4px_4px_0px_black] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={marioStyle}
                  >
                    <div className="text-[10px]">1주제 평가</div>
                    <div className="text-[#FFD700] text-[10px] mt-1">-2 HP</div>
                  </button>
                </div>

                {/* 스트릭 / 10배 버튼 */}
                <div className="bg-[#000080] border-4 border-black p-3 shadow-[4px_4px_0px_black]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[#FFD700] text-[8px]" style={marioStyle}>🔥 STREAK BONUS</span>
                    <span className="text-white text-[8px]" style={marioStyle}>{myStreak} / 3 DAYS</span>
                  </div>
                  {/* 스트릭 바 */}
                  <div className="flex gap-2 mb-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className={`flex-1 h-4 border-2 border-black ${myStreak >= i ? 'bg-[#FFD700]' : 'bg-black/40'}`} />
                    ))}
                  </div>
                  {myStreak >= 3 && (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => reduceHP(1, true)}
                        disabled={dragonHp <= 0 || attacking}
                        className="py-3 bg-[#E52521] text-white border-4 border-black shadow-[4px_4px_0px_black] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all disabled:opacity-50 text-[8px]"
                        style={marioStyle}
                      >
                        ⚡ 발표 x10<br />
                        <span className="text-[#FFD700]">-10 HP</span>
                      </button>
                      <button
                        onClick={() => reduceHP(2, true)}
                        disabled={dragonHp <= 0 || attacking}
                        className="py-3 bg-[#E52521] text-white border-4 border-black shadow-[4px_4px_0px_black] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all disabled:opacity-50 text-[8px]"
                        style={marioStyle}
                      >
                        ⚡ 평가 x10<br />
                        <span className="text-[#FFD700]">-20 HP</span>
                      </button>
                    </div>
                  )}
                </div>

              </motion.div>
            )}

            {activeTab === 'ranking' && <RankingView key="ranking" />}
            {activeTab === 'admin' && profile.role === 'admin' && <AdminView key="admin" />}
            {activeTab === 'club' && profile.role === 'president' && (
              <PresidentView key="club" clubId={profile.clubId!} />
            )}
          </AnimatePresence>
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-[#E52521] border-t-4 border-black px-4 py-3 z-50">
          <div className="max-w-2xl mx-auto flex justify-around items-center">
            <NavButton active={activeTab === 'main'} onClick={() => setActiveTab('main')} label="🗡️" sub="FIGHT" />
            <NavButton active={activeTab === 'ranking'} onClick={() => setActiveTab('ranking')} label="🏆" sub="RANK" />
            {profile.role === 'president' && (
              <NavButton active={activeTab === 'club'} onClick={() => setActiveTab('club')} label="👥" sub="CLUB" />
            )}
            {profile.role === 'admin' && (
              <NavButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} label="⚙️" sub="ADMIN" />
            )}
          </div>
        </nav>
      </div>
    </ErrorBoundary>
  );
}

// ─── 공용 컴포넌트 ────────────────────────────────────────────

function NavButton({ active, onClick, label, sub }: {
  active: boolean; onClick: () => void; label: string; sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-4 py-1 border-2 border-black transition-all ${active ? 'bg-[#FFD700] text-black shadow-[2px_2px_0px_black]' : 'bg-transparent text-white'}`}
      style={marioStyle}
    >
      <span className="text-xl">{label}</span>
      <span className="text-[6px]">{sub}</span>
    </button>
  );
}

// ─── 서브 뷰 ─────────────────────────────────────────────────

function RankingView() {
  const [rankings, setRankings] = useState<UserProfile[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('role', 'in', ['member', 'president']),
      orderBy('hpReduced', 'desc'),
      limit(20)
    );
    return onSnapshot(q, (snap) => {
      setRankings(snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserProfile)));
    });
  }, []);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="bg-[#E52521] border-4 border-black p-3 shadow-[4px_4px_0px_black]">
        <h2 className="text-[#FFD700] text-sm text-center" style={marioStyle}>🏆 HALL OF FAME</h2>
      </div>
      <div className="bg-[#000080] border-4 border-black shadow-[4px_4px_0px_black] overflow-hidden">
        {rankings.length === 0 && (
          <p className="text-center text-white py-8 text-[8px]" style={marioStyle}>NO DATA YET...</p>
        )}
        {rankings.map((r, i) => (
          <div key={r.id} className={`flex items-center justify-between p-3 border-b-2 border-black/30 ${i === 0 ? 'bg-[#FFD700]/20' : ''}`}>
            <div className="flex items-center gap-3">
              <span className="text-lg">{medals[i] ?? `${i + 1}.`}</span>
              <div>
                <p className="text-white text-[10px]" style={marioStyle}>{r.name}</p>
                <p className="text-[#888] text-[7px]" style={marioStyle}>{r.clubId || 'NO GUILD'}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[#FFD700] text-[10px]" style={marioStyle}>{String(r.hpReduced).padStart(6, '0')}</p>
              <p className="text-[#888] text-[7px]" style={marioStyle}>SCORE</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function AdminView() {
  const [subTab, setSubTab] = useState<'users' | 'clubs' | 'status'>('users');
  const tabs: { key: typeof subTab; label: string }[] = [
    { key: 'users', label: 'USERS' },
    { key: 'clubs', label: 'CLUBS' },
    { key: 'status', label: 'STATUS' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`flex-1 py-2 border-4 border-black text-[8px] shadow-[3px_3px_0px_black] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all ${subTab === t.key ? 'bg-[#FFD700] text-black' : 'bg-[#000080] text-white'}`}
            style={marioStyle}
          >
            {t.label}
          </button>
        ))}
      </div>
      {subTab === 'users' && <AdminUserManagement />}
      {subTab === 'clubs' && <AdminClubManagement />}
      {subTab === 'status' && <AdminUserStatus />}
    </motion.div>
  );
}

function AdminUserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'users'), (snap) =>
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserProfile)))
    );
    const u2 = onSnapshot(collection(db, 'clubs'), (snap) =>
      setClubs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Club)))
    );
    return () => { u1(); u2(); };
  }, []);

  const addUser = async () => {
    if (!newName.trim()) return;
    try {
      const q = query(collection(db, 'users'), where('name', '==', newName.trim()), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) { alert('이미 존재하는 이름입니다.'); return; }
      await setDoc(doc(db, 'users', `pending_${Date.now()}`), {
        name: newName.trim(), role: 'member', hpReduced: 0, streak: 0, lastAttackDate: '', lastLogin: 'Never',
      });
      setNewName('');
    } catch (err: any) {
      alert('추가 실패: ' + err.message);
    }
  };

  const updateRole = (userId: string, role: UserRole) =>
    updateDoc(doc(db, 'users', userId), { role });

  const assignClub = (userId: string, clubId: string) =>
    updateDoc(doc(db, 'users', userId), { clubId: clubId || null });

  const deleteUser = (userId: string) => deleteDoc(doc(db, 'users', userId));

  const resetDragon = () => setDoc(doc(db, 'dragon', 'state'), { hp: DRAGON_MAX_HP });

  return (
    <div className="space-y-4">
      <button onClick={resetDragon}
        className="w-full py-3 bg-[#E52521] text-white border-4 border-black shadow-[4px_4px_0px_black] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all text-[8px]"
        style={marioStyle}
      >
        🐉 RESET BOSS HP ({DRAGON_MAX_HP})
      </button>

      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="NEW PLAYER"
          className="flex-1 px-3 py-2 bg-black text-white border-4 border-white text-[8px] focus:outline-none focus:border-[#FFD700]"
          style={marioStyle}
        />
        <button onClick={addUser} className="p-2 bg-[#FFD700] text-black border-4 border-black shadow-[3px_3px_0px_black] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all">
          <UserPlus className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className="bg-[#000080] border-4 border-black p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-white text-[9px]" style={marioStyle}>{u.name}</span>
              <select
                value={u.role}
                onChange={(e) => updateRole(u.id, e.target.value as UserRole)}
                className="bg-black text-white text-[8px] px-1 py-1 border-2 border-white"
                style={marioStyle}
              >
                <option value="member">MEMBER</option>
                <option value="president">PRESIDENT</option>
                <option value="admin">ADMIN</option>
              </select>
            </div>
            <div className="flex gap-2">
              <select
                value={u.clubId || ''}
                onChange={(e) => assignClub(u.id, e.target.value)}
                className="flex-1 bg-black text-white text-[8px] px-1 py-1 border-2 border-white"
                style={marioStyle}
              >
                <option value="">NO GUILD</option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <button
                onClick={() => deleteUser(u.id)}
                className="px-2 py-1 bg-[#E52521] text-white border-2 border-black text-[8px] shadow-[2px_2px_0px_black] active:shadow-none"
                style={marioStyle}
              >
                DEL
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminClubManagement() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [newClubName, setNewClubName] = useState('');

  useEffect(() => {
    return onSnapshot(collection(db, 'clubs'), (snap) =>
      setClubs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Club)))
    );
  }, []);

  const addClub = async () => {
    if (!newClubName.trim()) return;
    await setDoc(doc(db, 'clubs', `club_${Date.now()}`), { name: newClubName.trim() });
    setNewClubName('');
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={newClubName}
          onChange={(e) => setNewClubName(e.target.value)}
          placeholder="NEW GUILD"
          className="flex-1 px-3 py-2 bg-black text-white border-4 border-white text-[8px] focus:outline-none focus:border-[#FFD700]"
          style={marioStyle}
        />
        <button onClick={addClub} className="p-2 bg-[#FFD700] text-black border-4 border-black shadow-[3px_3px_0px_black] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all">
          <Plus className="w-5 h-5" />
        </button>
      </div>
      <div className="space-y-2">
        {clubs.map((c) => (
          <div key={c.id} className="bg-[#000080] border-4 border-black p-3 flex justify-between items-center">
            <span className="text-white text-[9px]" style={marioStyle}>{c.name}</span>
            <Users className="w-4 h-4 text-[#FFD700]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminUserStatus() {
  const [users, setUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) =>
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserProfile)))
    );
  }, []);

  return (
    <div className="bg-[#000080] border-4 border-black overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-[#E52521]">
          <tr>
            <th className="p-2 text-white text-[7px]" style={marioStyle}>NAME</th>
            <th className="p-2 text-white text-[7px]" style={marioStyle}>SCORE</th>
            <th className="p-2 text-white text-[7px]" style={marioStyle}>🔥</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t-2 border-black/30">
              <td className="p-2 text-white text-[8px]" style={marioStyle}>{u.name}</td>
              <td className="p-2 text-[#FFD700] text-[8px]" style={marioStyle}>{String(u.hpReduced).padStart(6, '0')}</td>
              <td className="p-2 text-white text-[8px]" style={marioStyle}>{u.streak ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PresidentView({ clubId }: { clubId: string }) {
  const [members, setMembers] = useState<UserProfile[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('clubId', '==', clubId));
    return onSnapshot(q, (snap) =>
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserProfile)))
    );
  }, [clubId]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="bg-[#E52521] border-4 border-black p-3 shadow-[4px_4px_0px_black] flex justify-between items-center">
        <h2 className="text-[#FFD700] text-[10px]" style={marioStyle}>👥 MY GUILD</h2>
        <span className="text-white text-[8px]" style={marioStyle}>{clubId}</span>
      </div>
      <div className="bg-[#000080] border-4 border-black shadow-[4px_4px_0px_black] overflow-hidden">
        {members.length === 0 && (
          <p className="text-center text-white py-8 text-[8px]" style={marioStyle}>NO MEMBERS YET</p>
        )}
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between p-3 border-b-2 border-black/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#E52521] border-2 border-black flex items-center justify-center">
                <span className="text-white text-xs font-bold">{m.name[0]}</span>
              </div>
              <div>
                <p className="text-white text-[9px]" style={marioStyle}>{m.name}</p>
                <p className="text-[#888] text-[7px]" style={marioStyle}>{m.role.toUpperCase()}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[#FFD700] text-[9px]" style={marioStyle}>{String(m.hpReduced).padStart(6, '0')}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}