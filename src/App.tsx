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
  Sword,
  Shield,
  Users,
  Trophy,
  Settings,
  LogOut,
  Plus,
  UserPlus,
  Flame,
  Activity,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── 상수 ────────────────────────────────────────────────────
const ADMIN_ID = '관리자0901';
const ADMIN_PW = '1925';
const DRAGON_MAX_HP = 100;
const APP_DOMAIN = '@yongdu.app';
const APP_PASSWORD = 'yongdu2024';

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
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-xl max-w-md w-full border border-red-200">
            <h2 className="text-xl font-bold text-red-600 mb-2">오류가 발생했습니다</h2>
            <p className="text-gray-600 mb-4 text-sm break-all">{this.state.msg}</p>
            <button onClick={() => window.location.reload()} className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
              새로고침
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── 메인 App ────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'main' | 'ranking' | 'admin' | 'club'>('main');

  const [loginName, setLoginName] = useState('');
  const [adminId, setAdminId] = useState('');
  const [adminPw, setAdminPw] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // ── Auth 상태 감지 ──────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  // ── 프로필 구독 ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(ref,
      (snap) => {
        if (snap.exists()) {
          setProfile({ id: snap.id, ...snap.data() } as UserProfile);
        } else {
          setProfile(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Profile fetch error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [user]);

  // ── 일반 로그인 ────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginName.trim() || loginLoading) return;
    setLoginLoading(true);

    try {
      const trimmedName = loginName.trim();

      // 1. 관리자가 등록한 이름인지 확인
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

      // 2. 이메일 로그인 시도 → 없으면 계정 생성
      let uid = '';
      try {
        const result = await signInWithEmailAndPassword(auth, fakeEmail, APP_PASSWORD);
        uid = result.user.uid;
      } catch {
        const result = await createUserWithEmailAndPassword(auth, fakeEmail, APP_PASSWORD);
        uid = result.user.uid;
      }

      // 3. Firestore 문서 처리
      if (uid !== registeredUid) {
        const oldData = registeredDoc.data();
        await setDoc(doc(db, 'users', uid), {
          name: oldData.name,
          role: oldData.role ?? 'member',
          clubId: oldData.clubId ?? null,
          hpReduced: oldData.hpReduced ?? 0,
          dragonHp: oldData.dragonHp ?? DRAGON_MAX_HP,
          lastLogin: new Date().toISOString(),
        });
        await deleteDoc(doc(db, 'users', registeredUid));
      } else {
        await updateDoc(doc(db, 'users', uid), {
          lastLogin: new Date().toISOString(),
        });
      }

    } catch (err: any) {
      console.error('Login error:', err);
      alert('로그인 중 오류가 발생했습니다.\n' + err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  // ── 관리자 로그인 ──────────────────────────────────────────
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
        name: '관리자',
        role: 'admin',
        hpReduced: 0,
        dragonHp: DRAGON_MAX_HP,
        lastLogin: new Date().toISOString(),
      }, { merge: true });
      setShowAdminLogin(false);
    } catch (err: any) {
      console.error('Admin login error:', err);
      alert('관리자 로그인 중 오류가 발생했습니다.\n' + err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  // ── HP 감소 (내 드래곤만) ───────────────────────────────────
  const reduceHP = async (amount: number) => {
    if (!profile || !user || (profile.dragonHp ?? DRAGON_MAX_HP) <= 0) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        dragonHp: increment(-amount),
        hpReduced: increment(amount),
      });
    } catch (err) {
      console.error('HP reduce error:', err);
      alert('데미지 적용 중 오류가 발생했습니다.');
    }
  };

  // ── 로딩 화면 ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0]">
        <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
          <Flame className="w-12 h-12 text-[#5A5A40]" />
        </motion.div>
      </div>
    );
  }

  // ── 로그인 화면 ────────────────────────────────────────────
  if (!profile) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex flex-col items-center justify-center p-6 font-sans">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white border border-[#5A5A40]/10 p-8 rounded-3xl shadow-xl"
        >
          <div className="flex justify-center mb-8">
            <div className="p-4 bg-[#5A5A40]/10 rounded-full">
              <span className="text-6xl">🐉</span>
            </div>
          </div>
          <h1 className="text-3xl font-serif font-bold text-center mb-2">용두백타</h1>
          <p className="text-[#5A5A40]/70 text-center mb-8">이름을 입력해주세요.</p>

          {!showAdminLogin ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="text"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                placeholder="이름"
                className="w-full px-4 py-3 bg-[#F5F5F0] border border-[#5A5A40]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition"
                required
              />
              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3 bg-[#5A5A40] hover:bg-[#4A4A30] text-white font-bold rounded-xl transition shadow-lg shadow-[#5A5A40]/20 disabled:opacity-60"
              >
                {loginLoading ? '입장 중...' : '입장하기'}
              </button>
              <button
                type="button"
                onClick={() => setShowAdminLogin(true)}
                className="w-full py-2 text-[#5A5A40]/50 hover:text-[#5A5A40] text-sm transition"
              >
                관리자 로그인
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <input
                type="text"
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                placeholder="관리자 아이디"
                className="w-full px-4 py-3 bg-[#F5F5F0] border border-[#5A5A40]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition"
                required
              />
              <input
                type="password"
                value={adminPw}
                onChange={(e) => setAdminPw(e.target.value)}
                placeholder="비밀번호"
                className="w-full px-4 py-3 bg-[#F5F5F0] border border-[#5A5A40]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition"
                required
              />
              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3 bg-[#5A5A40] hover:bg-[#4A4A30] text-white font-bold rounded-xl transition disabled:opacity-60"
              >
                {loginLoading ? '인증 중...' : '관리자 인증'}
              </button>
              <button
                type="button"
                onClick={() => setShowAdminLogin(false)}
                className="w-full py-2 text-[#5A5A40]/50 hover:text-[#5A5A40] text-sm transition"
              >
                뒤로가기
              </button>
            </form>
          )}
        </motion.div>
      </div>
    );
  }

  const myDragonHp = profile.dragonHp ?? DRAGON_MAX_HP;

  // ── 메인 앱 ────────────────────────────────────────────────
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#F5F5F0] text-[#1A1A1A] font-sans pb-24">
        <header className="p-6 flex justify-between items-center border-b border-[#5A5A40]/10 bg-white/80 backdrop-blur-md sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#5A5A40]/10 rounded-lg">
              <Flame className="w-6 h-6 text-[#5A5A40]" />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight">{profile.name}</h2>
              <p className="text-xs text-[#5A5A40]/60 uppercase tracking-wider font-mono">
                {profile.role}{profile.clubId ? ` · ${profile.clubId}` : ''}
              </p>
            </div>
          </div>
          <button onClick={() => auth.signOut()} className="p-2 hover:bg-[#F5F5F0] rounded-full transition text-[#5A5A40]/60">
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        <main className="max-w-2xl mx-auto p-6">
          <AnimatePresence mode="wait">
            {activeTab === 'main' && (
              <motion.div
                key="main"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-8"
              >
                {/* Dragon Display */}
                <div className="relative aspect-video bg-[#FDFDFB] rounded-3xl border border-[#5A5A40]/10 overflow-hidden flex flex-col items-center justify-center p-8 shadow-xl">
                  <div className="absolute inset-0 bg-gradient-to-t from-[#F5F5F0]/80 to-transparent" />
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ repeat: Infinity, duration: 4 }}
                    className="relative z-10"
                  >
                    {myDragonHp <= 0 ? (
                      <img src="https://i.imgur.com/fIBT70D.png" className="w-32 h-32 object-contain opacity-30 grayscale" />
                    ) : (
                      <img src="https://i.imgur.com/fIBT70D.png" className="w-32 h-32 object-contain" />
                    )}
                  </motion.div>

                  <div className="w-full max-w-xs mt-8 relative z-10">
                    {myDragonHp <= 0 ? (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center text-[#5A5A40] font-serif font-bold text-xl tracking-widest italic"
                      >
                        용을 처치했습니다! 🐉
                      </motion.p>
                    ) : (
                      <>
                        <div className="flex justify-between text-sm mb-2 font-mono">
                          <span className="text-[#5A5A40]/60 uppercase tracking-widest text-[10px] font-bold">
                            용의 체력
                          </span>
                          <span className="text-[#5A5A40] font-bold">
                            {Math.max(0, myDragonHp)} / {DRAGON_MAX_HP}
                          </span>
                        </div>
                        <div className="h-3 bg-[#F5F5F0] rounded-full overflow-hidden border border-[#5A5A40]/10">
                          <motion.div
                            animate={{ width: `${Math.max(0, (myDragonHp / DRAGON_MAX_HP) * 100)}%` }}
                            className="h-full bg-[#8C8C70]"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-4">
                  <ActionButton
                    label="1주제 발표"
                    sub="HP -1"
                    icon={<Sword className="w-6 h-6 text-[#5A5A40]/60 group-hover:text-[#5A5A40]" />}
                    disabled={myDragonHp <= 0}
                    onClick={() => reduceHP(1)}
                  />
                  <ActionButton
                    label="1주제 평가"
                    sub="HP -2"
                    icon={<Shield className="w-6 h-6 text-[#5A5A40]/60 group-hover:text-[#5A5A40]" />}
                    disabled={myDragonHp <= 0}
                    onClick={() => reduceHP(2)}
                  />
                </div>

                {/* My Stats */}
                <div className="bg-[#FDFDFB] border border-[#5A5A40]/10 p-4 rounded-xl flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-[#5A5A40]/40" />
                    <span className="text-sm text-[#5A5A40]/60">나의 누적 데미지</span>
                  </div>
                  <span className="font-bold text-[#5A5A40]">{profile.hpReduced}</span>
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

        <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-[#5A5A40]/10 px-6 py-4 z-50">
          <div className="max-w-2xl mx-auto flex justify-around items-center">
            <NavButton active={activeTab === 'main'} onClick={() => setActiveTab('main')} icon={<Flame />} label="메인" />
            <NavButton active={activeTab === 'ranking'} onClick={() => setActiveTab('ranking')} icon={<Trophy />} label="랭킹" />
            {profile.role === 'president' && (
              <NavButton active={activeTab === 'club'} onClick={() => setActiveTab('club')} icon={<Users />} label="동아리" />
            )}
            {profile.role === 'admin' && (
              <NavButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} icon={<Settings />} label="관리" />
            )}
          </div>
        </nav>
      </div>
    </ErrorBoundary>
  );
}

// ─── 공용 컴포넌트 ────────────────────────────────────────────

function ActionButton({ label, sub, icon, disabled, onClick }: {
  label: string; sub: string; icon: React.ReactNode; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex flex-col items-center justify-center p-6 bg-[#FDFDFB] border border-[#5A5A40]/10 rounded-2xl hover:border-[#5A5A40]/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
    >
      <div className="p-3 bg-[#F5F5F0] rounded-xl mb-3 group-hover:bg-[#5A5A40]/10 transition">
        {icon}
      </div>
      <span className="font-bold">{label}</span>
      <span className="text-xs text-[#5A5A40]/50 mt-1">{sub}</span>
    </button>
  );
}

function NavButton({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition ${active ? 'text-[#5A5A40]' : 'text-[#5A5A40]/40 hover:text-[#5A5A40]'}`}
    >
      {React.cloneElement(icon as React.ReactElement, { className: 'w-6 h-6' })}
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
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

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <h2 className="text-2xl font-serif font-bold flex items-center gap-2">
        <Trophy className="text-[#5A5A40]" /> 명예의 전당
      </h2>
      <div className="bg-white border border-[#5A5A40]/10 rounded-2xl overflow-hidden shadow-sm">
        {rankings.length === 0 && (
          <p className="text-center text-[#5A5A40]/40 py-8 text-sm">아직 기록이 없습니다.</p>
        )}
        {rankings.map((r, i) => (
          <div key={r.id} className="flex items-center justify-between p-4 border-b border-[#5A5A40]/5 last:border-0">
            <div className="flex items-center gap-4">
              <span className={`w-6 text-center font-mono font-bold ${i < 3 ? 'text-[#5A5A40]' : 'text-[#5A5A40]/30'}`}>
                {i + 1}
              </span>
              <div>
                <p className="font-bold">{r.name}</p>
                <p className="text-xs text-[#5A5A40]/60">{r.clubId || '무소속'}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-[#5A5A40]">{r.hpReduced}</p>
              <p className="text-[10px] text-[#5A5A40]/40 uppercase tracking-widest">Damage</p>
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
    { key: 'users', label: '유저 관리' },
    { key: 'clubs', label: '동아리 관리' },
    { key: 'status', label: '유저 현황' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition ${
              subTab === t.key ? 'bg-[#5A5A40] text-white' : 'bg-white border border-[#5A5A40]/10 text-[#5A5A40]/60'
            }`}
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
      if (!snap.empty) {
        alert('이미 존재하는 이름입니다.');
        return;
      }
      await setDoc(doc(db, 'users', `pending_${Date.now()}`), {
        name: newName.trim(),
        role: 'member',
        hpReduced: 0,
        dragonHp: 100,
        lastLogin: 'Never',
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

  const deleteUser = async (userId: string) => {
    await deleteDoc(doc(db, 'users', userId));
  };

  // 관리자가 유저 용 HP 초기화
  const resetDragonHp = async (userId: string) => {
    await updateDoc(doc(db, 'users', userId), { dragonHp: 100 });
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="신규 유저 이름"
          className="flex-1 px-4 py-2 bg-white border border-[#5A5A40]/20 rounded-lg focus:outline-none"
        />
        <button onClick={addUser} className="p-2 bg-[#5A5A40] text-white rounded-lg">
          <UserPlus className="w-6 h-6" />
        </button>
      </div>

      <div className="space-y-4">
        {users.map((u) => (
          <div key={u.id} className="bg-white p-4 rounded-xl border border-[#5A5A40]/10 space-y-3 shadow-sm">
            <div className="flex justify-between items-center">
              <div>
                <span className="font-bold">{u.name}</span>
                <span className="text-xs text-[#5A5A40]/40 ml-2">🐉 {u.dragonHp ?? 100}HP</span>
              </div>
              <select
                value={u.role}
                onChange={(e) => updateRole(u.id, e.target.value as UserRole)}
                className="bg-[#F5F5F0] text-xs px-2 py-1 rounded border border-[#5A5A40]/10"
              >
                <option value="member">회원</option>
                <option value="president">회장</option>
                <option value="admin">관리자</option>
              </select>
            </div>
            <div className="flex gap-2">
              <select
                value={u.clubId || ''}
                onChange={(e) => assignClub(u.id, e.target.value)}
                className="flex-1 bg-[#F5F5F0] text-xs px-2 py-2 rounded border border-[#5A5A40]/10"
              >
                <option value="">동아리 선택 (없음)</option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <button
                onClick={() => resetDragonHp(u.id)}
                className="px-3 py-2 bg-[#5A5A40] hover:bg-[#4A4A30] text-white rounded text-xs font-bold transition"
              >
                초기화
              </button>
              <button
                onClick={() => deleteUser(u.id)}
                className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-bold transition"
              >
                삭제
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
    <div className="space-y-6">
      <div className="flex gap-2">
        <input
          type="text"
          value={newClubName}
          onChange={(e) => setNewClubName(e.target.value)}
          placeholder="동아리 이름"
          className="flex-1 px-4 py-2 bg-white border border-[#5A5A40]/20 rounded-lg focus:outline-none"
        />
        <button onClick={addClub} className="p-2 bg-[#5A5A40] text-white rounded-lg">
          <Plus className="w-6 h-6" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {clubs.map((c) => (
          <div key={c.id} className="bg-white p-4 rounded-xl border border-[#5A5A40]/10 flex justify-between items-center shadow-sm">
            <span className="font-bold">{c.name}</span>
            <Users className="w-5 h-5 text-[#5A5A40]/40" />
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
    <div className="bg-white border border-[#5A5A40]/10 rounded-2xl overflow-hidden shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#F5F5F0] text-[#5A5A40]/60 uppercase text-[10px] tracking-wider">
          <tr>
            <th className="p-4">이름</th>
            <th className="p-4">용 HP</th>
            <th className="p-4">누적 데미지</th>
            <th className="p-4">마지막 접속</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#5A5A40]/5">
          {users.map((u) => (
            <tr key={u.id}>
              <td className="p-4 font-bold">{u.name}</td>
              <td className="p-4 text-[#5A5A40]">{u.dragonHp ?? 100}</td>
              <td className="p-4 text-[#5A5A40]">{u.hpReduced}</td>
              <td className="p-4 text-[#5A5A40]/40 text-xs">
                {(() => {
                  if (!u.lastLogin || u.lastLogin === 'Never') return 'N/A';
                  const d = new Date(u.lastLogin);
                  return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('ko-KR');
                })()}
              </td>
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
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-serif font-bold flex items-center gap-2">
          <Users className="text-[#5A5A40]" /> 우리 동아리 현황
        </h2>
        <span className="px-3 py-1 bg-[#5A5A40]/10 rounded-full text-xs text-[#5A5A40] font-bold">
          {clubId}
        </span>
      </div>
      <div className="bg-white border border-[#5A5A40]/10 rounded-2xl overflow-hidden shadow-sm">
        {members.length === 0 && (
          <p className="text-center text-[#5A5A40]/40 py-8 text-sm">동아리 멤버가 없습니다.</p>
        )}
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between p-4 border-b border-[#5A5A40]/5 last:border-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#F5F5F0] rounded-full flex items-center justify-center">
                <span className="text-[#5A5A40]/60 font-bold">{m.name[0]}</span>
              </div>
              <div>
                <p className="font-bold">{m.name}</p>
                <p className="text-[10px] text-[#5A5A40]/40 uppercase tracking-widest">{m.role}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-[#5A5A40]">{m.hpReduced}</p>
              <p className="text-[10px] text-[#5A5A40]/40 uppercase tracking-widest">Damage</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
